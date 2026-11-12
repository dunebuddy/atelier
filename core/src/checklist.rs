//! Checklist do atelier: arquivo `*.checklist.json` na pasta do documento. Os passos (que o agente escreve) e o
//! estado (que a tela grava) ficam no mesmo arquivo, em chaves separadas, ligados pelo `id` do passo. A tela é
//! `src/components/Checklist.tsx`; aqui ficam o resumo (para o `ler_documento`) e a marcação pelo MCP.
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

/// O formato, para o agente (ferramenta `checklist`, ação "formato").
pub const FORMATO: &str = r##"CHECKLIST DO ATELIER — arquivo `<nome>.checklist.json`, na pasta do documento (de costume em `artefatos/`).
O atelier abre esse arquivo numa tela de checklist (clique na árvore de arquivos, ou `tela` abrir arquivo) e grava
ali o progresso. O Paulo também EDITA o checklist na tela (passos, seções, ordem, tags, links, dependências).
Use para roteiros de execução (muitos passos curtos). Etapa com vida própria (status, responsável, bloqueio) é
documento (tipo Passo/Task), não passo de checklist.

{
  "atelier": "checklist", "versao": 2,
  "titulo": "Sessão de implantação",
  "comentarios": [                                                      // blocos de markdown entre as seções
    { "id": "c1", "texto": "Para que serve, de onde veio…", "antes_de": "grupo-ad" }  // antes_de: id do passo seguinte (null = no fim)
  ],
  "campos": { "tenant": "Tenant ID", "kv": "Nome do Key Vault" },      // valores a coletar durante a execução
  "passos": [
    {
      "id": "grupo-ad",                       // obrigatório, único e ESTÁVEL (estado e dependências apontam para ele)
      "titulo": "Criar o grupo do AD",        // obrigatório
      "grupo": "1 · Entra ID · grupo do AD",  // seção; passos SEGUIDOS com o mesmo grupo formam uma seção
      "tags": ["Entra ID", "DEV"],            // etiquetas livres deste checklist; a tela filtra por elas
      "depende_de": ["conversa"],             // ids que precisam estar feitos antes (a tela mostra ✅/⏳)
      "opcional": true,
      "pede": ["tenant"],                     // campos que este passo coleta (caixas de texto no passo)
      "corpo": "markdown: o que fazer. Blocos ``` ganham botão copiar; `código` copia com um clique; {{tenant}} vira o valor coletado.",
      "links": ["#a3f9c21", "guia.md", { "rotulo": "Portal", "alvo": "https://portal.azure.com" }]
    }
  ],
  "estado": { "grupo-ad": { "feito": "2026-11-12T14:00:00-03:00", "por": "Paulo", "pulado": false, "obs": "…",
                            "documento": "a3f9c21" } },
  "valores": { "tenant": "…" }
}

Regras:
- A ORDEM do array `passos` é a ordem de execução. Ponha cada passo depois do que ele precisa.
- Links: "#código" abre o documento; http(s) abre o site; caminho relativo é relativo à pasta do checklist.
- Qualquer passo pode ser pulado na tela ("não se aplica"); `opcional` só sinaliza.
- `estado` e `valores` são do Paulo. Como ele também edita os passos, NUNCA reescreva o arquivo de memória: leia o
  arquivo atual e mude só o que precisa, preservando `estado`, `valores` e os ids. Para marcar um passo, use
  `checklist` ação "marcar".
- O texto do topo é um comentário com `antes_de` = id do primeiro passo (o campo antigo `descricao` vira isso sozinho).
- `estado.<id>.documento` = o passo virou documento ("Virar documento" na tela).
- Depois de criar, mostre: `tela` acao "abrir" com `arquivo` = o caminho absoluto."##;

pub fn eh_checklist(p: &Path) -> bool {
    p.file_name().map(|n| n.to_string_lossy().to_lowercase().ends_with(".checklist.json")).unwrap_or(false)
}

/// Os checklists dentro da pasta (até 4 níveis; pula pastas ocultas e `node_modules`).
pub fn achar(pasta: &Path) -> Vec<PathBuf> {
    fn andar(d: &Path, nivel: usize, out: &mut Vec<PathBuf>) {
        let Ok(rd) = std::fs::read_dir(d) else { return };
        let mut l: Vec<_> = rd.filter_map(|e| e.ok()).map(|e| e.path()).collect();
        l.sort();
        for p in l {
            let nome = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
            if p.is_dir() {
                if nivel < 4 && !nome.starts_with('.') && nome != "node_modules" {
                    andar(&p, nivel + 1, out);
                }
            } else if eh_checklist(&p) {
                out.push(p);
            }
        }
    }
    let mut out = vec![];
    andar(pasta, 0, &mut out);
    out
}

fn ler(p: &Path) -> Result<Value, String> {
    let texto = std::fs::read_to_string(p).map_err(|e| format!("não li {}: {e}", p.display()))?;
    let v: Value = serde_json::from_str(&texto).map_err(|e| format!("JSON inválido: {e}"))?;
    if !v.get("passos").is_some_and(Value::is_array) {
        return Err("sem a lista \"passos\"".into());
    }
    Ok(v)
}

fn feito(v: &Value, id: &str) -> bool {
    v["estado"][id]["feito"].as_str().is_some_and(|s| !s.is_empty())
}

/// Resumo de um checklist: progresso e os próximos passos que já podem andar.
pub fn resumo(p: &Path, base: Option<&Path>) -> Value {
    let arquivo = base.and_then(|b| p.strip_prefix(b).ok()).unwrap_or(p).to_string_lossy().replace('\\', "/");
    let v = match ler(p) {
        Ok(v) => v,
        Err(e) => return json!({ "arquivo": arquivo, "caminho": p, "erro": e }),
    };
    let passos = v["passos"].as_array().cloned().unwrap_or_default();
    let id = |x: &Value| x["id"].as_str().unwrap_or("").to_string();
    let feitos = passos.iter().filter(|x| feito(&v, &id(x))).count();
    let pulados = passos.iter().filter(|x| v["estado"][id(x).as_str()]["pulado"].as_bool() == Some(true)).count();
    let livres: Vec<Value> = passos
        .iter()
        .enumerate()
        .filter(|(_, x)| !feito(&v, &id(x)))
        .filter(|(_, x)| x["depende_de"].as_array().is_none_or(|d| d.iter().all(|d| feito(&v, d.as_str().unwrap_or("")))))
        .take(5)
        .map(|(i, x)| json!({ "n": i + 1, "id": id(x), "titulo": x["titulo"] }))
        .collect();
    let documentos: Vec<Value> = passos
        .iter()
        .filter_map(|x| v["estado"][id(x).as_str()]["documento"].as_str().map(|c| json!({ "passo": id(x), "documento": format!("#{c}") })))
        .collect();
    let mut r = json!({
        "arquivo": arquivo, "caminho": p, "titulo": v["titulo"],
        "feitos": feitos, "pulados": pulados, "total": passos.len(), "proximos_liberados": livres,
    });
    if !documentos.is_empty() {
        r["viraram_documento"] = json!(documentos);
    }
    r
}

/// Marca (ou desmarca) um passo, grava e devolve o resumo. Mexe só no `estado` daquele passo.
pub fn marcar(p: &Path, id: &str, feito_: bool, pulado: bool, obs: Option<&str>, por: &str) -> Result<Value, String> {
    if !eh_checklist(p) {
        return Err("o arquivo precisa terminar em .checklist.json".into());
    }
    let mut v = ler(p)?;
    if !v["passos"].as_array().unwrap().iter().any(|x| x["id"].as_str() == Some(id)) {
        return Err(format!("não há passo com id \"{id}\""));
    }
    let raiz = v.as_object_mut().unwrap();
    let estado = raiz.entry("estado").or_insert_with(|| json!({}));
    if !estado.is_object() {
        *estado = json!({});
    }
    let e = estado.as_object_mut().unwrap().entry(id.to_string()).or_insert_with(|| json!({}));
    if !e.is_object() {
        *e = json!({});
    }
    let e: &mut Map<String, Value> = e.as_object_mut().unwrap();
    if feito_ {
        e.insert("feito".into(), json!(chrono::Local::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, false)));
        e.insert("por".into(), json!(por));
        if pulado {
            e.insert("pulado".into(), json!(true));
        } else {
            e.remove("pulado");
        }
    } else {
        e.remove("feito");
        e.remove("por");
        e.remove("pulado");
    }
    if let Some(o) = obs {
        if o.trim().is_empty() {
            e.remove("obs");
        } else {
            e.insert("obs".into(), json!(o));
        }
    }
    let texto = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())? + "\n";
    std::fs::write(p, texto).map_err(|e| format!("não gravei {}: {e}", p.display()))?;
    Ok(resumo(p, p.parent()))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn resume_e_marca() {
        let dir = std::env::temp_dir().join(format!("atelier-ck-{}", std::process::id()));
        std::fs::create_dir_all(dir.join("artefatos")).unwrap();
        let p = dir.join("artefatos").join("x.checklist.json");
        std::fs::write(
            &p,
            r#"{"titulo":"T","passos":[{"id":"a","titulo":"A"},{"id":"b","titulo":"B","depende_de":["a"]},{"id":"c","titulo":"C"}]}"#,
        )
        .unwrap();
        assert_eq!(achar(&dir), vec![p.clone()]);
        let r = resumo(&p, Some(&dir));
        assert_eq!(r["arquivo"], "artefatos/x.checklist.json");
        assert_eq!(r["feitos"], 0);
        let ids: Vec<_> = r["proximos_liberados"].as_array().unwrap().iter().map(|x| x["id"].as_str().unwrap().to_string()).collect();
        assert_eq!(ids, ["a", "c"]);

        let r = marcar(&p, "a", true, false, Some("ok"), "Agente").unwrap();
        assert_eq!(r["feitos"], 1);
        let ids: Vec<_> = r["proximos_liberados"].as_array().unwrap().iter().map(|x| x["id"].as_str().unwrap().to_string()).collect();
        assert_eq!(ids, ["b", "c"]);
        let v = ler(&p).unwrap();
        assert_eq!(v["estado"]["a"]["por"], "Agente");
        assert_eq!(v["estado"]["a"]["obs"], "ok");
        // a ordem das chaves do arquivo é mantida (passos antes de estado)
        let texto = std::fs::read_to_string(&p).unwrap();
        assert!(texto.find("\"passos\"").unwrap() < texto.find("\"estado\"").unwrap());

        marcar(&p, "a", false, false, None, "Agente").unwrap();
        assert!(!feito(&ler(&p).unwrap(), "a"));
        assert!(marcar(&p, "zz", true, false, None, "Agente").is_err());
        std::fs::remove_dir_all(&dir).ok();
    }
}
