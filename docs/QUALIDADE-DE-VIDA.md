# Qualidade de vida — análise tela a tela (2026-10-30)

Pedido do Paulo: olhar cada tela e listar tudo o que deixa o uso mais confortável. **Certeza alta → já
implementado** (dá para tirar depois). **Dúvida → lista para discutir**, com a minha recomendação.

## Já implementado

**Em todo lugar**
- **Data e hora em tudo**: cada entrada da linha do tempo, nota, linha de tabela e lista ("Atualizado"), cartão do
  quadro e cabeçalho do item (criado e atualizado), sempre `30/10/2026 18:55`. A hora exata, com segundos, aparece ao
  parar o mouse.
- **Tudo o que muda fica registrado**, com hora e autor (Paulo, Claude, Codex...): título, qualquer propriedade,
  tipo, pasta, texto. Várias edições de texto seguidas da mesma pessoa (até 30 min) viram uma entrada só.
- **Apagar não é permanente**: itens e anotações vão para a **Lixeira** (no menu). Lá dá para restaurar, apagar de vez
  ou esvaziar tudo. Item apagado aberto mostra um aviso com "Restaurar". **Pasta no disco nunca é apagada.**
- **Histórico de versões**: do texto do item (botão *Histórico*) e das anotações (clicar em "editada às..."). Restaurar
  uma versão não perde a atual, que também vira versão.
- **Atalhos**: Ctrl+K busca (acha pelo código também) · Ctrl+N novo item · Ctrl+, configurações · Ctrl+\ menu ·
  Alt+←/→ e os botões laterais do mouse para voltar e avançar.
- **Ctrl+clique abre link**, no texto e nas propriedades de URL. Clique simples continua editando.
- **Abrir pasta** em todo lugar onde há item: cabeçalho do item, linhas da tabela e da lista, cartões do quadro e
  entradas da linha do tempo.
- **Título da janela** (e da barra de tarefas) mostra onde você está.
- **Atualiza sozinho**: as visões releem a cada 15 s e ao voltar para a janela, então o que o agente fez aparece
  sem precisar recarregar.

**Página do item**
- Clicar no **código** (#a3f9c21) copia.
- **Duplicar** item (mesmo tipo, propriedades e texto).
- **Anotações editáveis e apagáveis** (vão para a lixeira); "editada às..." fica visível.
- Caixa de anotação com **várias linhas** (Enter anota, Shift+Enter quebra linha).

**Visões**
- Tabela, lista, quadro (arrastar muda o status) e linha do tempo; filtro por tipo, sem tipo, valores e período;
  agrupar o quadro por qualquer seleção/status; escolher colunas; mostrar/esconder histórico.
- **Hoje** = linha do tempo do dia com setas ← → para os outros dias e **captura rápida** ("o que chegou?") que cria
  item na Caixa de entrada.
- Tipo novo já ganha a sua visão.

## Decididas (2026-10-30) e já implementadas

O Paulo aprovou 1 a 7 e 10 a 17. O que roda sozinho (6, 7, 17) vem **desligado** e se liga em
Configurações → Automação.

| # | O quê | Como ficou |
|---|---|---|
| 1 | Agente dentro do app | **Terminal embutido** (Ctrl+`), com abas e altura ajustável. O botão **Agente** do item abre o Claude, Codex, Gemini, OpenCode, Kiro, Copilot, Cursor ou Pi na pasta do item (cria a pasta se faltar). É um terminal de verdade (ConPTY/PTY), usando a sua assinatura. Só aceita conexão da janela do atelier e só roda o shell ou um agente da lista. |
| 2 | Abrir a pasta de vários jeitos | O botão de pasta virou menu: gerenciador de arquivos · VS Code · terminal do sistema · terminal no atelier · agente no atelier. |
| 3 | Arrastar arquivo | Soltar arquivos ou pastas sobre a página do item copia para `insumos/` sem sobrescrever (vira "nome (2).ext"). A ficha ganhou **Arquivos**, separada por insumos, artefatos e rascunho, com abrir num clique. |
| 4 | Relações e menções | Ficha → **Relações**: filho de/pai de, relacionado, bloqueia/bloqueado por, absorvido por/absorve (um pai só). `#a3f9c21` no texto ou numa nota vira link (no editor, Ctrl+clique) e aparece em **Mencionado em**. MCP: `relacionar`. Ligar e desligar entram na linha do tempo dos dois itens. |
| 5 | Prazos | Filtro de **data** nas visões: vencidos · hoje · esta semana · próximos N dias (com ou sem vencidos) · sem data. Datas vencidas em vermelho, perto em amarelo. Visão **Vence em breve** pronta. Ordenar a visão por qualquer propriedade. |
| 6 | Captura global | Desligada por padrão. Ligada: atalho do sistema (padrão Ctrl+Alt+Espaço) traz a caixinha "o que chegou?"; ícone na bandeja (Capturar · Abrir · Sair); fechar a janela esconde na bandeja (opcional). |
| 7 | Backup automático | Desligado por padrão. Ligado: cópia do banco em `<bancada>/backups/` a cada N horas, guarda as últimas M. Botão "Fazer backup agora". |
| 10 | Menu | Arrastar visões para reordenar; **grupos** (menu "…" da visão → Grupo), que abrem e fecham; **contagem** ao lado. |
| 11 | Editor | **"/"** abre o menu (títulos, listas, tarefa, citação, código, divisor, data e hora, citar item). **Colar imagem** guarda em `insumos/` e põe um link no texto (Ctrl+clique abre). |
| 12 | Relatório | Na linha do tempo, botão **Relatório**: markdown do período por item, com data e hora. Copiar ou salvar em `<bancada>/relatorios/`. |
| 13 | Desfazer | Mudou propriedade, status (inclusive arrastando no quadro), mandou item ou nota para a lixeira: o aviso traz **Desfazer**, e Ctrl+Z também funciona enquanto ele está na tela. |
| 14 | Atalhos | **Ctrl+/** mostra todos. |
| 15 | Tamanho da letra | Configurações → Aparência, ou Ctrl + / Ctrl − / Ctrl 0. |
| 16 | Recentes | Busca rápida vazia mostra os últimos itens abertos. |
| 17 | Lixeira automática | Desligada por padrão. Ligada: apaga de vez o que está na lixeira há mais de N dias. |
| 20 | **Explorador de arquivos** (pedido do Paulo: "o VS Code para mim é visualizador de arquivo + terminal; o terminal já tem") | Painel à direita (botão **Arquivos** no item, ou "Aqui no atelier" no menu de pasta): navega na pasta do item e mostra **PDF** (pdf.js, igual no Windows e no Linux), **Markdown** formatado, **HTML**, imagem, vídeo, áudio e texto/código. Texto, Markdown e HTML são **editáveis** (Ctrl+S). Se o agente mudar o arquivo, o painel recarrega; com edição pendente, avisa e não salva por cima. Só alcança arquivos da bancada aberta; HTML e Markdown rodam numa caixa isolada, sem acesso ao atelier. |
| 21 | Auto-salvar do editor de arquivos | Configurações → Editor de arquivos: desligado (padrão), depois de uma pausa (ms configurável) ou ao sair do arquivo, como o `files.autoSave` do VS Code. |

## 8 e 9: acesso pelo celular e Windows ↔ Linux (análise)

**A separação que o Paulo imaginou já existe.** O atelier é uma **API HTTP** (`127.0.0.1:7477`, a mesma que o MCP e
o Claude usam) mais uma **interface web** (React) que só conversa com essa API. O Tauri é só a janela que mostra a
página. Então **não precisa reescrever nada nem fazer app de celular**: celular e outro computador usariam o
navegador.

O que faltaria, se um dia quiser:
1. A API escutar também na rede (ou só no Tailscale), **com senha ou token**. Hoje ela só aceita a própria máquina
   de propósito.
2. A API servir os arquivos da interface (hoje quem serve é o Tauri), para abrir `http://maquina:7477` no
   navegador.
3. Ajustar a tela para celular (menu vira gaveta, ficha embaixo).
4. Esconder o que só faz sentido na máquina onde o atelier roda: abrir pasta, VS Code, terminal, agente,
   arrastar arquivo.

O próprio Paulo levantou o ponto que pesa: **o trabalho é local** (pastas, VS Code, agentes). Pelo celular seria
para consultar e capturar, não para trabalhar. **Recomendação: deixar para quando fizer falta.** É um trabalho
médio e seguro de fazer depois, porque a arquitetura já permite.

**Windows ↔ Linux sem servidor:** a bancada pode morar numa pasta sincronizada (Syncthing é o melhor para isso),
desde que **só um atelier fique aberto de cada vez**: SQLite aberto nas duas pontas ao mesmo tempo corrompe.
Se for usar assim, vale um aviso de trava ("esta bancada está aberta em outra máquina"), que é pequeno de fazer.

## Ainda para discutir

| # | Ideia | O que eu acho |
|---|---|---|
| 5b | Aviso do sistema (notificação) quando um prazo chega | Pode incomodar; só se quiser, e desligado por padrão. |
| 18 | Página com várias visões dentro (como no Notion) | As visões já fazem o papel; ver se faz falta. |
| 19 | Trava de bancada aberta em outra máquina (para pasta sincronizada) | Pequeno; útil se o 9 for usado. |
| 22 | Configurações no estilo do VS Code: **busca** nas configurações e botão "editar o arquivo" (`config.toml` já faz o papel do `settings.json`) | Bom quando a lista de opções crescer; hoje são poucas. |
