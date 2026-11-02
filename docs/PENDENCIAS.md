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

- **Bug: andar na fita com o cursor num terminal** (2026-11-02, Paulo; corrigido no master, sem tag). Ctrl+Alt+←/→
  dentro de um terminal digitava "D"/"C" (o xterm engolia a tecla e mandava a seta ao shell). Agora os atalhos do
  painel e dos workspaces sobem do terminal para o app (menos Ctrl+W, que é do shell, e Ctrl+Alt+letra/número, que
  é o AltGr), e o teclado vai junto com o foco: indo para um terminal, é nele que se digita.

## Caixa de entrada

> **Triagem de 2026-11-01:** tudo o que está abaixo já tem lugar no [`ROADMAP.md`](ROADMAP.md) (0.1.8 a 0.2.1; as
> ideias antigas ficaram em "Ideias, sem data"). Pedido novo entra aqui e ganha lugar lá.

### Bugs

- **Menus suspensos não fecham clicando de novo no botão** (2026-11-02, Paulo). O seletor de bancadas lá em cima, o
  dos workspaces, o dos recursos (memória/CPU) e os outros: clicou, abriu; clicou de novo no mesmo botão, continua
  aberto. Só fecha clicando fora, com Esc ou escolhendo algo. Diagnóstico: todos usam o `usePopover`
  (`src/components/Popover.tsx`). O clique fora ignora o próprio botão, de propósito, e o `abrir` do botão só
  abre, não alterna. Correção numa linha só, valendo para todos: `abrir` fecha quando a âncora já é aquele botão
  (`setAncora(a => a === e.currentTarget ? null : e.currentTarget)`). Conferir os que abrem por atalho (Ctrl+N) e por
  botão direito (histórico do voltar), que passam pelo mesmo `abrir`.

- **Tabela markdown sai como texto corrido no editor, e editar pode apagá-la** (2026-11-02, Paulo, num documento
  de trabalho). Diagnóstico:
  - o banco está certo: o agente gravou uma tabela GFM válida (`| ✓ | Passo | O que é |` + `|---|---|---|`...), a
    mesma que mostrou; não houve "mostrou uma coisa e escreveu outra";
  - o editor (Tiptap 2 + `tiptap-markdown`) não tem a extensão de tabela. O markdown-it lê a tabela, mas sem o nó
    `table` o Tiptap descarta a estrutura e junta o texto das células num parágrafo só (o que apareceu na tela);
  - **risco de perda:** o editor só grava quando a pessoa edita (`onUpdate` → `getMarkdown()`), e aí regrava o corpo a
    partir do que tem na tela: qualquer edição nesse documento troca a tabela por texto corrido. Dá para voltar pelas
    versões do documento, mas é perda silenciosa. Vale para todo documento com tabela (os agentes fazem muitas).
  - Correção: instalar `@tiptap/extension-table`, `-table-row`, `-table-header` e `-table-cell` (2.x, a mesma
    versão do resto) e ligar no `Editor.tsx`; o `tiptap-markdown` já sabe gravar tabela de volta como GFM (célula com
    texto simples; célula com lista ou várias linhas ele grava como HTML). Mais o CSS da tabela nos temas e um teste
    de ida e volta (abrir, editar outra linha, conferir que a tabela continua igual no banco).
  - Enquanto não sai: não editar na tela documentos com tabela (o agente pode editar pelo MCP sem problema).
  - Junto, revisar as extensões do editor (pedido do Paulo). Hoje: StarterKit, lista de tarefas, link, menção e
    o prompt pendente. Avaliação (só entra o que o markdown sabe guardar, senão some ao gravar):
    - **Imagem** (`@tiptap/extension-image`): mesmo risco da tabela, e pior: `![](caminho)` some inteiro da tela e
      de uma regravação. Entra junto com a tabela.
    - **Bloco de código com cores** (`@tiptap/extension-code-block-lowlight` + `lowlight`): os agentes escrevem
      muito código; só muda a aparência, o markdown continua igual. Vale.
    - **Diagrama Mermaid** (bloco ```mermaid desenhado): não é extensão pronta, é um node view nosso com a lib
      `mermaid` carregada só quando aparecer. Os agentes usam bastante. Talvez depois.
    - Fora: sublinhado, marca-texto, alinhamento, cor (não têm markdown; viram HTML, e o editor está com
      `html: false`, então se perderiam ao reabrir) e "tipografia" (troca aspas e traços no texto dos agentes).
    - Cuidado com `html: false`: o `tiptap-markdown` grava como HTML a célula de tabela que tem lista ou várias
      linhas; ao reabrir, esse HTML não é lido. Testar e, se preciso, manter a célula simples.

### Melhorias pedidas

- **Barra lateral com Ctrl+B** (2026-11-02, Paulo: "em todos os outros softwares é Ctrl+B"). Hoje é `Ctrl+\`
  (`atalhos.ts`, id `menu`). Cuidado: no editor de texto Ctrl+B é **negrito** (Tiptap). Proposta: Ctrl+B esconde a
  barra em qualquer lugar menos digitando no editor, onde continua negrito (como o VS Code faz fora do texto); o
  `Ctrl+\` segue valendo também. Quem já mudou o atalho nas configurações fica com o dele.
- **Voltar/avançar na barra de título** (2026-11-02, Paulo). Os botões ← → (histórico da janela) estão no topo da
  barra lateral (`Sidebar.tsx`): escondendo a barra, eles somem e não há como voltar com o mouse. Subir para a barra
  de título, perto do seletor de bancada, como no app do Claude (que tem ← → lá em cima, junto da barra lateral).
  Levar o botão direito (lista do histórico) junto.

- **Pílula do disco para a direita, junto da de recursos** (2026-11-02, Paulo; ele gostou do indicador). Na barra
  de baixo, o espaço em disco está à esquerda, logo depois do "Workspace:"; levar para a direita, ao lado do ditado e
  da memória/CPU (`Workspaces.tsx`: `<IndicadorDisco>` vai para depois do `<span style={{ flex: 1 }} />`). Só
  reorganizar; mais detalhe no disco fica para depois. O popover dela tem o mesmo defeito do segundo clique (ver
  em Bugs).

- **Ícone no workspace da bancada** (2026-11-02, Paulo). É o único sem ícone na barra de workspaces e na lista (só a
  visão geral usa 🏠). Ele é fixo: sempre existe, pode ser fechado mas não apagado. **Decidido: o ícone do
  atelier** (o mesmo do app, pequeno; trocar também o 🏠 da visão geral, para ficar igual em todo lugar). (`Workspaces.tsx`: `info.icone` vem do documento; o da
  bancada, chave `GERAL`, não tem.)

- **Listas na ficha do documento com limite** (2026-11-02, Paulo). As propriedades de lista (relações, o lado inverso,
  e depois as listas dinâmicas) mostram tudo no bloco de informações do documento: com 100, ocupam a página toda.
  Mostrar os primeiros 5 ou 10 e um "ver mais" (ou uma paginação pequena para passar).

- **Esconder a metade esquerda do painel** (2026-11-02, Paulo). Trabalhando só nos terminais, em fita na metade
  direita, ele quer mais espaço sem ter de arrastar a divisória: uma opção para recolher a esquerda (e trazer de
  volta). Não é a barra lateral, que já esconde; é a metade do painel de trabalho.

### Pedidos do agente (de `pedidos-ao-atelier.md`, triados com o Paulo em 2026-11-01)

### Recursos (mudam comportamento: precisam do ok do Paulo antes)

- **Consultas: perguntar ao banco sem criar visão** (2026-11-02, Paulo). Na barra lateral, acima de Visões, um item
  "Consultas" (nome a decidir: query, consultas). Fazer uma consulta rápida no banco da bancada, ver o resultado e,
  se quiser, **salvar a consulta** (separado das visões: ele não quer uma visão, quer a consulta à mão) e **criar uma
  visão a partir dela**. A decidir: a linguagem (SQL de verdade sobre o SQLite, só leitura, com as propriedades
  expostas como colunas? ou o mesmo filtro das visões, em texto?), como o resultado aparece (tabela, contagem) e o
  MCP poder rodar e salvar consultas também.

- **Propriedades calculadas no tipo: listas dinâmicas e fórmulas** (2026-11-02, Paulo).
  - Hoje o "Filhos" da página não é fixo: é o rótulo inverso da propriedade de relação **Pai** (`inverso: "Filhos"`).
    Todo documento que aponta para este em "Pai" aparece ali, de qualquer tipo, misturado; cada propriedade de relação
    gera uma seção assim pelo nome inverso dela.
  - O pedido: uma espécie nova de propriedade, **lista dinâmica**, configurada no tipo. Ela é um filtro salvo, "os
    documentos dos tipos X (um ou vários) cuja propriedade de relação P aponta para este". Exemplo: no tipo Projeto,
    "Demandas" = tipo Demanda com Pai = este; "Anexos" = tipos Anexo, Nota e Arquivo com Pai = este. A relação P é
    qualquer uma (Pai é só uma propriedade, não algo fixo). Aparece na página e na tabela como as outras.
  - E **fórmula**: valor calculado de outras propriedades (soma, texto concatenado...), como no Notion.
  - Pensar junto: o que fazer com as seções de inverso que já aparecem (esconder quando uma lista dinâmica cobre a
    mesma relação?), contagem/soma sobre a lista (rollup), e o MCP criar e ler essas propriedades.
  - Como é hoje: o nome inverso só dá nome à seção; ela aparece sempre que alguém aponta (sem nome vira "Pai (de)"),
    não dá para desligar e não filtra por tipo.
  - **Decidido com o Paulo (2026-11-02): o jeito dele.** Hoje está automático e agressivo demais.
    - A lista do outro lado deixa de ser sempre: na propriedade de relação, uma **caixinha** (desmarcada por padrão)
      para mostrar do outro lado, com o nome dela. Marcada, vira uma propriedade dinâmica (lista) no outro lado.
    - "Inverso" é nome feio: achar outro, de banco de dados ("relação inversa", "mão dupla", "do outro lado"...).
    - E as listas dinâmicas mais completas (tipos X, relação P) vêm junto, porque algumas são mais que só o inverso.
    - Na migração: as relações que já existem mantêm a lista do outro lado ligada? (decidir; o Paulo quer menos
      poluição, então talvez só "Pai → Filhos").

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
- **0.2.2** (2026-11-02, abrir com):
  - no menu do terminal, a seção **Abrir com** abre fora do atelier, na pasta do workspace, os agentes com janela
    própria que estiverem instalados: **Claude (app)** (o mesmo "Open in Claude Code" do Explorer), **ChatGPT /
    Codex** (`--open-project`) e **DeepSeek Harness** (não aceita pasta: abre a janela e copia o caminho);
  - MCP: `tela` com `acao: "explorador_sistema"` e `app: claude|codex|deepseek`.
- **0.2.1** (2026-11-01, item vira documento):
  - em tudo o que o usuário lê, a entidade central se chama **documento**: tela, avisos, mensagens de erro, ajuda,
    exportação, linha do tempo, o CLAUDE.md das pastas novas e as instruções do MCP e do Comando;
  - a visão fixa passa a se chamar **Todos os documentos** (migração 13, só se ainda tinha o nome de origem);
  - MCP: `ler_documento`, `criar_documento`, `atualizar_documento`, `apagar_documento` e `restaurar_documento`; os
    nomes antigos (`ler_item`...) continuam aceitos;
  - de propósito, continua **item** no código, no banco (tabela `itens`), nas rotas e na pasta do disco
    (`<bancada>/itens/`): mudar isso não muda nada para o Paulo e quebraria dados e agentes (regra no CLAUDE.md).
- **0.2.0, parte 2** (2026-11-01, memória e desempenho; saiu junto na 0.2.0):
  - PDF: um lugar do tamanho certo para cada página (sem o limite de 300) e só as que estão à vista, com uma página
    de folga, são desenhadas; a que sai de vista solta o desenho (IntersectionObserver na vista);
  - workspaces guardados: o da bancada, os abertos e os 40 de item usados por último (`info.usado`); cada janela
    guarda os últimos 15 passos do histórico (na sessão continuam 50).
- **0.2.0** (2026-11-01, ditado):
  - o Parakeet não deixa mais a cópia do modelo presa: o worker monta o modelo com `getParakeetModel` +
    `ParakeetModel.fromUrls` e solta os links `blob:` que o parakeet.js criava e nunca revogava (era o "dobro");
  - "Baixar" só baixa (Parakeet: guarda os arquivos; Whisper: monta e desmonta o pipeline) e o Worker é encerrado;
    o modelo carrega no primeiro ditado;
  - indicador da barra de status com a memória medida de verdade (interface agora menos a interface antes de o
    modelo subir) e onde ele roda; a lista de modelos mostra quanto cada um ocupou carregado (maior medida);
  - Configurações → Ditado → "Onde o modelo roda": Processador (RAM) ou Placa de vídeo (VRAM, WebGPU; Parakeet com
    encoder em 32 bits, outro download). A placa é lida no registro do Windows (`/api/sistema/placas`,
    `HardwareInformation.qwMemorySize`); integrada (Intel UHD/Iris, Radeon de processador) ou sem WebGPU deixa a
    opção desabilitada com o motivo. Se a placa falhar ao carregar, volta sozinho para o processador e avisa.
- **0.1.9** (2026-11-01, acabamento e comportamento da janela):
  - barra de status como faixa própria (linha fina em cima, pílula no meio) e painéis encostando nela; com a barra
    lateral escondida, o painel tem a mesma folga dos dois lados;
  - Configurações: o × e o título da seção ficam à vista ao rolar;
  - avisos (`avisar`/`falhou`) no mesmo cartão do aviso de versão: ícone, mensagem, × e o Desfazer embaixo; erro com
    borda vermelha e 8 s na tela;
  - ficha do item: com a janela larga, gruda à direita e rola sozinha quando é mais alta que a janela
    (`.janela-corpo` virou container de tamanho, `max-height: 100cqh`); estreita, continua em cima do texto;
  - arrastar o nome de uma propriedade na ficha muda a ordem dela no tipo; e mudar as opções de um status não manda
    mais a propriedade para o fim (`tipo_por_propriedade` sem ordem mantém a que já tinha);
  - Configurações → Geral: fechar (×) e minimizar para a bandeja, iniciar com o sistema (chave Run do Windows;
    `.desktop` no Linux) e iniciar escondido (`--escondido`); escondido na bandeja, o WebView2 vai para pouca memória;
  - terminal: o shell e tudo o que ele abrir ficam num Job Object que morre junto (fechar a janela do terminal ou o
    app não deixa mais agente órfão); testado com um cmd que abre um ping.
- **0.1.8** (2026-11-01, esquema completo pelo MCP + propriedades):
  - MCP: `mudar_propriedade` (renomear, config), `apagar_propriedade` e `apagar_tipo` (primeiro dizem quantos itens
    são afetados; só apagam com `confirmado: true`), `mudar_tipo` (nome, ícone), `mudar_opcao` (renomear, cor,
    histórico, apagar) e `criar_bancada` (pela API com o app aberto, direto na config com ele fechado);
  - renomear ou apagar uma opção (na tela ou no MCP) atualiza os itens que a usavam (`db::mudar_opcao`; antes o
    item ficava com o nome antigo);
  - molde de link em texto e número (`config.molde`, `{valor}` marca onde entra): o valor aparece cru e sublinhado
    com o botão de abrir; configura no menu da propriedade ou pelo MCP;
  - linha do tempo: eventos automáticos do mesmo acontecimento (mesmo item, pessoa, segundo e tipo) viram uma linha
    "+N … no mesmo instante", que abre ao clicar; criar pasta não anota mais "Pasta criada" em dobro com "Pasta:";
    MCP `linha_do_tempo` e `ler_item` com `so_notas` (`db::nota_automatica`).
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
