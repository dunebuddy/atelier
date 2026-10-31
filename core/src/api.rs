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

/// Estado do app: a conexão da bancada aberta e a lista de bancadas. Trocar de bancada troca a conexão.
pub struct Estado {
    conn: Mutex<Connection>,
    cfg: Mutex<Config>,
    /// pedidos para a tela (vindos do MCP): abrir, recarregar, filtrar, destacar
    tela: tokio::sync::broadcast::Sender<String>,
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
        Ok(Arc::new(Estado { conn: Mutex::new(conn), cfg: Mutex::new(cfg), tela: tokio::sync::broadcast::channel(64).0 }))
    }

    pub fn bancada_ativa(&self) -> Option<Bancada> {
        self.cfg.lock().unwrap_or_else(|e| e.into_inner()).ativa().cloned()
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

fn com<T>(b: &Banco, f: impl FnOnce(&Connection) -> db::Res<T>) -> db::Res<T> {
    let conn = b.conn.lock().unwrap_or_else(|e| e.into_inner());
    f(&conn)
}

pub fn rotas(banco: Banco) -> Router {
    let cors = CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://localhost:1420"),
            HeaderValue::from_static("http://tauri.localhost"),
            HeaderValue::from_static("tauri://localhost"),
        ])
        .allow_methods([Method::GET, Method::POST, Method::PATCH, Method::PUT, Method::DELETE])
        .allow_headers([axum::http::header::CONTENT_TYPE]);

    Router::new()
        .route("/api/saude", get(|| async { Json(json!({ "ok": true, "app": "atelier", "versao": env!("CARGO_PKG_VERSION") })) }))
        .route("/api/esquema", get(esquema))
        .route("/api/tipos", post(criar_tipo))
        .route("/api/tipos/{id}", patch(atualizar_tipo).delete(apagar_tipo))
        .route("/api/tipos/{id}/propriedades/{pid}", axum::routing::put(tipo_poe_prop).delete(tipo_tira_prop))
        .route("/api/propriedades", post(criar_prop))
        .route("/api/propriedades/{id}", patch(atualizar_prop).delete(apagar_prop))
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
        .route("/api/resumos", get(resumos))
        .route("/api/versoes/{id}/restaurar", post(restaurar_versao))
        .route("/api/lixeira", get(lixeira).delete(esvaziar_lixeira))
        .route("/api/lixeira/itens/{id}", axum::routing::delete(apagar_de_vez))
        .route("/api/abrir-pasta", post(abrir_pasta))
        .route("/api/bancadas", get(bancadas).post(criar_bancada).patch(renomear_bancada).delete(remover_bancada))
        .route("/api/bancadas/ativar", post(ativar_bancada))
        .route("/api/preferencias", get(preferencias).patch(mudar_preferencias))
        .route("/api/backup", get(backups).post(backup_agora))
        .route("/api/integracoes", get(|| async { Json(crate::integracoes::listar()) }))
        .route("/api/agentes", get(agentes))
        .route("/api/tela", post(tela))
        .route("/api/sistema", get(|| async { Json(tokio::task::spawn_blocking(crate::sistema::medir).await.unwrap_or_default()) }))
        .route("/api/exportar", post(exportar))
        .route("/api/tela/eventos", get(tela_eventos))
        .route("/api/agentes/{id}/testar", post(testar_agente))
        .route("/api/executar", post(executar))
        .route("/api/integracoes/{id}", post(instalar_integracao).delete(remover_integracao))
        .route("/api/temas", get(|| async { Json(json!({ "pasta": crate::temas::pasta(), "temas": crate::temas::listar() })) }))
        .layer(cors)
        .with_state(banco)
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

pub async fn servir(banco: Banco) {
    tokio::spawn(manutencao(banco.clone()));
    let endereco = format!("127.0.0.1:{PORTA}");
    match tokio::net::TcpListener::bind(&endereco).await {
        Ok(l) => {
            if let Err(e) = axum::serve(l, rotas(banco)).await {
                eprintln!("atelier: API caiu: {e}");
            }
        }
        Err(e) => eprintln!("atelier: não consegui abrir {endereco}: {e}"),
    }
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
            _ => return Err(Erro::Invalido("informe `para` (o outro item)".into())),
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

/// Pedido para a tela do app (o "vai na página disso aqui"): `{ "acao": "abrir", "codigo": "a3f9c21" }`,
/// `{ "acao": "abrir", "visao": "Hoje" }`, `{ "acao": "recarregar" }`, `{ "acao": "filtrar", "texto": "..." }`,
/// `{ "acao": "destacar", "codigo": "a3f9c21" }`. `"ao_lado": true` abre numa janela nova do painel.
async fn tela(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let acao = d.get("acao").and_then(|v| v.as_str()).unwrap_or("");
    let txt = |k: &str| d.get(k).and_then(|v| v.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    let mut ev = json!({ "acao": acao, "ao_lado": d.get("ao_lado").and_then(|v| v.as_bool()).unwrap_or(false) });
    match acao {
        "abrir" => {
            if let Some(c) = txt("codigo") {
                let id = com(&b, |c2| db::id_por_codigo(c2, &c))?;
                ev["rota"] = json!({ "v": "item", "id": id });
            } else if let Some(nome) = txt("visao") {
                let vs = com(&b, db::listar_visoes)?;
                let v = vs
                    .iter()
                    .find(|v| v.nome.to_lowercase() == nome.to_lowercase())
                    .ok_or_else(|| Erro::NaoEncontrado(format!("visão \"{nome}\" (visões: {})", vs.iter().map(|v| v.nome.as_str()).collect::<Vec<_>>().join(", "))))?;
                ev["rota"] = json!({ "v": "visao", "id": v.id });
            } else {
                return Err(Erro::Invalido("abrir: informe codigo (do item) ou visao (nome)".into()));
            }
        }
        "destacar" => ev["codigo"] = json!(txt("codigo").ok_or(Erro::Invalido("destacar: informe codigo".into()))?.trim_start_matches('#').to_lowercase()),
        "filtrar" => ev["texto"] = json!(txt("texto").unwrap_or_default()),
        "recarregar" => {}
        outro => return Err(Erro::Invalido(format!("ação desconhecida: {outro} (abrir, recarregar, filtrar, destacar)"))),
    }
    let telas = b.tela.send(ev.to_string()).unwrap_or(0);
    Ok(Json(json!({ "ok": telas > 0, "telas": telas })))
}

/// Websocket por onde a tela recebe os pedidos acima (só da janela do atelier).
async fn tela_eventos(State(b): State<Banco>, ws: axum::extract::WebSocketUpgrade, headers: axum::http::HeaderMap) -> axum::response::Response {
    let origem = headers.get("origin").and_then(|v| v.to_str().ok()).unwrap_or("");
    if !crate::terminal::ORIGENS.contains(&origem) {
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
    for chave in ["zoom", "backup", "captura", "lixeira", "editor", "agentes", "atualizacao", "atalhos"] {
        match (d.get(chave), atual.get_mut(chave)) {
            (Some(Value::Object(novo)), Some(Value::Object(velho))) => velho.extend(novo.clone()),
            (Some(v), Some(velho)) if !v.is_object() => *velho = v.clone(),
            _ => {}
        }
    }
    cfg.preferencias = serde_json::from_value(atual).map_err(|e| Erro::Invalido(format!("preferência inválida: {e}")))?;
    bancada::salvar(&cfg)?;
    Ok(Json(json!(cfg.preferencias)))
}

/// Cria uma bancada nova ou acrescenta uma pasta que já é bancada. `"ativar": true` já abre.
async fn criar_bancada(State(b): State<Banco>, Json(d): Json<Value>) -> R {
    let caminho = caminho_de(&d)?;
    let nome = d.get("nome").and_then(|v| v.as_str()).unwrap_or("");
    let nova = {
        let mut cfg = cfg_de(&b);
        let ja_existia = bancada::banco_da(&caminho).exists();
        let nova = cfg.acrescentar(nome, &caminho)?;
        // garante o banco criado e migrado já agora
        let conn = db::abrir(&bancada::banco_da(&nova.caminho))?;
        // "inicio": "vazia" (padrão) = sem os tipos de trabalho; "trabalho" = com Task, Dívida, Pendência...
        if !ja_existia && d.get("inicio").and_then(|v| v.as_str()).unwrap_or("vazia") == "vazia" {
            db::limpar_sementes(&conn)?;
        }
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
    Ok(Json(json!(ativar(&b, &caminho_de(&d)?)?)))
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
