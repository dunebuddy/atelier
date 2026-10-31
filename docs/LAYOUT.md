# LAYOUT — ideias do Paulo para a janela (2026-10-31)

Ideias que o Paulo teve durante a noite de 30 para 31/10. **Implementadas em 2026-10-31** (fatias 7, 8 e 9; ver `SESSOES.md`).

## Nomes combinados

- **Barra da esquerda** (sidebar): visões, tipos, menu. "Importantíssima."
- **Painel de trabalho**: a área à direita, onde aparecem as listas e os itens abertos. A partir de agora é esse o nome.

## 1. Barra da esquerda

- **Redimensionar arrastando a borda**, não só esconder. Guardar a largura entre aberturas.
- **Voltar e avançar** na navegação ficam nela (hoje estão na barra de título).
- **Histórico de navegação** num dos dois jeitos (o Paulo aceita qualquer um): botão direito no voltar/avançar abre a
  lista dos últimos lugares, ou um botãozinho de drop-down ao lado com a mesma lista.

## 2. Painel de trabalho dividido em dois

- Um botão divide o painel em **dois**, como o "Split Editor" do VS Code. **Só dois** já basta.
- Cada metade funciona de forma **independente**: tem os seus itens abertos, a sua navegação e o seu modo.
- Dá para **arrastar** um item (aba/janela) de uma metade para a outra.
- Dentro de cada metade dá para abrir **vários itens**.

## 3. Três modos de organizar os itens dentro de cada metade

1. **Abas** (o normal): cada item aberto vira uma aba em cima; clica na aba para trocar.
2. **Tile, no estilo MonadTall do Qtile** (o Paulo lembrava como "Monetol"; usava e adorava): um item **principal**
   grande de um lado e os outros **empilhados** do outro lado; dá para promover um item a principal e ajustar a
   proporção.
3. **Fita, no estilo Niri** (tiling com rolagem): cada item abre **à direita** do anterior numa fita que rola na
   horizontal.
   - Largura de cada coluna em **frações** do painel: **1/1, 1/2 (padrão), 1/3, 1/4**. Não precisa ir além de 1/4 nem
     de porcentagens livres. Uma tecla alterna entre as larguras.
   - Como no Niri, uma coluna pode ter **mais de um item empilhado** (um embaixo do outro).
   - Exemplo de uso do Paulo: o item no meio e um **terminal** do agente numa coluna à esquerda.

## 4. Visões navegáveis na barra da esquerda (árvore, como no Notion e no Obsidian)

- O que existe **continua**: clicar numa visão abre a lista no painel de trabalho.
- **Novo:** cada visão na barra tem uma **setinha/maisinho** que **expande ali mesmo**, como sanfona, mostrando os itens
  dela embaixo. Clicar num item abre o item no painel de trabalho.
- **Correção do Paulo (sanfona não serve com muitas visões):** expandir uma visão **foca** nela: ela sobe para o topo
  da barra, as outras visões somem (em cima e embaixo), e a barra inteira fica só com a árvore daquela visão. Um botão
  volta para a lista de visões.
- Cada item da árvore também pode expandir e mostrar **os itens abaixo dele**. **Qual propriedade forma a hierarquia
  é configuração da visão**, igual para todos os itens dela (decisão do Paulo).
- **Princípio (palavras do Paulo):** "o nosso conceito é item, e itens têm propriedades. Quais são as propriedades?
  Depende da aplicação." O atelier **não conhece** pai, filho, bloqueio ou atraso; nada disso pode estar no código.
  Os nomes abaixo são só exemplos de propriedades que o Paulo poderia criar.
- **Relações não são fixas** (correção do Paulo): "pai de", "filho de", "bloqueado por" **não existem por padrão**. São
  **propriedades do tipo relação** (apontam para outros itens), criadas pelo Paulo quando ele quiser e ligadas aos
  tipos que ele escolher, como qualquer outra propriedade. Qualquer propriedade de relação que ele criar no futuro
  serve para montar a árvore.
  - Exemplo do Paulo, visão "Bloqueados": filtro "Bloqueado por" preenchido; abaixo de cada item aparecem os itens
    que estão no "Bloqueado por" dele, ou seja, **quem está bloqueando**.
  - Outro exemplo: "Todos os itens" com a propriedade "Pai" → abaixo de cada item, os filhos.
  - Na visão escolhe-se **a propriedade e o sentido** (os itens que ela aponta, ou os itens que apontam para ela).
  - Também pode ser "nenhuma" (lista plana). A mesma propriedade vale em toda a profundidade.
- **Mudança no modelo (anotação técnica):** hoje as relações são fixas (tabela `relacoes` com
  `pai`/`bloqueia`/`relacionado`/`absorvido`, painel Relações na página do item, ferramenta `relacionar` do MCP). Isso
  vira um **tipo de propriedade "relação"** (valor = lista de itens), com migration que converte as relações
  existentes em propriedades e mantém o "mencionado em" automático. O MCP passa a relacionar via `atualizar_item`
  como qualquer propriedade, e os filtros das visões ganham "relação contém / vazia / preenchida".
- A árvore **não se atualiza sozinha**: tem um **botão de recarregar** (na visão ou no topo da barra) para buscar
  novidades quando o Paulo quiser.
- Anotação técnica: carregar os filhos **só ao expandir** (preguiçoso) e cuidar de ciclos (A pai de B pai de A) para não
  expandir para sempre; um item que aparece de novo no mesmo ramo não expande.

## 5. Botão de terminal com escolha do tipo (como no VS Code)

- Um botão de terminal, como no VS Code. Ao lado dele dá para **escolher o tipo**: os shells da máquina (PowerShell,
  CMD, WSL, Git Bash; no Linux bash/zsh/fish) **e os agentes configurados** (Codex, Claude, Antigravity/Gemini, etc.).
- Entram na lista **os agentes configurados no atelier**, não tudo que estiver instalado.
- **Configurações → Agentes** (seção nova):
  - **detectar** os agentes da máquina e **testar se estão funcionando** (o executável existe e responde);
  - para cada agente, dois interruptores: **terminal ativo** (aparece no menu do botão de terminal) e
    **Executor** (chamar o agente sem terminal; ver [`AGENTES.md`](AGENTES.md));
  - vale para qualquer agente que dê para **abrir no terminal** ou **chamar para executar alguma coisa**.
- Hoje já existe uma lista fixa de agentes permitidos no terminal (`core/src/terminal.rs`) e a detecção das
  integrações MCP (`core/src/integracoes.rs`). A seção nova junta as duas coisas: a lista deixa de ser fixa e passa a
  vir da configuração.

## Consequências para a implementação (anotação técnica)

- O terminal e o explorador de arquivos, que hoje vivem num painel lateral do item, passam a poder ser **"itens"
  abertos** no painel de trabalho (uma aba, um tile, uma coluna da fita). Isso pede um modelo de "coisa aberta"
  genérico: item, visão/lista, terminal, arquivo, configurações, lixeira.
- O estado (metades, modo de cada uma, o que está aberto, larguras) deve **persistir** entre aberturas, como a largura
  da barra.
- Atalhos de teclado para: dividir, trocar de metade, trocar de modo, mudar a largura da coluna (fita), promover a
  principal (tile).
