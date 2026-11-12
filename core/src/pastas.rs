//! Pasta de trabalho do item, dentro da bancada: `<bancada>/itens/a3f9c21-titulo-curto/`, com
//! `insumos/` (entra), `artefatos/` (sai), `rascunho/` e um `CLAUDE.md` que diz de que item se trata.
//! O nome começa pelo código do item (7 hexadecimais, tamanho fixo), então não cresce com o tempo.

use crate::db::{self, Erro, Res};
use rusqlite::Connection;
use serde_json::json;
use std::path::Path;

const TAM_SLUG: usize = 40;

/// "Painel de custos — v2!" → "painel-de-custos-v2", no máximo 40 letras, cortando em hífen.
pub fn slug(titulo: &str) -> String {
    let mut s = String::new();
    for c in titulo.to_lowercase().chars() {
        let c = match c {
            'á' | 'à' | 'â' | 'ã' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'í' | 'ì' | 'î' | 'ï' => 'i',
            'ó' | 'ò' | 'ô' | 'õ' | 'ö' => 'o',
            'ú' | 'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            c => c,
        };
        if c.is_ascii_alphanumeric() {
            s.push(c);
        } else if !s.ends_with('-') && !s.is_empty() {
            s.push('-');
        }
    }
    let mut s = s.trim_matches('-').to_string();
    if s.len() > TAM_SLUG {
        s.truncate(TAM_SLUG);
        if let Some(i) = s.rfind('-').filter(|i| *i > TAM_SLUG / 2) {
            s.truncate(i);
        }
    }
    s.trim_matches('-').to_string()
}

/// Cria (ou reaproveita) a pasta do item e grava o caminho nele. Devolve o caminho.
pub fn criar(conn: &Connection, bancada: &Path, nome_bancada: &str, id: i64, autor: &str) -> Res<String> {
    let item = db::ler_item(conn, id)?;
    if let Some(p) = item.pasta.as_deref().filter(|p| Path::new(p).is_dir()) {
        return Ok(p.to_string());
    }
    let cod = &item.codigo;
    let s = slug(&item.titulo);
    let nome = if s.is_empty() { cod.clone() } else { format!("{cod}-{s}") };
    let dir = bancada.join("itens").join(nome);
    for sub in ["insumos", "artefatos", "rascunho"] {
        std::fs::create_dir_all(dir.join(sub)).map_err(|e| Erro::Invalido(format!("não criei {dir:?}: {e}")))?;
    }
    let tipo: String = match item.tipo_id {
        Some(t) => conn.query_row("SELECT nome FROM tipos WHERE id = ?", [t], |r| r.get(0)).unwrap_or_default(),
        None => "sem tipo".into(),
    };
    let leia = dir.join("CLAUDE.md");
    if !leia.exists() {
        let titulo = &item.titulo;
        let texto = [
            format!("# #{cod} — {titulo}"),
            String::new(),
            format!("Esta pasta é o documento **#{cod}** do atelier (tipo {tipo}, bancada {nome_bancada})."),
            "O registro vivo (status, propriedades, texto e linha do tempo) fica no atelier, não aqui.".into(),
            format!("Use o MCP `atelier` para ler e registrar o andamento: `ler_documento` com id \"{cod}\", `anotar`, `atualizar_documento`."),
            String::new(),
            "- `insumos/` — o que entra: pedido, prints, exports, planilhas, e-mails".into(),
            "- `artefatos/` — o que sai: scripts, documentos, entregas".into(),
            "- `rascunho/` — trabalho intermediário, pode apagar".into(),
            String::new(),
            "Roteiro com muitos passos (sessão, implantação): um `artefatos/<nome>.checklist.json`, que o atelier mostra como".into(),
            "checklist e onde grava o progresso. O formato: ferramenta `checklist` do MCP, ação \"formato\".".into(),
            String::new(),
        ]
        .join("\n");
        std::fs::write(&leia, texto).map_err(|e| Erro::Invalido(format!("não gravei {leia:?}: {e}")))?;
    }
    let caminho = dir.to_string_lossy().to_string();
    // a mudança da propriedade já anota "Pasta: …" na linha do tempo (antes saía "Pasta criada" também, em dobro)
    db::atualizar_item(conn, id, &json!({ "pasta": caminho, "autor": autor }))?;
    Ok(caminho)
}

pub const SUBPASTAS: &[&str] = &["insumos", "artefatos", "rascunho"];

/// Arquivos da pasta do item, por subpasta (insumos, artefatos, rascunho e o que estiver solto na raiz).
pub fn listar_arquivos(pasta: &Path) -> Vec<serde_json::Value> {
    let mut saida = vec![];
    let mut ler = |dir: &Path, grupo: &str| {
        let Ok(entradas) = std::fs::read_dir(dir) else { return };
        let mut lista: Vec<_> = entradas.filter_map(|e| e.ok()).collect();
        lista.sort_by_key(|e| e.file_name());
        for e in lista {
            let caminho = e.path();
            let nome = e.file_name().to_string_lossy().into_owned();
            let eh_pasta = caminho.is_dir();
            if grupo == "" && (SUBPASTAS.contains(&nome.as_str()) || nome == "CLAUDE.md") {
                continue;
            }
            let meta = e.metadata().ok();
            let modificado = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%dT%H:%M:%S%:z").to_string());
            saida.push(json!({
                "grupo": if grupo.is_empty() { "raiz" } else { grupo },
                "nome": nome,
                "caminho": caminho,
                "pasta": eh_pasta,
                "tamanho": meta.map(|m| m.len()).unwrap_or(0),
                "modificado": modificado,
            }));
        }
    };
    for sub in SUBPASTAS {
        ler(&pasta.join(sub), sub);
    }
    ler(pasta, "");
    saida
}

/// Copia arquivos (ou pastas inteiras) para `<pasta do item>/<destino>/`, sem sobrescrever: se o nome já existe,
/// vira "nome (2).ext". Devolve os nomes como ficaram.
pub fn copiar_para(pasta: &Path, destino: &str, origens: &[String]) -> Res<Vec<String>> {
    if !SUBPASTAS.contains(&destino) {
        return Err(Erro::Invalido(format!("destino desconhecido: {destino}")));
    }
    let dir = pasta.join(destino);
    std::fs::create_dir_all(&dir).map_err(|e| Erro::Invalido(format!("não criei {dir:?}: {e}")))?;
    let mut nomes = vec![];
    for o in origens {
        let origem = Path::new(o);
        let nome = origem.file_name().ok_or(Erro::Invalido(format!("caminho sem nome: {o}")))?.to_string_lossy().into_owned();
        let alvo = nome_livre(&dir, &nome);
        copiar_recursivo(origem, &alvo).map_err(|e| Erro::Invalido(format!("não copiei {o}: {e}")))?;
        nomes.push(alvo.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or(nome));
    }
    Ok(nomes)
}

/// Grava bytes (ex.: imagem colada) em `<pasta>/insumos/<nome>` sem sobrescrever. Devolve o caminho.
pub fn gravar_em_insumos(pasta: &Path, nome: &str, bytes: &[u8]) -> Res<std::path::PathBuf> {
    let dir = pasta.join("insumos");
    std::fs::create_dir_all(&dir).map_err(|e| Erro::Invalido(format!("não criei {dir:?}: {e}")))?;
    let limpo: String = nome.chars().map(|c| if c.is_alphanumeric() || ".-_ ".contains(c) { c } else { '_' }).collect();
    let alvo = nome_livre(&dir, if limpo.trim().is_empty() { "colado.bin" } else { &limpo });
    std::fs::write(&alvo, bytes).map_err(|e| Erro::Invalido(format!("não gravei {alvo:?}: {e}")))?;
    Ok(alvo)
}

fn nome_livre(dir: &Path, nome: &str) -> std::path::PathBuf {
    let alvo = dir.join(nome);
    if !alvo.exists() {
        return alvo;
    }
    let (base, ext) = match nome.rsplit_once('.') {
        Some((b, e)) if !b.is_empty() => (b.to_string(), format!(".{e}")),
        _ => (nome.to_string(), String::new()),
    };
    (2..)
        .map(|n| dir.join(format!("{base} ({n}){ext}")))
        .find(|p| !p.exists())
        .expect("sempre acha um nome livre")
}

fn copiar_recursivo(origem: &Path, alvo: &Path) -> std::io::Result<()> {
    if origem.is_dir() {
        std::fs::create_dir_all(alvo)?;
        for e in std::fs::read_dir(origem)? {
            let e = e?;
            copiar_recursivo(&e.path(), &alvo.join(e.file_name()))?;
        }
        Ok(())
    } else {
        std::fs::copy(origem, alvo).map(|_| ())
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn copiar_sem_sobrescrever_e_listar() {
        let base = std::env::temp_dir().join(format!("atelier-teste-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        let fora = base.join("fora");
        std::fs::create_dir_all(fora.join("sub")).unwrap();
        std::fs::write(fora.join("pedido.pdf"), b"x").unwrap();
        std::fs::write(fora.join("sub").join("a.txt"), b"y").unwrap();
        let item = base.join("item");
        let um = copiar_para(&item, "insumos", &[fora.join("pedido.pdf").to_string_lossy().into()]).unwrap();
        let dois = copiar_para(&item, "insumos", &[fora.join("pedido.pdf").to_string_lossy().into(), fora.join("sub").to_string_lossy().into()]).unwrap();
        assert_eq!(um, ["pedido.pdf"]);
        assert_eq!(dois, ["pedido (2).pdf", "sub"]);
        assert!(item.join("insumos").join("sub").join("a.txt").exists());
        let nomes: Vec<String> = listar_arquivos(&item).iter().map(|a| a["nome"].as_str().unwrap().to_string()).collect();
        assert_eq!(nomes, ["pedido (2).pdf", "pedido.pdf", "sub"]);
        assert!(copiar_para(&item, "../fora", &[]).is_err());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn slug_curto_e_sem_acento() {
        assert_eq!(slug("Painel de custos — v2!"), "painel-de-custos-v2");
        assert_eq!(slug("Liberação de rede: ação"), "liberacao-de-rede-acao");
        let longo = slug("Revisar todos os acessos do bucket de exports de produção da plataforma de dados");
        assert!(longo.len() <= 40 && !longo.ends_with('-'), "{longo}");
    }
}
