//! Quanto as pastas ocupam no disco: a do workspace de um item, a dele com os filhos e a bancada inteira.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Medir uma pasta grande (com `node_modules`, `.git`...) leva tempo: o resultado vale por 5 minutos.
const VALIDADE: Duration = Duration::from_secs(300);
static GUARDADO: Mutex<Option<HashMap<PathBuf, (u64, Instant)>>> = Mutex::new(None);

/// Bytes de uma pasta e de tudo dentro dela, sem seguir atalhos e links (que apontariam para fora ou em ciclo).
pub fn tamanho(p: &Path) -> u64 {
    {
        let g = GUARDADO.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((n, quando)) = g.as_ref().and_then(|m| m.get(p)) {
            if quando.elapsed() < VALIDADE {
                return *n;
            }
        }
    }
    let n = somar(p);
    GUARDADO.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(HashMap::new).insert(p.to_path_buf(), (n, Instant::now()));
    n
}

fn somar(p: &Path) -> u64 {
    let mut total = 0;
    let mut pilha = vec![p.to_path_buf()];
    while let Some(d) = pilha.pop() {
        let Ok(entradas) = std::fs::read_dir(&d) else { continue };
        for e in entradas.flatten() {
            let Ok(tipo) = e.file_type() else { continue };
            if tipo.is_symlink() {
                continue;
            }
            if tipo.is_dir() {
                pilha.push(e.path());
            } else if let Ok(m) = e.metadata() {
                total += m.len();
            }
        }
    }
    total
}

/// Soma várias pastas sem contar duas vezes a que está dentro de outra da lista (a pasta de um item pode apontar
/// para qualquer lugar, inclusive para dentro da de outro).
pub fn somar_pastas<I: IntoIterator<Item = PathBuf>>(pastas: I) -> u64 {
    let mut l: Vec<PathBuf> = pastas.into_iter().filter_map(|p| std::fs::canonicalize(p).ok()).collect();
    l.sort();
    l.dedup();
    let mut de_fora: Vec<PathBuf> = vec![];
    for p in l {
        if !de_fora.iter().any(|f| p.starts_with(f)) {
            de_fora.push(p);
        }
    }
    de_fora.iter().map(|p| tamanho(p)).sum()
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn soma_sem_contar_duas_vezes() {
        let raiz = std::env::temp_dir().join(format!("atelier-disco-{}", std::process::id()));
        let dentro = raiz.join("a").join("b");
        std::fs::create_dir_all(&dentro).unwrap();
        std::fs::write(raiz.join("a").join("x.txt"), [0u8; 100]).unwrap();
        std::fs::write(dentro.join("y.txt"), [0u8; 50]).unwrap();
        assert_eq!(somar(&raiz), 150);
        assert_eq!(somar_pastas([raiz.join("a"), dentro.clone(), raiz.join("a")]), 150, "a de dentro e a repetida não contam de novo");
        assert_eq!(somar_pastas([dentro, raiz.join("nao-existe")]), 50);
        let _ = std::fs::remove_dir_all(&raiz);
    }
}
