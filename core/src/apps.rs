//! Agentes com janela própria (apps desktop) que o atelier abre numa pasta, como faz com o Explorer: o app sai fora
//! do atelier, já na pasta do workspace. Só no Windows; os que não estão instalados não aparecem.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};

struct App {
    id: &'static str,
    nome: &'static str,
}

const APPS: &[App] = &[
    App { id: "claude", nome: "Claude (app)" },
    App { id: "codex", nome: "ChatGPT / Codex" },
    App { id: "deepseek", nome: "DeepSeek Harness" },
];

fn local(rel: &str) -> Option<PathBuf> {
    let p = PathBuf::from(std::env::var_os("LOCALAPPDATA")?).join(rel);
    p.exists().then_some(p)
}

/// O executável (ou o protocolo, no DeepSeek) que abre o app, se ele está instalado.
fn alvo(id: &str) -> Option<PathBuf> {
    if !cfg!(windows) {
        return None;
    }
    match id {
        // o mesmo "Open in Claude Code" que o instalador do Claude põe no menu do Explorer
        "claude" => local(r"AnthropicClaude\claude.exe"),
        // o app da Microsoft Store (ChatGPT e Codex viraram um só) expõe este apelido
        "codex" => local(r"Microsoft\WindowsApps\chatgpt-desktop.exe"),
        "deepseek" => tem_protocolo("dsh").then(|| PathBuf::from("dsh://open")),
        _ => None,
    }
}

#[cfg(windows)]
fn tem_protocolo(nome: &str) -> bool {
    use windows::core::HSTRING;
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CLASSES_ROOT, RRF_RT_ANY};
    let mut tam = 0u32;
    unsafe { RegGetValueW(HKEY_CLASSES_ROOT, &HSTRING::from(nome), &HSTRING::from("URL Protocol"), RRF_RT_ANY, None, None, Some(&mut tam)).is_ok() }
}

#[cfg(not(windows))]
fn tem_protocolo(_: &str) -> bool {
    false
}

/// Os apps instalados: `{ id, nome, pasta }`; `pasta: false` quando o app não aceita abrir numa pasta (abre a janela
/// e a pessoa escolhe a pasta lá dentro).
pub fn listar() -> Vec<Value> {
    APPS.iter()
        .filter(|a| alvo(a.id).is_some())
        .map(|a| json!({ "id": a.id, "nome": a.nome, "pasta": a.id != "deepseek" }))
        .collect()
}

/// Abre o app na pasta. Devolve se a pasta foi junto (no DeepSeek não vai: não há argumento para isso).
pub fn abrir(id: &str, pasta: &Path) -> Result<bool, String> {
    use std::process::Command;
    let exe = alvo(id).ok_or_else(|| format!("o app \"{id}\" não está instalado"))?;
    let mut c = match id {
        "claude" => {
            let mut c = Command::new(&exe);
            c.arg("--os-entry=folder_verb").arg(pasta);
            c
        }
        "codex" => {
            let mut c = Command::new(&exe);
            c.arg("--open-project").arg(pasta);
            c
        }
        _ => {
            // protocolo: o Windows decide quem abre (sem passar pelo cmd, que estragaria o link)
            let mut c = Command::new("rundll32");
            c.arg("url.dll,FileProtocolHandler").arg(&exe);
            c
        }
    };
    c.current_dir(pasta);
    c.spawn().map_err(|e| e.to_string())?;
    Ok(id != "deepseek")
}
