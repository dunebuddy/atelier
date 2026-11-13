# vendor

## libsqlite3-sys: SQLite3 Multiple Ciphers

O **cofre de segredos** de cada bancada (`<bancada>/cofre.db`) é um SQLite criptografado inteiro (cifra
ChaCha20-Poly1305): quem copiar o disco não lê nada, nem os nomes dos segredos. O `rusqlite` só criptografa pelo
SQLCipher, que traz o OpenSSL para o build; então aqui vai o mesmo arranjo do **torii** (o projeto irmão, de onde
esta pasta foi copiada como está):

`libsqlite3-sys/` é o `libsqlite3-sys` 0.30.1 (a versão que o `rusqlite` 0.32 usa), como publicado no crates.io,
trocado pelo `[patch.crates-io]` do `Cargo.toml` da raiz, com uma mudança: o build compila o amalgamation do
[SQLite3 Multiple Ciphers](https://github.com/utelle/SQLite3MultipleCiphers) no lugar do SQLite (marcado `Torii:`
no código), vindo byte a byte do crate `sqlite3mc-src`, cuja checksum o `Cargo.lock` prende.

Sem chave (`PRAGMA hexkey`), o SQLite3 Multiple Ciphers lê e grava bancos comuns como o SQLite: o `atelier.db` das
bancadas continua igual. A chave do cofre fica no cofre do sistema (Credential Manager/DPAPI no Windows, Secret
Service no Linux); veja `core/src/cofre.rs`.

Para atualizar: siga o `vendor/README.md` do torii (mesmo procedimento).
