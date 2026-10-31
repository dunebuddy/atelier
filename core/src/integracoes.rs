//! Integrações: instalar o servidor MCP do atelier (`atelier-mcp`) na configuração de usuário de cada agente.
//!
//! Caminhos e formatos levantados em 2026-10-30 (ver `docs/INTEGRACOES.md`). Regras:
//! - backup (`<arquivo>.bak-atelier`) antes de escrever; o resto do arquivo é preservado;
//! - arquivo com comentários (JSONC) não é reescrito: a tela mostra o trecho para colar à mão;
//! - Claude Code vai pela CLI dele (`claude mcp add`), porque o app reescreve o próprio `~/.claude.json`.
//!
//! `ATELIER_AGENTES_HOME` troca a home dos agentes (para testar sem mexer nas configs reais).

use crate::db::{Erro, Res};
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

const NOME: &str = "atelier";

#[derive(Clone, Copy, PartialEq)]
enum Formato {
    /// `{ "<chave>": { "atelier": { ... } } }`
    Json(&'static str),
    /// OpenCode: `{ "mcp": { "atelier": { "type": "local", "command": [..] } } }`
    OpenCode,
    /// Codex: `[mcp_servers.atelier]` em TOML
    Codex,
    /// sem escrita automática (YAML etc.): só mostra o trecho
    Manual,
}

struct Agente {
    id: &'static str,
    nome: &'static str,
    formato: Formato,
    /// arquivos candidatos; escreve nos que existem, ou no primeiro se nenhum existe
    arquivos: fn(&Lugares) -> Vec<PathBuf>,
    binarios: &'static [&'static str],
    /// campos extras da entrada, além de `command` e `args`
    extra: fn() -> Value,
    nota: &'static str,
    confirmado: bool,
}

struct Lugares {
    home: PathBuf,
    /// `%APPDATA%` no Windows, `~/.config` no Linux
    config: PathBuf,
}

fn lugares() -> Lugares {
    if let Ok(h) = std::env::var("ATELIER_AGENTES_HOME") {
        let home = PathBuf::from(h);
        let config = if cfg!(windows) { home.join("AppData").join("Roaming") } else { home.join(".config") };
        return Lugares { home, config };
    }
    Lugares {
        home: dirs::home_dir().unwrap_or_default(),
        config: dirs::config_dir().unwrap_or_default(),
    }
}

fn nada() -> Value {
    json!({})
}

fn agentes() -> Vec<Agente> {
    vec![
        Agente {
            id: "claude-code", nome: "Claude Code", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![l.home.join(".claude.json")],
            binarios: &["claude"], extra: || json!({ "type": "stdio" }),
            nota: "Instalado pelo comando `claude mcp add --scope user`. Abra uma sessão nova do Claude Code depois.",
            confirmado: true,
        },
        Agente {
            id: "claude-desktop", nome: "Claude Desktop", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![l.config.join("Claude").join("claude_desktop_config.json")],
            binarios: &[], extra: nada,
            nota: "Feche e abra o Claude Desktop para carregar.",
            confirmado: true,
        },
        Agente {
            id: "codex", nome: "Codex · ChatGPT desktop", formato: Formato::Codex,
            arquivos: |l| vec![std::env::var("CODEX_HOME").map(PathBuf::from).unwrap_or(l.home.join(".codex")).join("config.toml")],
            binarios: &["codex"], extra: nada,
            nota: "Uma configuração vale para o Codex CLI, a extensão de IDE e o ChatGPT desktop.",
            confirmado: true,
        },
        Agente {
            id: "gemini-cli", nome: "Gemini CLI", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![l.home.join(".gemini").join("settings.json")],
            binarios: &["gemini"], extra: nada, nota: "", confirmado: true,
        },
        Agente {
            id: "antigravity", nome: "Google Antigravity", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![
                l.home.join(".gemini").join("config").join("mcp_config.json"),
                l.home.join(".gemini").join("antigravity").join("mcp_config.json"),
            ],
            binarios: &["antigravity", "agy"], extra: nada,
            nota: "Vale para a IDE e o CLI `agy`. Também atualiza o arquivo antigo, se existir.",
            confirmado: true,
        },
        Agente {
            id: "opencode", nome: "OpenCode", formato: Formato::OpenCode,
            arquivos: |l| {
                let d = l.home.join(".config").join("opencode");
                vec![d.join("opencode.json"), d.join("opencode.jsonc")]
            },
            binarios: &["opencode"], extra: nada,
            nota: "No Windows o caminho segue a convenção XDG (não confirmado na documentação).",
            confirmado: true,
        },
        Agente {
            id: "kiro", nome: "Kiro (IDE e CLI)", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![std::env::var("KIRO_HOME").map(PathBuf::from).unwrap_or(l.home.join(".kiro")).join("settings").join("mcp.json")],
            binarios: &["kiro", "kiro-cli", "q"], extra: || json!({ "disabled": false }),
            nota: "Também atende quem migrou do Amazon Q Developer CLI.",
            confirmado: true,
        },
        Agente {
            id: "vscode", nome: "GitHub Copilot · VS Code", formato: Formato::Json("servers"),
            arquivos: |l| vec![l.config.join("Code").join("User").join("mcp.json")],
            binarios: &["code"], extra: || json!({ "type": "stdio" }), nota: "", confirmado: true,
        },
        Agente {
            id: "copilot-cli", nome: "GitHub Copilot CLI", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![std::env::var("COPILOT_HOME").map(PathBuf::from).unwrap_or(l.home.join(".copilot")).join("mcp-config.json")],
            binarios: &["copilot"], extra: || json!({ "type": "local", "tools": ["*"] }), nota: "", confirmado: true,
        },
        Agente {
            id: "cursor", nome: "Cursor", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![l.home.join(".cursor").join("mcp.json")],
            binarios: &["cursor", "cursor-agent"], extra: || json!({ "type": "stdio" }), nota: "", confirmado: true,
        },
        Agente {
            id: "windsurf", nome: "Windsurf", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![l.home.join(".codeium").join("windsurf").join("mcp_config.json")],
            binarios: &["windsurf"], extra: || json!({ "disabled": false }), nota: "", confirmado: true,
        },
        Agente {
            id: "devin", nome: "Devin (Desktop e CLI)", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![l.config.join("devin").join("mcp_config.json")],
            binarios: &["devin"], extra: || json!({ "disabled": false }), nota: "Sucessor do Windsurf.", confirmado: true,
        },
        Agente {
            id: "zed", nome: "Zed", formato: Formato::Json("context_servers"),
            arquivos: |l| vec![l.config.join(if cfg!(windows) { "Zed" } else { "zed" }).join("settings.json")],
            binarios: &["zed", "zeditor"], extra: nada,
            nota: "O settings.json do Zed costuma ter comentários; nesse caso o atelier mostra o trecho para colar.",
            confirmado: true,
        },
        Agente {
            id: "cline", nome: "Cline (VS Code)", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![l.config.join("Code").join("User").join("globalStorage").join("saoudrizwan.claude-dev").join("settings").join("cline_mcp_settings.json")],
            binarios: &["cline"], extra: || json!({ "disabled": false }), nota: "", confirmado: false,
        },
        Agente {
            id: "junie", nome: "JetBrains Junie", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![l.home.join(".junie").join("mcp").join("mcp.json")],
            binarios: &["junie"], extra: nada, nota: "", confirmado: true,
        },
        Agente {
            id: "pi", nome: "Pi", formato: Formato::Json("mcpServers"),
            arquivos: |l| vec![std::env::var("PI_CODING_AGENT_DIR").map(PathBuf::from).unwrap_or(l.home.join(".pi").join("agent")).join("mcp.json")],
            binarios: &["pi"], extra: || json!({ "type": "stdio", "enabled": true }),
            nota: "MCP nativo só nas versões novas do Pi (ou com a extensão pi-mcp-adapter). Formato não confirmado na documentação oficial.",
            confirmado: false,
        },
        Agente {
            id: "goose", nome: "Goose", formato: Formato::Manual,
            arquivos: |l| vec![if cfg!(windows) { l.config.join("Block").join("goose").join("config").join("config.yaml") } else { l.config.join("goose").join("config.yaml") }],
            binarios: &["goose"], extra: nada, nota: "Config em YAML: cole o trecho em `extensions:`.", confirmado: true,
        },
        Agente {
            id: "continue", nome: "Continue", formato: Formato::Manual,
            arquivos: |l| vec![l.home.join(".continue").join("config.yaml")],
            binarios: &["cn"], extra: nada, nota: "Config em YAML: cole o trecho na lista `mcpServers:`.", confirmado: false,
        },
    ]
}

/// Onde está o `atelier-mcp`: ao lado do executável do app.
pub fn caminho_servidor() -> PathBuf {
    let nome = if cfg!(windows) { "atelier-mcp.exe" } else { "atelier-mcp" };
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join(nome)))
        .unwrap_or_else(|| PathBuf::from(nome))
}

pub fn no_path(bin: &str) -> bool {
    let Some(path) = std::env::var_os("PATH") else { return false };
    let exts: Vec<String> = if cfg!(windows) {
        std::env::var("PATHEXT").unwrap_or(".EXE;.CMD;.BAT".into()).split(';').map(|e| e.to_lowercase()).collect()
    } else {
        vec![String::new()]
    };
    std::env::split_paths(&path).any(|d| exts.iter().any(|e| d.join(format!("{bin}{e}")).is_file()))
}

fn entrada(a: &Agente, cmd: &str) -> Value {
    match a.formato {
        Formato::OpenCode => json!({ "type": "local", "command": [cmd], "enabled": true }),
        _ => {
            let mut e = json!({ "command": cmd, "args": [] });
            if let (Some(obj), Value::Object(extra)) = (e.as_object_mut(), (a.extra)()) {
                obj.extend(extra);
            }
            e
        }
    }
}

/// O trecho que se cola à mão, no formato do agente.
fn trecho(a: &Agente, cmd: &str) -> String {
    match a.formato {
        Formato::Json(chave) => serde_json::to_string_pretty(&json!({ chave: { NOME: entrada(a, cmd) } })).unwrap_or_default(),
        Formato::OpenCode => serde_json::to_string_pretty(&json!({ "mcp": { NOME: entrada(a, cmd) } })).unwrap_or_default(),
        Formato::Codex => format!("[mcp_servers.{NOME}]\ncommand = '{cmd}'\nargs = []\n"),
        Formato::Manual if a.id == "goose" => format!(
            "extensions:\n  {NOME}:\n    name: {NOME}\n    type: stdio\n    cmd: '{cmd}'\n    args: []\n    enabled: true\n    timeout: 300\n"
        ),
        Formato::Manual => format!("mcpServers:\n  - name: {NOME}\n    type: stdio\n    command: '{cmd}'\n"),
    }
}

enum Leitura {
    Ausente,
    Json(Value),
    ComComentarios,
    Invalido(String),
}

fn ler_json(p: &Path) -> Leitura {
    let Ok(s) = std::fs::read_to_string(p) else { return Leitura::Ausente };
    if s.trim().is_empty() {
        return Leitura::Json(json!({}));
    }
    match serde_json::from_str::<Value>(&s) {
        Ok(v) => Leitura::Json(v),
        Err(e) => {
            if serde_json::from_str::<Value>(&sem_comentarios(&s)).is_ok() {
                Leitura::ComComentarios
            } else {
                Leitura::Invalido(e.to_string())
            }
        }
    }
}

/// Tira comentários `//` e `/* */` e vírgulas finais, só para saber se é JSONC válido.
fn sem_comentarios(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut it = s.chars().peekable();
    let mut em_texto = false;
    while let Some(c) = it.next() {
        if em_texto {
            out.push(c);
            if c == '\\' {
                if let Some(n) = it.next() {
                    out.push(n);
                }
            } else if c == '"' {
                em_texto = false;
            }
            continue;
        }
        match (c, it.peek()) {
            ('"', _) => { em_texto = true; out.push(c); }
            ('/', Some('/')) => { while let Some(n) = it.next() { if n == '\n' { out.push('\n'); break; } } }
            ('/', Some('*')) => { it.next(); let mut ant = ' '; for n in it.by_ref() { if ant == '*' && n == '/' { break; } ant = n; } }
            _ => out.push(c),
        }
    }
    // vírgula antes de } ou ]
    let mut limpo = String::with_capacity(out.len());
    let cs: Vec<char> = out.chars().collect();
    for (i, c) in cs.iter().enumerate() {
        if *c == ',' {
            let prox = cs[i + 1..].iter().find(|x| !x.is_whitespace());
            if matches!(prox, Some('}') | Some(']')) {
                continue;
            }
        }
        limpo.push(*c);
    }
    limpo
}

fn chave_de(a: &Agente) -> &'static str {
    match a.formato {
        Formato::Json(k) => k,
        Formato::OpenCode => "mcp",
        _ => "",
    }
}

/// Situação num arquivo: Some(comando instalado) / None / erro de leitura
fn situacao_arquivo(a: &Agente, p: &Path) -> Result<Option<String>, String> {
    match a.formato {
        Formato::Codex => {
            let Ok(s) = std::fs::read_to_string(p) else { return Ok(None) };
            let doc: toml_edit::DocumentMut = s.parse().map_err(|e: toml_edit::TomlError| e.to_string())?;
            Ok(doc.get("mcp_servers").and_then(|t| t.get(NOME)).and_then(|t| t.get("command")).and_then(|c| c.as_str()).map(String::from))
        }
        Formato::Manual => {
            let s = std::fs::read_to_string(p).unwrap_or_default();
            Ok(s.contains("atelier-mcp").then(|| "(no arquivo)".to_string()))
        }
        _ => match ler_json(p) {
            Leitura::Ausente => Ok(None),
            Leitura::Json(v) => {
                let e = &v[chave_de(a)][NOME];
                Ok(match &e["command"] {
                    Value::String(s) => Some(s.clone()),
                    Value::Array(l) => l.first().and_then(|x| x.as_str()).map(String::from),
                    _ => None,
                })
            }
            Leitura::ComComentarios => {
                let s = std::fs::read_to_string(p).unwrap_or_default();
                Ok(s.contains("atelier-mcp").then(|| "(no arquivo com comentários)".to_string()))
            }
            Leitura::Invalido(e) => Err(format!("arquivo inválido: {e}")),
        },
    }
}

fn alvos(a: &Agente, l: &Lugares) -> Vec<PathBuf> {
    let todos = (a.arquivos)(l);
    let existentes: Vec<PathBuf> = todos.iter().filter(|p| p.exists()).cloned().collect();
    if existentes.is_empty() { todos.into_iter().take(1).collect() } else { existentes }
}

fn usa_cli(a: &Agente) -> bool {
    a.id == "claude-code" && std::env::var("ATELIER_AGENTES_HOME").is_err() && no_path("claude")
}

pub fn listar() -> Value {
    let l = lugares();
    let servidor = caminho_servidor();
    let cmd = servidor.to_string_lossy().to_string();
    let lista: Vec<Value> = agentes()
        .iter()
        .map(|a| {
            let arquivos = alvos(a, &l);
            let pasta_existe = (a.arquivos)(&l).iter().any(|p| p.exists() || p.parent().is_some_and(|d| d.exists()));
            let detectado = pasta_existe || a.binarios.iter().any(|b| no_path(b));
            let mut instalado: Option<String> = None;
            let mut erro: Option<String> = None;
            let mut comentarios = false;
            for p in &arquivos {
                match situacao_arquivo(a, p) {
                    Ok(Some(c)) => {
                        if c.contains("comentários") {
                            comentarios = true;
                        }
                        instalado = Some(c);
                    }
                    Ok(None) => {}
                    Err(e) => erro = Some(e),
                }
                if !comentarios && matches!(a.formato, Formato::Json(_) | Formato::OpenCode) {
                    comentarios = matches!(ler_json(p), Leitura::ComComentarios);
                }
            }
            let situacao = match (&instalado, a.formato) {
                (Some(c), _) if c == &cmd => "instalado",
                (Some(c), _) if c.starts_with('(') => "instalado",
                (Some(_), _) => "desatualizado",
                (None, Formato::Manual) => "manual",
                (None, _) if comentarios => "manual",
                (None, _) if detectado => "disponivel",
                (None, _) => "ausente",
            };
            json!({
                "id": a.id,
                "nome": a.nome,
                "situacao": situacao,
                "detectado": detectado,
                "arquivos": arquivos,
                "trecho": trecho(a, &cmd),
                "nota": a.nota,
                "confirmado": a.confirmado,
                "automatico": !matches!(a.formato, Formato::Manual) && !comentarios,
                "via_cli": usa_cli(a),
                "erro": erro,
            })
        })
        .collect();
    json!({ "servidor": servidor, "servidor_existe": servidor.exists(), "agentes": lista })
}

fn backup(p: &Path) -> Res<()> {
    if p.exists() {
        let mut b = p.as_os_str().to_owned();
        b.push(".bak-atelier");
        std::fs::copy(p, PathBuf::from(b)).map_err(|e| Erro::Invalido(format!("não fiz backup de {p:?}: {e}")))?;
    }
    Ok(())
}

fn gravar(p: &Path, conteudo: &str) -> Res<()> {
    if let Some(d) = p.parent() {
        std::fs::create_dir_all(d).map_err(|e| Erro::Invalido(format!("não criei {d:?}: {e}")))?;
    }
    backup(p)?;
    std::fs::write(p, conteudo).map_err(|e| Erro::Invalido(format!("não gravei {p:?}: {e}")))
}

fn rodar_cli(args: &[&str]) -> Res<()> {
    let mut c = if cfg!(windows) {
        let mut c = std::process::Command::new("cmd");
        c.arg("/C").arg("claude");
        c
    } else {
        std::process::Command::new("claude")
    };
    c.args(args);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let saida = c.output().map_err(|e| Erro::Invalido(format!("não rodei o claude: {e}")))?;
    if !saida.status.success() {
        let msg = String::from_utf8_lossy(&saida.stderr).trim().to_string();
        // remover algo que não existe não é erro
        if !msg.to_lowercase().contains("no mcp server") && !msg.to_lowercase().contains("not found") {
            return Err(Erro::Invalido(format!("claude mcp falhou: {msg}")));
        }
    }
    Ok(())
}

/// Instala (`instalar = true`) ou remove o atelier do agente.
pub fn aplicar(id: &str, instalar: bool) -> Res<Value> {
    let lista = agentes();
    let a = lista.iter().find(|a| a.id == id).ok_or(Erro::NaoEncontrado(format!("agente {id}")))?;
    let servidor = caminho_servidor();
    let cmd = servidor.to_string_lossy().to_string();
    if instalar && !servidor.exists() {
        return Err(Erro::Invalido(format!("não achei o servidor MCP em {servidor:?} (rode `cargo build -p atelier-mcp`)")));
    }
    if usa_cli(a) {
        rodar_cli(&["mcp", "remove", NOME, "-s", "user"])?;
        if instalar {
            rodar_cli(&["mcp", "add", "--transport", "stdio", "--scope", "user", NOME, "--", &cmd])?;
        }
        return Ok(json!({ "ok": true }));
    }
    let l = lugares();
    for p in alvos(a, &l) {
        match a.formato {
            Formato::Manual => return Err(Erro::Invalido("este agente é configurado à mão: copie o trecho".into())),
            Formato::Codex => {
                let s = std::fs::read_to_string(&p).unwrap_or_default();
                let mut doc: toml_edit::DocumentMut = s.parse().map_err(|e: toml_edit::TomlError| Erro::Invalido(format!("{p:?} inválido: {e}")))?;
                if instalar {
                    if !doc.contains_key("mcp_servers") {
                        let mut t = toml_edit::Table::new();
                        t.set_implicit(true);
                        doc.insert("mcp_servers", toml_edit::Item::Table(t));
                    }
                    let mut t = toml_edit::Table::new();
                    t.insert("command", toml_edit::value(cmd.clone()));
                    t.insert("args", toml_edit::value(toml_edit::Array::new()));
                    doc["mcp_servers"][NOME] = toml_edit::Item::Table(t);
                } else if let Some(t) = doc.get_mut("mcp_servers").and_then(|t| t.as_table_like_mut()) {
                    t.remove(NOME);
                } else {
                    continue;
                }
                gravar(&p, &doc.to_string())?;
            }
            Formato::Json(_) | Formato::OpenCode => {
                let mut v = match ler_json(&p) {
                    Leitura::Ausente if !instalar => continue,
                    Leitura::Ausente => json!({}),
                    Leitura::Json(v) => v,
                    Leitura::ComComentarios => {
                        return Err(Erro::Invalido(format!("{p:?} tem comentários; para não perdê-los, cole o trecho à mão")));
                    }
                    Leitura::Invalido(e) => return Err(Erro::Invalido(format!("{p:?} inválido: {e}"))),
                };
                let raiz = v.as_object_mut().ok_or(Erro::Invalido(format!("{p:?} não é um objeto JSON")))?;
                if a.formato == Formato::OpenCode && !raiz.contains_key("$schema") && instalar {
                    raiz.insert("$schema".into(), json!("https://opencode.ai/config.json"));
                }
                let chave = chave_de(a);
                let sec = raiz.entry(chave).or_insert_with(|| Value::Object(Map::new()));
                let sec = sec.as_object_mut().ok_or(Erro::Invalido(format!("\"{chave}\" não é um objeto em {p:?}")))?;
                if instalar {
                    sec.insert(NOME.into(), entrada(a, &cmd));
                } else if sec.remove(NOME).is_none() {
                    continue;
                }
                let texto = serde_json::to_string_pretty(&v).map_err(|e| Erro::Invalido(e.to_string()))?;
                gravar(&p, &(texto + "\n"))?;
            }
        }
    }
    Ok(json!({ "ok": true }))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn jsonc_e_detectado() {
        assert!(serde_json::from_str::<Value>(&sem_comentarios("{\n // oi\n \"a\": \"x//y\", /* b */ \"c\": [1,2,],\n}")).is_ok());
    }

    #[test]
    fn trechos_tem_o_comando() {
        for a in agentes() {
            assert!(trecho(&a, "/x/atelier-mcp").contains("/x/atelier-mcp"), "{}", a.id);
        }
    }
}
