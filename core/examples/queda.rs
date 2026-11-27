//! Testa o registro de queda (queda.rs) à mão: `cargo run -p atelier-core --example queda -- panico|memoria`, com
//! ATELIER_HOME apontando para uma pasta de teste. Depois, ver o erros.log dessa pasta.
fn main() {
    atelier_core::queda::registrar("teste");
    match std::env::args().nth(1).as_deref() {
        // pânico dentro de um callback que não pode desenrolar (como os da janela): o Rust aborta
        Some("panico") => {
            extern "C" fn callback() {
                panic!("teste de pânico num callback");
            }
            callback();
        }
        // pedido de memória que o sistema nega: o Rust escreve no stderr e aborta
        Some("memoria") => {
            let v: Vec<u8> = Vec::with_capacity(1 << 46);
            println!("{}", v.capacity());
        }
        _ => eprintln!("uso: queda panico|memoria"),
    }
}
