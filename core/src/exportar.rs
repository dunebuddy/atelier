//! Exportar (relatórios): a tela monta o conteúdo (Markdown, HTML, CSV) e manda gravar; a planilha do Excel é
//! montada aqui, a partir das linhas.

use crate::db::{Erro, Res};
use serde_json::Value;
use std::path::{Path, PathBuf};

const EXTENSOES: &[&str] = &["md", "html", "csv", "xlsx", "json"];

/// Nome de arquivo sem caracteres que o Windows recusa.
pub fn nome_limpo(nome: &str) -> String {
    let n: String = nome.chars().map(|c| if "\\/:*?\"<>|".contains(c) || c.is_control() { '-' } else { c }).collect();
    let n = n.trim().trim_end_matches('.').to_string();
    if n.is_empty() { "relatorio".into() } else { n.chars().take(120).collect() }
}

/// Caminho livre em `<bancada>/relatorios/` (não sobrescreve: acrescenta " (2)", " (3)"...).
pub fn livre_em(dir: &Path, nome: &str, ext: &str) -> PathBuf {
    let base = nome_limpo(nome);
    let mut alvo = dir.join(format!("{base}.{ext}"));
    let mut n = 2;
    while alvo.exists() {
        alvo = dir.join(format!("{base} ({n}).{ext}"));
        n += 1;
    }
    alvo
}

/// Grava o arquivo. `d`: `{ "ext": "md", "texto": "..." }` ou, para xlsx, `{ "ext": "xlsx", "planilha":
/// { "nome": "Itens", "cabecalho": [...], "linhas": [[...], ...] } }`.
pub fn gravar(alvo: &Path, d: &Value) -> Res<()> {
    let ext = d.get("ext").and_then(|v| v.as_str()).unwrap_or("");
    if !EXTENSOES.contains(&ext) {
        return Err(Erro::Invalido(format!("formato desconhecido: {ext}")));
    }
    if let Some(dir) = alvo.parent() {
        std::fs::create_dir_all(dir).map_err(|e| Erro::Invalido(format!("não criei {dir:?}: {e}")))?;
    }
    if ext == "xlsx" {
        return planilha(alvo, d.get("planilha").unwrap_or(&Value::Null));
    }
    let texto = d.get("texto").and_then(|v| v.as_str()).unwrap_or("");
    // CSV com BOM: o Excel em português abre com acento certo
    let bytes = if ext == "csv" { [b"\xEF\xBB\xBF".as_slice(), texto.as_bytes()].concat() } else { texto.as_bytes().to_vec() };
    std::fs::write(alvo, bytes).map_err(|e| Erro::Invalido(format!("não gravei {alvo:?}: {e}")))
}

fn planilha(alvo: &Path, p: &Value) -> Res<()> {
    use rust_xlsxwriter::{Format, Workbook};
    let erro = |e: rust_xlsxwriter::XlsxError| Erro::Invalido(format!("planilha: {e}"));
    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    let nome: String = p.get("nome").and_then(|v| v.as_str()).unwrap_or("Itens").chars().filter(|c| !"[]:*?/\\".contains(*c)).take(31).collect();
    ws.set_name(if nome.is_empty() { "Itens" } else { &nome }).map_err(erro)?;
    let negrito = Format::new().set_bold();
    let quebra = Format::new().set_text_wrap();
    let cab: Vec<String> = p.get("cabecalho").and_then(|v| v.as_array()).into_iter().flatten().map(texto_de).collect();
    for (c, t) in cab.iter().enumerate() {
        ws.write_string_with_format(0, c as u16, t, &negrito).map_err(erro)?;
    }
    let linhas = p.get("linhas").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    for (l, linha) in linhas.iter().enumerate() {
        for (c, v) in linha.as_array().into_iter().flatten().enumerate() {
            let (l, c) = (l as u32 + 1, c as u16);
            match v {
                Value::Number(n) => { ws.write_number(l, c, n.as_f64().unwrap_or(0.0)).map_err(erro)?; }
                Value::Bool(b) => { ws.write_boolean(l, c, *b).map_err(erro)?; }
                Value::Null => {}
                outro => {
                    let t = texto_de(outro);
                    if t.contains('\n') {
                        ws.write_string_with_format(l, c, &t, &quebra).map_err(erro)?;
                    } else {
                        ws.write_string(l, c, &t).map_err(erro)?;
                    }
                }
            }
        }
    }
    if !cab.is_empty() {
        ws.set_freeze_panes(1, 0).map_err(erro)?;
        ws.autofilter(0, 0, linhas.len() as u32, cab.len() as u16 - 1).map_err(erro)?;
    }
    ws.autofit();
    wb.save(alvo).map_err(erro)
}

fn texto_de(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        outro => outro.to_string(),
    }
}

#[cfg(test)]
mod testes {
    use super::*;
    use serde_json::json;

    #[test]
    fn grava_csv_com_bom_e_planilha() {
        let dir = std::env::temp_dir().join(format!("atelier-exportar-{}", std::process::id()));
        let csv = livre_em(&dir, "itens: hoje?", "csv");
        assert!(csv.file_name().unwrap().to_string_lossy().starts_with("itens- hoje-"));
        gravar(&csv, &json!({ "ext": "csv", "texto": "título;código\nação;a3f9c21\n" })).unwrap();
        assert!(std::fs::read(&csv).unwrap().starts_with(b"\xEF\xBB\xBFt"));
        assert_ne!(livre_em(&dir, "itens: hoje?", "csv"), csv, "não sobrescreve");
        let x = livre_em(&dir, "relatório", "xlsx");
        gravar(&x, &json!({ "ext": "xlsx", "planilha": { "nome": "Itens", "cabecalho": ["Título", "Prazo"], "linhas": [["Revisar", "2026-11-04"], ["Outro\ncom linha", 3]] } })).unwrap();
        assert!(std::fs::read(&x).unwrap().starts_with(b"PK"), "xlsx é um zip");
        assert!(gravar(&dir.join("x.exe"), &json!({ "ext": "exe" })).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }
}
