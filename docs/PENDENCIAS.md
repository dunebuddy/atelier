# Pendências

Desde a 0.1.3 o Paulo usa o atelier de verdade, no dia a dia. Então nada vai direto para uma versão: tudo o que surgir
(pedido, bug, ideia, decisão em aberto) entra aqui primeiro, e cada release é montada escolhendo itens desta lista,
com cuidado para não quebrar o uso.

Como usar:
- Item novo entra em **Caixa de entrada**, com data e de onde veio.
- Na hora de montar uma versão, os itens escolhidos vão para **Próxima versão**; o resto fica.
- Quando sai a versão, os itens dela vão para **Feito**, com o número da versão.

## Próxima versão

(vazio — escolher da caixa de entrada)

## Caixa de entrada

### Bugs
- **Ícone velho na barra do sistema depois de atualizar para a 0.1.3** (2026-11-01, Paulo). Não corrigir sem montar
  a versão. O que já se sabe:
  - O executável instalado tem o ícone novo (extraído do `atelier.exe` e conferido) e o menu Iniciar mostra o novo.
  - Não há atalho fixado na barra de tarefas (`...\Quick Launch\User Pinned\TaskBar` só tem Explorer e Edge).
  - Durante a atualização ficou um `atelier.exe` preso (aberto às 14:35, sem caminho legível); foi encerrado à mão.
  - O cache de ícones do Windows já foi atualizado (`ie4uinit -show`).
  - Hipóteses, nesta ordem: (1) ícone "fantasma" na bandeja do processo encerrado, que só some ao passar o mouse;
    (2) a janela pega o ícone grande de outro lugar: a bandeja e a janela usam `app.default_window_icon()`
    (`src-tauri/src/lib.rs`), embutido na compilação a partir da lista `bundle.icon` do `tauri.conf.json` (começa
    por `icons/32x32.png`); conferir qual arquivo o Tauri escolhe e se a janela define o ícone grande (`ICON_BIG`);
    (3) cache da barra de tarefas por AppUserModelID (`com.paulo.atelier`), que só renova ao sair e entrar na conta.
  - **Afunilado (Paulo):** a bandeja está certa; o velho é o **botão do app na barra de tarefas**. Cai a hipótese 1
    (fantasma seria na bandeja) e a 2 fica improvável (bandeja e janela usam o mesmo `default_window_icon`). Fica a 3:
    cache da barra de tarefas por AppUserModelID, que não troca quando o exe muda. Confirmar reiniciando o Explorer
    (ou sair e entrar na conta). Se confirmar, decidir se o app/instalador força a renovação depois de atualizar (o
    instalador NSIS pode chamar `SHChangeNotify(SHCNE_ASSOCCHANGED)` no fim) ou se fica só como nota de "na primeira
    troca de ícone, reinicie o Explorer".
  - **Causa achada na 0.1.4 (2026-11-01; o Paulo mostrou o ícone ainda errado já na 0.1.4).** Medido na janela
    aberta: ela só tem o ícone **pequeno** (`WM_GETICON ICON_SMALL` = o A novo); o **grande** (`ICON_BIG`) está
    vazio e a classe da janela também não tem ícone. Esse grande é o que a barra de tarefas usa. Sem ele, o Windows
    cai no ícone guardado em cache para o exe, que ainda é o redemoinho padrão do Tauri das primeiras versões. A
    hipótese 2 estava certa e foi descartada cedo demais; o cache só explica por que aparece *o velho*.
    **Correção:** no `setup` (`src-tauri/src/lib.rs`), definir o ícone grande da janela principal com
    `WM_SETICON ICON_BIG`, usando o ícone embutido no exe (`LoadImageW` do recurso, 32/48 px pela DPI). Depois de
    instalar, conferir de novo com `WM_GETICON ICON_BIG`.

- **Ditado ocupa o dobro do modelo na memória** (2026-11-01, Paulo: interface em 1,6 GB depois de baixar o
  Parakeet). Medido: o renderer do WebView2 (onde roda o Worker do ditado) foi a 1.484 MB e voltou a 70 MB quando o
  modelo descarregou (5 min sem uso: a descarga funciona). Causa: o `parakeet.js` (`node_modules/parakeet.js/src/hub.js`,
  `getModelFile`) monta o arquivo inteiro num Blob, entrega ao ONNX Runtime por `URL.createObjectURL` e nunca revoga o
  link, então o Blob (~680 MB) fica preso ao lado da cópia que o ORT faz na memória WASM. Corrigir:
  1. ler os arquivos do modelo (IndexedDB) como bytes, passar ao ORT via `fromUrls`/sessão própria e soltar a cópia JS
     (esperado ~750–850 MB; abaixo do tamanho do modelo não dá no WASM);
  2. "Baixar" nas Configurações só baixa (hoje também carrega e deixa na memória);
  3. o indicador da barra de status mostrar a memória real (hoje repete o tamanho do arquivo, "~681 MB");
  4. talvez mostrar na lista de modelos quanto cada um ocupa carregado, não só o tamanho do download.
  Mais longe: rodar o ditado no núcleo Rust lendo o arquivo do disco (como o Handy); exige toolchain MSVC/clang.

- **Pílula de memória/CPU da barra de status ainda desequilibrada** (2026-11-01, print do Paulo na 0.1.3: encostada
  embaixo). Causa: `.corpo-app` tem `padding: 0 8px 8px 0` (`src/styles.css`), então os painéis terminam 8 px acima
  da barra de status, e esse espaço tem a mesma cor dela: na prática ~11 px em cima da pílula e 3 px embaixo (a
  medição anterior olhou só a barra de 24 px isolada). Correção recomendada: tirar o 8 px de baixo do `.corpo-app`
  (painéis encostam na barra) e dar à barra uma linha fina no topo (`border-top: 1px solid var(--borda)`), para ela ser
  uma faixa própria com a pílula centrada; alternativa do Paulo: cor de fundo diferente na barra ou sem pílula.

- **Barra lateral escondida: o painel encosta na borda esquerda** (2026-11-01, Paulo). O `.corpo-app` tem
  `padding: 0 8px 8px 0` (`src/styles.css`): a folga da esquerda vem da própria barra lateral; escondida (Ctrl+\), o
  painel cola na borda. Corrigir: com a barra fechada, folga de 8 px à esquerda, igual à da direita (classe no
  `.corpo-app` quando `fechada`, em `App.tsx`). Fazer junto com a pílula da barra de status (mesmo `padding`).

- **Ordenar pela coluna numérica ordena como texto** (2026-11-01, Paulo: "0, 1, 10, 11…"). Causa: o clique no
  cabeçalho da tabela (`Tabela` em `Layouts.tsx`, função `v` dentro de `if (ordem)`) passa todo valor por
  `String(x).toLowerCase()`. O botão "Ordem" da visão (`Visao.tsx`) já compara número como número. Corrigir: ordenar
  pela espécie da propriedade: número como número; data, criado em e atualizado em pela data; texto com
  `localeCompare("pt-BR", { numeric: true })` (assim "Etapa 2" vem antes de "Etapa 10", e acento não atrapalha);
  vazio sempre no fim. Melhor um comparador só, usado pelos dois lugares. Fazer junto com a reordenação de colunas
  (mesmo pedido, mesma tabela).

### Melhorias pedidas
- **Reordenar as colunas da tabela** (2026-11-01, Paulo: **relativamente prioritária**). Escolher a ordem: "essa
  coluna primeiro, depois essa", e a ordem fica guardada. Hoje a visão já guarda quais colunas aparecem
  (`config.colunas` em `Visao.tsx`), mas ao marcar ou desmarcar no menu "Propriedades visíveis" a lista volta para a
  ordem das propriedades do tipo (`props.map(...).filter(...)`), então a ordem escolhida se perde. Fazer:
  - arrastar o cabeçalho da coluna para o lado na própria tabela (eventos de ponteiro, como as abas do painel:
    o arrastar HTML5 não funciona no app instalado) e também arrastar a linha no menu "Propriedades visíveis";
  - gravar a ordem em `config.colunas` da visão; marcar uma coluna nova põe no fim, sem reordenar as outras;
  - a coluna Título continua fixa na primeira posição;
  - o mesmo vale para a Lista compacta, que usa as mesmas `colunas`.
  Hoje só as visões têm tabela. "Dentro do item" pode querer dizer a ordem das propriedades na ficha do item, que
  vem do tipo: confirmar com o Paulo se é para reordenar lá também.
- **Permissões do WebView sem pedir** (2026-11-01, Paulo). Hoje o WebView2 abre o pedido dele (microfone para o
  ditado, ler a área de transferência ao colar, etc.): uma caixa escura solta, às vezes fora da janela. O app é do
  Paulo e só carrega a própria tela, então essas permissões já vêm concedidas. Como: no `setup` do `src-tauri/src/lib.rs`,
  `webview.with_webview` → `CoreWebView2::add_PermissionRequested` (crate `webview2-com`) respondendo `ALLOW` sem
  mostrar nada; no Linux, o sinal `permission-request` do WebKitGTK. **Só para a origem do próprio app**
  (`tauri.localhost` / `localhost:1420`): o visualizador de HTML do explorador roda página de fora em iframe
  (`localhost:7477`, com scripts) e esse continua sem permissão. Liberar só o que o app usa (microfone, área de
  transferência, notificações); câmera, localização e o resto seguem negados, sem caixa.
- **Configurações → Geral (janela e sistema)** (2026-11-01, Paulo). Juntar numa página só as opções de como o app se
  comporta no Windows (hoje "fechar vai para a bandeja" está escondido em Automação):
  - **Fechar (×)**: vai para a bandeja ou fecha de verdade;
  - **Minimizar**: vai para a bandeja (some da barra de tarefas) ou minimiza normal;
  - **Iniciar com o sistema** (desligado por padrão; plugin `tauri-plugin-autostart`), e junto **iniciar escondido na
    bandeja**;
  - talvez: mostrar ou não o ícone na bandeja.
  A seção "Idioma" pode virar parte dessa página.
- **Barra lateral: arrastar para reordenar visões e grupos** usa o arrastar HTML5 (`Sidebar.tsx`), o mesmo que o Tauri
  bloqueia no Windows: provavelmente não funciona no app instalado. Trocar por eventos de ponteiro, como as abas do
  painel na 0.1.4 (`Painel.tsx`).
- **"Apontado por" com contagem e grupo clicável que vira visão** (2026-11-01, Paulo). Em `Relacoes.tsx`, cada grupo
  (o nome inverso da propriedade de relação: "Filhos" de Pai, "Gerou" de Nasceu de, "Itens do projeto" de Projeto, e
  "Mencionado em" para quem cita o #código) passa a mostrar a contagem, ex.: "Filhos (7)". Clicar no grupo abre uma
  **visão avulsa** ao lado com esses itens (tabela, colunas do tipo, histórico escondido por padrão, filtros, busca),
  com "Salvar como visão" para guardar no menu. Ex. do Paulo: "os filhos deste item que ainda não estão concluídos"
  em um clique, sem criar visão à mão. Precisa de filtro de visão por relação ("Pai contém #código"), que hoje a visão
  não tem: acrescentar em `db::Filtro`/`listar_itens` (`json_each` na propriedade) e no editor de filtro.
- **Buscas inteligentes a partir de um item** (mesma conversa): atalhos prontos tipo "filhos em aberto", "o que este
  item bloqueia", "itens do projeto por status". Começar pelo item acima e ver o que mais faz falta no uso.
- **Deixar claro em qual workspace se está** (2026-11-01, Paulo: abriu o explorador "do item" e veio a raiz da MDB;
  provavelmente estava no workspace da bancada com o item aberto numa janela, e aí a regra é abrir na pasta do
  workspace). Hoje o workspace só aparece no seletor da barra de título e no rodapé ("Workspace: …"), fácil de não
  ver. Ideias para decidir com o Paulo:
  1. o menu do terminal e do explorador diz de qual pasta se trata ("Pasta do workspace: bancada MDB" / "… do item
     #d475363") e, se o item da janela em foco não é o do workspace, oferece também "Pasta deste item";
  2. página de item aberta fora do próprio workspace mostra um aviso discreto com o botão "Abrir o workspace deste
     item";
  3. destaque visual do workspace atual (cor/ícone do item no seletor e uma faixa fina no painel), diferente para o
     da bancada;
  4. (mudança de regra, só com o ok dele) no workspace da bancada, as ferramentas usarem a pasta do item da janela em
     foco.
  - **Decidido (Paulo):** em todo lugar que um item aparece numa lista, ao lado da ação de abrir, uma ação **"Abrir
    workspace"** (ícone pequeno, aparece no hover): linhas da tabela e da lista, cartões do quadro, linha do tempo,
    busca rápida (Ctrl+K), chips de relação, e a **árvore da barra lateral** (os itens e filhos de uma visão, ex.:
    Projeto). Usa `abrirWorkspace({ id, titulo, icone })` de `src/components/Workspaces.tsx`. Arquivos: `Layouts.tsx`,
    `Arvore.tsx`, `BarraTitulo.tsx` (BuscaRapida), `Valor.tsx` (chips), `Visao.tsx`/linha do tempo.
- **Ficha do item: coluna fixa à direita com rolagem própria** (2026-11-01, Paulo gostou da ficha). Hoje ela gruda no
  topo ao rolar (sticky), mas quando é mais alta que a tela o fim dela só aparece quando a página chega ao fim — numa
  página longa, demora. Quero: a página do item em duas colunas, cada uma com a sua barra de rolagem (texto à esquerda,
  ficha à direita, altura da janela, `overflow: auto`). **Detalhe do Paulo:** com a janela estreita, a ficha em cima
  do texto (como hoje) está ótima, manter; quando a janela é larga o bastante para ela caber à direita, ela fica fixa à
  direita e sempre à vista enquanto a página rola. Onde: `src/components/PaginaItem.tsx` e o estilo da ficha em
  `src/styles.css`. Conferir junto: num print, o texto da página parecia cortado na beirada encostada na ficha
  ("sa-", "sh ."), talvez a ficha por cima do texto.
- **MCP: apagar propriedade (e o resto do esquema)** (2026-11-01, uso real: o agente tirou "Projeto" dos tipos mas não
  conseguiu apagá-la, e ela ficou sobrando na bancada). Hoje o MCP cria tipo/propriedade e liga/desliga propriedade de
  tipo (`ligar_propriedade` com `remover`), mas não apaga nem renomeia. Acrescentar: `apagar_propriedade` (avisar
  quantos itens têm valor nela e pedir confirmação ao usuário antes, como em `apagar_visao`), `renomear_propriedade`,
  `apagar_tipo` e `renomear_tipo`, usando as funções que a tela já usa (`db::apagar_propriedade`, `db::apagar_tipo`...).
  Conferir também o que mais a tela faz e o MCP não (opções de seleção: renomear, mudar cor, apagar; modelos).
- **MCP: criar bancada** (2026-11-01, primeiro uso real do Paulo, pedindo pelo agente do `daily-work`). O MCP lista e
  troca de bancada, mas não cria. Acrescentar `criar_bancada { nome, pasta? }` (pasta padrão: `~/atelier/bancadas/<slug>`),
  usando a rota que já existe (`POST /api/bancadas`, que nasce limpa), com `abrir: true` opcional; sem o app aberto,
  criar direto (`bancada::Config::acrescentar` + `db::abrir`).
- **Ditado: escolher onde o modelo roda, RAM (CPU) ou VRAM (placa de vídeo)** (2026-11-01, Paulo). Em
  Configurações → Ditado, uma opção "Processador (RAM)" / "Placa de vídeo (VRAM)". Hoje tudo roda na CPU via WASM
  (`src/ditado.worker.ts`: `backend: "wasm"` no Parakeet, `device: "wasm"` no Whisper). Na GPU seria WebGPU
  (`backend: "webgpu"` / `device: "webgpu"`). Cuidados:
  - o Parakeet em 8 bits dá resultado errado no WebGPU: na GPU precisa do encoder fp16/fp32 (download de 1,2–2,4 GB),
    então a escolha muda o arquivo a baixar; mostrar isso na tela;
  - detectar a placa (`navigator.gpu.requestAdapter()`, nome/memória quando disponível) e avisar quando a placa é
    integrada (ex.: a Intel UHD 770 desta máquina usa a própria RAM como VRAM: não economiza nada);
  - se o WebGPU falhar ao carregar, cair para a CPU sozinho e avisar.
  - **Decisão do Paulo:** a opção é um menu. Se a máquina não tem placa dedicada com VRAM própria (ex.: só a Intel
    UHD 770 daqui), "Placa de vídeo (VRAM)" aparece **desabilitada**, com o motivo, e fica só RAM. Na máquina dele com
    RTX, a opção fica disponível. A detecção tem de ser confiável: nome do adaptador (`requestAdapter().info`) e, se
    der, a memória dedicada lida pelo núcleo (no Windows, `HardwareInformation.qwMemorySize` do registro ou DXGI);
    placa integrada (Intel UHD/Iris, AMD Radeon integrada) conta como sem VRAM.
- **Título e × fixos nas janelas que sobem (modais)** (2026-11-01, Paulo): nas Configurações (ex.: Integrações), ao
  rolar, o título da seção e o × somem junto. Deixar o cabeçalho (título + ×) fixo no alto e só o conteúdo rolar,
  em todos os modais (Configurações do app e da bancada, Atalhos, Exportar, Comando...). Onde mexer: `.config-corpo`
  com `.fechar` posicionado dentro da área que rola (`src/components/Configuracoes.tsx`, `src/styles.css`); separar um
  cabeçalho fixo (`position: sticky; top: 0` com fundo) ou tirar o × e o título da área de rolagem.
- **Toast padrão:** o aviso de versão nova é o modelo; os outros avisos do app (`avisar`) devem seguir o mesmo visual.

### Recursos (mudam comportamento: precisam do ok do Paulo antes)
- Desmontar janelas que não são terminal em workspaces escondidos e abas inativas (ganho alto de memória; perde a
  rolagem e o estado local ao voltar).
- PDF: desenhar só as páginas à vista (hoje até 300 de uma vez).
- WebView2 em modo de pouca memória quando o app vai para a bandeja (ao voltar, a tela pode demorar um instante).
- Terminal: matar a árvore inteira (agente aberto no terminal morre junto com o shell e quando o app fecha).
- Podar o histórico guardado dos workspaces (hoje até 50 passos por janela, para sempre).

### Ideias antigas (ninguém pediu agora)
- Abrir o atelier por link (`atelier://`).
- Propriedades calculadas (fórmula; soma a partir de itens ligados).
- Migrar o posto `daily-work` para dentro do atelier.

### A conferir no uso
- Microfone do ditado na janela de verdade (só foi testado no navegador; o WebView2 pode pedir permissão).
- Comando para o agente com o MCP instalado no Claude Code real.
- Ler `~/atelier/pedidos-ao-atelier.md` (o que os agentes não conseguiram fazer) e trazer para cá.

## Do lado do Paulo (fora do código)
- Configurações → Integrações → Claude Code: instalar o MCP e marcar **Comando**.

## Feito
- **0.1.4** (2026-11-01, correção expressa do que atrapalhava o uso):
  - a tela mostra sozinha o que o agente faz pelo MCP: o núcleo vigia o `data_version` do SQLite a cada segundo e
    manda `mudou`; a tela recarrega esquema, visões, bancadas e o que está à vista;
  - arrastar aba entre as metades (eventos de ponteiro, sem o arrastar HTML5 que o Tauri bloqueia) e botão direito
    na aba: "Mover para a outra metade", "Fechar", "Fechar as outras desta metade";
  - histórico visível por padrão; "Esconder concluídos" guardado na visão (`esconder_historico`); filtro que pede um
    status de histórico mostra esses itens mesmo escondendo;
  - tabela em uma linha: texto cortado em "…" (inteiro no tooltip), listas com "+N", chip de item sem invadir a
    vizinha; opção "Quebrar linha na tabela" por propriedade;
  - aviso de versão nova refeito (título, mensagem, botões embaixo; o ícone do Instalar sumia pintado da cor do botão),
    uma instalação de cada vez, e aviso "Atualizado para a versão X" ao reabrir.
- **Avast** (2026-11-01, Paulo): exceção para `C:\Users\paulo\AppData\Local\atelier\*`; a abertura caiu de 12–15 s
  para instantânea.
- **0.1.3** (2026-11-01): bancada limpa com a visão fixa Todos os itens; instância única e bandeja; ícone carimbo em A;
  configurações do app e da bancada separadas; painel dividido corrigido e explorador em árvore; comando para o agente
  com MCP ampliado; ditado local (Parakeet e Whisper); Excel e Word no explorador; pedidos anotados; menos memória
  (medição honesta, vazamentos, lazy load); Sobre; barra de título só com ícones.
