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
