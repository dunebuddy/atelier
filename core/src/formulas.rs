//! Fórmulas (espécie "formula"): um valor calculado de outras propriedades do documento, na hora de ler (não é
//! guardado). A expressão (`config.expressao`) usa:
//! - `{Nome}`: o valor da propriedade (número, texto; uma lista dinâmica ou uma relação vira lista);
//! - números, textos entre aspas, `+ - * /` e parênteses; `+` com texto junta os textos;
//! - funções: `conta(lista)`, `soma(lista, "Prop")`, `media(lista, "Prop")`, `min(...)`, `max(...)`,
//!   `arred(x, casas)`, `se(condição, então, senão)` com `= <> < > <= >=` na condição.
//!
//! Ex.: `{Horas} * {Valor da hora}`, `{Título} + " (" + {Status} + ")"`, `conta({Passos})`,
//! `soma({Passos}, "Horas")`, `se({Horas} > 8, "longo", "curto")`.

use crate::db::{self, Item, Res};
use rusqlite::Connection;
use serde_json::{json, Value};

#[derive(Clone, Debug, PartialEq)]
enum V {
    Num(f64),
    Txt(String),
    Lista(Vec<Value>),
    Nada,
}

impl V {
    fn num(&self) -> Option<f64> {
        match self {
            V::Num(n) => Some(*n),
            V::Txt(t) => t.trim().replace(',', ".").parse().ok(),
            _ => None,
        }
    }
    fn texto(&self) -> String {
        match self {
            V::Num(n) => if n.fract() == 0.0 && n.abs() < 1e15 { format!("{}", *n as i64) } else { format!("{n}") },
            V::Txt(t) => t.clone(),
            V::Lista(l) => l.iter().map(|x| x["titulo"].as_str().map(String::from).unwrap_or_else(|| x.as_str().map(String::from).unwrap_or_default())).collect::<Vec<_>>().join(", "),
            V::Nada => String::new(),
        }
    }
    fn json(&self) -> Value {
        match self {
            V::Num(n) => json!((n * 1e9).round() / 1e9),
            V::Txt(t) => json!(t),
            V::Lista(l) => json!(l.len()),
            V::Nada => Value::Null,
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
enum T {
    Num(f64),
    Txt(String),
    Ref(String),
    Nome(String),
    Op(String),
    Abre,
    Fecha,
    Virgula,
}

fn tokens(e: &str) -> Result<Vec<T>, String> {
    let c: Vec<char> = e.chars().collect();
    let mut v = vec![];
    let mut i = 0;
    while i < c.len() {
        let ch = c[i];
        match ch {
            ' ' | '\t' | '\n' | '\r' => i += 1,
            '(' => { v.push(T::Abre); i += 1; }
            ')' => { v.push(T::Fecha); i += 1; }
            ',' | ';' => { v.push(T::Virgula); i += 1; }
            '{' => {
                let fim = c[i..].iter().position(|&x| x == '}').ok_or("falta fechar a chave }")? + i;
                v.push(T::Ref(c[i + 1..fim].iter().collect::<String>().trim().to_string()));
                i = fim + 1;
            }
            '"' | '\'' => {
                let fim = c[i + 1..].iter().position(|&x| x == ch).ok_or("falta fechar as aspas")? + i + 1;
                v.push(T::Txt(c[i + 1..fim].iter().collect()));
                i = fim + 1;
            }
            '+' | '-' | '*' | '/' | '&' => { v.push(T::Op(ch.to_string())); i += 1; }
            '<' | '>' | '=' | '!' => {
                let dois: String = c[i..(i + 2).min(c.len())].iter().collect();
                if ["<=", ">=", "<>", "!=", "=="].contains(&dois.as_str()) {
                    v.push(T::Op(if dois == "!=" { "<>".into() } else if dois == "==" { "=".into() } else { dois }));
                    i += 2;
                } else {
                    v.push(T::Op(ch.to_string()));
                    i += 1;
                }
            }
            d if d.is_ascii_digit() || d == '.' => {
                let ini = i;
                while i < c.len() && (c[i].is_ascii_digit() || c[i] == '.') {
                    i += 1;
                }
                v.push(T::Num(c[ini..i].iter().collect::<String>().parse().map_err(|_| "número inválido")?));
            }
            l if l.is_alphabetic() || l == '_' => {
                let ini = i;
                while i < c.len() && (c[i].is_alphanumeric() || c[i] == '_') {
                    i += 1;
                }
                v.push(T::Nome(c[ini..i].iter().collect::<String>().to_lowercase()));
            }
            outro => return Err(format!("não entendi o caractere {outro:?}")),
        }
    }
    Ok(v)
}

/// O que a fórmula enxerga de um documento: o valor de uma propriedade pelo nome.
struct Ambiente<'a> {
    conn: &'a Connection,
    item: &'a Item,
    /// nome (minúsculo) → (id, espécie, config)
    props: Vec<(String, i64, String, Value)>,
    profundidade: u8,
}

impl Ambiente<'_> {
    fn valor(&self, nome: &str) -> Result<V, String> {
        let n = nome.to_lowercase();
        match n.as_str() {
            "título" | "titulo" => return Ok(V::Txt(self.item.titulo.clone())),
            "código" | "codigo" => return Ok(V::Txt(self.item.codigo.clone())),
            _ => {}
        }
        let (id, especie, config) = self.props.iter().find(|p| p.0 == n).map(|p| (p.1, p.2.clone(), p.3.clone())).ok_or_else(|| format!("não há propriedade {{{nome}}}"))?;
        match especie.as_str() {
            "lista" => Ok(V::Lista(db::lista_dinamica(self.conn, &self.item.codigo, &config).map_err(|e| e.to_string())?.into_iter().map(|i| json!(i)).collect())),
            "formula" if self.profundidade < 4 => {
                let e = config.get("expressao").and_then(|x| x.as_str()).unwrap_or("");
                avaliar_em(&Ambiente { conn: self.conn, item: self.item, props: self.props.clone(), profundidade: self.profundidade + 1 }, e)
            }
            _ => Ok(match self.item.props.get(id.to_string()) {
                None | Some(Value::Null) => V::Nada,
                Some(Value::Number(x)) => V::Num(x.as_f64().unwrap_or(0.0)),
                Some(Value::Bool(b)) => V::Num(if *b { 1.0 } else { 0.0 }),
                Some(Value::String(s)) => s.trim().replace(',', ".").parse::<f64>().ok().filter(|_| especie == "numero").map(V::Num).unwrap_or(V::Txt(s.clone())),
                Some(Value::Array(l)) => V::Lista(l.clone()),
                Some(outro) => V::Txt(outro.to_string()),
            }),
        }
    }
}

struct Leitor<'a, 'b> {
    t: Vec<T>,
    i: usize,
    amb: &'a Ambiente<'b>,
}

impl Leitor<'_, '_> {
    fn ver(&self) -> Option<&T> {
        self.t.get(self.i)
    }
    fn op(&self) -> Option<String> {
        match self.ver() {
            Some(T::Op(o)) => Some(o.clone()),
            _ => None,
        }
    }
    fn comparacao(&mut self) -> Result<V, String> {
        let a = self.soma()?;
        if let Some(o) = self.op().filter(|o| ["=", "<>", "<", ">", "<=", ">="].contains(&o.as_str())) {
            self.i += 1;
            let b = self.soma()?;
            let r = match (a.num(), b.num()) {
                (Some(x), Some(y)) => match o.as_str() { "=" => x == y, "<>" => x != y, "<" => x < y, ">" => x > y, "<=" => x <= y, _ => x >= y },
                _ => {
                    let (x, y) = (a.texto().to_lowercase(), b.texto().to_lowercase());
                    match o.as_str() { "=" => x == y, "<>" => x != y, "<" => x < y, ">" => x > y, "<=" => x <= y, _ => x >= y }
                }
            };
            return Ok(V::Num(if r { 1.0 } else { 0.0 }));
        }
        Ok(a)
    }
    fn soma(&mut self) -> Result<V, String> {
        let mut a = self.termo()?;
        while let Some(o) = self.op().filter(|o| o == "+" || o == "-" || o == "&") {
            self.i += 1;
            let b = self.termo()?;
            a = match (o.as_str(), a.num(), b.num(), &a, &b) {
                ("&", ..) => V::Txt(a.texto() + &b.texto()),
                ("+", Some(x), Some(y), V::Num(_) | V::Nada, V::Num(_) | V::Nada) => V::Num(x + y),
                ("+", Some(x), Some(y), _, _) if !matches!(a, V::Txt(_)) && !matches!(b, V::Txt(_)) => V::Num(x + y),
                ("+", ..) => V::Txt(a.texto() + &b.texto()),
                (_, x, y, ..) => V::Num(x.unwrap_or(0.0) - y.unwrap_or(0.0)),
            };
        }
        Ok(a)
    }
    fn termo(&mut self) -> Result<V, String> {
        let mut a = self.fator()?;
        while let Some(o) = self.op().filter(|o| o == "*" || o == "/") {
            self.i += 1;
            let b = self.fator()?;
            let (x, y) = (a.num().unwrap_or(0.0), b.num().unwrap_or(0.0));
            a = if o == "*" { V::Num(x * y) } else if y == 0.0 { V::Nada } else { V::Num(x / y) };
        }
        Ok(a)
    }
    fn fator(&mut self) -> Result<V, String> {
        let t = self.ver().cloned().ok_or("a fórmula acabou no meio")?;
        self.i += 1;
        match t {
            T::Num(n) => Ok(V::Num(n)),
            T::Txt(s) => Ok(V::Txt(s)),
            T::Ref(nome) => self.amb.valor(&nome),
            T::Op(o) if o == "-" => Ok(V::Num(-self.fator()?.num().unwrap_or(0.0))),
            T::Abre => {
                let v = self.comparacao()?;
                if self.ver() != Some(&T::Fecha) {
                    return Err("falta fechar o parêntese".into());
                }
                self.i += 1;
                Ok(v)
            }
            T::Nome(f) => {
                if self.ver() != Some(&T::Abre) {
                    return Err(format!("{f}: faltam os parênteses (ex.: {f}(...))"));
                }
                self.i += 1;
                let mut args = vec![];
                if self.ver() != Some(&T::Fecha) {
                    loop {
                        args.push(self.comparacao()?);
                        match self.ver() {
                            Some(T::Virgula) => self.i += 1,
                            Some(T::Fecha) => break,
                            _ => return Err(format!("{f}: separe os argumentos com vírgula")),
                        }
                    }
                }
                self.i += 1;
                funcao(&f, args)
            }
            outro => Err(format!("não esperava {outro:?} aqui")),
        }
    }
}

/// Os números de uma lista: de documentos (pela propriedade pedida) ou de valores soltos.
fn numeros(l: &[Value], prop: Option<&str>, amb_props: &[(String, i64, String, Value)]) -> Vec<f64> {
    let pid = prop.and_then(|p| amb_props.iter().find(|x| x.0 == p.to_lowercase()).map(|x| x.1));
    l.iter()
        .filter_map(|x| {
            let v = match pid {
                Some(id) => x["props"].get(id.to_string()).cloned().unwrap_or(Value::Null),
                None => x.clone(),
            };
            v.as_f64().or_else(|| v.as_str().and_then(|s| s.trim().replace(',', ".").parse().ok()))
        })
        .collect()
}

thread_local! {
    static PROPS: std::cell::RefCell<Vec<(String, i64, String, Value)>> = const { std::cell::RefCell::new(vec![]) };
}

fn funcao(f: &str, a: Vec<V>) -> Result<V, String> {
    let lista = |i: usize| match a.get(i) {
        Some(V::Lista(l)) => Ok(l.clone()),
        Some(V::Nada) | None => Ok(vec![]),
        Some(_) => Err(format!("{f}: o primeiro argumento tem de ser uma lista (ex.: {{Passos}})")),
    };
    let prop = a.get(1).map(|v| v.texto());
    let nums = |l: &[Value]| PROPS.with(|p| numeros(l, prop.as_deref(), &p.borrow()));
    Ok(match f {
        "conta" => V::Num(lista(0)?.len() as f64),
        "soma" => V::Num(nums(&lista(0)?).iter().sum()),
        "media" | "média" => {
            let n = nums(&lista(0)?);
            if n.is_empty() { V::Nada } else { V::Num(n.iter().sum::<f64>() / n.len() as f64) }
        }
        "min" | "max" => {
            let n: Vec<f64> = if matches!(a.first(), Some(V::Lista(_))) { nums(&lista(0)?) } else { a.iter().filter_map(|x| x.num()).collect() };
            let r = if f == "min" { n.iter().cloned().fold(f64::INFINITY, f64::min) } else { n.iter().cloned().fold(f64::NEG_INFINITY, f64::max) };
            if r.is_finite() { V::Num(r) } else { V::Nada }
        }
        "arred" => {
            let casas = a.get(1).and_then(|x| x.num()).unwrap_or(0.0).clamp(0.0, 10.0) as i32;
            let m = 10f64.powi(casas);
            a.first().and_then(|x| x.num()).map(|x| V::Num((x * m).round() / m)).unwrap_or(V::Nada)
        }
        "se" => {
            let cond = a.first().map(|x| x.num().map(|n| n != 0.0).unwrap_or(!x.texto().is_empty())).unwrap_or(false);
            a.get(if cond { 1 } else { 2 }).cloned().unwrap_or(V::Nada)
        }
        outro => return Err(format!("função desconhecida: {outro} (use conta, soma, media, min, max, arred, se)")),
    })
}

fn avaliar_em(amb: &Ambiente, expressao: &str) -> Result<V, String> {
    let t = tokens(expressao)?;
    if t.is_empty() {
        return Ok(V::Nada);
    }
    PROPS.with(|p| *p.borrow_mut() = amb.props.clone());
    let mut l = Leitor { t, i: 0, amb };
    let v = l.comparacao()?;
    if l.i < l.t.len() {
        return Err("sobrou coisa no fim da fórmula".into());
    }
    Ok(v)
}

/// As propriedades (nome → id, espécie, config) para as fórmulas.
fn props_da_bancada(conn: &Connection) -> Res<Vec<(String, i64, String, Value)>> {
    Ok(conn
        .prepare("SELECT id, nome, especie, config FROM propriedades")?
        .query_map([], |r| Ok((r.get::<_, String>(1)?.to_lowercase(), r.get(0)?, r.get(2)?, serde_json::from_str(&r.get::<_, Option<String>>(3)?.unwrap_or_default()).unwrap_or(Value::Null))))?
        .collect::<Result<_, _>>()?)
}

/// Põe nos documentos os valores das fórmulas dos tipos deles (calculados; com erro, o valor é "erro: ...").
pub fn calcular(conn: &Connection, itens: &mut [Item]) -> Res<()> {
    let formulas: Vec<(i64, i64, String)> = conn
        .prepare("SELECT tp.tipo_id, p.id, COALESCE(json_extract(p.config, '$.expressao'), '') FROM propriedades p JOIN tipo_propriedades tp ON tp.propriedade_id = p.id WHERE p.especie = 'formula'")?
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
        .collect::<Result<_, _>>()?;
    if formulas.is_empty() {
        return Ok(());
    }
    let props = props_da_bancada(conn)?;
    for it in itens.iter_mut() {
        let minhas: Vec<&(i64, i64, String)> = formulas.iter().filter(|f| Some(f.0) == it.tipo_id).collect();
        if minhas.is_empty() {
            continue;
        }
        let mut valores = vec![];
        {
            let amb = Ambiente { conn, item: it, props: props.clone(), profundidade: 0 };
            for (_, pid, expr) in minhas {
                let v = match avaliar_em(&amb, expr) {
                    Ok(v) => v.json(),
                    Err(e) => json!(format!("erro: {e}")),
                };
                valores.push((*pid, v));
            }
        }
        if let Value::Object(m) = &mut it.props {
            for (pid, v) in valores {
                m.insert(pid.to_string(), v);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn formulas_contas_textos_e_listas() {
        let c = db::abrir_em_memoria();
        let horas = db::criar_propriedade(&c, &json!({"nome": "Horas", "especie": "numero"})).unwrap();
        let valor = db::criar_propriedade(&c, &json!({"nome": "Valor", "especie": "numero"})).unwrap();
        let pai = db::criar_propriedade(&c, &json!({"nome": "Pai", "especie": "relacao", "config": {"um_so": true}})).unwrap();
        let filhos = db::criar_propriedade(&c, &json!({"nome": "Filhos", "especie": "lista", "config": {"relacao": pai}})).unwrap();
        let total = db::criar_propriedade(&c, &json!({"nome": "Total", "especie": "formula", "config": {"expressao": "{Horas} * {Valor}"}})).unwrap();
        let rotulo = db::criar_propriedade(&c, &json!({"nome": "Rótulo", "especie": "formula", "config": {"expressao": "{Título} + \" (\" + conta({Filhos}) + \" filhos)\""}})).unwrap();
        let soma = db::criar_propriedade(&c, &json!({"nome": "Horas dos filhos", "especie": "formula", "config": {"expressao": "soma({Filhos}, \"Horas\")"}})).unwrap();
        let ruim = db::criar_propriedade(&c, &json!({"nome": "Ruim", "especie": "formula", "config": {"expressao": "{Não existe} + 1"}})).unwrap();
        for p in [horas, valor, filhos, total, rotulo, soma, ruim] {
            db::tipo_por_propriedade(&c, 1, p, &json!({})).unwrap();
        }
        let id = db::criar_item(&c, &json!({"titulo": "Pai", "tipo_id": 1, "props": {horas.to_string(): 2.5, valor.to_string(): 100}})).unwrap();
        let cod = db::ler_item(&c, id).unwrap().codigo;
        for h in [3, 4] {
            db::criar_item(&c, &json!({"titulo": "f", "tipo_id": 1, "props": {pai.to_string(): [cod.clone()], horas.to_string(): h}})).unwrap();
        }
        let it = db::ler_item(&c, id).unwrap();
        assert_eq!(it.props[total.to_string()], json!(250.0));
        assert_eq!(it.props[rotulo.to_string()], "Pai (2 filhos)");
        assert_eq!(it.props[soma.to_string()], json!(7.0));
        assert!(it.props[ruim.to_string()].as_str().unwrap().starts_with("erro: não há propriedade"));
        // escrever numa fórmula é recusado
        assert!(db::atualizar_item(&c, id, &json!({"props": {total.to_string(): 1}})).is_err());
    }
}
