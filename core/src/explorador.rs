//! Explorador de arquivos do atelier: lista pastas e serve arquivos para a pré-visualização na tela.
//! Só alcança o que está **dentro da bancada aberta** (caminho canônico, sem `..` nem atalho para fora).

use crate::api::Banco;
use crate::db::Erro;
use axum::{
    body::Body,
    extract::{Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Garante que `caminho` está dentro de `raiz` (os dois canônicos). Devolve o caminho canônico. A única exceção é o
/// arquivo de pedidos ao atelier (`~/atelier/pedidos-ao-atelier.md`), que o Comando abre para leitura e edição.
pub fn dentro(raiz: &Path, caminho: &Path) -> Result<PathBuf, Erro> {
    let r = raiz.canonicalize().map_err(|e| Erro::Invalido(format!("bancada inacessível: {e}")))?;
    let c = caminho.canonicalize().map_err(|_| Erro::NaoEncontrado(format!("{}", caminho.display())))?;
    let pedidos = crate::bancada::pasta_atelier().join("pedidos-ao-atelier.md").canonicalize().ok();
    if !c.starts_with(&r) && pedidos.as_ref() != Some(&c) {
        return Err(Erro::Invalido("fora da bancada: o explorador só mostra arquivos da bancada aberta".into()));
    }
    Ok(sem_prefixo(c))
}

/// No Windows, `canonicalize` devolve `\\?\C:\...`; a tela compara com o caminho comum (a trilha do explorador, a
/// pasta do documento), então o prefixo sai (menos em caminho de rede, `\\?\UNC\`).
fn sem_prefixo(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(resto) if !resto.starts_with(r"UNC\") => PathBuf::from(resto),
        _ => p,
    }
}

fn raiz(b: &Banco) -> Result<PathBuf, Erro> {
    b.bancada_ativa().map(|x| PathBuf::from(x.caminho)).ok_or(Erro::Invalido("nenhuma bancada aberta".into()))
}

fn caminho_de(q: &HashMap<String, String>) -> Result<PathBuf, Erro> {
    q.get("caminho").filter(|c| !c.trim().is_empty()).map(PathBuf::from).ok_or(Erro::Invalido("informe o caminho".into()))
}

/// Tipo de pré-visualização pela extensão.
pub fn espécie(nome: &str) -> &'static str {
    let ext = nome.rsplit_once('.').map(|(_, e)| e.to_lowercase()).unwrap_or_default();
    match ext.as_str() {
        "pdf" => "pdf",
        "md" | "markdown" => "markdown",
        "html" | "htm" => "html",
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" | "avif" => "imagem",
        "mp4" | "webm" | "mov" | "m4v" => "video",
        "mp3" | "wav" | "ogg" | "m4a" | "flac" => "audio",
        "xlsx" | "xlsm" | "xls" | "ods" => "planilha",
        "docx" | "doc" | "odt" | "rtf" => "documento",
        "txt" | "log" | "csv" | "tsv" | "json" | "jsonl" | "yaml" | "yml" | "toml" | "xml" | "ini" | "cfg" | "conf" | "env"
        | "sql" | "py" | "rs" | "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "css" | "scss" | "sh" | "bash" | "ps1" | "psm1"
        | "bat" | "cmd" | "go" | "java" | "kt" | "cs" | "c" | "h" | "cpp" | "hpp" | "rb" | "php" | "lua" | "r" | "tf" | "hcl"
        | "dockerfile" | "gitignore" | "properties" | "gradle" | "vue" | "svelte" => "texto",
        _ => "outro",
    }
}

/// `GET /api/explorar?caminho=<pasta>` → entradas (pastas primeiro).
pub async fn explorar(State(b): State<Banco>, Query(q): Query<HashMap<String, String>>) -> Result<Json<Value>, Erro> {
    let raiz = raiz(&b)?;
    let dir = dentro(&raiz, &caminho_de(&q)?)?;
    if !dir.is_dir() {
        return Err(Erro::Invalido("não é uma pasta".into()));
    }
    let mut lista: Vec<Value> = std::fs::read_dir(&dir)
        .map_err(|e| Erro::Invalido(e.to_string()))?
        .filter_map(|e| e.ok())
        // os comentários de um arquivo (`x.md.comentarios.json`) aparecem no próprio arquivo, não na lista
        .filter(|e| !e.file_name().to_string_lossy().ends_with(crate::comentarios::SUFIXO))
        .map(|e| {
            let meta = e.metadata().ok();
            let nome = e.file_name().to_string_lossy().into_owned();
            let pasta = meta.as_ref().is_some_and(|m| m.is_dir());
            json!({
                "nome": nome,
                "caminho": e.path(),
                "pasta": pasta,
                "tamanho": meta.as_ref().map(|m| m.len()).unwrap_or(0),
                "modificado": meta.and_then(|m| m.modified().ok()).map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%dT%H:%M:%S%:z").to_string()),
                "especie": if pasta { "pasta" } else { espécie(&nome) },
            })
        })
        .collect();
    lista.sort_by(|a, b| {
        b["pasta"].as_bool().cmp(&a["pasta"].as_bool()).then_with(|| {
            a["nome"].as_str().unwrap_or("").to_lowercase().cmp(&b["nome"].as_str().unwrap_or("").to_lowercase())
        })
    });
    let pai = dir.parent().filter(|p| p.starts_with(sem_prefixo(raiz.canonicalize().unwrap_or_default()))).map(Path::to_path_buf);
    Ok(Json(json!({ "caminho": dir, "pai": pai, "raiz_bancada": raiz, "entradas": lista })))
}

/// `GET /api/arquivo?caminho=<arquivo>` → o conteúdo, com o tipo certo. HTML (e SVG) vêm com CSP `sandbox`:
/// se o arquivo tiver script, ele roda isolado, sem acesso ao atelier.
pub async fn arquivo(State(b): State<Banco>, Query(q): Query<HashMap<String, String>>) -> Response {
    let r = (|| -> Result<(PathBuf, String), Erro> {
        let raiz = raiz(&b)?;
        let p = dentro(&raiz, &caminho_de(&q)?)?;
        if !p.is_file() {
            return Err(Erro::Invalido("não é um arquivo".into()));
        }
        let tipo = mime_guess::from_path(&p).first_or_octet_stream().essence_str().to_string();
        Ok((p, tipo))
    })();
    match r {
        Ok((p, tipo)) => servir(p, tipo).await,
        Err(e) => e.into_response(),
    }
}

/// Manda o arquivo (em fluxo), com o tipo certo; HTML e SVG com CSP `sandbox` (script roda isolado, sem o atelier).
async fn servir(p: PathBuf, tipo: String) -> Response {
    // em fluxo: um vídeo ou PDF grande não entra inteiro na memória
    match tokio::fs::File::open(&p).await {
        Ok(f) => {
            let tamanho = f.metadata().await.map(|m| m.len()).ok();
            let tipo = if tipo.starts_with("text/") || tipo == "application/json" { format!("{tipo}; charset=utf-8") } else { tipo };
            let mut resp = Response::builder()
                .status(StatusCode::OK)
                .header(header::CONTENT_TYPE, &tipo)
                .header(header::CACHE_CONTROL, "no-store")
                .header("X-Content-Type-Options", "nosniff");
            if let Some(n) = tamanho {
                resp = resp.header(header::CONTENT_LENGTH, n);
            }
            if tipo.contains("html") || tipo.contains("svg") {
                resp = resp.header(header::CONTENT_SECURITY_POLICY, "sandbox allow-scripts allow-popups; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'");
            }
            resp.body(Body::from_stream(tokio_util::io::ReaderStream::new(f))).unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
        }
        Err(e) => Erro::Invalido(format!("não li o arquivo: {e}")).into_response(),
    }
}

/// `PUT /api/arquivo { caminho, conteudo, modificado? }` — grava um arquivo de texto que já existe na bancada.
/// Se `modificado` vier e o arquivo tiver mudado depois disso (o agente mexeu), recusa para não atropelar.
pub async fn salvar(State(b): State<Banco>, Json(d): Json<Value>) -> Result<Json<Value>, Erro> {
    let raiz = raiz(&b)?;
    let p = dentro(&raiz, Path::new(d.get("caminho").and_then(|v| v.as_str()).unwrap_or("")))?;
    if !p.is_file() {
        return Err(Erro::Invalido("só edita arquivo que já existe".into()));
    }
    // só texto: arquivo sem extensão (Dockerfile, LEIAME) também vale
    let ext = p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
    if !ext.is_empty() && !matches!(espécie(&p.to_string_lossy()), "texto" | "markdown" | "html") {
        return Err(Erro::Invalido(format!("arquivo .{ext} não é texto; abra no programa dele")));
    }
    let conteudo = d.get("conteudo").and_then(|v| v.as_str()).ok_or(Erro::Invalido("sem conteúdo".into()))?;
    let atual = modificado(&p);
    if let Some(esperado) = d.get("modificado").and_then(|v| v.as_str()) {
        if atual.as_deref().is_some_and(|a| a != esperado) {
            return Err(Erro::Invalido("o arquivo mudou enquanto você editava (talvez o agente). Recarregue antes de salvar.".into()));
        }
    }
    std::fs::write(&p, conteudo).map_err(|e| Erro::Invalido(format!("não gravei: {e}")))?;
    Ok(Json(json!({ "ok": true, "modificado": modificado(&p) })))
}

fn modificado(p: &Path) -> Option<String> {
    std::fs::metadata(p)
        .ok()
        .and_then(|m| m.modified().ok())
        .map(|t| chrono::DateTime::<chrono::Local>::from(t).format("%Y-%m-%dT%H:%M:%S%.3f%:z").to_string())
}

/// Uma bancada no caminho da URL (`/api/ver/<bancada em hex>/...`): o HTML carrega CSS, imagens e scripts **relativos**
/// pela própria URL, e um pedido relativo não leva `?bancada=` nem cabeçalho.
fn hex(s: &str) -> String {
    s.bytes().map(|b| format!("{b:02x}")).collect()
}

fn de_hex(s: &str) -> Option<String> {
    if s.len() % 2 != 0 {
        return None;
    }
    let bytes: Option<Vec<u8>> = (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).ok()).collect();
    String::from_utf8(bytes?).ok()
}

/// O endereço do arquivo pelo caminho (para o HTML achar o que é relativo a ele).
fn url_ver(raiz: &Path, p: &Path) -> Option<String> {
    let r = sem_prefixo(raiz.canonicalize().ok()?);
    let rel = p.strip_prefix(&r).ok()?;
    let partes: Vec<String> = rel
        .components()
        .map(|c| {
            c.as_os_str().to_string_lossy().bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
        })
        .collect();
    Some(format!("/api/ver/{}/{}", hex(&r.to_string_lossy()), partes.join("/")))
}

/// `GET /api/ver/<bancada em hex>/<caminho relativo>`: o arquivo pelo caminho. Só de uma bancada conhecida e só de
/// dentro dela. HTML com `?comentar=1` ganha o script de comentar (selecionar um trecho e comentar).
pub async fn ver(axum::extract::Path((banc, resto)): axum::extract::Path<(String, String)>, Query(q): Query<HashMap<String, String>>) -> Response {
    let r = (|| -> Result<(PathBuf, String), Erro> {
        let caminho = de_hex(&banc).ok_or(Erro::Invalido("bancada inválida".into()))?;
        let cfg = crate::bancada::carregar();
        let b = cfg.bancadas.iter().find(|x| crate::bancada::mesmo_caminho(&x.caminho, &caminho)).ok_or(Erro::NaoEncontrado("bancada".into()))?;
        let raiz = PathBuf::from(&b.caminho);
        let p = dentro(&raiz, &raiz.join(resto.replace('/', std::path::MAIN_SEPARATOR_STR)))?;
        if !p.is_file() {
            return Err(Erro::NaoEncontrado(resto.clone()));
        }
        let tipo = mime_guess::from_path(&p).first_or_octet_stream().essence_str().to_string();
        Ok((p, tipo))
    })();
    let (p, tipo) = match r {
        Ok(x) => x,
        Err(e) => return e.into_response(),
    };
    if tipo == "text/html" && q.get("comentar").is_some_and(|v| v == "1") {
        let Ok(mut html) = std::fs::read_to_string(&p) else { return servir(p, tipo).await };
        // embutido (não por endereço): carregar de outro lugar pode ser barrado
        let script = format!("<script>{}</script>", include_str!("comentar.js"));
        match html.to_lowercase().rfind("</body>") {
            Some(i) => html.insert_str(i, &script),
            None => html.push_str(&script),
        }
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CACHE_CONTROL, "no-store")
            .header(header::CONTENT_SECURITY_POLICY, "sandbox allow-scripts allow-popups; default-src * data: blob: 'unsafe-inline' 'unsafe-eval'")
            .body(Body::from(html))
            .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response());
    }
    servir(p, tipo).await
}

/// `GET /api/comentar.js`: o script que roda dentro do markdown/HTML mostrado (seleção → "Comentar", grifos).
pub async fn comentar_js() -> Response {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/javascript; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from(include_str!("comentar.js")))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

/// `GET /api/comentarios?caminho=` → os comentários do arquivo.
pub async fn comentarios(State(b): State<Banco>, Query(q): Query<HashMap<String, String>>) -> Result<Json<Value>, Erro> {
    let raiz = raiz(&b)?;
    let p = dentro(&raiz, &caminho_de(&q)?)?;
    Ok(Json(crate::comentarios::ler(&p)))
}

/// `POST /api/comentarios { caminho, acao, ... }`: criar (trecho, antes, depois, comentario), editar (id, comentario),
/// apagar (id), resolver (id, resposta), reabrir (id), limpar_resolvidos.
pub async fn mexer_comentarios(State(b): State<Banco>, Json(d): Json<Value>) -> Result<Json<Value>, Erro> {
    use crate::comentarios as c;
    let raiz = raiz(&b)?;
    let p = dentro(&raiz, Path::new(d.get("caminho").and_then(|v| v.as_str()).unwrap_or("")))?;
    let s = |k: &str| d.get(k).and_then(|v| v.as_str()).unwrap_or("").to_string();
    let id = || d.get("id").and_then(|v| v.as_u64()).ok_or(Erro::Invalido("informe o id".into()));
    let r = match s("acao").as_str() {
        "criar" => c::criar(&p, &s("trecho"), &s("antes"), &s("depois"), &s("comentario"), "Paulo").map(|id| json!({ "id": id })),
        "editar" => c::editar(&p, id()?, &s("comentario")).map(|_| json!({})),
        "apagar" => c::apagar(&p, id()?).map(|_| json!({})),
        "resolver" => c::resolver(&p, id()?, &s("resposta"), "Paulo").map(|_| json!({})),
        "reabrir" => c::reabrir(&p, id()?).map(|_| json!({})),
        "limpar_resolvidos" => c::limpar_resolvidos(&p).map(|n| json!({ "removidos": n })),
        outra => Err(format!("ação desconhecida: {outra}")),
    };
    let mut v = r.map_err(Erro::Invalido)?;
    v["comentarios"] = c::ler(&p);
    Ok(Json(v))
}

/// `GET /api/arquivo/info?caminho=` → espécie, tamanho e hora de modificação (com milissegundos, para editar com segurança).
pub async fn info(State(b): State<Banco>, Query(q): Query<HashMap<String, String>>) -> Result<Json<Value>, Erro> {
    let raiz = raiz(&b)?;
    let p = dentro(&raiz, &caminho_de(&q)?)?;
    let nome = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Ok(Json(json!({
        "caminho": p, "nome": nome, "especie": espécie(&nome),
        "tamanho": std::fs::metadata(&p).map(|m| m.len()).unwrap_or(0), "modificado": modificado(&p),
        // pelo caminho: o HTML acha CSS, imagens e scripts relativos
        "ver": url_ver(&raiz, &p),
    })))
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn nao_sai_da_bancada() {
        let base = std::env::temp_dir().join(format!("atelier-expl-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&base);
        std::fs::create_dir_all(base.join("bancada").join("itens")).unwrap();
        std::fs::write(base.join("segredo.txt"), b"x").unwrap();
        std::fs::write(base.join("bancada").join("itens").join("ok.md"), b"x").unwrap();
        let raiz = base.join("bancada");
        assert!(dentro(&raiz, &raiz.join("itens").join("ok.md")).is_ok());
        assert!(dentro(&raiz, &raiz.join("itens").join("..").join("..").join("segredo.txt")).is_err());
        assert!(dentro(&raiz, &base.join("segredo.txt")).is_err());
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn especies() {
        assert_eq!(espécie("a.PDF"), "pdf");
        assert_eq!(espécie("leia.md"), "markdown");
        assert_eq!(espécie("x.tsx"), "texto");
        assert_eq!(espécie("foto.jpeg"), "imagem");
        assert_eq!(espécie("planilha.XLSX"), "planilha");
        assert_eq!(espécie("relatorio.docx"), "documento");
        assert_eq!(espécie("dados.csv"), "texto");
        assert_eq!(espécie("pacote.zip"), "outro");
    }
}
