//! Rotinas que rodam sozinhas, só se o Paulo ligar nas Configurações (tudo vem desligado):
//! backup da bancada aberta e esvaziar a lixeira do que está lá há mais de N dias.

use crate::bancada;
use crate::db::{self, Erro, Res};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub fn pasta_backups(bancada: &Path) -> PathBuf {
    bancada.join("backups")
}

/// Cópia consistente do banco (VACUUM INTO, funciona com o banco aberto) em `<bancada>/backups/`.
/// Depois apaga as mais antigas, ficando com `manter`.
pub fn fazer_backup(conn: &Connection, bancada: &Path, manter: u32) -> Res<PathBuf> {
    let dir = pasta_backups(bancada);
    std::fs::create_dir_all(&dir).map_err(|e| Erro::Invalido(format!("não criei {dir:?}: {e}")))?;
    let nome = format!("atelier-{}.db", chrono::Local::now().format("%Y-%m-%d-%H%M%S"));
    let alvo = dir.join(&nome);
    conn.execute("VACUUM INTO ?", params![alvo.to_string_lossy()])?;
    let mut copias = listar(bancada);
    copias.sort_by(|a, b| b["nome"].as_str().cmp(&a["nome"].as_str()));
    for velha in copias.iter().skip(manter.max(1) as usize) {
        if let Some(c) = velha["caminho"].as_str() {
            let _ = std::fs::remove_file(c);
        }
    }
    Ok(alvo)
}

/// Backups existentes, mais recente primeiro.
pub fn listar(bancada: &Path) -> Vec<Value> {
    let Ok(entradas) = std::fs::read_dir(pasta_backups(bancada)) else { return vec![] };
    let mut l: Vec<Value> = entradas
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("atelier-") && e.file_name().to_string_lossy().ends_with(".db"))
        .map(|e| {
            let meta = e.metadata().ok();
            json!({
                "nome": e.file_name().to_string_lossy(),
                "caminho": e.path(),
                "tamanho": meta.as_ref().map(|m| m.len()).unwrap_or(0),
                "criado_em": meta.and_then(|m| m.modified().ok()).map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%dT%H:%M:%S%:z").to_string()),
            })
        })
        .collect();
    l.sort_by(|a, b| b["nome"].as_str().cmp(&a["nome"].as_str()));
    l
}

fn horas_desde_ultimo(bancada: &Path) -> Option<f64> {
    let ultimo = listar(bancada).into_iter().next()?;
    let quando = chrono::DateTime::parse_from_str(ultimo["criado_em"].as_str()?, "%Y-%m-%dT%H:%M:%S%:z").ok()?;
    Some(chrono::Local::now().signed_duration_since(quando).num_minutes() as f64 / 60.0)
}

/// Uma passada: faz backup se estiver na hora e limpa a lixeira antiga, conforme as preferências.
pub fn rodada(conn: &Connection, bancada: &Path) -> Res<Vec<String>> {
    let prefs = bancada::carregar().preferencias;
    let mut feito = vec![];
    if prefs.backup.ativo {
        let devido = horas_desde_ultimo(bancada).is_none_or(|h| h >= prefs.backup.intervalo_horas.max(1) as f64);
        if devido {
            let p = fazer_backup(conn, bancada, prefs.backup.manter)?;
            feito.push(format!("backup {}", p.display()));
        }
    }
    if prefs.lixeira.ativo {
        let (itens, notas) = db::esvaziar_lixeira_antiga(conn, prefs.lixeira.dias)?;
        if itens + notas > 0 {
            feito.push(format!("lixeira: {itens} itens e {notas} notas com mais de {} dias", prefs.lixeira.dias));
        }
    }
    Ok(feito)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn backup_guarda_so_as_ultimas() {
        let base = std::env::temp_dir().join(format!("atelier-backup-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(&base).unwrap();
        let conn = db::abrir(&base.join("atelier.db")).unwrap();
        db::criar_item(&conn, &json!({"titulo": "guardado"})).unwrap();
        for _ in 0..3 {
            fazer_backup(&conn, &base, 2).unwrap();
            std::thread::sleep(std::time::Duration::from_millis(1100)); // nome tem segundos
        }
        let l = listar(&base);
        assert_eq!(l.len(), 2);
        let copia = Connection::open(l[0]["caminho"].as_str().unwrap()).unwrap();
        let n: i64 = copia.query_row("SELECT COUNT(*) FROM itens", [], |r| r.get(0)).unwrap();
        assert_eq!(n, 1, "a cópia é um banco de verdade");
        drop(copia);
        drop(conn);
        let _ = std::fs::remove_dir_all(&base);
    }
}
