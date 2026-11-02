//! Banco do atelier: SQLite num arquivo local, migrations versionadas por `user_version`.
//!
//! Tipos e propriedades são dados (como no Notion). O item guarda os valores das propriedades num JSON
//! `{ "<id da propriedade>": valor }`; trocar o tipo do item não apaga valor nenhum.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::Path;

#[derive(Debug)]
pub enum Erro {
    NaoEncontrado(String),
    Invalido(String),
    Banco(rusqlite::Error),
}

impl From<rusqlite::Error> for Erro {
    fn from(e: rusqlite::Error) -> Self {
        Erro::Banco(e)
    }
}

impl std::fmt::Display for Erro {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Erro::NaoEncontrado(s) => write!(f, "não encontrado: {s}"),
            Erro::Invalido(s) => write!(f, "{s}"),
            Erro::Banco(e) => write!(f, "erro no banco: {e}"),
        }
    }
}

pub type Res<T> = Result<T, Erro>;

pub fn agora() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M:%S%:z").to_string()
}

pub fn abrir(caminho: &Path) -> Res<Connection> {
    if let Some(dir) = caminho.parent() {
        std::fs::create_dir_all(dir).map_err(|e| Erro::Invalido(format!("não criei {dir:?}: {e}")))?;
    }
    let conn = Connection::open(caminho)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;")?;
    let antes: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    migrar(&conn)?;
    // bancada nasce limpa: as sementes das migrations antigas (Task, Dívida, Hoje...) saem de bancada ainda sem itens
    if antes < 12 && conn.query_row("SELECT NOT EXISTS (SELECT 1 FROM itens)", [], |r| r.get::<_, bool>(0))? {
        limpar_sementes(&conn)?;
    }
    Ok(conn)
}

// Cada posição é uma versão. Nunca editar uma migration que já rodou: acrescentar outra.
const MIGRACOES: &[&str] = &[
    // 1 — estrutura
    r#"
    CREATE TABLE tipos (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
        icone TEXT NOT NULL DEFAULT '📄',
        cor TEXT,
        ordem INTEGER NOT NULL DEFAULT 0,
        criado_em TEXT NOT NULL
    );
    CREATE TABLE propriedades (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL UNIQUE COLLATE NOCASE,
        especie TEXT NOT NULL,
        opcoes TEXT NOT NULL DEFAULT '[]',
        criado_em TEXT NOT NULL
    );
    CREATE TABLE tipo_propriedades (
        tipo_id INTEGER NOT NULL REFERENCES tipos(id) ON DELETE CASCADE,
        propriedade_id INTEGER NOT NULL REFERENCES propriedades(id) ON DELETE CASCADE,
        ordem INTEGER NOT NULL DEFAULT 0,
        opcoes TEXT,
        PRIMARY KEY (tipo_id, propriedade_id)
    );
    CREATE TABLE itens (
        id INTEGER PRIMARY KEY,
        titulo TEXT NOT NULL DEFAULT '',
        tipo_id INTEGER REFERENCES tipos(id) ON DELETE SET NULL,
        corpo TEXT NOT NULL DEFAULT '',
        pasta TEXT,
        props TEXT NOT NULL DEFAULT '{}',
        criado_em TEXT NOT NULL,
        atualizado_em TEXT NOT NULL
    );
    CREATE INDEX itens_tipo ON itens(tipo_id);
    CREATE TABLE notas (
        id INTEGER PRIMARY KEY,
        item_id INTEGER NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
        texto TEXT NOT NULL,
        autor TEXT NOT NULL,
        criado_em TEXT NOT NULL
    );
    CREATE INDEX notas_item ON notas(item_id);
    -- modelos (templates): um tipo pode ter vários; o item nasce com o título, o corpo e as propriedades do modelo
    CREATE TABLE modelos (
        id INTEGER PRIMARY KEY,
        tipo_id INTEGER NOT NULL REFERENCES tipos(id) ON DELETE CASCADE,
        nome TEXT NOT NULL,
        titulo TEXT NOT NULL DEFAULT '',
        corpo TEXT NOT NULL DEFAULT '',
        props TEXT NOT NULL DEFAULT '{}',
        padrao INTEGER NOT NULL DEFAULT 0,
        criado_em TEXT NOT NULL
    );
    "#,
    // 2 — sementes (ponto de partida; tudo editável pela tela)
    r#"
    INSERT INTO propriedades (id, nome, especie, opcoes, criado_em) VALUES
      (1, 'Status', 'status', '[]', datetime('now')),
      (2, 'Prioridade', 'selecao', '[{"nome":"Alta","cor":"red"},{"nome":"Média","cor":"yellow"},{"nome":"Baixa","cor":"gray"}]', datetime('now')),
      (3, 'Prazo', 'data', '[]', datetime('now')),
      (4, 'Espaço', 'selecao', '[{"nome":"Trabalho","cor":"blue"},{"nome":"Fábrica","cor":"orange"},{"nome":"Pessoal","cor":"green"}]', datetime('now')),
      (5, 'Tags', 'multisselecao', '[]', datetime('now')),
      (6, 'Frente', 'selecao', '[]', datetime('now'));

    INSERT INTO tipos (id, nome, icone, ordem, criado_em) VALUES
      (1, 'Task', '✅', 1, datetime('now')),
      (2, 'Dívida', '🧾', 2, datetime('now')),
      (3, 'Pendência', '⏳', 3, datetime('now')),
      (4, 'Desejo', '✨', 4, datetime('now')),
      (5, 'Nota', '📝', 5, datetime('now'));

    INSERT INTO tipo_propriedades (tipo_id, propriedade_id, ordem, opcoes) VALUES
      (1, 1, 1, '[{"nome":"A fazer","cor":"gray"},{"nome":"Em andamento","cor":"blue"},{"nome":"Feita","cor":"green","historico":true},{"nome":"Cancelada","cor":"red","historico":true}]'),
      (1, 2, 2, NULL), (1, 3, 3, NULL), (1, 4, 4, NULL), (1, 6, 5, NULL), (1, 5, 6, NULL),
      (2, 1, 1, '[{"nome":"A FAZER","cor":"gray"},{"nome":"EM ANDAMENTO","cor":"blue"},{"nome":"A VALIDAR","cor":"purple"},{"nome":"ADIADA","cor":"yellow"},{"nome":"FEITA","cor":"green","historico":true},{"nome":"DESCARTADA","cor":"red","historico":true},{"nome":"ABSORVIDA","cor":"brown","historico":true},{"nome":"ACEITA","cor":"orange","historico":true}]'),
      (2, 6, 2, NULL), (2, 2, 3, NULL), (2, 4, 4, NULL), (2, 5, 5, NULL),
      (3, 1, 1, '[{"nome":"Aberta","cor":"blue"},{"nome":"Aguardando terceiro","cor":"yellow"},{"nome":"Resolvida","cor":"green","historico":true}]'),
      (3, 3, 2, NULL), (3, 4, 3, NULL), (3, 5, 4, NULL),
      (4, 1, 1, '[{"nome":"Ideia","cor":"purple"},{"nome":"Virou demanda","cor":"green","historico":true},{"nome":"Descartado","cor":"red","historico":true}]'),
      (4, 4, 2, NULL), (4, 5, 3, NULL),
      (5, 4, 1, NULL), (5, 5, 2, NULL);

    INSERT INTO modelos (tipo_id, nome, corpo, props, padrao, criado_em) VALUES
      (1, 'Task', '## Contexto

## O que fazer

- [ ] Primeiro passo

## Referências
', '{"1":"A fazer","2":"Média"}', 1, datetime('now')),
      (2, 'Dívida', '## Problema

## Impacto

## Proposta
', '{"1":"A FAZER"}', 1, datetime('now')),
      (3, 'Pendência', '## O que falta

## Com quem
', '{"1":"Aberta"}', 1, datetime('now')),
      (4, 'Desejo', '', '{"1":"Ideia"}', 1, datetime('now'));
    "#,
    // 3 — código visível do item: 7 hexadecimais aleatórios, tamanho fixo (o id numérico fica só para o banco)
    r#"
    ALTER TABLE itens ADD COLUMN codigo TEXT;
    UPDATE itens SET codigo = substr(lower(hex(randomblob(4))), 1, 7) WHERE codigo IS NULL;
    CREATE UNIQUE INDEX itens_codigo ON itens(codigo);
    "#,
    // 4 — visões: o menu lateral. Cada uma é filtro + período + jeito de mostrar (tabela, lista, kanban, linha).
    //     filtro: { tipos: [id], sem_tipo, props: { "<id>": [valores] }, texto, historico, periodo }
    //     config: { agrupar_por: <id da propriedade>, colunas: [ids] }
    r#"
    CREATE TABLE visoes (
        id INTEGER PRIMARY KEY,
        nome TEXT NOT NULL,
        icone TEXT NOT NULL DEFAULT '◇',
        ordem INTEGER NOT NULL DEFAULT 0,
        layout TEXT NOT NULL DEFAULT 'tabela',
        filtro TEXT NOT NULL DEFAULT '{}',
        config TEXT NOT NULL DEFAULT '{}',
        criado_em TEXT NOT NULL
    );
    INSERT INTO visoes (nome, icone, ordem, layout, filtro, criado_em) VALUES
      ('Hoje', '☀️', 1, 'linha', '{"periodo":"hoje","historico":true}', datetime('now')),
      ('Caixa de entrada', '📥', 2, 'lista', '{"sem_tipo":true}', datetime('now')),
      ('Todos os itens', '🗂️', 3, 'tabela', '{}', datetime('now'));
    INSERT INTO visoes (nome, icone, ordem, layout, filtro, config, criado_em)
      SELECT 'Quadro de ' || lower(nome) || 's', '🧱', 4, 'kanban', json_object('tipos', json_array(id)),
             json_object('agrupar_por', 1), datetime('now')
      FROM tipos WHERE id = 1;
    INSERT INTO visoes (nome, icone, ordem, layout, filtro, criado_em)
      SELECT nome, icone, 10 + ordem, 'tabela', json_object('tipos', json_array(id)), datetime('now') FROM tipos;
    "#,
    // 5 — nota editada guarda a hora da edição
    r#"
    ALTER TABLE notas ADD COLUMN editado_em TEXT;
    "#,
    // 6 — lixeira (apagar é lógico) e versões anteriores de textos (corpo do item, nota)
    r#"
    ALTER TABLE itens ADD COLUMN apagado_em TEXT;
    ALTER TABLE notas ADD COLUMN apagado_em TEXT;
    CREATE TABLE versoes (
        id INTEGER PRIMARY KEY,
        alvo TEXT NOT NULL,
        alvo_id INTEGER NOT NULL,
        conteudo TEXT NOT NULL,
        autor TEXT NOT NULL,
        criado_em TEXT NOT NULL
    );
    CREATE INDEX versoes_alvo ON versoes(alvo, alvo_id);
    "#,
    // 7 — relações entre itens. tipo: pai (de é filho de para) · relacionado · bloqueia (de bloqueia para)
    //     · absorvido (de foi absorvido por para)
    r#"
    CREATE TABLE relacoes (
        id INTEGER PRIMARY KEY,
        de_id INTEGER NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
        para_id INTEGER NOT NULL REFERENCES itens(id) ON DELETE CASCADE,
        tipo TEXT NOT NULL,
        criado_em TEXT NOT NULL,
        UNIQUE (de_id, para_id, tipo)
    );
    CREATE INDEX relacoes_para ON relacoes(para_id);
    "#,
    // 8 — visão "Vence em breve" onde existe a propriedade Prazo semente (vencidos + próximos 7 dias, por prazo)
    r#"
    INSERT INTO visoes (nome, icone, ordem, layout, filtro, config, criado_em)
      SELECT 'Vence em breve', '⏰', 5, 'lista',
             json_object('datas', json_object(CAST(id AS TEXT), json_object('modo', 'proximos', 'dias', 7, 'com_vencidos', json('true')))),
             json_object('ordenar', json_object('prop', id, 'asc', json('true'))), datetime('now')
      FROM propriedades WHERE nome = 'Prazo' AND especie = 'data' LIMIT 1;
    "#,
    // 9 — visões podem ficar em grupos no menu
    r#"
    ALTER TABLE visoes ADD COLUMN grupo TEXT;
    "#,
    // 10 — relações deixam de ser fixas: viram propriedades da espécie "relacao" (valor = lista de códigos), com
    //      config { inverso, um_so }. As relações gravadas na tabela antiga viram valores dessas propriedades.
    r#"
    ALTER TABLE propriedades ADD COLUMN config TEXT NOT NULL DEFAULT '{}';
    INSERT OR IGNORE INTO propriedades (nome, especie, opcoes, config, criado_em)
      SELECT 'Pai', 'relacao', '[]', '{"inverso":"Filhos","um_so":true}', datetime('now') WHERE EXISTS (SELECT 1 FROM relacoes WHERE tipo = 'pai');
    UPDATE itens SET props = json_set(props,
        '$."' || (SELECT id FROM propriedades WHERE nome = 'Pai' AND especie = 'relacao') || '"',
        json((SELECT json_group_array(o.codigo) FROM relacoes r JOIN itens o ON o.id = r.para_id WHERE r.de_id = itens.id AND r.tipo = 'pai')))
      WHERE EXISTS (SELECT 1 FROM relacoes r WHERE r.de_id = itens.id AND r.tipo = 'pai')
        AND EXISTS (SELECT 1 FROM propriedades WHERE nome = 'Pai' AND especie = 'relacao');
    INSERT OR IGNORE INTO tipo_propriedades (tipo_id, propriedade_id, ordem)
      SELECT DISTINCT i.tipo_id, p.id, 90 FROM relacoes r JOIN itens i ON i.id = r.de_id
        JOIN propriedades p ON p.nome = 'Pai' AND p.especie = 'relacao'
      WHERE r.tipo = 'pai' AND i.tipo_id IS NOT NULL;
    INSERT OR IGNORE INTO propriedades (nome, especie, opcoes, config, criado_em)
      SELECT 'Bloqueia', 'relacao', '[]', '{"inverso":"Bloqueado por"}', datetime('now') WHERE EXISTS (SELECT 1 FROM relacoes WHERE tipo = 'bloqueia');
    UPDATE itens SET props = json_set(props,
        '$."' || (SELECT id FROM propriedades WHERE nome = 'Bloqueia' AND especie = 'relacao') || '"',
        json((SELECT json_group_array(o.codigo) FROM relacoes r JOIN itens o ON o.id = r.para_id WHERE r.de_id = itens.id AND r.tipo = 'bloqueia')))
      WHERE EXISTS (SELECT 1 FROM relacoes r WHERE r.de_id = itens.id AND r.tipo = 'bloqueia')
        AND EXISTS (SELECT 1 FROM propriedades WHERE nome = 'Bloqueia' AND especie = 'relacao');
    INSERT OR IGNORE INTO tipo_propriedades (tipo_id, propriedade_id, ordem)
      SELECT DISTINCT i.tipo_id, p.id, 90 FROM relacoes r JOIN itens i ON i.id = r.de_id
        JOIN propriedades p ON p.nome = 'Bloqueia' AND p.especie = 'relacao'
      WHERE r.tipo = 'bloqueia' AND i.tipo_id IS NOT NULL;
    INSERT OR IGNORE INTO propriedades (nome, especie, opcoes, config, criado_em)
      SELECT 'Relacionado a', 'relacao', '[]', '{"inverso":"Relacionado a"}', datetime('now') WHERE EXISTS (SELECT 1 FROM relacoes WHERE tipo = 'relacionado');
    UPDATE itens SET props = json_set(props,
        '$."' || (SELECT id FROM propriedades WHERE nome = 'Relacionado a' AND especie = 'relacao') || '"',
        json((SELECT json_group_array(o.codigo) FROM relacoes r JOIN itens o ON o.id = r.para_id WHERE r.de_id = itens.id AND r.tipo = 'relacionado')))
      WHERE EXISTS (SELECT 1 FROM relacoes r WHERE r.de_id = itens.id AND r.tipo = 'relacionado')
        AND EXISTS (SELECT 1 FROM propriedades WHERE nome = 'Relacionado a' AND especie = 'relacao');
    INSERT OR IGNORE INTO tipo_propriedades (tipo_id, propriedade_id, ordem)
      SELECT DISTINCT i.tipo_id, p.id, 90 FROM relacoes r JOIN itens i ON i.id = r.de_id
        JOIN propriedades p ON p.nome = 'Relacionado a' AND p.especie = 'relacao'
      WHERE r.tipo = 'relacionado' AND i.tipo_id IS NOT NULL;
    INSERT OR IGNORE INTO propriedades (nome, especie, opcoes, config, criado_em)
      SELECT 'Absorvido por', 'relacao', '[]', '{"inverso":"Absorve","um_so":true}', datetime('now') WHERE EXISTS (SELECT 1 FROM relacoes WHERE tipo = 'absorvido');
    UPDATE itens SET props = json_set(props,
        '$."' || (SELECT id FROM propriedades WHERE nome = 'Absorvido por' AND especie = 'relacao') || '"',
        json((SELECT json_group_array(o.codigo) FROM relacoes r JOIN itens o ON o.id = r.para_id WHERE r.de_id = itens.id AND r.tipo = 'absorvido')))
      WHERE EXISTS (SELECT 1 FROM relacoes r WHERE r.de_id = itens.id AND r.tipo = 'absorvido')
        AND EXISTS (SELECT 1 FROM propriedades WHERE nome = 'Absorvido por' AND especie = 'relacao');
    INSERT OR IGNORE INTO tipo_propriedades (tipo_id, propriedade_id, ordem)
      SELECT DISTINCT i.tipo_id, p.id, 90 FROM relacoes r JOIN itens i ON i.id = r.de_id
        JOIN propriedades p ON p.nome = 'Absorvido por' AND p.especie = 'relacao'
      WHERE r.tipo = 'absorvido' AND i.tipo_id IS NOT NULL;
    DROP TABLE relacoes;
    "#,
    // 11 — busca de texto (FTS5, sem diferenciar acento): título + corpo de cada item e cada nota. Gatilhos mantêm
    //      o índice em dia. origem: 'i' (item, ref = id do item) ou 'n' (nota, ref = id da nota).
    r#"
    CREATE VIRTUAL TABLE busca USING fts5(item_id UNINDEXED, ref UNINDEXED, origem UNINDEXED, texto, tokenize = 'unicode61 remove_diacritics 2');
    INSERT INTO busca (item_id, ref, origem, texto) SELECT id, id, 'i', titulo || char(10) || corpo FROM itens;
    INSERT INTO busca (item_id, ref, origem, texto) SELECT item_id, id, 'n', texto FROM notas;
    CREATE TRIGGER busca_item_novo AFTER INSERT ON itens BEGIN
      INSERT INTO busca (item_id, ref, origem, texto) VALUES (new.id, new.id, 'i', new.titulo || char(10) || new.corpo);
    END;
    CREATE TRIGGER busca_item_muda AFTER UPDATE OF titulo, corpo ON itens BEGIN
      DELETE FROM busca WHERE origem = 'i' AND ref = old.id;
      INSERT INTO busca (item_id, ref, origem, texto) VALUES (new.id, new.id, 'i', new.titulo || char(10) || new.corpo);
    END;
    CREATE TRIGGER busca_item_sai AFTER DELETE ON itens BEGIN
      DELETE FROM busca WHERE item_id = old.id;
    END;
    CREATE TRIGGER busca_nota_nova AFTER INSERT ON notas BEGIN
      INSERT INTO busca (item_id, ref, origem, texto) VALUES (new.item_id, new.id, 'n', new.texto);
    END;
    CREATE TRIGGER busca_nota_muda AFTER UPDATE OF texto ON notas BEGIN
      DELETE FROM busca WHERE origem = 'n' AND ref = old.id;
      INSERT INTO busca (item_id, ref, origem, texto) VALUES (new.item_id, new.id, 'n', new.texto);
    END;
    CREATE TRIGGER busca_nota_sai AFTER DELETE ON notas BEGIN
      DELETE FROM busca WHERE origem = 'n' AND ref = old.id;
    END;
    "#,
    // 12 — "Todos os itens" é a visão fixa de toda bancada: não sai e não filtra (mostra até o histórico; muda só o
    //      jeito de mostrar)
    r#"
    ALTER TABLE visoes ADD COLUMN fixa INTEGER NOT NULL DEFAULT 0;
    UPDATE visoes SET fixa = 1, filtro = '{"historico":true}'
      WHERE id = (SELECT id FROM visoes WHERE nome = 'Todos os itens' ORDER BY id LIMIT 1);
    INSERT INTO visoes (nome, icone, ordem, layout, filtro, fixa, criado_em)
      SELECT 'Todos os itens', '🗂️', 0, 'tabela', '{"historico":true}', 1, datetime('now') WHERE NOT EXISTS (SELECT 1 FROM visoes WHERE fixa = 1);
    "#,
    // 13 — o item vira "documento" no que o usuário lê (0.2.1): a visão fixa muda de nome se ainda tem o de origem
    //      (as tabelas e o código continuam dizendo item)
    r#"
    UPDATE visoes SET nome = 'Todos os documentos' WHERE fixa = 1 AND nome = 'Todos os itens';
    "#,
    // 14 — ligações com índice: quem aponta para quem, por propriedade de relação. As relações moram em JSON dentro de
    //      `itens.props`; achar "quem aponta para este" varria o banco inteiro (50 ms com 20 mil documentos). Esta
    //      tabela é mantida pelo próprio banco (gatilhos) e só serve de índice: o valor de verdade continua no JSON.
    r#"
    CREATE TABLE ligacoes (item_id INTEGER NOT NULL, prop_id INTEGER NOT NULL, alvo TEXT NOT NULL);
    CREATE INDEX ligacoes_alvo ON ligacoes (alvo, prop_id);
    CREATE INDEX ligacoes_item ON ligacoes (item_id);
    CREATE TRIGGER ligacoes_ao_criar AFTER INSERT ON itens BEGIN
      INSERT INTO ligacoes (item_id, prop_id, alvo)
      SELECT NEW.id, CAST(j.key AS INTEGER), lower(x.value) FROM json_each(NEW.props) j, json_each(j.value) x
      WHERE j.type = 'array' AND CAST(j.key AS INTEGER) IN (SELECT id FROM propriedades WHERE especie = 'relacao');
    END;
    CREATE TRIGGER ligacoes_ao_mudar AFTER UPDATE OF props ON itens BEGIN
      DELETE FROM ligacoes WHERE item_id = NEW.id;
      INSERT INTO ligacoes (item_id, prop_id, alvo)
      SELECT NEW.id, CAST(j.key AS INTEGER), lower(x.value) FROM json_each(NEW.props) j, json_each(j.value) x
      WHERE j.type = 'array' AND CAST(j.key AS INTEGER) IN (SELECT id FROM propriedades WHERE especie = 'relacao');
    END;
    CREATE TRIGGER ligacoes_ao_apagar AFTER DELETE ON itens BEGIN
      DELETE FROM ligacoes WHERE item_id = OLD.id;
    END;
    INSERT INTO ligacoes (item_id, prop_id, alvo)
    SELECT i.id, CAST(j.key AS INTEGER), lower(x.value) FROM itens i, json_each(i.props) j, json_each(j.value) x
    WHERE j.type = 'array' AND CAST(j.key AS INTEGER) IN (SELECT id FROM propriedades WHERE especie = 'relacao');
    "#,
    // 15 — menções com índice: quem cita `#código` no texto ou numa nota. Achar isso varria o texto de todos (40 ms
    //      com 20 mil documentos). Quem grava texto ou nota chama `indexar_mencoes`; a migração preenche em seguida.
    r#"
    CREATE TABLE mencoes (item_id INTEGER NOT NULL, codigo TEXT NOT NULL);
    CREATE INDEX mencoes_codigo ON mencoes (codigo);
    CREATE INDEX mencoes_item ON mencoes (item_id);
    "#,
    // 16 — consultas salvas (SQL só de leitura sobre a bancada; ver consultas.rs)
    r#"
    CREATE TABLE consultas (id INTEGER PRIMARY KEY, nome TEXT NOT NULL UNIQUE, sql TEXT NOT NULL, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL);
    "#,
];

// ---------- relações ----------
//
// O atelier não conhece "pai", "filho" nem "bloqueio": relação é uma espécie de propriedade como outra qualquer,
// criada por quem usa. O valor no item é a lista de códigos dos itens apontados (`["a3f9c21", ...]`). A config da
// propriedade (`{"inverso": "Bloqueado por", "um_so": true}`) diz como se lê do outro lado e se aceita um item só.

fn resumo_item(conn: &Connection, id: i64) -> Res<(String, String)> {
    conn.query_row("SELECT COALESCE(codigo, ''), titulo FROM itens WHERE id = ?", [id], |r| Ok((r.get(0)?, r.get(1)?)))
        .optional()?
        .ok_or(Erro::NaoEncontrado(format!("documento {id}")))
}

/// Nome, espécie e config de uma propriedade.
fn prop_info(conn: &Connection, pid: i64) -> Res<(String, String, Value)> {
    conn.query_row("SELECT nome, especie, config FROM propriedades WHERE id = ?", [pid], |r| {
        Ok((r.get(0)?, r.get(1)?, json_col(r.get(2)?)))
    })
    .optional()?
    .ok_or(Erro::NaoEncontrado(format!("propriedade {pid}")))
}

/// Aceita o id (`12`) ou o nome (`"Bloqueado por"`, sem diferenciar maiúsculas) da propriedade.
pub fn prop_por_nome_ou_id(conn: &Connection, v: &Value) -> Res<i64> {
    if let Some(id) = v.as_i64().or_else(|| v.as_str().and_then(|s| s.trim().parse().ok())) {
        existe(conn, "propriedades", id)?;
        return Ok(id);
    }
    let nome = v.as_str().unwrap_or("").trim();
    conn.query_row("SELECT id FROM propriedades WHERE nome = ? COLLATE NOCASE", [nome], |r| r.get(0))
        .optional()?
        .ok_or(Erro::NaoEncontrado(format!("propriedade \"{nome}\"")))
}

/// Códigos guardados num valor de relação (tolera valor antigo em texto solto).
pub fn codigos_de(v: &Value) -> Vec<String> {
    match v {
        Value::Array(l) => l.iter().filter_map(|x| x.as_str().map(String::from)).collect(),
        Value::String(s) if !s.is_empty() => vec![s.clone()],
        _ => vec![],
    }
}

/// Normaliza o que veio para uma propriedade de relação: aceita código (com ou sem #), id numérico ou lista deles;
/// confere que cada item existe e não é o próprio. `um_so` fica com o último. Lista vazia vira `null`.
fn normalizar_relacao(conn: &Connection, proprio: Option<&str>, v: &Value, um_so: bool) -> Res<Value> {
    let brutos: Vec<Value> = match v {
        Value::Null => vec![],
        Value::Array(l) => l.clone(),
        outro => vec![outro.clone()],
    };
    let mut cods: Vec<String> = vec![];
    for b in brutos {
        let id = match &b {
            Value::Number(n) => n.as_i64().ok_or(Erro::Invalido("documento inválido na relação".into()))?,
            Value::String(s) if s.trim().is_empty() => continue,
            Value::String(s) => id_por_codigo(conn, s)?,
            _ => return Err(Erro::Invalido("relação aceita códigos de documento (#a3f9c21)".into())),
        };
        let (cod, _) = resumo_item(conn, id)?;
        if Some(cod.as_str()) == proprio {
            return Err(Erro::Invalido("um documento não se relaciona com ele mesmo".into()));
        }
        if !cods.contains(&cod) {
            cods.push(cod);
        }
    }
    if um_so && cods.len() > 1 {
        cods = vec![cods.pop().unwrap_or_default()];
    }
    Ok(if cods.is_empty() { Value::Null } else { json!(cods) })
}

/// Links: lista de `{ "url": "...", "rotulo": "..." }` (aceita também só a URL em texto). Lista vazia vira `null`.
fn normalizar_links(v: &Value) -> Res<Value> {
    let brutos = match v {
        Value::Null => vec![],
        Value::Array(l) => l.clone(),
        outro => vec![outro.clone()],
    };
    let mut l = vec![];
    for b in brutos {
        let (url, rotulo) = match &b {
            Value::String(s) => (s.trim().to_string(), None),
            Value::Object(o) => (
                o.get("url").and_then(|x| x.as_str()).unwrap_or("").trim().to_string(),
                o.get("rotulo").and_then(|x| x.as_str()).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
            ),
            _ => return Err(Erro::Invalido("link: use a URL em texto ou { url, rotulo }".into())),
        };
        if url.is_empty() {
            continue;
        }
        l.push(match rotulo {
            Some(r) => json!({ "url": url, "rotulo": r }),
            None => json!({ "url": url }),
        });
    }
    Ok(if l.is_empty() { Value::Null } else { Value::Array(l) })
}

/// "#a3f9c21 Título, #b... Outro" para a linha do tempo.
fn codigos_legiveis(conn: &Connection, cods: &[String]) -> String {
    if cods.is_empty() {
        return "—".into();
    }
    cods.iter()
        .map(|c| {
            let t: String = conn.query_row("SELECT titulo FROM itens WHERE codigo = ?", [c], |r| r.get(0)).unwrap_or_default();
            format!("#{c} {t}").trim_end().to_string()
        })
        .collect::<Vec<_>>()
        .join(", ")
}

/// Como a relação se lê do lado de quem é apontado.
fn rotulo_inverso(nome: &str, config: &Value) -> String {
    config.get("inverso").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).map(String::from)
        .unwrap_or(format!("{nome} (de)"))
}

/// Liga ou desliga um item numa propriedade de relação (atalho do MCP e da API: mexe na lista sem reenviar tudo).
pub fn ligar(conn: &Connection, de: i64, prop: i64, para: i64, desligar: bool, autor: &str) -> Res<()> {
    let (_, especie, _) = prop_info(conn, prop)?;
    if especie != "relacao" {
        return Err(Erro::Invalido("essa propriedade não é de relação".into()));
    }
    let atual: Value = conn
        .query_row(&format!("SELECT json_extract(props, '$.\"{prop}\"') FROM itens WHERE id = ?"), [de], |r| r.get::<_, Option<String>>(0))
        .optional()?
        .ok_or(Erro::NaoEncontrado(format!("documento {de}")))?
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(Value::Null);
    let mut cods = codigos_de(&atual);
    let (cod_para, _) = resumo_item(conn, para)?;
    if desligar {
        cods.retain(|c| *c != cod_para);
    } else if !cods.contains(&cod_para) {
        cods.push(cod_para);
    }
    atualizar_item(conn, de, &json!({ "props": { prop.to_string(): cods }, "autor": autor }))
}

/// Resumo dos itens com estes códigos (para mostrar as relações sem carregar cada item).
pub fn resumos(conn: &Connection, cods: &[String]) -> Res<Vec<Value>> {
    let mut st = conn.prepare("SELECT id, codigo, titulo, tipo_id, apagado_em IS NOT NULL FROM itens WHERE codigo = ?")?;
    let mut v = vec![];
    for c in cods {
        let c = c.trim().trim_start_matches('#').to_lowercase();
        if let Some(x) = st
            .query_row([&c], |r| {
                Ok(json!({ "id": r.get::<_, i64>(0)?, "codigo": r.get::<_, String>(1)?, "titulo": r.get::<_, String>(2)?,
                           "tipo_id": r.get::<_, Option<i64>>(3)?, "na_lixeira": r.get::<_, bool>(4)? }))
            })
            .optional()?
        {
            v.push(x);
        }
    }
    Ok(v)
}

/// Os itens um nível abaixo na árvore de uma visão. `sentido` "aponta": os itens que este aponta na propriedade
/// (ex.: "Bloqueado por" → quem bloqueia); "apontado": os itens que apontam para este nela (ex.: "Pai" → os filhos).
/// As pastas de um item e dos descendentes dele (pelas relações de pai: as de um item só, como Pai → Filhos),
/// descendo a árvore inteira. Devolve (pasta do item, pastas dos descendentes, quantos descendentes).
pub fn pastas_da_arvore(conn: &Connection, id: i64) -> Res<(Option<String>, Vec<String>, usize)> {
    let pasta: Option<String> = conn.query_row("SELECT pasta FROM itens WHERE id = ?", [id], |r| r.get(0))?;
    let pais: Vec<i64> = conn
        .prepare("SELECT id FROM propriedades WHERE especie = 'relacao' AND json_extract(config, '$.um_so') = 1")?
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let mut vistos = std::collections::HashSet::from([id]);
    let mut fila = vec![resumo_item(conn, id)?.0];
    let mut pastas = vec![];
    while let Some(cod) = fila.pop() {
        for p in &pais {
            let mut st = conn.prepare(&format!(
                "SELECT id, codigo, pasta FROM itens WHERE apagado_em IS NULL AND EXISTS \
                 (SELECT 1 FROM json_each(itens.props, '$.\"{p}\"') WHERE value = ?1)"
            ))?;
            let filhos = st
                .query_map([&cod], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, Option<String>>(2)?)))?
                .collect::<Result<Vec<_>, _>>()?;
            for (fid, fcod, fpasta) in filhos {
                if vistos.insert(fid) {
                    pastas.extend(fpasta);
                    fila.push(fcod);
                }
            }
        }
    }
    Ok((pasta, pastas, vistos.len() - 1))
}

pub fn ramo(conn: &Connection, id: i64, prop: i64, sentido: &str) -> Res<Vec<Item>> {
    let (cod, _) = resumo_item(conn, id)?;
    let sql = if sentido == "apontado" {
        format!(
            "SELECT * FROM itens WHERE apagado_em IS NULL AND id <> ?1 AND EXISTS \
             (SELECT 1 FROM json_each(itens.props, '$.\"{prop}\"') WHERE value = ?2) ORDER BY atualizado_em DESC, id DESC"
        )
    } else {
        format!(
            "SELECT * FROM itens WHERE apagado_em IS NULL AND id <> ?1 AND codigo IN \
             (SELECT value FROM json_each((SELECT props FROM itens WHERE id = ?1), '$.\"{prop}\"')) AND codigo <> ?2 ORDER BY atualizado_em DESC, id DESC"
        )
    };
    let mut st = conn.prepare(&sql)?;
    let v = st.query_map(params![id, cod], item_da_linha)?.collect::<Result<_, _>>()?;
    Ok(v)
}

/// Quem aponta para este item em alguma propriedade de relação (lido do lado dele, pelo rótulo inverso), e os itens
/// que o mencionam (`#código` no texto ou numa nota).
pub fn referencias_do_item(conn: &Connection, id: i64) -> Res<(Value, Value)> {
    let codigo: String = conn.query_row("SELECT COALESCE(codigo, '') FROM itens WHERE id = ?", [id], |r| r.get(0))?;
    let mut st = conn.prepare(
        "SELECT DISTINCT o.id, COALESCE(o.codigo, ''), o.titulo, o.tipo_id, p.id, p.nome, p.config, o.props, o.atualizado_em \
         FROM ligacoes l JOIN itens o ON o.id = l.item_id JOIN propriedades p ON p.id = l.prop_id AND p.especie = 'relacao' \
         WHERE l.alvo = lower(?2) AND o.apagado_em IS NULL AND o.id <> ?1 \
         ORDER BY p.nome, o.atualizado_em DESC",
    )?;
    let refs: Vec<Value> = st
        .query_map(params![id, codigo], |r| {
            let nome: String = r.get(5)?;
            let config = json_col(r.get(6)?);
            Ok(json!({
                "prop_id": r.get::<_, i64>(4)?, "rotulo": rotulo_inverso(&nome, &config),
                "outro_lado": config.get("outro_lado").and_then(|v| v.as_bool()).unwrap_or(true),
                "item": { "id": r.get::<_, i64>(0)?, "codigo": r.get::<_, String>(1)?, "titulo": r.get::<_, String>(2)?,
                          "tipo_id": r.get::<_, Option<i64>>(3)?, "props": json_col(r.get(7)?) },
            }))
        })?
        .collect::<Result<_, _>>()?;
    let mut men = vec![];
    if !codigo.is_empty() {
        let padrao = codigo.to_lowercase();
        let mut st = conn.prepare(
            "SELECT DISTINCT i.id, i.codigo, i.titulo, i.tipo_id, i.atualizado_em FROM mencoes m JOIN itens i ON i.id = m.item_id \
             WHERE m.codigo = ?2 AND i.id <> ?1 AND i.apagado_em IS NULL ORDER BY i.atualizado_em DESC LIMIT 50",
        )?;
        men = st
            .query_map(params![id, padrao], |r| {
                Ok(json!({ "id": r.get::<_, i64>(0)?, "codigo": r.get::<_, String>(1)?, "titulo": r.get::<_, String>(2)?, "tipo_id": r.get::<_, Option<i64>>(3)? }))
            })?
            .collect::<Result<_, _>>()?;
    }
    Ok((Value::Array(refs), Value::Array(men)))
}

pub const LAYOUTS: &[&str] = &["tabela", "lista", "kanban", "linha"];

/// Bancada limpa: tira o que as migrations semeiam (tipos Task, Dívida..., modelos, propriedades e visões). Ficam a
/// propriedade Status (base de todo tipo novo) e a visão fixa Todos os itens. Só roda em bancada sem itens.
pub fn limpar_sementes(conn: &Connection) -> Res<()> {
    let itens: i64 = conn.query_row("SELECT COUNT(*) FROM itens", [], |r| r.get(0))?;
    if itens > 0 {
        return Err(Erro::Invalido("a bancada já tem documentos; os tipos não foram tirados".into()));
    }
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM visoes WHERE fixa = 0", [])?;
    tx.execute("DELETE FROM tipos", [])?;
    tx.execute("DELETE FROM propriedades WHERE especie <> 'status'", [])?;
    tx.execute("UPDATE propriedades SET opcoes = '[]'", [])?;
    tx.commit()?;
    Ok(())
}

#[derive(Serialize)]
pub struct Visao {
    pub id: i64,
    pub nome: String,
    /// grupo no menu lateral (None = solta no topo)
    pub grupo: Option<String>,
    pub icone: String,
    pub ordem: i64,
    pub layout: String,
    pub filtro: Value,
    pub config: Value,
    /// a visão Todos os itens: não se apaga nem se filtra
    pub fixa: bool,
}

pub fn listar_visoes(conn: &Connection) -> Res<Vec<Visao>> {
    let mut st = conn.prepare("SELECT id, nome, icone, ordem, layout, filtro, config, grupo, fixa FROM visoes ORDER BY fixa DESC, ordem, id")?;
    let v = st
        .query_map([], |r| {
            Ok(Visao {
                id: r.get(0)?, nome: r.get(1)?, icone: r.get(2)?, ordem: r.get(3)?, layout: r.get(4)?,
                filtro: json_col(r.get(5)?), config: json_col(r.get(6)?), grupo: r.get(7)?, fixa: r.get(8)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(v)
}

pub fn criar_visao(conn: &Connection, dados: &Value) -> Res<i64> {
    let ordem: i64 = conn.query_row("SELECT COALESCE(MAX(ordem), 0) + 1 FROM visoes", [], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO visoes (nome, ordem, criado_em) VALUES (?, ?, ?)",
        params![texto(dados, "nome").filter(|s| !s.is_empty()).unwrap_or("Nova visão".into()), ordem, agora()],
    )?;
    let id = conn.last_insert_rowid();
    atualizar_visao(conn, id, dados)?;
    Ok(id)
}

pub fn atualizar_visao(conn: &Connection, id: i64, dados: &Value) -> Res<()> {
    existe(conn, "visoes", id)?;
    if let Some(n) = texto(dados, "nome").filter(|s| !s.is_empty()) {
        conn.execute("UPDATE visoes SET nome = ? WHERE id = ?", params![n, id])?;
    }
    if let Some(i) = texto(dados, "icone").filter(|s| !s.is_empty()) {
        conn.execute("UPDATE visoes SET icone = ? WHERE id = ?", params![i, id])?;
    }
    if let Some(o) = dados.get("ordem").and_then(|v| v.as_i64()) {
        conn.execute("UPDATE visoes SET ordem = ? WHERE id = ?", params![o, id])?;
    }
    if let Some(l) = texto(dados, "layout") {
        if !LAYOUTS.contains(&l.as_str()) {
            return Err(Erro::Invalido(format!("layout desconhecido: {l} (use {})", LAYOUTS.join(", "))));
        }
        conn.execute("UPDATE visoes SET layout = ? WHERE id = ?", params![l, id])?;
    }
    if let Some(g) = dados.get("grupo") {
        let g = g.as_str().map(str::trim).filter(|s| !s.is_empty());
        conn.execute("UPDATE visoes SET grupo = ? WHERE id = ?", params![g, id])?;
    }
    let fixa: bool = conn.query_row("SELECT fixa FROM visoes WHERE id = ?", [id], |r| r.get(0))?;
    for campo in ["filtro", "config"] {
        if fixa && campo == "filtro" {
            continue;
        }
        if let Some(v @ Value::Object(_)) = dados.get(campo) {
            conn.execute(&format!("UPDATE visoes SET {campo} = ? WHERE id = ?"), params![v.to_string(), id])?;
        }
    }
    Ok(())
}

pub fn apagar_visao(conn: &Connection, id: i64) -> Res<()> {
    existe(conn, "visoes", id)?;
    if conn.query_row("SELECT fixa FROM visoes WHERE id = ?", [id], |r| r.get::<_, bool>(0))? {
        return Err(Erro::Invalido("Todos os documentos é a visão fixa da bancada; não sai".into()));
    }
    conn.execute("DELETE FROM visoes WHERE id = ?", [id])?;
    Ok(())
}

/// Sorteia um código de 7 hexadecimais que ainda não existe na bancada.
fn novo_codigo(conn: &Connection) -> Res<String> {
    for _ in 0..20 {
        let c: String = conn.query_row("SELECT substr(lower(hex(randomblob(4))), 1, 7)", [], |r| r.get(0))?;
        let existe: bool = conn.query_row("SELECT EXISTS (SELECT 1 FROM itens WHERE codigo = ?)", [&c], |r| r.get(0))?;
        if !existe {
            return Ok(c);
        }
    }
    Err(Erro::Invalido("não consegui sortear um código livre".into()))
}

/// Aceita o código (`a3f9c21`, com ou sem `#`) e devolve o id interno.
pub fn id_por_codigo(conn: &Connection, codigo: &str) -> Res<i64> {
    let c = codigo.trim().trim_start_matches('#').to_lowercase();
    conn.query_row("SELECT id FROM itens WHERE codigo = ?", [&c], |r| r.get(0))
        .optional()?
        .ok_or(Erro::NaoEncontrado(format!("documento #{c}")))
}

/// Banco em memória já migrado (para os testes dos outros módulos).
#[cfg(test)]
pub fn abrir_em_memoria() -> Connection {
    let c = Connection::open_in_memory().unwrap();
    migrar(&c).unwrap();
    c
}

fn migrar(conn: &Connection) -> Res<()> {
    let versao: usize = conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))? as usize;
    for (i, sql) in MIGRACOES.iter().enumerate().skip(versao) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.execute_batch(&format!("PRAGMA user_version = {}", i + 1))?;
        if i + 1 == 15 {
            // as menções dos documentos que já existiam
            let ids: Vec<i64> = tx.prepare("SELECT id FROM itens")?.query_map([], |r| r.get(0))?.collect::<Result<_, _>>()?;
            for id in ids {
                indexar_mencoes(&tx, id)?;
            }
        }
        tx.commit()?;
    }
    Ok(())
}

/// Os `#código` citados no texto: '#' e 7 hexadecimais (o código de um documento), sem outra letra ou número colado.
fn codigos_citados(texto: &str) -> Vec<String> {
    let b = texto.as_bytes();
    let mut v = vec![];
    for (i, _) in texto.match_indices('#') {
        let cod = &b[i + 1..(i + 8).min(b.len())];
        let depois = b.get(i + 8);
        if cod.len() == 7 && cod.iter().all(|c| c.is_ascii_hexdigit()) && !depois.is_some_and(|c| c.is_ascii_alphanumeric()) {
            v.push(String::from_utf8_lossy(cod).to_lowercase());
        }
    }
    v
}

/// Refaz o índice de menções de um documento: o que ele cita no texto e nas notas escritas (as automáticas, como
/// "Ligado: …", não contam). Chamado por quem grava texto ou nota.
pub fn indexar_mencoes(conn: &Connection, item_id: i64) -> Res<()> {
    conn.execute("DELETE FROM mencoes WHERE item_id = ?", [item_id])?;
    let corpo: String = conn.query_row("SELECT COALESCE(corpo, '') FROM itens WHERE id = ?", [item_id], |r| r.get(0)).optional()?.unwrap_or_default();
    let notas: Vec<String> = conn
        .prepare("SELECT texto FROM notas WHERE item_id = ? AND apagado_em IS NULL")?
        .query_map([item_id], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    let automatica = |t: &str| t.starts_with("Ligado:") || t.starts_with("Desligado:") || t.find(": ").is_some_and(|i| t[i..].contains(" → "));
    let mut cods: Vec<String> = codigos_citados(&corpo);
    for n in notas.iter().filter(|n| !automatica(n)) {
        cods.extend(codigos_citados(n));
    }
    cods.sort();
    cods.dedup();
    for c in cods {
        conn.execute("INSERT INTO mencoes (item_id, codigo) VALUES (?, ?)", params![item_id, c])?;
    }
    Ok(())
}

fn item_da_nota(conn: &Connection, nota: i64) -> Res<i64> {
    Ok(conn.query_row("SELECT item_id FROM notas WHERE id = ?", [nota], |r| r.get(0))?)
}

fn json_col(s: Option<String>) -> Value {
    s.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(Value::Null)
}

fn texto(v: &Value, campo: &str) -> Option<String> {
    v.get(campo).and_then(|x| x.as_str()).map(|s| s.trim().to_string())
}

/// Se `valor` ainda não é opção da propriedade (seleção, multisseleção ou status), acrescenta, no mesmo lugar onde
/// as opções moram (no tipo, se ele tem as suas, ou na propriedade). Como digitar uma opção nova na tela.
pub fn garantir_opcao(conn: &Connection, tipo_id: Option<i64>, prop_id: i64, valor: &str) -> Res<()> {
    let especie: Option<String> = conn.query_row("SELECT especie FROM propriedades WHERE id = ?", [prop_id], |r| r.get(0)).optional()?;
    let Some(especie) = especie else { return Ok(()) };
    if !["selecao", "multisselecao", "status"].contains(&especie.as_str()) || valor.trim().is_empty() {
        return Ok(());
    }
    let do_tipo: Option<Option<String>> = match tipo_id {
        Some(t) => conn
            .query_row("SELECT opcoes FROM tipo_propriedades WHERE tipo_id = ? AND propriedade_id = ?", params![t, prop_id], |r| r.get(0))
            .optional()?,
        None => None,
    };
    let no_tipo = matches!(do_tipo, Some(Some(_))) || (especie == "status" && do_tipo.is_some());
    let atual: Value = if no_tipo {
        json_col(do_tipo.flatten())
    } else {
        json_col(conn.query_row("SELECT opcoes FROM propriedades WHERE id = ?", [prop_id], |r| r.get(0))?)
    };
    let mut lista = atual.as_array().cloned().unwrap_or_default();
    if lista.iter().any(|o| o.get("nome").and_then(|n| n.as_str()) == Some(valor)) {
        return Ok(());
    }
    lista.push(json!({ "nome": valor, "cor": "gray" }));
    let txt = Value::Array(lista).to_string();
    if no_tipo {
        conn.execute("UPDATE tipo_propriedades SET opcoes = ? WHERE tipo_id = ? AND propriedade_id = ?", params![txt, tipo_id, prop_id])?;
    } else {
        conn.execute("UPDATE propriedades SET opcoes = ? WHERE id = ?", params![txt, prop_id])?;
    }
    Ok(())
}

// ---------- esquema: tipos e propriedades ----------

#[derive(Serialize)]
pub struct TipoProp {
    pub propriedade_id: i64,
    pub ordem: i64,
    /// Opções próprias deste tipo (status, por ex.). `null` = usa as da propriedade.
    pub opcoes: Value,
}

#[derive(Serialize)]
pub struct Tipo {
    pub id: i64,
    pub nome: String,
    pub icone: String,
    pub cor: Option<String>,
    pub ordem: i64,
    pub propriedades: Vec<TipoProp>,
}

#[derive(Serialize)]
pub struct Propriedade {
    pub id: i64,
    pub nome: String,
    pub especie: String,
    pub opcoes: Value,
    /// relação: `{ "inverso": "Bloqueado por", "um_so": true }`
    pub config: Value,
}

pub const ESPECIES: &[&str] = &[
    "texto", "numero", "data", "checkbox", "url", "email", "telefone", "selecao", "multisselecao", "status", "relacao",
    "links", "criado_em", "atualizado_em", "lista", "formula",
];

/// Espécies que aceitam `config.lista` (vários valores).
const LISTAVEIS: &[&str] = &["texto", "numero", "data", "email", "telefone", "url"];

/// Confere e ajeita um valor simples conforme a espécie e a config da propriedade
/// (`numero`: `inteiro`, `casas`; `data`: `hora`). Vazio vira `null`.
fn normalizar_simples(nome: &str, especie: &str, config: &Value, v: &Value) -> Res<Value> {
    if v.is_null() || v.as_str().is_some_and(|s| s.trim().is_empty()) {
        return Ok(Value::Null);
    }
    let invalido = |o: &str| Erro::Invalido(format!("{nome}: {o}"));
    Ok(match especie {
        "numero" => {
            let n = match v {
                Value::Number(n) => n.as_f64().unwrap_or(0.0),
                Value::String(s) => s.trim().replace(' ', "").replace(',', ".").parse::<f64>().map_err(|_| invalido(&format!("\"{s}\" não é número")))?,
                _ => return Err(invalido("use um número")),
            };
            if config.get("inteiro").and_then(|x| x.as_bool()).unwrap_or(false) {
                if n.fract() != 0.0 {
                    return Err(invalido(&format!("{n} não é inteiro")));
                }
                json!(n as i64)
            } else if let Some(c) = config.get("casas").and_then(|x| x.as_u64()) {
                let f = 10f64.powi(c.min(10) as i32);
                json!((n * f).round() / f)
            } else {
                json!(n)
            }
        }
        "data" => {
            let s = v.as_str().ok_or_else(|| invalido("use AAAA-MM-DD"))?.trim();
            let com_hora = config.get("hora").and_then(|x| x.as_bool()).unwrap_or(false);
            let ok_dia = s.len() >= 10 && chrono::NaiveDate::parse_from_str(&s[..10], "%Y-%m-%d").is_ok();
            if !ok_dia {
                return Err(invalido(&format!("\"{s}\" não é data (AAAA-MM-DD)")));
            }
            // com hora: AAAA-MM-DDTHH:MM (sem hora fica só o dia)
            if com_hora && s.len() >= 16 { json!(s[..16].replace(' ', "T")) } else { json!(s[..10]) }
        }
        "email" => {
            let s = v.as_str().unwrap_or("").trim();
            if !s.contains('@') || s.contains(' ') {
                return Err(invalido(&format!("\"{s}\" não parece e-mail")));
            }
            json!(s)
        }
        "telefone" => {
            let s = v.as_str().map(str::trim).map(String::from).unwrap_or_else(|| v.to_string());
            if !s.chars().all(|c| c.is_ascii_digit() || " +()-.".contains(c)) {
                return Err(invalido(&format!("\"{s}\" não parece telefone")));
            }
            json!(s)
        }
        "criado_em" | "atualizado_em" => return Err(invalido("é preenchida pelo atelier")),
        _ => v.clone(),
    })
}

/// Valor conforme a propriedade: lista (se `config.lista`) ou simples.
fn normalizar_valor(nome: &str, especie: &str, config: &Value, v: &Value) -> Res<Value> {
    if especie == "lista" {
        return Err(Erro::Invalido(format!("{nome}: é uma lista dinâmica, calculada pelos documentos ligados (não se escreve nela)")));
    }
    if especie == "formula" {
        return Err(Erro::Invalido(format!("{nome}: é uma fórmula, calculada das outras propriedades (não se escreve nela)")));
    }
    let lista = config.get("lista").and_then(|x| x.as_bool()).unwrap_or(false) && LISTAVEIS.contains(&especie);
    if !lista {
        return match v {
            // valor em lista numa propriedade simples: fica o primeiro
            Value::Array(l) if !["multisselecao"].contains(&especie) && LISTAVEIS.contains(&especie) => {
                normalizar_simples(nome, especie, config, l.first().unwrap_or(&Value::Null))
            }
            _ => normalizar_simples(nome, especie, config, v),
        };
    }
    let brutos = match v {
        Value::Null => vec![],
        Value::Array(l) => l.clone(),
        outro => vec![outro.clone()],
    };
    let mut l = vec![];
    for b in brutos {
        let x = normalizar_simples(nome, especie, config, &b)?;
        if !x.is_null() {
            l.push(x);
        }
    }
    Ok(if l.is_empty() { Value::Null } else { Value::Array(l) })
}

pub fn esquema(conn: &Connection) -> Res<Value> {
    let mut st = conn.prepare("SELECT id, nome, icone, cor, ordem FROM tipos ORDER BY ordem, id")?;
    let mut tipos: Vec<Tipo> = st
        .query_map([], |r| {
            Ok(Tipo { id: r.get(0)?, nome: r.get(1)?, icone: r.get(2)?, cor: r.get(3)?, ordem: r.get(4)?, propriedades: vec![] })
        })?
        .collect::<Result<_, _>>()?;
    let mut st = conn.prepare("SELECT propriedade_id, ordem, opcoes FROM tipo_propriedades WHERE tipo_id = ? ORDER BY ordem, propriedade_id")?;
    for t in &mut tipos {
        t.propriedades = st
            .query_map([t.id], |r| Ok(TipoProp { propriedade_id: r.get(0)?, ordem: r.get(1)?, opcoes: json_col(r.get(2)?) }))?
            .collect::<Result<_, _>>()?;
    }
    let mut st = conn.prepare("SELECT id, nome, especie, opcoes, config FROM propriedades ORDER BY id")?;
    let props: Vec<Propriedade> = st
        .query_map([], |r| {
            Ok(Propriedade { id: r.get(0)?, nome: r.get(1)?, especie: r.get(2)?, opcoes: json_col(r.get(3)?), config: json_col(r.get(4)?) })
        })?
        .collect::<Result<_, _>>()?;
    let mut st = conn.prepare("SELECT id, tipo_id, nome, titulo, corpo, props, padrao FROM modelos ORDER BY tipo_id, padrao DESC, nome")?;
    let modelos: Vec<Value> = st
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?, "tipo_id": r.get::<_, i64>(1)?, "nome": r.get::<_, String>(2)?,
                "titulo": r.get::<_, String>(3)?, "corpo": r.get::<_, String>(4)?,
                "props": json_col(r.get(5)?), "padrao": r.get::<_, bool>(6)?,
            }))
        })?
        .collect::<Result<_, _>>()?;
    Ok(json!({ "tipos": tipos, "propriedades": props, "modelos": modelos }))
}

// ---------- modelos (templates) ----------

pub fn criar_modelo(conn: &Connection, dados: &Value) -> Res<i64> {
    let tipo_id = dados.get("tipo_id").and_then(|v| v.as_i64()).ok_or(Erro::Invalido("o modelo precisa de tipo_id".into()))?;
    existe(conn, "tipos", tipo_id)?;
    let nome = texto(dados, "nome").filter(|s| !s.is_empty()).unwrap_or("Modelo".into());
    conn.execute(
        "INSERT INTO modelos (tipo_id, nome, criado_em) VALUES (?, ?, ?)",
        params![tipo_id, nome, agora()],
    )?;
    let id = conn.last_insert_rowid();
    atualizar_modelo(conn, id, dados)?;
    Ok(id)
}

pub fn atualizar_modelo(conn: &Connection, id: i64, dados: &Value) -> Res<()> {
    existe(conn, "modelos", id)?;
    if let Some(nome) = texto(dados, "nome").filter(|s| !s.is_empty()) {
        conn.execute("UPDATE modelos SET nome = ? WHERE id = ?", params![nome, id])?;
    }
    if let Some(t) = dados.get("titulo").and_then(|v| v.as_str()) {
        conn.execute("UPDATE modelos SET titulo = ? WHERE id = ?", params![t, id])?;
    }
    if let Some(c) = dados.get("corpo").and_then(|v| v.as_str()) {
        conn.execute("UPDATE modelos SET corpo = ? WHERE id = ?", params![c, id])?;
    }
    if let Some(p @ Value::Object(_)) = dados.get("props") {
        conn.execute("UPDATE modelos SET props = ? WHERE id = ?", params![p.to_string(), id])?;
    }
    if let Some(true) = dados.get("padrao").and_then(|v| v.as_bool()) {
        conn.execute("UPDATE modelos SET padrao = (id = ?1) WHERE tipo_id = (SELECT tipo_id FROM modelos WHERE id = ?1)", [id])?;
    } else if let Some(false) = dados.get("padrao").and_then(|v| v.as_bool()) {
        conn.execute("UPDATE modelos SET padrao = 0 WHERE id = ?", [id])?;
    }
    Ok(())
}

pub fn apagar_modelo(conn: &Connection, id: i64) -> Res<()> {
    existe(conn, "modelos", id)?;
    conn.execute("DELETE FROM modelos WHERE id = ?", [id])?;
    Ok(())
}

pub fn criar_tipo(conn: &Connection, dados: &Value) -> Res<i64> {
    let nome = texto(dados, "nome").filter(|s| !s.is_empty()).ok_or(Erro::Invalido("o tipo precisa de nome".into()))?;
    let icone = texto(dados, "icone").filter(|s| !s.is_empty()).unwrap_or("📄".into());
    let ordem: i64 = conn.query_row("SELECT COALESCE(MAX(ordem), 0) + 1 FROM tipos", [], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO tipos (nome, icone, ordem, criado_em) VALUES (?, ?, ?, ?)",
        params![nome, icone, ordem, agora()],
    )
    .map_err(|e| duplicado(e, "já existe um tipo com esse nome"))?;
    let id = conn.last_insert_rowid();
    // todo tipo nasce com Status, que é o mínimo para tabela e kanban fazerem sentido
    let status: Option<i64> = conn.query_row("SELECT id FROM propriedades WHERE especie = 'status' ORDER BY id LIMIT 1", [], |r| r.get(0)).optional()?;
    if let Some(pid) = status {
        conn.execute(
            "INSERT INTO tipo_propriedades (tipo_id, propriedade_id, ordem, opcoes) VALUES (?, ?, 1, ?)",
            params![id, pid, r#"[{"nome":"A fazer","cor":"gray"},{"nome":"Em andamento","cor":"blue"},{"nome":"Feito","cor":"green","historico":true}]"#],
        )?;
    }
    // e já aparece no menu como uma visão em tabela
    criar_visao(conn, &json!({ "nome": nome, "icone": icone, "layout": "tabela", "filtro": { "tipos": [id] } }))?;
    Ok(id)
}

fn duplicado(e: rusqlite::Error, msg: &str) -> Erro {
    if let rusqlite::Error::SqliteFailure(f, _) = &e {
        if f.code == rusqlite::ErrorCode::ConstraintViolation {
            return Erro::Invalido(msg.into());
        }
    }
    Erro::Banco(e)
}

pub fn atualizar_tipo(conn: &Connection, id: i64, dados: &Value) -> Res<()> {
    existe(conn, "tipos", id)?;
    if let Some(nome) = texto(dados, "nome").filter(|s| !s.is_empty()) {
        conn.execute("UPDATE tipos SET nome = ? WHERE id = ?", params![nome, id])
            .map_err(|e| duplicado(e, "já existe um tipo com esse nome"))?;
    }
    if let Some(icone) = texto(dados, "icone").filter(|s| !s.is_empty()) {
        conn.execute("UPDATE tipos SET icone = ? WHERE id = ?", params![icone, id])?;
    }
    if let Some(cor) = dados.get("cor") {
        conn.execute("UPDATE tipos SET cor = ? WHERE id = ?", params![cor.as_str(), id])?;
    }
    if let Some(ordem) = dados.get("ordem").and_then(|v| v.as_i64()) {
        conn.execute("UPDATE tipos SET ordem = ? WHERE id = ?", params![ordem, id])?;
    }
    Ok(())
}

pub fn apagar_tipo(conn: &Connection, id: i64) -> Res<()> {
    existe(conn, "tipos", id)?;
    conn.execute("DELETE FROM tipos WHERE id = ?", [id])?;
    // visões que eram só desse tipo ficariam vazias
    conn.execute("DELETE FROM visoes WHERE json_extract(filtro, '$.tipos') = json_array(?)", [id])?;
    Ok(())
}

pub fn criar_propriedade(conn: &Connection, dados: &Value) -> Res<i64> {
    let nome = texto(dados, "nome").filter(|s| !s.is_empty()).ok_or(Erro::Invalido("a propriedade precisa de nome".into()))?;
    let especie = texto(dados, "especie").unwrap_or("texto".into());
    if !ESPECIES.contains(&especie.as_str()) {
        return Err(Erro::Invalido(format!("espécie desconhecida: {especie} (use {})", ESPECIES.join(", "))));
    }
    let opcoes = dados.get("opcoes").cloned().unwrap_or(json!([]));
    let config = dados.get("config").filter(|v| v.is_object()).cloned().unwrap_or(json!({}));
    conn.execute(
        "INSERT INTO propriedades (nome, especie, opcoes, config, criado_em) VALUES (?, ?, ?, ?, ?)",
        params![nome, especie, opcoes.to_string(), config.to_string(), agora()],
    )
    .map_err(|e| duplicado(e, "já existe uma propriedade com esse nome"))?;
    Ok(conn.last_insert_rowid())
}

pub fn atualizar_propriedade(conn: &Connection, id: i64, dados: &Value) -> Res<()> {
    existe(conn, "propriedades", id)?;
    if let Some(nome) = texto(dados, "nome").filter(|s| !s.is_empty()) {
        conn.execute("UPDATE propriedades SET nome = ? WHERE id = ?", params![nome, id])
            .map_err(|e| duplicado(e, "já existe uma propriedade com esse nome"))?;
    }
    if let Some(especie) = texto(dados, "especie") {
        if !ESPECIES.contains(&especie.as_str()) {
            return Err(Erro::Invalido(format!("espécie desconhecida: {especie}")));
        }
        conn.execute("UPDATE propriedades SET especie = ? WHERE id = ?", params![especie, id])?;
    }
    if let Some(opcoes) = dados.get("opcoes") {
        conn.execute("UPDATE propriedades SET opcoes = ? WHERE id = ?", params![opcoes.to_string(), id])?;
    }
    if let Some(c @ Value::Object(_)) = dados.get("config") {
        conn.execute("UPDATE propriedades SET config = ? WHERE id = ?", params![c.to_string(), id])?;
    }
    Ok(())
}

/// Mexe numa opção de seleção/status: renomear (os itens que tinham o nome antigo passam a ter o novo), cor,
/// histórico (conta como concluído) ou apagar (os itens perdem esse valor). Com `tipo_id`, vale a lista do tipo (se
/// ele tiver lista própria; status sempre tem); sem, a lista da propriedade.
pub fn mudar_opcao(conn: &Connection, tipo_id: Option<i64>, prop_id: i64, nome: &str, mudanca: &Value) -> Res<()> {
    let do_tipo: Option<Value> = match tipo_id {
        Some(t) => conn
            .query_row("SELECT opcoes FROM tipo_propriedades WHERE tipo_id = ? AND propriedade_id = ?", params![t, prop_id], |r| r.get::<_, Option<String>>(0))
            .optional()?
            .flatten()
            .and_then(|s| serde_json::from_str(&s).ok()),
        None => None,
    };
    let (mut lista, no_tipo) = match do_tipo {
        Some(v) => (v, true),
        None => (json_col(conn.query_row("SELECT opcoes FROM propriedades WHERE id = ?", [prop_id], |r| r.get(0))?), false),
    };
    let ops = lista.as_array_mut().ok_or(Erro::Invalido("essa propriedade não tem opções".into()))?;
    let i = ops
        .iter()
        .position(|o| o["nome"].as_str().is_some_and(|n| n.eq_ignore_ascii_case(nome.trim())))
        .ok_or_else(|| Erro::NaoEncontrado(format!("opção \"{nome}\"")))?;
    let antigo = ops[i]["nome"].as_str().unwrap_or("").to_string();
    let novo_nome = mudanca.get("nome").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).map(String::from);
    let apagar = mudanca.get("apagar").and_then(|v| v.as_bool()).unwrap_or(false);
    if let Some(n) = &novo_nome {
        if ops.iter().enumerate().any(|(k, o)| k != i && o["nome"].as_str().is_some_and(|x| x.eq_ignore_ascii_case(n))) {
            return Err(Erro::Invalido(format!("já existe a opção \"{n}\"")));
        }
    }
    if apagar {
        ops.remove(i);
    } else {
        if let Some(n) = &novo_nome {
            ops[i]["nome"] = json!(n);
        }
        if let Some(c) = mudanca.get("cor").and_then(|v| v.as_str()) {
            ops[i]["cor"] = json!(c);
        }
        if let Some(h) = mudanca.get("historico").and_then(|v| v.as_bool()) {
            if h {
                ops[i]["historico"] = json!(true);
            } else if let Some(o) = ops[i].as_object_mut() {
                o.remove("historico");
            }
        }
    }
    let tx = conn.unchecked_transaction()?;
    let txt = lista.to_string();
    if no_tipo {
        tx.execute("UPDATE tipo_propriedades SET opcoes = ? WHERE tipo_id = ? AND propriedade_id = ?", params![txt, tipo_id, prop_id])?;
    } else {
        tx.execute("UPDATE propriedades SET opcoes = ? WHERE id = ?", params![txt, prop_id])?;
    }
    // os itens acompanham: valor simples ou dentro de uma lista (multisseleção); a lista do tipo vale só para ele
    if apagar || novo_nome.is_some() {
        let mut st = tx.prepare(&format!("SELECT id, tipo_id, props FROM itens WHERE json_extract(props, '$.\"{prop_id}\"') IS NOT NULL"))?;
        let linhas: Vec<(i64, Option<i64>, String)> = st
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<Result<_, _>>()?;
        drop(st);
        let chave = prop_id.to_string();
        for (id, t, props) in linhas {
            if no_tipo && t != tipo_id {
                continue;
            }
            let mut v: Value = serde_json::from_str(&props).unwrap_or(json!({}));
            let novo = match &v[&chave] {
                Value::String(x) if x == &antigo => novo_nome.as_ref().map(|n| json!(n)).unwrap_or(Value::Null),
                Value::Array(l) => json!(l
                    .iter()
                    .filter_map(|x| if x.as_str() == Some(antigo.as_str()) { novo_nome.as_ref().map(|n| json!(n)) } else { Some(x.clone()) })
                    .collect::<Vec<_>>()),
                outro => outro.clone(),
            };
            if novo.is_null() || novo.as_array().is_some_and(|l| l.is_empty()) {
                if let Some(o) = v.as_object_mut() {
                    o.remove(&chave);
                }
            } else {
                v[&chave] = novo;
            }
            tx.execute("UPDATE itens SET props = ? WHERE id = ?", params![v.to_string(), id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

/// A nota foi gravada pelo próprio atelier (criação, mudança de propriedade, ligação, pasta, texto editado), e não
/// escrita por alguém com "anotar"? É o que a linha do tempo agrupa e o `so_notas` do MCP tira.
pub fn nota_automatica(texto: &str) -> bool {
    let t = texto.trim();
    t == "Criado." || t == "Texto editado." || t == "Pasta desligada."
        || t.starts_with("Ligado: ") || t.starts_with("Desligado: ")
        || t.starts_with("Pasta: ") || t.starts_with("Pasta criada: ")
        || t.split_once(": ").is_some_and(|(campo, resto)| !campo.contains('\n') && campo.len() <= 60 && resto.contains(" → ") && !resto.contains('\n'))
}

/// Quantos itens (fora da lixeira) têm valor nesta propriedade: para avisar antes de apagar.
pub fn itens_com_valor(conn: &Connection, prop_id: i64) -> Res<i64> {
    Ok(conn.query_row(
        &format!("SELECT COUNT(*) FROM itens WHERE apagado_em IS NULL AND json_extract(props, '$.\"{prop_id}\"') IS NOT NULL"),
        [],
        |r| r.get(0),
    )?)
}

pub fn apagar_propriedade(conn: &Connection, id: i64) -> Res<()> {
    existe(conn, "propriedades", id)?;
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM propriedades WHERE id = ?", [id])?;
    tx.execute(&format!("UPDATE itens SET props = json_remove(props, '$.\"{id}\"')"), [])?;
    tx.commit()?;
    Ok(())
}

pub fn tipo_por_propriedade(conn: &Connection, tipo_id: i64, prop_id: i64, dados: &Value) -> Res<()> {
    existe(conn, "tipos", tipo_id)?;
    existe(conn, "propriedades", prop_id)?;
    // sem ordem: a que já está no tipo fica onde está (mudar só as opções não a manda para o fim); nova vai no fim
    let atual: Option<i64> = conn
        .query_row("SELECT ordem FROM tipo_propriedades WHERE tipo_id = ? AND propriedade_id = ?", params![tipo_id, prop_id], |r| r.get(0))
        .optional()?;
    let ordem = match (dados.get("ordem").and_then(|v| v.as_i64()), atual) {
        (Some(o), _) => o,
        (None, Some(o)) => o,
        (None, None) => conn.query_row("SELECT COALESCE(MAX(ordem), 0) + 1 FROM tipo_propriedades WHERE tipo_id = ?", [tipo_id], |r| r.get(0))?,
    };
    conn.execute(
        "INSERT INTO tipo_propriedades (tipo_id, propriedade_id, ordem) VALUES (?, ?, ?)
         ON CONFLICT (tipo_id, propriedade_id) DO UPDATE SET ordem = excluded.ordem",
        params![tipo_id, prop_id, ordem],
    )?;
    if let Some(opcoes) = dados.get("opcoes") {
        let s = if opcoes.is_null() { None } else { Some(opcoes.to_string()) };
        conn.execute("UPDATE tipo_propriedades SET opcoes = ? WHERE tipo_id = ? AND propriedade_id = ?", params![s, tipo_id, prop_id])?;
    }
    Ok(())
}

pub fn tipo_tira_propriedade(conn: &Connection, tipo_id: i64, prop_id: i64) -> Res<()> {
    // só tira do tipo; os valores ficam guardados nos itens
    conn.execute("DELETE FROM tipo_propriedades WHERE tipo_id = ? AND propriedade_id = ?", params![tipo_id, prop_id])?;
    Ok(())
}

fn existe(conn: &Connection, tabela: &str, id: i64) -> Res<()> {
    let n: i64 = conn.query_row(&format!("SELECT COUNT(*) FROM {tabela} WHERE id = ?"), [id], |r| r.get(0))?;
    if n == 0 {
        return Err(Erro::NaoEncontrado(format!("{tabela} {id}")));
    }
    Ok(())
}

// ---------- itens ----------

#[derive(Serialize)]
pub struct Nota {
    pub id: i64,
    pub texto: String,
    pub autor: String,
    pub criado_em: String,
    /// quando o texto da nota foi editado depois (a hora original fica em `criado_em`)
    pub editado_em: Option<String>,
}

#[derive(Serialize)]
pub struct Item {
    pub id: i64,
    /// código visível, 7 hexadecimais (`a3f9c21`)
    pub codigo: String,
    pub titulo: String,
    pub tipo_id: Option<i64>,
    pub pasta: Option<String>,
    pub props: Value,
    pub criado_em: String,
    pub atualizado_em: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub corpo: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notas: Option<Vec<Nota>>,
    /// na lixeira desde quando (None = ativo)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub apagado_em: Option<String>,
    /// quem aponta para este item numa propriedade de relação, lido do lado dele
    #[serde(skip_serializing_if = "Option::is_none")]
    pub referencias: Option<Value>,
    /// resumo dos itens que este aponta nas suas propriedades de relação
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relacionados: Option<Value>,
    /// itens que citam `#código` deste no texto ou numa nota
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mencionado_em: Option<Value>,
    /// listas dinâmicas do tipo (propriedade da espécie "lista" → os documentos dela, já na ordem)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub listas: Option<Value>,
}

fn item_da_linha(r: &rusqlite::Row) -> rusqlite::Result<Item> {
    Ok(Item {
        id: r.get("id")?,
        codigo: r.get::<_, Option<String>>("codigo")?.unwrap_or_default(),
        titulo: r.get("titulo")?,
        tipo_id: r.get("tipo_id")?,
        pasta: r.get("pasta")?,
        props: json_col(r.get("props")?),
        criado_em: r.get("criado_em")?,
        atualizado_em: r.get("atualizado_em")?,
        corpo: None,
        notas: None,
        apagado_em: r.get("apagado_em")?,
        referencias: None,
        relacionados: None,
        mencionado_em: None,
        listas: None,
    })
}

#[derive(Default)]
pub struct Filtro {
    pub tipo_id: Option<i64>,
    /// vários tipos (OU); junto com `sem_tipo`, os itens sem tipo também entram
    pub tipos: Vec<i64>,
    pub sem_tipo: bool,
    pub texto: Option<String>,
    /// propriedade → valores aceitos (OU); casa com valor simples ou com um dos valores de uma multisseleção.
    /// Propriedades diferentes combinam com E.
    pub props: Vec<(i64, Vec<String>)>,
    /// só itens com atividade (nota, mudança) entre as duas datas `AAAA-MM-DD`, inclusive
    pub periodo: Option<(String, String)>,
    /// propriedade de data → intervalo (`AAAA-MM-DD`, cada ponta opcional) ou `None` = sem data preenchida
    pub datas: Vec<(i64, Option<(Option<String>, Option<String>)>)>,
    /// propriedades de relação "livres": todos os itens ligados nela estão concluídos (status de histórico), ou não
    /// há nenhum. Ex.: "Bloqueado por" livre = pode andar agora.
    pub livres: Vec<i64>,
    /// preenchido por quem consulta quando há `livres`: (tipo, propriedade de status, opções de histórico)
    pub concluidos: Vec<(i64, i64, Vec<String>)>,
    /// visão feita de uma consulta: só os documentos que o SQL devolve (coluna `codigo`), na ordem dele
    pub sql: Option<String>,
}

/// Onde está o "concluído" de cada tipo: as opções de histórico de cada propriedade de status (a do tipo, se ele
/// tiver opções próprias, senão as da propriedade).
fn concluidos(conn: &Connection) -> Res<Vec<(i64, i64, Vec<String>)>> {
    let mut st = conn.prepare(
        "SELECT tp.tipo_id, p.id, COALESCE(tp.opcoes, p.opcoes) FROM tipo_propriedades tp \
         JOIN propriedades p ON p.id = tp.propriedade_id WHERE p.especie = 'status'",
    )?;
    let l = st
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?, r.get::<_, Option<String>>(2)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(l.into_iter()
        .filter_map(|(t, p, ops)| {
            let ops: Value = serde_json::from_str(ops.as_deref()?).ok()?;
            let nomes: Vec<String> = ops
                .as_array()?
                .iter()
                .filter(|o| o["historico"] == true)
                .filter_map(|o| o["nome"].as_str().map(String::from))
                .collect();
            (!nomes.is_empty()).then_some((t, p, nomes))
        })
        .collect())
}

fn sql_filtro(f: &Filtro, sql: &mut String, args: &mut Vec<Box<dyn rusqlite::ToSql>>) {
    sql.push_str(" AND itens.apagado_em IS NULL");
    if let Some(t) = f.tipo_id {
        sql.push_str(" AND itens.tipo_id = ?");
        args.push(Box::new(t));
    }
    if !f.tipos.is_empty() || f.sem_tipo {
        let mut partes = vec![];
        if !f.tipos.is_empty() {
            partes.push(format!("itens.tipo_id IN ({})", vec!["?"; f.tipos.len()].join(",")));
            for t in &f.tipos {
                args.push(Box::new(*t));
            }
        }
        if f.sem_tipo {
            partes.push("itens.tipo_id IS NULL".into());
        }
        sql.push_str(&format!(" AND ({})", partes.join(" OR ")));
    }
    if let Some(q) = f.texto.as_ref().filter(|s| !s.trim().is_empty()) {
        // pedaço no meio da palavra (LIKE), código, ou palavras em qualquer lugar do item e das notas, sem
        // diferenciar acento (FTS5: "pendencia" acha "pendência")
        sql.push_str(" AND (itens.titulo LIKE ? OR itens.corpo LIKE ? OR itens.codigo = ?");
        let like = format!("%{}%", q.trim());
        args.push(Box::new(like.clone()));
        args.push(Box::new(like));
        args.push(Box::new(q.trim().trim_start_matches('#').to_lowercase()));
        // cada palavra tem de estar em algum lugar do item (título, texto ou alguma nota)
        let termos = termos_fts(q);
        if !termos.is_empty() {
            let um = "itens.id IN (SELECT b.item_id FROM busca b LEFT JOIN notas n ON b.origem = 'n' AND n.id = b.ref \
                      WHERE busca MATCH ? AND (b.origem = 'i' OR n.apagado_em IS NULL))";
            sql.push_str(&format!(" OR ({})", vec![um; termos.len()].join(" AND ")));
            for t in termos {
                args.push(Box::new(t));
            }
        }
        sql.push(')');
    }
    for (pid, valores) in f.props.iter().filter(|(_, v)| !v.is_empty()) {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM json_each(itens.props, '$.\"{pid}\"') WHERE value IN ({}))",
            vec!["?"; valores.len()].join(",")
        ));
        for v in valores {
            args.push(Box::new(v.clone()));
        }
    }
    for (pid, intervalo) in &f.datas {
        let campo = format!("json_extract(itens.props, '$.\"{pid}\"')");
        match intervalo {
            None => sql.push_str(&format!(" AND ({campo} IS NULL OR {campo} = '' OR {campo} = '[]')")),
            Some((de, ate)) => {
                sql.push_str(&format!(" AND {campo} IS NOT NULL AND {campo} <> '' AND {campo} <> '[]'"));
                if let Some(de) = de {
                    sql.push_str(&format!(" AND {campo} >= ?"));
                    args.push(Box::new(de.clone()));
                }
                if let Some(ate) = ate {
                    sql.push_str(&format!(" AND {campo} <= ?"));
                    args.push(Box::new(ate.clone()));
                }
            }
        }
    }
    if let Some((de, ate)) = &f.periodo {
        sql.push_str(" AND EXISTS (SELECT 1 FROM notas n WHERE n.item_id = itens.id AND substr(n.criado_em, 1, 10) BETWEEN ? AND ?)");
        args.push(Box::new(de.clone()));
        args.push(Box::new(ate.clone()));
    }
    // relação livre: nenhum item ligado (que exista e não esteja na lixeira) fora de um status de histórico
    for pid in &f.livres {
        let mut concluido = vec![];
        for (t, sp, nomes) in &f.concluidos {
            concluido.push(format!("(o.tipo_id = ? AND json_extract(o.props, '$.\"{sp}\"') IN ({}))", vec!["?"; nomes.len()].join(",")));
            args.push(Box::new(*t));
            for n in nomes {
                args.push(Box::new(n.clone()));
            }
        }
        let concluido = if concluido.is_empty() { "0".to_string() } else { concluido.join(" OR ") };
        sql.push_str(&format!(
            " AND NOT EXISTS (SELECT 1 FROM json_each(itens.props, '$.\"{pid}\"') j JOIN itens o ON o.codigo = ltrim(lower(j.value), '#') \
             WHERE o.apagado_em IS NULL AND NOT ({concluido}))"
        ));
    }
}

/// Texto livre → uma consulta FTS5 por palavra, como prefixo (`"palav"*`).
fn termos_fts(q: &str) -> Vec<String> {
    q.split(|c: char| !c.is_alphanumeric()).filter(|t| !t.is_empty()).map(|t| format!("\"{t}\"*")).collect()
}

pub fn listar_itens(conn: &Connection, f: &Filtro) -> Res<Vec<Item>> {
    let mut sql = String::from("SELECT * FROM itens WHERE 1=1");
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![];
    let com_concluidos;
    let f = if f.livres.is_empty() {
        f
    } else {
        com_concluidos = Filtro { concluidos: concluidos(conn)?, ..clone_filtro(f) };
        &com_concluidos
    };
    sql_filtro(f, &mut sql, &mut args);
    sql.push_str(" ORDER BY atualizado_em DESC, id DESC");
    let mut st = conn.prepare(&sql)?;
    let mut itens: Vec<Item> = st
        .query_map(rusqlite::params_from_iter(args.iter().map(|b| b.as_ref())), item_da_linha)?
        .collect::<Result<_, _>>()?;
    // visão de consulta: fica só o que o SQL devolveu, na ordem dele
    if let Some(q) = f.sql.as_deref().filter(|q| !q.trim().is_empty()) {
        let cods = crate::consultas::codigos(conn, q)?;
        let pos: std::collections::HashMap<&str, usize> = cods.iter().enumerate().map(|(i, c)| (c.as_str(), i)).collect();
        itens.retain(|it| pos.contains_key(it.codigo.as_str()));
        itens.sort_by_key(|it| pos[it.codigo.as_str()]);
    }
    crate::formulas::calcular(conn, &mut itens)?;
    Ok(itens)
}

/// Um acontecimento na linha do tempo: uma nota (manual ou automática) com o item a que pertence.
#[derive(Serialize)]
pub struct Evento {
    pub id: i64,
    pub texto: String,
    pub autor: String,
    pub criado_em: String,
    pub item_id: i64,
    pub codigo: String,
    pub titulo: String,
    pub tipo_id: Option<i64>,
}

/// Linha do tempo entre duas datas (`AAAA-MM-DD`, inclusive), dos itens que passam no filtro. Mais recente primeiro.
pub fn linha_do_tempo(conn: &Connection, de: &str, ate: &str, f: &Filtro) -> Res<Vec<Evento>> {
    let mut sql = String::from(
        "SELECT n.id, n.texto, n.autor, n.criado_em, itens.id, COALESCE(itens.codigo, ''), itens.titulo, itens.tipo_id \
         FROM notas n JOIN itens ON itens.id = n.item_id WHERE n.apagado_em IS NULL AND substr(n.criado_em, 1, 10) BETWEEN ? AND ?",
    );
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(de.to_string()), Box::new(ate.to_string())];
    let concl = if f.livres.is_empty() { vec![] } else { concluidos(conn)? };
    let sem_periodo = Filtro { periodo: None, concluidos: concl, ..clone_filtro(f) };
    sql_filtro(&sem_periodo, &mut sql, &mut args);
    sql.push_str(" ORDER BY n.criado_em DESC, n.id DESC LIMIT 2000");
    let mut st = conn.prepare(&sql)?;
    let ev = st
        .query_map(rusqlite::params_from_iter(args.iter().map(|b| b.as_ref())), |r| {
            Ok(Evento {
                id: r.get(0)?, texto: r.get(1)?, autor: r.get(2)?, criado_em: r.get(3)?,
                item_id: r.get(4)?, codigo: r.get(5)?, titulo: r.get(6)?, tipo_id: r.get(7)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(ev)
}

fn clone_filtro(f: &Filtro) -> Filtro {
    Filtro {
        tipo_id: f.tipo_id,
        tipos: f.tipos.clone(),
        sem_tipo: f.sem_tipo,
        texto: f.texto.clone(),
        props: f.props.clone(),
        periodo: f.periodo.clone(),
        datas: f.datas.clone(),
        livres: f.livres.clone(),
        concluidos: f.concluidos.clone(),
        sql: f.sql.clone(),
    }
}

pub fn ler_item(conn: &Connection, id: i64) -> Res<Item> {
    let mut item = conn
        .query_row("SELECT * FROM itens WHERE id = ?", [id], |r| {
            let mut it = item_da_linha(r)?;
            it.corpo = Some(r.get("corpo")?);
            Ok(it)
        })
        .optional()?
        .ok_or(Erro::NaoEncontrado(format!("documento {id}")))?;
    let mut st = conn.prepare("SELECT id, texto, autor, criado_em, editado_em FROM notas WHERE item_id = ? AND apagado_em IS NULL ORDER BY criado_em DESC, id DESC")?;
    item.notas = Some(
        st.query_map([id], |r| Ok(Nota { id: r.get(0)?, texto: r.get(1)?, autor: r.get(2)?, criado_em: r.get(3)?, editado_em: r.get(4)? }))?
            .collect::<Result<_, _>>()?,
    );
    let (refs, men) = referencias_do_item(conn, id)?;
    item.referencias = Some(refs);
    item.mencionado_em = Some(men);
    let mut cods: Vec<String> = vec![];
    if let Value::Object(m) = &item.props {
        for (k, v) in m {
            let pid: i64 = k.parse().unwrap_or(0);
            let rel: bool = conn.query_row("SELECT especie = 'relacao' FROM propriedades WHERE id = ?", [pid], |r| r.get(0)).optional()?.unwrap_or(false);
            if rel {
                cods.extend(codigos_de(v));
            }
        }
    }
    item.relacionados = Some(json!(resumos(conn, &cods)?));
    item.listas = Some(listas_do_item(conn, &item)?);
    crate::formulas::calcular(conn, std::slice::from_mut(&mut item))?;
    Ok(item)
}

/// As listas dinâmicas do tipo do documento, calculadas: `{ "<id da propriedade>": [documentos...] }`.
pub fn listas_do_item(conn: &Connection, item: &Item) -> Res<Value> {
    let mut saida = serde_json::Map::new();
    let Some(tipo) = item.tipo_id else { return Ok(Value::Object(saida)) };
    let props: Vec<(i64, String)> = conn
        .prepare("SELECT p.id, p.config FROM propriedades p JOIN tipo_propriedades tp ON tp.propriedade_id = p.id WHERE tp.tipo_id = ? AND p.especie = 'lista' ORDER BY tp.ordem")?
        .query_map([tipo], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<_, _>>()?;
    for (pid, config) in props {
        let lista = lista_dinamica(conn, &item.codigo, &json_col(Some(config))).unwrap_or_default();
        saida.insert(pid.to_string(), json!(lista));
    }
    Ok(Value::Object(saida))
}

/// Os blocos ```atelier-lista do texto (a lista ao vivo dentro do documento), cada um como a config por nomes:
/// linhas `chave: valor` (tipos, relacao, ordenar, colunas). Sem relação, vale "Pai".
pub fn blocos_de_lista(corpo: &str) -> Vec<Value> {
    let mut blocos = vec![];
    let mut atual: Option<serde_json::Map<String, Value>> = None;
    for linha in corpo.lines() {
        let t = linha.trim();
        match &mut atual {
            None if t.starts_with("```") && t.trim_start_matches('`').trim() == "atelier-lista" => atual = Some(serde_json::Map::new()),
            Some(m) if t.starts_with("```") => {
                blocos.push(Value::Object(std::mem::take(m)));
                atual = None;
            }
            Some(m) => {
                if let Some((k, v)) = t.split_once(':') {
                    let k = k.trim().to_lowercase().replace("relação", "relacao");
                    m.insert(k, json!(v.trim()));
                }
            }
            None => {}
        }
    }
    blocos
}

/// A config de uma lista dinâmica a partir de nomes (o bloco no texto e o agente escrevem assim): `tipos` (nomes ou
/// ids, lista ou "A, B"), `relacao` (nome ou id de uma propriedade de relação), `ordenar` (nome de propriedade,
/// "titulo" ou "criado_em"; "-Ordem" = decrescente), `desc`. O que já vier em id passa direto.
pub fn config_de_lista(conn: &Connection, d: &Value) -> Res<Value> {
    let sem = |s: &str| s.trim().trim_start_matches('#').to_lowercase();
    let lista = |v: Option<&Value>| -> Vec<Value> {
        match v {
            Some(Value::Array(l)) => l.clone(),
            Some(Value::String(s)) => s.split(',').map(|x| json!(x.trim())).filter(|x| x != "").collect(),
            Some(outro) if !outro.is_null() => vec![outro.clone()],
            _ => vec![],
        }
    };
    let tipo_id = |v: &Value| -> Res<i64> {
        if let Some(n) = v.as_i64() {
            return Ok(n);
        }
        let nome = sem(v.as_str().unwrap_or(""));
        conn.query_row("SELECT id FROM tipos WHERE lower(nome) = ?", [&nome], |r| r.get(0))
            .optional()?
            .ok_or_else(|| Erro::Invalido(format!("tipo \"{nome}\" não existe")))
    };
    let prop_id = |v: &Value, especie: Option<&str>| -> Res<i64> {
        if let Some(n) = v.as_i64() {
            return Ok(n);
        }
        let nome = sem(v.as_str().unwrap_or(""));
        let (id, esp): (i64, String) = conn
            .query_row("SELECT id, especie FROM propriedades WHERE lower(nome) = ?", [&nome], |r| Ok((r.get(0)?, r.get(1)?)))
            .optional()?
            .ok_or_else(|| Erro::Invalido(format!("propriedade \"{nome}\" não existe")))?;
        if let Some(e) = especie.filter(|e| *e != esp) {
            return Err(Erro::Invalido(format!("\"{nome}\" não é uma propriedade de {e}")));
        }
        Ok(id)
    };
    let tipos: Vec<i64> = lista(d.get("tipos")).iter().map(tipo_id).collect::<Res<_>>()?;
    let relacao = prop_id(d.get("relacao").filter(|v| !v.is_null()).unwrap_or(&json!("Pai")), Some("relacao"))?;
    let mut desc = d.get("desc").and_then(|v| v.as_bool()).unwrap_or(false);
    let ordenar = match d.get("ordenar") {
        None | Some(Value::Null) => Value::Null,
        Some(Value::Number(n)) => Value::Number(n.clone()),
        Some(v) => {
            let mut t = v.as_str().unwrap_or("").trim().to_string();
            if let Some(r) = t.strip_prefix('-') {
                desc = true;
                t = r.trim().to_string();
            }
            match sem(&t).as_str() {
                "" => Value::Null,
                "titulo" | "título" => json!("titulo"),
                "criado_em" | "criado em" | "criação" => json!("criado_em"),
                _ => json!(prop_id(&json!(t), None)?),
            }
        }
    };
    Ok(json!({ "tipos": tipos, "relacao": relacao, "ordenar": ordenar, "desc": desc }))
}

/// Lista dinâmica: os documentos dos tipos `config.tipos` (vazio = qualquer tipo) cuja relação `config.relacao`
/// aponta para `codigo` ("este": o documento onde a lista está), na ordem de `config.ordenar` (id de propriedade,
/// "titulo" ou "criado_em"; `config.desc` inverte). O mesmo motor serve à propriedade da ficha e à lista no texto.
pub fn lista_dinamica(conn: &Connection, codigo: &str, config: &Value) -> Res<Vec<Item>> {
    let rel = config.get("relacao").and_then(|v| v.as_i64()).ok_or_else(|| Erro::Invalido("lista dinâmica sem relação: diga qual propriedade de relação liga os documentos".into()))?;
    let tipos: Vec<i64> = config.get("tipos").and_then(|v| v.as_array()).map(|l| l.iter().filter_map(|x| x.as_i64()).collect()).unwrap_or_default();
    // pela tabela de ligações (índice por alvo e propriedade), não varrendo o JSON de todos
    let mut sql = String::from(
        "SELECT DISTINCT i.* FROM ligacoes l JOIN itens i ON i.id = l.item_id WHERE l.prop_id = ?1 AND l.alvo = ?2 AND i.apagado_em IS NULL",
    );
    if !tipos.is_empty() {
        sql.push_str(&format!(" AND i.tipo_id IN ({})", tipos.iter().map(|t| t.to_string()).collect::<Vec<_>>().join(",")));
    }
    let codigo = codigo.trim().trim_start_matches('#').to_lowercase();
    let mut itens: Vec<Item> = conn.prepare(&sql)?.query_map(params![rel, codigo], item_da_linha)?.collect::<Result<_, _>>()?;
    let ordenar = config.get("ordenar").cloned().unwrap_or(Value::Null);
    let chave = |it: &Item| -> (u8, f64, String) {
        let v = match &ordenar {
            Value::Number(n) => it.props.get(n.to_string()).cloned().unwrap_or(Value::Null),
            Value::String(s) if s == "criado_em" => json!(it.criado_em),
            _ => json!(it.titulo.to_lowercase()),
        };
        match v {
            Value::Number(n) => (0, n.as_f64().unwrap_or(0.0), String::new()),
            Value::String(s) => match s.trim().replace(',', ".").parse::<f64>() {
                Ok(n) => (0, n, String::new()),
                Err(_) => (1, 0.0, s.to_lowercase()),
            },
            Value::Null => (2, 0.0, String::new()),
            outro => (1, 0.0, outro.to_string()),
        }
    };
    itens.sort_by(|a, b| {
        let (ka, kb) = (chave(a), chave(b));
        ka.0.cmp(&kb.0).then(ka.1.partial_cmp(&kb.1).unwrap_or(std::cmp::Ordering::Equal)).then(ka.2.cmp(&kb.2)).then(a.id.cmp(&b.id))
    });
    if config.get("desc").and_then(|v| v.as_bool()).unwrap_or(false) {
        // vazios continuam no fim
        let (mut com, sem): (Vec<Item>, Vec<Item>) = itens.into_iter().partition(|it| chave(it).0 < 2);
        com.reverse();
        itens = com.into_iter().chain(sem).collect();
    }
    Ok(itens)
}

fn autor(dados: &Value) -> String {
    texto(dados, "autor").filter(|s| !s.is_empty()).unwrap_or("Paulo".into())
}

/// Cria o item. Usa o modelo indicado em `modelo_id`, ou o modelo padrão do tipo (a não ser que venha
/// `"modelo_id": null`). O que vier explícito em `dados` vence o modelo.
pub fn criar_item(conn: &Connection, dados: &Value) -> Res<i64> {
    let mut tipo_id = dados.get("tipo_id").and_then(|v| v.as_i64());
    let modelo: Option<(i64, String, String, String)> = match dados.get("modelo_id") {
        Some(Value::Null) => None,
        Some(v) => {
            let mid = v.as_i64().ok_or(Erro::Invalido("modelo_id inválido".into()))?;
            Some(
                conn.query_row("SELECT tipo_id, titulo, corpo, props FROM modelos WHERE id = ?", [mid], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
                    .optional()?
                    .ok_or(Erro::NaoEncontrado(format!("modelo {mid}")))?,
            )
        }
        None => match tipo_id {
            Some(t) => conn
                .query_row("SELECT tipo_id, titulo, corpo, props FROM modelos WHERE tipo_id = ? AND padrao = 1", [t], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
                .optional()?,
            None => None,
        },
    };
    if tipo_id.is_none() {
        tipo_id = modelo.as_ref().map(|m| m.0);
    }
    if let Some(t) = tipo_id {
        existe(conn, "tipos", t)?;
    }
    let (m_titulo, m_corpo, m_props) = modelo.map(|m| (m.1, m.2, m.3)).unwrap_or_default();
    let titulo = texto(dados, "titulo").filter(|s| !s.is_empty()).unwrap_or(m_titulo);
    let corpo = dados.get("corpo").and_then(|v| v.as_str()).map(String::from).unwrap_or(m_corpo);
    let pasta = texto(dados, "pasta").filter(|s| !s.is_empty());
    let mut props: Map<String, Value> = serde_json::from_str(&m_props).unwrap_or_default();
    if let Some(Value::Object(p)) = dados.get("props") {
        for (k, v) in p {
            if v.is_null() {
                props.remove(k);
            } else {
                props.insert(k.clone(), v.clone());
            }
        }
    }
    // relações entram depois, por atualizar_item: confere os itens e anota dos dois lados
    let mut relacoes = Map::new();
    for k in props.keys().cloned().collect::<Vec<_>>() {
        let pid: i64 = k.parse().unwrap_or(0);
        let rel: bool = conn.query_row("SELECT especie = 'relacao' FROM propriedades WHERE id = ?", [pid], |r| r.get(0)).optional()?.unwrap_or(false);
        if rel {
            relacoes.insert(k.clone(), props.remove(&k).unwrap_or(Value::Null));
        }
    }
    let ts = agora();
    conn.execute(
        "INSERT INTO itens (codigo, titulo, tipo_id, corpo, pasta, props, criado_em, atualizado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        params![novo_codigo(conn)?, titulo, tipo_id, corpo, pasta, Value::Object(props).to_string(), ts, ts],
    )?;
    let id = conn.last_insert_rowid();
    indexar_mencoes(conn, id)?;
    anotar(conn, id, "Criado.", &autor(dados))?;
    if !relacoes.is_empty() {
        if let Err(e) = atualizar_item(conn, id, &json!({ "props": relacoes, "autor": autor(dados) })) {
            // relação inválida não deixa item pela metade
            conn.execute("DELETE FROM itens WHERE id = ?", [id])?;
            return Err(e);
        }
    }
    Ok(id)
}

fn nome_tipo(conn: &Connection, id: Option<i64>) -> Res<String> {
    Ok(match id {
        Some(id) => conn.query_row("SELECT nome FROM tipos WHERE id = ?", [id], |r| r.get(0)).optional()?.unwrap_or("?".into()),
        None => "sem tipo".into(),
    })
}

/// Valor de propriedade como texto de linha do tempo.
fn valor_legivel(v: &Value) -> String {
    match v {
        Value::Null => "—".into(),
        Value::String(s) if s.is_empty() => "—".into(),
        Value::String(s) => s.clone(),
        Value::Bool(b) => if *b { "sim".into() } else { "não".into() },
        Value::Array(l) if l.is_empty() => "—".into(),
        Value::Array(l) => l.iter().map(valor_legivel).collect::<Vec<_>>().join(", "),
        // link: o rótulo, ou a URL
        Value::Object(o) if o.contains_key("url") => o.get("rotulo").or(o.get("url")).and_then(|x| x.as_str()).unwrap_or("").to_string(),
        outro => outro.to_string(),
    }
}

/// Troca trechos do corpo sem reenviar o texto inteiro (`editar_trecho` do MCP). Cada troca é (de, para, todas):
/// `de` tem de existir; aparecendo mais de uma vez, só com `todas`. Se uma troca falha, nada é gravado. A linha do
/// tempo diz o que mudou (o pedaço diferente de cada troca), em vez de "Texto editado.".
pub fn editar_trecho(conn: &Connection, id: i64, trocas: &[(String, String, bool)], autor: &str) -> Res<String> {
    if trocas.is_empty() {
        return Err(Erro::Invalido("nenhuma troca: mande de e para (ou trocas: [{de, para}])".into()));
    }
    let mut corpo: String = conn.query_row("SELECT corpo FROM itens WHERE id = ? AND apagado_em IS NULL", [id], |r| r.get(0))
        .optional()?
        .ok_or_else(|| Erro::NaoEncontrado("documento".into()))?;
    let mut resumo = vec![];
    for (i, (de, para, todas)) in trocas.iter().enumerate() {
        let n = if de.is_empty() { 0 } else { corpo.matches(de.as_str()).count() };
        let qual = if trocas.len() > 1 { format!("troca {}: ", i + 1) } else { String::new() };
        if n == 0 {
            return Err(Erro::Invalido(format!("{qual}o trecho `de` não está no texto (ele pode ter mudado: leia o documento de novo)")));
        }
        if n > 1 && !todas {
            return Err(Erro::Invalido(format!("{qual}o trecho `de` aparece {n} vezes: mande um pedaço maior, que seja único, ou todas: true")));
        }
        corpo = if *todas { corpo.replace(de.as_str(), para) } else { corpo.replacen(de.as_str(), para, 1) };
        resumo.push(diferenca_curta(de, para));
    }
    let nota = format!("Texto: {}", resumo.join(" · "));
    atualizar_item(conn, id, &json!({ "corpo": corpo, "autor": autor, "nota_texto": nota }))?;
    Ok(nota)
}

/// "antes → depois" só com o pedaço que mudou (tira o começo e o fim iguais), numa linha e curto.
fn diferenca_curta(de: &str, para: &str) -> String {
    let a: Vec<char> = de.chars().collect();
    let b: Vec<char> = para.chars().collect();
    let mut ini = 0;
    while ini < a.len() && ini < b.len() && a[ini] == b[ini] {
        ini += 1;
    }
    let mut fim = 0;
    while fim < a.len() - ini && fim < b.len() - ini && a[a.len() - 1 - fim] == b[b.len() - 1 - fim] {
        fim += 1;
    }
    // um pouco de contexto antes, até o começo da palavra
    let mut c = ini;
    while c > 0 && ini - c < 24 && !a[c - 1].is_whitespace() {
        c -= 1;
    }
    // palavra inteira que entrou ou saiu: leva a palavra de antes junto ("Texto antes" → "Texto de antes", não "∅ → de")
    if c == ini && c > 0 && (ini == a.len() - fim || ini == b.len() - fim) {
        while c > 0 && a[c - 1].is_whitespace() {
            c -= 1;
        }
        while c > 0 && ini - c < 24 && !a[c - 1].is_whitespace() {
            c -= 1;
        }
    }
    let curto = |v: &[char]| -> String {
        let t: String = v.iter().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ");
        if t.chars().count() > 70 { format!("{}…", t.chars().take(70).collect::<String>()) } else if t.is_empty() { "∅".into() } else { t }
    };
    format!("{} → {}", curto(&a[c..a.len() - fim]), curto(&b[c..b.len() - fim]))
}

/// "Texto editado." de quem já está editando há pouco vira uma entrada só (a hora vai para a última edição).
const TEXTO_EDITADO: &str = "Texto editado.";

/// Atualiza só o que veio. Em `props`, valor `null` apaga a propriedade do item.
/// Toda mudança (título, tipo, propriedade, pasta, texto) vira nota datada na linha do tempo, com o autor.
pub fn atualizar_item(conn: &Connection, id: i64, dados: &Value) -> Res<()> {
    let (tipo_atual, props_atual, titulo_atual, corpo_atual, pasta_atual): (Option<i64>, String, String, String, Option<String>) = conn
        .query_row("SELECT tipo_id, props, titulo, corpo, pasta FROM itens WHERE id = ?", [id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
        })
        .optional()?
        .ok_or(Erro::NaoEncontrado(format!("documento {id}")))?;
    let quem = autor(dados);
    let tx = conn.unchecked_transaction()?;
    let mut eventos: Vec<String> = vec![];
    let mut editou_texto = false;

    if let Some(t) = dados.get("titulo").and_then(|v| v.as_str()) {
        let t = t.trim();
        if t != titulo_atual {
            tx.execute("UPDATE itens SET titulo = ? WHERE id = ?", params![t, id])?;
            eventos.push(format!("Título: {} → {}", if titulo_atual.is_empty() { "—" } else { &titulo_atual }, t));
        }
    }
    if let Some(c) = dados.get("corpo").and_then(|v| v.as_str()) {
        if c != corpo_atual {
            tx.execute("UPDATE itens SET corpo = ? WHERE id = ?", params![c, id])?;
            indexar_mencoes(&tx, id)?;
            editou_texto = true;
        }
    }
    if let Some(p) = dados.get("pasta") {
        let p = p.as_str().map(|s| s.trim()).filter(|s| !s.is_empty());
        if p != pasta_atual.as_deref() {
            tx.execute("UPDATE itens SET pasta = ? WHERE id = ?", params![p, id])?;
            eventos.push(match p {
                Some(p) => format!("Pasta: {p}"),
                None => "Pasta desligada.".into(),
            });
        }
    }
    if let Some(t) = dados.get("tipo_id") {
        let novo = t.as_i64();
        if let Some(n) = novo {
            existe(&tx, "tipos", n)?;
        }
        if novo != tipo_atual {
            tx.execute("UPDATE itens SET tipo_id = ? WHERE id = ?", params![novo, id])?;
            eventos.push(format!("Tipo: {} → {}", nome_tipo(&tx, tipo_atual)?, nome_tipo(&tx, novo)?));
        }
    }
    // relação ligada ou desligada: (outro item, rótulo do lado dele, ligou?)
    let mut do_outro_lado: Vec<(String, String, bool)> = vec![];
    if let Some(Value::Object(novos)) = dados.get("props") {
        let mut props: Map<String, Value> = serde_json::from_str(&props_atual).unwrap_or_default();
        let (proprio, _) = resumo_item(&tx, id)?;
        for (k, v) in novos {
            let pid: i64 = k.parse().map_err(|_| Erro::Invalido(format!("propriedade inválida: {k}")))?;
            let (nome, especie, config) = prop_info(&tx, pid)?;
            let antes = props.get(k).cloned().unwrap_or(Value::Null);
            let v = if especie == "relacao" {
                normalizar_relacao(&tx, Some(&proprio), v, config.get("um_so").and_then(|x| x.as_bool()).unwrap_or(false))?
            } else if especie == "links" {
                normalizar_links(v)?
            } else {
                normalizar_valor(&nome, &especie, &config, v)?
            };
            if antes == v {
                continue;
            }
            if especie == "relacao" {
                let (a, d) = (codigos_de(&antes), codigos_de(&v));
                eventos.push(format!("{nome}: {} → {}", codigos_legiveis(&tx, &a), codigos_legiveis(&tx, &d)));
                let inv = rotulo_inverso(&nome, &config);
                do_outro_lado.extend(d.iter().filter(|c| !a.contains(c)).map(|c| (c.clone(), inv.clone(), true)));
                do_outro_lado.extend(a.iter().filter(|c| !d.contains(c)).map(|c| (c.clone(), inv.clone(), false)));
            } else {
                eventos.push(format!("{nome}: {} → {}", valor_legivel(&antes), valor_legivel(&v)));
            }
            if v.is_null() {
                props.remove(k);
            } else {
                props.insert(k.clone(), v);
            }
        }
        let titulo: String = tx.query_row("SELECT titulo FROM itens WHERE id = ?", [id], |r| r.get(0))?;
        for (cod, rotulo, ligou) in &do_outro_lado {
            if let Ok(outro) = id_por_codigo(&tx, cod) {
                let verbo = if *ligou { "Ligado" } else { "Desligado" };
                anotar(&tx, outro, &format!("{verbo}: {rotulo} #{proprio} {titulo}").trim_end().to_string(), &quem)?;
            }
        }
        tx.execute("UPDATE itens SET props = ? WHERE id = ?", params![Value::Object(props).to_string(), id])?;
    }
    tx.execute("UPDATE itens SET atualizado_em = ? WHERE id = ?", params![agora(), id])?;
    for e in eventos {
        anotar(&tx, id, &e, &quem)?;
    }
    // quem diz o que mudou (o `editar_trecho`) ganha uma linha própria, com a versão de antes guardada
    let nota_texto = dados.get("nota_texto").and_then(|v| v.as_str()).filter(|t| !t.trim().is_empty());
    if let (true, Some(t)) = (editou_texto, nota_texto) {
        guardar_versao(&tx, "item", id, &corpo_atual, &quem)?;
        anotar(&tx, id, t, &quem)?;
    } else if editou_texto {
        // edições seguidas (até 30 min) da mesma pessoa viram uma entrada só, com a hora da última
        let ultima: Option<(i64, String, String)> = tx
            .query_row("SELECT id, texto, criado_em FROM notas WHERE item_id = ? AND autor = ? ORDER BY criado_em DESC, id DESC LIMIT 1", params![id, quem], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?))
            })
            .optional()?;
        let recente = ultima.as_ref().is_some_and(|(_, t, quando)| {
            t == TEXTO_EDITADO
                && chrono::DateTime::parse_from_str(quando, "%Y-%m-%dT%H:%M:%S%:z")
                    .is_ok_and(|d| chrono::Local::now().signed_duration_since(d).num_minutes() < 30)
        });
        match ultima {
            Some((nid, _, _)) if recente => {
                tx.execute("UPDATE notas SET criado_em = ? WHERE id = ?", params![agora(), nid])?;
            }
            _ => {
                // sessão nova de edição: guarda como o texto estava antes dela
                guardar_versao(&tx, "item", id, &corpo_atual, &quem)?;
                anotar(&tx, id, TEXTO_EDITADO, &quem)?;
            }
        }
    }
    tx.commit()?;
    Ok(())
}

/// Manda para a lixeira (não apaga de verdade). Some das visões, da busca e do MCP até ser restaurado.
pub fn apagar_item(conn: &Connection, id: i64, autor: &str) -> Res<()> {
    existe(conn, "itens", id)?;
    conn.execute("UPDATE itens SET apagado_em = ? WHERE id = ? AND apagado_em IS NULL", params![agora(), id])?;
    anotar(conn, id, "Movido para a lixeira.", autor)?;
    Ok(())
}

pub fn restaurar_item(conn: &Connection, id: i64, autor: &str) -> Res<()> {
    existe(conn, "itens", id)?;
    conn.execute("UPDATE itens SET apagado_em = NULL WHERE id = ?", [id])?;
    anotar(conn, id, "Restaurado da lixeira.", autor)?;
    Ok(())
}

/// Apaga de verdade um item que já está na lixeira (com notas e versões). A pasta no disco fica.
pub fn apagar_de_vez(conn: &Connection, id: i64) -> Res<()> {
    let na_lixeira: bool = conn
        .query_row("SELECT apagado_em IS NOT NULL FROM itens WHERE id = ?", [id], |r| r.get(0))
        .optional()?
        .ok_or(Erro::NaoEncontrado(format!("documento {id}")))?;
    if !na_lixeira {
        return Err(Erro::Invalido("só apaga de vez o que já está na lixeira".into()));
    }
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM versoes WHERE (alvo = 'item' AND alvo_id = ?1) OR (alvo = 'nota' AND alvo_id IN (SELECT id FROM notas WHERE item_id = ?1))", [id])?;
    tx.execute("DELETE FROM itens WHERE id = ?", [id])?;
    tx.commit()?;
    Ok(())
}

/// Esvazia a lixeira: itens e notas apagados somem de vez. Devolve quantos itens e notas saíram.
pub fn esvaziar_lixeira(conn: &Connection) -> Res<(usize, usize)> {
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM versoes WHERE alvo = 'item' AND alvo_id IN (SELECT id FROM itens WHERE apagado_em IS NOT NULL)", [])?;
    tx.execute("DELETE FROM versoes WHERE alvo = 'nota' AND alvo_id IN (SELECT id FROM notas WHERE apagado_em IS NOT NULL OR item_id IN (SELECT id FROM itens WHERE apagado_em IS NOT NULL))", [])?;
    let notas = tx.execute("DELETE FROM notas WHERE apagado_em IS NOT NULL", [])?;
    let itens = tx.execute("DELETE FROM itens WHERE apagado_em IS NOT NULL", [])?;
    tx.commit()?;
    Ok((itens, notas))
}

/// Apaga de vez o que está na lixeira há mais de `dias` dias (itens e notas).
pub fn esvaziar_lixeira_antiga(conn: &Connection, dias: u32) -> Res<(usize, usize)> {
    let corte = (chrono::Local::now() - chrono::Duration::days(dias as i64)).format("%Y-%m-%dT%H:%M:%S%:z").to_string();
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM versoes WHERE alvo = 'item' AND alvo_id IN (SELECT id FROM itens WHERE apagado_em < ?)", [&corte])?;
    tx.execute("DELETE FROM versoes WHERE alvo = 'nota' AND alvo_id IN (SELECT id FROM notas WHERE apagado_em < ?1 OR item_id IN (SELECT id FROM itens WHERE apagado_em < ?1))", [&corte])?;
    let notas = tx.execute("DELETE FROM notas WHERE apagado_em < ?", [&corte])?;
    let itens = tx.execute("DELETE FROM itens WHERE apagado_em < ?", [&corte])?;
    tx.commit()?;
    Ok((itens, notas))
}

/// O que está na lixeira: itens e notas soltas (de itens que continuam ativos).
pub fn lixeira(conn: &Connection) -> Res<Value> {
    let mut st = conn.prepare("SELECT * FROM itens WHERE apagado_em IS NOT NULL ORDER BY apagado_em DESC")?;
    let itens: Vec<Item> = st.query_map([], item_da_linha)?.collect::<Result<_, _>>()?;
    let mut st = conn.prepare(
        "SELECT n.id, n.texto, n.autor, n.criado_em, n.apagado_em, i.id, COALESCE(i.codigo, ''), i.titulo \
         FROM notas n JOIN itens i ON i.id = n.item_id WHERE n.apagado_em IS NOT NULL AND i.apagado_em IS NULL ORDER BY n.apagado_em DESC",
    )?;
    let notas: Vec<Value> = st
        .query_map([], |r| {
            Ok(json!({
                "id": r.get::<_, i64>(0)?, "texto": r.get::<_, String>(1)?, "autor": r.get::<_, String>(2)?,
                "criado_em": r.get::<_, String>(3)?, "apagado_em": r.get::<_, String>(4)?,
                "item_id": r.get::<_, i64>(5)?, "codigo": r.get::<_, String>(6)?, "titulo": r.get::<_, String>(7)?,
            }))
        })?
        .collect::<Result<_, _>>()?;
    Ok(json!({ "itens": itens, "notas": notas }))
}

// ---------- versões ----------

fn guardar_versao(conn: &Connection, alvo: &str, alvo_id: i64, conteudo: &str, autor: &str) -> Res<()> {
    if conteudo.trim().is_empty() {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO versoes (alvo, alvo_id, conteudo, autor, criado_em) VALUES (?, ?, ?, ?, ?)",
        params![alvo, alvo_id, conteudo, autor, agora()],
    )?;
    Ok(())
}

/// Versões anteriores de um texto (`alvo` = "item" para o corpo, "nota" para uma nota), mais recente primeiro.
/// `criado_em` é quando aquela versão foi substituída; `autor` é quem a substituiu.
pub fn versoes(conn: &Connection, alvo: &str, alvo_id: i64) -> Res<Vec<Value>> {
    let mut st = conn.prepare("SELECT id, conteudo, autor, criado_em FROM versoes WHERE alvo = ? AND alvo_id = ? ORDER BY criado_em DESC, id DESC")?;
    let v = st
        .query_map(params![alvo, alvo_id], |r| {
            Ok(json!({ "id": r.get::<_, i64>(0)?, "conteudo": r.get::<_, String>(1)?, "autor": r.get::<_, String>(2)?, "criado_em": r.get::<_, String>(3)? }))
        })?
        .collect::<Result<_, _>>()?;
    Ok(v)
}

/// Volta um texto a uma versão anterior. O texto atual vira versão também (nada se perde).
pub fn restaurar_versao(conn: &Connection, versao_id: i64, autor: &str) -> Res<()> {
    let (alvo, alvo_id, conteudo): (String, i64, String) = conn
        .query_row("SELECT alvo, alvo_id, conteudo FROM versoes WHERE id = ?", [versao_id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .optional()?
        .ok_or(Erro::NaoEncontrado(format!("versão {versao_id}")))?;
    match alvo.as_str() {
        "item" => {
            let atual: String = conn.query_row("SELECT corpo FROM itens WHERE id = ?", [alvo_id], |r| r.get(0))?;
            guardar_versao(conn, "item", alvo_id, &atual, autor)?;
            conn.execute("UPDATE itens SET corpo = ?, atualizado_em = ? WHERE id = ?", params![conteudo, agora(), alvo_id])?;
            indexar_mencoes(conn, alvo_id)?;
            anotar(conn, alvo_id, "Texto restaurado de uma versão anterior.", autor)?;
        }
        "nota" => editar_nota(conn, alvo_id, &conteudo, autor)?,
        outro => return Err(Erro::Invalido(format!("versão de tipo desconhecido: {outro}"))),
    }
    Ok(())
}

/// Corrige o texto de uma nota; a hora original continua, e a da edição fica em `editado_em`.
pub fn editar_nota(conn: &Connection, id: i64, texto: &str, autor: &str) -> Res<()> {
    let antes: String = conn
        .query_row("SELECT texto FROM notas WHERE id = ?", [id], |r| r.get(0))
        .optional()?
        .ok_or(Erro::NaoEncontrado(format!("nota {id}")))?;
    if texto.trim().is_empty() {
        return Err(Erro::Invalido("nota vazia".into()));
    }
    if antes == texto.trim() {
        return Ok(());
    }
    guardar_versao(conn, "nota", id, &antes, autor)?;
    conn.execute("UPDATE notas SET texto = ?, editado_em = ? WHERE id = ?", params![texto.trim(), agora(), id])?;
    indexar_mencoes(conn, item_da_nota(conn, id)?)?;
    Ok(())
}

/// Nota vai para a lixeira (some da linha do tempo; dá para restaurar).
pub fn apagar_nota(conn: &Connection, id: i64) -> Res<()> {
    existe(conn, "notas", id)?;
    conn.execute("UPDATE notas SET apagado_em = ? WHERE id = ?", params![agora(), id])?;
    indexar_mencoes(conn, item_da_nota(conn, id)?)?;
    Ok(())
}

pub fn restaurar_nota(conn: &Connection, id: i64) -> Res<()> {
    existe(conn, "notas", id)?;
    conn.execute("UPDATE notas SET apagado_em = NULL WHERE id = ?", [id])?;
    indexar_mencoes(conn, item_da_nota(conn, id)?)?;
    Ok(())
}

pub fn anotar(conn: &Connection, item_id: i64, texto: &str, autor: &str) -> Res<i64> {
    conn.execute(
        "INSERT INTO notas (item_id, texto, autor, criado_em) VALUES (?, ?, ?, ?)",
        params![item_id, texto, autor, agora()],
    )?;
    let id = conn.last_insert_rowid();
    // nota automática ("Ligado: …") não cita ninguém: só a escrita reindexa
    if texto.contains('#') {
        indexar_mencoes(conn, item_id)?;
    }
    Ok(id)
}

#[cfg(test)]
mod testes {
    use super::*;

    fn banco() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON").unwrap();
        migrar(&conn).unwrap();
        conn
    }

    #[test]
    fn tipo_novo_propriedade_nova_e_troca_de_tipo() {
        let c = banco();
        let tipo = criar_tipo(&c, &json!({"nome": "Demanda", "icone": "📥"})).unwrap();
        let prop = criar_propriedade(&c, &json!({"nome": "Solicitante", "especie": "texto"})).unwrap();
        tipo_por_propriedade(&c, tipo, prop, &json!({})).unwrap();
        let item = criar_item(&c, &json!({"titulo": "Simulador X", "tipo_id": tipo, "props": {prop.to_string(): "Fulano", "1": "A fazer"}})).unwrap();

        atualizar_item(&c, item, &json!({"tipo_id": 2, "props": {"1": "A FAZER", "6": "F2"}, "autor": "Claude"})).unwrap();
        let it = ler_item(&c, item).unwrap();
        assert_eq!(it.tipo_id, Some(2));
        assert_eq!(it.props[prop.to_string()], "Fulano", "valor de propriedade fora do tipo continua guardado");
        let notas: Vec<_> = it.notas.unwrap().into_iter().map(|n| n.texto).collect();
        assert!(notas.iter().any(|n| n == "Tipo: Demanda → Dívida"), "{notas:?}");
        assert!(notas.iter().any(|n| n == "Status: A fazer → A FAZER"), "{notas:?}");

        let da_frente = listar_itens(&c, &Filtro { props: vec![(6, vec!["F2".into()])], ..Default::default() }).unwrap();
        assert_eq!(da_frente.len(), 1);
    }

    #[test]
    fn item_nasce_do_modelo_padrao_do_tipo() {
        let c = banco();
        let id = criar_item(&c, &json!({"titulo": "Revisar PR", "tipo_id": 1, "props": {"2": "Alta"}})).unwrap();
        let it = ler_item(&c, id).unwrap();
        assert_eq!(it.props["1"], "A fazer");
        assert_eq!(it.props["2"], "Alta", "o que vem explícito vence o modelo");
        assert!(it.corpo.unwrap().contains("## O que fazer"));

        let sem = criar_item(&c, &json!({"titulo": "crua", "tipo_id": 1, "modelo_id": null})).unwrap();
        assert_eq!(ler_item(&c, sem).unwrap().corpo.unwrap(), "");
    }

    #[test]
    fn codigo_tem_7_hex_unico_e_acha_pela_busca() {
        let c = banco();
        let mut vistos = std::collections::HashSet::new();
        for i in 0..200 {
            let id = criar_item(&c, &json!({ "titulo": format!("x{i}") })).unwrap();
            let it = ler_item(&c, id).unwrap();
            assert_eq!(it.codigo.len(), 7);
            assert!(it.codigo.chars().all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase()));
            assert!(vistos.insert(it.codigo.clone()));
            assert_eq!(id_por_codigo(&c, &format!("#{}", it.codigo.to_uppercase())).unwrap(), id);
        }
        let um = ler_item(&c, 1).unwrap().codigo;
        let r = listar_itens(&c, &Filtro { texto: Some(um), ..Default::default() }).unwrap();
        assert_eq!(r.len(), 1);
    }

    #[test]
    fn tudo_que_muda_vai_para_a_linha_do_tempo_com_hora() {
        let c = banco();
        let id = criar_item(&c, &json!({"titulo": "a", "tipo_id": 1, "autor": "Codex"})).unwrap();
        atualizar_item(&c, id, &json!({"titulo": "b", "props": {"2": "Alta", "5": ["aws"]}, "pasta": "/x/y", "autor": "Codex"})).unwrap();
        atualizar_item(&c, id, &json!({"corpo": "um", "autor": "Codex"})).unwrap();
        atualizar_item(&c, id, &json!({"corpo": "dois", "autor": "Codex"})).unwrap();
        atualizar_item(&c, id, &json!({"titulo": "b", "autor": "Codex"})).unwrap(); // sem mudança: nada
        let hoje = chrono::Local::now().format("%Y-%m-%d").to_string();
        let ev = linha_do_tempo(&c, &hoje, &hoje, &Filtro::default()).unwrap();
        let textos: Vec<&str> = ev.iter().map(|e| e.texto.as_str()).collect();
        assert!(textos.contains(&"Título: a → b"), "{textos:?}");
        assert!(textos.contains(&"Prioridade: Média → Alta"), "{textos:?}");
        assert!(textos.contains(&"Tags: — → aws"), "{textos:?}");
        assert!(textos.contains(&"Pasta: /x/y"), "{textos:?}");
        assert_eq!(textos.iter().filter(|t| **t == TEXTO_EDITADO).count(), 1, "edições seguidas viram uma só");
        assert_eq!(textos.iter().filter(|t| t.starts_with("Título")).count(), 1);
        assert!(ev.iter().all(|e| e.autor == "Codex" && e.criado_em.len() >= 19 && e.codigo.len() == 7));
        // filtro de tipo vale na linha do tempo; outro dia não tem nada
        assert!(linha_do_tempo(&c, &hoje, &hoje, &Filtro { tipos: vec![2], ..Default::default() }).unwrap().is_empty());
        assert!(linha_do_tempo(&c, "2000-01-01", "2000-01-02", &Filtro::default()).unwrap().is_empty());
        // período em listar_itens = teve atividade no período
        assert_eq!(listar_itens(&c, &Filtro { periodo: Some((hoje.clone(), hoje)), ..Default::default() }).unwrap().len(), 1);
    }

    #[test]
    fn visoes_semente_e_tipo_novo_ganha_visao() {
        let c = banco();
        let nomes: Vec<String> = listar_visoes(&c).unwrap().into_iter().map(|v| v.nome).collect();
        assert_eq!(&nomes[..4], &["Todos os documentos", "Hoje", "Caixa de entrada", "Quadro de tasks"]);
        let t = criar_tipo(&c, &json!({"nome": "Reunião"})).unwrap();
        assert!(listar_visoes(&c).unwrap().iter().any(|v| v.nome == "Reunião" && v.filtro["tipos"] == json!([t])));
        apagar_tipo(&c, t).unwrap();
        assert!(!listar_visoes(&c).unwrap().iter().any(|v| v.nome == "Reunião"));
    }

    #[test]
    fn bancada_em_branco_fica_sem_tipos_de_trabalho() {
        let c = banco();
        limpar_sementes(&c).unwrap();
        let e = esquema(&c).unwrap();
        assert!(e["tipos"].as_array().unwrap().is_empty());
        assert_eq!(e["propriedades"].as_array().unwrap().len(), 1, "fica só o Status");
        let nomes: Vec<String> = listar_visoes(&c).unwrap().into_iter().map(|v| v.nome).collect();
        assert_eq!(nomes, ["Todos os documentos"]);
        // a fixa não sai nem filtra
        let fixa = listar_visoes(&c).unwrap()[0].id;
        assert!(apagar_visao(&c, fixa).is_err());
        atualizar_visao(&c, fixa, &json!({"filtro": {"tipos": [1]}, "layout": "lista"})).unwrap();
        let v = &listar_visoes(&c).unwrap()[0];
        assert_eq!((v.filtro.clone(), v.layout.as_str()), (json!({"historico": true}), "lista"));
        // e dá para começar o mundo do zero
        let t = criar_tipo(&c, &json!({"nome": "Personagem", "icone": "🧙"})).unwrap();
        let id = criar_item(&c, &json!({"titulo": "Elara", "tipo_id": t})).unwrap();
        assert_eq!(ler_item(&c, id).unwrap().props["1"], json!(null), "sem modelo, nasce sem status");
        assert!(limpar_sementes(&c).is_err(), "com documentos não mexe");
    }

    /// Migration fora de ordem passa num banco novo mas quebra um banco antigo (aconteceu em 2026-10-30).
    /// Cada migration tem um comentário "// N — " e eles têm de vir 1, 2, 3... na mesma ordem da lista.
    #[test]
    fn migrations_em_ordem() {
        let fonte = include_str!("db.rs");
        let inicio = fonte.find("const MIGRACOES").unwrap();
        let fim = inicio + fonte[inicio..].find("\n];").unwrap();
        let numeros: Vec<usize> = fonte[inicio..fim]
            .lines()
            .filter_map(|l| l.trim().strip_prefix("// ")?.split(" — ").next()?.parse().ok())
            .collect();
        assert_eq!(numeros, (1..=MIGRACOES.len()).collect::<Vec<_>>());
    }

    /// Um banco que parou numa versão antiga sobe sem erro até a última.
    #[test]
    fn banco_antigo_migra_ate_o_fim() {
        let c = Connection::open_in_memory().unwrap();
        for (i, sql) in MIGRACOES.iter().enumerate().take(5) {
            c.execute_batch(sql).unwrap();
            c.execute_batch(&format!("PRAGMA user_version = {}", i + 1)).unwrap();
        }
        migrar(&c).unwrap();
        let v: i64 = c.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
        assert_eq!(v as usize, MIGRACOES.len());
    }

    #[test]
    fn filtro_de_prazo() {
        let c = banco();
        criar_item(&c, &json!({"titulo": "vencida", "props": {"3": "2026-10-01"}, "modelo_id": null})).unwrap();
        criar_item(&c, &json!({"titulo": "semana que vem", "props": {"3": "2026-11-04"}, "modelo_id": null})).unwrap();
        criar_item(&c, &json!({"titulo": "sem prazo", "modelo_id": null})).unwrap();
        let tit = |datas| -> Vec<String> {
            let mut l: Vec<String> = listar_itens(&c, &Filtro { datas, ..Default::default() }).unwrap().into_iter().map(|i| i.titulo).collect();
            l.sort();
            l
        };
        assert_eq!(tit(vec![(3, Some((None, Some("2026-10-30".into()))))]), ["vencida"]);
        assert_eq!(tit(vec![(3, Some((Some("2026-10-30".into()), Some("2026-11-06".into()))))]), ["semana que vem"]);
        assert_eq!(tit(vec![(3, Some((None, Some("2026-11-06".into()))))]), ["semana que vem", "vencida"]);
        assert_eq!(tit(vec![(3, None)]), ["sem prazo"]);
        assert!(listar_visoes(&c).unwrap().iter().any(|v| v.nome == "Vence em breve"));
    }

    #[test]
    fn opcao_renomeada_acompanha_os_itens() {
        let c = banco();
        // tipo 1 (semente) tem Status 1 com lista própria ("A fazer", "Em andamento", "Feita"...)
        let a = criar_item(&c, &json!({"titulo": "a", "tipo_id": 1, "modelo_id": null, "props": {"1": "Em andamento"}})).unwrap();
        mudar_opcao(&c, Some(1), 1, "em andamento", &json!({"nome": "Fazendo", "cor": "orange"})).unwrap();
        assert_eq!(ler_item(&c, a).unwrap().props["1"], "Fazendo");
        let ops = esquema(&c).unwrap()["tipos"][0]["propriedades"][0]["opcoes"].clone();
        assert!(ops.as_array().unwrap().iter().any(|o| o["nome"] == "Fazendo" && o["cor"] == "orange"), "{ops}");
        assert!(mudar_opcao(&c, Some(1), 1, "Fazendo", &json!({"nome": "A fazer"})).is_err(), "nome repetido");
        mudar_opcao(&c, Some(1), 1, "Fazendo", &json!({"apagar": true})).unwrap();
        assert!(ler_item(&c, a).unwrap().props.get("1").is_none(), "opção apagada sai do documento");
        assert_eq!(itens_com_valor(&c, 1).unwrap(), 0);
    }

    #[test]
    fn mudar_opcoes_nao_tira_a_propriedade_do_lugar() {
        let c = banco();
        let ordem = |p: i64| -> i64 { c.query_row("SELECT ordem FROM tipo_propriedades WHERE tipo_id = 1 AND propriedade_id = ?", [p], |r| r.get(0)).unwrap() };
        let antes = ordem(1);
        tipo_por_propriedade(&c, 1, 1, &json!({ "opcoes": [{ "nome": "A fazer" }] })).unwrap();
        assert_eq!(ordem(1), antes);
        tipo_por_propriedade(&c, 1, 1, &json!({ "ordem": 99 })).unwrap();
        assert_eq!(ordem(1), 99);
    }

    #[test]
    fn pode_andar_agora() {
        let c = banco();
        let bloq = criar_propriedade(&c, &json!({"nome": "Bloqueado por", "especie": "relacao", "config": {"inverso": "Bloqueia"}})).unwrap();
        // tipo 1 (semente): Status 1 com "Feita" e "Cancelada" de histórico
        let novo = |t: &str| criar_item(&c, &json!({"titulo": t, "tipo_id": 1, "modelo_id": null, "props": {"1": "A fazer"}})).unwrap();
        let (a, b, solta) = (novo("A"), novo("B"), novo("solta"));
        ligar(&c, b, bloq, a, false, "Paulo").unwrap();
        let livres = || {
            let f = Filtro { tipos: vec![1], livres: vec![bloq], ..Default::default() };
            let mut l: Vec<String> = listar_itens(&c, &f).unwrap().into_iter().map(|i| i.titulo).collect();
            l.sort();
            l
        };
        assert!(!livres().contains(&"B".to_string()), "B espera A");
        assert!(livres().contains(&"solta".to_string()) && livres().contains(&"A".to_string()), "sem bloqueio pode andar");
        atualizar_item(&c, a, &json!({"props": {"1": "Feita"}})).unwrap();
        assert!(livres().contains(&"B".to_string()), "A feita: B pode andar");
        let _ = solta;
    }

    #[test]
    fn relacoes_sao_propriedades() {
        let c = banco();
        let pai = criar_propriedade(&c, &json!({"nome": "Pai", "especie": "relacao", "config": {"inverso": "Filhos", "um_so": true}})).unwrap();
        let bloq = criar_propriedade(&c, &json!({"nome": "Bloqueado por", "especie": "relacao", "config": {"inverso": "Bloqueia"}})).unwrap();
        let frente = criar_item(&c, &json!({"titulo": "Frente RM", "modelo_id": null})).unwrap();
        let cod = |id| ler_item(&c, id).unwrap().codigo;
        let a = criar_item(&c, &json!({"titulo": "Task A", "modelo_id": null, "props": {pai.to_string(): format!("#{}", cod(frente))}})).unwrap();
        let b = criar_item(&c, &json!({"titulo": "Task B", "modelo_id": null})).unwrap();
        assert_eq!(ler_item(&c, a).unwrap().props[pai.to_string()], json!([cod(frente)]), "nasce ligado, valor = lista de códigos");

        ligar(&c, b, bloq, a, false, "Claude").unwrap();
        ligar(&c, b, bloq, a, false, "Claude").unwrap(); // repetida: nada novo
        assert!(ligar(&c, a, bloq, a, false, "Paulo").is_err(), "não aponta para si");
        assert!(ligar(&c, a, 2, b, false, "Paulo").is_err(), "Prioridade não é relação");

        // do lado de quem é apontado, lê pelo rótulo inverso
        let refs = ler_item(&c, frente).unwrap().referencias.unwrap();
        assert_eq!(refs[0]["rotulo"], "Filhos");
        assert_eq!(ler_item(&c, a).unwrap().referencias.unwrap()[0]["rotulo"], "Bloqueia");
        assert_eq!(ler_item(&c, b).unwrap().relacionados.unwrap()[0]["titulo"], "Task A");
        let notas_a: Vec<String> = ler_item(&c, a).unwrap().notas.unwrap().into_iter().map(|n| n.texto).collect();
        assert_eq!(notas_a.iter().filter(|n| n.starts_with("Ligado: Bloqueia")).count(), 1, "{notas_a:?}");

        // um só: ligar outro troca
        ligar(&c, a, pai, b, false, "Paulo").unwrap();
        assert_eq!(ler_item(&c, a).unwrap().props[pai.to_string()], json!([cod(b)]));
        assert!(ler_item(&c, frente).unwrap().referencias.unwrap().as_array().unwrap().is_empty());

        // a árvore: filhos de b ("apontado" em Pai) e quem bloqueia b ("aponta" em Bloqueado por)
        let titulos = |l: Vec<Item>| l.into_iter().map(|i| i.titulo).collect::<Vec<_>>();
        assert_eq!(titulos(ramo(&c, b, pai, "apontado").unwrap()), ["Task A"]);
        assert_eq!(titulos(ramo(&c, b, bloq, "aponta").unwrap()), ["Task A"]);
        assert!(ramo(&c, a, bloq, "aponta").unwrap().is_empty());

        // filtro: contém (valor) e preenchida/vazia
        let f = Filtro { props: vec![(bloq, vec![cod(a)])], ..Default::default() };
        assert_eq!(titulos(listar_itens(&c, &f).unwrap()), ["Task B"]);
        let preenchida = Filtro { datas: vec![(bloq, Some((None, None)))], ..Default::default() };
        assert_eq!(titulos(listar_itens(&c, &preenchida).unwrap()), ["Task B"]);
        ligar(&c, b, bloq, a, true, "Paulo").unwrap();
        assert!(listar_itens(&c, &preenchida).unwrap().is_empty(), "lista esvaziada conta como vazia");

        // menção #código no texto aparece como "mencionado em"; nota automática de mudança não conta
        atualizar_item(&c, frente, &json!({"corpo": format!("depende de #{}", cod(b))})).unwrap();
        let men = ler_item(&c, b).unwrap().mencionado_em.unwrap();
        assert_eq!(men.as_array().unwrap().len(), 1);
        assert_eq!(men[0]["titulo"], "Frente RM");
    }

    #[test]
    fn relacoes_antigas_viram_propriedades() {
        let c = Connection::open_in_memory().unwrap();
        for (i, sql) in MIGRACOES.iter().enumerate().take(9) {
            c.execute_batch(sql).unwrap();
            c.execute_batch(&format!("PRAGMA user_version = {}", i + 1)).unwrap();
        }
        c.execute_batch(
            "INSERT INTO itens (id, codigo, titulo, tipo_id, props, criado_em, atualizado_em) VALUES
               (1, 'aaaaaaa', 'Frente', NULL, '{}', 'x', 'x'),
               (2, 'bbbbbbb', 'Filha', 1, '{\"2\":\"Alta\",\"9\":true}', 'x', 'x'),
               (3, 'ccccccc', 'Outra', NULL, '{}', 'x', 'x');
             INSERT INTO relacoes (de_id, para_id, tipo, criado_em) VALUES (2, 1, 'pai', 'x'), (2, 3, 'bloqueia', 'x'), (3, 1, 'bloqueia', 'x');",
        )
        .unwrap();
        migrar(&c).unwrap();
        let pai = prop_por_nome_ou_id(&c, &json!("Pai")).unwrap();
        let bloq = prop_por_nome_ou_id(&c, &json!("Bloqueia")).unwrap();
        assert!(prop_por_nome_ou_id(&c, &json!("Absorvido por")).is_err(), "só cria o que estava em uso");
        let filha = ler_item(&c, 2).unwrap();
        assert_eq!(filha.props[pai.to_string()], json!(["aaaaaaa"]));
        assert_eq!(filha.props[bloq.to_string()], json!(["ccccccc"]));
        assert_eq!(filha.props["2"], "Alta", "o resto das propriedades fica igual");
        assert_eq!(filha.props["9"], true);
        assert_eq!(ler_item(&c, 3).unwrap().props[bloq.to_string()], json!(["aaaaaaa"]));
        assert_eq!(ler_item(&c, 1).unwrap().referencias.unwrap().as_array().unwrap().len(), 2);
        let tipo1 = esquema(&c).unwrap()["tipos"][0]["propriedades"].as_array().unwrap().iter().any(|p| p["propriedade_id"] == pai);
        assert!(tipo1, "a propriedade entra no tipo de quem usava");
    }

    #[test]
    fn lixeira_e_versoes() {
        let c = banco();
        let id = criar_item(&c, &json!({"titulo": "x", "corpo": "v1", "modelo_id": null})).unwrap();
        atualizar_item(&c, id, &json!({"corpo": "v2", "autor": "Paulo"})).unwrap();
        atualizar_item(&c, id, &json!({"corpo": "v3", "autor": "Paulo"})).unwrap(); // mesma sessão: sem versão nova
        let vs = versoes(&c, "item", id).unwrap();
        assert_eq!(vs.len(), 1);
        assert_eq!(vs[0]["conteudo"], "v1");
        restaurar_versao(&c, vs[0]["id"].as_i64().unwrap(), "Paulo").unwrap();
        assert_eq!(ler_item(&c, id).unwrap().corpo.unwrap(), "v1");
        assert!(versoes(&c, "item", id).unwrap().iter().any(|v| v["conteudo"] == "v3"), "o texto de antes da restauração não se perde");

        let nid = anotar(&c, id, "primeira", "Paulo").unwrap();
        editar_nota(&c, nid, "corrigida", "Paulo").unwrap();
        assert_eq!(versoes(&c, "nota", nid).unwrap()[0]["conteudo"], "primeira");
        apagar_nota(&c, nid).unwrap();
        assert!(!ler_item(&c, id).unwrap().notas.unwrap().iter().any(|n| n.id == nid));
        restaurar_nota(&c, nid).unwrap();
        assert!(ler_item(&c, id).unwrap().notas.unwrap().iter().any(|n| n.id == nid));

        apagar_item(&c, id, "Paulo").unwrap();
        assert!(listar_itens(&c, &Filtro::default()).unwrap().is_empty(), "documento na lixeira some das listas");
        assert!(ler_item(&c, id).unwrap().apagado_em.is_some());
        assert_eq!(lixeira(&c).unwrap()["itens"].as_array().unwrap().len(), 1);
        restaurar_item(&c, id, "Paulo").unwrap();
        assert_eq!(listar_itens(&c, &Filtro::default()).unwrap().len(), 1);
        assert!(apagar_de_vez(&c, id).is_err(), "só apaga de vez o que está na lixeira");
        apagar_item(&c, id, "Paulo").unwrap();
        assert_eq!(esvaziar_lixeira(&c).unwrap().0, 1);
        assert!(ler_item(&c, id).is_err());
    }

    #[test]
    fn tipos_de_propriedade() {
        let c = banco();
        let prop = |nome: &str, especie: &str, config: Value| criar_propriedade(&c, &json!({"nome": nome, "especie": especie, "config": config})).unwrap().to_string();
        let inteiro = prop("Pontos", "numero", json!({"inteiro": true}));
        let preco = prop("Preço", "numero", json!({"casas": 2}));
        let notas = prop("Notas", "numero", json!({"lista": true}));
        let reuniao = prop("Reunião", "data", json!({"hora": true}));
        let datas = prop("Entregas", "data", json!({"lista": true}));
        let email = prop("Contato", "email", json!({}));
        let criado = prop("Criado", "criado_em", json!({}));
        let id = criar_item(&c, &json!({"titulo": "x", "modelo_id": null})).unwrap();
        atualizar_item(&c, id, &json!({"props": {
            &inteiro: "3", &preco: "10,456", &notas: [7, "8,5", ""], &reuniao: "2026-11-03 14:30", &datas: ["2026-11-01", "2026-12-01"], &email: "a@b.com"
        }})).unwrap();
        let p = ler_item(&c, id).unwrap().props;
        assert_eq!(p[&inteiro], json!(3));
        assert_eq!(p[&preco], json!(10.46));
        assert_eq!(p[&notas], json!([7.0, 8.5]));
        assert_eq!(p[&reuniao], json!("2026-11-03T14:30"));
        assert_eq!(p[&datas], json!(["2026-11-01", "2026-12-01"]));
        assert!(atualizar_item(&c, id, &json!({"props": {&inteiro: 2.5}})).is_err(), "inteiro não aceita fração");
        assert!(atualizar_item(&c, id, &json!({"props": {&reuniao: "amanhã"}})).is_err());
        assert!(atualizar_item(&c, id, &json!({"props": {&email: "sem arroba"}})).is_err());
        assert!(atualizar_item(&c, id, &json!({"props": {&criado: "2020-01-01"}})).is_err(), "automática não se escreve");
    }

    #[test]
    fn links_por_ferramenta() {
        let c = banco();
        let p = criar_propriedade(&c, &json!({"nome": "Links", "especie": "links"})).unwrap();
        let id = criar_item(&c, &json!({"titulo": "x", "modelo_id": null})).unwrap();
        atualizar_item(&c, id, &json!({"props": {p.to_string(): ["https://dev.azure.com/empresa/_workitems/1", {"url": " https://github.com/x ", "rotulo": "PR"}, {"url": ""}]}})).unwrap();
        let it = ler_item(&c, id).unwrap();
        assert_eq!(it.props[p.to_string()], json!([{"url": "https://dev.azure.com/empresa/_workitems/1"}, {"url": "https://github.com/x", "rotulo": "PR"}]));
        let notas: Vec<String> = it.notas.unwrap().into_iter().map(|n| n.texto).collect();
        assert!(notas.iter().any(|n| n == "Links: — → https://dev.azure.com/empresa/_workitems/1, PR"), "{notas:?}");
        assert!(atualizar_item(&c, id, &json!({"props": {p.to_string(): [3]}})).is_err());
    }

    #[test]
    fn busca_acha_nas_notas_sem_acento() {
        let c = banco();
        let a = criar_item(&c, &json!({"titulo": "Revisar contrato", "modelo_id": null})).unwrap();
        criar_item(&c, &json!({"titulo": "Outra coisa", "corpo": "nada a ver", "modelo_id": null})).unwrap();
        let nid = anotar(&c, a, "Falei com a gerência sobre a pendência do NAT", "Paulo").unwrap();
        let achar = |q: &str| listar_itens(&c, &Filtro { texto: Some(q.into()), ..Default::default() }).unwrap().into_iter().map(|i| i.titulo).collect::<Vec<_>>();
        assert_eq!(achar("pendencia gerencia"), ["Revisar contrato"], "nota, sem acento, as duas palavras");
        assert_eq!(achar("pend"), ["Revisar contrato"], "prefixo");
        assert_eq!(achar("ontrat"), ["Revisar contrato"], "pedaço no meio do título ainda acha");
        assert_eq!(achar("pendencia contrato"), ["Revisar contrato"], "uma palavra na nota e outra no título");
        editar_nota(&c, nid, "Assunto encerrado", "Paulo").unwrap();
        assert!(achar("pendencia").is_empty(), "nota editada sai do índice");
        apagar_nota(&c, nid).unwrap();
        assert!(achar("encerrado").is_empty(), "nota na lixeira não conta");
        atualizar_item(&c, a, &json!({"corpo": "cláusula de reajuste"})).unwrap();
        assert_eq!(achar("clausula"), ["Revisar contrato"]);
    }

    #[test]
    fn multisselecao_filtra_por_um_dos_valores() {
        let c = banco();
        criar_item(&c, &json!({"titulo": "a", "props": {"5": ["aws", "eks"]}})).unwrap();
        criar_item(&c, &json!({"titulo": "b", "props": {"5": ["snowflake"]}})).unwrap();
        let r = listar_itens(&c, &Filtro { props: vec![(5, vec!["eks".into()])], ..Default::default() }).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].titulo, "a");
    }

    #[test]
    fn apagar_propriedade_limpa_os_itens() {
        let c = banco();
        let id = criar_item(&c, &json!({"titulo": "x", "props": {"6": "F1", "2": "Alta"}})).unwrap();
        apagar_propriedade(&c, 6).unwrap();
        let it = ler_item(&c, id).unwrap();
        assert!(it.props.get("6").is_none());
        assert_eq!(it.props["2"], "Alta");
    }

    /// Trocar um pedaço do texto: só onde o trecho é único (ou com `todas`), nada gravado se uma troca falha, e a
    /// linha do tempo diz o que mudou.
    #[test]
    fn editar_trecho_troca_so_o_pedaco() {
        let c = Connection::open_in_memory().unwrap();
        migrar(&c).unwrap();
        let id = criar_item(&c, &json!({"titulo": "Etapas", "corpo": "- ⬜ **3.7** aplicar
- ⬜ **3.8** conexão
- ⬜ fim"})).unwrap();
        let nota = editar_trecho(&c, id, &[("- ⬜ **3.8**".into(), "- ✅ **3.8**".into(), false)], "Claude").unwrap();
        assert_eq!(nota, "Texto: ⬜ → ✅");
        assert!(ler_item(&c, id).unwrap().corpo.unwrap_or_default().contains("- ✅ **3.8** conexão"));
        // repetido sem `todas`: recusa; e uma troca ruim no meio não grava a boa
        assert!(editar_trecho(&c, id, &[("- ⬜".into(), "x".into(), false)], "Claude").is_err());
        assert!(editar_trecho(&c, id, &[("**3.7**".into(), "**3.7b**".into(), false), ("não existe".into(), "y".into(), false)], "Claude").is_err());
        assert!(!ler_item(&c, id).unwrap().corpo.unwrap_or_default().contains("3.7b"));
        editar_trecho(&c, id, &[("- ⬜".into(), "- ✅".into(), true)], "Claude").unwrap();
        assert!(!ler_item(&c, id).unwrap().corpo.unwrap_or_default().contains('⬜'));
        let notas: Vec<String> = c.prepare("SELECT texto FROM notas WHERE item_id = ? ORDER BY id").unwrap()
            .query_map([id], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect();
        assert!(notas.iter().any(|n| n == "Texto: ⬜ → ✅"));
        assert!(!notas.iter().any(|n| n == TEXTO_EDITADO));
        // palavra que entra vem com a vizinha, para dar para ler
        assert_eq!(diferenca_curta("Texto antes.", "Texto de antes."), "Texto → Texto de");
    }

    /// Lista dinâmica: só os tipos pedidos, ligados pela relação a este, na ordem numérica (1.5 antes de 10); não se
    /// escreve nela; e a relação diz se aparece do outro lado.
    #[test]
    fn lista_dinamica_filtra_e_ordena() {
        let c = banco();
        let passo = criar_tipo(&c, &json!({"nome": "Passo"})).unwrap();
        let pai = criar_propriedade(&c, &json!({"nome": "Pai", "especie": "relacao", "config": {"inverso": "Filhos", "um_so": true, "outro_lado": false}})).unwrap();
        let ordem = criar_propriedade(&c, &json!({"nome": "Ordem", "especie": "numero"})).unwrap();
        let passos = criar_propriedade(&c, &json!({"nome": "Passos", "especie": "lista", "config": {"tipos": [passo], "relacao": pai, "ordenar": ordem}})).unwrap();
        tipo_por_propriedade(&c, 1, passos, &json!({})).unwrap();
        let task = criar_item(&c, &json!({"titulo": "Task", "tipo_id": 1})).unwrap();
        let cod = ler_item(&c, task).unwrap().codigo;
        for (t, o) in [("dez", "10"), ("um e meio", "1.5"), ("um", "1")] {
            criar_item(&c, &json!({"titulo": t, "tipo_id": passo, "props": {pai.to_string(): [cod.clone()], ordem.to_string(): o}})).unwrap();
        }
        // de outro tipo, também filho: não entra
        criar_item(&c, &json!({"titulo": "nota solta", "tipo_id": 1, "props": {pai.to_string(): [cod.clone()]}})).unwrap();
        let it = ler_item(&c, task).unwrap();
        let lista = it.listas.unwrap()[passos.to_string()].as_array().unwrap().iter().map(|x| x["titulo"].as_str().unwrap().to_string()).collect::<Vec<_>>();
        assert_eq!(lista, ["um", "um e meio", "dez"]);
        // escrever na lista é recusado
        assert!(atualizar_item(&c, task, &json!({"props": {passos.to_string(): ["x"]}})).is_err());
        // o lado de lá diz que não aparece
        assert_eq!(it.referencias.unwrap().as_array().unwrap().iter().filter(|r| r["outro_lado"] == false).count(), 4);
    }

    /// Mede (não roda no CI): 20 mil documentos, cada um filho de um de 200 pais; quanto custa ler um pai (lado de lá
    /// da relação + lista dinâmica). `cargo test --lib volume -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn volume_relacoes() {
        let c = banco();
        let pai = criar_propriedade(&c, &json!({"nome": "Pai", "especie": "relacao", "config": {"um_so": true}})).unwrap();
        let filhos = criar_propriedade(&c, &json!({"nome": "Filhos", "especie": "lista", "config": {"relacao": pai}})).unwrap();
        tipo_por_propriedade(&c, 1, filhos, &json!({})).unwrap();
        let mut pais = vec![];
        for i in 0..200 {
            let id = criar_item(&c, &json!({"titulo": format!("pai {i}"), "tipo_id": 1})).unwrap();
            pais.push((id, ler_item(&c, id).unwrap().codigo));
        }
        for i in 0..20_000 {
            let cod = &pais[i % 200].1;
            criar_item(&c, &json!({"titulo": format!("filho {i}"), "tipo_id": 1, "props": {pai.to_string(): [cod]}})).unwrap();
        }
        let t = std::time::Instant::now();
        for (id, _) in pais.iter().take(20) {
            let it = ler_item(&c, *id).unwrap();
            assert_eq!(it.listas.unwrap()[filhos.to_string()].as_array().unwrap().len(), 100);
        }
        println!("ler um pai com 100 filhos, em 20 200 documentos: {:?} por leitura", t.elapsed() / 20);
        let (id, cod) = &pais[0];
        let t = std::time::Instant::now();
        for _ in 0..20 { referencias_do_item(&c, *id).unwrap(); }
        println!("  referencias_do_item: {:?}", t.elapsed() / 20);
        let t = std::time::Instant::now();
        for _ in 0..20 { lista_dinamica(&c, cod, &json!({"relacao": pai})).unwrap(); }
        println!("  lista_dinamica: {:?}", t.elapsed() / 20);
    }
}
