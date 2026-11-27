//! Registro de queda do app: quando o núcleo cai, o motivo fica em `~/atelier/erros.log`.
//!
//! Em 2026-11-27 o atelier caiu (e em 20/11 também) e o motivo se perdeu: o app de janela não tem console, e o que o
//! Rust escreve antes de abortar ("memory allocation of N bytes failed", a mensagem de um pânico) ia para lugar
//! nenhum. Foi preciso deduzir pelos eventos do Windows (faltou memória virtual na máquina). Agora:
//! - a saída de erro do processo (stderr) vai para o `erros.log` (o mesmo dos erros da tela), então a falta de
//!   memória e qualquer outra mensagem de quem aborta ficam lá;
//! - o pânico ganha uma entrada com data, hora, onde foi e a pilha;
//! - cada abertura deixa uma linha, para ver no log onde o app recomeçou depois de cair.

use std::io::Write;
use std::path::PathBuf;

fn arquivo() -> PathBuf {
    crate::bancada::pasta_atelier().join("erros.log")
}

fn agora() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

/// Liga o registro. Chamar uma vez, logo no começo do app (antes de abrir a bancada).
pub fn registrar(versao: &str) {
    let caminho = arquivo();
    let _ = std::fs::create_dir_all(caminho.parent().unwrap_or(&caminho));
    // passando de 1 MB, recomeça (o antigo vira erros.log.1), como o log da tela faz
    if std::fs::metadata(&caminho).map(|m| m.len() > 1_048_576).unwrap_or(false) {
        let _ = std::fs::rename(&caminho, caminho.with_extension("log.1"));
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&caminho) {
        let _ = writeln!(f, "[{}] atelier {versao} aberto\n", agora());
        redirecionar_stderr(f);
    }

    let anterior = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let msg = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "(sem mensagem)".into());
        let onde = info.location().map(|l| format!("{}:{}", l.file(), l.line())).unwrap_or_default();
        let linha = std::thread::current().name().unwrap_or("sem nome").to_string();
        let pilha = std::backtrace::Backtrace::force_capture();
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(arquivo()) {
            let _ = writeln!(f, "[{}] PÂNICO no núcleo: {msg} (em {onde}, linha de execução \"{linha}\")\n{pilha}\n", agora());
        }
        anterior(info);
    }));
}

/// A saída de erro do processo passa a ir para o arquivo (o handle fica aberto até o fim do app).
#[cfg(windows)]
fn redirecionar_stderr(f: std::fs::File) {
    use std::os::windows::io::IntoRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::Console::{SetStdHandle, STD_ERROR_HANDLE};
    let h = f.into_raw_handle();
    // o Rust pega o handle do stderr a cada escrita (GetStdHandle): trocar aqui vale para o resto do app
    unsafe {
        let _ = SetStdHandle(STD_ERROR_HANDLE, HANDLE(h));
    }
}

#[cfg(unix)]
fn redirecionar_stderr(f: std::fs::File) {
    use std::os::fd::AsRawFd;
    unsafe {
        libc::dup2(f.as_raw_fd(), 2);
    }
}

#[cfg(not(any(windows, unix)))]
fn redirecionar_stderr(_f: std::fs::File) {}
