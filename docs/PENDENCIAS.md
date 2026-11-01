# Pendências

Desde a 0.1.3 o Paulo usa o atelier de verdade, no dia a dia. Então nada vai direto para uma versão: tudo o que surgir
(pedido, bug, ideia, decisão em aberto) entra aqui primeiro, e cada release é montada escolhendo itens desta lista,
com cuidado para não quebrar o uso.

Como usar:
- Item novo entra em **Caixa de entrada**, com data e de onde veio.
- Na hora de montar uma versão, os itens escolhidos vão para **Próxima versão**; o resto fica.
- Quando sai a versão, os itens dela vão para **Feito**, com o número da versão.
- Os itens são agrupados em pacotes e ordenados em [`ROADMAP.md`](ROADMAP.md); item novo entra aqui e, na triagem,
  ganha lugar num pacote de lá.

## Próxima versão

(vazio — escolher da caixa de entrada)

## Caixa de entrada

> **Triagem de 2026-11-01:** tudo o que está abaixo já tem lugar no [`ROADMAP.md`](ROADMAP.md) (0.1.8 a 0.2.2; as
> ideias antigas ficaram em "Ideias, sem data"). Pedido novo entra aqui e ganha lugar lá.

### Bugs

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

### Melhorias pedidas
- **Ordem das propriedades na ficha do item** (sobra do pedido de colunas da 0.1.5): arrastar para reordenar na ficha
  (a ordem é a do tipo). Entra na 0.1.9 (o Paulo liberou o roadmap inteiro).
- **Configurações → Geral (janela e sistema)** (2026-11-01, Paulo). Juntar numa página só as opções de como o app se
  comporta no Windows (hoje "fechar vai para a bandeja" está escondido em Automação):
  - **Fechar (×)**: vai para a bandeja ou fecha de verdade;
  - **Minimizar**: vai para a bandeja (some da barra de tarefas) ou minimiza normal;
  - **Iniciar com o sistema** (desligado por padrão; plugin `tauri-plugin-autostart`), e junto **iniciar escondido na
    bandeja**;
  - talvez: mostrar ou não o ícone na bandeja.
  A seção "Idioma" pode virar parte dessa página.
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

### Pedidos do agente (de `pedidos-ao-atelier.md`, triados com o Paulo em 2026-11-01)
- **Linha do tempo com menos ruído.** Eventos automáticos no mesmo segundo e do mesmo tipo (ex.: 12 "Ligado: Filhos…"
  de uma vez) viram uma linha só, que abre ao clicar. Duplicado de verdade: criar a pasta grava "Pasta criada: …"
  (`core/src/pastas.rs`) e a mudança da propriedade grava "Pasta: …" (`db.rs`); ficar só com um. No MCP,
  `linha_do_tempo`/`ler_item` ganham `so_notas` (só o que alguém escreveu com anotar).
- **Propriedade com molde de link.** Guardar só o número de um chamado ou card (ex.: `17329`) e o app mostrar o link
  clicável a partir de um molde configurado na propriedade (`https://…/{valor}`). Vale para texto e número;
  editar continua editando só o número. Serve para os sistemas da empresa sem pôr nome nem endereço deles no código:
  o molde fica na propriedade, no banco do Paulo.

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
- Ler `~/atelier/pedidos-ao-atelier.md` (o que os agentes não conseguiram fazer) e trazer para cá. Lido em
  2026-11-01 (4 pedidos, triados acima).
- **"Bloqueia" com título antigo** (o agente notou "07 · Etapa 5…" com o número na frente). A relação guarda só o
  código e o título é lido na hora (`db::resumos`), então a lista de verdade acompanha a troca de título. O que
  guarda o título da época é a linha do tempo ("Ligado: Bloqueia #código título"), e isso é histórico: está certo.
  Se aparecer de novo fora da linha do tempo, anotar onde (ficha, tabela ou MCP) e reabrir como bug.

## Do lado do Paulo (fora do código)
- Configurações → Integrações → Claude Code: instalar o MCP e marcar **Comando**.

## Feito
- **0.1.7** (2026-11-01, workspaces e navegação):
  - atualizar com o MCP aberto não dá mais erro: o instalador renomeia o `atelier-mcp.exe` em uso para
    `atelier-mcp.antigo-N.exe` e põe o novo no lugar (`src-tauri/windows/ganchos.nsh`); as sobras saem ao abrir o app,
    na instalação seguinte e ao desinstalar (testado com um instalador mínimo e um exe travado);
  - a ordem escolhida se mantém: o clique no cabeçalho grava na visão (a mesma do botão "Ordem", que agora aceita
    Título, Tipo e Atualizado; o MCP também) e o desempate é por título e código; sem ordem escolhida segue "o que
    mexeu sobe" (decisão do Paulo);
  - "Abrir workspace" (ícone no hover) na tabela, na lista, no quadro, na linha do tempo, na árvore da barra
    lateral, nos chips de item e na busca rápida;
  - o menu do terminal diz "Pasta do workspace: <nome>" e, quando o item da janela em foco é outro, oferece "Pasta
    deste item" (terminal, explorador em árvore, explorador do sistema);
  - barra lateral: arrastar visões e grupos com eventos de ponteiro (funciona no app instalado);
  - espaço em disco na barra de status: o workspace do item (só ele e com os descendentes por Pai → Filhos) e a
    bancada inteira; medida no núcleo (`core/src/disco.rs`, sem seguir links, sem contar pasta dentro de pasta, vale
    5 minutos); MCP `espaco_em_disco`;
  - modo fita como o Niri: janela já à vista não mexe, a de antes fica junto quando cabe, senão a nova vem para o
    centro; desliza (0,26 s) com o corte acompanhando, em vez de surgir de repente.
- **0.1.6** (2026-11-01, relações viram visões + painel sem esconder nada):
  - "Apontado por" com contagem ("Filhos 5") e grupo clicável: abre ao lado uma visão avulsa (rota `consulta`) com os
    itens daquele grupo, os tipos deles, concluídos escondidos e "Salvar como visão"; "Mencionado em" também;
  - filtro "Tudo concluído" nas relações (`livres` no núcleo e na tela): todos os ligados estão em status de histórico,
    ou não há nenhum. Em "Bloqueado por" = pode andar agora. MCP: `livres` em `criar_visao`/`atualizar_visao`/`buscar`,
    e filtro de relação pelo código do item (`{"Pai": ["#abc1234"]}`);
  - o editor de filtro mostra "contém #código" nas relações; filtro de relação não conta mais como "pediu os
    concluídos de propósito";
  - abas: botão com a lista de todas as abas da metade, roda do mouse rola as abas, a ativa sempre à vista;
  - visão em tabela: a tabela rola dentro do cartão, que ocupa a altura da janela; as duas barras sempre à vista e o
    cabeçalho grudado no topo;
  - arrastar coluna não seleciona mais o texto da tabela;
  - o app avisa o Windows que o exe mudou ao abrir (o ícone da barra de tarefas renova depois de atualizar);
  - teste sem janela: `bun run teste` sobe só a API (porta 7488, dados em `%TEMP%/atelier-teste`) e a tela no Vite
    (porta 1430), ao lado do atelier aberto (`ATELIER_PORTA`, `ATELIER_ORIGEM`, `VITE_ATELIER_API`,
    `core/examples/servidor.rs`).
- **0.1.5** (2026-11-01, tabela de verdade + blindagem):
  - servidor local só atende esta máquina e a tela do app: `Host` de fora (DNS rebinding) e `Origin` de fora (site no
    navegador, HTML aberto no explorador) levam 403; o MCP e o curl continuam passando;
  - colunas da tabela: arrastar o cabeçalho muda a ordem, a alça na borda muda a largura (duplo clique volta ao
    automático), as duas guardadas na visão; marcar coluna nova põe no fim; "Voltar ao padrão" limpa ordem e larguras;
  - ordenação com um comparador só (`src/ordem.ts`): número como número, texto com "Etapa 2" antes de "Etapa 10",
    seleção e status pela ordem das opções, vazio no fim;
  - MCP: `criar_visao`/`atualizar_visao` com `ordenar`, `colunas` e `larguras`, mesclando com a configuração de antes;
    `visoes` mostra essas três com nomes;
  - janela no Windows com o ícone grande (o da barra de tarefas) e permissões do WebView2 respondidas sem a caixa:
    microfone, área de transferência e notificações só para a tela do app, o resto negado.
  - moldura da janela ativa numa camada por cima do conteúdo (a tabela que rolava pintava por cima da borda).
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
