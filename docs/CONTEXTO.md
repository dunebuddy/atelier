# Contexto — de onde veio o atelier

Escrito em 2026-10-30 pelo Claude do posto de trabalho do Paulo (`daily-work`), na conversa em que a
ideia nasceu. Serve para o Claude que vai construir o atelier entender **o porquê** sem ter estado lá.

## Quem é o Paulo e como ele trabalha hoje

- Engenheiro de dados e de plataforma, com **mais de um contexto** de trabalho (o emprego, trabalho de fábrica de
  software fora do expediente e projetos pessoais).
- Fala por voz (o texto chega transcrito, com erros de reconhecimento: "Claudinho" é o Claude, "DO" é o Azure DevOps,
  "post gri" é Postgres, "SK Light" é SQLite).
- O dia de trabalho roda num **posto** (`daily-work`): uma pasta de markdown que o Claude mantém, com log do dia,
  uma pasta por frente de trabalho (com `insumos/`, `artefatos/` e um `CLAUDE.md` de escopo), um backlog de dívida
  técnica com triagem por uma página HTML gerada, desejos, inbox e a memória do Claude; e skills que falam com as
  ferramentas do trabalho (Azure DevOps, chamados, horas, nuvem).

O contexto completo, com o que é da empresa, fica só na máquina do Paulo, em `privado/` (fora do git).

## A dor (o que motivou)

Num dia comum a conversa passou por uma dívida técnica nova, a revisão de dívidas antigas (conferidas ao vivo), a
triagem na página HTML, uma demanda urgente, uma demanda nova de um colega (que virou história no ADO e pasta de
trabalho), um pedido de liberação de rede e o ponto de horas. Tudo costurado à mão entre backlog, log do dia,
pastas de trabalho, memória e ADO. O que ficou visível:

- **As coisas se perdem e se misturam.** O backlog de dívida acabou guardando demanda, e "um monte de coisa pertence
  a outra coisa".
- **O visual é improvisado:** um HTML gerado de um `.md`, com triagem por JSON baixado e reaplicado por script.
- **O Paulo não tem onde olhar o todo.** Ele perguntou "a gente já tem uma dívida disso?" e o Claude teve de varrer
  backlog, dailies, desejos e memória para responder que não.
- **O status fica velho.** Na revisão, várias dívidas estavam desatualizadas e só uma consulta ao vivo mostrou o
  estado real.

## Os pedidos do Paulo, nas palavras dele

Transcrição de voz, sem correção.

**1) A ideia** (2026-10-30, por volta das 17h):

> Cara, eu tô percebendo que na verdade eu preciso de um sistema para gerenciar isso, tá? Eu precisava de um
> sisteminha alguma coisa parecida com o Notion da vida que a gente pudesse gerenciar para mim, mas que eu pudesse
> abrir e ter um gerenciamento visual sempre porque eu quisesse, tá bom? Talvez a gente vai ter que trabalhar nisso
> tá basicamente um sisteminha que rodasse a gente podia basear ele web, mas seria legal se tivesse um app stand
> alone para a gente não precisar ficar subindo servidor o tempo todo é um app que a gente subisse e que servisse
> tudo o que a gente precisa, tanto interface quanto MCP ou API para você, tá? E que desse controle total mesmo assim
> que você conseguisse recarregar a tela, navegar dentro do app pra mim, certo? Pra mim dizer assim: pô, não tô
> achando, não. Vai na página disso aqui, você vai lá, vai no banco de dados, acha, vom certo? E aí eu fico me
> perguntando se vale a pena a gente fazer, tá? Porque às vezes é muita coisa, as coisas vão se perdendo, vão
> ficando aí e aí a gente podia lincar ele, a gente podia criar os links, né? Linkar eles a coisa na DO, [...]
> coisa onde for, tá? Então ferramentas diversas, na verdade, links, né?
> Links com com a descrição e aí um texto onde eu pudesse editar se a gente puder fazer que nem no nosso, né, usar MD,
> ele já ia editando, seria legal, e isso tudo num banco de dados decente, talvez um post gri porque o SK Light talvez
> não desse conta, né? O que é que tu acha? E aí a gente podia gerar Kamban, podia gerar tabela, podia gerar
> relatório, podia gerar porra toda, podia botar nota de acompanhamento, certo? É muita coisa e aí eu vou me perdendo
> aqui.
>
> Aí fica a gente fazendo essa gambiarra aqui pra tentar entender e tentar separar e não sei o quê, né? E aí um monte
> de coisa aqui na verdade pertence a outra coisa e tudo e aí não é legal. O que é que tu acha?

**2) Resposta do Claude (resumo):** recomendou não construir e testar o **Obsidian** em cima da pasta do posto, com os
plugins Kanban e Dataview, porque ele lê os mesmos `.md`, é local e abre nota por link. Disse que **SQLite dá conta**
(Postgres seria exagero e traria o servidor de volta). Alertou que o problema de "o que pertence a quê" é de
**modelo** (tipos e campos), não de ferramenta.

**3) A decisão do Paulo:**

> A máquina é minha, tá? Mas eu acho que não, acho que eu queria o sistema mesmo, tá? Um sisteminha que a gente
> pudesse indo gerenciando e moldando ele e a o tempo não vai sair das frentes não. Quem vai fazer é você. Eu vou
> continuar trabalhando aqui enquanto você faz o sistema, entendeu? Ia ser uma parada completamente vibe-code de eu
> não vou nem me aperar com engenharia assistida Vibe Code mesmo Vou só dizer, a gente vai só levantar aqui o que é
> que precisa ter, o que, como é que vai funcionar aqui o básico, tá certo? E aí tu manda ver enquanto eu vou
> trabalhando as outras coisas. E depois a gente trabalha para fazer uma migração desse banco de dados nosso aqui,
> que é o gerenciamento diário para o modelo lá, tá? Porque eu acho que seria mais fácil. Porque seria uma coisa que
> nasceria nativamente para trabalhar com a gente. Certo? Então quando eu chegasse aqui para vocês, não, a gente vai
> fazer isso no tal e não sei o que, não sei o que, tu já ia saber que tem que ir lá e atualizar e tal, entendeu? E
> ele já ia te dar MCP, ele vai te dar o controle, entendeu? É tudo. O que é que tu acha? Parece uma ideia tão ruim
> assim?

**4) A proposta do Claude** (aceita como base): ver [`REQUISITOS.md`](REQUISITOS.md).

**5) As escolhas do Paulo** (perguntas de múltipla escolha):
- **Banco:** SQLite (a recomendação).
- **Formato do MVP:** janela própria, app desktop com **Tauri** (a recomendação), e não aba do navegador.
- **Nome e onde nasce**, nas palavras dele: *"vai chamar atelier, cria uma pasta para ele no c:/projects e ele nasce
  lá. anota TUDO que você puder de contexto do nosso papo, se possível até os prompts que eu enviei aqui, para eu
  abrir um primo seu lá e deixar ele continuar lá ok."*
  - Os projetos dele ficam todos em `C:\projetos` (não existe `C:\projects`), então a pasta nasceu em
    **`C:\projetos\atelier`**. Se ele quiser em `C:\projects`, é só mover.

## Decisões já tomadas

| Tema | Decisão |
|---|---|
| Construir ou adotar | **Construir** (o Paulo decidiu; o Obsidian foi considerado e recusado) |
| Quem constrói | O Claude, em modo vibe-code, enquanto o Paulo trabalha em outra coisa |
| Banco | **SQLite**, um arquivo local; backup = copiar o arquivo |
| Formato | **App desktop (Tauri)** que serve interface + API + MCP. Sem servidor separado |
| Para quem | O Paulo (visual) e o Claude (MCP com controle da tela) |
| Escopo de dados | Vários contextos (trabalho, fábrica, pessoal...), links para qualquer ferramenta |
| Depois do MVP | Migrar o posto (`daily-work`) para dentro do atelier; skills e `CLAUDE.md` do posto passam a usá-lo |
| Maleabilidade | **Tipos e propriedades são dados**, criados e mudados a qualquer hora (como Notion). Item muda de tipo |
| Frente | **Não é tipo**: é uma propriedade; "tudo da frente X" é um filtro |
| Pastas | O atelier **convive com as pastas**: item aponta para a pasta de trabalho no disco |
| Diário | Entidade **Dia** com entradas rápidas que depois viram item (de qualquer tipo) ou se ligam a um |

## 2ª conversa (2026-10-30, já na pasta do atelier)

O Claude daqui leu os docs e apontou três lacunas: falta o log diário, falta um tipo para demanda e "frente" tem dois
sentidos. A resposta do Paulo, nas palavras dele (voz, sem correção):

> Certo, tem várias outras coisas, tá? Por exemplo, beleza, não tem um lugar para o log diário, então é interessante
> a gente ter uma forma de entidade dele que agrupe ali as coisas que vão acontecendo no dia, tá? Eu não queria ficar
> preso nela, eu quero poder chegar e dizer, ó, chegou isso aqui, pá, nota na dele, chegou isso aqui e tal, mas isso
> aqui vira o quê? Isso aqui é uma task? Isso aqui é o quê? É uma dívida? Tá? É importante também, tá, que a gente do
> mesmo jeito que é no Notion, eu não quero deixar nada firme aqui, não vai ser só esses tipos, entendeu? Eu posso
> dizer a qualquer momento assim, não, vamos criar aqui um tipo tal, assim, agora isso aqui é isso aqui, certo? [...]
> Então eu preciso que isso seja bem maleável, tudo tem que ser bem maleável, tá? É bem como o Notion mesmo, a única
> diferença é que a gente vai moldar ele com o tempo até ele ficar perfeito para o nosso tipo de trabalho aqui, tá? E
> além de trabalhar com banco de dados, ele vai continuar trabalhando com as pastas. Porque eu vou dizer para o
> Claudinho assim, ó, Claudinho, chegou isso aqui, pá, ele vai para o ateliê, mas ao mesmo tempo ele vai linkar com a
> pasta. Porque eu vou precisar da pasta para ter os arquivos, para poder trabalhar lá, entendeu? [...] Então, eu
> quero tipo com propriedades que eu possa colocar e tirar a hora que eu quiser. Tá bom? Exatamente como é feito lá no
> Notion. E frente. Pois é, cara. Frente, eu acho que nem tem assim uma necessidade de existir um tipo frente. Tá?
> Porque se eu posso criar uma propriedade frente e dizer isso aqui agora é dessa frente e mais pra frente dizer
> assim, cara, me traz tudo dessa frente aqui, certo? Porque tá lá, tem a propriedade, né?
