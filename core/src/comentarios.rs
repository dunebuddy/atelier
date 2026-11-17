//! Comentários num arquivo de texto (markdown, texto, HTML), como numa revisão: o Paulo seleciona um trecho do que está
//! vendo no atelier e escreve; o agente lê, ajusta o arquivo e marca como resolvido, com uma resposta.
//!
//! Ficam **fora do arquivo**, ao lado dele: `<nome do arquivo>.comentarios.json`. Cada comentário guarda o trecho
//! citado e um pedaço do texto antes e depois (para achar o lugar mesmo depois que o arquivo mudar). Resolvido não
//! some: fica com a resposta, até o Paulo limpar. Sem nenhum comentário, o arquivo de comentários é apagado.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const SUFIXO: &str = ".comentarios.json";

/// Instruções para o agente (vão também no manual do MCP).
pub const COMO_FUNCIONA: &str = "Comentários: o usuário seleciona um trecho de um arquivo aberto no atelier (markdown, texto, \
HTML) e escreve um comentário, como numa revisão. Eles ficam em <arquivo>.comentarios.json, ao lado do arquivo (não \
edite esse arquivo à mão). Quando o usuário disser que comentou (\"comentei\", \"respondi lá\", \"olha os comentários\"): \
1) `comentarios` acao \"ler\" com o `arquivo` (ou a `pasta`, ou o `codigo` do documento, para ver todos os da pasta); \
2) cada comentário traz o `trecho` que ele marcou, `antes`/`depois` (o texto em volta, para achar o lugar) e o \
`comentario`; ajuste o arquivo; 3) `comentarios` acao \"resolver\" com `arquivo`, `id` e uma `resposta` curta do que \
você fez (ou, se for uma pergunta, a resposta); 4) abra o arquivo de novo com `tela` abrir para ele ver. Não resolva \
o que não fez: se não deu, responda com acao \"responder\" (fica aberto, com a sua resposta).";

/// O arquivo de comentários de `arquivo`.
pub fn arquivo_de(arquivo: &Path) -> PathBuf {
    let nome = arquivo.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
    arquivo.with_file_name(format!("{nome}{SUFIXO}"))
}

fn agora() -> String {
    chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false)
}

fn carregar(arquivo: &Path) -> Value {
    let p = arquivo_de(arquivo);
    let mut v = std::fs::read_to_string(&p).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).unwrap_or(json!({}));
    if !v.is_object() {
        v = json!({});
    }
    if !v["comentarios"].is_array() {
        v["comentarios"] = json!([]);
    }
    v
}

fn gravar(arquivo: &Path, v: &Value) -> Result<(), String> {
    let p = arquivo_de(arquivo);
    if v["comentarios"].as_array().is_none_or(|l| l.is_empty()) {
        if p.exists() {
            std::fs::remove_file(&p).map_err(|e| format!("não apaguei {}: {e}", p.display()))?;
        }
        return Ok(());
    }
    let texto = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
    std::fs::write(&p, texto).map_err(|e| format!("não gravei {}: {e}", p.display()))
}

fn modificado(arquivo: &Path) -> Option<String> {
    let m = std::fs::metadata(arquivo_de(arquivo)).ok()?.modified().ok()?;
    Some(chrono::DateTime::<chrono::Local>::from(m).to_rfc3339_opts(chrono::SecondsFormat::Millis, false))
}

/// Os comentários do arquivo (todos), com quantos estão abertos e quando o arquivo de comentários mudou (a tela vigia).
pub fn ler(arquivo: &Path) -> Value {
    let v = carregar(arquivo);
    let lista = v["comentarios"].as_array().cloned().unwrap_or_default();
    let abertos = lista.iter().filter(|c| c["resolvido"].is_null()).count();
    json!({
        "arquivo": arquivo.to_string_lossy(),
        "comentarios": lista,
        "abertos": abertos,
        "modificado": modificado(arquivo),
    })
}

/// Só os abertos (o que o agente precisa), com o caminho do arquivo.
pub fn abertos(arquivo: &Path) -> Value {
    let v = carregar(arquivo);
    let lista: Vec<Value> = v["comentarios"].as_array().cloned().unwrap_or_default().into_iter().filter(|c| c["resolvido"].is_null()).collect();
    json!({ "arquivo": arquivo.to_string_lossy(), "abertos": lista })
}

/// Os arquivos com comentários abertos numa pasta (e subpastas, até 6 níveis).
pub fn abertos_na_pasta(pasta: &Path) -> Value {
    let mut achados = Vec::new();
    fn varrer(d: &Path, nivel: usize, achados: &mut Vec<Value>) {
        if nivel > 6 {
            return;
        }
        let Ok(it) = std::fs::read_dir(d) else { return };
        for e in it.flatten() {
            let p = e.path();
            let nome = e.file_name().to_string_lossy().to_string();
            if p.is_dir() {
                if !nome.starts_with('.') && nome != "node_modules" {
                    varrer(&p, nivel + 1, achados);
                }
            } else if let Some(base) = nome.strip_suffix(SUFIXO) {
                let alvo = p.with_file_name(base);
                let a = abertos(&alvo);
                if a["abertos"].as_array().is_some_and(|l| !l.is_empty()) {
                    achados.push(a);
                }
            }
        }
    }
    varrer(pasta, 0, &mut achados);
    json!({ "pasta": pasta.to_string_lossy(), "arquivos": achados })
}

fn achar<'a>(v: &'a mut Value, id: u64) -> Result<&'a mut Value, String> {
    v["comentarios"]
        .as_array_mut()
        .and_then(|l| l.iter_mut().find(|c| c["id"].as_u64() == Some(id)))
        .ok_or_else(|| format!("comentário {id} não existe nesse arquivo"))
}

/// Novo comentário num trecho. Devolve o id.
pub fn criar(arquivo: &Path, trecho: &str, antes: &str, depois: &str, texto: &str, autor: &str) -> Result<u64, String> {
    if !arquivo.is_file() {
        return Err(format!("arquivo não encontrado: {}", arquivo.display()));
    }
    if texto.trim().is_empty() {
        return Err("o comentário está vazio".into());
    }
    let mut v = carregar(arquivo);
    let id = v["comentarios"].as_array().map(|l| l.iter().filter_map(|c| c["id"].as_u64()).max().unwrap_or(0)).unwrap_or(0) + 1;
    v["arquivo"] = json!(arquivo.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
    v["comentarios"].as_array_mut().unwrap().push(json!({
        "id": id,
        "trecho": trecho,
        "antes": antes,
        "depois": depois,
        "comentario": texto.trim(),
        "autor": autor,
        "criado": agora(),
        "resolvido": null,
    }));
    gravar(arquivo, &v)?;
    Ok(id)
}

pub fn editar(arquivo: &Path, id: u64, texto: &str) -> Result<(), String> {
    if texto.trim().is_empty() {
        return Err("o comentário está vazio".into());
    }
    let mut v = carregar(arquivo);
    let c = achar(&mut v, id)?;
    c["comentario"] = json!(texto.trim());
    c["editado"] = json!(agora());
    gravar(arquivo, &v)
}

pub fn apagar(arquivo: &Path, id: u64) -> Result<(), String> {
    let mut v = carregar(arquivo);
    let l = v["comentarios"].as_array_mut().unwrap();
    let antes = l.len();
    l.retain(|c| c["id"].as_u64() != Some(id));
    if l.len() == antes {
        return Err(format!("comentário {id} não existe nesse arquivo"));
    }
    gravar(arquivo, &v)
}

/// Resolve (o agente fez o ajuste), com a resposta do que foi feito.
pub fn resolver(arquivo: &Path, id: u64, resposta: &str, autor: &str) -> Result<(), String> {
    let mut v = carregar(arquivo);
    let c = achar(&mut v, id)?;
    c["resolvido"] = json!({ "em": agora(), "autor": autor, "resposta": resposta.trim() });
    gravar(arquivo, &v)
}

/// Responde sem resolver (fica aberto, com a resposta à vista).
pub fn responder(arquivo: &Path, id: u64, resposta: &str, autor: &str) -> Result<(), String> {
    if resposta.trim().is_empty() {
        return Err("a resposta está vazia".into());
    }
    let mut v = carregar(arquivo);
    let c = achar(&mut v, id)?;
    c["resposta"] = json!({ "em": agora(), "autor": autor, "texto": resposta.trim() });
    gravar(arquivo, &v)
}

pub fn reabrir(arquivo: &Path, id: u64) -> Result<(), String> {
    let mut v = carregar(arquivo);
    let c = achar(&mut v, id)?;
    c["resolvido"] = Value::Null;
    gravar(arquivo, &v)
}

/// Tira os resolvidos (os abertos ficam).
pub fn limpar_resolvidos(arquivo: &Path) -> Result<usize, String> {
    let mut v = carregar(arquivo);
    let l = v["comentarios"].as_array_mut().unwrap();
    let antes = l.len();
    l.retain(|c| c["resolvido"].is_null());
    let n = antes - l.len();
    gravar(arquivo, &v)?;
    Ok(n)
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn ciclo_completo() {
        let d = std::env::temp_dir().join(format!("atelier-coment-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        let arq = d.join("plano.md");
        std::fs::write(&arq, "# Plano\n\nPergunta 1: qual banco?\n").unwrap();

        let id = criar(&arq, "qual banco?", "Pergunta 1: ", "\n", "Postgres", "Paulo").unwrap();
        assert_eq!(id, 1);
        assert!(arquivo_de(&arq).ends_with("plano.md.comentarios.json"));
        assert_eq!(ler(&arq)["abertos"], 1);
        let id2 = criar(&arq, "Plano", "# ", "\n", "mudar o título", "Paulo").unwrap();
        assert_eq!(id2, 2);

        responder(&arq, 1, "anotado", "Agente").unwrap();
        assert_eq!(ler(&arq)["abertos"], 2);
        resolver(&arq, 1, "usei Postgres", "Agente").unwrap();
        assert_eq!(ler(&arq)["abertos"], 1);
        assert_eq!(abertos_na_pasta(&d)["arquivos"].as_array().unwrap().len(), 1);

        editar(&arq, 2, "mudar o título para Plano final").unwrap();
        reabrir(&arq, 1).unwrap();
        assert_eq!(ler(&arq)["abertos"], 2);
        resolver(&arq, 1, "ok", "Agente").unwrap();
        assert_eq!(limpar_resolvidos(&arq).unwrap(), 1);
        apagar(&arq, 2).unwrap();
        // sem comentários, o arquivo de comentários some
        assert!(!arquivo_de(&arq).exists());
        assert!(apagar(&arq, 9).is_err());
        let _ = std::fs::remove_dir_all(&d);
    }
}
