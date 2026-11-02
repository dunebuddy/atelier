//! Hooks dos agentes: o próprio agente avisa o atelier quando começa a trabalhar, quando espera o usuário e quando
//! termina, para a tela acender o status de cada workspace. O hook é o `atelier-mcp hook <evento>` (o binário que já
//! está instalado): ele lê `ATELIER_SESSAO` (posto pelo terminal do atelier) e avisa a API; fora do atelier, não faz
//! nada. Instalar mexe na configuração do agente do usuário: junta com o que já existe, com backup, e sabe tirar.
//!
//! - Claude Code: `~/.claude/settings.json`, eventos UserPromptSubmit (trabalhando), Notification (esperando) e
//!   Stop (terminou);
//! - Codex: `~/.codex/config.toml`, `notify` (fim de turno = terminou). Se já houver outro `notify`, não troca.

use crate::db::{Erro, Res};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

const EVENTOS_CLAUDE: [(&str, &str); 3] = [("UserPromptSubmit", "trabalhando"), ("Notification", "esperando"), ("Stop", "terminou")];

fn casa() -> PathBuf {
    PathBuf::from(std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).unwrap_or_default())
}

fn arquivo(id: &str) -> Option<PathBuf> {
    match id {
        "claude-code" => Some(casa().join(".claude").join("settings.json")),
        "codex" => Some(std::env::var("CODEX_HOME").map(PathBuf::from).unwrap_or(casa().join(".codex")).join("config.toml")),
        _ => None,
    }
}

/// O comando do hook, com o caminho do `atelier-mcp` ao lado do app.
fn comando(evento: &str) -> String {
    format!("\"{}\" hook {evento}", crate::integracoes::caminho_servidor().display())
}

/// É um hook nosso? (o comando chama o atelier-mcp com "hook")
fn nosso(cmd: &str) -> bool {
    cmd.contains("atelier-mcp") && cmd.contains(" hook ")
}

fn ler_json(p: &Path) -> Res<Value> {
    match std::fs::read_to_string(p) {
        Err(_) => Ok(json!({})),
        Ok(s) if s.trim().is_empty() => Ok(json!({})),
        Ok(s) => serde_json::from_str(&s).map_err(|e| Erro::Invalido(format!("{} não é JSON válido ({e}): arrume ou mexa à mão", p.display()))),
    }
}

fn gravar(p: &Path, conteudo: &str) -> Res<()> {
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d).map_err(|e| Erro::Invalido(format!("não criei {d:?}: {e}")))?;
    }
    if p.exists() {
        let mut b = p.as_os_str().to_owned();
        b.push(".bak-atelier");
        std::fs::copy(p, PathBuf::from(b)).map_err(|e| Erro::Invalido(format!("não fiz backup de {p:?}: {e}")))?;
    }
    std::fs::write(p, conteudo).map_err(|e| Erro::Invalido(format!("não gravei {p:?}: {e}")))
}

/// Tira os hooks nossos de um evento do Claude Code (e os grupos que ficarem vazios).
fn sem_os_nossos(grupos: &Value) -> Vec<Value> {
    grupos
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|g| {
            let hooks: Vec<Value> = g["hooks"].as_array().into_iter().flatten().filter(|h| !nosso(h["command"].as_str().unwrap_or(""))).cloned().collect();
            if hooks.is_empty() {
                None
            } else {
                let mut g = g.clone();
                g["hooks"] = json!(hooks);
                Some(g)
            }
        })
        .collect()
}

fn instalado_claude(v: &Value) -> bool {
    EVENTOS_CLAUDE.iter().all(|(ev, _)| {
        v["hooks"][ev].as_array().into_iter().flatten().any(|g| g["hooks"].as_array().into_iter().flatten().any(|h| nosso(h["command"].as_str().unwrap_or(""))))
    })
}

fn notify_codex(s: &str) -> Option<&str> {
    // só o `notify` do topo (antes da primeira [tabela])
    s.lines().take_while(|l| !l.trim_start().starts_with('[')).find(|l| l.trim_start().starts_with("notify") && l.contains('='))
}

/// Situação dos hooks em cada agente que tem hook: `{ id, nome, instalado, arquivo, eventos, aviso? }`.
pub fn listar() -> Value {
    let mut v = vec![];
    if let Some(p) = arquivo("claude-code") {
        let inst = ler_json(&p).map(|j| instalado_claude(&j)).unwrap_or(false);
        v.push(json!({ "id": "claude-code", "nome": "Claude Code", "instalado": inst, "arquivo": p, "eventos": "começou, esperando você, terminou" }));
    }
    if let Some(p) = arquivo("codex") {
        let s = std::fs::read_to_string(&p).unwrap_or_default();
        let linha = notify_codex(&s);
        let inst = linha.is_some_and(nosso);
        let mut x = json!({ "id": "codex", "nome": "Codex", "instalado": inst, "arquivo": p, "eventos": "terminou" });
        if linha.is_some() && !inst {
            x["aviso"] = json!("o Codex já tem outro `notify` configurado; o atelier não troca");
        }
        v.push(x);
    }
    json!(v)
}

/// Instala ou tira os hooks de um agente.
pub fn aplicar(id: &str, instalar: bool) -> Res<Value> {
    let p = arquivo(id).ok_or_else(|| Erro::Invalido(format!("o agente \"{id}\" não tem hook que o atelier saiba instalar")))?;
    match id {
        "claude-code" => {
            let mut v = ler_json(&p)?;
            if !v.is_object() {
                return Err(Erro::Invalido(format!("{} não é um objeto JSON", p.display())));
            }
            if !v["hooks"].is_object() {
                v["hooks"] = json!({});
            }
            for (ev, estado) in EVENTOS_CLAUDE {
                let mut grupos = sem_os_nossos(&v["hooks"][ev]);
                if instalar {
                    grupos.push(json!({ "hooks": [{ "type": "command", "command": comando(estado), "timeout": 5 }] }));
                }
                if grupos.is_empty() {
                    v["hooks"].as_object_mut().map(|h| h.remove(ev));
                } else {
                    v["hooks"][ev] = json!(grupos);
                }
            }
            if v["hooks"].as_object().is_some_and(|h| h.is_empty()) {
                v.as_object_mut().map(|o| o.remove("hooks"));
            }
            gravar(&p, &(serde_json::to_string_pretty(&v).unwrap_or_default() + "\n"))?;
        }
        "codex" => {
            let s = std::fs::read_to_string(&p).unwrap_or_default();
            if let Some(l) = notify_codex(&s) {
                if !nosso(l) {
                    return Err(Erro::Invalido("o Codex já tem outro `notify` configurado; tire ou junte à mão".into()));
                }
            }
            let mut linhas: Vec<String> = s.lines().filter(|l| !(l.trim_start().starts_with("notify") && nosso(l))).map(String::from).collect();
            if instalar {
                let exe = crate::integracoes::caminho_servidor().display().to_string().replace('\\', "\\\\");
                linhas.insert(0, format!("notify = [\"{exe}\", \"hook\", \"terminou\"]"));
            }
            gravar(&p, &(linhas.join("\n") + "\n"))?;
        }
        _ => unreachable!(),
    }
    Ok(json!({ "ok": true, "arquivo": p }))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn junta_com_os_hooks_do_usuario_e_tira_so_os_nossos() {
        let mut v = json!({ "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "echo meu" }] }] }, "outra": 1 });
        for (ev, estado) in EVENTOS_CLAUDE {
            let mut g = sem_os_nossos(&v["hooks"][ev]);
            g.push(json!({ "hooks": [{ "type": "command", "command": comando(estado) }] }));
            v["hooks"][ev] = json!(g);
        }
        assert!(instalado_claude(&v));
        assert_eq!(v["hooks"]["Stop"].as_array().unwrap().len(), 2);
        let sobra = sem_os_nossos(&v["hooks"]["Stop"]);
        assert_eq!(sobra.len(), 1);
        assert_eq!(sobra[0]["hooks"][0]["command"], "echo meu");
    }
}
