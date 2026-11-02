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

- **Trocar de bancada derruba os agentes e desvia o MCP** (2026-11-02, pergunta do Paulo: "posso deixar o agente
  trabalhando numa bancada e ir para outra?"). Hoje **não**, por dois motivos (lidos no código, não testados):
  1. **Terminais morrem.** `aposTrocarBancada` (`App.tsx`) zera os workspaces (`setWs(null)`); as janelas desmontam,
     o xterm fecha o websocket e o núcleo mata o shell e o que roda dentro (`terminal.rs`: no fim do socket,
     `filho.kill()`). Agente em terminal do atelier cai.
  2. **O MCP segue a bancada aberta no app, a cada chamada** (`mcp/src/main.rs`, `abrir()` lê `cfg.ativa()`). Um
     agente trabalhando na bancada A passa a ler e gravar na B assim que o Paulo troca: cria documento no lugar
     errado, sem aviso. Vale também para agentes fora do atelier (Claude Code, Codex).
  - Correção pensada: (1) terminais e workspaces de cada bancada continuam vivos em segundo plano (só escondidos,
    como já acontece entre workspaces), com a memória na pílula de recursos; (2) cada agente fica preso à bancada em
    que nasceu: o terminal do atelier passa `ATELIER_BANCADA=<caminho>` para o processo e o MCP usa essa, não a
    ativa; o agente de fora usa a ativa no momento em que o MCP **inicia** (e `bancadas`/`trocar_bancada` mudam
    explicitamente). Toda resposta do MCP poderia dizer em que bancada gravou.
  - Até corrigir: **não trocar de bancada com agente trabalhando**.
  - O Paulo esclareceu (2026-11-02): trocar de bancada é raro e "tenso", não é para ser comum. O que importa é
    trocar de **workspace** (esse é seguro: os terminais de todos os workspaces abertos continuam vivos). E o MCP
    **`trocar_bancada` hoje troca na hora, sem perguntar**: passar a pedir confirmação na tela ("O agente quer mudar
    para a bancada X. Aceitar?"), e o agente só segue com o sim.

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

- **Status dos agentes: saber quando terminou ou está esperando** (2026-11-02, Paulo). Com vários agentes rodando em
  workspaces (e bancadas) diferentes, saber sem procurar quando um parou.
  - **Estados, do mais importante para o menos** (o indicador de um grupo mostra o mais importante dos agentes dele):
    1. **esperando ação** (pediu permissão ou fez pergunta): **vermelho**;
    2. **trabalhando**: uma **animação** (degradê que vai mudando; ele não gosta de amarelo);
    3. **terminou** (concluiu e não pediu nada): **verde**;
    4. **parado** (sem nada a fazer, já visto): **branco/claro**;
    5. **sem agente** no workspace: **cinza**.
  - **Onde aparece:** um ícone de agente (carinha) em cada workspace da lista lá em cima, à esquerda, ao lado da
    bolinha verde de "ativo"; o mesmo no botão que abre os workspaces (o resumo de todos); bolinha no **sininho**;
    e um **toast** configurável ("o agente de #código terminou" / "está esperando você"), que vai para o histórico.
    Abrir o workspace marca o "terminou" como visto (vira parado).
  - **Como detectar** (análise): (a) atividade do terminal: saindo texto = trabalhando; quieto por alguns segundos
    = parou; (b) o **sino** do terminal (BEL) e as notificações por escape (OSC 9/777), que o Claude Code e outros
    mandam quando precisam de atenção (o Claude Code tem a opção de canal de notificação "terminal_bell"/"iterm2");
    (c) o **título** que o agente põe no terminal (o Claude Code muda o título enquanto trabalha); (d) para o Claude
    Code, os **hooks** `Stop` e `Notification` podendo chamar a API do atelier, que dão "terminou" e "esperando"
    exatos (o atelier pode oferecer instalar esses hooks em Integrações). Codex tem o `notify` da configuração. O
    genérico (a, b, c) vale para todos; o exato (d) para quem tiver.
  - A frase cortada no fim do pedido era só "a mesma regra em outro lugar" (o Paulo não lembrou qual): coberto pelo
    botão que abre os workspaces.
  - **Decidido (Paulo, 2026-11-02): ir pelos hooks.** Em Configurações → Integrações, ao lado de "instalar MCP",
    um **"instalar hooks"** por agente. Desenho:
    - o hook chama o próprio `atelier-mcp` (ex.: `atelier-mcp hook esperando`), nada de script solto: é o binário
      que já está instalado, e ele avisa a API do atelier;
    - o terminal do atelier passa ao processo um `ATELIER_SESSAO=<id do terminal>`; o hook manda junto, e assim o
      atelier sabe **qual** workspace acender. Agente rodando fora do atelier não tem a variável: o hook não faz nada
      (ou, se valer a pena, avisa como "fora do atelier");
    - Claude Code: `UserPromptSubmit` (começou a trabalhar), `Notification` (esperando você), `Stop` (terminou);
      Codex: o `notify` da configuração (fim de turno). Os outros (Gemini, Copilot, Kiro...): conferir se têm hook;
      se não tiverem, ficam na detecção genérica (atividade, sino, título);
    - instalar mexe na configuração do agente do usuário (ex.: `~/.claude/settings.json`): mostrar o que vai entrar,
      juntar com os hooks que ele já tem (não apagar) e ter "remover hooks".
    - Desempenho e segurança (conferido, nada contra): o hook roda a cada evento, e o binário em Rust abre em
      milissegundos. Regras: **nunca travar o agente** (aviso em segundo plano, prazo curto, sai sempre com sucesso,
      mesmo com o atelier fechado ou desinstalado); mandar **só o evento e a sessão**, nunca o texto do prompt nem a
      conversa que o agente passa ao hook; a API continua aceitando só da própria máquina.

- **Trabalhar em duas bancadas ao mesmo tempo** (2026-11-02, Paulo; análise feita, decidir no roadmap).
  - Hoje: uma instância só (`tauri-plugin-single-instance`: abrir de novo traz a janela para a frente), uma API na
    porta 7487, uma bancada "ativa" na configuração, e o MCP de cada agente abre o banco da ativa a cada chamada.
  - **Caminho recomendado: um app só, várias janelas, cada janela com a sua bancada** (o Tauri abre várias janelas
    no mesmo processo). Uma bandeja, uma API, um MCP, e o núcleo sabe quais bancadas estão abertas. Abrir a bancada
    que já está numa janela só traz essa janela para a frente: é o que evita duas janelas na mesma bancada.
  - Duas instâncias separadas (processos) seria o caminho pior: precisa de uma porta por instância, o MCP teria de
    descobrir qual instância chamar, duas bandejas, duas atualizações.
  - **Agentes:** cada um fica preso à bancada em que nasceu. O terminal do atelier passa a bancada ao processo
    (`ATELIER_BANCADA`), e o MCP usa essa. Agente de fora (Claude Code, Codex) usa a bancada de onde foi aberto: se a
    pasta dele estiver dentro de uma bancada, é ela; senão, a da janela em foco quando o MCP iniciou. Toda resposta
    do MCP diz em que bancada gravou, e a `tela` age na janela da bancada certa.
  - **Mesma bancada em dois lugares faz diferença?** No banco, pouca: o SQLite já está em WAL com espera de 5 s, e
    hoje o app e vários MCPs já gravam no mesmo banco ao mesmo tempo sem problema. O risco é de tela: uma janela não
    vê na hora o que a outra mudou, e as duas mexem nas mesmas pastas, no backup e na migração. Por isso a regra "uma
    janela por bancada" basta, sem trava complicada.
  - Depende de: terminais e workspaces vivos por bancada (ver o bug de trocar de bancada).
  - **Aprovado pelo Paulo (2026-11-02), com a mecânica:**
    - no seletor de bancadas, clicar no nome troca a bancada **desta** janela, e **toda troca pede confirmação**,
      inclusive quando é ele que clica (e quando é o agente, pelo MCP);
    - ao lado de cada nome, um botãozinho **"abrir em nova janela"**: abre aquela bancada numa janela nova e não
      mexe na atual (se ela já está aberta em outra janela, só traz essa para a frente).
  - Ideia, só se fizer falta (ele mesmo achou que talvez não precise, porque o nome da bancada já aparece lá em
    cima): um **indicador visual por bancada**, uma cor própria em algum elemento (barra de título, borda), para
    reconhecer a janela de longe e pela miniatura da barra de tarefas, como ele faz no VS Code com um add-on que muda
    a cor por projeto. Mudar a cor da moldura do Windows não serve (não vale no Linux); a cor teria de ser dentro do
    app.

- **Notificações: sininho com histórico e configuração** (2026-11-02, Paulo). O aviso (toast) do `nao_consigo`
  apareceu e sumiu rápido demais (aviso comum fica 4 s; erro e "desfazer", 8 s) e não há onde rever. Pedido:
  - **sininho na barra de título**, perto das configurações, com contador; abre o **histórico**: cada notificação
    guardada, dá para apagar uma, **agir** sobre ela (abrir o documento, o arquivo, "desfazer" se ainda vale) e
    **limpar todas**;
  - fechar o toast não apaga do histórico;
  - **Configurações → Notificações**: onde o toast aparece (as posições comuns: cantos de cima e de baixo, direita e
    esquerda; ele quer garantir que fique sempre no mesmo lugar), quanto tempo fica, não mostrar toast (só guardar),
    **nível** (só erros / erros e avisos / tudo) e por **assunto** (ex.: não avisar de atualização; avisos de
    agentes; salvamentos...);
  - os avisos dos agentes (`falta`, e o que vier pelo MCP) entram no histórico com quem mandou.
  - O `nao_consigo` era uma "funcionalidade fantasma" para o Paulo (2026-11-02): o agente registra e só aparece um
    toast. Dar um lugar visível aos **pedidos dos agentes** (`~/atelier/pedidos-ao-atelier.md`): no histórico do
    sininho e numa lista própria (em Configurações ou na ajuda), com marcar como visto/triado.
  - **Um sistema só para todo aviso** (Paulo, 2026-11-02: "tudo que é toast, tudo que é notificação tem que estar
    integrado"). Hoje são dois lugares: os avisos rápidos (`avisar`/`falhou`, inclusive o do `nao_consigo`) saem
    **no meio, embaixo** (`.cartao-aviso.toast`), e os cartões de versão nova/atualizado saem **embaixo à
    direita** (`.cartao-aviso`). Passar todos (avisos, erros, desfazer, `nao_consigo`, versão, atualizado, ditado,
    status dos agentes) por um serviço único de notificações: mesma pilha, no canto configurado (padrão: embaixo à
    direita), um embaixo do outro quando vierem vários, todos no histórico e sujeitos às mesmas regras de nível,
    assunto e tempo.
  - A decidir: guardar no banco da bancada ou só enquanto o app está aberto (sugestão: no app, os últimos ~200).
  - Tempo e fechar (Paulo, 2026-11-02). Hoje: aviso comum some em 4 s; erro e "desfazer", em 8 s; o de versão
    nova fica até fechar; o de "atualizado" some em 12 s; todos já têm o X. Proposta: **toast com ação** (instalar,
    desfazer, abrir...) **fica até a pessoa interagir** (padrão; configurável para sumir também); toast sem ação
    some no tempo configurado; **X** em todos e **clicar no corpo** também fecha (ou faz a ação principal, quando
    for "abrir"); passar o mouse por cima segura o toast. O que sumiu sem interação fica no histórico do sininho,
    marcado como não lido.

- **Consultas: perguntar ao banco sem criar visão** (2026-11-02, Paulo). Na barra lateral, acima de Visões, um item
  "Consultas" (nome a decidir: query, consultas). Fazer uma consulta rápida no banco da bancada, ver o resultado e,
  se quiser, **salvar a consulta** (separado das visões: ele não quer uma visão, quer a consulta à mão) e **criar uma
  visão a partir dela**. A decidir: a linguagem (SQL de verdade sobre o SQLite, só leitura, com as propriedades
  expostas como colunas? ou o mesmo filtro das visões, em texto?), como o resultado aparece (tabela, contagem) e o
  MCP poder rodar e salvar consultas também.

- **Propriedades calculadas no tipo: listas dinâmicas e fórmulas** (2026-11-02, Paulo). **As listas dinâmicas, o
  "mostrar do outro lado" e a lista no texto saíram na 0.2.6; falta a fórmula (0.2.9).**
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
