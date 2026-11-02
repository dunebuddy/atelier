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

> **Triagem de 2026-11-02:** tudo o que está abaixo já tem lugar na segunda rodada do [`ROADMAP.md`](ROADMAP.md)
> (0.2.4 a 0.2.9) ou em "Ideias, sem data". Pedido novo entra aqui e ganha lugar lá.

### Bugs

### Melhorias pedidas

### Pedidos do agente (de `pedidos-ao-atelier.md`)

Revisão crítica de 2026-11-02 (o Paulo pediu: dizer o que não faz sentido, o que já existe e o que engessa o app).
O arquivo `~/atelier/pedidos-ao-atelier.md` foi esvaziado depois desta triagem, para não repassar os mesmos.

- **Linha do tempo com menos ruído, ADO com molde de link, visão "pode andar agora", ordenar visões** (01/11): já
  feitos na 0.1.8 a 0.2.0. Saem.
- **Tabela markdown embaralhada** (02/11): procede, e é pior que ele viu (editar na tela apaga a tabela). 0.2.4.
- **Abrir o próximo documento no mesmo lugar** (02/11): o diagnóstico procede (é bug nosso: o MCP joga fora o
  `estado`). A ação "substituir" que ele pediu **não**: é específica demais. No lugar, peças genéricas (id da
  janela, painel numerado, fechar/abrir por elas). 0.2.4.
- **`editar_trecho`** (02/11): **bom pedido**, genérico (o mesmo jeito do Edit de arquivo) e ainda protege a edição
  do Paulo na tela. Aprovado como ele desenhou. 0.2.4.
- **Tipo "Passo" + lista de filhos ordenada** (02/11), item por item:
  - criar o tipo Passo e tirar o `inteiro` da Ordem: **não é trabalho de dev**, o agente faz pelo MCP. É decisão de
    modelagem do Paulo: cada passo vira um documento (com status, responsável e bloqueio próprios) ou fica como
    checklist no texto. Com o `editar_trecho`, o checklist no texto deixa de ser caro; o Passo só vale se o passo
    precisar de status ou bloqueio próprios;
  - "lista de filhos na página do pai, ordenada, filtrando por tipo": procede, mas **não fixo em "filhos"**: é a
    lista dinâmica que o Paulo já pediu (tipos X + relação P + ordenar por uma propriedade). 0.2.6;
  - `ler_documento` com "filhos" resumidos: fixo em "filhos" **engessa**. Generalizar: as listas dinâmicas e o
    "apontado por" vêm resumidos (código, tipo, status, ordem). 0.2.6;
  - ordenar a Ordem com decimal: **já existe** (a ordenação de número é numérica; 1.5 vem antes de 10). Só falta
    tirar o `inteiro` da propriedade, pelo MCP;
  - tirar o tipo Passo da daily e do semanal: **já existe** (filtro por tipo das visões, `atualizar_visao`);
  - WAL e `busy_timeout` no SQLite: **já existem** (WAL, espera de 5 s). Índice nas relações: elas ficam em JSON nas
    propriedades, sem índice; hoje não pesa (vai para "Ideias");
  - criar/atualizar em lote: genérico, ok, mas depois (vai para "Ideias");
  - "task list `- [x]` no renderizador": não havia pedido anterior; o editor tem lista de tarefas. Conferir no teste
    do editor da 0.2.4.
- **Lista ao vivo dentro do corpo do documento** (02/11, 14:51): um bloco no markdown (cerca ```` ```atelier-lista ````
  com tipos, filtro, ordem, colunas e layout) que a tela troca por uma lista ao vivo, com a mesma consulta das
  visões; clicar abre o documento; mudar status ali; o `ler_documento` devolve o resultado junto. **Viável e bom**:
  - o markdown continua portátil: fora do atelier é só um bloco de código; e o editor grava o bloco como está, sem
    risco de perda (é um bloco de código para o markdown);
  - já existem as peças: o filtro das visões (`Filtro` em `db.rs`: tipos, propriedades, datas, "livres"), a
    janela de consulta (`{ v: "consulta", filtro }`, que a seção de relações usa) e os layouts lista/tabela/kanban;
  - funciona em **modelo** de tipo (os modelos já existem): cada task nova nasce com a lista dos seus passos;
  - **ressalva:** `filhos: true` fixa a relação "Pai" e **engessa**. No lugar, o mesmo filtro das visões com um
    valor especial **"este"** (o documento onde o bloco está): `Pai: este`, `Bloqueado por: este`... Assim serve
    para qualquer relação;
  - é o primo da lista dinâmica (a propriedade do tipo): **o mesmo motor** (filtro + "este" + ordenar) serve aos
    dois; a propriedade aparece na ficha, o bloco aparece onde for escrito no texto. Vai junto na 0.2.6.

### Recursos (mudam comportamento: precisam do ok do Paulo antes)

### Ideias antigas (ninguém pediu agora)
- Abrir o atelier por link (`atelier://`).
- Propriedades calculadas (fórmula; soma a partir de itens ligados).
- Migrar o posto `daily-work` para dentro do atelier.

### A conferir no uso
- **0.2.8 no app de verdade** (o teste sem janela não tem Tauri): abrir uma bancada em nova janela, fechar essa
  janela (fecha de verdade; a principal vai para a bandeja), clicar num link `atelier://doc/<código>` com o app
  aberto e com ele fechado, e a janela nova abrindo o documento de outra bancada.
- **Hooks dos agentes** (0.2.7): instalar em Integrações → Claude Code e ver a carinha mudar num agente de verdade.
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
- **0.2.10** (2026-11-02, bugs do uso):
  - **"Clicar em Filhos criou duas visões"**: não foi o clique (o "Filhos" da ficha já abre lista avulsa); foi o agente
    da calculadora, que chamou `criar_visao` para mostrar os passos, porque o MCP não tinha lista temporária. Agora
    `tela` com `acao: "abrir"` aceita `lista` (os campos de `criar_visao`) e abre sem salvar nada; a descrição de
    `criar_visao` diz que é só quando o usuário pede uma visão. As duas visões que já existem ficam (apagar à mão);
  - **terminal com texto "na borda" e desenho velho até maximizar**: faltava a tabela de larguras Unicode 11 no
    xterm (os agentes contam ⏺ ✻ ✅ como 2 colunas, o xterm contava 1); entrou o `@xterm/addon-unicode11`, e o
    terminal mede a fonte de novo quando ela termina de carregar e redesenha a cada ajuste de tamanho;
  - **Ctrl+V colava duas vezes no terminal**: o atalho lia a área de transferência e mandava, e o navegador também
    colava; agora só o navegador cola (com bracketed paste).
- **0.2.9** (2026-11-02, consultas e fórmulas):
  - **Consultas**, acima de Visões: SQL de verdade, só de leitura (conferido como só leitura, `query_only` e prazo de
    4 s), sobre `documentos` (uma linha por documento, uma coluna por propriedade, pelo nome entre aspas duplas);
    resultado em tabela, Ctrl+Enter roda, salvar à parte, e **virar visão** quando devolve `codigo` (a visão roda
    o SQL de novo a cada abertura, em qualquer layout). Escolha feita sem conversar (o Paulo liberou seguir): SQL,
    porque ele pediu "consulta no banco de dados"; trocar a linguagem é fácil se ele quiser;
  - **fórmulas** (espécie "formula"): `{Horas} * {Valor}`, texto com `+`, `conta({Lista})`, `soma({Lista}, "Prop")`,
    `media`, `min`, `max`, `arred`, `se(cond, então, senão)`; calculadas na hora (na ficha, na tabela e no MCP);
    erro aparece como "erro: ..." no valor;
  - **MCP:** `consultar` (sql, ou `nome` de uma salva; `salvar_como`), `consultas`, e `criar_propriedade` com
    `especie: "formula"` e `expressao`.
- **0.2.8** (2026-11-02, bancadas lado a lado e atelier://):
  - **uma janela por bancada:** no seletor de bancadas, o botão "abrir em nova janela" abre a bancada numa janela
    só dela (a que já está aberta só vem para a frente); a janela principal segue a bancada ativa;
  - **toda troca de bancada pergunta**, seja o Paulo clicando, seja o agente (`trocar_bancada` agora só pede: a tela
    pergunta e oferece "abrir em nova janela");
  - **cada agente preso à sua bancada:** o terminal passa `ATELIER_BANCADA`; o MCP usa essa (ou a da pasta onde o
    agente está, ou a ativa) e marca os pedidos à tela com ela, então a tela certa responde;
  - **núcleo:** cada pedido à API diz a bancada (`x-atelier-bancada` ou `?bancada=`) e a API abre a conexão dela;
    os eventos da tela e o estado da tela são por bancada; o "mudou" vale para todas as bancadas abertas;
  - **atelier://** (plugin deep-link): `doc/<código>` abre o documento na janela da bancada dele (abrindo a janela
    se for de outra), `visao/<nome>`, `bancada/<nome>`. Os agentes sabem (instruções do MCP).
- **0.2.7** (2026-11-02, notificações e status dos agentes):
  - **um sistema só de avisos:** todo aviso (avisar/falhou, desfazer, `nao_consigo`, versão nova, atualizado, agentes)
    passa por `src/notificacoes.ts` e aparece na mesma pilha, no canto escolhido (padrão embaixo à direita);
    toast com ação fica até mexer; X e clique fecham; mouse em cima segura;
  - **sininho** na barra de título com o contador e o histórico (até 200): apagar, desfazer, abrir, limpar tudo;
    os pedidos dos agentes (`nao_consigo`) aparecem lá com o nome de quem pediu;
  - **Configurações → Notificações:** posição, tempo, ação fica até mexer, só guardar, nível (tudo / erros e
    avisos / só erros) e assunto (app, agentes, atualização);
  - **status dos agentes:** "instalar hooks" em Integrações (Claude Code: começou, esperando, terminou; Codex:
    terminou, sem trocar um `notify` que já exista). O hook é o `atelier-mcp hook <evento>`, que só age com
    `ATELIER_SESSAO` (posto pelo terminal do atelier), manda só o evento e sai sempre limpo. O sino do terminal (BEL)
    também conta como "esperando". Carinha no seletor de workspaces: vermelho esperando, animação trabalhando,
    verde terminou (vira parado ao abrir o workspace), claro parado, cinza sem agente.
- **0.2.6** (2026-11-02, página do documento e listas dinâmicas):
  - **ficha em cima do texto**, recolhível numa linha ("Ficha ▸", vale para todos os documentos); com a janela larga,
    as propriedades em duas colunas; listas da ficha com os 8 primeiros e "ver mais";
  - **relação com "Mostrar do outro lado"** (caixinha, com o nome daquele lado): relação nova nasce sem aparecer do
    outro lado; as que já existiam continuam aparecendo (é só desmarcar);
  - **lista dinâmica** (espécie nova "lista"): "os documentos dos tipos X cuja relação P aponta para este",
    ordenada por uma propriedade (número em ordem numérica: 1.5 antes de 10), na ficha; não se escreve nela;
  - **lista ao vivo no texto**: bloco ```` ```atelier-lista ```` (tipos, relacao, ordenar com "-" para decrescente,
    colunas), com "/lista" no editor; mostra a tabela ao vivo, abre o documento e muda status ali; o mesmo motor;
  - **MCP:** `ler_documento` devolve `listas` (as da ficha) e `listas_no_texto` já calculadas, e o `apontado_por` com
    tipo e status; `criar_propriedade` cria lista (`lista_tipos`, `lista_relacao`, `lista_ordenar`) e relação com
    `outro_lado`;
  - **índices:** tabela `ligacoes` (mantida por gatilhos do banco) e `mencoes` (mantida por quem grava texto/nota);
    ler um documento com 100 filhos num banco de 20 mil caiu de 52 ms para 2,5 ms (teste `volume_relacoes`).
- **0.2.5** (2026-11-02, atalhos e barra de título):
  - **atalhos do VS Code** (padrões novos; cada ação aceita extras que valem enquanto não for mudada): Ctrl+P buscar
    (Ctrl+K segue), Ctrl+Shift+P lista de ações, Ctrl+Shift+F buscar no texto, Ctrl+B barra lateral (no editor
    continua negrito), Ctrl+\ dividir, Ctrl+1/Ctrl+2 painel 0/1, Ctrl+` ir ao terminal, Ctrl+Shift+` novo terminal,
    Ctrl+Shift+E explorador, Ctrl+PgUp/PgDn janela anterior/próxima, Ctrl+Shift+PgUp/PgDn mover, Ctrl+R
    workspaces (Ctrl+Shift+O segue). Os que não brigam com o shell valem com o cursor no terminal; Ctrl+W, Ctrl+B,
    Ctrl+J e Ctrl+R ficam com o terminal (Claude Code e shell usam);
  - **Shift+Enter no terminal** manda ESC+Enter (quebra de linha no Claude Code), como no VS Code do Paulo;
  - **lista de ações** (Ctrl+Shift+P, ou ">" na busca): todas as ações, achadas pelo nome ou por palavras
    escondidas ("aumentar janela" acha Maximizar);
  - **barra de título:** voltar/avançar (histórico no botão direito) e botão de teclado que abre Configurações →
    Atalhos, agora com busca (nome, palavras, combinação);
  - **maximizar a janela** (Ctrl+Alt+Shift+J, ou duplo clique na aba/cabeça): a ativa ocupa o painel inteiro, as
    outras ficam montadas (terminal vivo); **modo Zen** (F11): sem barras e em tela cheia, Esc duas vezes sai;
  - pílula do disco à direita, junto do ditado e da memória; a marca do atelier no workspace da bancada.
- **0.2.4** (2026-11-02, editor sem perda e MCP que enxerga a tela):
  - **editor:** tabela, imagem, código com cores e diagrama Mermaid aparecem e voltam para o markdown como
    entraram (teste de ida e volta: a barra `\|` da célula, a imagem em bloco próprio e a lista de tarefas
    compacta); "/tabela" e "/diagrama" no menu do editor; imagem com caminho relativo é lida da pasta do
    documento. A célula da tabela guarda uma linha só (com lista dentro, viraria HTML e se perderia);
  - **MCP `editar_trecho`:** troca um pedaço do texto (`de` → `para`, várias de uma vez, ou todas ou nenhuma) e a
    linha do tempo diz o que mudou ("Texto: ⬜ → ✅"), com a versão de antes guardada;
  - **MCP `em_lote`:** várias chamadas de escrever documentos numa só, para na primeira que falhar;
  - **MCP `tela`:** devolve a resposta (o `estado` vinha vazio); o estado numera os painéis (0, 1) e dá o id, a
    posição e o código de cada janela; `fechar`/`focar` pelo id; `painel: 0|1` em abrir, terminal, focar;
  - menus suspensos fecham no segundo clique no mesmo botão (todos usam o `usePopover`).
- **0.2.3** (2026-11-02, correção crítica, versão sozinha a pedido do Paulo):
  - a lista aberta ao lado (Filhos e outras relações, lista do tipo) não desfaz mais o filtro e a ordem ao clicar
    em outra janela: "Mostrar concluídos" e a ordem ficam valendo (`Visao.tsx` comparava a visão pelo objeto, que o
    painel recria a cada redesenho; agora compara pelo conteúdo). Reproduzido e conferido no teste sem janela;
  - Ctrl+Alt+←/→ (andar na fita) funciona com o cursor num terminal (antes digitava "D"/"C"), e o teclado vai
    junto com o foco.
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
