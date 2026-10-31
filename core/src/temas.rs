//! Temas em arquivo: `~/atelier/temas/*.toml`. O app vem com dois temas de fábrica no CSS (claro e escuro) e
//! semeia aqui os temas populares; o usuário edita ou cria os seus copiando um arquivo.

use crate::bancada::pasta_atelier;
use crate::db::{Erro, Res};
use serde_json::{json, Value};
use std::path::PathBuf;

pub const DE_FABRICA: &[&str] = &["claro", "escuro"];

const SEMENTES: &[(&str, &str)] = &[
    ("nord", include_str!("../temas/nord.toml")),
    ("catppuccin-latte", include_str!("../temas/catppuccin-latte.toml")),
    ("catppuccin-frappe", include_str!("../temas/catppuccin-frappe.toml")),
    ("catppuccin-macchiato", include_str!("../temas/catppuccin-macchiato.toml")),
    ("catppuccin-mocha", include_str!("../temas/catppuccin-mocha.toml")),
    ("tokyo-night", include_str!("../temas/tokyo-night.toml")),
    ("dracula", include_str!("../temas/dracula.toml")),
    ("gruvbox-escuro", include_str!("../temas/gruvbox-escuro.toml")),
    ("one-dark", include_str!("../temas/one-dark.toml")),
    ("solarized-claro", include_str!("../temas/solarized-claro.toml")),
    ("rose-pine", include_str!("../temas/rose-pine.toml")),
];

pub fn pasta() -> PathBuf {
    pasta_atelier().join("temas")
}

/// Grava os temas que vêm com o app quando faltarem. Não sobrescreve edição do usuário; um tema renomeado para
/// `.toml.off` fica escondido e não volta.
pub fn semear() -> Res<()> {
    let dir = pasta();
    std::fs::create_dir_all(&dir).map_err(|e| Erro::Invalido(format!("não criei {dir:?}: {e}")))?;
    for (id, conteudo) in SEMENTES {
        let arq = dir.join(format!("{id}.toml"));
        let desligado = dir.join(format!("{id}.toml.off"));
        if !arq.exists() && !desligado.exists() {
            std::fs::write(&arq, conteudo).map_err(|e| Erro::Invalido(format!("não gravei {arq:?}: {e}")))?;
        }
    }
    Ok(())
}

/// Lê todos os temas da pasta. Arquivo com erro aparece com `erro` (para o usuário saber o que consertar).
pub fn listar() -> Vec<Value> {
    let mut temas = vec![];
    let Ok(entradas) = std::fs::read_dir(pasta()) else { return temas };
    let mut arquivos: Vec<PathBuf> = entradas
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().is_some_and(|x| x == "toml"))
        .collect();
    arquivos.sort();
    for arq in arquivos {
        let id = arq.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        if DE_FABRICA.contains(&id.as_str()) {
            continue;
        }
        let lido = std::fs::read_to_string(&arq).map_err(|e| e.to_string()).and_then(|s| {
            toml::from_str::<toml::Table>(&s).map_err(|e| e.message().to_string())
        });
        temas.push(match lido {
            Ok(t) => {
                let base = t.get("base").and_then(|v| v.as_str()).unwrap_or("escuro");
                json!({
                    "id": id,
                    "nome": t.get("nome").and_then(|v| v.as_str()).unwrap_or(&id),
                    "base": if base == "claro" { "claro" } else { "escuro" },
                    "cores": tabela_texto(t.get("cores")),
                    "etiquetas": tabela_texto(t.get("etiquetas")),
                    "arquivo": arq,
                })
            }
            Err(erro) => json!({ "id": id, "nome": id, "erro": erro, "arquivo": arq }),
        });
    }
    temas
}

fn tabela_texto(v: Option<&toml::Value>) -> Value {
    let mut m = serde_json::Map::new();
    if let Some(t) = v.and_then(|v| v.as_table()) {
        for (k, v) in t {
            if let Some(s) = v.as_str() {
                m.insert(k.clone(), json!(s));
            }
        }
    }
    Value::Object(m)
}

pub fn existe(id: &str) -> bool {
    DE_FABRICA.contains(&id) || pasta().join(format!("{id}.toml")).exists()
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn sementes_sao_toml_valido_com_base_e_cores() {
        for (id, s) in SEMENTES {
            let t: toml::Table = toml::from_str(s).unwrap_or_else(|e| panic!("{id}: {e}"));
            assert!(t.get("nome").is_some(), "{id} sem nome");
            assert!(matches!(t.get("base").and_then(|v| v.as_str()), Some("claro" | "escuro")), "{id} base");
            assert!(t.get("cores").and_then(|v| v.as_table()).is_some_and(|c| c.contains_key("acento")), "{id} cores");
            assert_eq!(t.get("etiquetas").and_then(|v| v.as_table()).map(|e| e.len()), Some(9), "{id} etiquetas");
        }
    }
}
