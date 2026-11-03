//! API HTTP local (só 127.0.0.1). A interface usa ela; o Claude e o MCP também.

use crate::bancada::{self, Bancada, Config};
use crate::db::{self, Erro, Filtro};
use axum::{
    extract::{Path, Query, State},
    http::{HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, patch, post},
    Json, Router,
};
use rusqlite::Connection;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tower_http::cors::CorsLayer;

pub const PORTA: u16 = 7477;

/// A porta em uso: 7477, ou `ATELIER_PORTA` no teste sem janela (`bun run teste`), que roda ao lado do app aberto.
pub fn porta() -> u16 {
    std::env::var("ATELIER_PORTA").ok().and_then(|p| p.parse().ok()).unwrap_or(PORTA)
}

tokio::task_local! {
    /// A bancada deste pedido (cabeçalho `x-atelier-bancada` ou `?bancada=`): cada janela do app é de uma bancada, e
    /// cada agente fica preso à sua. Sem ela, vale a bancada ativa (a da janela principal).
    static BANCADA_DO_PEDIDO: Option<String>;
}

/// A bancada deste pedido (None: a ativa). O terminal usa para prender o agente à bancada da janela.
pub fn bancada_do_pedido() -> Option<String> {
    BANCADA_DO_PEDIDO.try_with(|b| b.clone()).ok().flatten()
}

/// O caminho de bancada para ir num cabeçalho HTTP (só ASCII visível): `%` + hexa no resto.
pub fn codificar_bancada(caminho: &str) -> String {
    caminho.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.:/\\".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}

pub fn decodificar_bancada(s: &str) -> String {
    let b = s.as_bytes();
    let mut v = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(x) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                v.push(x);
                i += 3;
                continue;
            }
        }
        v.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&v).into_owned()
}

/// Estado do app: a conexão da bancada aberta e a lista de bancadas. Trocar de bancada troca a conexão.
pub struct Estado {
    conn: Mutex<Connection>,
    /// conexões das outras bancadas abertas em outras janelas (ou presas a agentes), abertas quando pedidas
    outras: Mutex<std::collections::HashMap<String, Arc<Mutex<Connection>>>>,
    cfg: Mutex<Config>,
    /// pedidos para a tela (vindos do MCP e do Comando): veja ACOES_TELA
    tela: tokio::sync::broadcast::Sender<String>,
    /// o que cada janela está mostrando, em texto (ela manda a cada mudança), por bancada
    tela_estado: Mutex<std::collections::HashMap<String, String>>,
}

pub type Banco = Arc<Estado>;

impl Estado {
    /// Abre a bancada ativa (cria a "Principal" na primeira vez).
    pub fn iniciar() -> db::Res<Banco> {
        let mut cfg = bancada::carregar();
        let b = cfg.garantir_ativa()?;
        let conn = db::abrir(&bancada::banco_da(&b.caminho))?;
        bancada::salvar(&cfg)?;
        if let Err(e) = crate::temas::semear() {
            eprintln!("atelier: temas: {e}");
        }
        Ok(Arc::new(Estado {
            conn: Mutex::new(conn), outras: Mutex::new(Default::default()), cfg: Mutex::new(cfg),
            tela: tokio::sync::broadcast::channel(64).0, tela_estado: Mutex::new(Default::default()),
        }))
    }

    /// A bancada deste pedido: a da janela (ou do agente) que pediu; sem ela, a ativa.
    pub fn bancada_ativa(&self) -> Option<Bancada> {
        let cfg = self.cfg.lock().unwrap_or_else(|e| e.into_inner());
        let pedida = BANCADA_DO_PEDIDO.try_with(|b| b.clone()).ok().flatten();
        match pedida {
            Some(c) => cfg.bancadas.iter().find(|b| bancada::mesmo_caminho(&b.caminho, &c)).cloned(),
            None => cfg.ativa().cloned(),
        }
    }

    /// O caminho que marca os eventos e o estado da tela deste pedido.
    fn chave_da_tela(&self) -> String {
        self.bancada_ativa().map(|b| b.caminho.to_lowercase().replace('/', "\\")).unwrap_or_default()
    }
}

impl IntoResponse for Erro {
    fn into_response(self) -> Response {
        let status = match self {
            Erro::NaoEncontrado(_) => StatusCode::NOT_FOUND,
            Erro::Invalido(_) => StatusCode::BAD_REQUEST,
            Erro::Banco(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };
        (status, Json(json!({ "erro": self.to_string() }))).into_response()
    }
}

type R = Result<Json<Value>, Erro>;

/// Roda `f` na conexão da bancada deste pedido (a ativa, ou a da janela/agente que pediu).
fn com<T>(b: &Banco, f: impl FnOnce(&Connection) -> db::Res<T>) -> db::Res<T> {
    let pedida = BANCADA_DO_PEDIDO.try_with(|x| x.clone()).ok().flatten();
    let ativa = b.cfg.lock().unwrap_or_else(|e| e.into_inner()).ativa().map(|x| x.caminho.clone());
    match pedida {
        Some(c) if !ativa.as_deref().is_some_and(|a| bancada::mesmo_caminho(a, &c)) => {
            let alvo = b.bancada_ativa().ok_or_else(|| Erro::NaoEncontrado(format!("bancada {c}")))?;
            let chave = alvo.caminho.to_lowercase();
            let conn = {
                let mut outras = b.outras.lock().unwrap_or_else(|e| e.into_inner());
                match outras.get(&chave) {
                    Some(c) => c.clone(),
                    None => {
                        let c = Arc::new(Mutex::new(db::abrir(&bancada::banco_da(&alvo.caminho))?));
                        outras.insert(chave, c.clone());
                        c
                    }
                }
            };
            let conn = conn.lock().unwrap_or_else(|e| e.into_inner());
            f(&conn)
        }
        _ => {
            let conn = b.conn.lock().unwrap_or_else(|e| e.into_inner());
            f(&conn)
        }
    }
}

/// Lê a bancada do pedido (cabeçalho ou `?bancada=`) e roda o resto dentro dela.
async fn escolher_bancada(req: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let do_cabecalho = req.headers().get("x-atelier-bancada").and_then(|v| v.to_str().ok()).map(String::from);
    let da_query = req.uri().query().and_then(|q| q.split('&').find_map(|p| p.strip_prefix("bancada=").map(String::from)));
    // na query vem codificada duas vezes (a da URL e a nossa); no cabeçalho, uma
    let bancada = do_cabecalho.map(|c| decodificar_bancada(&c)).or(da_query.map(|c| decodificar_bancada(&decodificar_bancada(&c)))).filter(|c| !c.trim().is_empty());
    BANCADA_DO_PEDIDO.scope(bancada, next.run(req)).await
}

pub fn rotas(banco: Banco) -> Router {
    let origens: Vec<HeaderValue> = crate::terminal::ORIGENS
        .iter()
        .map(|o| o.to_string())
        .chain(std::env::var("ATELIER_ORIGEM").ok())
        .filter_map(|o| HeaderValue::from_str(&o).ok())
        .collect();
    let cors = CorsLayer::new()
        .allow_origin(origens)
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::PUT, Method::DELETE])
        // a janela de outra bancada manda qual é a dela
        .allow_headers([axum::http::header::CONTENT_TYPE, axum::http::HeaderName::from_static("x-atelier-bancada")]);

    Router::new()
        .route("/api/saude", get(|| async { Json(json!({ "ok": true, "app": "atelier", "versao": env!("CARGO_PKG_VERSION") })) }))
        .route("/api/esquema", get(esquema))
        .route("/api/tipos", post(criar_tipo))
        .route("/api/tipos/{id}", patch(atualizar_tipo).delete(apagar_tipo))
        .route("/api/tipos/{id}/propriedades/{pid}", axum::routing::put(tipo_poe_prop).delete(tipo_tira_prop))
        .route("/api/propriedades", post(criar_prop))
        .route("/api/propriedades/{id}", patch(atualizar_prop).delete(apagar_prop))
        .route("/api/propriedades/{id}/opcao", post(mudar_opcao))
        .route("/api/modelos", post(criar_modelo))
        .route("/api/modelos/{id}", patch(atualizar_modelo).delete(apagar_modelo))
        .route("/api/itens", get(listar).post(criar_item))
        .route("/api/linha", get(linha))
        .route("/api/visoes", get(visoes).post(criar_visao))
        .route("/api/visoes/{id}", patch(atualizar_visao).delete(apagar_visao))
        .route("/api/itens/{id}", get(ler_item).patch(atualizar_item).delete(apagar_item))
        .route("/api/itens/{id}/notas", post(anotar))
        .route("/api/itens/{id}/pasta", post(criar_pasta))
        .route("/api/itens/{id}/arquivos", get(arquivos_do_item).post(trazer_arquivos))
        .route("/api/abrir-arquivo", post(abrir_arquivo))
        .route("/api/explorar", get(crate::explorador::explorar))
        .route("/api/arquivo", get(crate::explorador::arquivo).put(crate::explorador::salvar))
        .route("/api/arquivo/info", get(crate::explorador::info))
        .route("/api/itens/{id}/colar", post(colar_arquivo))
        .route("/api/relatorios", post(salvar_relatorio))
        .route("/api/terminal", get(crate::terminal::terminal))
        .route("/api/terminal/programas", get(crate::terminal::programas))
        .route("/api/notas/{id}", patch(editar_nota).delete(apagar_nota))
        .route("/api/notas/{id}/restaurar", post(restaurar_nota))
        .route("/api/notas/{id}/versoes", get(versoes_nota))
        .route("/api/itens/{id}/restaurar", post(restaurar_item))
        .route("/api/itens/{id}/versoes", get(versoes_item))
        .route("/api/itens/{id}/ligar", post(ligar))
        .route("/api/itens/{id}/ramo", get(ramo))
        .route("/api/itens/{id}/tamanho", get(tamanho_item))
        .route("/api/bancadas/tamanho", get(tamanho_bancada))
        .route("/api/resumos", get(resumos))
        .route("/api/versoes/{id}/restaurar", post(restaurar_versao))
        .route("/api/lixeira", get(lixeira).delete(esvaziar_lixeira))
        .route("/api/lixeira/itens/{id}", axum::routing::delete(apagar_de_vez))
        .route("/api/abrir-pasta", post(abrir_pasta))
        .route("/api/lista", post(lista_no_texto))
        .route("/api/consultas", get(listar_consultas).post(salvar_consulta))
        .route("/api/consultas/rodar", post(rodar_consulta))
        .route("/api/consultas/{id}", axum::routing::delete(apagar_consulta))
        .route("/api/agente/evento", post(evento_do_agente))
        .route("/api/hooks", get(|| async { Json(tokio::task::spawn_blocking(crate::hooks::listar).await.unwrap_or_default()) }))
        .route("/api/hooks/{id}", post(instalar_hooks).delete(remover_hooks))
        .route("/api/apps", get(|| async { Json(json!(tokio::task::spawn_blocking(crate::apps::listar).await.unwrap_or_default())) }))
        .route("/api/bancadas", get(bancadas).post(criar_bancada).patch(renomear_bancada).delete(remover_bancada))
        .route("/api/bancadas/ativar", post(ativar_bancada))
        .route("/api/preferencias", get(preferencias).patch(mudar_preferencias))
        .route("/api/backup", get(backups).post(backup_agora))
        .route("/api/integracoes", get(|| async { Json(crate::integracoes::listar()) }))
        .route("/api/agentes", get(agentes))
        .route("/api/tela", post(tela))
        .route("/api/log", post(gravar_log))
        .route("/api/sistema", get(|| async { Json(tokio::task::spawn_blocking(crate::sistema::medir).await.unwrap_or_default()) }))
        .route("/api/sistema/placas", get(|| async { Json(json!(tokio::task::spawn_blocking(crate::sistema::placas_de_video).await.unwrap_or_default())) }))
        .route("/api/exportar", post(exportar))
        .route("/api/tela/eventos", get(tela_eventos))
        .route("/api/tela/estado", post(tela_estado))
        .route("/api/falta", post(falta).get(pedidos))
        .route("/api/agentes/{id}/testar", post(testar_agente))
        .route("/api/executar", post(executar))
        .route("/api/comando", post(comando))
        .route("/api/integracoes/{id}", post(instalar_integracao).delete(remover_integracao))
        .route("/api/temas", get(|| async { Json(json!({ "pasta": crate::temas::pasta(), "temas": crate::temas::listar() })) }))
        .layer(cors)
        .layer(axum::middleware::from_fn(escolher_bancada))
        .layer(axum::middleware::from_fn(guarda))
        .with_state(banco)
}

/// Só quem está nesta máquina fala com a API. O CORS barra *ler* a resposta, não *mandar* o pedido; então:
/// - `Host` tem de ser o próprio computador (barra o "DNS rebinding": um site de fora que passa a apontar para
///   127.0.0.1 e chega aqui com o nome dele no `Host`);
/// - pedido com `Origin` (vindo de navegador) só da tela do app. Sem `Origin` (MCP, curl) passa.
pub fn pedido_permitido(host: Option<&str>, origem: Option<&str>) -> bool {
    let host_ok = host.is_none_or(|h| {
        let nome = match h.strip_prefix('[') {
            Some(resto) => resto.split(']').next().map(|n| format!("[{n}]")).unwrap_or_default(),
            None => h.split(':').next().unwrap_or("").to_string(),
        };
        let porta = h.rsplit_once(':').filter(|(antes, _)| !antes.is_empty() && !h.ends_with(']')).map(|(_, p)| p);
        matches!(nome.to_ascii_lowercase().as_str(), "127.0.0.1" | "localhost" | "[::1]")
            && porta.is_none_or(|p| p == crate::api::porta().to_string())
    });
    host_ok && origem.is_none_or(crate::terminal::origem_permitida)
}

async fn guarda(req: axum::extract::Request, next: axum::middleware::Next) -> Response {
    let permitido = {
        let cab = |k: &str| req.headers().get(k).and_then(|v| v.to_str().ok());
        pedido_permitido(cab("host"), cab("origin"))
    };
    if !permitido {
        return (StatusCode::FORBIDDEN, "pedido de fora do atelier").into_response();
    }
    next.run(req).await
}

#[cfg(test)]
mod testes_guarda {
    use super::pedido_permitido as ok;

    #[test]
    fn so_a_maquina_e_a_tela() {
        // a tela, o MCP (Host sem porta) e o curl
        assert!(ok(Some("127.0.0.1:7477"), Some("http://tauri.localhost")));
        assert!(ok(Some("127.0.0.1:7477"), Some("http://localhost:1420")));
        assert!(ok(Some("127.0.0.1"), None));
        assert!(ok(Some("localhost:7477"), None));
        assert!(ok(Some("[::1]:7477"), None));
        assert!(ok(None, None));
        // DNS rebinding: nome de fora no Host
        assert!(!ok(Some("ataque.exemplo.com:7477"), None));
        assert!(!ok(Some("127.0.0.1.exemplo.com:7477"), None));
        assert!(!ok(Some("127.0.0.1:9999"), None));
        // página aberta no navegador mandando POST para cá
        assert!(!ok(Some("127.0.0.1:7477"), Some("https://ataque.exemplo.com")));
        // HTML aberto no explorador (iframe isolado tem origem "null")
        assert!(!ok(Some("127.0.0.1:7477"), Some("null")));
    }
}

/// A cada 10 minutos: backup e limpeza da lixeira, se ligados nas preferências.
async fn manutencao(b: Banco) {
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(20)).await;
        if let Some(banc) = b.bancada_ativa() {
            let r = com(&b, |c| crate::manutencao::rodada(c, std::path::Path::new(&banc.caminho)));
            match r {
                Ok(feito) if !feito.is_empty() => eprintln!("atelier: {}", feito.join(" · ")),
                Err(e) => eprintln!("atelier: manutenção falhou: {e}"),
                _ => {}
            }
        }
        tokio::time::sleep(std::time::Duration::from_secs(600 - 20)).await;
    }
}

/// O que o MCP (outro processo) grava no banco aparece na tela sozinho: o SQLite muda o `data_version` da nossa
/// conexão quando outra conexão grava (as gravações da própria tela não mexem nele). Conferido a cada segundo; quando
/// muda, a tela recebe `{"acao": "mudou"}` e recarrega o que estiver à vista.
async fn vigiar_banco(b: Banco) {
    // a ativa e as outras bancadas abertas (em outras janelas): cada janela recebe o "mudou" da sua
    let mut ultimos: std::collections::HashMap<String, i64> = Default::default();
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        let mut caminhos: Vec<Option<String>> = vec![None];
        caminhos.extend(b.outras.lock().unwrap_or_else(|e| e.into_inner()).keys().cloned().map(Some));
        for cam in caminhos {
            let b2 = b.clone();
            let lido = BANCADA_DO_PEDIDO
                .scope(cam.clone(), async move {
                    let chave = b2.chave_da_tela();
                    com(&b2, |c| Ok(c.query_row("PRAGMA data_version", [], |r| r.get::<_, i64>(0))?)).ok().map(|v| (chave, v))
                })
                .await;
            let Some((chave, v)) = lido else { continue };
            if ultimos.get(&chave).is_some_and(|antes| *antes != v) {
                let _ = b.tela.send(json!({ "acao": "mudou", "bancada": chave }).to_string());
            }
            ultimos.insert(chave, v);
        }
    }
}

pub async fn servir(banco: Banco) {
    tokio::spawn(manutencao(banco.clone()));
    tokio::spawn(vigiar_banco(banco.clone()));
    let endereco = format!("127.0.0.1:{}", porta());
    match tokio::net::TcpListener::bind(&endereco).await {
        Ok(l) => {
            if let Err(e) = axum::serve(l, rotas(banco)).await {
                eprintln!("atelier: API caiu: {e}");
            }
        }
        Err(e) => eprintln!("atelier: não consegui abrir {endereco}: {e}"),
    }
}

/// Quanto o workspace do item ocupa no disco: só a pasta dele e com a dos descendentes (Pai → Filhos).
async fn tamanho_item(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    let (pasta, filhos, n) = com(&b, |c| db::pastas_da_arvore(c, id))?;
    let r = tokio::task::spawn_blocking(move || {
        let proprio = pasta.as_ref().map(|p| crate::disco::somar_pastas([std::path::PathBuf::from(p)])).unwrap_or(0);
        let todos = crate::disco::somar_pastas(pasta.into_iter().chain(filhos).map(std::path::PathBuf::from));
        json!({ "proprio": proprio, "com_filhos": todos, "filhos": n })
    })
    .await
    .map_err(|e| Erro::Invalido(e.to_string()))?;
    Ok(Json(r))
}

/// Quanto a bancada aberta ocupa no disco (a pasta inteira: itens, banco, anexos).
async fn tamanho_bancada(State(b): State<Banco>) -> R {
    let Some(banc) = b.bancada_ativa() else { return Err(Erro::Invalido("nenhuma bancada aberta".into())) };
    let n = tokio::task::spawn_blocking(move || crate::disco::somar_pastas([std::path::PathBuf::from(banc.caminho)]))
        .await
        .map_err(|e| Erro::Invalido(e.to_string()))?;
    Ok(Json(json!({ "bytes": n })))
}

/// Renomear (os itens acompanham), mudar cor ou histórico, ou apagar uma opção: `{ tipo_id?, opcao, nome?, cor?,
/// historico?, apagar? }`.
async fn mudar_opcao(State(b): State<Banco>, Path(id): Path<i64>, Json(d): Json<Value>) -> R {
    let opcao = d.get("opcao").and_then(|v| v.as_str()).unwrap_or("").to_string();
    com(&b, |c| db::mudar_opcao(c, d.get("tipo_id").and_then(|v| v.as_i64()), id, &opcao, &d))?;
    Ok(Json(json!({ "ok": true })))
}

async fn esquema(State(b): State<Banco>) -> R {
    Ok(Json(com(&b, db::esquema)?))
}

async fn criar_tipo(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let id = com(&b, |c| db::criar_tipo(c, &d))?;
    Ok(Json(json!({ "id": id })))
}

async fn atualizar_tipo(State(b): State<Banco>, Path(id): Path<i64>, Json(d): Json<Value>) -> R {
    com(&b, |c| db::atualizar_tipo(c, id, &d))?;
    Ok(Json(json!({ "ok": true })))
}

async fn apagar_tipo(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    com(&b, |c| db::apagar_tipo(c, id))?;
    Ok(Json(json!({ "ok": true })))
}

async fn tipo_poe_prop(State(b): State<Banco>, Path((id, pid)): Path<(i64, i64)>, Json(d): Json<Value>) -> R {
    com(&b, |c| db::tipo_por_propriedade(c, id, pid, &d))?;
    Ok(Json(json!({ "ok": true })))
}

async fn tipo_tira_prop(State(b): State<Banco>, Path((id, pid)): Path<(i64, i64)>) -> R {
    com(&b, |c| db::tipo_tira_propriedade(c, id, pid))?;
    Ok(Json(json!({ "ok": true })))
}

async fn criar_prop(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let id = com(&b, |c| db::criar_propriedade(c, &d))?;
    Ok(Json(json!({ "id": id })))
}

async fn atualizar_prop(State(b): State<Banco>, Path(id): Path<i64>, Json(d): Json<Value>) -> R {
    com(&b, |c| db::atualizar_propriedade(c, id, &d))?;
    Ok(Json(json!({ "ok": true })))
}

async fn apagar_prop(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    com(&b, |c| db::apagar_propriedade(c, id))?;
    Ok(Json(json!({ "ok": true })))
}

async fn criar_modelo(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let id = com(&b, |c| db::criar_modelo(c, &d))?;
    Ok(Json(json!({ "id": id })))
}

async fn atualizar_modelo(State(b): State<Banco>, Path(id): Path<i64>, Json(d): Json<Value>) -> R {
    com(&b, |c| db::atualizar_modelo(c, id, &d))?;
    Ok(Json(json!({ "ok": true })))
}

async fn apagar_modelo(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    com(&b, |c| db::apagar_modelo(c, id))?;
    Ok(Json(json!({ "ok": true })))
}

/// Filtro pela query string, o mesmo para itens e linha do tempo:
/// `tipo=1` · `tipos=1,2` · `sem_tipo=1` · `q=texto` · `p.6=F2&p.6=F3` (valores da mesma propriedade = OU)
/// · `de=AAAA-MM-DD&ate=AAAA-MM-DD` (período de atividade)
fn filtro_de(q: &[(String, String)]) -> Filtro {
    let um = |k: &str| q.iter().find(|(x, _)| x == k).map(|(_, v)| v.clone());
    let mut props: Vec<(i64, Vec<String>)> = vec![];
    for (k, v) in q {
        if let Some(pid) = k.strip_prefix("p.").and_then(|id| id.parse::<i64>().ok()) {
            match props.iter_mut().find(|(p, _)| *p == pid) {
                Some((_, l)) => l.push(v.clone()),
                None => props.push((pid, vec![v.clone()])),
            }
        }
    }
    Filtro {
        tipo_id: um("tipo").and_then(|s| s.parse().ok()),
        tipos: um("tipos").map(|s| s.split(',').filter_map(|x| x.trim().parse().ok()).collect()).unwrap_or_default(),
        sem_tipo: um("sem_tipo").is_some_and(|s| s == "1" || s == "true"),
        texto: um("q"),
        props,
        periodo: um("de").zip(um("ate")),
        // d.<id>=AAAA-MM-DD..AAAA-MM-DD (pontas opcionais) ou d.<id>=vazio
        datas: q
            .iter()
            .filter_map(|(k, v)| {
                let pid = k.strip_prefix("d.")?.parse::<i64>().ok()?;
                if v == "vazio" {
                    return Some((pid, None));
                }
                let (de, ate) = v.split_once("..").unwrap_or((v.as_str(), v.as_str()));
                let opc = |s: &str| (!s.is_empty()).then(|| s.to_string());
                Some((pid, Some((opc(de), opc(ate)))))
            })
            .collect(),
        // livre=<id>,<id>: relações em que tudo o que está ligado já foi concluído (ou não há nada)
        livres: um("livre").map(|s| s.split(',').filter_map(|x| x.trim().parse().ok()).collect()).unwrap_or_default(),
        sql: um("sql"),
        ..Default::default()
    }
}

async fn listar(State(b): State<Banco>, Query(q): Query<Vec<(String, String)>>) -> R {
    let filtro = filtro_de(&q);
    let itens = com(&b, |c| db::listar_itens(c, &filtro))?;
    Ok(Json(json!(itens)))
}

/// Linha do tempo: `de` e `ate` (AAAA-MM-DD; padrão = hoje) + o mesmo filtro dos itens.
async fn linha(State(b): State<Banco>, Query(q): Query<Vec<(String, String)>>) -> R {
    let hoje = chrono::Local::now().format("%Y-%m-%d").to_string();
    let um = |k: &str| q.iter().find(|(x, _)| x == k).map(|(_, v)| v.clone());
    let de = um("de").unwrap_or(hoje.clone());
    let ate = um("ate").unwrap_or(de.clone());
    let filtro = Filtro { periodo: None, ..filtro_de(&q) };
    let ev = com(&b, |c| db::linha_do_tempo(c, &de, &ate, &filtro))?;
    Ok(Json(json!(ev)))
}

async fn visoes(State(b): State<Banco>) -> R {
    Ok(Json(json!(com(&b, db::listar_visoes)?)))
}

async fn criar_visao(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let id = com(&b, |c| db::criar_visao(c, &d))?;
    Ok(Json(json!({ "id": id })))
}

async fn atualizar_visao(State(b): State<Banco>, Path(id): Path<i64>, Json(d): Json<Value>) -> R {
    com(&b, |c| db::atualizar_visao(c, id, &d))?;
    Ok(Json(json!({ "ok": true })))
}

async fn apagar_visao(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    com(&b, |c| db::apagar_visao(c, id))?;
    Ok(Json(json!({ "ok": true })))
}

async fn criar_item(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let item = com(&b, |c| {
        let id = db::criar_item(c, &d)?;
        db::ler_item(c, id)
    })?;
    Ok(Json(json!(item)))
}

async fn ler_item(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    Ok(Json(json!(com(&b, |c| db::ler_item(c, id))?)))
}

async fn atualizar_item(State(b): State<Banco>, Path(id): Path<i64>, Json(d): Json<Value>) -> R {
    let item = com(&b, |c| {
        db::atualizar_item(c, id, &d)?;
        db::ler_item(c, id)
    })?;
    Ok(Json(json!(item)))
}

async fn apagar_item(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    com(&b, |c| db::apagar_item(c, id, "Paulo"))?;
    Ok(Json(json!({ "ok": true })))
}

async fn anotar(State(b): State<Banco>, Path(id): Path<i64>, Json(d): Json<Value>) -> R {
    let texto = d.get("texto").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if texto.is_empty() {
        return Err(Erro::Invalido("nota vazia".into()));
    }
    let autor = d.get("autor").and_then(|v| v.as_str()).unwrap_or("Paulo").to_string();
    let nid = com(&b, |c| db::anotar(c, id, &texto, &autor))?;
    Ok(Json(json!({ "id": nid })))
}

async fn editar_nota(State(b): State<Banco>, Path(id): Path<i64>, Json(d): Json<Value>) -> R {
    let texto = d.get("texto").and_then(|v| v.as_str()).unwrap_or("").to_string();
    com(&b, |c| db::editar_nota(c, id, &texto, "Paulo"))?;
    Ok(Json(json!({ "ok": true })))
}

/// Liga (ou desliga, com `"desligar": true`) um item numa propriedade de relação:
/// `{ "prop": <id> ou "Bloqueado por", "para": <id> ou "a3f9c21" }`
async fn ligar(State(b): State<Banco>, Path(id): Path<i64>, Json(d): Json<Value>) -> R {
    com(&b, |c| {
        let prop = db::prop_por_nome_ou_id(c, d.get("prop").unwrap_or(&Value::Null))?;
        let para = match d.get("para") {
            Some(Value::Number(n)) => n.as_i64().ok_or(Erro::Invalido("para inválido".into()))?,
            Some(Value::String(s)) => db::id_por_codigo(c, s)?,
            _ => return Err(Erro::Invalido("informe `para` (o outro documento)".into())),
        };
        let autor = d.get("autor").and_then(|v| v.as_str()).unwrap_or("Paulo");
        db::ligar(c, id, prop, para, d.get("desligar").and_then(|v| v.as_bool()).unwrap_or(false), autor)
    })?;
    Ok(Json(json!({ "ok": true })))
}

/// Um nível da árvore: `?prop=<id>&sentido=aponta|apontado`.
async fn ramo(State(b): State<Banco>, Path(id): Path<i64>, Query(q): Query<Vec<(String, String)>>) -> R {
    let um = |k: &str| q.iter().find(|(x, _)| x == k).map(|(_, v)| v.clone());
    let prop: i64 = um("prop").and_then(|s| s.parse().ok()).ok_or(Erro::Invalido("informe prop".into()))?;
    let sentido = um("sentido").unwrap_or("aponta".into());
    Ok(Json(json!(com(&b, |c| db::ramo(c, id, prop, &sentido))?)))
}

/// Resumo (título, tipo, se está na lixeira) dos itens: `?codigos=a3f9c21,b0c1d2e`.
async fn resumos(State(b): State<Banco>, Query(q): Query<Vec<(String, String)>>) -> R {
    let cods: Vec<String> = q
        .iter()
        .filter(|(k, _)| k == "codigos")
        .flat_map(|(_, v)| v.split(',').map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
        .collect();
    Ok(Json(json!(com(&b, |c| db::resumos(c, &cods))?)))
}

async fn restaurar_nota(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    com(&b, |c| db::restaurar_nota(c, id))?;
    Ok(Json(json!({ "ok": true })))
}

async fn versoes_nota(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    Ok(Json(json!(com(&b, |c| db::versoes(c, "nota", id))?)))
}

async fn versoes_item(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    Ok(Json(json!(com(&b, |c| db::versoes(c, "item", id))?)))
}

async fn restaurar_versao(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    com(&b, |c| db::restaurar_versao(c, id, "Paulo"))?;
    Ok(Json(json!({ "ok": true })))
}

async fn restaurar_item(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    com(&b, |c| db::restaurar_item(c, id, "Paulo"))?;
    Ok(Json(json!({ "ok": true })))
}

async fn lixeira(State(b): State<Banco>) -> R {
    Ok(Json(com(&b, db::lixeira)?))
}

async fn esvaziar_lixeira(State(b): State<Banco>) -> R {
    let (itens, notas) = com(&b, db::esvaziar_lixeira)?;
    Ok(Json(json!({ "itens": itens, "notas": notas })))
}

async fn apagar_de_vez(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    com(&b, |c| db::apagar_de_vez(c, id))?;
    Ok(Json(json!({ "ok": true })))
}

async fn apagar_nota(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    com(&b, |c| db::apagar_nota(c, id))?;
    Ok(Json(json!({ "ok": true })))
}

async fn arquivos_do_item(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    let pasta = com(&b, |c| db::ler_item(c, id))?.pasta;
    Ok(Json(json!(pasta.map(|p| crate::pastas::listar_arquivos(std::path::Path::new(&p))).unwrap_or_default())))
}

/// Copia arquivos para a pasta do item (`destino`: insumos, artefatos ou rascunho; padrão insumos).
/// Cria a pasta no padrão se o item ainda não tiver. Fica nota na linha do tempo.
async fn trazer_arquivos(State(b): State<Banco>, Path(id): Path<i64>, Json(d): Json<Value>) -> R {
    let banc = b.bancada_ativa().ok_or(Erro::Invalido("nenhuma bancada aberta".into()))?;
    let destino = d.get("destino").and_then(|v| v.as_str()).unwrap_or("insumos").to_string();
    let origens: Vec<String> = d
        .get("caminhos")
        .and_then(|v| v.as_array())
        .map(|l| l.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    if origens.is_empty() {
        return Err(Erro::Invalido("nenhum arquivo".into()));
    }
    let nomes = com(&b, |c| {
        let pasta = crate::pastas::criar(c, std::path::Path::new(&banc.caminho), &banc.nome, id, "Paulo")?;
        let nomes = crate::pastas::copiar_para(std::path::Path::new(&pasta), &destino, &origens)?;
        db::anotar(c, id, &format!("Arquivos em {destino}/: {}", nomes.join(", ")), "Paulo")?;
        Ok(nomes)
    })?;
    Ok(Json(json!({ "copiados": nomes })))
}

/// Imagem (ou arquivo) colada no texto: `{ "nome": "print.png", "base64": "..." }` → `insumos/` do item.
async fn colar_arquivo(State(b): State<Banco>, Path(id): Path<i64>, Json(d): Json<Value>) -> R {
    use base64::Engine;
    let banc = b.bancada_ativa().ok_or(Erro::Invalido("nenhuma bancada aberta".into()))?;
    let nome = d.get("nome").and_then(|v| v.as_str()).unwrap_or("colado.png").to_string();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(d.get("base64").and_then(|v| v.as_str()).unwrap_or(""))
        .map_err(|e| Erro::Invalido(format!("conteúdo inválido: {e}")))?;
    if bytes.len() > 50 * 1024 * 1024 {
        return Err(Erro::Invalido("arquivo grande demais para colar (máx. 50 MB): arraste para a página".into()));
    }
    let caminho = com(&b, |c| {
        let pasta = crate::pastas::criar(c, std::path::Path::new(&banc.caminho), &banc.nome, id, "Paulo")?;
        let alvo = crate::pastas::gravar_em_insumos(std::path::Path::new(&pasta), &nome, &bytes)?;
        db::anotar(c, id, &format!("Arquivos em insumos/: {}", alvo.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()), "Paulo")?;
        Ok(alvo)
    })?;
    Ok(Json(json!({ "caminho": caminho })))
}

/// Grava um relatório em markdown em `<bancada>/relatorios/<nome>.md` (sem sobrescrever).
async fn salvar_relatorio(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let banc = b.bancada_ativa().ok_or(Erro::Invalido("nenhuma bancada aberta".into()))?;
    let nome = d.get("nome").and_then(|v| v.as_str()).unwrap_or("relatorio");
    let limpo: String = nome.chars().map(|c| if c.is_alphanumeric() || "-_".contains(c) { c } else { '-' }).collect();
    let dir = std::path::Path::new(&banc.caminho).join("relatorios");
    std::fs::create_dir_all(&dir).map_err(|e| Erro::Invalido(e.to_string()))?;
    let mut alvo = dir.join(format!("{limpo}.md"));
    let mut n = 2;
    while alvo.exists() {
        alvo = dir.join(format!("{limpo} ({n}).md"));
        n += 1;
    }
    std::fs::write(&alvo, d.get("conteudo").and_then(|v| v.as_str()).unwrap_or("")).map_err(|e| Erro::Invalido(e.to_string()))?;
    Ok(Json(json!({ "caminho": alvo })))
}

/// O hook de um agente avisou (`atelier-mcp hook <evento>`): a tela acende o status do workspace daquele terminal.
async fn evento_do_agente(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let sessao = d.get("sessao").and_then(|v| v.as_u64()).ok_or(Erro::Invalido("falta a sessao".into()))?;
    let estado = d.get("estado").and_then(|v| v.as_str()).unwrap_or("");
    if !["trabalhando", "esperando", "terminou"].contains(&estado) {
        return Err(Erro::Invalido("estado: trabalhando, esperando ou terminou".into()));
    }
    let _ = b.tela.send(json!({ "acao": "agente", "sessao": sessao, "estado": estado }).to_string());
    Ok(Json(json!({ "ok": true })))
}

async fn instalar_hooks(Path(id): Path<String>) -> R {
    Ok(Json(tokio::task::spawn_blocking(move || crate::hooks::aplicar(&id, true)).await.map_err(|e| Erro::Invalido(e.to_string()))??))
}

async fn remover_hooks(Path(id): Path<String>) -> R {
    Ok(Json(tokio::task::spawn_blocking(move || crate::hooks::aplicar(&id, false)).await.map_err(|e| Erro::Invalido(e.to_string()))??))
}

async fn listar_consultas(State(b): State<Banco>) -> R {
    Ok(Json(json!(com(&b, crate::consultas::listar)?)))
}

/// Salva (com `id`, atualiza) uma consulta: `{ id?, nome, sql }`.
async fn salvar_consulta(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let id = d.get("id").and_then(|v| v.as_i64());
    let nome = d.get("nome").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let sql = d.get("sql").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let id = com(&b, |c| crate::consultas::salvar(c, id, &nome, &sql))?;
    Ok(Json(json!({ "id": id })))
}

async fn apagar_consulta(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    com(&b, |c| crate::consultas::apagar(c, id))?;
    Ok(Json(json!({ "ok": true })))
}

/// Roda um SQL só de leitura: `{ sql }` → colunas e linhas.
async fn rodar_consulta(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let sql = d.get("sql").and_then(|v| v.as_str()).unwrap_or("").to_string();
    Ok(Json(com(&b, |c| crate::consultas::rodar(c, &sql))?))
}

/// A lista ao vivo de dentro do texto (bloco `atelier-lista`): `codigo` é o documento onde ela está ("este") e
/// `config` vem com nomes (tipos, relacao, ordenar), como o bloco escreve. O mesmo motor da lista dinâmica.
async fn lista_no_texto(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let codigo = d.get("codigo").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let config = d.get("config").cloned().unwrap_or(json!({}));
    let itens = com(&b, |c| {
        let cfg = db::config_de_lista(c, &config)?;
        db::lista_dinamica(c, &codigo, &cfg)
    })?;
    Ok(Json(json!(itens)))
}

/// Abre um arquivo no programa padrão do sistema.
async fn abrir_arquivo(Json(d): Json<Value>) -> R {
    let caminho = d.get("caminho").and_then(|v| v.as_str()).unwrap_or("");
    let p = std::path::Path::new(caminho);
    if !p.is_absolute() || !p.exists() {
        return Err(Erro::Invalido("arquivo não encontrado".into()));
    }
    let r = if cfg!(windows) {
        std::process::Command::new("explorer").arg(p).spawn()
    } else {
        std::process::Command::new(if cfg!(target_os = "macos") { "open" } else { "xdg-open" }).arg(p).spawn()
    };
    r.map_err(|e| Erro::Invalido(format!("não consegui abrir: {e}")))?;
    Ok(Json(json!({ "ok": true })))
}

/// Cria a pasta de trabalho do item dentro da bancada aberta.
async fn criar_pasta(State(b): State<Banco>, Path(id): Path<i64>) -> R {
    let banc = b.bancada_ativa().ok_or(Erro::Invalido("nenhuma bancada aberta".into()))?;
    let caminho = com(&b, |c| crate::pastas::criar(c, std::path::Path::new(&banc.caminho), &banc.nome, id, "Paulo"))?;
    Ok(Json(json!({ "pasta": caminho })))
}

/// Abre a pasta no gerenciador de arquivos (Explorer no Windows, xdg-open no Linux); cria se não existir.
async fn abrir_pasta(Json(d): Json<Value>) -> R {
    let caminho = d.get("caminho").and_then(|v| v.as_str()).unwrap_or("").trim();
    if caminho.is_empty() {
        return Err(Erro::Invalido("caminho vazio".into()));
    }
    let p = std::path::Path::new(caminho);
    if !p.is_absolute() {
        return Err(Erro::Invalido("use um caminho absoluto".into()));
    }
    std::fs::create_dir_all(p).map_err(|e| Erro::Invalido(format!("não consegui criar a pasta: {e}")))?;
    let com = d.get("com").and_then(|v| v.as_str()).unwrap_or("arquivos");
    // "app:claude", "app:codex"...: um agente com janela própria, fora do atelier (ver `apps`)
    if let Some(app) = com.strip_prefix("app:") {
        let foi = crate::apps::abrir(app, p).map_err(|e| Erro::Invalido(format!("não consegui abrir ({app}): {e}")))?;
        return Ok(Json(json!({ "ok": true, "pasta": foi })));
    }
    abrir_com(com, p).map_err(|e| Erro::Invalido(format!("não consegui abrir ({com}): {e}")))?;
    Ok(Json(json!({ "ok": true })))
}

/// Abre a pasta no gerenciador de arquivos, no VS Code ou num terminal do sistema.
fn abrir_com(com: &str, p: &std::path::Path) -> std::io::Result<()> {
    use std::process::Command;
    let tem = crate::integracoes::no_path;
    let mut c = match (com, cfg!(windows)) {
        ("vscode", true) => {
            let mut c = Command::new("cmd");
            c.args(["/C", "code"]).arg(p);
            c
        }
        ("vscode", false) => {
            let mut c = Command::new("code");
            c.arg(p);
            c
        }
        ("terminal", true) if tem("wt") => {
            let mut c = Command::new("wt");
            c.arg("-d").arg(p);
            c
        }
        ("terminal", true) => {
            let shell = if tem("pwsh") { "pwsh" } else { "powershell" };
            let mut c = Command::new("cmd");
            c.args(["/C", "start", "", shell, "-NoExit"]);
            c
        }
        ("terminal", false) => {
            let candidatos: [(&str, &[&str]); 6] = [
                ("x-terminal-emulator", &[]),
                ("gnome-terminal", &[]),
                ("konsole", &[]),
                ("xfce4-terminal", &[]),
                ("kitty", &[]),
                ("alacritty", &[]),
            ];
            let (bin, args) = candidatos.iter().find(|(b, _)| tem(b)).copied().unwrap_or(("xterm", &[]));
            let mut c = Command::new(bin);
            c.args(args);
            c
        }
        _ => {
            let abridor = if cfg!(windows) { "explorer" } else if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
            let mut c = Command::new(abridor);
            c.arg(p);
            c
        }
    };
    c.current_dir(p);
    #[cfg(windows)]
    if com == "vscode" {
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000); // sem janela de console piscando
    }
    c.spawn().map(|_| ())
}

// ---------- bancadas ----------

fn cfg_de(b: &Banco) -> std::sync::MutexGuard<'_, Config> {
    b.cfg.lock().unwrap_or_else(|e| e.into_inner())
}

fn caminho_de(d: &Value) -> db::Res<String> {
    d.get("caminho")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or(Erro::Invalido("informe o caminho da bancada".into()))
}

async fn bancadas(State(b): State<Banco>) -> R {
    let cfg = cfg_de(&b);
    Ok(Json(json!({
        "ativa": cfg.ativa(),
        "bancadas": cfg.bancadas,
        "sugestao": bancada::raiz_sugerida(),
        "pasta_atelier": bancada::pasta_atelier(),
        "separador": std::path::MAIN_SEPARATOR.to_string(),
    })))
}

// a CLI do Claude e a escrita de arquivos bloqueiam: fora do runtime assíncrono
async fn instalar_integracao(Path(id): Path<String>) -> R {
    let r = tokio::task::spawn_blocking(move || crate::integracoes::aplicar(&id, true))
        .await
        .map_err(|e| Erro::Invalido(e.to_string()))??;
    Ok(Json(r))
}

async fn remover_integracao(Path(id): Path<String>) -> R {
    let r = tokio::task::spawn_blocking(move || crate::integracoes::aplicar(&id, false))
        .await
        .map_err(|e| Erro::Invalido(e.to_string()))??;
    Ok(Json(r))
}

/// Grava um relatório exportado: `{ "nome": "...", "ext": "md|html|csv|xlsx|json", "texto": "..." | "planilha": {...},
/// "destino": "<caminho escolhido>" }`. Sem destino, vai para `<bancada>/relatorios/` (sem sobrescrever).
async fn exportar(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let ext = d.get("ext").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let alvo = match d.get("destino").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
        Some(p) => {
            let p = std::path::PathBuf::from(p);
            if !p.is_absolute() {
                return Err(Erro::Invalido("destino precisa ser um caminho completo".into()));
            }
            p
        }
        None => {
            let banc = b.bancada_ativa().ok_or(Erro::Invalido("nenhuma bancada aberta".into()))?;
            let nome = d.get("nome").and_then(|v| v.as_str()).unwrap_or("relatorio");
            crate::exportar::livre_em(&std::path::Path::new(&banc.caminho).join("relatorios"), nome, &ext)
        }
    };
    let a = alvo.clone();
    tokio::task::spawn_blocking(move || crate::exportar::gravar(&a, &d)).await.map_err(|e| Erro::Invalido(e.to_string()))??;
    Ok(Json(json!({ "caminho": alvo })))
}

/// Ações que a tela entende (o MCP `tela` e o Comando do app usam esta lista).
pub const ACOES_TELA: &str = "abrir (codigo | visao | pasta | arquivo | lixeira | tipo | lista), workspace, fechar_workspace, renomear_workspace, \
visao_geral, dividir, juntar, modo, fechar, focar, terminal, explorador_sistema, barra_lateral, tema, zoom, configuracoes, \
busca, recarregar, filtrar, destacar, estado";

/// Pedido para a tela do app. `lado: "esquerda" | "direita"` escolhe a metade do painel (a direita nasce se o painel
/// não está dividido); `ao_lado: true` abre numa janela nova em vez de trocar a atual. A tela faz; aqui só se confere
/// e se traduz (código → id, nome → id, item → pasta).
/// Erros da interface (a tela que quebrou), em `~/atelier/erros.log`: para achar a causa depois. Passando de 1 MB, o
/// arquivo recomeça (o antigo vira `erros.log.1`).
async fn gravar_log(Json(d): Json<Value>) -> R {
    use std::io::Write;
    let caminho = crate::bancada::pasta_atelier().join("erros.log");
    if std::fs::metadata(&caminho).map(|m| m.len() > 1_048_576).unwrap_or(false) {
        let _ = std::fs::rename(&caminho, caminho.with_extension("log.1"));
    }
    let agora = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let txt = |k: &str| d.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let linha = format!("[{agora}] {} ({})
{}
{}

", txt("erro"), txt("onde"), txt("pilha"), txt("componentes"));
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&caminho) {
        let _ = f.write_all(linha.as_bytes());
    }
    Ok(Json(json!({ "ok": true, "arquivo": caminho })))
}

async fn tela(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let acao = d.get("acao").and_then(|v| v.as_str()).unwrap_or("");
    let txt = |k: &str| d.get(k).and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let sim = |k: &str| d.get(k).and_then(|v| v.as_bool());
    let mut ev = json!({ "acao": acao, "ao_lado": sim("ao_lado").unwrap_or(false) });
    match txt("lado").as_deref() {
        Some("esquerda") => ev["metade"] = json!(0),
        Some("direita") => ev["metade"] = json!(1),
        Some(outro) => return Err(Erro::Invalido(format!("lado: esquerda ou direita (veio {outro})"))),
        None => {}
    }
    // painel: 0, 1... (o mesmo número que o "estado" mostra); vale mais que o lado
    if let Some(n) = d.get("painel").and_then(|v| v.as_u64()) {
        if n > 1 {
            return Err(Erro::Invalido(format!("painel: 0 ou 1 (veio {n}); por enquanto o painel se divide em dois")));
        }
        ev["metade"] = json!(n);
    }
    let banc = || b.bancada_ativa().ok_or(Erro::Invalido("nenhuma bancada aberta".into()));
    // pasta do item (criada no padrão, se ainda não tem), com o título dele
    let pasta_do = |codigo: &str| -> Result<(String, String), Erro> {
        let bc = banc()?;
        Ok(com(&b, |c2| {
            let id = db::id_por_codigo(c2, codigo)?;
            let raiz = crate::pastas::criar(c2, std::path::Path::new(&bc.caminho), &bc.nome, id, "Agente")?;
            Ok((raiz, db::ler_item(c2, id)?.titulo))
        })?)
    };
    match acao {
        "abrir" => {
            if let Some(c) = txt("pasta") {
                let (raiz, titulo) = pasta_do(&c)?;
                ev["rota"] = json!({ "v": "pastas", "raiz": raiz, "titulo": titulo });
            } else if let Some(arq) = txt("arquivo") {
                let p = std::path::Path::new(&arq);
                if !p.is_absolute() || !p.is_file() {
                    return Err(Erro::Invalido(format!("arquivo não encontrado: {arq}")));
                }
                let raiz = p.parent().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
                let nome = p.file_name().map(|x| x.to_string_lossy().to_string()).unwrap_or_default();
                ev["rota"] = json!({ "v": "arquivos", "raiz": raiz, "arquivo": arq, "titulo": nome });
            } else if let Some(c) = txt("codigo") {
                let id = com(&b, |c2| db::id_por_codigo(c2, &c))?;
                ev["rota"] = json!({ "v": "item", "id": id });
            } else if let Some(nome) = txt("visao") {
                let vs = com(&b, db::listar_visoes)?;
                let v = vs
                    .iter()
                    .find(|v| v.nome.to_lowercase() == nome.to_lowercase())
                    .ok_or_else(|| Erro::NaoEncontrado(format!("visão \"{nome}\" (visões: {})", vs.iter().map(|v| v.nome.as_str()).collect::<Vec<_>>().join(", "))))?;
                ev["rota"] = json!({ "v": "visao", "id": v.id });
            } else if let Some(nome) = txt("tipo") {
                let esq = com(&b, db::esquema)?;
                let t = esq["tipos"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .find(|t| t["nome"].as_str().is_some_and(|n| n.to_lowercase() == nome.to_lowercase()))
                    .ok_or_else(|| Erro::NaoEncontrado(format!("tipo \"{nome}\"")))?;
                ev["rota"] = json!({ "v": "tipo", "id": t["id"] });
            } else if sim("lixeira") == Some(true) {
                ev["rota"] = json!({ "v": "lixeira" });
            } else if let Some(l) = d.get("lista").filter(|v| v.is_object()) {
                // lista avulsa: abre como visão sem salvar (o MCP já traduziu nomes para ids)
                ev["rota"] = json!({ "v": "consulta", "titulo": l.get("titulo").and_then(|v| v.as_str()).unwrap_or("Lista"),
                    "icone": l.get("icone").and_then(|v| v.as_str()).unwrap_or("🔗"), "filtro": l.get("filtro").cloned().unwrap_or(json!({})), "config": l.get("config").cloned().unwrap_or(json!({})),
                    "layout": l.get("layout").and_then(|v| v.as_str()).unwrap_or("tabela") });
            } else {
                return Err(Erro::Invalido("abrir: informe codigo (documento), visao, tipo (a configuração dele), pasta (código do documento), arquivo (caminho), lista (temporária) ou lixeira: true".into()));
            }
        }
        // workspace do item (codigo) ou o da bancada (sem codigo); fechar_workspace suspende (os terminais param)
        "workspace" | "fechar_workspace" | "renomear_workspace" => {
            if let Some(c) = txt("codigo") {
                let it = com(&b, |c2| db::id_por_codigo(c2, &c).and_then(|id| db::ler_item(c2, id)))?;
                ev["item"] = json!({ "id": it.id, "titulo": it.titulo });
            }
            // renomear: nome vazio volta ao título do documento
            if acao == "renomear_workspace" {
                ev["nome"] = json!(d.get("nome").and_then(|v| v.as_str()).unwrap_or("").trim());
            }
        }
        "modo" => {
            let m = txt("modo").unwrap_or_default();
            if !["abas", "tile", "fita"].contains(&m.as_str()) {
                return Err(Erro::Invalido("modo: abas, tile ou fita".into()));
            }
            ev["modo"] = json!(m);
        }
        // fechar: "atual" (padrão), "todas" ou parte do título da janela
        "fechar" => ev["janela"] = json!(txt("janela").unwrap_or("atual".into())),
        // focar: a janela pelo id (do "estado") ou o painel/lado
        "focar" => {
            if let Some(j) = txt("janela") {
                ev["janela"] = json!(j);
            } else if ev.get("metade").is_none() {
                return Err(Erro::Invalido("focar: informe janela (id do estado), painel (0, 1) ou lado".into()));
            }
        }
        // terminal ou agente: na pasta do item (codigo), na raiz da bancada (bancada: true) ou na pasta do workspace aberto
        "terminal" => {
            if let Some(c) = txt("codigo") {
                let (raiz, titulo) = pasta_do(&c)?;
                ev["cwd"] = json!(raiz);
                ev["titulo"] = json!(titulo);
            } else if sim("bancada") == Some(true) {
                ev["cwd"] = json!(banc()?.caminho);
            }
            ev["programa"] = json!(txt("programa"));
            ev["shell"] = json!(txt("shell"));
        }
        // o Explorer do Windows (ou o gerenciador do Linux) na pasta do item ou da bancada: feito aqui mesmo
        "explorador_sistema" => {
            let pasta = match txt("codigo") {
                Some(c) => pasta_do(&c)?.0,
                None => banc()?.caminho,
            };
            let p = std::path::Path::new(&pasta);
            // app = claude|codex|deepseek: abre o agente com janela própria na pasta, em vez do Explorer
            if let Some(app) = txt("app") {
                let foi = crate::apps::abrir(&app, p).map_err(Erro::Invalido)?;
                return Ok(Json(json!({ "ok": true, "pasta": pasta, "app": app, "pasta_foi_junto": foi })));
            }
            abrir_com("arquivos", p).map_err(|e| Erro::Invalido(e.to_string()))?;
            return Ok(Json(json!({ "ok": true, "pasta": pasta })));
        }
        "barra_lateral" => ev["mostrar"] = json!(sim("mostrar").unwrap_or(true)),
        "tema" => {
            let t = txt("tema").unwrap_or_default();
            if !crate::temas::existe(&t) {
                let nomes: Vec<String> = crate::temas::listar().iter().filter_map(|x| x["id"].as_str().map(String::from)).collect();
                return Err(Erro::Invalido(format!("tema \"{t}\" não existe (claro, escuro, nord, {})", nomes.join(", "))));
            }
            ev["tema"] = json!(t);
        }
        "zoom" => ev["zoom"] = json!(d.get("zoom").and_then(|v| v.as_u64()).unwrap_or(100).clamp(80, 160)),
        // aparencia, geral, bancadas, integracoes, editor, atalhos, automacao (do app) · bancada, tipos (da bancada)
        "configuracoes" => ev["secao"] = json!(txt("secao").unwrap_or("aparencia".into())),
        "busca" => ev["texto"] = json!(txt("texto").unwrap_or_default()),
        "destacar" => ev["codigo"] = json!(txt("codigo").ok_or(Erro::Invalido("destacar: informe codigo".into()))?.trim_start_matches('#').to_lowercase()),
        "filtrar" => ev["texto"] = json!(txt("texto").unwrap_or_default()),
        // o que está na tela agora (a tela manda a cada mudança)
        "estado" => {
            let e = b.tela_estado.lock().unwrap_or_else(|e| e.into_inner()).get(&b.chave_da_tela()).cloned().unwrap_or_default();
            if e.is_empty() {
                return Ok(Json(json!({ "ok": false, "estado": "o app não informou a tela (está aberto?)" })));
            }
            // a tela só conhece o id do documento; o agente usa o código
            let e = com(&b, |c| Ok(codigos_no_estado(c, &e))).unwrap_or(e);
            return Ok(Json(json!({ "ok": true, "estado": e })));
        }
        // o agente pediu para trocar de bancada: a tela pergunta ao Paulo
        "pedir_bancada" => {
            ev["caminho"] = json!(txt("caminho").ok_or(Erro::Invalido("pedir_bancada: informe o caminho".into()))?);
            ev["nome"] = json!(txt("nome").unwrap_or_default());
        }
        "recarregar" | "dividir" | "juntar" | "visao_geral" => {}
        outro => return Err(Erro::Invalido(format!("ação desconhecida: {outro} (ações: {ACOES_TELA}). Se for algo que a tela devia saber fazer, registre com nao_consigo."))),
    }
    // só a janela desta bancada faz (as outras ignoram)
    ev["bancada"] = json!(b.chave_da_tela());
    let telas = b.tela.send(ev.to_string()).unwrap_or(0);
    Ok(Json(json!({ "ok": telas > 0, "telas": telas })))
}

/// "documento (id 54)" vira "documento #a3f9c21" no estado da tela.
fn codigos_no_estado(c: &rusqlite::Connection, e: &str) -> String {
    let mut saida = String::with_capacity(e.len());
    let mut resto = e;
    while let Some(i) = resto.find("documento (id ") {
        saida.push_str(&resto[..i]);
        let depois = &resto[i + "documento (id ".len()..];
        let fim = depois.find(')').unwrap_or(0);
        let codigo: Option<String> = depois[..fim].parse::<i64>().ok().and_then(|id| {
            c.query_row("SELECT codigo FROM itens WHERE id = ?", [id], |r| r.get::<_, Option<String>>(0)).ok().flatten()
        });
        match codigo {
            Some(cod) => {
                saida.push_str(&format!("documento #{cod}"));
                resto = &depois[fim + 1..];
            }
            None => {
                saida.push_str("documento (id ");
                resto = depois;
            }
        }
    }
    saida.push_str(resto);
    saida
}

/// A tela conta o que está mostrando (bancada, workspace, janelas de cada metade), para o agente saber onde está.
async fn tela_estado(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let chave = b.chave_da_tela();
    b.tela_estado.lock().unwrap_or_else(|e| e.into_inner()).insert(chave, d.get("texto").and_then(|v| v.as_str()).unwrap_or("").to_string());
    Ok(Json(json!({ "ok": true })))
}

/// Onde estão os pedidos anotados e quantos ainda estão em aberto (`- [ ]`).
async fn pedidos() -> R {
    let arq = bancada::pasta_atelier().join("pedidos-ao-atelier.md");
    let abertos = std::fs::read_to_string(&arq).map(|t| t.lines().filter(|l| l.starts_with("- [ ]")).count()).unwrap_or(0);
    Ok(Json(json!({ "arquivo": arq, "existe": arq.exists(), "abertos": abertos })))
}

/// O agente não soube fazer algo pelo atelier: anota em `~/atelier/pedidos-ao-atelier.md` e avisa na tela.
async fn falta(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let pedido = d.get("pedido").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let motivo = d.get("motivo").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let agente = d.get("agente").and_then(|v| v.as_str()).unwrap_or("Agente").to_string();
    let arquivo = bancada::anotar_pedido(&pedido, &motivo, &agente)?;
    let _ = b.tela.send(json!({ "acao": "falta", "texto": pedido, "motivo": motivo, "arquivo": arquivo, "agente": agente, "bancada": b.chave_da_tela() }).to_string());
    Ok(Json(json!({ "ok": true, "arquivo": arquivo })))
}

/// Websocket por onde a tela recebe os pedidos acima (só da janela do atelier).
async fn tela_eventos(State(b): State<Banco>, ws: axum::extract::WebSocketUpgrade, headers: axum::http::HeaderMap) -> axum::response::Response {
    let origem = headers.get("origin").and_then(|v| v.to_str().ok()).unwrap_or("");
    if !crate::terminal::origem_permitida(origem) {
        return (StatusCode::FORBIDDEN, "origem não permitida").into_response();
    }
    let mut rx = b.tela.subscribe();
    ws.on_upgrade(move |mut s| async move {
        use axum::extract::ws::Message;
        loop {
            tokio::select! {
                m = rx.recv() => match m {
                    Ok(t) => if s.send(Message::Text(t.into())).await.is_err() { break },
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                },
                m = s.recv() => if !matches!(m, Some(Ok(_))) { break },
            }
        }
    })
}

async fn agentes(State(b): State<Banco>) -> R {
    let prefs = cfg_de(&b).preferencias.clone();
    let lista = tokio::task::spawn_blocking(move || crate::agentes::listar(&prefs)).await.map_err(|e| Erro::Invalido(e.to_string()))?;
    let shells: Vec<Value> = crate::agentes::shells().into_iter().map(|(id, nome, p)| json!({ "id": id, "nome": nome, "caminho": p })).collect();
    Ok(Json(json!({ "agentes": lista, "shells": shells })))
}

async fn testar_agente(Path(id): Path<String>) -> R {
    tokio::task::spawn_blocking(move || Ok(Json(crate::agentes::testar(&id)))).await.map_err(|e| Erro::Invalido(e.to_string()))?
}

/// Chama um agente sem terminal: `{ "agente": "claude-code", "prompt": "...", "uso": "prompt" | "executor",
/// "item": <id> (roda na pasta do item, se tiver) }`. Responde quando ele termina (até 10 min).
async fn executar(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let id = d.get("agente").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let uso = d.get("uso").and_then(|v| v.as_str()).unwrap_or("executor").to_string();
    if uso != "prompt" && uso != "executor" {
        return Err(Erro::Invalido("uso: prompt ou executor".into()));
    }
    let prompt = d.get("prompt").and_then(|v| v.as_str()).unwrap_or("").to_string();
    if prompt.trim().is_empty() {
        return Err(Erro::Invalido("pedido vazio".into()));
    }
    let prefs = cfg_de(&b).preferencias.clone();
    let (_, exe, modelo) = tokio::task::spawn_blocking(move || {
        crate::agentes::habilitado(&prefs, &id, &uso).map(|(c, e, m)| (c.id, e, m))
    })
    .await
    .map_err(|e| Erro::Invalido(e.to_string()))??;
    let cwd = match d.get("item").and_then(|v| v.as_i64()) {
        Some(i) => com(&b, |c| db::ler_item(c, i))?.pasta.map(std::path::PathBuf::from),
        None => None,
    };
    let r = crate::agentes::executar(exe, &modelo, &prompt, cwd, std::time::Duration::from_secs(600)).await?;
    Ok(Json(r))
}

/// O que o agente do Comando sabe de saída (o pedido e o estado da tela vêm junto, da tela).
const COMANDO_INSTRUCOES: &str = "Você é o agente do app atelier (gestão pessoal do usuário: documentos com propriedades, visões, \
bancadas). O usuário fala com você por uma caixa de comando do app, muitas vezes ditando por voz (pode vir com erros de \
transcrição). Faça o que ele pede usando SÓ as ferramentas do MCP `atelier`: `bancadas`/`trocar_bancada` para mudar de \
bancada; `buscar`/`ler_documento`/`esquema` para achar as coisas; `criar_documento`/`atualizar_documento`/`anotar` para mudar; `tela` para \
mostrar (abrir documento, visão, a pasta do documento em árvore, um arquivo; `lado: direita|esquerda` escolhe a metade do painel; \
`workspace` abre o workspace de um documento ou o da bancada). Quando ele disser \"abre\", \"mostra\", \"me dá uma olhada\", \
abra na tela. Não mexa em arquivos fora das pastas dos documentos e não rode comandos no computador. Não peça confirmação para \
coisas simples e reversíveis; para apagar, pergunte. Responda em português, curto (uma ou duas frases dizendo o que fez \
ou o que não achou).";

/// Comando do app: `{ "agente": "claude-code", "pedido": "...", "contexto": "estado da tela", "conversa":
/// [{"pedido", "resposta"}...] }`. Chama o agente (uso "comando") com tudo junto e responde quando ele termina.
async fn comando(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let id = d.get("agente").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let pedido = d.get("pedido").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    if pedido.is_empty() {
        return Err(Erro::Invalido("pedido vazio".into()));
    }
    let prefs = cfg_de(&b).preferencias.clone();
    let (_, exe, modelo) = tokio::task::spawn_blocking(move || {
        crate::agentes::habilitado(&prefs, &id, "comando").map(|(c, e, m)| (c.id, e, m))
    })
    .await
    .map_err(|e| Erro::Invalido(e.to_string()))??;
    let mut prompt = format!("{COMANDO_INSTRUCOES}\n\n## Agora na tela\n{}\n", d.get("contexto").and_then(|v| v.as_str()).unwrap_or("(sem informação)"));
    if let Some(l) = d.get("conversa").and_then(|v| v.as_array()).filter(|l| !l.is_empty()) {
        prompt.push_str("\n## Conversa até aqui\n");
        for t in l {
            prompt.push_str(&format!(
                "- Usuário: {}\n  Você: {}\n",
                t.get("pedido").and_then(|v| v.as_str()).unwrap_or(""),
                t.get("resposta").and_then(|v| v.as_str()).unwrap_or("")
            ));
        }
    }
    prompt.push_str(&format!("\n## Pedido\n{pedido}\n"));
    // roda na pasta do atelier (fora de qualquer projeto): o agente só tem o MCP para trabalhar
    let cwd = Some(bancada::pasta_atelier());
    let r = crate::agentes::executar(exe, &modelo, &prompt, cwd, std::time::Duration::from_secs(600)).await?;
    Ok(Json(r))
}

async fn backups(State(b): State<Banco>) -> R {
    let banc = b.bancada_ativa().ok_or(Erro::Invalido("nenhuma bancada aberta".into()))?;
    let p = std::path::Path::new(&banc.caminho);
    Ok(Json(json!({ "pasta": crate::manutencao::pasta_backups(p), "copias": crate::manutencao::listar(p) })))
}

async fn backup_agora(State(b): State<Banco>) -> R {
    let banc = b.bancada_ativa().ok_or(Erro::Invalido("nenhuma bancada aberta".into()))?;
    let manter = cfg_de(&b).preferencias.backup.manter;
    let p = com(&b, |c| crate::manutencao::fazer_backup(c, std::path::Path::new(&banc.caminho), manter))?;
    Ok(Json(json!({ "caminho": p })))
}

async fn preferencias(State(b): State<Banco>) -> R {
    Ok(Json(json!(cfg_de(&b).preferencias)))
}

async fn mudar_preferencias(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let mut cfg = cfg_de(&b);
    if let Some(t) = d.get("tema").and_then(|v| v.as_str()) {
        if !crate::temas::existe(t) {
            return Err(Erro::Invalido(format!("tema desconhecido: {t}")));
        }
        cfg.preferencias.tema = t.into();
    }
    if let Some(i) = d.get("idioma").and_then(|v| v.as_str()) {
        cfg.preferencias.idioma = i.into();
    }
    // zoom, backup, captura, lixeira: mescla só o que veio
    let mut atual = serde_json::to_value(&cfg.preferencias).map_err(|e| Erro::Invalido(e.to_string()))?;
    for chave in ["zoom", "backup", "captura", "lixeira", "editor", "agentes", "atualizacao", "atalhos", "janela"] {
        match (d.get(chave), atual.get_mut(chave)) {
            (Some(Value::Object(novo)), Some(Value::Object(velho))) => velho.extend(novo.clone()),
            (Some(v), Some(velho)) if !v.is_object() => *velho = v.clone(),
            _ => {}
        }
    }
    let antes = cfg.preferencias.janela.clone();
    cfg.preferencias = serde_json::from_value(atual).map_err(|e| Erro::Invalido(format!("preferência inválida: {e}")))?;
    let j = &cfg.preferencias.janela;
    if (j.iniciar_com_sistema, j.iniciar_escondido) != (antes.iniciar_com_sistema, antes.iniciar_escondido) {
        crate::arvore::iniciar_com_sistema(j.iniciar_com_sistema, j.iniciar_escondido).map_err(Erro::Invalido)?;
    }
    bancada::salvar(&cfg)?;
    Ok(Json(json!(cfg.preferencias)))
}

/// Cria uma bancada nova ou acrescenta uma pasta que já é bancada. `"ativar": true` já abre.
async fn criar_bancada(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let caminho = caminho_de(&d)?;
    let nome = d.get("nome").and_then(|v| v.as_str()).unwrap_or("");
    let nova = {
        let mut cfg = cfg_de(&b);
        let nova = cfg.acrescentar(nome, &caminho)?;
        // garante o banco criado e migrado já agora (nasce limpo: só a visão Todos os itens)
        db::abrir(&bancada::banco_da(&nova.caminho))?;
        bancada::salvar(&cfg)?;
        nova
    };
    if d.get("ativar").and_then(|v| v.as_bool()).unwrap_or(false) {
        ativar(&b, &nova.caminho)?;
    }
    Ok(Json(json!(nova)))
}

fn ativar(b: &Banco, caminho: &str) -> db::Res<Bancada> {
    let mut cfg = cfg_de(b);
    let alvo = cfg
        .bancadas
        .iter()
        .find(|x| bancada::mesmo_caminho(&x.caminho, caminho.trim()))
        .cloned()
        .ok_or(Erro::NaoEncontrado("bancada".into()))?;
    let nova = db::abrir(&bancada::banco_da(&alvo.caminho))?;
    *b.conn.lock().unwrap_or_else(|e| e.into_inner()) = nova;
    cfg.ativa = Some(alvo.caminho.clone());
    bancada::salvar(&cfg)?;
    Ok(alvo)
}

async fn ativar_bancada(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let nova = ativar(&b, &caminho_de(&d)?)?;
    // a tela troca junto (quem pediu pode ter sido o agente, pelo MCP)
    let _ = b.tela.send(json!({ "acao": "bancada" }).to_string());
    Ok(Json(json!(nova)))
}

async fn renomear_bancada(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let mut cfg = cfg_de(&b);
    cfg.renomear(&caminho_de(&d)?, d.get("nome").and_then(|v| v.as_str()).unwrap_or(""))?;
    bancada::salvar(&cfg)?;
    Ok(Json(json!({ "ok": true })))
}

async fn remover_bancada(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let mut cfg = cfg_de(&b);
    cfg.remover(&caminho_de(&d)?)?;
    bancada::salvar(&cfg)?;
    Ok(Json(json!({ "ok": true })))
}
