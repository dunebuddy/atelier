//! Cold storage dos workspaces: ao arquivar um workspace à mão, a pasta do documento
//! (`<bancada>/itens/<código>-<título>/`) é compactada em `<bancada>/aposentados/<mesmo nome>.zip` e sai de `itens/`.
//! Antes, a tela mostra o tamanho e os arquivos grandes (> 5 MB) para o Paulo decidir quais vão para a Lixeira em vez
//! de entrar no zip. Reabrir o workspace descompacta de volta no mesmo lugar. O conteúdo aposentado continua
//! pesquisável (`buscar`), sem descompactar. O banco não muda: o documento guarda o caminho da pasta de sempre, e o
//! zip se acha pelo nome dela.

use crate::db::{self, Erro, Res};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::fs::File;
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};

/// Acima disto o arquivo aparece na checagem ("quer manter mesmo?").
pub const GRANDE: u64 = 5 * 1024 * 1024;
const PASTA: &str = "aposentados";

fn erro(msg: impl Into<String>) -> Erro {
    Erro::Invalido(msg.into())
}

/// A pasta do documento, se ele tem uma e ela fica dentro da bancada (nada fora dela é compactado nem apagado).
fn pasta_do_item(conn: &Connection, bancada: &Path, id: i64) -> Res<Option<PathBuf>> {
    let item = db::ler_item(conn, id)?;
    let Some(p) = item.pasta.filter(|p| !p.trim().is_empty()) else { return Ok(None) };
    let p = PathBuf::from(p);
    let raiz = bancada.canonicalize().map_err(|e| erro(format!("bancada inacessível: {e}")))?;
    // a pasta pode já estar aposentada (não existe): confere pelo pai, que existe
    let conferir = if p.exists() { p.clone() } else { p.parent().map(Path::to_path_buf).unwrap_or_default() };
    match conferir.canonicalize() {
        Ok(c) if c.starts_with(&raiz) && c != raiz => Ok(Some(p)),
        Ok(_) => Err(erro("a pasta deste documento fica fora da bancada: o atelier não compacta nem apaga ela")),
        Err(_) => Ok(Some(p)),
    }
}

/// Onde fica o zip da pasta: `<bancada>/aposentados/<nome da pasta>.zip`.
pub fn zip_de(bancada: &Path, pasta: &Path) -> PathBuf {
    let nome = pasta.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "pasta".into());
    bancada.join(PASTA).join(format!("{nome}.zip"))
}

/// Todos os arquivos (sem seguir atalhos/links), com o caminho relativo em `/`.
fn arquivos(raiz: &Path) -> Vec<(PathBuf, String, u64)> {
    let mut out = vec![];
    let mut pilha = vec![raiz.to_path_buf()];
    while let Some(d) = pilha.pop() {
        let Ok(entradas) = std::fs::read_dir(&d) else { continue };
        for e in entradas.flatten() {
            let Ok(tipo) = e.file_type() else { continue };
            if tipo.is_symlink() {
                continue;
            }
            let p = e.path();
            if tipo.is_dir() {
                pilha.push(p);
            } else if let Ok(m) = e.metadata() {
                let rel = p.strip_prefix(raiz).unwrap_or(&p).to_string_lossy().replace('\\', "/");
                out.push((p, rel, m.len()));
            }
        }
    }
    out.sort_by(|a, b| a.1.cmp(&b.1));
    out
}

fn mb(b: u64) -> String {
    let m = b as f64 / 1024.0 / 1024.0;
    if m >= 1024.0 { format!("{:.1} GB", m / 1024.0) } else if m >= 10.0 { format!("{m:.0} MB") } else { format!("{m:.1} MB") }
}

/// As subpastas (relativas, em `/`): entram no zip para que as vazias (`rascunho/`) também voltem.
fn subpastas(raiz: &Path) -> Vec<String> {
    let mut out = vec![];
    let mut pilha = vec![raiz.to_path_buf()];
    while let Some(d) = pilha.pop() {
        let Ok(entradas) = std::fs::read_dir(&d) else { continue };
        for e in entradas.flatten() {
            if e.file_type().is_ok_and(|t| t.is_dir() && !t.is_symlink()) {
                let p = e.path();
                out.push(p.strip_prefix(raiz).unwrap_or(&p).to_string_lossy().replace('\\', "/"));
                pilha.push(p);
            }
        }
    }
    out.sort();
    out
}

/// O que a tela mostra antes de arquivar: se há pasta, quanto ela ocupa e os arquivos grandes (maior primeiro).
pub fn analisar(conn: &Connection, bancada: &Path, id: i64) -> Res<Value> {
    let Some(p) = pasta_do_item(conn, bancada, id)? else { return Ok(json!({ "pasta": null })) };
    let zip = zip_de(bancada, &p);
    if !p.is_dir() {
        return Ok(json!({ "pasta": p, "existe": false, "aposentada": zip.is_file(), "zip": zip }));
    }
    let lista = arquivos(&p);
    let bytes: u64 = lista.iter().map(|a| a.2).sum();
    let mut grandes: Vec<Value> = lista.iter().filter(|a| a.2 > GRANDE).map(|a| json!({ "caminho": a.1, "bytes": a.2 })).collect();
    grandes.sort_by(|a, b| b["bytes"].as_u64().cmp(&a["bytes"].as_u64()));
    Ok(json!({ "pasta": p, "existe": true, "zip": zip, "bytes": bytes, "arquivos": lista.len(), "grandes": grandes, "limite": GRANDE }))
}

/// Compacta a pasta do documento no cold storage e tira ela de `itens/`. `remover`: caminhos relativos (da
/// análise) que vão para a Lixeira em vez de entrar no zip.
pub fn aposentar(conn: &Connection, bancada: &Path, id: i64, remover: &[String], autor: &str) -> Res<Value> {
    let Some(pasta) = pasta_do_item(conn, bancada, id)? else { return Ok(json!({ "aposentada": false, "motivo": "sem pasta" })) };
    if !pasta.is_dir() {
        return Ok(json!({ "aposentada": false, "motivo": "a pasta não existe" }));
    }
    let zip = zip_de(bancada, &pasta);
    if zip.exists() {
        return Err(erro(format!("já existe {}: restaure ou tire de lá antes", zip.display())));
    }
    std::fs::create_dir_all(zip.parent().unwrap()).map_err(|e| erro(format!("não criei a pasta {PASTA}/: {e}")))?;

    // 1. tira a pasta do lugar com um rename: se algum terminal ou programa está com ela aberta, falha aqui, antes
    //    de qualquer mudança
    let nome = pasta.file_name().unwrap_or_default().to_string_lossy().to_string();
    let temp = pasta.with_file_name(format!(".aposentando-{nome}"));
    std::fs::rename(&pasta, &temp).map_err(|e| {
        erro(format!("a pasta está em uso (um terminal, editor ou arquivo aberto nela?): feche e tente de novo ({e})"))
    })?;
    let voltar = |e: Erro| -> Erro {
        let _ = std::fs::rename(&temp, &pasta);
        e
    };

    // 2. os grandes que o Paulo mandou tirar vão para a Lixeira do sistema
    let mut lixeira = 0u64;
    let mut n_lixeira = 0;
    for rel in remover {
        let alvo = temp.join(rel.replace('/', std::path::MAIN_SEPARATOR_STR));
        let ok = alvo.canonicalize().ok().zip(temp.canonicalize().ok()).is_some_and(|(a, t)| a.starts_with(&t) && a.is_file());
        if !ok {
            continue;
        }
        let b = alvo.metadata().map(|m| m.len()).unwrap_or(0);
        trash::delete(&alvo).map_err(|e| voltar(erro(format!("não mandei {rel} para a Lixeira: {e}"))))?;
        lixeira += b;
        n_lixeira += 1;
    }

    // 3. compacta (num .parcial, que só vira .zip depois de conferido)
    let lista = arquivos(&temp);
    let dirs = subpastas(&temp);
    let bytes: u64 = lista.iter().map(|a| a.2).sum();
    let parcial = zip.with_extension("zip.parcial");
    let escrever = || -> std::io::Result<()> {
        let mut z = zip::ZipWriter::new(BufWriter::new(File::create(&parcial)?));
        for d in &dirs {
            z.add_directory(d.as_str(), zip::write::SimpleFileOptions::default())?;
        }
        for (p, rel, tam) in &lista {
            let op = zip::write::SimpleFileOptions::default()
                .compression_method(zip::CompressionMethod::Deflated)
                .large_file(*tam >= u32::MAX as u64);
            z.start_file(rel.as_str(), op)?;
            std::io::copy(&mut File::open(p)?, &mut z)?;
        }
        z.finish()?.flush()
    };
    if let Err(e) = escrever() {
        let _ = std::fs::remove_file(&parcial);
        return Err(voltar(erro(format!("não consegui compactar: {e}"))));
    }
    let conferido = File::open(&parcial).ok().and_then(|f| zip::ZipArchive::new(f).ok()).map(|z| z.len());
    if conferido != Some(lista.len() + dirs.len()) {
        let _ = std::fs::remove_file(&parcial);
        return Err(voltar(erro("o zip não conferiu com a pasta: nada foi mudado")));
    }
    std::fs::rename(&parcial, &zip).map_err(|e| voltar(erro(format!("não consegui guardar o zip: {e}"))))?;

    // 4. só agora a pasta sai do disco
    let sobrou = std::fs::remove_dir_all(&temp).err();
    let tam_zip = zip.metadata().map(|m| m.len()).unwrap_or(0);
    let rel_zip = zip.strip_prefix(bancada).unwrap_or(&zip).to_string_lossy().replace('\\', "/");
    let mut nota = format!("Pasta aposentada em {rel_zip}: {} arquivos, {} → {} compactado", lista.len(), mb(bytes), mb(tam_zip));
    if n_lixeira > 0 {
        nota.push_str(&format!("; {n_lixeira} arquivo(s) grande(s) para a Lixeira ({})", mb(lixeira)));
    }
    db::anotar(conn, id, &nota, autor)?;
    Ok(json!({
        "aposentada": true, "zip": zip, "arquivos": lista.len(), "bytes": bytes, "bytes_zip": tam_zip,
        "lixeira": n_lixeira, "bytes_lixeira": lixeira,
        "aviso": sobrou.map(|e| format!("o zip está certo, mas sobrou a pasta {} ({e}): apague à mão", temp.display())),
    }))
}

/// Descompacta de volta no lugar de sempre (reabrir o workspace). Sem zip ou com a pasta já de volta, não faz nada.
pub fn restaurar(conn: &Connection, bancada: &Path, id: i64, autor: &str) -> Res<Value> {
    let Some(pasta) = pasta_do_item(conn, bancada, id)? else { return Ok(json!({ "restaurada": false })) };
    let zip = zip_de(bancada, &pasta);
    if !zip.is_file() {
        return Ok(json!({ "restaurada": false }));
    }
    // a pasta pode ter sido recriada vazia antes (abrir a pasta, um terminal): sem nenhum arquivo, dá lugar ao zip
    if pasta.exists() {
        if !pasta.is_dir() || !arquivos(&pasta).is_empty() {
            return Ok(json!({ "restaurada": false, "motivo": "a pasta já existe com arquivos; o zip continua em aposentados/" }));
        }
        std::fs::remove_dir_all(&pasta).map_err(|e| erro(format!("a pasta vazia está em uso, não deu para restaurar: {e}")))?;
    }
    let temp = pasta.with_file_name(format!(".restaurando-{}", pasta.file_name().unwrap_or_default().to_string_lossy()));
    let _ = std::fs::remove_dir_all(&temp);
    let extrair = || -> Result<usize, String> {
        let mut z = zip::ZipArchive::new(File::open(&zip).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        for i in 0..z.len() {
            let mut f = z.by_index(i).map_err(|e| e.to_string())?;
            // só caminhos que ficam dentro da pasta (nada de ../)
            let Some(rel) = f.enclosed_name() else { continue };
            let destino = temp.join(rel);
            if f.is_dir() {
                std::fs::create_dir_all(&destino).map_err(|e| e.to_string())?;
                continue;
            }
            if let Some(pai) = destino.parent() {
                std::fs::create_dir_all(pai).map_err(|e| e.to_string())?;
            }
            std::io::copy(&mut f, &mut File::create(&destino).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        }
        Ok(z.len())
    };
    let n = match extrair() {
        Ok(n) => n,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&temp);
            return Err(erro(format!("não consegui descompactar {}: {e}", zip.display())));
        }
    };
    std::fs::create_dir_all(&temp).map_err(|e| erro(e.to_string()))?; // pasta vazia aposentada também volta
    std::fs::rename(&temp, &pasta).map_err(|e| erro(format!("não consegui pôr a pasta de volta: {e}")))?;
    std::fs::remove_file(&zip).map_err(|e| erro(format!("a pasta voltou, mas o zip ficou em {} ({e})", zip.display())))?;
    db::anotar(conn, id, &format!("Pasta restaurada do cold storage ({n} arquivos)"), autor)?;
    Ok(json!({ "restaurada": true, "pasta": pasta, "arquivos": n }))
}

/// Procura um texto no conteúdo aposentado, sem descompactar: no nome dos arquivos e dentro dos que são texto.
pub fn buscar(bancada: &Path, texto: &str, limite: usize) -> Res<Value> {
    let q = texto.trim().to_lowercase();
    if q.is_empty() {
        return Err(erro("informe o texto"));
    }
    let mut achados = vec![];
    let mut zips: Vec<PathBuf> = std::fs::read_dir(bancada.join(PASTA))
        .map(|d| d.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "zip")).collect())
        .unwrap_or_default();
    zips.sort();
    'fora: for zp in &zips {
        let nome_zip = zp.file_stem().unwrap_or_default().to_string_lossy().to_string();
        let codigo = nome_zip.split('-').next().unwrap_or("").to_string();
        let Ok(mut z) = File::open(zp).map_err(|_| ()).and_then(|f| zip::ZipArchive::new(f).map_err(|_| ())) else { continue };
        for i in 0..z.len() {
            let Ok(mut f) = z.by_index(i) else { continue };
            let arquivo = f.name().to_string();
            let base = json!({ "zip": nome_zip, "codigo": codigo, "arquivo": arquivo });
            if arquivo.to_lowercase().contains(&q) {
                let mut a = base.clone();
                a["onde"] = json!("nome");
                achados.push(a);
            }
            // dentro: só texto de até 5 MB
            if f.is_dir() || f.size() > GRANDE {
                continue;
            }
            let mut buf = vec![];
            if f.read_to_end(&mut buf).is_err() || buf.contains(&0) {
                continue;
            }
            let Ok(s) = String::from_utf8(buf) else { continue };
            for (n, linha) in s.lines().enumerate() {
                if linha.to_lowercase().contains(&q) {
                    let mut a = base.clone();
                    a["linha"] = json!(n + 1);
                    a["trecho"] = json!(linha.trim().chars().take(200).collect::<String>());
                    achados.push(a);
                    if achados.len() >= limite {
                        break 'fora;
                    }
                }
            }
            if achados.len() >= limite {
                break 'fora;
            }
        }
    }
    Ok(json!({ "achados": achados.len(), "limite": limite, "itens": achados, "pastas_aposentadas": zips.len() }))
}

#[cfg(test)]
mod testes {
    use super::*;

    fn banco_com_pasta() -> (Connection, tempdir::Pasta, i64, PathBuf) {
        let c = Connection::open_in_memory().unwrap();
        db::migrar(&c).unwrap();
        let t = tempdir::Pasta::nova();
        let id = db::criar_item(&c, &json!({ "titulo": "Projeto velho" })).unwrap();
        let pasta = crate::pastas::criar(&c, t.0.as_path(), "teste", id, "Paulo").unwrap();
        (c, t, id, PathBuf::from(pasta))
    }

    mod tempdir {
        pub struct Pasta(pub std::path::PathBuf);
        impl Pasta {
            pub fn nova() -> Self {
                let p = std::env::temp_dir().join(format!("atelier-aposentar-{}-{}", std::process::id(), rand()));
                std::fs::create_dir_all(&p).unwrap();
                Pasta(p)
            }
        }
        fn rand() -> u64 {
            let mut b = [0u8; 8];
            getrandom::getrandom(&mut b).unwrap();
            u64::from_le_bytes(b)
        }
        impl Drop for Pasta {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
    }

    #[test]
    fn aposenta_procura_e_restaura() {
        let (c, t, id, pasta) = banco_com_pasta();
        let b = t.0.as_path();
        std::fs::write(pasta.join("artefatos").join("relatório.md"), "linha um\nO cliente pediu o Relatório X\n").unwrap();
        std::fs::write(pasta.join("insumos").join("grande.bin"), vec![1u8; (GRANDE + 10) as usize]).unwrap();
        let a = analisar(&c, b, id).unwrap();
        assert_eq!(a["grandes"].as_array().unwrap().len(), 1, "{a}");
        assert_eq!(a["grandes"][0]["caminho"], "insumos/grande.bin");

        let r = aposentar(&c, b, id, &[], "Paulo").unwrap();
        assert_eq!(r["aposentada"], true, "{r}");
        assert!(!pasta.exists());
        assert!(zip_de(b, &pasta).is_file());

        let achou = buscar(b, "relatório x", 50).unwrap();
        assert_eq!(achou["achados"], 1, "{achou}");
        assert_eq!(achou["itens"][0]["arquivo"], "artefatos/relatório.md");
        assert_eq!(achou["itens"][0]["linha"], 2);

        let v = restaurar(&c, b, id, "Paulo").unwrap();
        assert_eq!(v["restaurada"], true, "{v}");
        assert_eq!(std::fs::read_to_string(pasta.join("artefatos").join("relatório.md")).unwrap(), "linha um\nO cliente pediu o Relatório X\n");
        assert_eq!(std::fs::metadata(pasta.join("insumos").join("grande.bin")).unwrap().len(), GRANDE + 10);
        assert!(pasta.join("rascunho").is_dir(), "pasta vazia também volta");
        assert!(!zip_de(b, &pasta).exists());
        // de novo: nada a fazer
        assert_eq!(restaurar(&c, b, id, "Paulo").unwrap()["restaurada"], false);
        // pasta recriada vazia antes de restaurar: o zip volta mesmo assim
        // (caminho fora da pasta em `remover` é ignorado; a Lixeira de verdade não entra no teste)
        aposentar(&c, b, id, &["../../fora.txt".into()], "Paulo").unwrap();
        std::fs::create_dir_all(pasta.join("insumos")).unwrap();
        assert_eq!(restaurar(&c, b, id, "Paulo").unwrap()["restaurada"], true);
        assert!(pasta.join("artefatos").join("relatório.md").is_file());
        assert!(pasta.join("insumos").join("grande.bin").is_file());
    }

    #[test]
    fn pasta_em_uso_nao_muda_nada() {
        let (c, t, id, pasta) = banco_com_pasta();
        let b = t.0.as_path();
        if !cfg!(windows) {
            return; // no Linux renomear pasta aberta funciona; o teste é do Windows
        }
        let arq = pasta.join("aberto.txt");
        std::fs::write(&arq, "x").unwrap();
        let _segura = File::open(&arq).unwrap();
        // no Windows, arquivo aberto sem FILE_SHARE_DELETE impede o rename da pasta
        let r = aposentar(&c, b, id, &[], "Paulo");
        if r.is_err() {
            assert!(pasta.is_dir());
            assert!(!zip_de(b, &pasta).exists());
        }
    }
}
