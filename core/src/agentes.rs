//! Agentes de linha de comando que o atelier abre no terminal e chama sem terminal (Executor e `/prompt`).
//!
//! A lista é a mesma da tela de Integrações (o id é o da integração). Só entra em uso o agente que tem o MCP do
//! atelier instalado: sem ele, o agente não enxerga a bancada. Cada uso (Terminal, Executor, Prompt) é ligado à mão
//! nas Configurações e vem desligado.

use crate::bancada::Preferencias;
use crate::db::{Erro, Res};
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::{Duration, Instant};

pub struct Cli {
    /// id da integração (tela de Integrações)
    pub id: &'static str,
    pub nome: &'static str,
    /// executáveis candidatos, na ordem
    pub bins: &'static [&'static str],
    /// argumentos do modo não interativo. `{prompt}` vira o pedido; sem `{prompt}`, o pedido vai pela entrada padrão.
    /// Vazio = o agente não tem modo não interativo conhecido (só terminal).
    pub exec: &'static str,
    /// argumentos para o Comando do app (o agente pode usar todo o MCP do atelier). Vazio = os mesmos do `exec`.
    pub comando: &'static str,
}

pub const CLIS: &[Cli] = &[
    Cli {
        id: "claude-code", nome: "Claude Code", bins: &["claude"],
        exec: "-p --allowedTools mcp__atelier__esquema,mcp__atelier__buscar,mcp__atelier__ler_item,mcp__atelier__linha_do_tempo",
        comando: "-p --allowedTools mcp__atelier",
    },
    Cli { id: "codex", nome: "Codex", bins: &["codex"], exec: "exec --skip-git-repo-check -", comando: "" },
    Cli { id: "gemini-cli", nome: "Gemini CLI", bins: &["gemini"], exec: "-p {prompt}", comando: "--yolo -p {prompt}" },
    Cli { id: "antigravity", nome: "Antigravity CLI", bins: &["agy"], exec: "", comando: "" },
    Cli { id: "opencode", nome: "OpenCode", bins: &["opencode"], exec: "run {prompt}", comando: "" },
    Cli { id: "kiro", nome: "Kiro CLI", bins: &["kiro-cli"], exec: "chat --no-interactive {prompt}", comando: "chat --no-interactive --trust-all-tools {prompt}" },
    Cli { id: "copilot-cli", nome: "Copilot CLI", bins: &["copilot"], exec: "-p {prompt}", comando: "--allow-all-tools -p {prompt}" },
    Cli { id: "cursor", nome: "Cursor Agent", bins: &["cursor-agent"], exec: "-p {prompt}", comando: "" },
    Cli { id: "pi", nome: "Pi", bins: &["pi"], exec: "-p {prompt}", comando: "" },
];

pub fn cli(id: &str) -> Option<&'static Cli> {
    CLIS.iter().find(|c| c.id == id)
}

/// Caminho completo do executável (PATH + PATHEXT no Windows).
pub fn onde(bin: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    let exts: Vec<String> = if cfg!(windows) {
        std::env::var("PATHEXT").unwrap_or(".EXE;.CMD;.BAT".into()).split(';').map(|e| e.to_lowercase()).collect()
    } else {
        vec![String::new()]
    };
    std::env::split_paths(&path).find_map(|d| exts.iter().map(|e| d.join(format!("{bin}{e}"))).find(|p| p.is_file()))
}

pub fn executavel(c: &Cli) -> Option<PathBuf> {
    c.bins.iter().find_map(|b| onde(b))
}

/// Situação do MCP do atelier em cada integração ("instalado", "desatualizado"...), vinda da tela de Integrações.
fn mcp_por_id() -> std::collections::HashMap<String, String> {
    let l = crate::integracoes::listar();
    l["agentes"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|a| Some((a["id"].as_str()?.to_string(), a["situacao"].as_str()?.to_string())))
        .collect()
}

/// Cada agente com executável, MCP e os usos ligados.
pub fn listar(prefs: &Preferencias) -> Vec<Value> {
    let mcp = mcp_por_id();
    CLIS.iter()
        .map(|c| {
            let exe = executavel(c);
            let situacao = mcp.get(c.id).cloned().unwrap_or_default();
            let com_mcp = situacao == "instalado" || situacao == "desatualizado";
            let uso = prefs.agentes.get(c.id).cloned().unwrap_or_default();
            json!({
                "id": c.id,
                "nome": c.nome,
                "executavel": exe,
                "detectado": exe.is_some(),
                "mcp": com_mcp,
                "exec_padrao": c.exec,
                "exec": uso.exec.clone().filter(|s| !s.trim().is_empty()).unwrap_or(c.exec.to_string()),
                "terminal": uso.terminal && com_mcp && exe.is_some(),
                "executor": uso.executor && com_mcp && exe.is_some(),
                "prompt": uso.prompt && com_mcp && exe.is_some(),
                "comando": uso.comando && com_mcp && exe.is_some(),
            })
        })
        .collect()
}

/// Liga para uso: tem de estar instalado e com o MCP.
pub fn habilitado(prefs: &Preferencias, id: &str, uso: &str) -> Res<(&'static Cli, PathBuf, String)> {
    let c = cli(id).ok_or(Erro::Invalido(format!("agente desconhecido: {id}")))?;
    let a = listar(prefs).into_iter().find(|a| a["id"] == id).unwrap_or_default();
    if a[uso] != true {
        return Err(Erro::Invalido(format!("{} não está ligado para {uso} (Configurações → Integrações)", c.nome)));
    }
    let exe = executavel(c).ok_or(Erro::Invalido(format!("{} não foi encontrado nesta máquina", c.nome)))?;
    let modelo = if uso == "comando" && !c.comando.is_empty() { c.comando } else { a["exec"].as_str().unwrap_or("") };
    Ok((c, exe, modelo.to_string()))
}

/// `<agente> --version`, com prazo: confirma que o executável responde.
pub fn testar(id: &str) -> Value {
    let Some(c) = cli(id) else { return json!({ "ok": false, "erro": "agente desconhecido" }) };
    let Some(exe) = executavel(c) else { return json!({ "ok": false, "erro": "não encontrado no PATH" }) };
    let mut cmd = std::process::Command::new(&exe);
    cmd.arg("--version").stdin(std::process::Stdio::null()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    sem_janela(&mut cmd);
    let mut filho = match cmd.spawn() {
        Ok(f) => f,
        Err(e) => return json!({ "ok": false, "erro": e.to_string() }),
    };
    let inicio = Instant::now();
    loop {
        match filho.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if inicio.elapsed() > Duration::from_secs(20) => {
                let _ = filho.kill();
                return json!({ "ok": false, "erro": "não respondeu em 20 s" });
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(100)),
            Err(e) => return json!({ "ok": false, "erro": e.to_string() }),
        }
    }
    match filho.wait_with_output() {
        Ok(o) => {
            let texto = String::from_utf8_lossy(if o.stdout.is_empty() { &o.stderr } else { &o.stdout }).trim().to_string();
            let versao = texto.lines().next().unwrap_or("").chars().take(80).collect::<String>();
            json!({ "ok": o.status.success(), "versao": versao, "erro": (!o.status.success()).then_some(texto) })
        }
        Err(e) => json!({ "ok": false, "erro": e.to_string() }),
    }
}

fn sem_janela(_c: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        _c.creation_flags(0x0800_0000);
    }
}

/// Monta os argumentos a partir do modelo (`{prompt}` vira o pedido). Devolve também se o pedido vai pela entrada.
pub fn argumentos(modelo: &str, prompt: &str) -> (Vec<String>, bool) {
    let mut usou = false;
    let args = modelo
        .split_whitespace()
        .map(|t| {
            if t.contains("{prompt}") {
                usou = true;
                t.replace("{prompt}", prompt)
            } else {
                t.to_string()
            }
        })
        .collect();
    (args, !usou)
}

/// Chama o agente sem terminal e devolve o que ele escreveu. Se quem pediu desistir (a requisição cai), o processo
/// morre junto (`kill_on_drop`).
pub async fn executar(exe: PathBuf, modelo: &str, prompt: &str, cwd: Option<PathBuf>, prazo: Duration) -> Res<Value> {
    use tokio::io::AsyncWriteExt;
    if modelo.trim().is_empty() {
        return Err(Erro::Invalido("este agente não tem modo de execução sem terminal configurado".into()));
    }
    let (args, pela_entrada) = argumentos(modelo, prompt);
    let mut cmd = tokio::process::Command::new(&exe);
    cmd.args(&args)
        .stdin(if pela_entrada { std::process::Stdio::piped() } else { std::process::Stdio::null() })
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);
    if let Some(d) = cwd.filter(|d| d.is_dir()) {
        cmd.current_dir(d);
    }
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000);
    let inicio = Instant::now();
    let mut filho = cmd.spawn().map_err(|e| Erro::Invalido(format!("não iniciei {exe:?}: {e}")))?;
    if pela_entrada {
        if let Some(mut e) = filho.stdin.take() {
            e.write_all(prompt.as_bytes()).await.map_err(|e| Erro::Invalido(e.to_string()))?;
        }
    }
    let saida = tokio::time::timeout(prazo, filho.wait_with_output())
        .await
        .map_err(|_| Erro::Invalido(format!("o agente não terminou em {} s", prazo.as_secs())))?
        .map_err(|e| Erro::Invalido(e.to_string()))?;
    let texto = String::from_utf8_lossy(&saida.stdout).trim().to_string();
    let erro = String::from_utf8_lossy(&saida.stderr).trim().to_string();
    if !saida.status.success() && texto.is_empty() {
        return Err(Erro::Invalido(format!("o agente falhou: {}", erro.lines().last().unwrap_or("sem mensagem"))));
    }
    Ok(json!({ "saida": texto, "codigo": saida.status.code(), "segundos": inicio.elapsed().as_secs() }))
}

/// Shells do terminal embutido: (id, nome, programa).
pub fn shells() -> Vec<(String, String, PathBuf)> {
    let mut v: Vec<(String, String, PathBuf)> = vec![];
    let mut por = |id: &str, nome: &str, p: Option<PathBuf>| {
        if let Some(p) = p {
            v.push((id.into(), nome.into(), p));
        }
    };
    if cfg!(windows) {
        por("pwsh", "PowerShell 7", onde("pwsh"));
        por("powershell", "Windows PowerShell", onde("powershell"));
        por("cmd", "Prompt de comando", onde("cmd"));
        por("wsl", "WSL", onde("wsl"));
        let git = [r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files (x86)\Git\bin\bash.exe"]
            .iter()
            .map(PathBuf::from)
            .find(|p| p.is_file());
        por("gitbash", "Git Bash", git);
    } else {
        let padrao = std::env::var("SHELL").ok().map(PathBuf::from).filter(|p| p.is_file());
        if let Some(p) = &padrao {
            let nome = p.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or("shell".into());
            por(&nome, &nome, Some(p.clone()));
        }
        for s in ["bash", "zsh", "fish", "sh"] {
            por(s, s, onde(s));
        }
    }
    // o shell padrão do Linux pode repetir um da lista
    let mut vistos = std::collections::HashSet::new();
    v.retain(|(id, ..)| vistos.insert(id.clone()));
    v
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn prompt_vai_no_argumento_ou_na_entrada() {
        let (a, entrada) = argumentos("-p {prompt}", "escreva & cia");
        assert_eq!(a, ["-p", "escreva & cia"]);
        assert!(!entrada);
        let (a, entrada) = argumentos("exec --skip-git-repo-check -", "x");
        assert_eq!(a, ["exec", "--skip-git-repo-check", "-"]);
        assert!(entrada);
    }

    #[test]
    fn uso_desligado_por_padrao() {
        let p = Preferencias::default();
        assert!(listar(&p).iter().all(|a| a["terminal"] == false && a["executor"] == false && a["prompt"] == false && a["comando"] == false));
        assert!(habilitado(&p, "claude-code", "prompt").is_err());
    }
}
