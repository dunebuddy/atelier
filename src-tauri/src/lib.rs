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
