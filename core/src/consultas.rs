//! Consultas: SQL de verdade, só de leitura, sobre a bancada. Para não precisar saber como as propriedades moram
//! (JSON dentro de `itens.props`), toda consulta enxerga `documentos`: uma linha por documento (fora da lixeira), com
//! `codigo`, `titulo`, `tipo`, `corpo`, `criado_em`, `atualizado_em` e uma coluna por propriedade, pelo nome dela
//! (ex.: `SELECT titulo, "Status" FROM documentos WHERE tipo = 'Task' AND "Status" <> 'Feito'`). As tabelas de
//! verdade (`itens`, `notas`...) também dão para ler. Escrever não dá: o comando é conferido como só leitura e a
//! conexão fica em `query_only` enquanto roda; e a consulta tem prazo (não trava o app).

use crate::db::{Erro, Res};
use rusqlite::{params, Connection, OptionalExtension};
use serde_json::{json, Value};

const MAX_LINHAS: usize = 1000;
const PRAZO_MS: u128 = 4000;

/// O `WITH documentos AS (...)` com uma coluna por propriedade (as calculadas, lista e fórmula, ficam de fora).
fn cte_documentos(conn: &Connection) -> Res<String> {
    let props: Vec<(i64, String)> = conn
        .prepare("SELECT id, nome FROM propriedades WHERE especie NOT IN ('lista', 'formula') ORDER BY id")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut cols = vec![
        "i.codigo AS codigo".to_string(),
        "i.titulo AS titulo".to_string(),
        "t.nome AS tipo".to_string(),
        "i.corpo AS corpo".to_string(),
        "i.criado_em AS criado_em".to_string(),
        "i.atualizado_em AS atualizado_em".to_string(),
    ];
    let fixas = ["codigo", "titulo", "tipo", "corpo", "criado_em", "atualizado_em"];
    for (id, nome) in props {
        if fixas.contains(&nome.to_lowercase().as_str()) {
            continue;
        }
        cols.push(format!("json_extract(i.props, '$.\"{id}\"') AS \"{}\"", nome.replace('"', "\"\"")));
    }
    Ok(format!(
        "documentos AS (SELECT {} FROM itens i LEFT JOIN tipos t ON t.id = i.tipo_id WHERE i.apagado_em IS NULL)",
        cols.join(", ")
    ))
}

/// Junta o `documentos` ao SQL de quem pediu (que pode ter o seu próprio WITH).
fn com_documentos(conn: &Connection, sql: &str) -> Res<String> {
    let cte = cte_documentos(conn)?;
    let s = sql.trim().trim_end_matches(';').trim();
    let comeca_com_with = s.len() >= 4 && s[..4].eq_ignore_ascii_case("with") && s[4..].starts_with(|c: char| c.is_whitespace());
    Ok(if comeca_com_with {
        let resto = s[4..].trim_start();
        let resto = resto.strip_prefix("RECURSIVE").or_else(|| resto.strip_prefix("recursive")).map(|r| format!("RECURSIVE {cte}, {r}"));
        match resto {
            Some(r) => format!("WITH {r}"),
            None => format!("WITH {cte}, {}", &s[4..].trim_start()),
        }
    } else {
        format!("WITH {cte} {s}")
    })
}

/// Roda uma consulta só de leitura: `{ colunas: [...], linhas: [[...]], total, cortada }`.
pub fn rodar(conn: &Connection, sql: &str) -> Res<Value> {
    if sql.trim().is_empty() {
        return Err(Erro::Invalido("consulta vazia".into()));
    }
    let completo = com_documentos(conn, sql)?;
    conn.execute_batch("PRAGMA query_only = 1")?;
    let inicio = std::time::Instant::now();
    conn.progress_handler(10_000, Some(move || inicio.elapsed().as_millis() > PRAZO_MS));
    let r = (|| -> Res<Value> {
        let mut st = conn.prepare(&completo).map_err(|e| Erro::Invalido(format!("consulta com erro: {e}")))?;
        if !st.readonly() {
            return Err(Erro::Invalido("consulta só lê: SELECT (ou WITH ... SELECT)".into()));
        }
        let colunas: Vec<String> = st.column_names().iter().map(|c| c.to_string()).collect();
        let n = colunas.len();
        let mut linhas = vec![];
        let mut total = 0usize;
        let mut rows = st.query([]).map_err(|e| Erro::Invalido(format!("consulta com erro: {e}")))?;
        while let Some(r) = rows.next().map_err(|e| Erro::Invalido(if inicio.elapsed().as_millis() > PRAZO_MS { "consulta demorou demais (mais de 4 s)".into() } else { format!("consulta com erro: {e}") }))? {
            total += 1;
            if linhas.len() < MAX_LINHAS {
                let mut l = Vec::with_capacity(n);
                for i in 0..n {
                    l.push(match r.get_ref(i)? {
                        rusqlite::types::ValueRef::Null => Value::Null,
                        rusqlite::types::ValueRef::Integer(x) => json!(x),
                        rusqlite::types::ValueRef::Real(x) => json!(x),
                        rusqlite::types::ValueRef::Text(t) => {
                            let t = String::from_utf8_lossy(t).to_string();
                            // valores JSON (listas de relação) voltam como lista
                            if t.starts_with('[') { serde_json::from_str(&t).unwrap_or(json!(t)) } else { json!(t) }
                        }
                        rusqlite::types::ValueRef::Blob(b) => json!(format!("<{} bytes>", b.len())),
                    });
                }
                linhas.push(l);
            }
        }
        Ok(json!({ "colunas": colunas, "linhas": linhas, "total": total, "cortada": total > MAX_LINHAS }))
    })();
    conn.progress_handler(0, None::<fn() -> bool>);
    conn.execute_batch("PRAGMA query_only = 0")?;
    r
}

/// Os códigos que a consulta devolve, na ordem dela (coluna `codigo`): é o que a visão feita de uma consulta mostra.
pub fn codigos(conn: &Connection, sql: &str) -> Res<Vec<String>> {
    let r = rodar(conn, sql)?;
    let col = r["colunas"].as_array().and_then(|c| c.iter().position(|x| x == "codigo")).ok_or_else(|| {
        Erro::Invalido("para virar visão, a consulta precisa devolver a coluna codigo (ex.: SELECT codigo, titulo FROM documentos ...)".into())
    })?;
    Ok(r["linhas"].as_array().into_iter().flatten().filter_map(|l| l[col].as_str().map(String::from)).collect())
}

// ---------- consultas salvas ----------

pub fn listar(conn: &Connection) -> Res<Vec<Value>> {
    Ok(conn
        .prepare("SELECT id, nome, sql, atualizado_em FROM consultas ORDER BY nome")?
        .query_map([], |r| Ok(json!({ "id": r.get::<_, i64>(0)?, "nome": r.get::<_, String>(1)?, "sql": r.get::<_, String>(2)?, "atualizado_em": r.get::<_, String>(3)? })))?
        .collect::<Result<_, _>>()?)
}

pub fn salvar(conn: &Connection, id: Option<i64>, nome: &str, sql: &str) -> Res<i64> {
    let nome = nome.trim();
    if nome.is_empty() {
        return Err(Erro::Invalido("dê um nome à consulta".into()));
    }
    let agora = chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%:z").to_string();
    match id {
        Some(id) => {
            let n = conn.execute("UPDATE consultas SET nome = ?, sql = ?, atualizado_em = ? WHERE id = ?", params![nome, sql, agora, id])?;
            if n == 0 {
                return Err(Erro::NaoEncontrado(format!("consulta {id}")));
            }
            Ok(id)
        }
        None => {
            conn.execute("INSERT INTO consultas (nome, sql, criado_em, atualizado_em) VALUES (?, ?, ?, ?)", params![nome, sql, agora, agora])?;
            Ok(conn.last_insert_rowid())
        }
    }
}

pub fn apagar(conn: &Connection, id: i64) -> Res<()> {
    conn.execute("DELETE FROM consultas WHERE id = ?", [id])?;
    Ok(())
}

pub fn por_nome(conn: &Connection, nome: &str) -> Res<Option<(i64, String)>> {
    Ok(conn.query_row("SELECT id, sql FROM consultas WHERE lower(nome) = lower(?)", [nome.trim()], |r| Ok((r.get(0)?, r.get(1)?))).optional()?)
}

#[cfg(test)]
mod testes {
    use super::*;
    use crate::db;

    #[test]
    fn consulta_le_documentos_e_nao_escreve() {
        let c = db::abrir_em_memoria();
        let status: i64 = c.query_row("SELECT id FROM propriedades WHERE especie = 'status' LIMIT 1", [], |r| r.get(0)).unwrap();
        db::criar_item(&c, &json!({"titulo": "Um", "tipo_id": 1, "props": {status.to_string(): "Feito"}})).unwrap();
        db::criar_item(&c, &json!({"titulo": "Dois", "tipo_id": 1})).unwrap();
        let r = rodar(&c, "SELECT titulo, \"Status\" FROM documentos WHERE \"Status\" = 'Feito'").unwrap();
        assert_eq!(r["linhas"], json!([["Um", "Feito"]]));
        // com WITH próprio também
        let r = rodar(&c, "WITH x AS (SELECT titulo FROM documentos) SELECT count(*) FROM x").unwrap();
        assert_eq!(r["linhas"][0][0], 2);
        // escrever: recusado, e a conexão volta a escrever depois
        assert!(rodar(&c, "DELETE FROM itens").is_err());
        assert_eq!(c.query_row("SELECT count(*) FROM itens", [], |r| r.get::<_, i64>(0)).unwrap(), 2);
        db::criar_item(&c, &json!({"titulo": "Três"})).unwrap();
        assert_eq!(codigos(&c, "SELECT codigo FROM documentos ORDER BY titulo").unwrap().len(), 3);
    }
}
