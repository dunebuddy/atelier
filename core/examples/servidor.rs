//! Só a API, sem janela: o teste da tela no navegador roda ao lado do atelier aberto (`bun run teste`).
//! Usa `ATELIER_HOME` (dados de teste), `ATELIER_PORTA` e `ATELIER_ORIGEM`.

#[tokio::main]
async fn main() {
    let estado = atelier_core::api::Estado::iniciar().unwrap_or_else(|e| panic!("não abri a bancada: {e}"));
    println!("atelier sem janela em http://127.0.0.1:{}", atelier_core::api::porta());
    atelier_core::api::servir(estado).await;
}
