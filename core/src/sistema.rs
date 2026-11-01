//! Quanto o atelier está gastando (memória e CPU), para a barra de status: o app inteiro (núcleo, interface e os
//! processos filhos) e cada terminal ou agente aberto (pela sessão), para a tela somar por workspace.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use sysinfo::{Pid, Process, ProcessRefreshKind, ProcessesToUpdate, System};

/// Sessão do terminal (o número que a tela dá) → processo que ela abriu.
fn sessoes() -> &'static Mutex<HashMap<u64, u32>> {
    static S: OnceLock<Mutex<HashMap<u64, u32>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn registrar_sessao(sessao: u64, pid: u32) {
    let _ = sessoes().lock().unwrap_or_else(|e| e.into_inner()).insert(sessao, pid);
}

/// Esquece a sessão, se ela ainda for deste processo (o número pode ter sido reaproveitado por um "Reabrir").
pub fn esquecer_sessao(sessao: u64, pid: u32) {
    let mut s = sessoes().lock().unwrap_or_else(|e| e.into_inner());
    if s.get(&sessao) == Some(&pid) {
        s.remove(&sessao);
    }
}

/// Memória que é só do processo. No Windows, o working set (`memory()`) conta as páginas compartilhadas, e os vários
/// processos do WebView2 dividem as mesmas DLLs: somar working sets inflava o total (500 MB para ~190 reais). Lá
/// `virtual_memory()` é a memória privada (a coluna "Memória" do Gerenciador de Tarefas).
fn memoria(p: &Process) -> u64 {
    if cfg!(windows) { p.virtual_memory() } else { p.memory() }
}

fn sistema() -> Option<&'static Mutex<System>> {
    static S: OnceLock<Option<Mutex<System>>> = OnceLock::new();
    S.get_or_init(|| System::new().ok().map(Mutex::new)).as_ref()
}

/// O processo e todos os descendentes dele.
fn arvore(filhos: &HashMap<Pid, Vec<Pid>>, raiz: Pid) -> Vec<Pid> {
    let mut v = vec![raiz];
    let mut i = 0;
    while i < v.len() {
        if let Some(f) = filhos.get(&v[i]) {
            v.extend(f.iter().copied());
        }
        i += 1;
    }
    v
}

/// Medição agora. A CPU é a média desde a medição anterior (a tela pede a cada poucos segundos).
pub fn medir() -> Value {
    let Some(sys) = sistema() else { return json!({ "erro": "medição indisponível neste sistema" }) };
    let mut sys = sys.lock().unwrap_or_else(|e| e.into_inner());
    sys.refresh_memory();
    // primeiro só a lista (nome e pai, baratos); memória e CPU só dos processos do app, não da máquina inteira
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing());
    let nucleos = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as f32;
    let mut filhos: HashMap<Pid, Vec<Pid>> = HashMap::new();
    for (pid, p) in sys.processes() {
        if let Some(pai) = p.parent() {
            filhos.entry(pai).or_default().push(*pid);
        }
    }
    let eu = sysinfo::get_current_pid().ok();
    let tudo = eu.map(|e| arvore(&filhos, e)).unwrap_or_default();
    let mut nossos = tudo.clone();
    for pid in sessoes().lock().unwrap_or_else(|e| e.into_inner()).values() {
        nossos.extend(arvore(&filhos, Pid::from_u32(*pid)));
    }
    nossos.sort();
    nossos.dedup();
    sys.refresh_processes_specifics(ProcessesToUpdate::Some(&nossos), false, ProcessRefreshKind::nothing().with_memory().with_cpu());
    let soma = |pids: &[Pid]| -> (u64, f32) {
        pids.iter().filter_map(|p| sys.process(*p)).fold((0, 0.0), |(m, c), p| (m + memoria(p), c + p.cpu_usage()))
    };
    let (ram, cpu) = soma(&tudo);
    let nucleo = eu.and_then(|e| sys.process(e)).map(memoria).unwrap_or(0);
    // a interface roda no WebView (Edge WebView2 no Windows, WebKit no Linux), filho do app
    let interface: Vec<Pid> = tudo
        .iter()
        .copied()
        .filter(|p| {
            sys.process(*p)
                .map(|x| {
                    let n = x.name().to_string_lossy().to_lowercase();
                    n.contains("webview") || n.contains("webkit")
                })
                .unwrap_or(false)
        })
        .collect();
    let (ram_interface, _) = soma(&interface);
    let por_sessao: serde_json::Map<String, Value> = sessoes()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .iter()
        .map(|(s, pid)| {
            let (m, c) = soma(&arvore(&filhos, Pid::from_u32(*pid)));
            (s.to_string(), json!({ "ram": m, "cpu": c / nucleos }))
        })
        .collect();
    json!({
        "ram_maquina": sys.total_memory(),
        "ram_livre": sys.available_memory(),
        "ram": ram,
        "cpu": cpu / nucleos,
        "nucleo": nucleo,
        "interface": ram_interface,
        "sessoes": por_sessao,
    })
}

#[cfg(test)]
mod testes {
    #[test]
    fn mede_o_proprio_processo() {
        let m = super::medir();
        assert!(m["ram"].as_u64().unwrap() > 1_000_000, "{m}");
        assert!(m["ram_maquina"].as_u64().unwrap() > m["ram"].as_u64().unwrap());
        super::registrar_sessao(7, std::process::id());
        assert!(super::medir()["sessoes"]["7"]["ram"].as_u64().unwrap() > 0);
        super::esquecer_sessao(7, 1);
        assert!(super::medir()["sessoes"]["7"].is_object(), "outro pid não apaga");
        super::esquecer_sessao(7, std::process::id());
        assert!(super::medir()["sessoes"]["7"].is_null());
    }
}
