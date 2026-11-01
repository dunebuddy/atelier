use atelier_core::{api, bancada};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};

fn trazer_para_frente(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Ajustes da janela que o Tauri não faz no Windows:
/// - ícone **grande** (o da barra de tarefas): o Tauri só põe o pequeno, e sem o grande o Windows mostra o ícone
///   que guardou em cache para o exe (o redemoinho das primeiras versões);
/// - permissões do WebView2 respondidas sem a caixa dele (escura, solta, às vezes fora da janela): a tela do próprio
///   app ganha microfone (ditado), área de transferência e notificações; o resto, e qualquer outra origem (o HTML
///   aberto no explorador roda em 127.0.0.1:7477), fica negado, também sem perguntar.
#[cfg(windows)]
fn ajustar_janela(janela: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use webview2_com::{take_pwstr, PermissionRequestedEventHandler};
    use windows::core::{HSTRING, PWSTR};
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::Shell::ExtractIconExW;
    use windows::Win32::UI::WindowsAndMessaging::{SendMessageW, HICON, ICON_BIG, WM_SETICON};

    if let (Ok(hwnd), Ok(exe)) = (janela.hwnd(), std::env::current_exe()) {
        // o Windows guarda o ícone do exe em cache pelo caminho e não renova quando a atualização troca o arquivo:
        // avisar o Explorer que o exe mudou faz a barra de tarefas pegar o ícone novo (conferido na 0.1.5)
        unsafe {
            use windows::Win32::UI::Shell::{SHChangeNotify, SHCNE_UPDATEITEM, SHCNF_PATHW};
            let caminho = HSTRING::from(exe.as_os_str());
            SHChangeNotify(SHCNE_UPDATEITEM, SHCNF_PATHW, Some(caminho.as_ptr() as *const _), None);
        }
        let mut grande = HICON::default();
        let n = unsafe { ExtractIconExW(&HSTRING::from(exe.as_os_str()), 0, Some(&mut grande), None, 1) };
        if n > 0 && !grande.is_invalid() {
            unsafe { SendMessageW(hwnd, WM_SETICON, Some(WPARAM(ICON_BIG as usize)), Some(LPARAM(grande.0 as isize))) };
        }
    }

    let _ = janela.with_webview(|w| unsafe {
        let Ok(core) = w.controller().CoreWebView2() else { return };
        let handler = PermissionRequestedEventHandler::create(Box::new(|_, args| {
            let Some(args) = args else { return Ok(()) };
            let mut uri = PWSTR::null();
            args.Uri(&mut uri)?;
            let uri = take_pwstr(uri);
            let mut tipo = COREWEBVIEW2_PERMISSION_KIND::default();
            args.PermissionKind(&mut tipo)?;
            let do_app = ["http://tauri.localhost", "https://tauri.localhost", "http://localhost:1420"]
                .iter()
                .any(|o| uri == *o || uri.starts_with(&format!("{o}/")));
            let usa = [COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ, COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS]
                .contains(&tipo);
            args.SetState(if do_app && usa { COREWEBVIEW2_PERMISSION_STATE_ALLOW } else { COREWEBVIEW2_PERMISSION_STATE_DENY })
        }));
        let mut token = 0i64;
        let _ = core.add_PermissionRequested(&handler, &mut token);
    });
}

fn anotar_atualizacao(t: &str) {
    use std::io::Write;
    let p = std::env::temp_dir().join("atelier-atualizacao.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(p) {
        let _ = writeln!(f, "{} v{} {t}", atelier_core::db::agora(), env!("CARGO_PKG_VERSION"));
    }
}

async fn atualizar_sozinho(app: tauri::AppHandle) {
    use tauri_plugin_updater::UpdaterExt;
    anotar_atualizacao("procurando versão nova");
    let achada = match app.updater() {
        Ok(u) => u.check().await,
        Err(e) => return anotar_atualizacao(&format!("sem atualizador: {e}")),
    };
    match achada {
        Ok(Some(u)) => {
            anotar_atualizacao(&format!("achou {}; baixando e instalando", u.version));
            match u.download_and_install(|_, _| {}, || {}).await {
                Ok(()) => {
                    anotar_atualizacao("instalada; reiniciando");
                    app.restart();
                }
                Err(e) => anotar_atualizacao(&format!("falhou ao instalar: {e}")),
            }
        }
        Ok(None) => anotar_atualizacao("já está na mais nova"),
        Err(e) => anotar_atualizacao(&format!("falhou ao procurar: {e}")),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let estado = api::Estado::iniciar().unwrap_or_else(|e| panic!("não abri a bancada: {e}"));

    tauri::Builder::default()
        // um atelier só: abrir de novo traz para a frente o que já está aberto (vem primeiro, antes de tudo)
        .plugin(tauri_plugin_single_instance::init(|app, _, _| trazer_para_frente(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(move |app| {
            tauri::async_runtime::spawn(api::servir(estado));
            #[cfg(windows)]
            if let Some(w) = app.get_webview_window("main") {
                ajustar_janela(&w);
            }
            // o instalador renomeia o MCP que estava em uso (windows/ganchos.nsh); o que ninguém usa mais sai aqui
            if let Some(pasta) = std::env::current_exe().ok().and_then(|e| e.parent().map(|p| p.to_path_buf())) {
                for f in std::fs::read_dir(pasta).into_iter().flatten().flatten() {
                    if f.file_name().to_string_lossy().starts_with("atelier-mcp.antigo-") {
                        let _ = std::fs::remove_file(f.path());
                    }
                }
            }

            // bandeja: clique traz a janela; o menu tem Capturar, Abrir e Sair
            let capturar = MenuItem::with_id(app, "capturar", "Capturar…", true, None::<&str>)?;
            let abrir = MenuItem::with_id(app, "abrir", "Abrir o atelier", true, None::<&str>)?;
            let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&capturar, &abrir, &sair])?;
            let mut tray = TrayIconBuilder::with_id("atelier").tooltip("atelier").menu(&menu).show_menu_on_left_click(false)
                .on_tray_icon_event(|t, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        trazer_para_frente(t.app_handle());
                    }
                })
                .on_menu_event(|app, ev| match ev.id().as_ref() {
                "capturar" => {
                    trazer_para_frente(app);
                    let _ = app.emit("atelier:capturar", ());
                }
                "abrir" => trazer_para_frente(app),
                "sair" => app.exit(0),
                _ => {}
            });
            if let Some(icone) = app.default_window_icon() {
                tray = tray.icon(icone.clone());
            }
            tray.build(app)?;

            // teste da atualização sem clicar: ATELIER_ATUALIZAR_SOZINHO=1 procura, instala e reinicia sozinho,
            // anotando cada passo em %TEMP%/atelier-atualizacao.log (no uso normal, a tela pergunta antes)
            if std::env::var("ATELIER_ATUALIZAR_SOZINHO").is_ok() {
                let app = app.handle().clone();
                tauri::async_runtime::spawn(async move { atualizar_sozinho(app).await });
            }
            Ok(())
        })
        .on_window_event(|janela, ev| {
            // "fechar vai para a bandeja" (Configurações → Automação): o × só esconde; sair é pelo menu da bandeja
            if let WindowEvent::CloseRequested { api, .. } = ev {
                if bancada::carregar().preferencias.captura.bandeja {
                    api.prevent_close();
                    let _ = janela.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao rodar o atelier");
}
