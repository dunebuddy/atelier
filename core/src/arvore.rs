//! Os processos de um terminal morrem juntos. No Windows, um Job Object com "matar ao fechar" segura o shell e tudo o
//! que ele abrir depois (um agente, um servidor...): fechar a janela do terminal, ou o app (o Windows fecha a alça
//! sozinho), mata a árvore inteira, em vez de deixar o agente rodando órfão.

#[cfg(windows)]
pub struct Arvore(isize);

#[cfg(windows)]
impl Arvore {
    /// Prende o processo `pid` (e o que ele vier a abrir) num grupo que morre junto.
    pub fn prender(pid: u32) -> Option<Self> {
        use windows::Win32::Foundation::CloseHandle;
        use windows::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };
        use windows::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};
        unsafe {
            let job = CreateJobObjectW(None, None).ok()?;
            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let tam = std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32;
            let preso = SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info as *const _ as *const _, tam).is_ok()
                && match OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid) {
                    Ok(p) => {
                        let r = AssignProcessToJobObject(job, p).is_ok();
                        let _ = CloseHandle(p);
                        r
                    }
                    Err(_) => false,
                };
            if !preso {
                let _ = CloseHandle(job);
                return None;
            }
            Some(Arvore(job.0 as isize))
        }
    }
}

#[cfg(windows)]
impl Drop for Arvore {
    fn drop(&mut self) {
        // fechar a última alça do grupo mata todos os processos dele
        unsafe {
            let _ = windows::Win32::Foundation::CloseHandle(windows::Win32::Foundation::HANDLE(self.0 as *mut _));
        }
    }
}

/// Fora do Windows o pseudoterminal já leva o grupo do shell junto (o fim do PTY manda SIGHUP).
#[cfg(not(windows))]
pub struct Arvore;

#[cfg(not(windows))]
impl Arvore {
    pub fn prender(_pid: u32) -> Option<Self> {
        Some(Arvore)
    }
}

/// Abrir o atelier quando a sessão do sistema começa (Configurações → Geral). No Windows, a chave Run do usuário; no
/// Linux, um `.desktop` em `~/.config/autostart`. `escondido` abre direto na bandeja. Só o app de verdade se registra
/// (o servidor de teste, `bun run teste`, não).
pub fn iniciar_com_sistema(ligado: bool, escondido: bool) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let nome = exe.file_stem().and_then(|n| n.to_str()).unwrap_or("");
    if nome != "atelier" {
        return Ok(());
    }
    let comando = format!("\"{}\"{}", exe.display(), if escondido { " --escondido" } else { "" });
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::System::Registry::{RegDeleteKeyValueW, RegSetKeyValueW, HKEY_CURRENT_USER, REG_SZ};
        let chave = HSTRING::from("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
        let valor = HSTRING::from("atelier");
        unsafe {
            if ligado {
                let dados: Vec<u16> = comando.encode_utf16().chain(std::iter::once(0)).collect();
                RegSetKeyValueW(HKEY_CURRENT_USER, &chave, &valor, REG_SZ.0, Some(dados.as_ptr() as *const _), (dados.len() * 2) as u32)
                    .ok()
                    .map_err(|e| format!("não registrei o início com o sistema: {e}"))?;
            } else {
                let _ = RegDeleteKeyValueW(HKEY_CURRENT_USER, &chave, &valor);
            }
        }
    }
    #[cfg(not(windows))]
    {
        let pasta = dirs::config_dir().ok_or("sem pasta de configuração")?.join("autostart");
        let arquivo = pasta.join("atelier.desktop");
        if ligado {
            std::fs::create_dir_all(&pasta).map_err(|e| e.to_string())?;
            let texto = format!("[Desktop Entry]\nType=Application\nName=atelier\nExec={comando}\nX-GNOME-Autostart-enabled=true\n");
            std::fs::write(&arquivo, texto).map_err(|e| e.to_string())?;
        } else {
            let _ = std::fs::remove_file(&arquivo);
        }
    }
    Ok(())
}

#[cfg(all(test, windows))]
mod testes {
    use super::Arvore;

    #[test]
    fn fechar_o_grupo_mata_o_shell_e_o_neto() {
        let conta_ping = || {
            let out = std::process::Command::new("tasklist").args(["/FI", "IMAGENAME eq PING.EXE", "/NH"]).output().unwrap();
            String::from_utf8_lossy(&out.stdout).matches("PING.EXE").count()
        };
        let antes = conta_ping();
        // cmd (o "shell") abre um ping (o "agente" que ele rodou)
        let mut shell = std::process::Command::new("cmd").args(["/c", "ping -n 60 127.0.0.1 > nul"]).spawn().unwrap();
        let arvore = Arvore::prender(shell.id()).expect("prendi o shell no grupo");
        std::thread::sleep(std::time::Duration::from_millis(1500));
        assert_eq!(conta_ping(), antes + 1, "o ping está rodando");
        drop(arvore);
        std::thread::sleep(std::time::Duration::from_millis(800));
        assert!(shell.try_wait().unwrap().is_some(), "o shell morreu");
        assert_eq!(conta_ping(), antes, "o neto (ping) morreu junto");
    }
}
