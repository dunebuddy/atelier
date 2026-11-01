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

## 0.2.1 · Memória e desempenho

- PDF desenhando só as páginas à vista (hoje até 300 de uma vez).
- Podar o histórico guardado dos workspaces (passos de navegação antigos e workspaces de itens apagados).
- Fica de fora, de propósito: desmontar janelas escondidas (perderia a rolagem e o que estiver sendo editado; o
  ganho de memória não paga o risco no uso diário).

## 0.2.2 · Item vira documento (pacote sozinho)

Pedido do Paulo em 2026-11-01: a entidade central deixa de se chamar **item** e passa a se chamar **documento**. Nada
muda no comportamento, só o nome: tela, mensagens, MCP (descrições e nomes das ferramentas, com os nomes antigos
ainda aceitos para não quebrar agentes) e documentação.

## Ideias, sem data (fora do roadmap)

- Abrir o atelier por link (`atelier://`).
- Propriedades calculadas (fórmula; soma a partir de itens ligados).
- Migrar o posto `daily-work` para dentro do atelier (é trabalho no outro repositório, não aqui).

## Para conferir no uso

- Microfone do ditado e colar na janela de verdade (permissões do WebView2, 0.1.5).
- Comando para o agente com o MCP instalado no Claude Code real.
- "Bloqueia" com título antigo: só reabrir se aparecer fora da linha do tempo.
