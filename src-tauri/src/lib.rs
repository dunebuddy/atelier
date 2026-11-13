use atelier_core::{api, bancada};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};

/// Esconde na bandeja e pede ao WebView2 para soltar memória enquanto ninguém olha.
fn esconder(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
        #[cfg(windows)]
        memoria_da_tela(&w, true);
    }
}

/// WebView2 em modo de pouca memória (escondido na bandeja) ou normal. Ao voltar, a tela pode levar um instante.
#[cfg(windows)]
fn memoria_da_tela(janela: &tauri::WebviewWindow, baixa: bool) {
    use webview2_com::Microsoft::Web::WebView2::Win32::*;
    use windows::core::Interface;
    let _ = janela.with_webview(move |w| unsafe {
        let Ok(core) = w.controller().CoreWebView2() else { return };
        if let Ok(c19) = core.cast::<ICoreWebView2_19>() {
            let nivel = if baixa { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL };
            let _ = c19.SetMemoryUsageTargetLevel(nivel);
        }
    });
}

fn trazer_para_frente(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        #[cfg(windows)]
        memoria_da_tela(&w, false);
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

/// Rótulo da janela de uma bancada (o mesmo caminho dá sempre o mesmo rótulo: uma janela por bancada).
fn rotulo_da_bancada(caminho: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    caminho.trim().trim_end_matches(['\\', '/']).to_lowercase().replace('/', "\\").hash(&mut h);
    format!("bancada-{:016x}", h.finish())
}

/// Abre a bancada numa janela nova (ou traz para a frente a que já está com ela). A janela principal é a da bancada
/// ativa: pedir a ativa só traz a principal. `abrir` (código de documento) é aberto quando a janela carrega.
#[tauri::command]
fn abrir_janela_bancada(app: tauri::AppHandle, caminho: String, nome: String, abrir: Option<String>) -> Result<(), String> {
    let ativa = bancada::carregar().ativa().map(|b| b.caminho.clone()).unwrap_or_default();
    if bancada::mesmo_caminho(&ativa, &caminho) && abrir.is_none() {
        trazer_para_frente(&app);
        return Ok(());
    }
    let rotulo = if bancada::mesmo_caminho(&ativa, &caminho) { "main".to_string() } else { rotulo_da_bancada(&caminho) };
    if let Some(w) = app.get_webview_window(&rotulo) {
        if rotulo == "main" {
            trazer_para_frente(&app);
        } else {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
        if let Some(c) = abrir {
            let _ = w.emit("atelier:link", format!("atelier://doc/{c}"));
        }
        return Ok(());
    }
    let mut url = format!("index.html?bancada={}", api::codificar_bancada(&caminho).replace('%', "%25").replace('&', "%26").replace('#', "%23"));
    if let Some(c) = abrir {
        // o código e, se for link de arquivo, o caminho (com espaço, & ou # codificados)
        url.push_str(&format!("&abrir={}", api::codificar_bancada(&c)));
    }
    let w = tauri::WebviewWindowBuilder::new(&app, &rotulo, tauri::WebviewUrl::App(url.into()))
        .title(format!("atelier · {nome}"))
        .inner_size(1320.0, 860.0)
        .min_inner_size(720.0, 480.0)
        .decorations(false)
        .build()
        .map_err(|e| e.to_string())?;
    #[cfg(windows)]
    ajustar_janela(&w);
    let _ = w.set_focus();
    Ok(())
}

/// A janelinha destacada: uma aba numa janela pequena (`?solta=<rota em JSON>`), com a bancada da janela que pediu.
#[tauri::command]
fn abrir_janela_solta(app: tauri::AppHandle, rota: String, titulo: String, bancada: Option<String>, largura: Option<f64>, altura: Option<f64>) -> Result<(), String> {
    static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    let n = N.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
    // a rota vem codificada pela tela (encodeURIComponent): vai como está
    let mut url = format!("index.html?solta={rota}");
    if let Some(b) = bancada.filter(|b| !b.is_empty()) {
        // já vem codificada (como a API recebe); na URL, o % vira %25
        url.push_str(&format!("&bancada={}", b.replace('%', "%25").replace('&', "%26").replace('#', "%23")));
    }
    let w = tauri::WebviewWindowBuilder::new(&app, format!("solta-{n}"), tauri::WebviewUrl::App(url.into()))
        .title(format!("{titulo} · atelier"))
        .inner_size(largura.unwrap_or(480.0).clamp(320.0, 2000.0), altura.unwrap_or(820.0).clamp(300.0, 2000.0))
        .min_inner_size(320.0, 300.0)
        .build()
        .map_err(|e| e.to_string())?;
    let _ = w.set_focus();
    Ok(())
}

/// Um link `atelier://...`: `doc/<código>` abre o documento na janela da bancada dele (abrindo a janela se for de
/// outra); `visao/<nome>` e o resto vão para a janela principal, que sabe abrir.
fn tratar_link(app: &tauri::AppHandle, url: &str) {
    let resto = url.trim().trim_start_matches("atelier://").trim_end_matches('/');
    // `doc/<código>` ou `doc/<código>/<caminho do arquivo>`, com `?bancada=<nome>` opcional (diz onde olhar primeiro);
    // `item/` é o nome antigo de `doc/`
    if let Some(parte) = resto.strip_prefix("doc/").or_else(|| resto.strip_prefix("item/")) {
        let (alvo, query) = parte.split_once('?').unwrap_or((parte, ""));
        let codigo = alvo.split('/').next().unwrap_or_default().trim_start_matches('#').to_lowercase();
        let pedida = query.split('&').find_map(|p| p.strip_prefix("bancada=")).map(|n| n.replace("%20", " ").replace('+', " "));
        let cfg = bancada::carregar();
        let ativa = cfg.ativa().map(|b| b.caminho.clone()).unwrap_or_default();
        let na_pedida = pedida.and_then(|n| cfg.bancadas.iter().find(|b| b.nome.eq_ignore_ascii_case(&n)).cloned());
        match na_pedida.or_else(|| bancada::achar_codigo(&codigo)) {
            Some(b) if !bancada::mesmo_caminho(&b.caminho, &ativa) => {
                let _ = abrir_janela_bancada(app.clone(), b.caminho, b.nome, Some(alvo.to_string()));
                return;
            }
            _ => {}
        }
    }
    trazer_para_frente(app);
    let _ = app.emit_to("main", "atelier:link", url.to_string());
}

/// O link com que o app foi aberto (a tela pede quando termina de carregar).
static LINK_INICIAL: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

/// A tela manda seguir um link (o inicial, ou um clicado dentro do app).
#[tauri::command]
fn seguir_link(app: tauri::AppHandle, url: String) {
    tratar_link(&app, &url);
}

#[tauri::command]
fn link_inicial() -> Option<String> {
    LINK_INICIAL.lock().ok().and_then(|mut l| l.take())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let estado = api::Estado::iniciar().unwrap_or_else(|e| panic!("não abri a bancada: {e}"));

    tauri::Builder::default()
        // um atelier só: abrir de novo traz para a frente o que já está aberto (vem primeiro, antes de tudo)
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            // abrir de novo (ou clicar num link atelier://) com o app já aberto: o link vem aqui
            match args.iter().find(|a| a.starts_with("atelier://")) {
                Some(link) => tratar_link(app, link),
                None => trazer_para_frente(app),
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(move |app| {
            tauri::async_runtime::spawn(api::servir(estado));
            // atelier:// registrado para este executável (o instalador também registra); aberto por um link, guarda
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                #[cfg(any(windows, target_os = "linux"))]
                let _ = app.deep_link().register_all();
                if let Some(link) = std::env::args().find(|a| a.starts_with("atelier://")) {
                    *LINK_INICIAL.lock().unwrap_or_else(|e| e.into_inner()) = Some(link);
                }
            }
            #[cfg(windows)]
            if let Some(w) = app.get_webview_window("main") {
                ajustar_janela(&w);
            }
            // aberto pelo sistema no início da sessão com "iniciar escondido": vai direto para a bandeja
            if std::env::args().any(|a| a == "--escondido") {
                esconder(app.handle());
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
        .invoke_handler(tauri::generate_handler![abrir_janela_solta, abrir_janela_bancada, link_inicial, seguir_link])
        .on_window_event(|janela, ev| match ev {
            // "fechar vai para a bandeja" (Configurações → Geral): o × só esconde; sair é pelo menu da bandeja.
            // As janelas de outras bancadas fecham de verdade.
            WindowEvent::CloseRequested { api, .. } => {
                if janela.label() == "main" && bancada::carregar().preferencias.captura.bandeja {
                    api.prevent_close();
                    esconder(janela.app_handle());
                }
            }
            // "minimizar vai para a bandeja": minimizada, some da barra de tarefas
            WindowEvent::Resized(_) => {
                if janela.label() == "main" && janela.is_minimized().unwrap_or(false) && bancada::carregar().preferencias.janela.minimizar_bandeja {
                    // esconde ainda minimizada (sem piscar); trazer_para_frente mostra e restaura
                    esconder(janela.app_handle());
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("erro ao rodar o atelier");
}
