use atelier_core::{api, bancada};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager, WindowEvent};

/// Mostra o ícone da bandeja quando a captura global está ligada (a tela chama ao mudar a preferência).
#[tauri::command]
fn bandeja(app: tauri::AppHandle, visivel: bool) {
    if let Some(t) = app.tray_by_id("atelier") {
        let _ = t.set_visible(visivel);
    }
}

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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![bandeja])
        .setup(move |app| {
            tauri::async_runtime::spawn(api::servir(estado));

            // bandeja: só aparece com a captura global ligada
            let capturar = MenuItem::with_id(app, "capturar", "Capturar…", true, None::<&str>)?;
            let abrir = MenuItem::with_id(app, "abrir", "Abrir o atelier", true, None::<&str>)?;
            let sair = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&capturar, &abrir, &sair])?;
            let mut tray = TrayIconBuilder::with_id("atelier").tooltip("atelier").menu(&menu).on_menu_event(|app, ev| match ev.id().as_ref() {
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
            let t = tray.build(app)?;
            let _ = t.set_visible(bancada::carregar().preferencias.captura.ativo);

            // teste da atualização sem clicar: ATELIER_ATUALIZAR_SOZINHO=1 procura, instala e reinicia sozinho,
            // anotando cada passo em %TEMP%/atelier-atualizacao.log (no uso normal, a tela pergunta antes)
            if std::env::var("ATELIER_ATUALIZAR_SOZINHO").is_ok() {
                let app = app.handle().clone();
                tauri::async_runtime::spawn(async move { atualizar_sozinho(app).await });
            }
            Ok(())
        })
        .on_window_event(|janela, ev| {
            // com a captura ligada (e "fechar esconde"), fechar só esconde: o atalho continua valendo
            if let WindowEvent::CloseRequested { api, .. } = ev {
                let c = bancada::carregar().preferencias.captura;
                if c.ativo && c.bandeja {
                    api.prevent_close();
                    let _ = janela.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("erro ao rodar o atelier");
}
