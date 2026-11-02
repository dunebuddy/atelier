# Roadmap

Montado em 2026-11-01 a partir de [`PENDENCIAS.md`](PENDENCIAS.md), que continua sendo a caixa de entrada (o detalhe
de cada item, com causa e arquivos, está lá). Aqui as pendências viram **pacotes**: coisas que mexem no mesmo lugar
andam juntas, para não abrir o mesmo código duas vezes. A ordem segue esta régua:

1. **Segurança** (alguém de fora conseguir mexer no app ou na máquina).
2. **Quebrado** (o app faz errado o que promete).
3. **O que mais facilita o dia a dia do Paulo** (ex.: contagens, clicar numa lista e já ter a visão pronta).
4. **Acabamento** (visual, conforto).
5. **Memória e desempenho** que mudam comportamento (só com o ok dele).

Cada pacote é uma versão candidata; o Paulo confirma antes de começar e antes de gerar a tag.

---

## 0.1.5 · Tabela de verdade + blindagem · **saiu em 2026-11-01**

O pacote que o Paulo marcou como prioritário, mais dois consertos pequenos que mexem no mesmo arranque do app.

**Segurança (pequeno, primeiro)**
- **Blindar o servidor local (porta 7477).** Os websockets (terminal e tela) já recusam origem de fora, mas as rotas
  HTTP não conferem o `Host` nem barram `Origin` estranho. Na prática: uma página maliciosa aberta no navegador
  pode mandar POST "simples" sem corpo (fazer backup, restaurar item ou nota) e, com o truque de *DNS rebinding*,
  falar com a API inteira, inclusive `/api/executar` e `/api/comando`, que rodam um agente. Não há sinal de que
  tenha acontecido. A correção é barata: aceitar só `Host` `localhost`/`127.0.0.1` na porta do app e recusar
  qualquer pedido com `Origin` fora da lista (o MCP e o próprio app continuam passando).

**Tabela (o pedido do Paulo)**
- Reordenar colunas arrastando o cabeçalho (e no menu "Propriedades visíveis"), ordem guardada na visão.
- Redimensionar colunas, largura guardada na visão; duplo clique volta ao automático.
- Ordenar número como número (hoje 0, 1, 10, 11) com um comparador único para o cabeçalho e para o botão "Ordem".
- MCP: `criar_visao`/`atualizar_visao` com `ordenar`, `colunas` (na ordem) e `larguras`, sem apagar o resto da
  configuração (hoje `agrupar_por` sobrescreve).

**Janela no Windows (mesmo `setup` do `lib.rs`)**
- Ícone certo na barra de tarefas (falta o ícone grande da janela).
- Permissões do WebView já concedidas, sem a caixa preta: microfone, área de transferência e notificações, só para a
  tela do próprio app.

Ficou para depois: a ordem das propriedades na ficha do item (confirmar com o Paulo) e o teste sem fechar o app
dele (ver `PENDENCIAS.md`).

## 0.1.6 · Relações viram visões + painel sem esconder nada · **saiu em 2026-11-01**

O que mais vai facilitar o dia a dia: sair de um item e ver na hora a lista que interessa. Tudo depende de uma peça
só, o **filtro por relação** no núcleo, por isso anda junto.

- **Filtro por relação** (`db::Filtro`): "Pai contém #código", "Bloqueado por: todos concluídos ou nenhum".
- **"Apontado por" com contagem** ("Filhos (7)") e **grupo clicável** que abre uma visão avulsa ao lado (tabela,
  concluídos escondidos, busca, filtros), com "Salvar como visão".
- **Buscas prontas a partir do item:** filhos em aberto, o que este item bloqueia, itens do projeto por status.
- **Visão "pode andar agora"** (pedido do agente): sai de graça com o filtro novo.
- MCP: o mesmo filtro em `criar_visao`, para o agente montar essas visões.

Junto (decisão do Paulo, 2026-11-01), correções do painel:
- **Muitas abas:** botão de lista à esquerda das abas (popover com todas, como o histórico do voltar), roda do mouse
  rolando as abas e a ativa sempre à vista.
- **Conteúdo largo:** barra horizontal sempre visível no rodapé do painel, junto da vertical (a tabela rola dentro do
  próprio cartão, que ocupa a altura da janela).

## 0.1.7 · Workspaces e navegação · **saiu em 2026-11-01**

Mexe nas mesmas listas (tabela, lista, quadro, árvore, busca, chips); vem depois da 0.1.5 para não brigar com ela.

- **Atualizar com o MCP aberto sem erro** (o instalador renomeia o `atelier-mcp.exe` em uso em vez de sobrescrever;
  ver `PENDENCIAS.md`).
- **A ordem escolhida se mantém:** clicar no cabeçalho grava a ordem na visão (igual ao botão "Ordem") e o
  desempate é fixo (título, código), para o item mexido não pular. Sem ordem escolhida, segue "o que mexeu sobe".
- **"Abrir workspace"** ao lado de "abrir" em todo lugar onde um item aparece (já decidido pelo Paulo).
- **Deixar claro em qual workspace se está** (decidido pelo Paulo: só o menu do terminal e do explorador dizendo de qual
  pasta é, "Pasta do workspace: bancada MDB", e oferecendo "Pasta deste item" quando o item da janela é outro).
- **Barra lateral: arrastar visões e grupos** com eventos de ponteiro (o arrastar HTML5 não funciona no app instalado).
- **Espaço em disco:** quanto o workspace ocupa (só ele e com os filhos) e quanto a bancada inteira ocupa.
- **Modo fita navegando como o Niri** (Paulo: "TUDO está errado, navegar nela não é natural como na fita do Niri";
  incomodam a janela grande sumir, a janela entrar encostada na borda e o pulo sem animação): rolagem animada; se a
  janela nova e a de antes cabem juntas, as duas ficam à vista; se não cabem, a nova vem para o centro.

## 0.1.8 · Esquema completo pelo MCP + propriedades · **saiu em 2026-11-01**

Para o agente parar de "sofrer" e para o uso com sistemas da empresa.

- MCP: apagar e renomear propriedade e tipo (com aviso de quantos itens têm valor), opções de seleção (renomear,
  cor, apagar), modelos, **criar bancada**.
- **Propriedade com molde de link:** guarda só o número, mostra o link clicável (molde fica no banco do Paulo).
- **Linha do tempo com menos ruído:** agrupar eventos automáticos do mesmo segundo, tirar o "Pasta"/"Pasta criada"
  duplicado; no MCP, `so_notas`.

## 0.1.9 · Acabamento e comportamento da janela · **saiu em 2026-11-01**

Tudo visual e de conforto, no mesmo CSS e nas Configurações. (Em 2026-11-01 o Paulo liberou executar o roadmap
inteiro, então os itens que pediam o ok dele entram.)

- Folgas do corpo do app: pílula da barra de status centrada e painel sem encostar na esquerda com a barra
  lateral escondida (mesmo `padding`).
- Título e × fixos nos modais.
- Toast padrão para todos os avisos (o aviso de versão é o modelo).
- Ficha do item fixa à direita com rolagem própria (em cima do texto quando a janela é estreita).
- Ordem das propriedades na ficha: arrastar para reordenar (é a ordem do tipo, vale para todos os itens dele).
- **Configurações → Geral:** fechar e minimizar para a bandeja, iniciar com o sistema (e escondido).
- WebView2 em modo de pouca memória quando o app vai para a bandeja.
- Terminal mata a árvore inteira de processos (hoje um agente aberto no terminal pode continuar rodando depois
  que o app fecha).

## 0.2.0 · Ditado · **saiu em 2026-11-01**

Um pacote só, porque tudo mexe no worker do ditado e na mesma tela de Configurações.

- Metade da memória: não deixar a cópia do modelo presa (hoje ~2× o tamanho do arquivo).
- "Baixar" só baixa; indicador mostra a memória real; lista mostra quanto cada modelo ocupa carregado.
- Escolher RAM ou VRAM (desabilitado sem placa dedicada).

## 0.2.0 (junto) · Memória e desempenho · **saiu em 2026-11-01, na 0.2.0**

- PDF desenhando só as páginas à vista (hoje até 300 de uma vez).
- Podar o histórico guardado dos workspaces (passos de navegação antigos e workspaces de itens apagados).
- Fica de fora, de propósito: desmontar janelas escondidas (perderia a rolagem e o que estiver sendo editado; o
  ganho de memória não paga o risco no uso diário).

## 0.2.1 · Item vira documento (pacote sozinho) · **saiu em 2026-11-01**

Pedido do Paulo em 2026-11-01: a entidade central deixa de se chamar **item** e passa a se chamar **documento**. Nada
muda no comportamento, só o nome: tela, mensagens, MCP (descrições e nomes das ferramentas, com os nomes antigos
ainda aceitos para não quebrar agentes) e documentação.

## 0.2.2 · Abrir com (agentes de interface) · **saiu em 2026-11-02**

- Abrir Claude (app), ChatGPT/Codex e DeepSeek Harness na pasta do workspace, como o Explorer (pedido de 2026-11-02).
- Depois, se fizer falta: Cursor, Goose, OpenCode desktop.

## 0.2.3 · Correção crítica da lista avulsa · **saiu em 2026-11-02**

Versão sozinha, a pedido do Paulo, antes de fechar a segunda rodada.

- A lista aberta ao lado (Filhos, outras relações, lista do tipo) parou de desfazer o filtro e a ordem a cada
  clique em outra janela.
- Ctrl+Alt+setas da fita com o cursor num terminal (já estava no master).

## Segunda rodada (proposta de 2026-11-02; o Paulo liberou executar em sequência)

Fase de polimento: o Paulo usa o app no dia a dia e nada grave está quebrado. A régua é a mesma de cima, com um
ajuste dele: **a prioridade é mais de UX do que de funcionalidade**, a não ser o que mexe com dado (risco de perder
texto) ou com o trabalho dos agentes. Tudo vem de [`PENDENCIAS.md`](PENDENCIAS.md) (o detalhe está lá) e dos
pedidos dos agentes de 01 e 02/11, revisados criticamente (ver "Pedidos do agente" em PENDENCIAS).

## 0.2.4 · Editor sem perda e MCP que enxerga a tela · **saiu em 2026-11-02**

O que pode perder dado ou faz o agente errar. Curto.

- **Editor:** tabela e imagem do markdown aparecem e sobrevivem a uma edição (hoje somem ao gravar); bloco de código
  com cores. Teste de ida e volta (abrir, editar outra linha, conferir o banco igual); conferir a lista de tarefas
  `- [x]`.
- **Diagrama Mermaid desenhado** no editor (bloco ```` ```mermaid ````; a biblioteca só carrega quando aparece um).
- **MCP `editar_trecho`** (pedido do agente, aprovado): troca um pedaço do corpo (`de` → `para`, falha se não achar
  ou se achar mais de um), várias trocas numa chamada, e a linha do tempo registra o que mudou em vez de "Texto
  editado". Não atropela a edição que o Paulo fez na tela.
- **MCP em lote:** criar e atualizar vários documentos numa chamada só (atômico), com uma linha só na linha do tempo
  do pai ("+3 ligados").
- **MCP `tela`:** devolver a resposta (hoje o `estado` volta vazio); o estado lista as janelas com id, o que
  mostram, **painel numerado** (0, 1) e posição; `fechar`/`focar` pelo id; `abrir` com `painel`.
- Menus suspensos fecham no segundo clique (o mesmo `usePopover` para todos).

## 0.2.5 · Atalhos e barra de título

O pacote de conforto que ele mais sente no dia a dia: igual ao VS Code dele.

- **Atalhos do VS Code** (proposta aprovada): o motor aceita mais de uma combinação por ação; Ctrl+P, Ctrl+B,
  Ctrl+\ dividir, Ctrl+1/2, Ctrl+Shift+`, Ctrl+`, Ctrl+PgUp/PgDn, Ctrl+Shift+PgUp/PgDn, Ctrl+R, Ctrl+Shift+E,
  Ctrl+Shift+F; **Ctrl+Shift+P** abre a lista de todas as ações com busca; Shift+Enter no terminal manda a quebra
  de linha do Claude Code.
- **Barra de título:** voltar/avançar sobem para lá (com o histórico no botão direito); botão de teclado que abre
  Configurações → Atalhos, agora com **busca e palavras escondidas** em cada atalho.
- **Maximizar a janela** (duplo clique na aba, Ctrl+Shift+Alt+J) e **modo Zen** (tela toda, Esc sai). Resolve o
  "esconder a metade esquerda".
- Miúdos: pílula do disco à direita, junto da de recursos; ícone do atelier no workspace da bancada (e na visão
  geral).

## 0.2.6 · Página do documento e listas dinâmicas

Tudo mexe na ficha, nas propriedades de relação e nas listas ao vivo; vai junto para abrir esse código uma vez.

- **Ficha em cima do texto e recolhível** (fica só "Ficha ▸"); listas da ficha mostram os primeiros e um "ver
  mais".
- **Relação com "mostrar do outro lado" opcional** (caixinha, desmarcada por padrão, com o nome daquele lado; achar
  nome melhor que "inverso"). Decidir na migração quais das atuais continuam aparecendo.
- **Listas dinâmicas:** propriedade do tipo, "documentos dos tipos X cuja relação P aponta para este", **ordenada
  por uma propriedade** (ex.: Ordem). Aparecem na ficha e na tabela. É o que o agente pediu como "lista de filhos
  ordenada", sem fixar "filhos".
- **Lista ao vivo dentro do texto** (pedido do agente): um bloco ```` ```atelier-lista ```` no markdown vira uma
  lista/tabela/kanban ao vivo, com o mesmo filtro das visões; clicar abre, dá para mudar o status ali; cabe nos
  modelos de tipo. **Um motor só** para ela e para as listas dinâmicas: o filtro das visões com o valor especial
  **"este"** (o documento aberto), em vez de "filhos" fixo.
- **MCP:** `ler_documento` devolve as listas dinâmicas, as listas do texto e o "apontado por" resumidos (código,
  tipo, status, ordem), sem a linha do tempo de cada um; criar e mudar essas propriedades pelo MCP.
- **Índices no banco** para as relações: elas ficam em JSON nas propriedades e as listas dinâmicas e as listas no
  texto vão consultar isso muito mais; medir com muitos documentos e indexar o que pesar.

## 0.2.7 · Notificações e status dos agentes

Para trabalhar com vários agentes ao mesmo tempo sem ficar procurando quem parou.

- **Um sistema só de avisos:** todos (rápidos, erros, desfazer, `nao_consigo`, versão nova, atualizado, ditado) na
  mesma pilha, no canto configurado (padrão embaixo à direita). Toast com ação fica até interagir; X e clique
  fecham; mouse em cima segura.
- **Sininho** na barra de título com histórico: apagar, agir, limpar tudo; os pedidos dos agentes (`nao_consigo`)
  aparecem lá. **Configurações → Notificações:** posição, tempo, só guardar, nível, assunto.
- **Status dos agentes por hooks:** "instalar hooks" em Integrações (Claude Code: começou, esperando, terminou;
  Codex: fim de turno; os outros, se tiverem), o terminal marca o agente com a sessão dele. Carinha em cada
  workspace e no botão dos workspaces: vermelho esperando > trabalhando (animação) > verde terminou > claro parado >
  cinza sem agente; bolinha no sininho; toast configurável.

## 0.2.8 · Bancadas lado a lado

Grande, e o bug que ele evita é raro (trocar de bancada com agente rodando).

- Toda troca de bancada pede confirmação (dele ou do agente pelo MCP).
- Cada agente preso à bancada em que nasceu (o terminal passa a bancada; o de fora usa a da pasta de onde abriu);
  toda resposta do MCP diz em que bancada gravou.
- **Várias janelas, uma por bancada**, no mesmo app; botão "abrir em nova janela" no seletor; abrir a que já está
  aberta só traz a janela para a frente.
- Terminais e workspaces de cada bancada continuam vivos.
- **Abrir o atelier por link** (`atelier://`): um link para um documento, uma visão ou uma bancada abre a janela
  certa (o atelier, se fechado; a bancada certa, se houver várias janelas). Serve para colar em outros apps e para
  os agentes mandarem links clicáveis.

## 0.2.9 · Consultas e fórmulas

Recursos novos e maiores; precisam de conversa antes (a linguagem da consulta, a sintaxe da fórmula).

- **Consultas** acima de Visões: perguntar ao banco, salvar a consulta à parte, virar visão a partir dela; o MCP
  também roda e salva.
- **Fórmulas:** propriedade calculada de outras (soma, texto junto...), e contagem/soma sobre uma lista dinâmica.

## Ideias, sem data (fora do roadmap)

- Abrir com: Cursor, Goose, OpenCode desktop (só se fizer falta).
- Cor própria por bancada, para reconhecer a janela pela miniatura (ele achou que talvez não precise).
- Migrar o posto `daily-work` para dentro do atelier (é trabalho no outro repositório, não aqui).

## Para conferir no uso

- Microfone do ditado e colar na janela de verdade (permissões do WebView2, 0.1.5).
- Comando para o agente com o MCP instalado no Claude Code real.
- "Bloqueia" com título antigo: só reabrir se aparecer fora da linha do tempo.
