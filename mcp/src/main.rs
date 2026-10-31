//! atelier-mcp — servidor MCP (stdio, JSON-RPC por linha) do atelier.
//!
//! Fala direto com o banco da bancada aberta (a "ativa" do `~/atelier/config.toml`), então funciona com o app
//! aberto ou fechado. Reabre a bancada a cada chamada: se o Paulo trocar de bancada no app, o agente acompanha.
//! Tipos e propriedades são tratados pelo **nome** (o agente não precisa saber ids).

use atelier_core::{bancada, db};
use rusqlite::Connection;
use serde_json::{json, Map, Value};
use std::io::{BufRead, Write};

const VERSAO_PROTOCOLO: &str = "2025-06-18";

fn main() {
    let mut autor = String::from("Agente");
    let stdin = std::io::stdin();
    let mut out = std::io::stdout().lock();
    for linha in stdin.lock().lines() {
        let Ok(linha) = linha else { break };
        if linha.trim().is_empty() {
            continue;
        }
        let msg: Value = match serde_json::from_str(&linha) {
            Ok(v) => v,
            Err(e) => {
                responder(&mut out, json!({"jsonrpc": "2.0", "id": null, "error": {"code": -32700, "message": format!("JSON inválido: {e}")}}));
                continue;
            }
        };
        let id = msg.get("id").cloned();
        let metodo = msg.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let params = msg.get("params").cloned().unwrap_or(json!({}));

        // notificação (sem id): não responde
        let Some(id) = id else { continue };

        let resultado: Result<Value, (i64, String)> = match metodo {
            "initialize" => {
                autor = nome_do_agente(&params);
                let versao = params.get("protocolVersion").and_then(|v| v.as_str()).unwrap_or(VERSAO_PROTOCOLO);
                Ok(json!({
                    "protocolVersion": versao,
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "atelier", "version": env!("CARGO_PKG_VERSION") },
                    "instructions": INSTRUCOES,
                }))
            }
            "ping" => Ok(json!({})),
            "tools/list" => Ok(json!({ "tools": ferramentas() })),
            "tools/call" => {
                let nome = params.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or(json!({}));
                Ok(match chamar(nome, &args, &autor) {
                    Ok(v) => json!({ "content": [{ "type": "text", "text": texto(&v) }] }),
                    Err(e) => json!({ "content": [{ "type": "text", "text": format!("Erro: {e}") }], "isError": true }),
                })
            }
            "resources/list" => Ok(json!({ "resources": [] })),
            "prompts/list" => Ok(json!({ "prompts": [] })),
            outro => Err((-32601, format!("método desconhecido: {outro}"))),
        };
        let resposta = match resultado {
            Ok(r) => json!({ "jsonrpc": "2.0", "id": id, "result": r }),
            Err((code, message)) => json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }),
        };
        responder(&mut out, resposta);
    }
}

fn responder(out: &mut impl Write, v: Value) {
    let _ = writeln!(out, "{v}");
    let _ = out.flush();
}

fn texto(v: &Value) -> String {
    serde_json::to_string_pretty(v).unwrap_or_default()
}

/// Quem assina as notas: "Claude", "Codex"... a partir do clientInfo do agente.
fn nome_do_agente(params: &Value) -> String {
    let n = params.pointer("/clientInfo/name").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
    for (chave, nome) in [
        ("claude", "Claude"), ("codex", "Codex"), ("gemini", "Gemini"), ("antigravity", "Antigravity"),
        ("opencode", "OpenCode"), ("kiro", "Kiro"), ("copilot", "Copilot"), ("visual studio code", "Copilot"),
        ("cursor", "Cursor"), ("windsurf", "Windsurf"), ("zed", "Zed"), ("pi", "Pi"),
    ] {
        if n.contains(chave) {
            return nome.into();
        }
    }
    if n.is_empty() { "Agente".into() } else { n }
}

const INSTRUCOES: &str = "atelier é o sistema de gestão pessoal do usuário (frentes, tasks, dívidas, pendências, \
desejos, notas). Tudo é um item com tipo e propriedades; tipos e propriedades são criados à vontade. \
Ligações entre itens (pai, bloqueio...) não são fixas: são propriedades da espécie relacao, criadas pelo usuário. Antes de criar, \
use `buscar` para ver se já existe. Use `esquema` para conhecer os tipos, propriedades e opções. Registre o que \
acontece com `anotar` (vira a linha do tempo do item). Os dados ficam na bancada aberta no app. \
Cada item tem um código de 7 hexadecimais (ex.: #a3f9c21); use esse código para se referir a ele. \
PADRÃO DE PASTAS: nunca crie pasta de trabalho por conta própria. Quando o trabalho precisar de arquivos, peça ao \
atelier: `criar_pasta` (ou `criar_item` com `criar_pasta: true`). Ele cria `itens/<código>-<título>/` dentro da \
bancada, com `insumos/` (o que entra), `artefatos/` (o que sai), `rascunho/` e um CLAUDE.md, e liga a pasta ao item. \
Guarde os arquivos nessas subpastas e registre o andamento no item com `anotar`, não em arquivos soltos.";

fn ferramentas() -> Value {
    #[allow(non_snake_case)]
    let ID = json!({ "type": ["string", "integer"], "description": "código do item, ex.: \"a3f9c21\" (aparece como #a3f9c21)" });
    let props = json!({
        "type": "object",
        "description": "Propriedades pelo NOME, ex.: {\"Status\": \"Em andamento\", \"Frente\": \"F2\", \"Tags\": [\"aws\"]}. Valor null apaga. Opção nova de seleção é criada sozinha.",
        "additionalProperties": true
    });
    json!([
        {
            "name": "esquema",
            "description": "Mostra a bancada aberta, os tipos (com suas propriedades e opções de status), todas as propriedades e os modelos. Chame antes de criar ou filtrar.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "buscar",
            "description": "Busca itens por texto (título e corpo), tipo e propriedades. Por padrão esconde os itens com status de histórico (feitos, descartados).",
            "inputSchema": { "type": "object", "properties": {
                "texto": { "type": "string" },
                "tipo": { "type": "string", "description": "nome do tipo, ex.: Dívida" },
                "filtros": { "type": "object", "description": "propriedade → valor, ex.: {\"Frente\": \"F2\"}", "additionalProperties": true },
                "incluir_historico": { "type": "boolean" },
                "limite": { "type": "integer", "description": "padrão 50" }
            } }
        },
        {
            "name": "ler_item",
            "description": "Lê um item inteiro: propriedades, corpo em markdown, pasta e linha do tempo.",
            "inputSchema": { "type": "object", "properties": { "id": ID }, "required": ["id"] }
        },
        {
            "name": "criar_item",
            "description": "Cria um item. Sem `modelo`, usa o modelo padrão do tipo (que já traz propriedades e texto). Passe `modelo: \"\"` para criar em branco.",
            "inputSchema": { "type": "object", "properties": {
                "titulo": { "type": "string" },
                "tipo": { "type": "string" },
                "modelo": { "type": "string", "description": "nome do modelo do tipo" },
                "corpo": { "type": "string", "description": "markdown" },
                "propriedades": props,
                "criar_pasta": { "type": "boolean", "description": "true = o atelier já cria a pasta de trabalho no padrão (preferível a passar `pasta`)" },
                "pasta": { "type": "string", "description": "só para ligar uma pasta que JÁ existe fora do padrão" }
            }, "required": ["titulo"] }
        },
        {
            "name": "atualizar_item",
            "description": "Atualiza só o que vier: título, tipo (o item pode mudar de tipo sem perder valores), corpo (substitui o markdown inteiro), propriedades, pasta. Mudança de status ou tipo vai sozinha para a linha do tempo.",
            "inputSchema": { "type": "object", "properties": {
                "id": ID,
                "titulo": { "type": "string" },
                "tipo": { "type": "string" },
                "corpo": { "type": "string" },
                "propriedades": props,
                "pasta": { "type": ["string", "null"] }
            }, "required": ["id"] }
        },
        {
            "name": "anotar",
            "description": "Acrescenta uma nota datada na linha do tempo do item (acompanhamento, decisão, o que foi feito).",
            "inputSchema": { "type": "object", "properties": {
                "id": ID, "texto": { "type": "string" }
            }, "required": ["id", "texto"] }
        },
        {
            "name": "relacionar",
            "description": "Liga o item `id` ao item `para` numa propriedade de RELAÇÃO (espécie relacao, criada pelo usuário; veja em esquema quais existem, ex.: \"Pai\", \"Bloqueado por\"). O valor fica no item `id`; do lado do `para` aparece pelo nome inverso da propriedade. remover: true desliga. Também dá para mandar a lista inteira em atualizar_item: {\"Bloqueado por\": [\"#a3f9c21\"]}. Para só citar um item no texto ou numa nota, escreva o código com # (ex.: #a3f9c21): vira link e aparece em \"mencionado em\".",
            "inputSchema": { "type": "object", "properties": {
                "id": ID, "para": ID,
                "propriedade": { "type": "string", "description": "nome da propriedade de relação" },
                "remover": { "type": "boolean" }
            }, "required": ["id", "para", "propriedade"] }
        },
        {
            "name": "tela",
            "description": "Mexe na tela do app atelier (precisa estar aberto): abrir um item (codigo) ou uma visão (visao, pelo nome) — com ao_lado: true abre numa janela nova ao lado; recarregar (depois de mudar coisas, para o usuário ver na hora); filtrar a visão aberta por um texto; destacar um item (pisca na lista). Use quando o usuário pedir \"abre/mostra isso aí\".",
            "inputSchema": { "type": "object", "properties": {
                "acao": { "type": "string", "enum": ["abrir", "recarregar", "filtrar", "destacar"] },
                "codigo": { "type": "string", "description": "código do item (abrir, destacar)" },
                "visao": { "type": "string", "description": "nome da visão (abrir)" },
                "texto": { "type": "string", "description": "filtrar: texto da busca (vazio limpa)" },
                "ao_lado": { "type": "boolean" }
            }, "required": ["acao"] }
        },
        {
            "name": "linha_do_tempo",
            "description": "O que aconteceu num período, com data e hora de cada coisa: itens criados, notas, mudanças de status, propriedades, título, pasta e texto, com quem fez (Paulo ou o agente). Responde a \"no que trabalhei hoje/ontem/nesta semana?\". Sem datas = hoje.",
            "inputSchema": { "type": "object", "properties": {
                "de": { "type": "string", "description": "AAAA-MM-DD (padrão: hoje)" },
                "ate": { "type": "string", "description": "AAAA-MM-DD (padrão: igual a `de`)" },
                "tipo": { "type": "string" },
                "filtros": { "type": "object", "additionalProperties": true }
            } }
        },
        {
            "name": "criar_pasta",
            "description": "Cria a pasta de trabalho do item dentro da bancada (itens/00042-titulo/ com insumos, artefatos, rascunho e um CLAUDE.md) e liga ao item. Se já existe, devolve a mesma. Use quando o trabalho precisar de arquivos.",
            "inputSchema": { "type": "object", "properties": { "id": ID }, "required": ["id"] }
        },
        {
            "name": "criar_tipo",
            "description": "Cria um tipo novo (ex.: Demanda, Reunião). Nasce com a propriedade Status.",
            "inputSchema": { "type": "object", "properties": {
                "nome": { "type": "string" }, "icone": { "type": "string", "description": "um emoji" }
            }, "required": ["nome"] }
        },
        {
            "name": "criar_propriedade",
            "description": "Cria uma propriedade (compartilhada entre tipos) e, se quiser, já coloca em tipos. Espécies: texto, numero (inteiro, casas, formato), data (hora), checkbox (sim/não), url, email, telefone, selecao, multisselecao, status, links (vários links com rótulo), criado_em e atualizado_em (automáticas); texto/numero/data/email/telefone/url com lista: true guardam vários valores; relacao (aponta para outros itens; `inverso` é como se lê do outro lado, ex.: \"Bloqueado por\" ↔ \"Bloqueia\"; `um_so` aceita um item só, ex.: \"Pai\").",
            "inputSchema": { "type": "object", "properties": {
                "nome": { "type": "string" },
                "especie": { "type": "string" },
                "opcoes": { "type": "array", "items": { "type": "string" } },
                "inverso": { "type": "string", "description": "relacao: nome do outro lado" },
                "lista": { "type": "boolean", "description": "texto, numero, data, email, telefone, url: aceita vários valores" },
                "inteiro": { "type": "boolean", "description": "numero: só inteiros" },
                "casas": { "type": "integer", "description": "numero: casas decimais" },
                "formato": { "type": "string", "enum": ["numero", "percentual", "moeda"], "description": "numero: como mostrar" },
                "hora": { "type": "boolean", "description": "data: com hora (AAAA-MM-DDTHH:MM)" },
                "um_so": { "type": "boolean", "description": "relacao: aceita um item só" },
                "tipos": { "type": "array", "items": { "type": "string" }, "description": "nomes dos tipos que passam a ter a propriedade" }
            }, "required": ["nome", "especie"] }
        },
        {
            "name": "ligar_propriedade",
            "description": "Põe uma propriedade que já existe num tipo (ou tira, com remover: true; os valores ficam guardados).",
            "inputSchema": { "type": "object", "properties": {
                "propriedade": { "type": "string" }, "tipo": { "type": "string" }, "remover": { "type": "boolean" }
            }, "required": ["propriedade", "tipo"] }
        }
    ])
}

// ---------- execução ----------

fn abrir() -> Result<(Connection, bancada::Bancada), String> {
    let cfg = bancada::carregar();
    let b = cfg
        .ativa()
        .cloned()
        .ok_or("nenhuma bancada aberta: abra o app atelier uma vez para criar a primeira")?;
    let conn = db::abrir(&bancada::banco_da(&b.caminho)).map_err(|e| e.to_string())?;
    Ok((conn, b))
}

struct Mapa {
    esq: Value,
}

impl Mapa {
    fn carregar(conn: &Connection) -> Result<Self, String> {
        Ok(Mapa { esq: db::esquema(conn).map_err(|e| e.to_string())? })
    }
    fn tipos(&self) -> &Vec<Value> {
        self.esq["tipos"].as_array().expect("tipos")
    }
    fn props(&self) -> &Vec<Value> {
        self.esq["propriedades"].as_array().expect("propriedades")
    }
    fn tipo_id(&self, nome: &str) -> Result<i64, String> {
        if let Ok(id) = nome.trim().parse::<i64>() {
            return Ok(id);
        }
        self.tipos()
            .iter()
            .find(|t| t["nome"].as_str().is_some_and(|n| n.eq_ignore_ascii_case(nome.trim()) || n.to_lowercase() == nome.trim().to_lowercase()))
            .and_then(|t| t["id"].as_i64())
            .ok_or_else(|| {
                let nomes: Vec<&str> = self.tipos().iter().filter_map(|t| t["nome"].as_str()).collect();
                format!("tipo \"{nome}\" não existe (tipos: {}). Crie com criar_tipo.", nomes.join(", "))
            })
    }
    fn tipo_nome(&self, id: Option<i64>) -> Value {
        id.and_then(|id| self.tipos().iter().find(|t| t["id"] == id))
            .map(|t| t["nome"].clone())
            .unwrap_or(Value::Null)
    }
    fn prop(&self, nome: &str) -> Result<&Value, String> {
        self.props()
            .iter()
            .find(|p| p["nome"].as_str().is_some_and(|n| n.to_lowercase() == nome.trim().to_lowercase()))
            .ok_or_else(|| {
                let nomes: Vec<&str> = self.props().iter().filter_map(|p| p["nome"].as_str()).collect();
                format!("propriedade \"{nome}\" não existe (propriedades: {}). Crie com criar_propriedade.", nomes.join(", "))
            })
    }
    fn prop_nome(&self, id: &str) -> String {
        self.props()
            .iter()
            .find(|p| p["id"].to_string() == id)
            .and_then(|p| p["nome"].as_str())
            .unwrap_or(id)
            .to_string()
    }
    /// Opções efetivas de uma propriedade num tipo.
    fn opcoes(&self, tipo_id: Option<i64>, prop_id: i64) -> Vec<Value> {
        let do_tipo = tipo_id
            .and_then(|t| self.tipos().iter().find(|x| x["id"] == t))
            .and_then(|t| t["propriedades"].as_array())
            .and_then(|l| l.iter().find(|tp| tp["propriedade_id"] == prop_id))
            .and_then(|tp| tp["opcoes"].as_array().cloned());
        do_tipo
            .or_else(|| self.props().iter().find(|p| p["id"] == prop_id).and_then(|p| p["opcoes"].as_array().cloned()))
            .unwrap_or_default()
    }
    fn eh_historico(&self, item: &db::Item) -> bool {
        self.props().iter().filter(|p| p["especie"] == "status").any(|p| {
            let pid = p["id"].as_i64().unwrap_or(0);
            let valor = item.props.get(pid.to_string()).and_then(|v| v.as_str());
            valor.is_some_and(|v| self.opcoes(item.tipo_id, pid).iter().any(|o| o["nome"] == v && o["historico"] == true))
        })
    }
    /// `{ "Status": "x" }` → `{ "1": "x" }`, criando opções novas quando preciso.
    fn props_por_id(&self, conn: &Connection, tipo_id: Option<i64>, por_nome: &Value) -> Result<Value, String> {
        let mut saida = Map::new();
        if let Some(obj) = por_nome.as_object() {
            for (nome, valor) in obj {
                let p = self.prop(nome)?;
                let pid = p["id"].as_i64().unwrap_or(0);
                let valores: Vec<&str> = match valor {
                    Value::String(s) => vec![s.as_str()],
                    Value::Array(a) => a.iter().filter_map(|v| v.as_str()).collect(),
                    _ => vec![],
                };
                for v in valores {
                    db::garantir_opcao(conn, tipo_id, pid, v).map_err(|e| e.to_string())?;
                }
                saida.insert(pid.to_string(), valor.clone());
            }
        }
        Ok(Value::Object(saida))
    }
    fn humano(&self, it: &db::Item) -> Value {
        let mut props = Map::new();
        if let Some(obj) = it.props.as_object() {
            for (k, v) in obj {
                props.insert(self.prop_nome(k), v.clone());
            }
        }
        let mut v = json!({
            "id": it.id,
            "codigo": it.codigo,
            "titulo": it.titulo,
            "tipo": self.tipo_nome(it.tipo_id),
            "propriedades": props,
            "pasta": it.pasta,
            "criado_em": it.criado_em,
            "atualizado_em": it.atualizado_em,
        });
        if let Some(c) = &it.corpo {
            v["corpo"] = json!(c);
        }
        if let Some(n) = &it.notas {
            v["linha_do_tempo"] = json!(n);
        }
        if let Some(r) = &it.relacionados {
            v["itens_apontados"] = json!(r.as_array().into_iter().flatten().map(|r| format!("#{} {}", r["codigo"].as_str().unwrap_or(""), r["titulo"].as_str().unwrap_or(""))).collect::<Vec<_>>());
        }
        if let Some(r) = &it.referencias {
            v["apontado_por"] = json!(r.as_array().into_iter().flatten().map(|r| json!({
                "como": r["rotulo"],
                "item": format!("#{} {}", r["item"]["codigo"].as_str().unwrap_or(""), r["item"]["titulo"].as_str().unwrap_or("")),
            })).collect::<Vec<_>>());
        }
        if let Some(m) = &it.mencionado_em {
            v["mencionado_em"] = json!(m.as_array().into_iter().flatten().map(|m| format!("#{} {}", m["codigo"].as_str().unwrap_or(""), m["titulo"].as_str().unwrap_or(""))).collect::<Vec<_>>());
        }
        v
    }
}

/// POST na API local do app (127.0.0.1:7477), sem dependência de cliente HTTP.
fn post_api(caminho: &str, corpo: &Value) -> Result<Value, String> {
    use std::io::Read;
    use std::net::TcpStream;
    let mut s = TcpStream::connect(("127.0.0.1", atelier_core::api::PORTA)).map_err(|_| "o app atelier não está aberto".to_string())?;
    s.set_read_timeout(Some(std::time::Duration::from_secs(10))).ok();
    let b = corpo.to_string();
    let req = format!(
        "POST {caminho} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{b}",
        b.len()
    );
    s.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    let mut resp = String::new();
    s.read_to_string(&mut resp).map_err(|e| e.to_string())?;
    let corpo = resp.split_once("\r\n\r\n").map(|x| x.1).unwrap_or("");
    serde_json::from_str(corpo.trim()).map_err(|_| format!("resposta inesperada do app: {}", resp.lines().next().unwrap_or("")))
}

fn chrono_hoje() -> String {
    db::agora()[..10].to_string()
}

/// O item pode vir pelo código ("a3f9c21", "#a3f9c21") ou pelo id interno (número).
fn id_de(conn: &Connection, a: &Value) -> Result<i64, String> {
    match a.get("id") {
        Some(Value::Number(n)) => n.as_i64().ok_or("id inválido".into()),
        Some(Value::String(c)) => db::id_por_codigo(conn, c).map_err(|e| e.to_string()),
        _ => Err("informe o id (código do item)".into()),
    }
}

fn s<'a>(a: &'a Value, campo: &str) -> Option<&'a str> {
    a.get(campo).and_then(|v| v.as_str())
}

fn chamar(nome: &str, a: &Value, autor: &str) -> Result<Value, String> {
    let (conn, banc) = abrir()?;
    let e = |x: db::Erro| x.to_string();
    let mapa = Mapa::carregar(&conn)?;
    match nome {
        "esquema" => {
            let tipos: Vec<Value> = mapa
                .tipos()
                .iter()
                .map(|t| {
                    let tid = t["id"].as_i64();
                    let props: Vec<Value> = t["propriedades"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter_map(|tp| {
                            let pid = tp["propriedade_id"].as_i64()?;
                            let p = mapa.props().iter().find(|p| p["id"] == pid)?;
                            let opcoes: Vec<Value> = mapa
                                .opcoes(tid, pid)
                                .iter()
                                .map(|o| if o["historico"] == true { json!(format!("{} (histórico)", o["nome"].as_str().unwrap_or(""))) } else { o["nome"].clone() })
                                .collect();
                            let mut d = json!({ "nome": p["nome"], "especie": p["especie"], "opcoes": opcoes });
                            if p["config"].as_object().is_some_and(|c| !c.is_empty()) {
                                d["config"] = p["config"].clone();
                            }
                            Some(d)
                        })
                        .collect();
                    let modelos: Vec<Value> = mapa.esq["modelos"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .filter(|m| m["tipo_id"] == t["id"])
                        .map(|m| json!({ "nome": m["nome"], "padrao": m["padrao"] }))
                        .collect();
                    json!({ "nome": t["nome"], "icone": t["icone"], "propriedades": props, "modelos": modelos })
                })
                .collect();
            Ok(json!({ "bancada": banc, "tipos": tipos }))
        }
        "buscar" => {
            let mut filtros = vec![];
            if let Some(obj) = a.get("filtros").and_then(|v| v.as_object()) {
                for (k, v) in obj {
                    let pid = mapa.prop(k)?["id"].as_i64().unwrap_or(0);
                    let valores: Vec<String> = match v {
                        Value::Array(l) => l.iter().map(|x| x.as_str().map(String::from).unwrap_or_else(|| x.to_string())).collect(),
                        outro => vec![outro.as_str().map(String::from).unwrap_or_else(|| outro.to_string())],
                    };
                    let valores = if mapa.prop(k)?["especie"] == "relacao" {
                        valores.iter().map(|x| x.trim().trim_start_matches('#').to_lowercase()).collect()
                    } else {
                        valores
                    };
                    filtros.push((pid, valores));
                }
            }
            let filtro = db::Filtro {
                tipo_id: s(a, "tipo").map(|t| mapa.tipo_id(t)).transpose()?,
                texto: s(a, "texto").map(String::from),
                props: filtros,
                ..Default::default()
            };
            let historico = a.get("incluir_historico").and_then(|v| v.as_bool()).unwrap_or(false);
            let limite = a.get("limite").and_then(|v| v.as_u64()).unwrap_or(50) as usize;
            let todos = db::listar_itens(&conn, &filtro).map_err(e)?;
            let total = todos.len();
            let itens: Vec<Value> = todos
                .iter()
                .filter(|it| historico || !mapa.eh_historico(it))
                .take(limite)
                .map(|it| mapa.humano(it))
                .collect();
            Ok(json!({ "encontrados": itens.len(), "total_sem_filtro_de_historico": total, "itens": itens }))
        }
        "ler_item" => {
            let id = id_de(&conn, a)?;
            Ok(mapa.humano(&db::ler_item(&conn, id).map_err(e)?))
        }
        "criar_item" => {
            let tipo_id = s(a, "tipo").map(|t| mapa.tipo_id(t)).transpose()?;
            let mut dados = json!({ "titulo": s(a, "titulo").unwrap_or(""), "tipo_id": tipo_id, "autor": autor });
            match s(a, "modelo") {
                Some("") => dados["modelo_id"] = Value::Null,
                Some(m) => {
                    let mid = mapa.esq["modelos"]
                        .as_array()
                        .into_iter()
                        .flatten()
                        .find(|x| x["nome"].as_str().is_some_and(|n| n.to_lowercase() == m.to_lowercase()) && (tipo_id.is_none() || x["tipo_id"] == json!(tipo_id)))
                        .and_then(|x| x["id"].as_i64())
                        .ok_or_else(|| format!("modelo \"{m}\" não existe para esse tipo"))?;
                    dados["modelo_id"] = json!(mid);
                }
                None => {}
            }
            if let Some(c) = s(a, "corpo") {
                dados["corpo"] = json!(c);
            }
            if let Some(p) = s(a, "pasta") {
                dados["pasta"] = json!(p);
            }
            if let Some(p) = a.get("propriedades") {
                dados["props"] = mapa.props_por_id(&conn, tipo_id, p)?;
            }
            let id = db::criar_item(&conn, &dados).map_err(e)?;
            if a.get("criar_pasta").and_then(|v| v.as_bool()).unwrap_or(false) {
                atelier_core::pastas::criar(&conn, std::path::Path::new(&banc.caminho), &banc.nome, id, autor).map_err(e)?;
            }
            Ok(mapa.humano(&db::ler_item(&conn, id).map_err(e)?))
        }
        "atualizar_item" => {
            let id = id_de(&conn, a)?;
            let atual = db::ler_item(&conn, id).map_err(e)?;
            let mut dados = json!({ "autor": autor });
            let mut tipo_id = atual.tipo_id;
            if let Some(t) = s(a, "tipo") {
                tipo_id = Some(mapa.tipo_id(t)?);
                dados["tipo_id"] = json!(tipo_id);
            }
            for campo in ["titulo", "corpo"] {
                if let Some(v) = s(a, campo) {
                    dados[campo] = json!(v);
                }
            }
            if let Some(p) = a.get("pasta") {
                dados["pasta"] = p.clone();
            }
            if let Some(p) = a.get("propriedades") {
                dados["props"] = mapa.props_por_id(&conn, tipo_id, p)?;
            }
            db::atualizar_item(&conn, id, &dados).map_err(e)?;
            Ok(mapa.humano(&db::ler_item(&conn, id).map_err(e)?))
        }
        "anotar" => {
            let id = id_de(&conn, a)?;
            let t = s(a, "texto").filter(|t| !t.trim().is_empty()).ok_or("nota vazia")?;
            db::ler_item(&conn, id).map_err(e)?;
            db::anotar(&conn, id, t.trim(), autor).map_err(e)?;
            Ok(json!({ "ok": true, "item": id, "autor": autor }))
        }
        "relacionar" => {
            let id = id_de(&conn, a)?;
            let para = id_de(&conn, &json!({ "id": a.get("para").cloned().unwrap_or(Value::Null) }))?;
            let pid = mapa.prop(s(a, "propriedade").unwrap_or(""))?["id"].as_i64().unwrap_or(0);
            let remover = a.get("remover").and_then(|v| v.as_bool()).unwrap_or(false);
            db::ligar(&conn, id, pid, para, remover, autor).map_err(e)?;
            Ok(mapa.humano(&db::ler_item(&conn, id).map_err(e)?))
        }
        "linha_do_tempo" => {
            let hoje = chrono_hoje();
            let de = s(a, "de").map(String::from).unwrap_or(hoje);
            let ate = s(a, "ate").map(String::from).unwrap_or(de.clone());
            let mut props = vec![];
            if let Some(obj) = a.get("filtros").and_then(|v| v.as_object()) {
                for (k, v) in obj {
                    let pid = mapa.prop(k)?["id"].as_i64().unwrap_or(0);
                    props.push((pid, vec![v.as_str().map(String::from).unwrap_or_else(|| v.to_string())]));
                }
            }
            let filtro = db::Filtro { tipo_id: s(a, "tipo").map(|t| mapa.tipo_id(t)).transpose()?, props, ..Default::default() };
            let ev = db::linha_do_tempo(&conn, &de, &ate, &filtro).map_err(e)?;
            let eventos: Vec<Value> = ev
                .iter()
                .map(|x| json!({
                    "quando": x.criado_em, "quem": x.autor, "o_que": x.texto,
                    "item": format!("#{} {}", x.codigo, x.titulo), "tipo": mapa.tipo_nome(x.tipo_id),
                }))
                .collect();
            Ok(json!({ "de": de, "ate": ate, "total": eventos.len(), "eventos": eventos }))
        }
        "tela" => {
            let r = post_api("/api/tela", a)?;
            if r["ok"] == true {
                Ok(json!({ "ok": true }))
            } else if let Some(e) = r["erro"].as_str() {
                Err(e.to_string())
            } else {
                Err("o app atelier não está aberto (a tela não recebeu o pedido)".into())
            }
        }
        "criar_pasta" => {
            let id = id_de(&conn, a)?;
            let p = atelier_core::pastas::criar(&conn, std::path::Path::new(&banc.caminho), &banc.nome, id, autor).map_err(e)?;
            Ok(json!({ "pasta": p }))
        }
        "criar_tipo" => {
            let id = db::criar_tipo(&conn, &json!({ "nome": s(a, "nome"), "icone": s(a, "icone") })).map_err(e)?;
            Ok(json!({ "ok": true, "id": id, "nome": s(a, "nome") }))
        }
        "criar_propriedade" => {
            let opcoes: Vec<Value> = a
                .get("opcoes")
                .and_then(|v| v.as_array())
                .into_iter()
                .flatten()
                .filter_map(|o| o.as_str())
                .map(|o| json!({ "nome": o, "cor": "gray" }))
                .collect();
            let mut config = Map::new();
            for k in ["inverso", "um_so", "lista", "inteiro", "casas", "formato", "hora"] {
                if let Some(v) = a.get(k).filter(|v| !v.is_null()) {
                    config.insert(k.into(), v.clone());
                }
            }
            let config = Value::Object(config);
            let pid = db::criar_propriedade(&conn, &json!({ "nome": s(a, "nome"), "especie": s(a, "especie"), "opcoes": opcoes, "config": config })).map_err(e)?;
            let mut em = vec![];
            for t in a.get("tipos").and_then(|v| v.as_array()).into_iter().flatten().filter_map(|t| t.as_str()) {
                db::tipo_por_propriedade(&conn, mapa.tipo_id(t)?, pid, &json!({})).map_err(e)?;
                em.push(t.to_string());
            }
            Ok(json!({ "ok": true, "id": pid, "nos_tipos": em }))
        }
        "ligar_propriedade" => {
            let pid = mapa.prop(s(a, "propriedade").unwrap_or(""))?["id"].as_i64().unwrap_or(0);
            let tid = mapa.tipo_id(s(a, "tipo").unwrap_or(""))?;
            if a.get("remover").and_then(|v| v.as_bool()).unwrap_or(false) {
                db::tipo_tira_propriedade(&conn, tid, pid).map_err(e)?;
            } else {
                db::tipo_por_propriedade(&conn, tid, pid, &json!({})).map_err(e)?;
            }
            Ok(json!({ "ok": true }))
        }
        outro => Err(format!("ferramenta desconhecida: {outro}")),
    }
}
