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

/// As placas de vídeo e quanta memória própria (VRAM) cada uma tem, para o ditado escolher entre processador e placa.
/// Placa integrada (Intel UHD/Iris, Radeon de processador) usa a RAM como se fosse VRAM: conta como sem VRAM. No
/// Windows lê o registro do driver (`HardwareInformation.qwMemorySize`); fora dele, devolve vazio (a tela decide pelo
/// nome que o navegador der).
pub fn placas_de_video() -> Vec<Value> {
    #[cfg(windows)]
    {
        use windows::core::HSTRING;
        use windows::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_ANY};
        let classe = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
        let ler = |sub: &str, nome: &str| -> Option<Vec<u8>> {
            let chave = HSTRING::from(format!(r"{classe}\{sub}"));
            let valor = HSTRING::from(nome);
            let mut tam = 0u32;
            unsafe {
                RegGetValueW(HKEY_LOCAL_MACHINE, &chave, &valor, RRF_RT_ANY, None, None, Some(&mut tam)).ok().ok()?;
                let mut buf = vec![0u8; tam as usize];
                RegGetValueW(HKEY_LOCAL_MACHINE, &chave, &valor, RRF_RT_ANY, None, Some(buf.as_mut_ptr() as *mut _), Some(&mut tam)).ok().ok()?;
                buf.truncate(tam as usize);
                Some(buf)
            }
        };
        let texto = |b: Vec<u8>| -> String {
            let u: Vec<u16> = b.chunks_exact(2).map(|c| u16::from_le_bytes([c[0], c[1]])).take_while(|&c| c != 0).collect();
            String::from_utf16_lossy(&u)
        };
        let mut placas = vec![];
        for i in 0..64 {
            let sub = format!("{i:04}");
            let Some(nome) = ler(&sub, "DriverDesc").map(texto) else { continue };
            let bytes = ler(&sub, "HardwareInformation.qwMemorySize")
                .or_else(|| ler(&sub, "HardwareInformation.MemorySize"))
                .map(|b| {
                    let mut a = [0u8; 8];
                    a[..b.len().min(8)].copy_from_slice(&b[..b.len().min(8)]);
                    u64::from_le_bytes(a)
                })
                .unwrap_or(0);
            let n = nome.to_lowercase();
            // adaptadores virtuais (área de trabalho remota, vídeo básico) não são placa
            if n.starts_with("microsoft") || placas.iter().any(|p: &Value| p["nome"] == nome.as_str()) {
                continue;
            }
            let integrada = (n.contains("intel") && !n.contains("arc")) || n.contains("radeon(tm) graphics") || n.contains("vega")
                || bytes < 1 << 30;
            placas.push(json!({ "nome": nome, "vram_mb": bytes / (1 << 20), "dedicada": !integrada }));
        }
        placas
    }
    #[cfg(not(windows))]
    {
        vec![]
    }
}
