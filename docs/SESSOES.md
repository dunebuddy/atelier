# SESSOES — atelier

## 2026-10-30 — nascimento (no posto `daily-work`)
- Ideia e decisões na conversa do posto: ver `CONTEXTO.md` e `REQUISITOS.md`.
- Criados só os docs. Sem código, sem git e sem repo no GitHub.

## 2026-10-30 — fatia 1 (primeira sessão na pasta do atelier)
- Conversa com o Paulo: tudo maleável como Notion (tipos e propriedades são dados, item troca de tipo), frente vira
  propriedade, item aponta para pasta no disco, Diário com entradas que viram item, **modelos (templates)** por tipo,
  temas **claro / escuro / Nord** e interface bonita estilo Claude/Notion com menu lateral recolhível. Registrado em
  `CONTEXTO.md` e `REQUISITOS.md`.
- **Estrutura do código:**
  - `core/` — crate `atelier-core` (sem Tauri): `db.rs` (SQLite, migrations por `user_version`, tipos, propriedades,
    modelos, itens, notas) e `api.rs` (axum em `127.0.0.1:7477`). Testes: `cd core; cargo test`.
    Os testes ficam aqui porque binário de teste que linka Tauri não roda no Windows (STATUS_ENTRYPOINT_NOT_FOUND).
  - `src-tauri/` — o app: abre o banco, sobe a API e a janela.
  - `src/` — React + Vite. `api.ts` (cliente), `components/` (Sidebar, Lista, PaginaItem, ConfigTipo, Valor, Editor
    TipTap com markdown, Popover), `styles.css` (os três temas por variáveis CSS).
  - Workspace Cargo na raiz (`Cargo.toml`), `target/` na raiz.
- **Banco:** um por bancada, `<bancada>/atelier.db`. Config em `~/atelier/config.toml` (`core/src/bancada.rs`).
  Para testar sem mexer no real: `ATELIER_HOME=<pasta de teste>`.
- **Rodar em dev:** `bun run tauri dev`.
- **Modelo:** `itens.props` é JSON `{ "<id da propriedade>": valor }`. Opções de seleção moram na propriedade ou,
  quando o tipo tem as suas (status), em `tipo_propriedades.opcoes`. Opção com `historico: true` some da lista ativa.
  Mudança de status/tipo vira nota automática na linha do tempo.
- **Toolchain:** Rust GNU (WinLibs). A lib do app é só `rlib`: `cdylib` estoura "export ordinal too large" no ld.
- **Testado:** 4 testes do core; fumaça da API (tipo e propriedade novos, modelo, troca de tipo com nota, filtro por
  frente, CORS bloqueando origem de fora); interface no navegador (lista, página, status, editor markdown, 3 temas).
- **Bancadas + Configurações** (mesma sessão, a pedido do Paulo): `core/src/bancada.rs`, rotas `/api/bancadas*` e
  `/api/preferencias`; a API troca a conexão quando troca a bancada. Front: `Configuracoes.tsx` (modal), seletor de
  bancada no rodapé do `Sidebar`.
- **Redesenho** para fugir do Notion: `BarraTitulo.tsx` (janela sem moldura, `decorations: false`, permissões de
  janela em `capabilities/default.json`), busca rápida Ctrl+K, ficha à direita na página, fontes Fraunces/Inter via
  `@fontsource-variable`. Ver `REQUISITOS.md` 3c.
- **Testado:** 6 testes do core; bancadas pela interface (criar uma bancada Trabalho, trocar, item dela não aparece na Principal,
  `config.toml` gravado); busca rápida; temas. **Não testado pelo Claude:** arrastar a janela e os botões
  minimizar/maximizar/fechar no app de verdade (só aparecem na janela do Tauri, não no navegador de teste).
- **Fatia 2 (MCP) + Integrações + temas em arquivo + pastas** (mesma sessão):
  - `mcp/` — `atelier-mcp`, JSON-RPC por linha, sem SDK. O `tauri dev`/`build` compila ele antes
    (`beforeDevCommand`). O app procura o executável ao lado de si.
  - `core/src/integracoes.rs` — 18 agentes; caminhos e formatos em `docs/INTEGRACOES.md` (pesquisa de 2026-10-30).
    Teste sem mexer nas configs reais: `ATELIER_AGENTES_HOME=<pasta falsa>`.
  - `core/src/temas.rs` + `core/temas/*.toml` (semeados em `~/atelier/temas` se faltarem; `.toml.off` esconde).
  - `core/src/pastas.rs` — pasta do item; migration 3 (`itens.codigo`, 7 hex).
- **Testado:** 11 testes do core; MCP por JSON-RPC real (criar tipo, criar item por nome com opção nova, trocar
  tipo, criar pasta, ler pelo código `#ABC` em maiúsculas, assinatura Claude/Codex); integrações numa home falsa
  (Codex TOML com comentário preservado, Gemini instalar/remover sem perder chaves, Kiro criado do zero, Zed com
  comentários recusado e intocado, backups `.bak-atelier`); interface com Dracula e Frappé, seção Integrações.
- Commit `46ed776` e repositório privado `dunebuddy/atelier` criado, com push (ok do Paulo).
- **Visões** (pedido do Paulo: "o menu são filtros"): migration 4 (`visoes`: nome, ícone, layout, filtro, config).
  Menu lateral = visões; tipos foram para Configurações → Tipos e modelos. Layouts: tabela, lista, quadro
  (arrastar muda a propriedade), linha do tempo. **Hoje** = linha do tempo do dia + captura rápida, que cria item sem
  tipo, visível na Caixa de entrada. "Diário" virou isso, sem entidade própria. MCP ganhou `linha_do_tempo`
  ("no que trabalhei hoje?"). Front: `Visao.tsx`, `Layouts.tsx`, `LinhaDoTempo.tsx`, `visao.ts` (períodos).
- **Registro de tudo com data e hora** (pedido forte do Paulo): toda mudança vira nota com autor; edições de
  texto seguidas viram uma só. A interface mostra data e hora completas em todo lugar.
- **Lixeira e versões** (migrations 5 e 6): apagar é lógico (`apagado_em`) para itens e notas; esvaziar apaga
  de vez. `versoes` guarda o texto anterior do corpo (por sessão de edição) e das notas editadas. Telas: `Lixeira.tsx`,
  `Historico.tsx`.
- **Qualidade de vida:** ver `docs/QUALIDADE-DE-VIDA.md` (o que entrou e a lista para discutir).
- **Escopo por bancada:** tipos, propriedades, modelos, visões, itens, notas, versões e lixeira são de cada bancada
  (no `atelier.db` dela). Global (`~/atelier`): só preferências, temas e lista de bancadas.
- **Bancada nova escolhe o começo:** "Em branco" (padrão: sem tipos, só Hoje/Caixa/Todos; `db::limpar_sementes`) ou
  "Trabalho" (Task, Dívida...). Exemplo do Paulo: uma bancada de trabalho e outra de uma aventura de RPG.
- **Testado:** 14 testes do core; API e interface (captura, quadro arrastando, lista, linha do tempo, notas
  editadas, histórico, lixeira e restaurar).
- **QoL aprovada (1-7, 10-17)**, ver tabela em `docs/QUALIDADE-DE-VIDA.md`. Peças novas:
  - `core/src/terminal.rs` — PTY (`portable-pty`) + websocket `/api/terminal`; só aceita Origin da janela do atelier e
    só roda o shell ou agentes da lista `AGENTES`. Front: `Terminal.tsx` (xterm.js). No Windows o ConPTY pergunta a
    posição do cursor (`ESC[6n`) e espera resposta: o xterm responde sozinho; cliente cru precisa responder.
  - `core/src/manutencao.rs` — backup (`VACUUM INTO`) e lixeira automática; rodada a cada 10 min em `api::servir`.
    Preferências novas em `bancada::Preferencias` (backup, captura, lixeira, zoom), **tudo desligado por padrão**.
  - `src-tauri/src/lib.rs` — bandeja (`tray-icon`), fechar esconde quando a captura está ligada; atalho global
    registrado pela tela (`Captura.tsx`, plugin global-shortcut).
  - Relações (migration 7), "Vence em breve" (8), grupos de visões (9). `pastas.rs`: copiar e colar arquivos.
- **Erro corrigido na mesma sessão:** inseri a migration 8 antes da 7 e um banco antigo quebrou ("table relacoes
  already exists"). Agora há testes de guarda: `migrations_em_ordem` (numeração 1..N na ordem da lista) e
  `banco_antigo_migra_ate_o_fim`. **Migration nova sempre no fim.**
- **Testado:** 21 testes do core; terminal por websocket (comando, pasta, prompt do Paulo; origem de fora = 403);
  relações e menções; arquivos (copiar sem sobrescrever); prazos; backup; preferências mesclando sem perder campos;
  contagem do menu, relatório, atalhos, painel do terminal abrindo. **Não visto na tela pelo Claude** (painel do
  navegador sem desenhar): a pintura do xterm, arrastar arquivo do sistema (só no app), bandeja e atalho global
  (só no app).
- Commit `d7f4ee1` (visões, lixeira, versões, agente no app e QoL), com push.
- **Explorador de arquivos** (pedido do Paulo): `core/src/explorador.rs` (`/api/explorar`, `/api/arquivo` GET/PUT,
  `/api/arquivo/info`; tudo restrito à bancada por caminho canônico; HTML e SVG servidos com CSP `sandbox`; salvar
  recusa se o arquivo mudou depois de aberto). Front: `Explorador.tsx` (painel à direita, pdf.js, marked num iframe
  isolado, editor de texto com auto-salvar configurável em `preferencias.editor`).
- Commit `28d61c1` (explorador de arquivos), com push. App de teste encerrado.

## PONTO DE PARADA — 2026-10-30 (fim do dia)

**Situação das fatias** (do `REQUISITOS.md`):

| Fatia | Situação |
|---|---|
| 1 Esqueleto, tabela, página, criar/editar | ✅ |
| 1b Diário | ✅ virou a visão **Hoje** (linha do tempo + captura) |
| 2 MCP | ✅ pronto + tela de Integrações; ⚠️ **não instalado/testado no Claude Code real** |
| 3 Controle da tela pelo MCP (`abrir`, `recarregar`, `filtrar`, `destacar` via websocket) | ❌ **não feita** (hoje a tela só relê a cada 15 s) |
| 4 Kanban, links, relações, linha do tempo, busca | 🟡 faltam **links por ferramenta** (URL + rótulo + tipo ADO e chamados/GitHub... com ícone, vários por item) e **busca nas anotações** (hoje: título, corpo e código; sem FTS5) |
| 5 Visões e relatórios | ✅ |
| 6 Migração do posto `daily-work` | ❌ **não feita**: planejar com o Paulo antes (conteúdo da empresa) |

Fora das fatias: **instalador** (`tauri build`; o `atelier-mcp` precisa ir junto, ao lado do executável) não feito.

**Plano para amanhã (combinado com o Paulo), nesta ordem:**
1. **Usar de verdade:** `bun run tauri dev` sem `ATELIER_HOME`/`ATELIER_AGENTES_HOME` → nasce `~/atelier` real.
   Conferir com o Paulo o que o Claude não viu na tela: terminal desenhando (botão **Agente**), arrastar arquivo do
   Explorer para o item, botões da janela (minimizar/maximizar/fechar/arrastar), bandeja e atalho global (ligar em
   Configurações → Automação), explorador de arquivos.
2. **Instalar o MCP no Claude Code real** (Configurações → Integrações) e testar numa sessão nova: criar item, anotar,
   `linha_do_tempo`.
3. **Fatia 3**: controle da tela pelo MCP — o "vai na página disso aqui" que motivou o projeto.
4. **Instalador.**
5. Depois: links por ferramenta, busca nas anotações (FTS5), e planejar a migração do posto.

**Ideias em aberto** (`docs/QUALIDADE-DE-VIDA.md`): aviso do sistema para prazos, página com várias visões, trava de
bancada em pasta sincronizada, configurações com busca no estilo VS Code.

**2026-10-31 — ideias de layout do Paulo** (em [`docs/LAYOUT.md`](LAYOUT.md), ainda não feitas): barra da esquerda
redimensionável com voltar/avançar e histórico de navegação; painel de trabalho dividido em dois; em cada metade, três
modos (abas, tile MonadTall do Qtile, fita do Niri com colunas de 1/1 a 1/4 e itens empilhados); visões que expandem como árvore na barra
da esquerda, com a hierarquia vinda de uma propriedade de relação escolhida na visão e botão de recarregar
(**relações deixam de ser fixas e viram tipo de propriedade "relação"**, criada pelo Paulo — princípio reforçado
por ele: o atelier só conhece **item e propriedades**; pai, filho, bloqueio, atraso não podem estar no código. A
lista fixa `TIPOS_RELACAO` em `core/src/db.rs` hoje viola isso e tem de sair); botão de terminal com escolha do tipo (shells + agentes configurados) e seção Configurações →
Agentes com detectar/testar e os interruptores "terminal ativo" e "Executor"; e em [`docs/AGENTES.md`](AGENTES.md) o
Executor (chamar agente sem terminal) e o `/prompt` no editor. Ele avisou que vem mais.

## PLANO REFEITO — 2026-10-31 (pedido do Paulo: "implementar 100% do que falta mais o que eu pedi")

Juntando o que faltava das fatias com as ideias de hoje ([`LAYOUT.md`](LAYOUT.md), [`AGENTES.md`](AGENTES.md)).
Nenhuma fatia antiga cobria as ideias novas; viram fatias novas, nesta ordem (cada uma depende da anterior):

| Fatia | O quê |
|---|---|
| 7 Relações como propriedade | tipo de propriedade **relação** (lista de itens); migration converte a tabela `relacoes` em propriedades; some a lista fixa `TIPOS_RELACAO`; filtros "contém / vazia / preenchida"; MCP relaciona via `atualizar_item` |
| 8 Barra da esquerda | largura arrastável e guardada; voltar/avançar com histórico (botão direito e drop-down); visões expandem como árvore, hierarquia por uma propriedade de relação escolhida na visão (e sentido); botão recarregar |
| 9 Painel de trabalho | "coisas abertas" genéricas (item, visão, terminal, arquivo, configurações, lixeira); dividir em duas metades; modos **abas**, **tile** (MonadTall) e **fita** (Niri: 1/1, 1/2, 1/3, 1/4, empilhar); arrastar entre metades; estado guardado; atalhos |
| 10 Agentes | Configurações → Agentes (detectar, testar, **terminal ativo**, **Executor**, comando editável); botão de terminal com escolha (shells + agentes); Executor não interativo; `/prompt` no editor |
| 3 Controle da tela pelo MCP | `abrir`, `recarregar`, `filtrar`, `destacar` por websocket, abrindo no painel de trabalho |
| 4 (resto) | links por ferramenta (propriedade **link** com rótulo e ícone); busca nas anotações com FTS5 |
| Instalador | `tauri build` com o `atelier-mcp` junto do executável |
| 11 Exportar (pedido no meio do dia) | item ou visão em Markdown, HTML, PDF, Excel ou CSV, escolhendo os campos (título, código, tipo, link, datas, propriedades, texto, linha do tempo, apontado por, itens ligados) e o arranjo (relatório, tabela, lista) |

Fica com o Paulo (precisa dele): usar o app de verdade e conferir o visual; instalar o MCP no Claude Code real;
planejar a migração do posto `daily-work` (fatia 6).

**Lembretes técnicos:** migration nova **sempre no fim** da lista (há teste de guarda); para testar sem mexer no real,
`ATELIER_HOME=<pasta>` e `ATELIER_AGENTES_HOME=<pasta>`; se o `tauri dev` reclamar de "recurso em uso" no WebView,
sobrou um `msedgewebview2` com `com.paulo.atelier` na linha de comando — encerrar só esse.

## 2026-10-31 — fatias 7 a 11, 3, 4 e instalador (Paulo fora, acompanhando pelo celular)

Tudo do plano refeito foi feito e testado no app de teste (`ATELIER_HOME`), pela API, pelo MCP e na tela:

- **7 Relações como propriedade.** Migration 10: coluna `propriedades.config` (`{inverso, um_so}`); a tabela
  `relacoes` vira valores (lista de códigos) de propriedades da espécie `relacao` (só as que estavam em uso) e some.
  `db::ligar`, `ramo`, `resumos`, `referencias_do_item` (o "Apontado por", lido pelo nome inverso). Rotas
  `/api/itens/{id}/ligar`, `/ramo`, `/api/resumos`. Filtro "preenchida/vazia" para qualquer propriedade (`d.<id>=..`
  ou `vazio`). MCP: `relacionar` agora usa propriedade (`propriedade`, `remover`); `ler_item` mostra
  `itens_apontados` e `apontado_por`. Front: `ValorRelacao` (chips + busca), `Relacoes.tsx` virou "Apontado por",
  cache de títulos em `src/resumos.ts`, `abrir(rota, nova)` em `ui.ts`.
- **9 Painel de trabalho** (`src/painel.ts` puro + `components/Painel.tsx`). Janelas com histórico próprio; uma ou
  duas metades; modos abas / tile / fita. Todas as janelas ficam num lugar só do DOM, posicionadas por conta: mudar
  de modo ou de metade não desmonta (o terminal continua vivo). Terminal e arquivos viraram janelas
  (`TerminalJanela`, `Explorador`). Seletor de modo visível em cada metade; arrastar abas entre metades; estado no
  `localStorage` (`atelier.painel`; terminais não voltam). Página e visão se ajustam à largura da janela
  (`@container janela`).
- **8 Barra da esquerda.** Largura arrastável (`atelier.sidebarLargura`); voltar/avançar e histórico da janela com o
  foco (botão direito ou o ícone de relógio; saíram da barra de título). Visão focada (ícone de árvore ao passar o
  mouse): sobe para o topo, as outras somem, itens em árvore pela `config.arvore {prop, sentido, so_raizes}` da visão
  (`Arvore.tsx`), filhos carregados ao expandir, sem ciclos, botão recarregar.
- **10 Agentes** (`core/src/agentes.rs`). Lista fixa = a das Integrações; só entra em uso com MCP instalado; cada uso
  (Terminal, Executor, Prompt) ligado à mão em `preferencias.agentes` (tudo desligado por padrão). Integrações ganhou
  Detectar todos, Testar (`--version`) e os interruptores; argumentos do modo não interativo editáveis
  (`{prompt}`, ou pela entrada padrão). `/api/agentes`, `/api/agentes/{id}/testar`, `/api/executar` (até 10 min;
  cancelar = cancelar a requisição, o processo morre junto). Botão de terminal com escolha (PowerShell 7, Windows
  PowerShell, CMD, WSL, Git Bash; no Linux os shells do sistema; e os agentes ligados). `/prompt` no editor do item
  (`PromptAgente.tsx`): caixinha, marcador "escrevendo…" que acompanha a edição, texto entra no ponto, nota com o
  agente como autor. Testado de verdade com o Claude Code (`claude -p`, 9 s).
- **3 Controle da tela.** `/api/tela` (abrir item ou visão, ao lado ou não; recarregar; filtrar; destacar) +
  websocket `/api/tela/eventos`; ferramenta `tela` no MCP (fala com o app por HTTP; avisa se o app está fechado).
- **4 (resto).** Busca com FTS5 (migration 11, gatilhos): acha nas anotações, sem acento, cada palavra em qualquer
  lugar do item. Propriedade **links** (vários por item, `{url, rotulo}`), selo da ferramenta pelo endereço (ADO,
  GitHub, Jira, SharePoint... ou o nome do host, como "Intranet"), sem logos de terceiros.
- **11 Exportar** (`Exportar.tsx` + `core/src/exportar.rs`, rota `/api/exportar`). Botão na página do item e na
  visão. PDF pela impressão do WebView ("Salvar como PDF"). Excel com `rust_xlsxwriter`; CSV com `;` e BOM.
- **Instalador:** `scripts/mcp-junto.mjs` compila o `atelier-mcp` e põe em `src-tauri/binaries/` (externalBin); o
  Tauri leva para o lado do `atelier.exe`. NSIS por usuário, em português.
- Testes do core: 29 passando.

## PONTO DE PARADA — 2026-10-31

**Nada commitado ainda** (o Paulo aprova a mensagem antes). Fica com o Paulo:
1. Usar o app de verdade e conferir o que só se vê na janela real: painel (arrastar abas, fita, tile), terminal,
   barra lateral, exportar com a janela de salvar, PDF pela impressão, botões da janela, bandeja.
2. Instalar o MCP no Claude Code real (Integrações) e ligar os usos dos agentes que ele quiser.
3. Planejar a migração do posto `daily-work` (fatia 6).
4. Deep link `atelier://item/<código>` (vai no exportar como texto) ainda não abre o app: falta registrar o protocolo
   (plugin deep-link do Tauri) no instalador.


## 2026-10-31 (noite) — repositório público, CI e atualização

- Commit das fatias (`c32f5bf`) e push. O Paulo pediu CI por tag e aviso de versão nova. Como o app não baixa
  atualização de repositório privado, ele escolheu **tornar o atelier público**, depois de **tirar o que é da empresa**
  dos docs e do código (o original ficou em `privado/`, fora do git). Para não sobrar nada nos commits antigos, o repo
  antigo virou `dunebuddy/atelier-antigo` (privado, backup) e `dunebuddy/atelier` nasceu público com um commit limpo.
- **CI:** `.github/workflows/release.yml`: tag `v*` → testes do core → instaladores de Windows (NSIS) e Linux
  (AppImage, deb) com `tauri-action`, assinados, e a release com o `latest.json`. Confere que a tag bate com a versão
  do app. `scripts/versao.mjs X.Y.Z` muda a versão em todos os arquivos.
- **Atualização:** plugins `updater` e `process`; chave pública no `tauri.conf.json`; a privada em
  `~/.tauri/atelier.key` (só na máquina do Paulo; **fazer backup**). Aviso "tem versão nova, quer instalar?" ao
  abrir (`preferencias.atualizacao.avisar`, ligado porque o Paulo pediu o aviso; desliga em Configurações →
  Automação, onde também tem "Procurar versão nova agora"). Só instala quando ele manda; o app reinicia sozinho.
- **Falta (Paulo):** pôr a chave privada no segredo `TAURI_SIGNING_PRIVATE_KEY` do repositório (o Claude foi barrado
  de gravar segredo) e subir a primeira tag para testar o CI.

## 2026-10-31 (noite) — workspaces, barra de status e tipos de propriedade

- **Workspaces** (`src/workspaces.ts`, `components/Workspaces.tsx`). Todo item tem o seu (vazio até ser usado; começa
  com o próprio item aberto), além do "Geral". Botão **Workspace** na página do item; seletor na barra de título
  (trocar, fechar = parar os terminais, esquecer); Ctrl+Alt+PgUp/PgDn. Os abertos na sessão ficam montados por
  trás (agente continua trabalhando). Guardados por bancada no `localStorage` (`workspaces:<caminho>`): ao reabrir o
  app, as janelas voltam e os terminais aparecem **parados**, com "Reabrir".
  Decisão do Paulo: **contexto mãe/filhas** (história com tasks) fica para quando a necessidade aparecer no uso.
- **Barra de status** (`core/src/sistema.rs`, `/api/sistema`, crate `sysinfo`): memória (principal, com barra) e CPU
  do app e de todos os processos filhos; clique mostra por workspace (cada terminal/agente pelo número da sessão,
  que a tela manda no websocket), a interface (WebView, uma só para todos) e o núcleo.
- **Tipos de propriedade** (no estilo do Notion): número inteiro, decimal (casas), percentual, moeda; data com hora;
  e-mail; telefone; "criado em" e "atualizado em" automáticas; **listas** (`config.lista`) de textos, números,
  datas, e-mails, telefones e URLs; item único (relação `um_so`) e lista de itens. Valores conferidos e ajeitados no
  banco (`normalizar_valor`); o menu de criar mostra cada molde; o menu da propriedade muda a config. MCP aceita a
  config em `criar_propriedade`. Fórmula e rollup ficam para depois.
- **Visão geral dos workspaces** (como o overview do Niri/Hyprland): Ctrl+Shift+O ou "Ver todos" no seletor. Um
  cartão por workspace (abertos primeiro): nome e ícone do item, esboço das metades e janelas (modo de cada metade,
  janela ativa, memória de cada terminal), memória e CPU dos terminais, aberto/guardado. Setas, Enter, Esc; digitar
  filtra; fechar workspace pelo cartão.
- **Atalhos configuráveis** (`src/atalhos.ts`): todos num registro (id, nome, grupo, padrão), comparados pela tecla
  física (`e.code`, sem confusão com AltGr/ABNT2). Mudanças em `preferencias.atalhos` (config.toml). Configurações →
  Atalhos: clique e aperte a combinação; recusa conflito e tecla sem modificador; voltar ao padrão por atalho ou
  todos. A lista do Ctrl+/ vem do registro. Os de dentro do texto (/, #código, Ctrl+clique, Ctrl+Z) não mudam.
- **Atualização testada de ponta a ponta (2026-10-31):** instalada a v0.1.1 da release; publicada a v0.1.2 pelo CI;
  a 0.1.1 aberta com `ATELIER_ATUALIZAR_SOZINHO=1` (e `ATELIER_HOME` de teste) achou a 0.1.2, baixou, instalou em
  modo silencioso e reabriu já na 0.1.2 (log em `%TEMP%\atelier-atualizacao.log`, `/api/saude` responde a versão).
  O app ficou instalado em `%LOCALAPPDATA%\atelier` (0.1.2). Instalador mantido (como VS Code, Discord, Obsidian):
  atualização sem clique, sem admin, e caminho fixo do `atelier-mcp` para os agentes.

## PONTO DE PARADA — 2026-10-31 (fim do dia)

Versão publicada e instalada na máquina do Paulo: **v0.1.2** (repo público `dunebuddy/atelier`, CI por tag,
atualização automática testada). O Paulo achou "bem utilizável". Para a próxima:
1. O Paulo usar de verdade (app instalado, dados reais em `~/atelier`) e trazer o que incomodar.
2. Instalar o MCP no Claude Code real (Integrações) e ligar os usos dos agentes.
3. Conferir na janela real o que só foi visto no navegador de teste: aviso de versão nova, seletor e visão geral dos
   workspaces, arrastar abas, exportar com a janela de salvar e o PDF.
4. Em aberto: deep link `atelier://item/<código>`; fórmula e rollup nas propriedades; contexto mãe/filhas (só se a
   necessidade aparecer); migração do posto `daily-work` (planejar com o Paulo; conteúdo da empresa fica em
   `privado/`).
5. Publicar versão: `node scripts/versao.mjs X.Y.Z`, commit, `git tag vX.Y.Z`, push da tag.

## 2026-11-01 — startup lento, bancada limpa, workspace da bancada

- **Startup de 12–15 s não é o atelier: é o Avast.** O Defender está desligado; o Avast segura executável sem
  assinatura fora das pastas que ele confia (a build em `C:\projetos\...\target` abre em 0,4 s; o mesmo exe em
  `%LOCALAPPDATA%\atelier` não chega nem ao `main` em 40 s). Medido com marcações de tempo no `run()` (já tiradas).
  Saída: exceção no Avast para `%LOCALAPPDATA%\atelier\*` (o Paulo faz); definitiva: assinar o executável.
- **Bancada nasce limpa** (migration 12 + `db::abrir`): só a visão fixa "Todos os itens" (`visoes.fixa`: não se
  apaga, ignora filtro, mostra até o histórico; muda só o layout) e a propriedade Status. Bancada antiga sem itens
  perde as sementes de trabalho ao abrir. Sumiu a opção "Trabalho" da bancada nova.
- Um só "Novo" (o da barra de cima; ficou o "+ Novo" no fim da tabela e nas colunas do kanban). Configurações só no
  rodapé da barra lateral.
- Workspace "Geral" virou **"Bancada"**: terminal e agente abertos nele nascem na raiz da bancada; no workspace de um
  item, na pasta do item (criada na hora, se ainda não tem).
- Configurações separadas: as do **app** na engrenagem da barra de título; as da **bancada** (nome, pasta, tipos e
  modelos, botão do workspace da bancada) no botão do rodapé da barra lateral. Um só "Novo" (o de cima).
- Painel: dividir cria a metade vazia; juntar não repete janela; fechar a última aba não fecha a metade; a alça entre
  as metades voltou a funcionar (um `.divisor` de outra tela a deixava com 1 px); terminal em cada metade, com
  "Explorador em árvore" (janela `pastas`) e "No explorador do sistema".
- **Ícone:** carimbo hanko em A (moldura gelo, A branco, fundo grafite), fonte em `src-tauri/icons/icone.svg`; a marca
  do app (`Marca.tsx`) segue o tema pelas variáveis `--marca-*`. Galerias das rodadas em `docs/icones-*.html`.
- Botão Novo piscava ao abrir: usava a classe `destaque` (a do item destacado pelo agente). Virou `bt-novo`.
- **Comando para o agente** (botão ✨ na barra de título, Ctrl+J): caixa flutuante editável, ↑ volta o último pedido,
  Win+H para ditar. Cada pedido chama o agente ligado como "Comando" (novo uso em Integrações; Claude com
  `--allowedTools mcp__atelier`), na pasta do atelier, com as instruções (`COMANDO_INSTRUCOES`), o estado da tela e as
  últimas 6 trocas da conversa (guardada no app; "Nova conversa" zera). Testado com o Claude real (MCP de teste via
  `--mcp-config`): trocou de bancada, criou item com pasta, abriu à esquerda e a pasta à direita em 18 s.
- MCP/tela ampliados: `bancadas`, `trocar_bancada`, `visoes`, `criar_visao`, `atualizar_visao`, `apagar_visao`,
  `apagar_item`, `restaurar_item`, `nao_consigo`; `tela` com `ACOES_TELA` (abrir item/visão/tipo/pasta/arquivo/lixeira,
  lado esquerda|direita, workspace, fechar_workspace, visao_geral, dividir, juntar, modo, fechar, focar, terminal,
  explorador_sistema, barra_lateral, tema, zoom, configuracoes, busca, estado...). A tela manda o que está mostrando
  para `/api/tela/estado`. O que o agente não sabe fazer vai para `~/atelier/pedidos-ao-atelier.md` e aparece um aviso.

- **Ditado local** (inspirado no Handy): catálogo em `modelos-ditado.json` (raiz do repo; o app lê do GitHub junto com
  a procura de versão e avisa modelo novo). Parakeet V3 (parakeet.js, IndexedDB) e Whisper tiny/base/small/large-v3-turbo
  (transformers.js, Cache Storage), num Worker (`src/ditado.worker.ts`), na CPU via WASM (ONNX Runtime da CDN, versão
  fixa; as cópias empacotadas são cortadas da build no `vite.config.ts`). Configurações → Ditado: baixar, escolher,
  apagar, nenhum; descarrega da memória depois de N minutos sem uso (padrão 5; o Worker é encerrado); a barra de status
  mostra enquanto está carregado. Microfone no Comando e na captura. Testado com voz sintética: Parakeet acertou a frase
  (36 s para baixar, 4 s para transcrever); Whisper Tiny erra nomes próprios.
- **Documentos no app**: PDF, HTML, Markdown, texto e imagem já abriam; entraram Excel (xlsx/xls/ods, CSV/TSV como
  tabela) e Word (.docx, via mammoth). .doc/.odt/.rtf mostram aviso e "abrir fora".
- Pedidos anotados: botão no Comando abre `pedidos-ao-atelier.md` (o explorador libera só esse arquivo fora da bancada).

### Na fila
- **Instalar o MCP no Claude Code real** (Integrações → Claude Code → Instalar) e marcar "Comando"; testar o botão ✨.
- Microfone na janela real (WebView2 pode pedir permissão na primeira vez): ainda não testado fora do navegador.
- Ler `~/atelier/pedidos-ao-atelier.md` de tempos em tempos e virar recurso.
- **Recursos (levantamento + o que era seguro):** a barra de status somava working set (páginas compartilhadas dos
  6 processos do WebView2 contadas várias vezes): agora soma memória privada no Windows (~500 MB viraram ~125–190 MB
  reais, quase tudo é o piso do WebView2). sysinfo mede só os processos do app. Terminal: sem órfão quando a abertura
  falha, PTY fechado antes do kill, `wait` no filho, sessão só é esquecida se for do mesmo pid. `/api/arquivo` em fluxo.
  Front: worker do pdf.js destruído ao fechar o PDF (vazava um por documento); janelas e workspaces escondidos não
  fazem polling nem ouvem focus (`src/visivel.ts`), o que também corrigiu soltar arquivo copiar para todos os itens
  montados e o filtro do agente valer para todas as visões; barra de status e contagem da lateral param com o app
  escondido; visão não redesenha sem mudança; ditado troca de modelo com Worker novo; lazy load do editor, xterm,
  Configurações, Exportar e marked (chunk principal 1,27 MB → 0,42 MB).

### Para conversar (recursos)
- Desmontar janelas que não são terminal em workspaces escondidos e abas inativas (ganho alto; perde rolagem e estado
  local ao voltar).
- PDF: desenhar só as páginas à vista (hoje até 300 canvases).
- WebView2 em modo de pouca memória quando vai para a bandeja (`SetMemoryUsageTargetLevel`); flags como `--disable-gpu`
  (o processo de GPU tem ~74 MB, mas o desenho piora).
- Terminal: matar a árvore inteira (Job Object), para agentes netos morrerem junto com o shell e com o app.
- Podar o histórico dos workspaces guardados (hoje até 50 passos por janela, para sempre).

## 2026-11-01 (tarde) — 0.1.4, roadmap e 0.1.5

- **0.1.4** saiu (correção expressa: tela segue o MCP, arrastar abas entre metades, histórico, tabela em uma linha,
  aviso de versão).
- **Roadmap:** `docs/ROADMAP.md` agrupa as pendências em pacotes (0.1.5 a 0.2.0) e ordena por segurança, quebrado,
  ganho no dia a dia e acabamento. Pedido novo entra em `PENDENCIAS.md` e, na triagem, ganha lugar num pacote.
- **0.1.5** (tabela de verdade + blindagem): guarda de `Host`/`Origin` na API, colunas reordenáveis e redimensionáveis
  guardadas na visão, comparador único (`src/ordem.ts`), MCP com `ordenar`/`colunas`/`larguras`, ícone grande da janela
  e permissões do WebView2 sem caixa (`ajustar_janela` em `src-tauri/src/lib.rs`), moldura da janela ativa por cima do
  conteúdo.
- **Lição:** o teste com `bun run tauri dev` obriga a fechar o atelier do Paulo (porta 7477 e instância única). Ele
  estava trabalhando. Até existir o teste sem janela (pendência), **perguntar antes de fechar o app dele**.

### Ponto de parada
- Próximo pacote: **0.1.6 · Relações viram visões** (filtro por relação no núcleo, "Apontado por" com contagem e grupo
  clicável, buscas prontas, "pode andar agora").

## 2026-11-01 (noite) — 0.1.6

- **Teste sem janela** (pedido do Paulo, depois de eu fechar o app dele no meio do trabalho): `bun run teste` sobe a
  API de teste na 7488 e a tela na 1430, com dados em `%TEMP%/atelier-teste`; abrir `http://localhost:1430` no
  navegador interno. O app instalado continua aberto. O navegador interno escondido não tira print: testar lendo o
  DOM (`javascript_tool`). Mudou o núcleo? Reiniciar o teste (o servidor é compilado ao subir).
- **Ícone da barra de tarefas:** era o cache de ícones do Windows pelo caminho do exe; `SHChangeNotify` resolveu na
  hora, e o app passou a mandar esse aviso ao abrir.
- **0.1.6:** "Apontado por" com contagem e lista ao lado (rota `consulta`), filtro "Tudo concluído" (`livres`) no
  núcleo, na tela e no MCP, lista de abas, barras de rolagem sempre à vista na tabela, arrastar coluna sem selecionar
  texto.

### Ponto de parada
- Próximo pacote: **0.1.7 · Workspaces e navegação** (Abrir workspace em toda lista, clareza do workspace, arrastar na
  barra lateral, espaço em disco, modo fita: completar a descrição com o Paulo).

## 2026-11-01 (noite, depois) — 0.1.7

- Pacote 0.1.7 feito e testado sem janela (`bun run teste`): MCP renomeado pelo instalador, ordem gravada na visão,
  "Abrir workspace" nas listas, menu com a pasta do workspace, arrastar na barra lateral, espaço em disco, fita como
  o Niri. Detalhes em `PENDENCIAS.md` → Feito.
- No navegador interno escondido o `requestAnimationFrame` não roda: o painel não liga a classe `animar` e as
  transições não aparecem. A animação da fita foi conferida pelo CSS aplicado; ver de verdade só no app.
- Gravação feita pela própria API de teste não muda o `data_version` (mesma conexão): a tela de teste não recarrega
  sozinha; recarregar a página.

### Ponto de parada
- 0.1.7 commitada, **sem tag**: gerar a versão com o ok do Paulo.
- Próximo pacote: **0.1.8 · Esquema completo pelo MCP + propriedades**.

## 2026-11-01 (noite) — 0.1.8

- O Paulo liberou executar o roadmap inteiro sozinho (versão, push, CI, próxima), com a 0.2.2 (item vira documento)
  no fim. Pendências triadas: tudo tem lugar no roadmap; ideias antigas em "Ideias, sem data".
- 0.1.8 testada sem janela, com o MCP apontado para o teste (`ATELIER_HOME=%TEMP%/atelier-teste`, `ATELIER_PORTA=7488`).

## 2026-11-01 (noite) — 0.1.9

- **Lição:** o TypeScript não pega gancho do React depois de um `return` antecipado; quebrou a página do item no
  teste (tela em branco). Sempre abrir uma página de item, uma visão e as Configurações no teste sem janela antes de
  soltar a versão, e olhar o console (`read_console_messages`).
- A ficha só fica à direita com a janela larga (> 860 px de container); o navegador interno é estreito, então ali
  ela aparece empilhada, como manda a regra.

## 2026-11-01 (noite) — 0.2.0

- Ditado testado sem janela: Whisper Tiny (baixar 7 s, transcrever 5 s) e Parakeet v3 (baixar 20 s sem carregar,
  carregar e transcrever 7 s). A economia de memória não dá para medir no teste (a "interface" medida lá é o
  servidor de teste); conferir no app pelo indicador. A opção da placa de vídeo só aparece habilitada na máquina com
  placa dedicada (a desta máquina é a Intel UHD 770): o caminho WebGPU não foi testado aqui.

## 2026-11-01 (noite) — 0.2.1

- O navegador interno escondido não roda `requestAnimationFrame` nem IntersectionObserver, e o pdf.js precisa de
  quadro de animação para desenhar: o PDF não dá para testar desenhando ali. Conferido: os lugares das páginas e o
  observador; o desenho, só no app.

## 2026-11-01 (noite) — 0.2.1, fim do roadmap

- Item vira documento só no que se lê. A primeira tentativa (um tokenizador que trocava em literais) se perdeu e
  mexeu em código (classes CSS, a chave `item:` dos workspaces, variáveis e tipos): desfeita. A que ficou troca linha
  por linha, só em frases e texto de JSX, com exceções para SQL, seletores CSS, "Work item" e a pasta `itens/`, e
  cada linha foi revisada. As migrações antigas não foram reescritas: a 13 renomeia a visão fixa.
- Fim do roadmap liberado pelo Paulo: 0.1.7 a 0.2.1 no mesmo dia, cada uma com o CI conferido antes da próxima
  (a 0.2.0 levou junto a parte de memória, que ficou pronta enquanto o CI da 0.1.9 rodava).

### Ponto de parada
- Roadmap concluído. Sobram as "Ideias, sem data" do ROADMAP.md e o que for chegando em PENDENCIAS.md.
- A conferir no uso (não dá no teste sem janela): ícone e permissões na janela de verdade, a economia de memória do
  ditado, a placa de vídeo no ditado (só na máquina com RTX), o PDF desenhando ao rolar e a ficha fixa com a janela
  larga.

## 2026-11-02 — 0.2.2, abrir com

- Pedido do Paulo: abrir os agentes com janela própria na pasta do workspace, do jeito do "No explorador do sistema".
  Pesquisa: o Claude registra no Explorer `claude.exe --os-entry=folder_verb <pasta>`; o app do ChatGPT (que engoliu
  o Codex em jul/2026, instalado pela Store) aceita `chatgpt-desktop.exe --open-project <pasta>` (conferido no
  `app.asar`); o DeepSeek Harness oficial não tem argumento de pasta (só `dsh://open`), então abre e copia o caminho.
- Novo `core/src/apps.rs`; rota `/api/apps`; `abrir-pasta` com `com: "app:<id>"`; MCP `tela` ganhou `app`.
- Explicado ao Paulo: o Claude Code do app desktop e o do terminal são o mesmo agente; o desktop dá mais ferramentas
  (navegador, lista de tarefas, sessões) e mais instruções.

### Ponto de parada
- A conferir no uso: abrir de verdade cada app (no teste sem janela só se viu o menu e a lista).

## 2026-11-02 (tarde) — pendências, segunda rodada do roadmap e 0.2.3

- Fase de polimento: o Paulo foi usando e pedindo; quase tudo só anotado em PENDENCIAS (ele pediu "vai juntando").
  Feito no master: Ctrl+Alt+setas da fita dentro do terminal.
- Revisão crítica dos pedidos dos agentes (`~/atelier/pedidos-ao-atelier.md`, esvaziado depois) e segunda rodada
  do ROADMAP (0.2.4 a 0.2.9), **ainda a aprovar**: ele vai rever a ordem.
- 0.2.3 sozinha com o crítico: a lista avulsa desfazia filtro e ordem a cada clique fora (`Visao.tsx`, efeito que
  comparava a visão pelo objeto). Reproduzido sem a correção e conferido com ela no teste sem janela.
- Combinado: quando o Paulo diz "isso tem que ir na primeira atualização", é para **planejar como prioridade**, não
  corrigir na hora (desta vez já estava feito e ele mandou fechar a versão só com isso).

### Ponto de parada
- Fechar com o Paulo a ordem da segunda rodada (ROADMAP.md) e começar pela 0.2.4.

## 2026-11-02 (tarde) — segunda rodada liberada; 0.2.4

- O Paulo liberou executar a segunda rodada como ontem (versão por versão, CI verde antes da próxima), sem
  atrapalhar o app dele (tudo no teste sem janela).
- 0.2.4: editor com tabela/imagem/código/Mermaid e ida e volta conferida (achou e corrigiu três perdas: a barra da
  célula, a imagem grudada e a lista de tarefas solta); `editar_trecho` e `em_lote` no MCP; `tela` com estado
  numerado e ids (testado: ler estado → fechar pelo id → abrir no painel 0); menus com segundo clique.
- Dica do teste sem janela: com o painel do navegador escondido, a página demora a carregar e o teclado não
  funciona; usar `javascript_tool` (ex.: `import('/src/ui.ts')` para abrir) e `cargo test --lib` (o
  `servidor.exe` do teste fica travado enquanto roda).
- 0.2.5: atalhos do VS Code (motor com extras e palavras escondidas; `dispararAtalho` executa uma ação apertando o
  atalho de mentira, é o que a lista de ações usa), barra de título, maximizar/Zen, terminal com Shift+Enter.
  Testado por script no teste sem janela (lista de ações, maximizar, Ctrl+B fora e dentro do editor, Zen e
  Esc Esc, ir ao terminal, busca nos atalhos). A tela cheia do Zen pede `core:window:allow-set-fullscreen`.
- 0.2.6: ficha em cima/recolhível, "mostrar do outro lado", lista dinâmica (espécie "lista", `db::lista_dinamica`,
  `config_de_lista` traduz nomes), bloco `atelier-lista` no texto (`POST /api/lista`), MCP com listas; migrações 14
  (`ligacoes`, gatilhos) e 15 (`mencoes`, `indexar_mencoes` em todo lugar que grava texto ou nota). Medido com
  `cargo test --release --lib volume -- --ignored --nocapture` (o rtk engole o println: usar `rtk proxy`).
- 0.2.7: notificações (`notificacoes.ts`, `components/Avisos.tsx`: pilha, sininho, seção, hooks, carinha),
  status dos agentes (`agentes.ts`, `core/src/hooks.rs`, `POST /api/agente/evento`, `atelier-mcp hook`). Testado
  com o hook de verdade (`ATELIER_SESSAO=<sessão> atelier-mcp hook esperando`) contra o teste sem janela: carinha,
  toast e sininho. Os hooks não foram instalados no Claude Code do Paulo (mexeria no settings.json real): conferir
  no uso, em Integrações. O Codex dele já tem um `notify`; o atelier não troca.
- 0.2.8: bancada por pedido (`api.rs`: `BANCADA_DO_PEDIDO` task-local, `escolher_bancada`, `com` abre a conexão
  da bancada pedida; CORS libera `x-atelier-bancada`), janela por bancada (`abrir_janela_bancada`, rótulo
  `bancada-<hash>`, capacidade `bancada-*`), `src/janela.ts` (marca todo fetch), confirmação de troca, agente preso
  (`ATELIER_BANCADA`), `atelier://` (tauri-plugin-deep-link + single-instance com deep-link). Testado sem janela:
  segunda aba com `?bancada=`, agente preso gravando na bancada dele, pergunta só na janela certa.
  Atenção: o `target/debug/atelier-mcp.exe` pode ficar velho; recompilar antes de testar pelo `mcp_teste.py`.
- 0.2.9: `core/src/consultas.rs` (CTE `documentos`, `rodar` só leitura com prazo, consultas salvas: migração 16),
  `core/src/formulas.rs` (avaliador pequeno; `calcular` em `ler_item` e `listar_itens`), visão com `filtro.sql`,
  tela `components/Consultas.tsx` (rota `{ v: "sql" }`), MCP `consultar`/`consultas`.

### Ponto de parada (fim da segunda rodada)
- Roadmap da segunda rodada concluído: 0.2.3 a 0.2.9 no mesmo dia, cada uma com o CI conferido antes da próxima.
- A conferir no uso (não dá no teste sem janela): janelas de bancada e `atelier://` no app de verdade; hooks
  instalados no Claude Code do Paulo; Zen em tela cheia; Shift+Enter no Claude Code dentro do terminal.
- Próximo: o que chegar em PENDENCIAS.md; ideias sem data no ROADMAP.md.
