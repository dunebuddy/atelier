//! Bancadas: cada bancada é uma pasta com tudo dentro (o banco `atelier.db` e as pastas dos itens em `itens/`).
//! Uma por cliente ou contexto, como o vault do Obsidian.
//!
//! Fora delas só existe a pasta do atelier na home (`~/atelier`, ou `ATELIER_HOME`), com o `config.toml`
//! (preferências e lista de bancadas) e, por padrão, as bancadas em `~/atelier/bancadas/`. Vale para Windows e Linux.

use crate::db::{Erro, Res};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const ARQUIVO_BANCO: &str = "atelier.db";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Bancada {
    pub nome: String,
    pub caminho: String,
}

// Tudo o que roda sozinho vem DESLIGADO: o Paulo liga nas Configurações se quiser.

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Backup {
    #[serde(default)]
    pub ativo: bool,
    /// de quantas em quantas horas
    #[serde(default = "vinte_e_quatro")]
    pub intervalo_horas: u32,
    /// quantas cópias guardar (as mais antigas saem)
    #[serde(default = "quatorze")]
    pub manter: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Captura {
    #[serde(default)]
    pub ativo: bool,
    /// atalho do sistema, no formato do Tauri ("CommandOrControl+Alt+Space")
    #[serde(default = "atalho_padrao")]
    pub atalho: String,
    /// fechar a janela esconde na bandeja (o atalho continua valendo)
    #[serde(default = "verdadeiro")]
    pub bandeja: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LixeiraAuto {
    #[serde(default)]
    pub ativo: bool,
    /// apaga de vez o que está na lixeira há mais de N dias
    #[serde(default = "trinta")]
    pub dias: u32,
}

/// Editor de arquivos do explorador. auto_salvar: "desligado" | "atraso" | "foco" (como o files.autoSave do VS Code).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EditorArquivos {
    #[serde(default = "desligado")]
    pub auto_salvar: String,
    #[serde(default = "mil")]
    pub atraso_ms: u32,
}

fn desligado() -> String {
    "desligado".into()
}

fn mil() -> u32 {
    1000
}

impl Default for EditorArquivos {
    fn default() -> Self {
        EditorArquivos { auto_salvar: desligado(), atraso_ms: 1000 }
    }
}

/// Como um agente de linha de comando é usado (Configurações → Integrações). Tudo desligado até o Paulo ligar.
#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct UsoAgente {
    /// aparece no botão de terminal
    #[serde(default)]
    pub terminal: bool,
    /// pode ser chamado sem terminal (o atelier passa o pedido e recebe a resposta)
    #[serde(default)]
    pub executor: bool,
    /// aparece no `/prompt` do editor
    #[serde(default)]
    pub prompt: bool,
    /// argumentos do modo não interativo, se mudados (`{prompt}` vira o pedido)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exec: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Preferencias {
    #[serde(default = "tema_padrao")]
    pub tema: String,
    #[serde(default = "idioma_padrao")]
    pub idioma: String,
    /// tamanho da letra em % (100 = normal)
    #[serde(default = "cem")]
    pub zoom: u32,
    #[serde(default)]
    pub backup: Backup,
    #[serde(default)]
    pub captura: Captura,
    #[serde(default)]
    pub lixeira: LixeiraAuto,
    #[serde(default)]
    pub editor: EditorArquivos,
    /// procura versão nova ao abrir (pedido do Paulo: "tem versão nova, quer instalar?")
    #[serde(default)]
    pub atualizacao: Atualizacao,
    /// por id da integração ("claude-code", "codex"...)
    #[serde(default)]
    pub agentes: std::collections::BTreeMap<String, UsoAgente>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Atualizacao {
    /// ao abrir o app, pergunta ao GitHub se tem versão nova e avisa (não instala sem perguntar)
    #[serde(default = "verdadeiro")]
    pub avisar: bool,
}

impl Default for Atualizacao {
    fn default() -> Self {
        Atualizacao { avisar: true }
    }
}

fn tema_padrao() -> String {
    "nord".into()
}

fn idioma_padrao() -> String {
    "pt-BR".into()
}

fn atalho_padrao() -> String {
    "CommandOrControl+Alt+Space".into()
}

fn vinte_e_quatro() -> u32 {
    24
}

fn quatorze() -> u32 {
    14
}

fn trinta() -> u32 {
    30
}

fn cem() -> u32 {
    100
}

fn verdadeiro() -> bool {
    true
}

impl Default for Backup {
    fn default() -> Self {
        Backup { ativo: false, intervalo_horas: 24, manter: 14 }
    }
}

impl Default for Captura {
    fn default() -> Self {
        Captura { ativo: false, atalho: atalho_padrao(), bandeja: true }
    }
}

impl Default for LixeiraAuto {
    fn default() -> Self {
        LixeiraAuto { ativo: false, dias: 30 }
    }
}

impl Default for Preferencias {
    fn default() -> Self {
        Preferencias {
            tema: tema_padrao(),
            idioma: idioma_padrao(),
            zoom: 100,
            backup: Backup::default(),
            captura: Captura::default(),
            lixeira: LixeiraAuto::default(),
            editor: EditorArquivos::default(),
            atualizacao: Atualizacao::default(),
            agentes: Default::default(),
        }
    }
}

// a ordem dos campos importa para o TOML: valores simples antes das tabelas
#[derive(Serialize, Deserialize, Default, Clone, Debug)]
pub struct Config {
    #[serde(default)]
    pub ativa: Option<String>,
    #[serde(default)]
    pub preferencias: Preferencias,
    #[serde(default)]
    pub bancadas: Vec<Bancada>,
}

/// `~/atelier` (ou `ATELIER_HOME`, para testes).
pub fn pasta_atelier() -> PathBuf {
    if let Ok(p) = std::env::var("ATELIER_HOME") {
        return p.into();
    }
    dirs::home_dir().unwrap_or_else(|| ".".into()).join("atelier")
}

fn arquivo_config() -> PathBuf {
    pasta_atelier().join("config.toml")
}

/// Onde nascem as bancadas novas por padrão.
pub fn raiz_sugerida() -> PathBuf {
    pasta_atelier().join("bancadas")
}

pub fn carregar() -> Config {
    std::fs::read_to_string(arquivo_config())
        .ok()
        .and_then(|s| toml::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn salvar(cfg: &Config) -> Res<()> {
    let arq = arquivo_config();
    if let Some(d) = arq.parent() {
        std::fs::create_dir_all(d).map_err(|e| Erro::Invalido(format!("não criei {d:?}: {e}")))?;
    }
    let texto = toml::to_string_pretty(cfg).map_err(|e| Erro::Invalido(e.to_string()))?;
    let texto = format!("# Configuração do atelier. Dá para editar à mão com o app fechado.\n\n{texto}");
    std::fs::write(&arq, texto).map_err(|e| Erro::Invalido(format!("não gravei {arq:?}: {e}")))
}

/// Windows não diferencia maiúsculas em caminho; Linux diferencia.
pub fn mesmo_caminho(a: &str, b: &str) -> bool {
    if cfg!(windows) { a.eq_ignore_ascii_case(b) } else { a == b }
}

pub fn banco_da(caminho: &str) -> PathBuf {
    Path::new(caminho).join(ARQUIVO_BANCO)
}

/// Prepara a pasta da bancada (cria se não existir). Serve para bancada nova e para abrir uma existente.
pub fn preparar(caminho: &str) -> Res<()> {
    let p = Path::new(caminho);
    if !p.is_absolute() {
        return Err(Erro::Invalido(
            "use um caminho absoluto (ex.: C:\\Users\\paulo\\atelier\\bancadas\\trabalho ou /home/paulo/atelier/bancadas/trabalho)".into(),
        ));
    }
    std::fs::create_dir_all(p.join("itens")).map_err(|e| Erro::Invalido(format!("não criei a bancada em {p:?}: {e}")))
}

fn normalizar(caminho: &str) -> String {
    let c = caminho.trim().trim_matches('"');
    let sem_barra = c.trim_end_matches(['\\', '/']);
    // "/" sozinho (raiz do Linux) não pode virar vazio
    if sem_barra.is_empty() { c.to_string() } else { sem_barra.to_string() }
}

impl Config {
    pub fn ativa(&self) -> Option<&Bancada> {
        let a = self.ativa.as_deref()?;
        self.bancadas.iter().find(|b| mesmo_caminho(&b.caminho, a))
    }

    fn achar(&self, caminho: &str) -> Option<usize> {
        self.bancadas.iter().position(|b| mesmo_caminho(&b.caminho, caminho))
    }

    /// Acrescenta (ou reaproveita) uma bancada na lista. Nome vazio = nome da pasta.
    pub fn acrescentar(&mut self, nome: &str, caminho: &str) -> Res<Bancada> {
        let caminho = normalizar(caminho);
        preparar(&caminho)?;
        if let Some(i) = self.achar(&caminho) {
            return Ok(self.bancadas[i].clone());
        }
        let nome = match nome.trim() {
            "" => Path::new(&caminho).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or("Bancada".into()),
            n => n.to_string(),
        };
        let b = Bancada { nome, caminho };
        self.bancadas.push(b.clone());
        Ok(b)
    }

    pub fn renomear(&mut self, caminho: &str, nome: &str) -> Res<()> {
        let i = self.achar(&normalizar(caminho)).ok_or(Erro::NaoEncontrado("bancada".into()))?;
        if nome.trim().is_empty() {
            return Err(Erro::Invalido("a bancada precisa de nome".into()));
        }
        self.bancadas[i].nome = nome.trim().to_string();
        Ok(())
    }

    /// Tira da lista. Não apaga nada do disco.
    pub fn remover(&mut self, caminho: &str) -> Res<()> {
        let caminho = normalizar(caminho);
        if self.ativa.as_deref().is_some_and(|a| mesmo_caminho(a, &caminho)) {
            return Err(Erro::Invalido("troque de bancada antes de tirar esta da lista".into()));
        }
        let i = self.achar(&caminho).ok_or(Erro::NaoEncontrado("bancada".into()))?;
        self.bancadas.remove(i);
        Ok(())
    }

    /// Bancada para abrir agora: a ativa; se não houver nenhuma, cria a "Principal".
    pub fn garantir_ativa(&mut self) -> Res<Bancada> {
        if let Some(b) = self.ativa().cloned() {
            return Ok(b);
        }
        let b = match self.bancadas.first().cloned() {
            Some(b) => b,
            None => self.acrescentar("Principal", &raiz_sugerida().join("principal").to_string_lossy())?,
        };
        self.ativa = Some(b.caminho.clone());
        Ok(b)
    }
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn config_toml_vai_e_volta() {
        let mut cfg = Config::default();
        cfg.bancadas.push(Bancada { nome: "Trabalho".into(), caminho: "C:\\x\\trabalho".into() });
        cfg.ativa = Some("C:\\x\\trabalho".into());
        cfg.preferencias.tema = "escuro".into();
        let t = toml::to_string_pretty(&cfg).unwrap();
        let volta: Config = toml::from_str(&t).unwrap();
        assert_eq!(volta.ativa().unwrap().nome, "Trabalho");
        assert_eq!(volta.preferencias.tema, "escuro");
        // config vazio ou antigo não quebra
        let vazio: Config = toml::from_str("").unwrap();
        assert_eq!(vazio.preferencias.idioma, "pt-BR");
    }

    #[test]
    fn normaliza_barra_final_sem_quebrar_raiz() {
        assert_eq!(normalizar("C:\\x\\trabalho\\"), "C:\\x\\trabalho");
        assert_eq!(normalizar("/home/p/trabalho/"), "/home/p/trabalho");
        assert_eq!(normalizar("/"), "/");
    }
}
