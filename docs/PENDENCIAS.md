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

> **Limpa em 2026-11-13** (0.2.22, "uma versão com 100% de tudo"): o que estava aqui foi feito na 0.2.22 ou já
> tinha sido feito antes (pedidos do agente de novembro: 0.2.4 a 0.2.6; links `atelier://`: 0.2.8; fórmulas:
> 0.2.7). Pedido novo entra aqui.

### Bugs

### Melhorias pedidas

### Ideias antigas (ninguém pediu agora)
- Migrar o posto `daily-work` para dentro do atelier (é trabalho no outro repositório, não aqui).
- Cofre: exportar a chave com uma senha (para levar a bancada com o cofre para outro computador).
- Cofre: "Guardar no cofre" num trecho selecionado no editor do documento (hoje: a parte Segredos da página, a tela
  Cofre, o cadeado do checklist e o agente com `segredo` guardar).
- Atalhos em dois tempos configuráveis (hoje a segunda tecla é fixa; a lista está em Atalhos, Ctrl+/).

### A conferir no uso
- **0.2.22 no app de verdade** (o teste sem janela não tem Tauri nem o Credential Manager): o cofre criando a chave
  no Credential Manager (aparece como `atelier-cofre` em Credenciais do Windows), o pedido do agente pelo MCP real
  (`segredo` ler), a janelinha destacada com "sempre por cima", o Ctrl+K no WebView2, e um link de arquivo
  `atelier://doc/<código>/<caminho>` clicado fora do app (com ele aberto e fechado).
- **0.2.11:** ditar com o Nemotron no microfone de verdade (baixar em Configurações → Ditado; o primeiro ditado
  demora uns segundos carregando); o robô animado; renomear workspace; a tela "isto quebrou" se algo der errado
  (e o `erros.log`).
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
- **0.2.22** (2026-11-13) · "Uma versão com tudo": a caixa de entrada inteira, pedidos de 13/11 e o Ctrl+K de 04/11:
  - **cofre de segredos da bancada:** `<bancada>/cofre.db`, um SQLite **criptografado inteiro** (SQLite3 Multiple
    Ciphers, ChaCha20, o mesmo do torii: `vendor/`), com a chave no **Credential Manager** do Windows (Secret
    Service no Linux). Cada segredo: nome, descrição, chave, valor e o documento que o gerou. Tela **Cofre** (barra
    lateral) com busca; na página do documento, a parte **Segredos** (os dele e, recolhidos, os dos descendentes:
    o "achar pela cadeia"). Valor escondido; mostrar e copiar (a área de transferência se limpa em 30 s). Toda
    criação, troca, leitura e recusa vai para a linha do tempo do documento, **sem o valor**;
  - **agente e cofre:** `segredos` lista sem valor; `segredo` ler pede na tela "**Permitir por 5 min** / Só desta
    vez / Negar" (1 a 60 min) e espera a resposta; dentro do prazo, lê de novo sem perguntar; `segredo` guardar põe
    um segredo novo. A API só entrega o valor à tela; as instruções do MCP mandam nunca deixar segredo em texto;
  - **checklist e cofre:** o cadeado ao lado de um valor manda ele para o cofre; o arquivo fica só com
    `cofre:<id>` e o histórico antigo daquele valor vira ••••; no texto, `{{chave}}` aparece 🔒 •••••• (clique
    copia);
  - **valor como referência, com histórico:** no texto do passo, `{{chave}}` vira uma etiqueta com o valor (clique
    copia; o ✎ muda o valor ali mesmo, em todo o checklist); toda troca vai para o `historico` do arquivo
    (de → para, quando, quem), mostrado em "Valores"; o agente muda com `checklist` ação "valor" e o formato pede
    `{{chave}}` em todo nome que se repete;
  - **janelinha destacada:** "Destacar numa janelinha" no menu da aba abre só aquela aba numa janela pequena (o
    tamanho fica lembrado), com **sempre por cima** (o alfinete da barrinha). Não mexe nos workspaces;
  - **links `atelier://`:** colar o link (ou só o código) na busca Ctrl+P abre, inclusive de outra bancada; link
    de **arquivo** `atelier://doc/<código>/<caminho>`; **Copiar link** no documento, no menu da visão, no arquivo e
    no checklist; `?bancada=<nome>` opcional desempata; o Exportar gerava `atelier://item/`, que não abria
    (agora `doc/`, e `item/` continua aceito);
  - **atalhos em dois tempos:** **Ctrl+K** e depois uma tecla (J expande, Z Zen, \ divide, ← → foco, O troca de
    painel, 1 2 3 modos, R largura, W visão geral...). Um selo embaixo mostra as opções; Esc ou 2 s cancela; no
    terminal o Ctrl+K continua do shell. A busca saiu do Ctrl+K (fica no Ctrl+P);
  - **workspace da bancada:** sempre o primeiro da lista (no seletor e na visão geral), ligado ou não, e nunca
    apaga nem arquiva.
- **0.2.21** (2026-11-13) · Checklist mais legível e fácil de copiar, pedidos de 13/11:
  - **feito × pendente à primeira vista:** o pendente é um cartão esverdeado com bordinha verde (4 px) à esquerda; o
    feito fica achatado, sem fundo nem borda, a 40% (aberto ou com o mouse em cima, 90%). O Paulo escolheu esta (a
    "C") entre três opções mostradas;
  - **copiar tabela** em toda tabela do texto do passo e **copiar texto** no bloco inteiro (com o mouse em cima):
    copiam com formatação (HTML, que o Teams entende, com borda nas tabelas) e em markdown para quem só aceita texto;
  - **dá para selecionar texto dentro do card:** o cartão inteiro era arrastável e bloqueava a seleção; agora só a
    alça arrasta. Código solto não copia no clique quando você está selecionando.
- **0.2.20** (2026-11-13) · Toasts, pílula dos agentes e checklist, pedidos de 13/11:
  - **toasts contam e somem sozinhos:** o com **Desfazer** (ex.: "itens apagados") ficava parado, sem barrinha, por
    causa da opção "Aviso com Desfazer fica até eu mexer" (ligada por padrão). Agora todo toast conta; o com Desfazer
    fica 5 s a mais (o Desfazer continua no sininho). A opção saiu das Configurações;
  - **botão direito** em qualquer canto do toast fecha (também nos cartões de versão nova e de atualizado);
  - **toasts empilhados em horizonte:** em vez de subirem pela tela, ficam um atrás do outro; na frente fica sempre o
    que some primeiro; atrás, só as bordas, até 5 camadas, cada uma subindo um pouco menos que a anterior, menor e mais
    apagada. Mouse em cima abre em lista (o que some primeiro perto do canto, com rolagem se não couber) e para o
    tempo de todos; tirou o mouse, juntam e continuam de onde pararam. Na tela ficam até 10;
  - **pílula dos agentes chama a atenção:** vermelha (texto e carinha brancos), pisca 3 vezes ao aparecer e depois
    pulsa de leve. **Pôr o foco no terminal do agente** já tira a pílula (sem clicar nela); e o sino do terminal com o
    cursor nele não acende a pílula (antes, o agente que você estava olhando entrava na fila);
  - **checklist:** o botão de marcar o passo diz **Pronto**; marcar (Pronto ou Ignorar) fecha o passo e abre o próximo
    que falta, rolando a tela até ele. Editando o passo, o Pronto de marcar some do rodapé (o de cima termina a edição);
  - **código do documento único no atelier inteiro:** ao sortear o código, o atelier confere também as outras
    bancadas (o link `atelier://doc/<código>` não diz a bancada). As bancadas de hoje não tinham código repetido.
- **0.2.19** (2026-11-12) · Workspaces, pedidos de 12/11:
  - **regras de desligar, arquivar e apagar:** o workspace atual só desliga, e desligar o atual leva ao da bancada
    (que liga, se estava desligado: sempre há um workspace na tela, e ele está ligado); o da bancada, sendo o atual,
    não desliga. Arquivar e apagar só aparecem (e só funcionam) em workspace desligado. Apagar pede confirmação na
    própria linha (Sim / Não). Antes, Arquivar e Esquecer apareciam no atual, derrubavam os terminais dele sem aviso
    e trocavam a tela;
  - **visão geral (Ctrl+Shift+O):** botão "Mostrar arquivados (n)"; os arquivados aparecem embaixo, depois de um
    traço, separados dos ativos, e entram nas setas do teclado; a escolha fica lembrada.
- **0.2.18** (2026-11-12) · Checklist nativo do atelier (pedido de 12/11; o Paulo fechou a versão só com isso):
  - arquivo **`*.checklist.json`** na pasta do documento: os passos (o agente escreve) e o estado (a tela grava) no
    mesmo arquivo, ligados pelo `id` do passo. Clicar nele na árvore, no explorador ou na lista de arquivos da
    ficha abre a **tela de checklist** ("Ver o JSON" mostra o texto cru);
  - tela: progresso, passo seguinte em destaque, dependências ✅/⏳ ("aguarda 3, 5"; marcar com dependência pendente
    pede confirmação), opcional com "Pular (não se aplica)", campos a coletar (com `{{campo}}` preenchido no texto),
    observação por passo, Valores coletados, Observações, Feito, desfazer (botão e Ctrl+Z), **agrupar por** grupo ou
    por qualquer prop, **mostrar** só um valor de prop. Blocos de código com "copiar"; `código` copia com um clique;
    se o agente mexe no arquivo, a tela recarrega sozinha;
  - **links por passo:** documentos (`#código`, com título e status), arquivos (relativos à pasta do checklist) e
    sites. Documento e arquivo abrem **na outra metade** do painel, como referência. "+ Link" acrescenta (documento
    pela busca, ou caminho/URL); "Virar documento" cria um documento do tipo escolhido (Passo em primeiro), filho do
    documento da pasta, e o passo mostra o chip dele;
  - MCP: ferramenta **`checklist`** (formato · ler · marcar); `ler_documento` traz `checklists` (feitos/total e os
    próximos que podem andar); instruções do MCP e o CLAUDE.md das pastas novas apontam para o formato;
  - **primeira rodada de ajustes do Paulo (12/11, olhando a tela):** sem checkbox (era fácil marcar sem querer):
    botões **Pular** e **Fazer** à direita do passo, e **Pular** vale para qualquer passo; o passo feito fica no
    lugar, apagado, com **Desfazer**; realce do cabeçalho reto embaixo; faixa embaixo do título com **tags** (do
    checklist; o formato trocou `props` por `tags`, e o arquivo antigo é convertido sozinho) e **links**, com "+ tag" e
    "+ link" (documento, arquivo do computador, que vai para `insumos/`, caminho ou site); "Virou o documento" numa
    faixa própria, em destaque; **Dados deste passo** e **Observação** em dois painéis separados (o de dados com
    rótulo à esquerda e caixa à direita); **Valores coletados** recolhível; **filtro por tags** no topo (e "Esconder
    feitos"); dependências no card ("Depende de" com ✅/⏳ e "Libera"), com acrescentar e tirar; **editar o passo**
    (título, texto, seção, opcional, dados que pede); **+ Passo** em cada seção, **Nova seção**, renomear e subir ou
    descer seção, **arrastar** passo (inclusive para outra seção), apagar passo. Dependências apontam para o `id`:
    reordenar não quebra nada. Gravações em fila (antes, duas seguidas podiam se cruzar com a releitura do disco);
  - **segunda rodada (12/11):** o realce cobre o topo inteiro (cabeçalho e tags); fechado, o passo fica numa linha só
    (tags, "🔗 n" e o documento criado ao lado do título); aberto, cada parte separada por tracejado: tags,
    dependências (lista, com "Libera"), documento criado, painel **Passo** (com **Editar → Pronto** no mesmo canto,
    e a edição de título, texto, seção e opcional dentro dele), **Dados deste passo** (editando: rótulo, × e
    "+ dado"), **Links** (desceram para cá), **Observação** e o rodapé: ícones à esquerda (criar documento, apagar,
    com dica do mouse) e **Ignorar / Fazer** à direita ("Pular" virou "Ignorar"). Seção: **+** ao lado do nome
    acrescenta passo; entre seções, a divisória tracejada "+ Adicionar seção" aparece forte com o mouse;
  - **terceira rodada (12/11):** sem recuo à esquerda no passo aberto; sem a setinha de expandir (clicar no topo
    abre e fecha); os dados ficam dentro do corpo, depois do texto, e o cabeçalho "Passo" saiu; **edição do card
    inteiro**: um lápis discreto no canto de cima (com o mouse, cresce e mostra "Editar") põe o card todo em edição,
    com borda (título no próprio cabeçalho, texto, seção, opcional, dados), e vira **Pronto** no mesmo canto;
  - **quarta rodada (12/11):** lápis e Pronto com a mesma altura (a tela não pula); a borda de destaque só na edição;
    seção e opcional entre o título e as tags na edição; a descrição do topo se edita; apagar com **confirmação num
    balão** dentro do app (a caixa do sistema não aparece no navegador embutido) e Desfazer no aviso; **comentários**
    (blocos de markdown) entre as seções, criados pela divisória (**+ Seção** ou **+ Comentário**, também no topo),
    editáveis e apagáveis; a descrição antiga virou o primeiro comentário. O texto do card e os comentários usam o
    **editor visual** do atelier, que ganhou uma **barra de botões** opcional (negrito, itálico, riscado, código,
    títulos, listas, tarefas, citação, bloco de código, tabela, link e arquivo do computador para `insumos/`);
  - o checklist HTML que um agente tinha gerado para uma demanda de trabalho foi convertido para o formato novo
    (52 passos, os mesmos ids, com links para os documentos e o guia ligados a ele).
- **0.2.17** (2026-11-11) · Pedido de 11/11:
  - **Status nas listas da ficha:** cada documento em "Apontado por" (Filhos...), "Mencionado em", nas listas
    dinâmicas e nas relações da ficha (Pai, Bloqueado por...) mostra a pílula do status, igual às listas. Na tabela
    não muda nada.
- **0.2.16** (2026-11-10) · Toasts, pedidos de 10/11:
  - **Toast de agente não chega mais duas vezes:** o hook ignora o `Notification` de "ainda parado" (`idle_prompt`,
    ~60 s depois da mesma espera) e o app só avisa de novo o mesmo estado depois que alguém foi ver o agente ou ele
    mudou de estado (`deveAvisar` em `agentes.ts`).
  - **Toast de agente some sozinho:** só o "Desfazer" segura o toast na tela; clicar para abrir ou ir até o agente
    não segura (a notificação fica no sininho).
  - **Barrinha de tempo:** 3 px encostada embaixo do toast, diminuindo até ele fechar; com o mouse em cima o tempo
    para e recomeça cheio ao sair.
- **0.2.15** (2026-11-09) · Workspaces e fila de agentes, todos pedidos de 09/11:
  - **Fila de agentes na barra de status:** botão fixo só com o ícone dos workspaces (abre a visão geral) e uma
    pílula por workspace aberto com agente esperando ou que terminou (carinha colorida + nome, a mais antiga à
    esquerda; os nomes apertam com "…"). Clicar vai ao workspace com o foco no terminal do agente, e a pílula sai.
  - **Notificação de agente** com o nome do workspace em destaque; clicar (toast ou sininho) vai até o agente.
  - **Workspaces:** o atual em destaque na lista de cima (fundo + barra de acento) e na visão geral (fundo, borda e
    selo "atual"); abertos primeiro; **arquivar** (grupo "Arquivados" recolhido no fim, desarquivar, abrir
    desarquiva); **arquivar sozinho** os parados há N dias (Automação, desligado por padrão, 30 dias).
  - **Pílula de relação** não vaza mais da ficha (título com "…", botões sempre no lugar).
  - **Área de trabalho** com os quatro cantos arredondados de volta.
- **0.2.14** (2026-11-04, à noite):
  - **Relatório bonito, com layout e agente**: HTML e PDF com 4 layouts (`src/relatorio.ts`:
  Executivo com capa, números e sumário · Fichas · Tabela compacta · Documento corrido), cores do tipo e chips das
  opções, prévia ao vivo ao lado das opções; **texto de cada documento** inteiro ou pelo agente (resumo em 1
  parágrafo, tópicos, só decisões, instrução livre) e a linha do tempo resumida; **ajuste final** do relatório inteiro
  por instrução; **escolha do agente e do modelo** (um para os campos, barato: `haiku`; outro para o ajuste:
  `sonnet`), estimativa de tokens/tempo, "Ver com o agente" antes de salvar, Parar, cache (não paga de novo).
  Backend: `/api/redigir` (só texto, sem ferramentas) e `agentes::para_texto` / `flag_modelo`. Ficou para depois:
  modelo de relatório salvo com nome e `gerar_relatorio` no MCP.
  - **Botão "Agente" do documento: popover** (04/11, o Paulo: "aparece essa tela horrível... só o Claude Code aparece
  como agente, os outros são discriminados"; "um pop-upzinho, que nem quando clico no botão do terminal"; "não precisa
  mostrar o caminho"; "incluindo os apps de desktop"). O caminho do executável espremia o nome até sumir. Agora é um
  popover junto do botão (como o do terminal): só os agentes instalados e ligados, "Só o terminal" e os apps de
  desktop (Claude, ChatGPT/Codex...) abrindo na pasta do documento.
- **0.2.13** (2026-11-04, à noite; o Paulo fechou o dia e pediu para juntar tudo):
  - **imagem no documento**: colar um print (Ctrl+V) entra como imagem (`insumos/`, caminho relativo); arrastar
    arquivos do sistema para cima do texto entra no ponto onde soltou (imagem como imagem, o resto como link);
  - **comandos de barra em inglês** (`/image`, `/link`, `/file`, `/table`, `/todo`, `/quote`, `/code`, `/divider`,
    `/diagram`, `/now`, `/mention`, `/livelist`...), o português continua achando (`/imagem`, `/tabela`...);
    **autocomplete de caminho** em `/image`, `/link` e `/file` a partir da pasta do documento (`..` sobe; Tab
    completa; Enter troca o comando pelo markdown), com as pastas dos documentos ligados na raiz e "Escolher arquivo…";
  - **visualizador de imagem em tela cheia** (`components/VerImagem.tsx`): clique na imagem do texto, do Explorador
    ou do leitor de Markdown; encaixa no maior tamanho, roda do mouse amplia no ponteiro, arrastar move, duplo clique
    encaixar ↔ 100%, ← → passam, Esc / clique fora fecham, abrir no programa e mostrar na pasta;
  - **painel**: Ctrl+\ **esconde** a metade direita (as janelas ficam; de novo mostra como estava; juntar só pelo
    menu da aba); **expandir** (duplo clique / Ctrl+Alt+Shift+J) = 85% do painel com o resto à vista, como o VS Code
    (clicar na parte espremida desfaz); **fixar** (alfinete, menu da aba): nada troca o que ela mostra, só o Paulo
    fecha; **Ctrl+Alt+clique** abre no outro painel; o MCP ganhou `esconder_direita`, `mostrar_direita`, `fixar`,
    `desafixar`, `expandir`;
  - **abas no visual do VS Code**: faixa colada de 35 px, aba ativa com o fundo do conteúdo, × só na ativa e no hover,
    metades separadas por 1 px;
  - **atalhos do app em qualquer lugar**: os leitores em moldura (Markdown, Word) repassam teclas e clique ao app
    (script único com CSP + nonce, `src/moldura.ts`); o filtro do AltGr não engole mais Ctrl+Alt+Shift+letra; o foco
    do painel segue o teclado (`focusin`);
  - **bug**: fechar o Comando quebrava a tela (efeito devolvia a Promise do `scrollIntoView`).
- **0.2.12** (2026-11-03, à noite, sozinho: o Paulo encerrou o dia e pediu para fazer tudo):
  - **favorito**: campo fixo de todo documento (migração 17, coluna `favorito` em `itens`), estrela na página e
    na linha da tabela; marcar não mexe no "atualizado" nem na linha do tempo; `favorito` no MCP
    (`ler_documento`/`atualizar_documento`) e nas consultas SQL; **⭐ Favoritos** no topo da barra lateral (todos
    os tipos; filtro `favoritos` também no servidor);
  - **visão com seções** (tabela e lista): blocos um embaixo do outro, recolhíveis, com contagem e "ver mais"
    (padrão 10). **Tipo novo já nasce com Favoritas · Recentes (15 dias) · Abertas · Todas**; nos tipos que já
    existem, menu ⋯ da visão → "Seções padrão" (ou "Sem seções"). Um documento pode aparecer em mais de uma seção.
    MCP: `secoes` em `criar_visao`/`atualizar_visao` (o Paulo diz quais quer e o agente monta);
  - **seletor de ícone** único (tipos e visões): ~440 emojis em grupos, cada um com várias palavras em português,
    busca com o foco já nela (Enter escolhe), "em uso" em cima, e colar qualquer emoji;
  - **ícone do tipo e código** em toda lista: tabela (o ícone à esquerda de tudo), quadro, árvore da barra lateral
    e a lista dentro do texto (as outras já tinham);
  - **sininho**: filtro com ícones (contagem em bolinha); "Limpar" abre Limpar tudo (tudo mesmo, mostrando ou não)
    ou só um assunto.
- **0.2.11** (2026-11-03, todas as pendências de uma vez, a pedido do Paulo):
  - **sininho:** espaço entre as notificações; filtro por assunto no topo (Todas · Sistema · Agentes · Atualização,
    com contagem; esconder um assunto tira da lista e do número); "Limpar tudo" limpa o que está à vista e fecha;
  - **agente à vista não vira toast:** com o app em foco, o workspace dele aberto e o terminal dele à vista (aba
    ativa, tile, ou a janela maximizada), "terminou" e "esperando" vão só para o sininho;
  - **carinha do agente:** a cor vai no robô (sem fundo): vermelho esperando, laranja trabalhando (balançando),
    verde terminou; centralizado;
  - **tabela:** com larguras escolhidas à mão, a célula ocupa a coluna inteira (sem o teto de 320/520 px);
  - **tela que quebra não apaga mais o app:** proteção por janela ("Esta janela quebrou", Tentar de novo / Fechar)
    e uma geral (Recarregar); os erros vão para `~/atelier/erros.log` (`POST /api/log`), com os erros soltos
    (promessa sem catch) também. A causa da tela apagada de 03/11 segue desconhecida: o log vai mostrar da próxima;
  - **workspaces:** lista 50% mais larga (480 px) e com o nome inteiro no tooltip (também no botão da barra);
    **renomear** (lápis na lista e na visão geral; vazio volta ao nome do documento); o workspace de documento
    **acompanha o título** dele; MCP `tela` com `acao: "renomear_workspace"`;
  - **página do documento:** linha do código/tipo/datas em cima, ícone e título lado a lado, ações embaixo;
  - **arquivos da ficha em árvore**, com as pastas abrindo, botão de reler e releitura sozinha a cada 5 s;
  - **explorador:** Backspace (ou Alt+←) fecha o arquivo ou sobe uma pasta; a trilha começa por `#código Título` e
    mostra sempre o fim. Corrigido junto: a trilha nunca mostrava as subpastas (o servidor devolvia os caminhos
    com o prefixo `\\?\` do Windows);
  - **ditado de streaming com o Nemotron 3.5 (NVIDIA):** motor novo (`src/nemotron.ts`: mel do NeMo em JS, encoder
    com cache, RNNT guloso) seguindo o onnxruntime-genai; o texto aparece ao lado do microfone enquanto você fala
    e entra inteiro ao parar. Idioma automático (com "pt-BR" fixo o modelo tira a pontuação; no automático sai
    certinho). O encoder roda na **placa de vídeo** (WebGPU, ~230 ms por pedaço de 560 ms); no processador o
    WebView roda com uma thread só e fica ~6× mais lento que a fala (cai para lá se a placa falhar, e avisa). O
    modelo (~790 MB) fica no OPFS do WebView: o Cache Storage recusou o arquivo de 690 MB. Testado com áudio
    gerado (voz Maria do Windows) dentro do app de teste; o microfone de verdade fica para conferir;
  - o catálogo de modelos agora ignora motor que a versão não conhece (para os próximos).
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
