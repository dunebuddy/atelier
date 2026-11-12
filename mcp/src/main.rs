//! atelier-mcp — servidor MCP (stdio, JSON-RPC por linha) do atelier.
//!
//! Fala direto com o banco da bancada aberta (a "ativa" do `~/atelier/config.toml`), então funciona com o app
//! aberto ou fechado. Reabre a bancada a cada chamada: se o Paulo trocar de bancada no app, o agente acompanha.
//! Tipos e propriedades são tratados pelo **nome** (o agente não precisa saber ids).

// a lista de ferramentas é um json! grande demais para o limite padrão da macro
#![recursion_limit = "256"]

use atelier_core::{bancada, db};
use rusqlite::Connection;
use serde_json::{json, Map, Value};
use std::io::{BufRead, Write};

const VERSAO_PROTOCOLO: &str = "2025-06-18";

/// `atelier-mcp hook <trabalhando|esperando|terminou>`: o hook dos agentes (instalado em Integrações). Só age dentro
/// de um terminal do atelier (`ATELIER_SESSAO`); avisa a API e sai sempre com sucesso, rápido, para nunca travar o
/// agente (com o app fechado, não faz nada). Da entrada do agente só se olha o `notification_type` do "esperando";
/// nada dela é enviado.
fn hook(evento: &str) {
    let Some(sessao) = std::env::var("ATELIER_SESSAO").ok().and_then(|s| s.parse::<u64>().ok()) else { return };
    let estado = match evento {
        "trabalhando" | "esperando" | "terminou" => evento,
        _ => return,
    };
    // o Claude Code manda Notification de novo ~60 s depois ("idle_prompt", ainda parado): é a mesma espera (ou o
    // fim de turno, que o Stop já avisou), e virava um segundo toast
    if estado == "esperando" && tipo_da_notificacao().as_deref() == Some("idle_prompt") {
        return;
    }
    let corpo = json!({ "sessao": sessao, "estado": estado }).to_string();
    let Ok(mut s) = std::net::TcpStream::connect_timeout(&std::net::SocketAddr::from(([127, 0, 0, 1], atelier_core::api::porta())), std::time::Duration::from_millis(500)) else { return };
    s.set_write_timeout(Some(std::time::Duration::from_millis(500))).ok();
    s.set_read_timeout(Some(std::time::Duration::from_millis(1000))).ok();
    let req = format!("POST /api/agente/evento HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{corpo}", corpo.len());
    let _ = s.write_all(req.as_bytes());
    let mut lixo = [0u8; 256];
    let _ = std::io::Read::read(&mut s, &mut lixo);
}

/// O `notification_type` do JSON que o Claude Code manda pela entrada do hook (lê no máximo 64 KB).
fn tipo_da_notificacao() -> Option<String> {
    let mut texto = String::new();
    std::io::Read::read_to_string(&mut std::io::Read::take(std::io::stdin(), 65_536), &mut texto).ok()?;
    let v: Value = serde_json::from_str(&texto).ok()?;
    v.get("notification_type")?.as_str().map(String::from)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) == Some("hook") {
        hook(args.get(2).map(String::as_str).unwrap_or(""));
        return;
    }
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
desejos, notas). Tudo é um documento com tipo e propriedades; tipos e propriedades são criados à vontade. \
Ligações entre documentos (pai, bloqueio...) não são fixas: são propriedades da espécie relacao, criadas pelo usuário. Antes de criar, \
use `buscar` para ver se já existe. Use `esquema` para conhecer os tipos, propriedades e opções. Registre o que \
acontece com `anotar` (vira a linha do tempo do documento). Os dados ficam na bancada aberta no app. \
Cada documento tem um código de 7 hexadecimais (ex.: #a3f9c21); use esse código para se referir a ele. \
PADRÃO DE PASTAS: nunca crie pasta de trabalho por conta própria. Quando o trabalho precisar de arquivos, peça ao \
atelier: `criar_pasta` (ou `criar_documento` com `criar_pasta: true`). Ele cria `itens/<código>-<título>/` dentro da \
bancada, com `insumos/` (o que entra), `artefatos/` (o que sai), `rascunho/` e um CLAUDE.md, e liga a pasta ao documento. \
Guarde os arquivos nessas subpastas e registre o andamento no documento com `anotar`, não em arquivos soltos. \
TELA: com o app aberto, `tela` mostra as coisas para o usuário (abrir documento, visão, pasta, arquivo; metade esquerda ou \
direita; workspaces; terminal; tema...); `tela` com acao \"estado\" diz o que está aberto agora. \
QUANDO NÃO DER: se o usuário pedir algo que estas ferramentas não fazem, NÃO improvise por fora (arquivos, comandos, \
banco): chame `nao_consigo` com o pedido e o que faltou, e diga a ele que ficou anotado. CHECKLIST: roteiro de execução com muitos passos (sessão, implantação, migração) não vira um monte de documentos nem um app HTML: é um arquivo <nome>.checklist.json na pasta do documento, que o atelier mostra como checklist e onde grava o progresso; leia o formato com `checklist` acao \"formato\" antes de criar. LINKS: para o usuário abrir um documento com um clique (de fora do atelier, numa mensagem), escreva atelier://doc/<código> (também atelier://visao/<nome> e atelier://bancada/<nome>). BANCADA: você trabalha na bancada em que nasceu (a do terminal do atelier, ou a da pasta onde está); trocar_bancada só pede, o usuário aceita na tela.";

fn ferramentas() -> Value {
    #[allow(non_snake_case)]
    let ID = json!({ "type": ["string", "integer"], "description": "código do documento, ex.: \"a3f9c21\" (aparece como #a3f9c21)" });
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
            "description": "Busca documentos por texto (título e corpo), tipo e propriedades. Por padrão esconde os documentos com status de histórico (feitos, descartados).",
            "inputSchema": { "type": "object", "properties": {
                "texto": { "type": "string" },
                "tipo": { "type": "string", "description": "nome do tipo, ex.: Dívida" },
                "filtros": { "type": "object", "description": "propriedade → valor, ex.: {\"Frente\": \"F2\"}", "additionalProperties": true },
                "livres": { "type": "array", "items": { "type": "string" }, "description": "relações em que tudo o que está ligado já foi concluído (ou nada): [\"Bloqueado por\"] = o que pode andar agora" },
                "incluir_historico": { "type": "boolean" },
                "limite": { "type": "integer", "description": "padrão 50" }
            } }
        },
        {
            "name": "ler_documento",
            "description": "Lê um documento inteiro: propriedades, corpo em markdown, pasta e linha do tempo. so_notas: true deixa na linha do tempo só o que alguém escreveu (sem as mudanças automáticas).",
            "inputSchema": { "type": "object", "properties": { "id": ID, "so_notas": { "type": "boolean" } }, "required": ["id"] }
        },
        {
            "name": "criar_documento",
            "description": "Cria um documento. Sem `modelo`, usa o modelo padrão do tipo (que já traz propriedades e texto). Passe `modelo: \"\"` para criar em branco.",
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
            "name": "atualizar_documento",
            "description": "Atualiza só o que vier: título, tipo (o documento pode mudar de tipo sem perder valores), corpo (substitui o markdown inteiro), propriedades, pasta, favorito (a estrela: campo fixo de todo documento; marcar não conta como mudança). Mudança de status ou tipo vai sozinha para a linha do tempo.",
            "inputSchema": { "type": "object", "properties": {
                "id": ID,
                "titulo": { "type": "string" },
                "tipo": { "type": "string" },
                "corpo": { "type": "string" },
                "propriedades": props,
                "pasta": { "type": ["string", "null"] },
                "favorito": { "type": "boolean" }
            }, "required": ["id"] }
        },
        {
            "name": "editar_trecho",
            "description": "Troca só um pedaço do corpo (markdown) de um documento, sem reenviar o texto inteiro: `de` é o trecho exato que existe hoje, `para` o texto novo. Falha se `de` não estiver no texto (ele pode ter mudado: leia de novo) ou se aparecer mais de uma vez (mande um pedaço maior, ou todas: true). Para várias trocas de uma vez, `trocas: [{de, para, todas?}]`: ou entram todas, ou nenhuma. A linha do tempo registra o que mudou. Prefira esta a atualizar_documento com corpo para mudanças pequenas (marcar um passo, corrigir uma linha).",
            "inputSchema": { "type": "object", "properties": {
                "id": ID,
                "de": { "type": "string" },
                "para": { "type": "string" },
                "todas": { "type": "boolean" },
                "trocas": { "type": "array", "items": { "type": "object", "properties": {
                    "de": { "type": "string" }, "para": { "type": "string" }, "todas": { "type": "boolean" }
                }, "required": ["de", "para"] } }
            }, "required": ["id"] }
        },
        {
            "name": "em_lote",
            "description": "Várias chamadas numa só (criar vários documentos, marcar vários passos...): `operacoes: [{ferramenta, argumentos}]`, com as ferramentas de escrever documentos (criar_documento, atualizar_documento, editar_trecho, anotar, relacionar). Roda em ordem e para na primeira que falhar; a resposta diz o resultado de cada uma e onde parou (as anteriores ficam feitas).",
            "inputSchema": { "type": "object", "properties": {
                "operacoes": { "type": "array", "items": { "type": "object", "properties": {
                    "ferramenta": { "type": "string", "enum": ["criar_documento", "atualizar_documento", "editar_trecho", "anotar", "relacionar"] },
                    "argumentos": { "type": "object" }
                }, "required": ["ferramenta", "argumentos"] } }
            }, "required": ["operacoes"] }
        },
        {
            "name": "consultar",
            "description": "Roda um SQL só de leitura na bancada (SQLite). Use a tabela `documentos`: uma linha por documento, com codigo, titulo, tipo, corpo, criado_em, atualizado_em e uma coluna por propriedade, pelo nome entre aspas duplas (ex.: SELECT codigo, titulo, \"Status\" FROM documentos WHERE tipo = 'Task' AND \"Status\" <> 'Feito'). Relação vem como lista JSON de códigos. Devolve colunas e até 1000 linhas. `nome` roda uma consulta salva; `salvar_como` guarda esta com um nome (aparece em Consultas no app; com a coluna codigo, vira visão).",
            "inputSchema": { "type": "object", "properties": {
                "sql": { "type": "string" },
                "nome": { "type": "string", "description": "nome de uma consulta salva para rodar" },
                "salvar_como": { "type": "string" }
            } }
        },
        {
            "name": "consultas",
            "description": "Lista as consultas salvas da bancada (nome e SQL).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "anotar",
            "description": "Acrescenta uma nota datada na linha do tempo do documento (acompanhamento, decisão, o que foi feito).",
            "inputSchema": { "type": "object", "properties": {
                "id": ID, "texto": { "type": "string" }
            }, "required": ["id", "texto"] }
        },
        {
            "name": "relacionar",
            "description": "Liga o documento `id` ao documento `para` numa propriedade de RELAÇÃO (espécie relacao, criada pelo usuário; veja em esquema quais existem, ex.: \"Pai\", \"Bloqueado por\"). O valor fica no documento `id`; do lado do `para` aparece pelo nome inverso da propriedade. remover: true desliga. Também dá para mandar a lista inteira em atualizar_item: {\"Bloqueado por\": [\"#a3f9c21\"]}. Para só citar um documento no texto ou numa nota, escreva o código com # (ex.: #a3f9c21): vira link e aparece em \"mencionado em\".",
            "inputSchema": { "type": "object", "properties": {
                "id": ID, "para": ID,
                "propriedade": { "type": "string", "description": "nome da propriedade de relação" },
                "remover": { "type": "boolean" }
            }, "required": ["id", "para", "propriedade"] }
        },
        {
            "name": "tela",
            "description": "Mexe na tela do app atelier (precisa estar aberto). O painel de trabalho tem uma ou duas metades (esquerda/direita), cada uma com janelas em abas, tile ou fita; cada documento tem um workspace (um painel só dele) e a bancada tem o seu. Ações: abrir (codigo = documento; visao = nome; lista = lista temporária, sem salvar; tipo = configuração do tipo; pasta = código do documento, abre a árvore da pasta dele; arquivo = caminho absoluto; lixeira: true) · workspace (codigo = do documento; sem codigo = o da bancada) · fechar_workspace · renomear_workspace (codigo = o do documento, sem codigo = o da bancada; nome; nome vazio volta ao título do documento; o workspace já acompanha sozinho o título do documento) · visao_geral (mostra todos os workspaces) · dividir (cria o painel da direita; se já existe e está escondido, mostra) · esconder_direita / mostrar_direita (a metade da direita some da tela sem fechar nada, como o Ctrl+barra invertida do Paulo) · juntar (passa as janelas da direita para a esquerda; só se ele pedir) · modo (modo: abas|tile|fita) · fechar (janela: id do estado|atual|todas|parte do título; janela fixada nunca fecha por aqui) · fixar / desafixar (janela: id do estado|atual; fixada = alfinete: nada troca o que ela mostra, o que se abre nela vai para uma janela nova, e só o Paulo fecha) · expandir (janela: id|atual; liga/desliga: ela fica com 85% do painel e o resto à vista) · focar (janela: id do estado, ou painel) · terminal (codigo = na pasta do documento; bancada: true = na raiz; programa = id do agente, ex.: claude-code; shell = pwsh|cmd|wsl...) · explorador_sistema (abre a pasta no Explorer: codigo ou a bancada; app = claude|codex|deepseek abre esse agente com janela própria na pasta, em vez do Explorer) · barra_lateral (mostrar) · tema (tema) · zoom (80-160) · configuracoes (secao: aparencia, bancadas, integracoes, editor, atalhos, automacao, bancada, tipos) · busca (texto: abre a busca rápida) · recarregar (depois de mudar coisas) · filtrar (texto, na visão aberta) · destacar (codigo) · estado (o que está aberto agora: os painéis numerados 0 e 1 e cada janela com id, posição e o que mostra). Em abrir e terminal, painel: 0|1 (ou lado: esquerda|direita) escolhe o painel (o 1 nasce se preciso) e ao_lado: true abre numa janela nova. Para trocar uma janela por outra no mesmo lugar: leia o estado, feche pelo id e abra no mesmo painel.",
            "inputSchema": { "type": "object", "properties": {
                "acao": { "type": "string", "enum": ["abrir", "workspace", "fechar_workspace", "renomear_workspace", "visao_geral", "dividir", "esconder_direita", "mostrar_direita", "juntar", "modo", "fechar", "fixar", "desafixar", "expandir", "focar", "terminal", "explorador_sistema", "barra_lateral", "tema", "zoom", "configuracoes", "busca", "recarregar", "filtrar", "destacar", "estado"] },
                "codigo": { "type": "string", "description": "código do documento" },
                "visao": { "type": "string" },
                "tipo": { "type": "string" },
                "pasta": { "type": "string", "description": "abrir: código do documento cuja pasta abre em árvore" },
                "arquivo": { "type": "string", "description": "abrir: caminho absoluto de um arquivo" },
                "lixeira": { "type": "boolean" },
                "nome": { "type": "string", "description": "renomear_workspace: o nome novo (vazio = volta ao do documento)" },
                "lista": { "type": "object", "additionalProperties": true, "description": "abrir: uma lista TEMPORÁRIA, que não fica salva em lugar nenhum (o jeito certo de mostrar algo ao usuário, ex.: os filhos de um documento). Os mesmos campos de criar_visao: nome (título da janela), layout, tipos, filtros ({\"Pai\": [\"#abc1234\"]}), ordenar, colunas..." },
                "lado": { "type": "string", "enum": ["esquerda", "direita"] },
                "painel": { "type": "integer", "description": "abrir, terminal, focar, fechar, modo: o painel pelo número que o estado mostra (0 = esquerda, 1 = direita); vale mais que lado" },
                "app": { "type": "string", "enum": ["claude", "codex", "deepseek"] },
                "ao_lado": { "type": "boolean" },
                "modo": { "type": "string", "enum": ["abas", "tile", "fita"] },
                "janela": { "type": "string", "description": "fechar: o id da janela (do estado), atual, todas ou parte do título; focar: o id da janela" },
                "bancada": { "type": "boolean", "description": "terminal: na raiz da bancada" },
                "programa": { "type": "string", "description": "terminal: id do agente (claude-code, codex...)" },
                "shell": { "type": "string" },
                "mostrar": { "type": "boolean" },
                "tema": { "type": "string" },
                "zoom": { "type": "integer" },
                "secao": { "type": "string" },
                "texto": { "type": "string" }
            }, "required": ["acao"] }
        },
        {
            "name": "bancadas",
            "description": "Lista as bancadas (cada uma é uma base separada: trabalho, um projeto, uma campanha de RPG...) e diz qual está aberta.",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "trocar_bancada",
            "description": "Abre outra bancada (pelo nome, sem diferenciar maiúsculas; serve parte do nome). Com o app aberto, a tela troca junto. Tudo o que vier depois (buscar, criar...) vale na bancada nova.",
            "inputSchema": { "type": "object", "properties": { "nome": { "type": "string" } }, "required": ["nome"] }
        },
        {
            "name": "visoes",
            "description": "Lista as visões da bancada aberta (o menu da esquerda): nome, layout, filtro (com nomes de tipos e propriedades).",
            "inputSchema": { "type": "object", "properties": {} }
        },
        {
            "name": "criar_visao",
            "description": "Cria uma visão: uma lista SALVA, que fica para sempre no menu da esquerda. Só crie quando o usuário pedir uma visão nova; para mostrar uma lista a ele (filhos, passos, uma busca), use tela abrir com lista, que é temporária. Campos: nome, layout (tabela, lista, kanban, linha), tipos (nomes), filtros (propriedade → valores aceitos; numa relação, o código do documento: {\"Pai\": [\"#abc1234\"]} = filhos dele), livres (relações em que tudo o que está ligado já foi concluído, ou não há nada: livres [\"Bloqueado por\"] = pode andar agora), sem_tipo (só documentos sem tipo), texto, agrupar_por (kanban: nome da propriedade), grupo (pasta no menu), icone (emoji), ordenar ({propriedade, crescente}; null volta à ordem padrão), colunas (nomes das propriedades na ordem em que aparecem na tabela; [] volta ao padrão), secoes (blocos um embaixo do outro na tabela/lista, cada um {titulo, favoritos?: true, recentes_dias?: N, abertos?: true, limite?: N (padrão 10, 0 = todos)}; o padrão de tipo novo é Favoritas · Recentes (15 dias) · Abertas · Todas; [] volta a uma lista só), larguras (coluna → px; Título, Tipo e Atualizado também; {} volta ao automático).",
            "inputSchema": { "type": "object", "properties": {
                "nome": { "type": "string" },
                "layout": { "type": "string", "enum": ["tabela", "lista", "kanban", "linha"] },
                "tipos": { "type": "array", "items": { "type": "string" } },
                "filtros": { "type": "object", "additionalProperties": true },
                "livres": { "type": "array", "items": { "type": "string" } },
                "sem_tipo": { "type": "boolean" },
                "texto": { "type": "string" },
                "agrupar_por": { "type": "string" }, "secoes": { "type": "array", "items": { "type": "object", "additionalProperties": true } },
                "grupo": { "type": "string" },
                "icone": { "type": "string" },
                "ordenar": { "type": ["object", "null"], "properties": { "propriedade": { "type": "string" }, "crescente": { "type": "boolean" } } },
                "colunas": { "type": "array", "items": { "type": "string" } },
                "larguras": { "type": "object", "additionalProperties": { "type": "number" } }
            }, "required": ["nome"] }
        },
        {
            "name": "atualizar_visao",
            "description": "Muda uma visão (pelo nome): os mesmos campos de criar_visao, mais novo_nome. O filtro vindo substitui o antigo; agrupar_por, ordenar, colunas e larguras mudam só o que vier. A visão Todos os documentos não aceita filtro.",
            "inputSchema": { "type": "object", "properties": {
                "nome": { "type": "string" }, "novo_nome": { "type": "string" },
                "layout": { "type": "string", "enum": ["tabela", "lista", "kanban", "linha"] },
                "tipos": { "type": "array", "items": { "type": "string" } },
                "filtros": { "type": "object", "additionalProperties": true },
                "livres": { "type": "array", "items": { "type": "string" } },
                "sem_tipo": { "type": "boolean" }, "texto": { "type": "string" },
                "agrupar_por": { "type": "string" }, "secoes": { "type": "array", "items": { "type": "object", "additionalProperties": true } }, "grupo": { "type": "string" }, "icone": { "type": "string" },
                "ordenar": { "type": ["object", "null"], "properties": { "propriedade": { "type": "string" }, "crescente": { "type": "boolean" } } },
                "colunas": { "type": "array", "items": { "type": "string" } },
                "larguras": { "type": "object", "additionalProperties": { "type": "number" } }
            }, "required": ["nome"] }
        },
        {
            "name": "apagar_visao",
            "description": "Tira uma visão do menu (os documentos não são tocados). Confirme com o usuário antes.",
            "inputSchema": { "type": "object", "properties": { "nome": { "type": "string" } }, "required": ["nome"] }
        },
        {
            "name": "apagar_documento",
            "description": "Move o documento para a lixeira (dá para restaurar). Confirme com o usuário antes.",
            "inputSchema": { "type": "object", "properties": { "id": ID }, "required": ["id"] }
        },
        {
            "name": "restaurar_documento",
            "description": "Tira o documento da lixeira.",
            "inputSchema": { "type": "object", "properties": { "id": ID }, "required": ["id"] }
        },
        {
            "name": "checklist",
            "description": "Checklist do atelier: arquivo <nome>.checklist.json na pasta do documento, que a tela mostra como checklist e onde ela grava o progresso. Use para roteiros de execução (muitos passos curtos); etapa com vida própria é documento. Ações: formato (o formato do arquivo, com exemplo: LEIA ANTES de criar um) · ler (com id = código do documento: o resumo dos checklists da pasta dele; com arquivo: só aquele) · marcar (arquivo, passo = id do passo, feito true/false, pulado, obs). Para criar, escreva o arquivo (de costume em artefatos/) e mostre com `tela` abrir arquivo.",
            "inputSchema": { "type": "object", "properties": {
                "acao": { "type": "string", "enum": ["formato", "ler", "marcar"] },
                "id": ID,
                "arquivo": { "type": "string", "description": "caminho absoluto do .checklist.json" },
                "passo": { "type": "string", "description": "marcar: o id do passo" },
                "feito": { "type": "boolean", "description": "marcar: true marca, false desmarca (padrão true)" },
                "pulado": { "type": "boolean", "description": "marcar: feito como \"não se aplica\"" },
                "obs": { "type": "string", "description": "marcar: observação do passo (vazio apaga)" }
            }, "required": ["acao"] }
        },
        {
            "name": "espaco_em_disco",
            "description": "Quanto ocupa no disco: com id (código do documento), a pasta do workspace dele e a dele somada à dos descendentes (Pai → Filhos, a árvore inteira); sem id, a pasta da bancada inteira. Pasta dentro de outra não conta duas vezes.",
            "inputSchema": { "type": "object", "properties": { "id": ID } }
        },
        {
            "name": "nao_consigo",
            "description": "Use quando o usuário pedir algo que as ferramentas do atelier não fazem: fica anotado num arquivo de pedidos (vira recurso novo) e a tela avisa. Diga o pedido como o usuário falou e o que faltou.",
            "inputSchema": { "type": "object", "properties": {
                "pedido": { "type": "string" }, "motivo": { "type": "string", "description": "o que faltou nas ferramentas" }
            }, "required": ["pedido"] }
        },
        {
            "name": "linha_do_tempo",
            "description": "O que aconteceu num período, com data e hora de cada coisa: documentos criados, notas, mudanças de status, propriedades, título, pasta e texto, com quem fez (Paulo ou o agente). Responde a \"no que trabalhei hoje/ontem/nesta semana?\". Sem datas = hoje.",
            "inputSchema": { "type": "object", "properties": {
                "de": { "type": "string", "description": "AAAA-MM-DD (padrão: hoje)" },
                "ate": { "type": "string", "description": "AAAA-MM-DD (padrão: igual a `de`)" },
                "tipo": { "type": "string" },
                "filtros": { "type": "object", "additionalProperties": true },
                "so_notas": { "type": "boolean", "description": "só o que alguém escreveu (anotar), sem as mudanças automáticas" }
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
            "description": "Cria uma propriedade (compartilhada entre tipos) e, se quiser, já coloca em tipos. Espécies: texto, numero (inteiro, casas, formato), data (hora), checkbox (sim/não), url, email, telefone, selecao, multisselecao, status, links (vários links com rótulo), criado_em e atualizado_em (automáticas); texto/numero/data/email/telefone/url com lista: true guardam vários valores; relacao (aponta para outros documentos; `inverso` é como se lê do outro lado, ex.: \"Bloqueado por\" ↔ \"Bloqueia\"; `outro_lado`: false esconde essa lista do outro lado; `um_so` aceita um documento só, ex.: \"Pai\"); lista (lista dinâmica, calculada: os documentos dos tipos `lista_tipos` cuja relação `lista_relacao` aponta para o documento, na ordem de `lista_ordenar`, ex.: no tipo Task, \"Passos\" = tipo Passo com Pai = este, por Ordem; não se escreve nela); formula (valor calculado de outras propriedades: `expressao`; não se escreve nela). No texto de um documento, um bloco ```atelier-lista com linhas tipos: / relacao: / ordenar: / colunas: mostra a mesma lista ao vivo.",
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
                "um_so": { "type": "boolean", "description": "relacao: aceita um documento só" },
                "outro_lado": { "type": "boolean", "description": "relacao: mostra a lista de quem aponta na página do documento apontado (padrão: não)" },
                "lista_tipos": { "type": "array", "items": { "type": "string" }, "description": "lista: tipos dos documentos listados (vazio = qualquer)" },
                "lista_relacao": { "type": "string", "description": "lista: a propriedade de relação que liga os documentos a este (ex.: Pai)" },
                "lista_ordenar": { "type": "string", "description": "lista: propriedade para ordenar (ou titulo, criado_em); com - na frente, decrescente" },
                "expressao": { "type": "string", "description": "formula: ex. {Horas} * {Valor}, {Título} + \" - \" + {Status}, conta({Passos}), soma({Passos}, \"Horas\"), se({Horas} > 8, \"longo\", \"curto\"); funções: conta, soma, media, min, max, arred, se" },
                "tipos": { "type": "array", "items": { "type": "string" }, "description": "nomes dos tipos que passam a ter a propriedade" }
            }, "required": ["nome", "especie"] }
        },
        {
            "name": "ligar_propriedade",
            "description": "Põe uma propriedade que já existe num tipo (ou tira, com remover: true; os valores ficam guardados).",
            "inputSchema": { "type": "object", "properties": {
                "propriedade": { "type": "string" }, "tipo": { "type": "string" }, "remover": { "type": "boolean" }
            }, "required": ["propriedade", "tipo"] }
        },
        {
            "name": "mudar_propriedade",
            "description": "Renomeia uma propriedade (novo_nome) ou muda a config dela (ex.: molde de link: {\"molde\": \"https://exemplo/{valor}\"} numa propriedade de texto ou número mostra o valor como link).",
            "inputSchema": { "type": "object", "properties": {
                "propriedade": { "type": "string" }, "novo_nome": { "type": "string" },
                "config": { "type": "object", "description": "chaves a mudar na config; null tira a chave" }
            }, "required": ["propriedade"] }
        },
        {
            "name": "apagar_propriedade",
            "description": "Apaga uma propriedade de vez (sai de todos os tipos e os valores dos documentos somem). Sem confirmado, só diz quantos documentos têm valor nela: mostre ao usuário e só chame de novo com confirmado: true se ele aceitar.",
            "inputSchema": { "type": "object", "properties": {
                "propriedade": { "type": "string" }, "confirmado": { "type": "boolean" }
            }, "required": ["propriedade"] }
        },
        {
            "name": "mudar_tipo",
            "description": "Renomeia um tipo (novo_nome) e/ou troca o ícone (emoji).",
            "inputSchema": { "type": "object", "properties": {
                "tipo": { "type": "string" }, "novo_nome": { "type": "string" }, "icone": { "type": "string" }
            }, "required": ["tipo"] }
        },
        {
            "name": "apagar_tipo",
            "description": "Apaga um tipo (os documentos dele ficam, sem tipo; a visão só dele some). Sem confirmado, só diz quantos documentos são do tipo: mostre ao usuário e só chame de novo com confirmado: true se ele aceitar.",
            "inputSchema": { "type": "object", "properties": {
                "tipo": { "type": "string" }, "confirmado": { "type": "boolean" }
            }, "required": ["tipo"] }
        },
        {
            "name": "mudar_opcao",
            "description": "Mexe numa opção de seleção ou status: novo_nome (os documentos com o nome antigo passam a ter o novo), cor, historico (true = conta como concluído) ou apagar: true (os documentos perdem esse valor). Com tipo, mexe na lista daquele tipo (status é sempre por tipo).",
            "inputSchema": { "type": "object", "properties": {
                "propriedade": { "type": "string" }, "opcao": { "type": "string" }, "tipo": { "type": "string" },
                "novo_nome": { "type": "string" }, "cor": { "type": "string", "enum": ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"] },
                "historico": { "type": "boolean" }, "apagar": { "type": "boolean" }
            }, "required": ["propriedade", "opcao"] }
        },
        {
            "name": "criar_bancada",
            "description": "Cria uma bancada nova, limpa (só a visão Todos os documentos). pasta padrão: ~/atelier/bancadas/<nome>. abrir: true já troca para ela.",
            "inputSchema": { "type": "object", "properties": {
                "nome": { "type": "string" }, "pasta": { "type": "string" }, "abrir": { "type": "boolean" }
            }, "required": ["nome"] }
        }
    ])
}

// ---------- execução ----------

/// A bancada deste agente: a do terminal do atelier em que ele nasceu (`ATELIER_BANCADA`); senão, a da pasta onde
/// ele está, se ela fica dentro de uma bancada; senão, a ativa no app. Assim o agente não muda de bancada quando o
/// Paulo troca a da janela.
fn bancada_do_agente(cfg: &bancada::Config) -> Option<bancada::Bancada> {
    if let Ok(c) = std::env::var("ATELIER_BANCADA") {
        if let Some(b) = cfg.bancadas.iter().find(|b| bancada::mesmo_caminho(&b.caminho, &c)) {
            return Some(b.clone());
        }
    }
    if let Ok(aqui) = std::env::current_dir() {
        let aqui = aqui.to_string_lossy().to_lowercase().replace('/', "\\");
        if let Some(b) = cfg.bancadas.iter().filter(|b| {
            let c = b.caminho.to_lowercase().replace('/', "\\");
            aqui == c || aqui.starts_with(&format!("{}\\", c.trim_end_matches('\\')))
        }).max_by_key(|b| b.caminho.len()) {
            return Some(b.clone());
        }
    }
    cfg.ativa().cloned()
}

fn abrir() -> Result<(Connection, bancada::Bancada), String> {
    let cfg = bancada::carregar();
    let b = bancada_do_agente(&cfg)
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
    /// `{ tipos: [nomes], filtros: {prop: [valores]}, ... }` → o que `db::criar_visao`/`atualizar_visao` entendem.
    fn dados_visao(&self, a: &Value) -> Result<Value, String> {
        let mut d = json!({});
        for k in ["layout", "grupo", "icone"] {
            if let Some(v) = s(a, k) {
                d[k] = json!(v);
            }
        }
        let quer_filtro = ["tipos", "filtros", "sem_tipo", "texto", "livres"].iter().any(|k| a.get(*k).is_some());
        if quer_filtro {
            let mut f = json!({});
            if let Some(l) = a.get("tipos").and_then(|v| v.as_array()) {
                f["tipos"] = json!(l.iter().filter_map(|t| t.as_str()).map(|t| self.tipo_id(t)).collect::<Result<Vec<_>, _>>()?);
            }
            if let Some(o) = a.get("filtros").and_then(|v| v.as_object()) {
                let mut props = Map::new();
                for (k, v) in o {
                    let pid = self.prop(k)?["id"].as_i64().unwrap_or(0);
                    let mut vals: Vec<Value> = match v {
                        Value::Array(l) => l.clone(),
                        outro => vec![outro.clone()],
                    };
                    // relação: o valor é o código do item ("#abc1234" ou "abc1234")
                    if self.prop(k)?["especie"] == "relacao" {
                        vals = vals.iter().map(|x| json!(x.as_str().unwrap_or("").trim().trim_start_matches('#').to_lowercase())).collect();
                    }
                    props.insert(pid.to_string(), json!(vals));
                }
                f["props"] = Value::Object(props);
            }
            if a.get("sem_tipo").and_then(|v| v.as_bool()) == Some(true) {
                f["sem_tipo"] = json!(true);
            }
            if let Some(t) = s(a, "texto") {
                f["texto"] = json!(t);
            }
            if let Some(l) = a.get("livres").and_then(|v| v.as_array()) {
                f["livres"] = json!(l.iter().filter_map(|x| x.as_str()).map(|x| Ok(self.prop(x)?["id"].clone())).collect::<Result<Vec<_>, String>>()?);
            }
            d["filtro"] = f;
        }
        // config: só as chaves que vieram; null tira a chave (volta ao padrão). Quem grava mescla com a de antes.
        let mut cfg = Map::new();
        if let Some(p) = s(a, "agrupar_por") {
            cfg.insert("agrupar_por".into(), self.prop(p)?["id"].clone());
        }
        match a.get("ordenar") {
            Some(Value::Null) => {
                cfg.insert("ordenar".into(), Value::Null);
            }
            Some(o) => {
                let nome = o.get("propriedade").and_then(|v| v.as_str()).or(o.as_str()).ok_or("ordenar: { propriedade, crescente }")?;
                let asc = o.get("crescente").and_then(|v| v.as_bool()).unwrap_or(true);
                // as colunas fixas da tabela também ordenam
                let prop = match nome.trim().to_lowercase().as_str() {
                    "título" | "titulo" => json!("titulo"),
                    "tipo" => json!("tipo"),
                    "atualizado" | "atualizado em" | "última atualização" => json!("atualizado"),
                    _ => self.prop(nome)?["id"].clone(),
                };
                cfg.insert("ordenar".into(), json!({ "prop": prop, "asc": asc }));
            }
            None => {}
        }
        // seções: blocos um embaixo do outro, cada um com o seu recorte ([] volta a uma lista só)
        if let Some(l) = a.get("secoes").and_then(|v| v.as_array()) {
            let ok = l.iter().all(|x| x.get("titulo").and_then(|t| t.as_str()).is_some());
            if !ok {
                return Err("secoes: cada uma precisa de titulo".into());
            }
            cfg.insert("secoes".into(), if l.is_empty() { Value::Null } else { json!(l) });
        }
        if let Some(l) = a.get("colunas").and_then(|v| v.as_array()) {
            let ids = l.iter().filter_map(|c| c.as_str()).map(|c| Ok(self.prop(c)?["id"].clone())).collect::<Result<Vec<_>, String>>()?;
            cfg.insert("colunas".into(), if ids.is_empty() { Value::Null } else { json!(ids) });
        }
        if let Some(m) = a.get("larguras").and_then(|v| v.as_object()) {
            let mut l = Map::new();
            for (col, px) in m {
                let px = px.as_f64().ok_or_else(|| format!("larguras: {col} precisa de um número (px)"))?.clamp(60.0, 2000.0).round();
                let chave = match col.trim().to_lowercase().as_str() {
                    "título" | "titulo" => "titulo".to_string(),
                    "tipo" => "tipo".to_string(),
                    "atualizado" | "atualizado em" => "atualizado".to_string(),
                    _ => self.prop(col)?["id"].to_string(),
                };
                l.insert(chave, json!(px as i64));
            }
            cfg.insert("larguras".into(), if l.is_empty() { Value::Null } else { Value::Object(l) });
        }
        if !cfg.is_empty() {
            d["config"] = Value::Object(cfg);
        }
        Ok(d)
    }
    /// O filtro guardado (ids) lido com nomes.
    fn filtro_humano(&self, f: &Value) -> Value {
        let mut h = f.clone();
        if let Some(l) = f["tipos"].as_array() {
            h["tipos"] = json!(l.iter().map(|t| self.tipo_nome(t.as_i64())).collect::<Vec<_>>());
        }
        if let Some(o) = f["props"].as_object() {
            h["props"] = Value::Object(o.iter().map(|(k, v)| (self.prop_nome(k), v.clone())).collect());
        }
        if let Some(l) = f["livres"].as_array() {
            h["livres"] = json!(l.iter().map(|id| self.prop_nome(&id.to_string())).collect::<Vec<_>>());
        }
        h
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
    /// O status de um documento (o valor da propriedade de espécie status que ele tiver).
    fn status_de(&self, props: &Value) -> Option<Value> {
        let obj = props.as_object()?;
        self.props().iter().find(|p| p["especie"] == "status" && obj.contains_key(&p["id"].to_string())).map(|p| obj[&p["id"].to_string()].clone())
    }

    /// "#código título · tipo · Status · Ordem 2" de um documento de lista.
    fn resumo_curto(&self, i: &Value) -> String {
        let mut partes = vec![format!("#{} {}", i["codigo"].as_str().unwrap_or(""), i["titulo"].as_str().unwrap_or(""))];
        if let Value::String(t) = self.tipo_nome(i["tipo_id"].as_i64()) {
            partes.push(t);
        }
        if let Some(Value::String(st)) = self.status_de(&i["props"]) {
            partes.push(st);
        }
        if let Some(o) = self.props().iter().find(|p| p["nome"].as_str().is_some_and(|n| n.eq_ignore_ascii_case("ordem"))) {
            if let Some(val) = i["props"].get(o["id"].to_string()).filter(|v| !v.is_null()) {
                partes.push(format!("Ordem {}", val.as_str().map(String::from).unwrap_or(val.to_string())));
            }
        }
        partes.join(" · ")
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
            "favorito": it.favorito,
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
            v["apontado_por"] = json!(r.as_array().into_iter().flatten().map(|r| {
                let mut x = json!({
                    "como": r["rotulo"],
                    "item": format!("#{} {}", r["item"]["codigo"].as_str().unwrap_or(""), r["item"]["titulo"].as_str().unwrap_or("")),
                    "tipo": self.tipo_nome(r["item"]["tipo_id"].as_i64()),
                });
                if let Some(st) = self.status_de(&r["item"]["props"]) {
                    x["status"] = st;
                }
                x
            }).collect::<Vec<_>>());
        }
        // listas dinâmicas do tipo, já calculadas: { "Passos": ["#código título · Status · Ordem 2", ...] }
        if let Some(Value::Object(ls)) = &it.listas {
            let mut m = Map::new();
            for (pid, itens) in ls {
                m.insert(self.prop_nome(pid), json!(itens.as_array().into_iter().flatten().map(|i| self.resumo_curto(i)).collect::<Vec<_>>()));
            }
            if !m.is_empty() {
                v["listas"] = Value::Object(m);
            }
        }
        if let Some(m) = &it.mencionado_em {
            v["mencionado_em"] = json!(m.as_array().into_iter().flatten().map(|m| format!("#{} {}", m["codigo"].as_str().unwrap_or(""), m["titulo"].as_str().unwrap_or(""))).collect::<Vec<_>>());
        }
        v
    }
}

/// A config que veio (só as chaves mudadas, null = tirar) por cima da de antes; sem nada vindo, não mexe.
fn mesclar_config(d: &mut Value, antes: &Value) {
    let Some(novo) = d.get("config").and_then(|c| c.as_object()).cloned() else { return };
    let mut cfg = antes.as_object().cloned().unwrap_or_default();
    for (k, v) in novo {
        if v.is_null() {
            cfg.remove(&k);
        } else {
            cfg.insert(k, v);
        }
    }
    d["config"] = Value::Object(cfg);
}

/// POST na API local do app (127.0.0.1:7477), sem dependência de cliente HTTP.
fn post_api(caminho: &str, corpo: &Value) -> Result<Value, String> {
    use std::io::Read;
    use std::net::TcpStream;
    let mut s = TcpStream::connect(("127.0.0.1", atelier_core::api::porta())).map_err(|_| "o app atelier não está aberto".to_string())?;
    s.set_read_timeout(Some(std::time::Duration::from_secs(10))).ok();
    let b = corpo.to_string();
    let req = format!(
        "POST {caminho} HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{}Connection: close\r\n\r\n{b}",
        b.len(),
        // a tela que recebe é a da bancada deste agente
        bancada_do_agente(&bancada::carregar()).map(|x| format!("x-atelier-bancada: {}\r\n", atelier_core::api::codificar_bancada(&x.caminho))).unwrap_or_default()
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
        _ => Err("informe o id (código do documento)".into()),
    }
}

fn s<'a>(a: &'a Value, campo: &str) -> Option<&'a str> {
    a.get(campo).and_then(|v| v.as_str())
}

fn chamar(nome: &str, a: &Value, autor: &str) -> Result<Value, String> {
    // 0.2.1: item virou "documento"; os nomes antigos das ferramentas continuam valendo (agentes com o nome guardado)
    let nome = match nome {
        "ler_item" => "ler_documento",
        "criar_item" => "criar_documento",
        "atualizar_item" => "atualizar_documento",
        "apagar_item" => "apagar_documento",
        "restaurar_item" => "restaurar_documento",
        outro => outro,
    };
    match nome {
        "bancadas" => {
            let cfg = bancada::carregar();
            let ativa = cfg.ativa().map(|b| b.caminho.clone());
            let l: Vec<Value> = cfg.bancadas.iter().map(|b| json!({ "nome": b.nome, "pasta": b.caminho, "aberta": Some(&b.caminho) == ativa.as_ref() })).collect();
            return Ok(json!({ "bancadas": l }));
        }
        "trocar_bancada" => {
            let nome = s(a, "nome").unwrap_or("").trim().to_lowercase();
            let mut cfg = bancada::carregar();
            let achadas: Vec<bancada::Bancada> = cfg.bancadas.iter().filter(|b| b.nome.to_lowercase() == nome).cloned().collect();
            let achadas = if achadas.is_empty() { cfg.bancadas.iter().filter(|b| b.nome.to_lowercase().contains(&nome)).cloned().collect() } else { achadas };
            let b = match achadas.as_slice() {
                [b] => b.clone(),
                [] => return Err(format!("bancada \"{nome}\" não existe (bancadas: {})", cfg.bancadas.iter().map(|b| b.nome.as_str()).collect::<Vec<_>>().join(", "))),
                v => return Err(format!("mais de uma bancada com \"{nome}\": {}", v.iter().map(|b| b.nome.as_str()).collect::<Vec<_>>().join(", "))),
            };
            // trocar de bancada é sério: com o app aberto, a tela pergunta ao Paulo e só troca se ele aceitar;
            // fechado, muda direto o config.toml (vale quando ele abrir)
            match post_api("/api/tela", &json!({ "acao": "pedir_bancada", "caminho": b.caminho, "nome": b.nome })) {
                Ok(r) if r["ok"] == true => {
                    return Ok(json!({ "pedido": true, "bancada": b.nome,
                        "diga_ao_usuario": format!("pedi para trocar para a bancada {}: aceite na tela do atelier", b.nome),
                        "aviso": "a troca só acontece se o usuário aceitar; confira depois com a ferramenta bancadas. Este agente continua na bancada em que nasceu (a do terminal dele)." }));
                }
                Ok(r) if r.get("erro").is_some() => return Err(r["erro"].as_str().unwrap_or("o app recusou").to_string()),
                _ => {
                    cfg.ativa = Some(b.caminho.clone());
                    bancada::salvar(&cfg).map_err(|e| e.to_string())?;
                }
            }
            return Ok(json!({ "ok": true, "aberta": b.nome }));
        }
        "criar_bancada" => {
            let nome = s(a, "nome").map(str::trim).filter(|n| !n.is_empty()).ok_or("informe o nome da bancada")?;
            let pasta = s(a, "pasta").map(String::from).unwrap_or_else(|| {
                bancada::pasta_atelier().join("bancadas").join(atelier_core::pastas::slug(nome)).to_string_lossy().to_string()
            });
            let abrir = a.get("abrir").and_then(|v| v.as_bool()).unwrap_or(false);
            // com o app aberto, pela API (a tela acompanha); fechado, direto na config
            if let Ok(r) = post_api("/api/bancadas", &json!({ "nome": nome, "caminho": pasta, "ativar": abrir })) {
                if r.get("caminho").is_some() {
                    return Ok(json!({ "ok": true, "bancada": r, "aberta": abrir }));
                }
                if let Some(erro) = r.get("erro") {
                    return Err(erro.as_str().unwrap_or("não criei a bancada").to_string());
                }
            }
            let mut cfg = bancada::carregar();
            let nova = cfg.acrescentar(nome, &pasta).map_err(|x| x.to_string())?;
            db::abrir(&bancada::banco_da(&nova.caminho)).map_err(|x| x.to_string())?;
            if abrir {
                cfg.ativa = Some(nova.caminho.clone());
            }
            bancada::salvar(&cfg).map_err(|x| x.to_string())?;
            return Ok(json!({ "ok": true, "bancada": { "nome": nova.nome, "caminho": nova.caminho }, "aberta": abrir }));
        }
        "nao_consigo" => {
            let pedido = s(a, "pedido").unwrap_or("");
            let motivo = s(a, "motivo").unwrap_or("");
            let arq = match post_api("/api/falta", &json!({ "pedido": pedido, "motivo": motivo, "agente": autor })) {
                Ok(r) if r["ok"] == true => r["arquivo"].as_str().unwrap_or("").to_string(),
                _ => bancada::anotar_pedido(pedido, motivo, autor).map_err(|e| e.to_string())?,
            };
            return Ok(json!({ "ok": true, "anotado_em": arq, "diga_ao_usuario": "isso ainda não dá para fazer pelo atelier; ficou anotado como pedido de recurso" }));
        }
        _ => {}
    }
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
                livres: a
                    .get("livres")
                    .and_then(|v| v.as_array())
                    .map(|l| l.iter().filter_map(|x| x.as_str()).map(|x| mapa.prop(x).map(|p| p["id"].as_i64().unwrap_or(0))).collect::<Result<Vec<_>, _>>())
                    .transpose()?
                    .unwrap_or_default(),
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
        "ler_documento" => {
            let id = id_de(&conn, a)?;
            let mut it = db::ler_item(&conn, id).map_err(e)?;
            if a.get("so_notas").and_then(|v| v.as_bool()) == Some(true) {
                if let Some(n) = it.notas.as_mut() {
                    n.retain(|x| !db::nota_automatica(&x.texto));
                }
            }
            let mut v = mapa.humano(&it);
            // as listas ao vivo do texto (blocos atelier-lista), calculadas: o agente vê o que o Paulo vê
            let blocos: Vec<Value> = db::blocos_de_lista(it.corpo.as_deref().unwrap_or(""))
                .iter()
                .map(|b| match db::config_de_lista(&conn, b).and_then(|cfg| db::lista_dinamica(&conn, &it.codigo, &cfg)) {
                    Ok(itens) => json!({ "bloco": b, "documentos": itens.iter().map(|i| mapa.resumo_curto(&json!(i))).collect::<Vec<_>>() }),
                    Err(x) => json!({ "bloco": b, "erro": x.to_string() }),
                })
                .collect();
            if !blocos.is_empty() {
                v["listas_no_texto"] = json!(blocos);
            }
            // os checklists da pasta (*.checklist.json), resumidos: progresso e o que já pode andar
            if let Some(pasta) = it.pasta.as_deref().filter(|p| !p.is_empty()) {
                let base = std::path::PathBuf::from(pasta);
                let cks: Vec<Value> = atelier_core::checklist::achar(&base).iter().map(|p| atelier_core::checklist::resumo(p, Some(&base))).collect();
                if !cks.is_empty() {
                    v["checklists"] = json!(cks);
                }
            }
            Ok(v)
        }
        "criar_documento" => {
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
        "atualizar_documento" => {
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
            if let Some(f) = a.get("favorito").and_then(|v| v.as_bool()) {
                dados["favorito"] = json!(f);
            }
            if let Some(p) = a.get("propriedades") {
                dados["props"] = mapa.props_por_id(&conn, tipo_id, p)?;
            }
            db::atualizar_item(&conn, id, &dados).map_err(e)?;
            Ok(mapa.humano(&db::ler_item(&conn, id).map_err(e)?))
        }
        "editar_trecho" => {
            let id = id_de(&conn, a)?;
            let uma = |v: &Value| -> Option<(String, String, bool)> {
                Some((v.get("de")?.as_str()?.to_string(), v.get("para")?.as_str()?.to_string(), v.get("todas").and_then(|t| t.as_bool()).unwrap_or(false)))
            };
            let trocas: Vec<(String, String, bool)> = match a.get("trocas").and_then(|t| t.as_array()) {
                Some(l) => l.iter().map(|t| uma(t).ok_or("cada troca precisa de de e para")).collect::<Result<_, _>>()?,
                None => uma(a).into_iter().collect(),
            };
            let nota = db::editar_trecho(&conn, id, &trocas, autor).map_err(e)?;
            Ok(json!({ "ok": true, "trocas": trocas.len(), "linha_do_tempo": nota }))
        }
        "em_lote" => {
            let ops = a.get("operacoes").and_then(|o| o.as_array()).ok_or("mande operacoes: [{ferramenta, argumentos}]")?;
            let mut feitos = vec![];
            for (i, op) in ops.iter().enumerate() {
                let f = op.get("ferramenta").and_then(|f| f.as_str()).unwrap_or("");
                if !["criar_documento", "atualizar_documento", "editar_trecho", "anotar", "relacionar"].contains(&f) {
                    return Ok(json!({ "ok": false, "feitas": feitos, "parou_em": i, "erro": format!("ferramenta \"{f}\" não vale em lote") }));
                }
                match chamar(f, op.get("argumentos").unwrap_or(&Value::Null), autor) {
                    Ok(r) => feitos.push(json!({ "ferramenta": f, "resultado": r })),
                    Err(erro) => return Ok(json!({ "ok": false, "feitas": feitos, "parou_em": i, "erro": erro })),
                }
            }
            Ok(json!({ "ok": true, "feitas": feitos }))
        }
        "consultar" => {
            let sql = match (s(a, "sql").filter(|x| !x.trim().is_empty()), s(a, "nome")) {
                (Some(q), _) => q.to_string(),
                (None, Some(n)) => atelier_core::consultas::por_nome(&conn, n).map_err(e)?.ok_or(format!("não há consulta salva com o nome \"{n}\""))?.1,
                _ => return Err("mande sql (ou o nome de uma consulta salva)".into()),
            };
            let mut r = atelier_core::consultas::rodar(&conn, &sql).map_err(e)?;
            if let Some(nome) = s(a, "salvar_como").filter(|n| !n.trim().is_empty()) {
                let id = atelier_core::consultas::por_nome(&conn, nome).map_err(e)?.map(|x| x.0);
                atelier_core::consultas::salvar(&conn, id, nome, &sql).map_err(e)?;
                r["salva_como"] = json!(nome);
            }
            Ok(r)
        }
        "consultas" => Ok(json!(atelier_core::consultas::listar(&conn).map_err(e)?)),
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
            let so_notas = a.get("so_notas").and_then(|v| v.as_bool()) == Some(true);
            let ev = db::linha_do_tempo(&conn, &de, &ate, &filtro).map_err(e)?;
            let eventos: Vec<Value> = ev
                .iter()
                .filter(|x| !so_notas || !db::nota_automatica(&x.texto))
                .map(|x| json!({
                    "quando": x.criado_em, "quem": x.autor, "o_que": x.texto,
                    "item": format!("#{} {}", x.codigo, x.titulo), "tipo": mapa.tipo_nome(x.tipo_id),
                }))
                .collect();
            Ok(json!({ "de": de, "ate": ate, "total": eventos.len(), "eventos": eventos }))
        }
        "tela" => {
            // lista temporária: os mesmos campos de criar_visao, com nomes; vai para o app já com ids, e nada se salva
            let traduzida;
            let a = if let Some(l) = a.get("lista").filter(|v| v.is_object()) {
                let mut d = mapa.dados_visao(l)?;
                let mut x = a.clone();
                x["lista"] = json!({ "titulo": s(l, "nome").or(s(l, "titulo")).unwrap_or("Lista"), "icone": s(l, "icone"), "layout": s(l, "layout"),
                    "filtro": d.get("filtro").cloned().unwrap_or(json!({})), "config": d.get_mut("config").map(|c| c.take()).unwrap_or(json!({})) });
                traduzida = x;
                &traduzida
            } else {
                a
            };
            let r = post_api("/api/tela", a)?;
            if r["ok"] == true {
                // a resposta inteira: o estado da tela, a pasta aberta...
                Ok(r)
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
            for k in ["inverso", "um_so", "lista", "inteiro", "casas", "formato", "hora", "outro_lado", "expressao"] {
                if let Some(v) = a.get(k).filter(|v| !v.is_null()) {
                    config.insert(k.into(), v.clone());
                }
            }
            // relação nova não aparece do outro lado, a não ser que peçam
            if s(a, "especie") == Some("relacao") && !config.contains_key("outro_lado") {
                config.insert("outro_lado".into(), json!(false));
            }
            let config = if s(a, "especie") == Some("lista") {
                db::config_de_lista(&conn, &json!({ "tipos": a.get("lista_tipos"), "relacao": a.get("lista_relacao"), "ordenar": a.get("lista_ordenar") })).map_err(e)?
            } else {
                Value::Object(config)
            };
            let pid = db::criar_propriedade(&conn, &json!({ "nome": s(a, "nome"), "especie": s(a, "especie"), "opcoes": opcoes, "config": config })).map_err(e)?;
            let mut em = vec![];
            for t in a.get("tipos").and_then(|v| v.as_array()).into_iter().flatten().filter_map(|t| t.as_str()) {
                db::tipo_por_propriedade(&conn, mapa.tipo_id(t)?, pid, &json!({})).map_err(e)?;
                em.push(t.to_string());
            }
            Ok(json!({ "ok": true, "id": pid, "nos_tipos": em }))
        }
        "mudar_propriedade" => {
            let p = mapa.prop(s(a, "propriedade").unwrap_or(""))?.clone();
            let pid = p["id"].as_i64().unwrap_or(0);
            let mut d = json!({});
            if let Some(n) = s(a, "novo_nome") {
                d["nome"] = json!(n);
            }
            if let Some(c) = a.get("config").and_then(|v| v.as_object()) {
                let mut cfg = p["config"].as_object().cloned().unwrap_or_default();
                for (k, v) in c {
                    if v.is_null() {
                        cfg.remove(k);
                    } else {
                        cfg.insert(k.clone(), v.clone());
                    }
                }
                d["config"] = Value::Object(cfg);
            }
            db::atualizar_propriedade(&conn, pid, &d).map_err(e)?;
            Ok(json!({ "ok": true }))
        }
        "apagar_propriedade" => {
            let pid = mapa.prop(s(a, "propriedade").unwrap_or(""))?["id"].as_i64().unwrap_or(0);
            let n = db::itens_com_valor(&conn, pid).map_err(e)?;
            if a.get("confirmado").and_then(|v| v.as_bool()) != Some(true) {
                return Ok(json!({ "apagado": false, "itens_com_valor": n,
                    "aviso": format!("{n} documentos têm valor nela e vão perdê-lo. Confirme com o usuário e chame de novo com confirmado: true.") }));
            }
            db::apagar_propriedade(&conn, pid).map_err(e)?;
            Ok(json!({ "apagado": true, "itens_que_perderam_valor": n }))
        }
        "mudar_tipo" => {
            let tid = mapa.tipo_id(s(a, "tipo").unwrap_or(""))?;
            let mut d = json!({});
            if let Some(n) = s(a, "novo_nome") {
                d["nome"] = json!(n);
            }
            if let Some(i) = s(a, "icone") {
                d["icone"] = json!(i);
            }
            db::atualizar_tipo(&conn, tid, &d).map_err(e)?;
            Ok(json!({ "ok": true }))
        }
        "apagar_tipo" => {
            let tid = mapa.tipo_id(s(a, "tipo").unwrap_or(""))?;
            let n: i64 = conn.query_row("SELECT COUNT(*) FROM itens WHERE tipo_id = ? AND apagado_em IS NULL", [tid], |r| r.get(0)).map_err(|x| x.to_string())?;
            if a.get("confirmado").and_then(|v| v.as_bool()) != Some(true) {
                return Ok(json!({ "apagado": false, "itens_do_tipo": n,
                    "aviso": format!("{n} documentos são deste tipo e vão ficar sem tipo. Confirme com o usuário e chame de novo com confirmado: true.") }));
            }
            db::apagar_tipo(&conn, tid).map_err(e)?;
            Ok(json!({ "apagado": true, "itens_sem_tipo_agora": n }))
        }
        "mudar_opcao" => {
            let pid = mapa.prop(s(a, "propriedade").unwrap_or(""))?["id"].as_i64().unwrap_or(0);
            let tid = s(a, "tipo").map(|t| mapa.tipo_id(t)).transpose()?;
            let mut d = json!({});
            for (de, para) in [("novo_nome", "nome"), ("cor", "cor"), ("historico", "historico"), ("apagar", "apagar")] {
                if let Some(v) = a.get(de) {
                    d[para] = v.clone();
                }
            }
            db::mudar_opcao(&conn, tid, pid, s(a, "opcao").unwrap_or(""), &d).map_err(e)?;
            Ok(json!({ "ok": true }))
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
        "visoes" => {
            let vs = db::listar_visoes(&conn).map_err(e)?;
            Ok(json!({ "visoes": vs.iter().map(|v| json!({
                "nome": v.nome, "layout": v.layout, "grupo": v.grupo, "fixa": v.fixa, "filtro": mapa.filtro_humano(&v.filtro),
                "ordenar": v.config.get("ordenar").map(|o| {
                    let nome = match o["prop"].as_str() { Some("titulo") => "Título".into(), Some("tipo") => "Tipo".into(), Some("atualizado") => "Atualizado".into(), _ => mapa.prop_nome(&o["prop"].to_string()) };
                    json!({ "propriedade": nome, "crescente": o["asc"] })
                }),
                "colunas": v.config.get("colunas").and_then(|c| c.as_array()).map(|c| c.iter().map(|id| mapa.prop_nome(&id.to_string())).collect::<Vec<_>>()),
                "larguras": v.config.get("larguras").and_then(|l| l.as_object()).map(|l| l.iter().map(|(k, px)| {
                    let nome = match k.as_str() { "titulo" => "Título".to_string(), "tipo" => "Tipo".to_string(), "atualizado" => "Atualizado".to_string(), id => mapa.prop_nome(id) };
                    (nome, px.clone())
                }).collect::<Map<_, _>>()),
            })).collect::<Vec<_>>() }))
        }
        "checklist" => {
            use atelier_core::checklist as ck;
            use std::path::{Path, PathBuf};
            match s(a, "acao").unwrap_or("") {
                "formato" => Ok(json!({ "formato": ck::FORMATO })),
                "ler" => {
                    if let Some(arq) = s(a, "arquivo") {
                        let p = Path::new(arq);
                        return Ok(ck::resumo(p, p.parent()));
                    }
                    let id = id_de(&conn, a)?;
                    let it = db::ler_item(&conn, id).map_err(e)?;
                    let Some(pasta) = it.pasta.filter(|p| !p.is_empty()) else {
                        return Ok(json!({ "checklists": [], "obs": "o documento não tem pasta" }));
                    };
                    let base = PathBuf::from(&pasta);
                    Ok(json!({ "pasta": pasta, "checklists": ck::achar(&base).iter().map(|p| ck::resumo(p, Some(&base))).collect::<Vec<_>>() }))
                }
                "marcar" => {
                    let arq = s(a, "arquivo").ok_or("informe o arquivo")?;
                    let passo = s(a, "passo").ok_or("informe o passo (id)")?;
                    let feito = a.get("feito").and_then(|v| v.as_bool()).unwrap_or(true);
                    let pulado = a.get("pulado").and_then(|v| v.as_bool()).unwrap_or(false);
                    ck::marcar(Path::new(arq), passo, feito, pulado, s(a, "obs"), autor)
                }
                outra => Err(format!("ação desconhecida: {outra:?} (formato, ler ou marcar)")),
            }
        }
        "espaco_em_disco" => {
            use std::path::PathBuf;
            let legivel = |n: u64| if n >= 1 << 30 { format!("{:.1} GB", n as f64 / (1u64 << 30) as f64) } else { format!("{:.0} MB", n as f64 / (1u64 << 20) as f64) };
            if a.get("id").is_some() {
                let id = id_de(&conn, a)?;
                let (pasta, filhos, n) = db::pastas_da_arvore(&conn, id).map_err(e)?;
                let proprio = pasta.as_ref().map(|p| atelier_core::disco::somar_pastas([PathBuf::from(p)])).unwrap_or(0);
                let todos = atelier_core::disco::somar_pastas(pasta.clone().into_iter().chain(filhos).map(PathBuf::from));
                Ok(json!({ "pasta": pasta, "so_ele": legivel(proprio), "com_os_filhos": legivel(todos), "descendentes": n, "bytes": { "so_ele": proprio, "com_os_filhos": todos } }))
            } else {
                let n = atelier_core::disco::somar_pastas([PathBuf::from(&banc.caminho)]);
                Ok(json!({ "bancada": banc.nome, "pasta": banc.caminho, "ocupa": legivel(n), "bytes": n }))
            }
        }
        "criar_visao" => {
            let mut d = mapa.dados_visao(a)?;
            mesclar_config(&mut d, &json!({}));
            d["nome"] = json!(s(a, "nome").unwrap_or("Nova visão"));
            let id = db::criar_visao(&conn, &d).map_err(e)?;
            let _ = post_api("/api/tela", &json!({ "acao": "recarregar" }));
            Ok(json!({ "ok": true, "id": id }))
        }
        "atualizar_visao" => {
            let id = visao_por_nome(&conn, s(a, "nome").unwrap_or(""))?;
            let mut d = mapa.dados_visao(a)?;
            let antes = db::listar_visoes(&conn).map_err(e)?.into_iter().find(|v| v.id == id).map(|v| v.config).unwrap_or(json!({}));
            mesclar_config(&mut d, &antes);
            if let Some(n) = s(a, "novo_nome") {
                d["nome"] = json!(n);
            }
            db::atualizar_visao(&conn, id, &d).map_err(e)?;
            let _ = post_api("/api/tela", &json!({ "acao": "recarregar" }));
            Ok(json!({ "ok": true }))
        }
        "apagar_visao" => {
            let id = visao_por_nome(&conn, s(a, "nome").unwrap_or(""))?;
            db::apagar_visao(&conn, id).map_err(e)?;
            let _ = post_api("/api/tela", &json!({ "acao": "recarregar" }));
            Ok(json!({ "ok": true }))
        }
        "apagar_documento" => {
            let id = id_de(&conn, a)?;
            db::apagar_item(&conn, id, autor).map_err(e)?;
            let _ = post_api("/api/tela", &json!({ "acao": "recarregar" }));
            Ok(json!({ "ok": true, "na_lixeira": true }))
        }
        "restaurar_documento" => {
            let id = id_de(&conn, a)?;
            db::restaurar_item(&conn, id, autor).map_err(e)?;
            let _ = post_api("/api/tela", &json!({ "acao": "recarregar" }));
            Ok(mapa.humano(&db::ler_item(&conn, id).map_err(e)?))
        }
        outro => Err(format!("ferramenta desconhecida: {outro}. Se o usuário precisa disso, registre com nao_consigo.")),
    }
}

fn visao_por_nome(conn: &Connection, nome: &str) -> Result<i64, String> {
    let vs = db::listar_visoes(conn).map_err(|e| e.to_string())?;
    vs.iter()
        .find(|v| v.nome.to_lowercase() == nome.trim().to_lowercase())
        .map(|v| v.id)
        .ok_or_else(|| format!("visão \"{nome}\" não existe (visões: {})", vs.iter().map(|v| v.nome.as_str()).collect::<Vec<_>>().join(", ")))
}
