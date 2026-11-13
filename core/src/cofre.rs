//! Cofre de segredos da bancada: `<bancada>/cofre.db`, um SQLite criptografado inteiro (SQLite3 Multiple Ciphers,
//! cifra ChaCha20-Poly1305; veja `vendor/README.md`). Quem copiar o disco não lê nada, nem o nome dos segredos.
//!
//! A chave (256 bits aleatórios, uma por bancada) fica no cofre do sistema: Credential Manager no Windows, que a
//! protege com o DPAPI do login do usuário; Secret Service no Linux; Keychain no macOS. Sem cofre do sistema (um
//! Linux sem Secret Service), ou com `ATELIER_COFRE_CHAVE=arquivo` (os testes), a chave vai para um arquivo só do
//! usuário em `~/atelier/cofre-chaves/`, com aviso: aí quem tem o disco tem a chave também.
//!
//! Cada segredo tem nome (descritivo), descrição, chave (o identificador, ex.: `client_secret`), valor e o documento
//! que o gerou (código). O valor só sai por `valor()`: listar nunca traz o valor.

use crate::db::{Erro, Res};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::path::{Path, PathBuf};

pub const ARQUIVO: &str = "cofre.db";
const SERVICO: &str = "atelier-cofre";

#[derive(Serialize, Clone, Debug)]
pub struct Segredo {
    pub id: i64,
    pub nome: String,
    pub descricao: String,
    pub chave: String,
    /// código do documento que gerou o segredo (sem #)
    pub documento: Option<String>,
    pub criado_em: String,
    pub atualizado_em: String,
}

fn erro(e: impl std::fmt::Display) -> Erro {
    Erro::Invalido(format!("cofre: {e}"))
}

// ---------- a chave ----------

fn hex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// A conta da chave no cofre do sistema: o caminho da bancada, normalizado (uma chave por bancada).
fn conta(bancada: &str) -> String {
    bancada.trim().trim_end_matches(['\\', '/']).replace('/', "\\").to_lowercase()
}

fn arquivo_da_chave(bancada: &str) -> PathBuf {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in conta(bancada).bytes() {
        h = (h ^ b as u64).wrapping_mul(0x100000001b3);
    }
    crate::bancada::pasta_atelier().join("cofre-chaves").join(format!("{h:016x}.chave"))
}

fn nova_chave() -> Res<Vec<u8>> {
    let mut k = vec![0u8; 32];
    getrandom::getrandom(&mut k).map_err(erro)?;
    Ok(k)
}

fn chave_do_arquivo(bancada: &str) -> Res<Vec<u8>> {
    let p = arquivo_da_chave(bancada);
    match std::fs::read(&p) {
        Ok(b) if b.len() == 32 => Ok(b),
        Ok(_) => Err(erro(format!("{} não tem 32 bytes", p.display()))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            let k = nova_chave()?;
            if let Some(d) = p.parent() {
                std::fs::create_dir_all(d).map_err(erro)?;
            }
            std::fs::write(&p, &k).map_err(erro)?;
            Ok(k)
        }
        Err(e) => Err(erro(e)),
    }
}

fn chave_do_sistema(bancada: &str) -> Result<Vec<u8>, String> {
    // o cofre do sistema pode demorar (ou abrir uma caixa no desktop): fora da thread do servidor
    let conta = conta(bancada);
    std::thread::spawn(move || {
        let e = keyring::Entry::new(SERVICO, &conta).map_err(|e| e.to_string())?;
        match e.get_secret() {
            Ok(b) if b.len() == 32 => Ok(b),
            Ok(_) => Err("a chave guardada não tem 32 bytes".to_string()),
            Err(keyring::Error::NoEntry) => {
                let k = nova_chave().map_err(|e| e.to_string())?;
                e.set_secret(&k).map_err(|e| e.to_string())?;
                Ok(k)
            }
            Err(e) => Err(e.to_string()),
        }
    })
    .join()
    .map_err(|_| "o cofre do sistema travou".to_string())?
}

/// A chave do cofre desta bancada (cria na primeira vez).
fn chave(bancada: &str) -> Res<Vec<u8>> {
    if cfg!(test) {
        return Ok(vec![7; 32]); // os testes nunca tocam o cofre do sistema nem a pasta do atelier
    }
    if std::env::var("ATELIER_COFRE_CHAVE").is_ok_and(|v| v == "arquivo") {
        return chave_do_arquivo(bancada);
    }
    match chave_do_sistema(bancada) {
        Ok(k) => Ok(k),
        Err(e) if cfg!(windows) => Err(erro(format!("o Credential Manager do Windows falhou: {e}"))),
        Err(e) => {
            eprintln!(
                "atelier: sem cofre do sistema ({e}); a chave do cofre fica em {}, legível só por você. Quem tiver este disco lê o cofre.",
                arquivo_da_chave(bancada).display()
            );
            chave_do_arquivo(bancada)
        }
    }
}

// ---------- o banco ----------

/// Abre (e cria, na primeira vez) o cofre da bancada.
pub fn abrir(bancada: &str) -> Res<Connection> {
    let k = chave(bancada)?;
    let conn = Connection::open(Path::new(bancada).join(ARQUIVO))?;
    // a cifra antes da chave, e a chave antes de qualquer leitura
    conn.execute_batch(&format!("PRAGMA cipher = 'chacha20'; PRAGMA kdf_iter = 1; PRAGMA hexkey = '{}';", hex(&k)))?;
    conn.execute_batch("PRAGMA busy_timeout = 5000;")?;
    // chave errada: a primeira leitura falha com "file is not a database"
    conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0))
        .map_err(|_| erro("não consegui abrir o cofre com a chave desta máquina (o cofre veio de outro computador ou usuário?)"))?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS segredos (
            id INTEGER PRIMARY KEY,
            nome TEXT NOT NULL,
            descricao TEXT NOT NULL DEFAULT '',
            chave TEXT NOT NULL DEFAULT '',
            valor TEXT NOT NULL,
            documento TEXT,
            criado_em TEXT NOT NULL,
            atualizado_em TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS segredos_documento ON segredos(documento);",
    )?;
    Ok(conn)
}

fn de_linha(r: &rusqlite::Row) -> rusqlite::Result<Segredo> {
    Ok(Segredo {
        id: r.get(0)?, nome: r.get(1)?, descricao: r.get(2)?, chave: r.get(3)?, documento: r.get(4)?,
        criado_em: r.get(5)?, atualizado_em: r.get(6)?,
    })
}

const COLUNAS: &str = "id, nome, descricao, chave, documento, criado_em, atualizado_em";

fn codigo(c: &str) -> String {
    c.trim().trim_start_matches('#').to_lowercase()
}

/// Os segredos (sem o valor). `documentos`: só os destes documentos; `q`: no nome, descrição, chave ou documento.
pub fn listar(bancada: &str, documentos: Option<&[String]>, q: Option<&str>) -> Res<Vec<Segredo>> {
    let conn = abrir(bancada)?;
    let mut st = conn.prepare(&format!("SELECT {COLUNAS} FROM segredos ORDER BY lower(nome)"))?;
    let todos: Vec<Segredo> = st.query_map([], de_linha)?.collect::<Result<_, _>>()?;
    let docs: Option<Vec<String>> = documentos.map(|d| d.iter().map(|c| codigo(c)).collect());
    let q = q.map(|q| q.trim().to_lowercase()).filter(|q| !q.is_empty());
    Ok(todos
        .into_iter()
        .filter(|s| docs.as_ref().is_none_or(|d| s.documento.as_ref().is_some_and(|x| d.contains(x))))
        .filter(|s| {
            q.as_ref().is_none_or(|q| {
                let q = q.trim_start_matches('#');
                [&s.nome, &s.descricao, &s.chave].iter().any(|x| x.to_lowercase().contains(q)) || s.documento.as_deref() == Some(q)
            })
        })
        .collect())
}

pub fn ler(bancada: &str, id: i64) -> Res<Segredo> {
    abrir(bancada)?
        .query_row(&format!("SELECT {COLUNAS} FROM segredos WHERE id = ?"), [id], de_linha)
        .optional()?
        .ok_or_else(|| Erro::NaoEncontrado(format!("segredo {id}")))
}

/// Acha pelo id (número) ou pelo nome (sem diferenciar maiúsculas), ou pela chave se só um tiver aquela chave.
pub fn achar(bancada: &str, id_ou_nome: &str) -> Res<Segredo> {
    let t = id_ou_nome.trim();
    if let Ok(id) = t.parse::<i64>() {
        return ler(bancada, id);
    }
    let todos = listar(bancada, None, None)?;
    if let Some(s) = todos.iter().find(|s| s.nome.eq_ignore_ascii_case(t)) {
        return Ok(s.clone());
    }
    let pela_chave: Vec<_> = todos.iter().filter(|s| s.chave.eq_ignore_ascii_case(t)).collect();
    match pela_chave.as_slice() {
        [s] => Ok((*s).clone()),
        [] => Err(Erro::NaoEncontrado(format!("segredo \"{t}\""))),
        _ => Err(Erro::Invalido(format!("há {} segredos com a chave \"{t}\": diga o nome ou o id", pela_chave.len()))),
    }
}

/// O valor (só por aqui o valor sai do cofre).
pub fn valor(bancada: &str, id: i64) -> Res<String> {
    abrir(bancada)?
        .query_row("SELECT valor FROM segredos WHERE id = ?", [id], |r| r.get(0))
        .optional()?
        .ok_or_else(|| Erro::NaoEncontrado(format!("segredo {id}")))
}

pub fn criar(bancada: &str, nome: &str, descricao: &str, chave: &str, valor: &str, documento: Option<&str>) -> Res<i64> {
    if nome.trim().is_empty() {
        return Err(Erro::Invalido("o segredo precisa de um nome".into()));
    }
    let conn = abrir(bancada)?;
    let agora = crate::db::agora();
    conn.execute(
        "INSERT INTO segredos (nome, descricao, chave, valor, documento, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?)",
        params![nome.trim(), descricao.trim(), chave.trim(), valor, documento.map(codigo).filter(|c| !c.is_empty()), agora, agora],
    )?;
    Ok(conn.last_insert_rowid())
}

/// Muda só o que vier: nome, descricao, chave, valor, documento (vazio tira o documento).
pub fn atualizar(bancada: &str, id: i64, d: &serde_json::Value) -> Res<()> {
    let conn = abrir(bancada)?;
    ler(bancada, id)?;
    let txt = |k: &str| d.get(k).and_then(|v| v.as_str());
    for (campo, coluna) in [("nome", "nome"), ("descricao", "descricao"), ("chave", "chave"), ("valor", "valor")] {
        if let Some(v) = txt(campo) {
            if campo == "nome" && v.trim().is_empty() {
                return Err(Erro::Invalido("o segredo precisa de um nome".into()));
            }
            let v = if campo == "valor" { v.to_string() } else { v.trim().to_string() };
            conn.execute(&format!("UPDATE segredos SET {coluna} = ? WHERE id = ?"), params![v, id])?;
        }
    }
    if let Some(v) = d.get("documento") {
        let c = v.as_str().map(codigo).filter(|c| !c.is_empty());
        conn.execute("UPDATE segredos SET documento = ? WHERE id = ?", params![c, id])?;
    }
    conn.execute("UPDATE segredos SET atualizado_em = ? WHERE id = ?", params![crate::db::agora(), id])?;
    Ok(())
}

pub fn apagar(bancada: &str, id: i64) -> Res<()> {
    let n = abrir(bancada)?.execute("DELETE FROM segredos WHERE id = ?", [id])?;
    if n == 0 {
        return Err(Erro::NaoEncontrado(format!("segredo {id}")));
    }
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn guarda_criptografado_e_so_o_valor_sai_por_valor() {
        let dir = std::env::temp_dir().join(format!("atelier-cofre-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let b = dir.to_string_lossy().to_string();
        let id = criar(&b, "Secret do app DEV", "o André passou", "client_secret", "s3nh@-super", Some("#ACE0B7A")).unwrap();
        criar(&b, "Senha do Oracle", "", "senha", "outra", None).unwrap();

        let l = listar(&b, Some(&["ace0b7a".to_string()]), None).unwrap();
        assert_eq!(l.len(), 1);
        assert_eq!(l[0].documento.as_deref(), Some("ace0b7a"));
        assert!(!serde_json::to_string(&l).unwrap().contains("s3nh@"), "listar nunca traz o valor");
        assert_eq!(valor(&b, id).unwrap(), "s3nh@-super");
        assert_eq!(achar(&b, "secret do app dev").unwrap().id, id);
        assert_eq!(achar(&b, "client_secret").unwrap().id, id);
        assert_eq!(listar(&b, None, Some("oracle")).unwrap().len(), 1);

        atualizar(&b, id, &serde_json::json!({ "valor": "trocado", "documento": "" })).unwrap();
        assert_eq!(valor(&b, id).unwrap(), "trocado");
        assert_eq!(ler(&b, id).unwrap().documento, None);

        // o arquivo no disco não tem nada legível: nem o nome, nem o valor
        let bytes = std::fs::read(dir.join(ARQUIVO)).unwrap();
        let texto = String::from_utf8_lossy(&bytes);
        assert!(!texto.contains("Oracle") && !texto.contains("trocado") && !texto.contains("SQLite format"));

        apagar(&b, id).unwrap();
        assert!(valor(&b, id).is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
