# atelier — sistema pessoal de gestão do Paulo (com MCP para o Claude)

Este diretório é o **projeto do atelier**: um app desktop pessoal, tipo um "Notion" sob medida, para o Paulo gerenciar
frentes de trabalho, dívidas, pendências, desejos, notas e links, com **gerenciamento visual** para ele e **controle
total para o Claude via MCP**. Ele nasceu numa conversa de 2026-10-30, no posto de trabalho (`daily-work`).

**Leia antes de qualquer coisa:**
1. [`docs/CONTEXTO.md`](docs/CONTEXTO.md) (a versão completa, com o que é da empresa, está em `privado/`, só nesta
   máquina e fora do git; o repositório é público) — de onde veio, as dores, os pedidos do Paulo **nas palavras dele** e as
   decisões já tomadas.
2. [`docs/REQUISITOS.md`](docs/REQUISITOS.md) — o MVP: modelo, telas, MCP/API, controle da tela, empacotamento,
   e o que fica para depois.

## Como trabalhar aqui

- **Modo vibe-code**, pedido do Paulo: ele **não** quer acompanhar a engenharia passo a passo. Ele diz o que
  precisa e o Claude constrói, decide os detalhes técnicos com bom senso e mostra o resultado funcionando. Perguntar
  só o que muda o produto (o que ele vê ou usa), não detalhe de implementação.
- **Entregar em fatias que rodam.** Cada fatia termina com o app abrindo e a funcionalidade nova usável. Melhor uma
  coisa pequena funcionando do que muita coisa pela metade.
- O Paulo vai **moldando o sistema com o uso**. O modelo de dados tem de aceitar mudança (campos novos, tipos novos)
  sem dor: migrations versionadas desde o primeiro dia.
- **Idioma:** português (interface, mensagens, docs, commits). Identificadores de código podem ser em inglês.
- **Windows 11**, shell padrão PowerShell 7. A máquina tem Node 22, Bun 1.4, Rust/Cargo 1.96, git e gh (conta
  GitHub `dunebuddy`).

## Regras duras (valem aqui como no resto da máquina)

- **Commits:** o autor é **sempre e só o Paulo**. **Nunca** acrescentar `Co-Authored-By`, `Generated-by` ou qualquer
  menção ao Claude na mensagem, nem em descrição de PR. A mensagem descreve só a mudança, objetiva. Mostrar a
  mensagem ao Paulo antes de commitar.
- **Repositório:** `dunebuddy/atelier` é **público** desde 2026-10-31 (para as releases e a atualização automática).
  Nada da empresa entra nele: contexto de trabalho vai para `privado/` (fora do git). Antes era privado, com o ok
  dele antes de criar. Nesta máquina o git não tem credencial do GitHub: para push, usar
  `git -c credential.helper= -c "credential.helper=!gh auth git-credential" push`, ou pedir ao Paulo para rodar
  `gh auth setup-git` uma vez.
- **Dado do Paulo não vai para o Git.** O banco (`*.db`), anexos e exports ficam fora do repo (`.gitignore` desde o
  primeiro commit). O conteúdo de trabalho tem dados da empresa onde ele trabalha: nomes de
  pessoas, hosts internos, IDs de conta. O código é público para ele; o dado não.
- **Segredos:** nada de token ou senha no código. Se o app precisar de credencial, ela vai num arquivo fora do repo.

## Estado

- 2026-10-30: pasta criada com o contexto e os requisitos. **Nenhum código ainda.** Próximo passo: o primeiro Claude
  aberto aqui monta o esqueleto (Tauri + SQLite + servidor HTTP/MCP embutido) e a primeira fatia (item + tabela +
  página com markdown + MCP de leitura e escrita).
- Mantenha um registro curto em `docs/SESSOES.md` (o que foi feito, o que ficou, ponto de parada), para o próximo
  Claude retomar.
