# Requisitos — atelier (MVP)

Base combinada em 2026-10-30. É ponto de partida, não contrato: o Paulo vai moldando com o uso.

## 1. Modelo de dados

> **Princípio (Paulo, 2026-10-30, 2ª conversa): tudo maleável, como no Notion.** Nada de tipo ou campo fixo no
> código. Tipos e propriedades são **dados**, criados, renomeados e apagados a qualquer hora, pela tela ou pelo Claude
> ("vamos criar um tipo tal", "isso aqui agora é um desejo"). O sistema vai sendo moldado com o uso.

Um conceito central, o **Item**. Assim tudo pode se relacionar com tudo.

**Item** — o núcleo fixo é mínimo:
- `id`, `titulo`, `tipo`, `corpo` (markdown, editável ao vivo), `pasta` (opcional), `criado_em`, `atualizado_em`.
- Todo o resto (status, prioridade, prazo, espaço, tags, frente...) são **propriedades**, guardadas como valores
  ligados ao item, sem migration para campo novo.
- **Trocar o tipo de um item** a qualquer momento ("isso era task, agora é dívida"). Valores de propriedades que o
  tipo novo não usa ficam guardados, só não aparecem; voltam se o tipo voltar.

**Tipos** — criados à vontade, cada um com nome, ícone/cor e a **sua lista de propriedades**, que o Paulo põe e tira
quando quiser.

**Propriedades** — definidas **uma vez, globais**, e cada tipo escolhe quais usa. Assim uma propriedade como `frente`
ou `espaço` vale para dívida, task e o que vier, e "me traz tudo da frente X" atravessa os tipos. Espécies de
propriedade: texto, número, data, checkbox, URL, seleção, multisseleção, **status** (seleção com opções por tipo e
marca de "ativo" ou "histórico") e **relação** (aponta para outros itens).

**Sem tipo `frente`.** "Frente" é uma propriedade (seleção ou relação); se um dia uma frente precisar de página
própria, vira um item de algum tipo e a propriedade passa a ser relação para ele.

**Sementes** (só ponto de partida, editáveis): tipos `task`, `divida`, `pendencia`, `desejo`, `nota`; propriedades
`status`, `prioridade`, `prazo`, `espaço` (trabalho, fábrica, pessoal), `tags`, `frente`. Status semente:
- dívida: A FAZER · EM ANDAMENTO · A VALIDAR · ADIADA · FEITA · DESCARTADA · ABSORVIDA · ACEITA (FEITA, DESCARTADA,
  ABSORVIDA e ACEITA são "histórico" e não contam como ativas);
- pendência: aberta · aguardando terceiro · resolvida.

**Pastas.** O atelier trabalha **junto com as pastas**, não no lugar delas. Um item pode apontar para uma pasta no
disco (ex.: `...\daily-work\trabalhos\adoh-123-x\`), onde ficam os arquivos de trabalho. A tela abre a
pasta no Explorer/VS Code; o MCP devolve o caminho para o Claude trabalhar lá. Quando o Claude cria uma frente de
trabalho no posto, cria também o item e liga os dois.

**Código do item (decidido em 2026-10-30).** Cada item tem um **código de 7 hexadecimais** (`#a3f9c21`), sorteado
e único na bancada. Tamanho fixo: o Paulo não quer ID que "começa pequenininho e cresce" (1, 2, 3... nem 00042). É o
que aparece na tela, na busca (Ctrl+K acha pelo código) e no MCP. O id numérico existe só por dentro do banco.

**Modelo de pastas (implementado em 2026-10-30).** O Paulo pediu para não se prender ao
`trabalhos/<prefixo>-<num>-<slug>` do posto: os prefixos `adot`/`adoh`/`dmd`/`cvll` saem, porque achar pasta à mão
"se mostrou idiótico". Quem acha é o atelier; a pasta só guarda arquivos.
- **Dentro da bancada** (ver 3b), fora do repo (dado da empresa): `<bancada>/itens/`.
- **Plana, pelo código:** `itens/a3f9c21-painel-de-custos/` (título cortado em até 40 letras). O código nunca
  muda, então a pasta não precisa mudar quando o item troca de tipo, de espaço ou de frente.
  Nada de subpasta por espaço ou tipo (isso mudaria com o item e obrigaria a mover pasta).
- **Quem cria a pasta é o atelier**, nunca o agente à mão: botão "Criar" na ficha, ferramenta MCP `criar_pasta`, ou
  `criar_item` com `criar_pasta: true`. O Paulo vai operar quase sempre pelo agente ("cria essa task aqui"), então o
  padrão tem de ser imposto pelo atelier; as instruções do MCP dizem isso ao agente.
- **Dentro, sempre o mesmo esqueleto:**
  - `insumos\` — o que **entra** (pedido, prints, exports, planilhas, e-mails);
  - `artefatos\` — o que **sai** (scripts, docs, entregas);
  - `rascunho\` — trabalho intermediário do Claude, descartável;
  - `CLAUDE.md` — gerado pelo atelier: "esta pasta é o item #a3f9c21 (título, tipo); o registro vivo está no
    atelier, use o MCP para ler e anotar". Assim um agente aberto na pasta já sabe de que item se trata.
- **Pasta só quando precisa:** itens pequenos vivem só no banco.
- O texto, o status e a linha do tempo ficam **no banco**, não em `.md` na pasta (sem duas fontes de verdade).

**Diário (log do dia).** Uma entidade **Dia** que junta o que acontece no dia, como o `daily/AAAA-MM-DD.md` de hoje:
- **Entradas** com carimbo de hora e autor, capturadas sem atrito ("chegou isso aqui", nota rápida). Não obrigam a
  decidir nada na hora.
- Uma entrada pode **virar item** depois (de qualquer tipo, inclusive um tipo novo criado na hora: "isso vira o quê?
  task? dívida?") ou ser **ligada** a um item existente. A entrada fica no dia, com o link para o item.
- A página do dia mostra também o que andou nos itens naquele dia (notas da linha do tempo, mudanças de status).
- Não é prisão: dá para anotar direto num item sem passar pelo dia.

**Relações entre itens:** pai/filho, "relacionado a", "bloqueado por", "absorvido por" (via propriedades de relação
ou relações nativas, a decidir na implementação).

**Links:** URL + rótulo + tipo da ferramenta (ADO, chamados, GitHub, AWS, Snowflake, genérico). Vários por item.
Ícone por tipo.

**Acompanhamento:** uma linha do tempo por item, com notas datadas (texto em markdown + carimbo de hora + autor:
"Paulo" ou "Claude"). Equivale ao `## Log` dos docs de trabalho de hoje. Mudança de status entra sozinha na linha do
tempo.

**Anexos** (pode ficar para depois do MVP): arquivo guardado fora do banco, numa pasta do app, com referência no
item.

## 2. Telas

- **Tabela:** filtro por tipo, espaço, status, tag e prazo; agrupamento; ordenação; colunas escolhidas. Edição de
  status na própria linha.
- **Kanban:** colunas = status do tipo; arrastar muda o status e anota na linha do tempo.
- **Página do item:** cabeçalho com os campos, corpo em markdown com edição ao vivo, links, relações e linha do tempo.
- **Busca global** (atalho de teclado): título, corpo e notas (FTS5 do SQLite).
- **Visões salvas:** um filtro + layout com nome ("esperando terceiros", "dívidas da F2", "vence esta semana").
- **Relatórios simples:** o que andou na semana, o que vence, o que espera terceiros. Exportar para markdown.

## 3. Para o Claude: MCP + API

> **Estado (2026-10-30):** servidor MCP pronto, executável `atelier-mcp` (stdio, crate `mcp/`), lendo a bancada ativa
> do `config.toml` a cada chamada (funciona com o app fechado). Ferramentas: `esquema`, `buscar`, `ler_item`,
> `criar_item`, `atualizar_item`, `anotar`, `criar_pasta`, `criar_tipo`, `criar_propriedade`, `ligar_propriedade`.
> Tudo por nome (tipo, propriedade, opção nova vira opção sozinha); itens pelo código. A nota sai assinada com o nome
> do agente (Claude, Codex...). **Instalação nos agentes:** Configurações → Integrações (ver `docs/INTEGRACOES.md`).
> Controle da tela (`abrir`, `recarregar`...) ainda não: é a fatia 3.
>
> **Temas em arquivo:** `~/atelier/temas/*.toml` (Nord, Catppuccin Latte/Frappé/Macchiato/Mocha, Tokyo Night,
> Dracula, Gruvbox, One Dark, Solarized, Rosé Pine vêm prontos); o usuário cria o seu copiando um. De fábrica no CSS
> só Claro e Escuro.

O app sobe junto um **servidor MCP** e uma **API HTTP** locais (só `127.0.0.1`).

Ferramentas MCP mínimas:
- `buscar` (texto + filtros), `ler_item`, `listar` (visão ou filtro);
- `criar_item`, `atualizar_item` (campos, status, corpo), `anotar` (nota na linha do tempo);
- `linkar` (URL), `relacionar` (item ↔ item);
- **controle da tela:** `abrir` (vai para um item, uma visão ou uma busca), `recarregar`, `filtrar`, `destacar`.
  A interface escuta esses comandos por **websocket** e obedece. É o "vai na página disso aqui" do Paulo.

Requisitos:
- Funcionar com o app aberto. Se possível, também com o app fechado (o MCP lê e escreve o banco direto). Decidir
  na implementação.
- Documentar como registrar o MCP no Claude Code (`claude mcp add ...`), para o posto passar a usá-lo.

## 3b. Bancadas e configuração (decidido em 2026-10-30)

- **Bancada** = bancada de trabalho, como o vault do Obsidian: uma **pasta com tudo dentro**, o banco
  `atelier.db` e as pastas dos itens em `itens/`. Uma por cliente ou contexto (trabalho, fábrica, pessoal...). Backup ou
  levar para outra máquina = copiar a pasta.
- Fora das bancadas, só a pasta do atelier na home: **`~/atelier/`** (Windows `C:\Users\paulo\atelier`, Linux
  `/home/paulo/atelier`), com o **`config.toml`** (tema, idioma, lista de bancadas, qual está aberta). Bancadas novas
  nascem por padrão em `~/atelier/bancadas/<nome>/`, mas podem ficar em qualquer pasta. Sem banco central.
- **Cada bancada tem os seus próprios tipos**, propriedades, modelos e visões: uma pode ser o trabalho, outra uma
  aventura de RPG. Bancada nova nasce **em branco** (padrão) ou com os tipos de **trabalho**.
- Troca de bancada no rodapé do menu lateral; criar, abrir pasta existente, renomear e tirar da lista na tela de
  **Configurações** (Ctrl+,), que também tem Aparência e Idioma (só português por enquanto).
- **Windows e Linux** desde já: caminhos sem suposição de Windows, `xdg-open` no Linux, fontes embutidas.
- `ATELIER_HOME=<pasta>` troca a home do atelier (para testar sem mexer na real).

## 3c. Identidade visual (2026-10-30)

O Paulo quer a **estrutura** de um Notion (menu lateral, tabelas, páginas), mas com **identidade própria e
legalmente distinta** ("até as pílulas e o ícone de status estavam iguais"). Escolhas:
- **Barra de título própria** (janela sem moldura do sistema): marca, menu, voltar/avançar, trilha, busca rápida
  (Ctrl+K), Novo, Configurações e os botões da janela. Espaço para mais atalhos.
- **Moldura e folha:** barra e menu numa cor; o conteúdo numa folha arredondada por cima.
- **Página do item em duas colunas:** texto e linha do tempo à esquerda, **ficha** de propriedades à direita.
- Títulos em **Fraunces** (serifada), texto em **Inter**; ícones de propriedade próprios (bandeira para status);
  etiquetas em pílula com borda e marcador (anel = ativo, cheio = histórico); tabela em cartão com cabeçalho em
  versalete e barra de destaque na linha.

## 4. Como roda

- **App desktop com Tauri:** um executável que abre a janela e serve interface, API e MCP. Sem Docker, sem servidor
  à parte.
- **Banco SQLite** um por bancada (`<bancada>/atelier.db`), fora do repositório. Migrations
  versionadas. Backup = copiar o arquivo (um botão de backup é bem-vindo).
- Stack livre, a critério do Claude. Ferramentas na máquina: Node 22, Bun 1.4, Rust/Cargo 1.96.

## 5. Ordem sugerida (fatias que rodam)

1. Esqueleto Tauri + SQLite + migrations; **tipos e propriedades dinâmicos desde já** (criar tipo, pôr e tirar
   propriedade, trocar tipo do item); tela de tabela; página do item com markdown e pasta; criar e editar item.
1b. **Diário:** página do dia com entradas rápidas; transformar entrada em item ou ligar a um item.
2. Servidor MCP com buscar, ler, criar, atualizar e anotar. Registrado no Claude Code e testado de verdade.
3. Controle da tela pelo MCP (abrir, recarregar, filtrar).
4. Kanban, links, relações, linha do tempo, busca global.
5. Visões salvas e relatórios.
6. **Migração do posto** (`daily-work`): backlog de dívida (`relatorios/divida-tecnica-plataforma/
   backlog.md`, ~80 itens com frente, status, texto e refs), frentes (`trabalhos/*`), desejos (`desejos.md`) e
   pendências da memória. **Planejar com o Paulo antes**: o conteúdo é da empresa, então nada sai da máquina, e as
   skills e o `CLAUDE.md` do posto vão passar a usar o atelier.

## 6. Fora do MVP (por enquanto)

Sincronia entre máquinas, multiusuário, mobile, integração ativa com ADO e chamados (puxar dado sozinho). Link para
essas ferramentas, sim; integração, depois.
