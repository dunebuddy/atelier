//! Terminal embutido: um shell de verdade (ConPTY no Windows, PTY no Linux) ligado à tela por websocket.
//! Serve para rodar os agentes (claude, codex...) na pasta do item, com a assinatura do próprio usuário.
//!
//! Segurança: só aceita conexão vinda da janela do atelier (cabeçalho Origin) e só roda o shell ou um agente da
//! lista abaixo; nada de comando livre pela URL.

use axum::{
    extract::{ws::{Message, WebSocket, WebSocketUpgrade}, Query},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use futures_util::{SinkExt, StreamExt};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};


pub const ORIGENS: &[&str] = &["http://localhost:1420", "http://tauri.localhost", "tauri://localhost"];

/// A tela do app, ou a do teste sem janela (`ATELIER_ORIGEM`, o Vite de teste em outra porta).
pub fn origem_permitida(o: &str) -> bool {
    ORIGENS.contains(&o) || std::env::var("ATELIER_ORIGEM").is_ok_and(|x| x == o)
}

/// O que o botão de terminal oferece: os shells da máquina e os agentes ligados como "Terminal" (com o MCP).
pub async fn programas() -> Json<Value> {
    let prefs = crate::bancada::carregar().preferencias;
    let r = tokio::task::spawn_blocking(move || {
        let agentes: Vec<Value> = crate::agentes::listar(&prefs)
            .into_iter()
            .filter(|a| a["terminal"] == true)
            .map(|a| json!({ "id": a["id"], "nome": a["nome"], "comando": a["executavel"], "instalado": true }))
            .collect();
        let shells: Vec<Value> = crate::agentes::shells().into_iter().map(|(id, nome, _)| json!({ "id": id, "nome": nome })).collect();
        json!({ "shell": shell().0, "shells": shells, "agentes": agentes })
    })
    .await
    .unwrap_or_default();
    Json(r)
}

fn shell() -> (String, bool) {
    if cfg!(windows) {
        let pwsh = crate::integracoes::no_path("pwsh");
        (if pwsh { "pwsh".into() } else { "powershell".into() }, true)
    } else {
        (std::env::var("SHELL").unwrap_or_else(|_| "bash".into()), false)
    }
}

/// `GET /api/terminal?cwd=<pasta>&programa=<id do agente ou vazio>&shell=<id>&cols=&rows=` (websocket)
pub async fn terminal(ws: WebSocketUpgrade, headers: HeaderMap, Query(q): Query<HashMap<String, String>>) -> Response {
    let origem = headers.get("origin").and_then(|v| v.to_str().ok()).unwrap_or("");
    if !origem_permitida(origem) {
        return (StatusCode::FORBIDDEN, "origem não permitida").into_response();
    }
    let programa = q.get("programa").cloned().unwrap_or_default();
    // agente: só os ligados como Terminal nas Configurações; shell: só os da lista
    let agente = if programa.is_empty() {
        None
    } else {
        let prefs = crate::bancada::carregar().preferencias;
        let p = programa.clone();
        match tokio::task::spawn_blocking(move || crate::agentes::habilitado(&prefs, &p, "terminal")).await {
            Ok(Ok((_, exe, _))) => Some(exe),
            _ => return (StatusCode::BAD_REQUEST, "agente não ligado como terminal").into_response(),
        }
    };
    let escolhido = match q.get("shell").filter(|s| !s.is_empty()) {
        Some(s) => match crate::agentes::shells().into_iter().find(|(id, ..)| id == s) {
            Some((_, _, p)) => Some(p),
            None => return (StatusCode::BAD_REQUEST, "shell desconhecido").into_response(),
        },
        None => None,
    };
    let cwd = q.get("cwd").cloned().filter(|c| std::path::Path::new(c).is_dir());
    let cols = q.get("cols").and_then(|v| v.parse().ok()).unwrap_or(100);
    let rows = q.get("rows").and_then(|v| v.parse().ok()).unwrap_or(30);
    // número da sessão que a tela deu: a barra de status soma a memória por workspace
    let num: Option<u64> = q.get("sessao").and_then(|v| v.parse().ok());
    ws.on_upgrade(move |s| sessao(s, num, agente, escolhido, cwd, cols, rows))
}

async fn sessao(socket: WebSocket, num: Option<u64>, agente: Option<std::path::PathBuf>, escolhido: Option<std::path::PathBuf>, cwd: Option<String>, cols: u16, rows: u16) {
    let (mut saida, mut entrada) = socket.split();
    let par = match native_pty_system().openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 }) {
        Ok(p) => p,
        Err(e) => {
            let _ = saida.send(Message::Text(format!("\r\nnão abri o terminal: {e}\r\n").into())).await;
            return;
        }
    };
    let (sh, windows) = shell();
    // shell escolhido no botão de terminal: roda ele direto
    let sh = match (&escolhido, &agente) {
        (Some(p), None) => p.to_string_lossy().to_string(),
        _ => sh,
    };
    let mut cmd = CommandBuilder::new(&sh);
    let nome_sh = std::path::Path::new(&sh).file_stem().map(|s| s.to_string_lossy().to_lowercase()).unwrap_or_default();
    if let Some(a) = &agente {
        let a = a.to_string_lossy().replace('\'', "''");
        if windows {
            cmd.args(["-NoLogo", "-NoExit", "-Command", &format!("& '{a}'")]);
        } else {
            // roda o agente e, quando ele sair, fica no shell
            cmd.args(["-lc", &format!("'{a}'; exec {sh}")]);
        }
    } else if nome_sh == "pwsh" || nome_sh == "powershell" {
        cmd.arg("-NoLogo");
    } else if nome_sh == "bash" && windows {
        cmd.args(["--login", "-i"]);
    } else if !windows && escolhido.is_none() {
        cmd.arg("-l");
    }
    if let Some(c) = &cwd {
        cmd.cwd(c);
    }
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    let mut filho = match par.slave.spawn_command(cmd) {
        Ok(f) => f,
        Err(e) => {
            let _ = saida.send(Message::Text(format!("\r\nnão iniciei {sh}: {e}\r\n").into())).await;
            return;
        }
    };
    drop(par.slave);
    // sem leitor ou escritor não há terminal: mata o shell em vez de deixá-lo órfão
    let (mut leitor, mut escritor) = match (par.master.try_clone_reader(), par.master.take_writer()) {
        (Ok(l), Ok(w)) => (l, w),
        _ => {
            let _ = filho.kill();
            let _ = saida.send(Message::Text("\r\nnão consegui ligar o terminal\r\n".into())).await;
            return;
        }
    };
    let pid = filho.process_id();
    if let (Some(n), Some(pid)) = (num, pid) {
        crate::sistema::registrar_sessao(n, pid);
    }
    let mestre = par.master;

    // PTY → tela (thread própria: a leitura bloqueia)
    let (tx, mut rx) = tokio::sync::mpsc::channel::<Vec<u8>>(64);
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match leitor.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });
    let envio = tokio::spawn(async move {
        while let Some(b) = rx.recv().await {
            if saida.send(Message::Binary(b.into())).await.is_err() {
                break;
            }
        }
        let _ = saida.send(Message::Close(None)).await;
    });

    // tela → PTY: texto JSON {"t":"i","d":"..."} (teclas) ou {"t":"r","c":80,"l":24} (tamanho)
    while let Some(Ok(msg)) = entrada.next().await {
        match msg {
            Message::Text(t) => {
                let Ok(v) = serde_json::from_str::<Value>(&t) else { continue };
                match v["t"].as_str() {
                    Some("i") => {
                        if let Some(d) = v["d"].as_str() {
                            let _ = escritor.write_all(d.as_bytes());
                            let _ = escritor.flush();
                        }
                    }
                    Some("r") => {
                        let c = v["c"].as_u64().unwrap_or(cols as u64) as u16;
                        let l = v["l"].as_u64().unwrap_or(rows as u64) as u16;
                        let _ = mestre.resize(PtySize { rows: l, cols: c, pixel_width: 0, pixel_height: 0 });
                    }
                    _ => {}
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    // fecha o pseudoterminal antes (o que roda dentro dele, como um agente, recebe o fim junto com o shell), mata e
    // espera o shell (sem esperar, ele fica como zumbi no Linux)
    drop(escritor);
    drop(mestre);
    let _ = filho.kill();
    let _ = tokio::task::spawn_blocking(move || filho.wait()).await;
    envio.abort();
    if let (Some(n), Some(pid)) = (num, pid) {
        crate::sistema::esquecer_sessao(n, pid);
    }
}
