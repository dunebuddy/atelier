# AGENTES — o atelier chamando agentes (ideias do Paulo, 2026-10-31)

Continua o item 5 do [`LAYOUT.md`](LAYOUT.md) (botão de terminal e Configurações → Agentes). **Implementado em 2026-10-31** (fatia 10).
O Paulo avisou que vem mais.

## Regra: só agente com o MCP do atelier instalado (pedido do Paulo, 2026-10-31)

Sem o MCP, o agente aberto no terminal "não faz ideia do que você está falando". Então tudo fica na tela de
**Integrações** que já existe (lista fixa dos agentes escolhidos):
1. **Detectar** (um agente) e **Detectar todos**;
2. dos detectados: **Instalar MCP**;
3. só dos que têm o MCP instalado abrem as opções: **Terminal** (aparece no botão de terminal), **Executor**
   (chamada não interativa) e **Prompt** (aparece no `/prompt` do editor).

## Executor: chamar um agente sem terminal

- O atelier chama o agente **em modo não interativo**: passa o pedido, o agente sobe, executa e se encerra. Todos os
  principais aceitam isso (`claude -p`, `codex exec`, `gemini -p`, `opencode run`...).
- Em Configurações → Agentes, o agente precisa estar **detectado**, **funcionando** e marcado como **Executor** para
  aparecer nessas listas. (Nome provisório para o interruptor que o Paulo chamou de "executor de tarefas" /
  "executor de prompt"; dá para trocar depois.)
- É a base para qualquer recurso futuro do atelier que precise de um agente.

## `/prompt` no editor

- No editor de um item (corpo, nota, texto), o comando de barra **`/prompt`** abre uma **caixinha dentro do próprio
  editor**, no ponto onde o cursor estava.
- Na caixinha: **qual agente** (lista dos Executores) e **o pedido**.
- Ao executar, o atelier monta o contexto e chama o agente:
  - o **código do item** (`#a3f9c21`); o agente consulta pelo MCP o item, os filhos, as relações, o que precisar;
  - o **texto que está na tela**;
  - **onde** o resultado vai entrar: o pedido pode ser no meio do texto ("quero um parágrafo aqui sobre X"). O
    atelier marca o ponto e manda o texto **antes** e **depois** dele, dizendo "o parágrafo entra aqui".
- O agente **devolve o texto** e o atelier insere no ponto marcado. O agente **não** edita o item pelo MCP nesse
  modo, para não brigar com o que o Paulo está digitando.
- Enquanto roda: um marcador "agente escrevendo..." no ponto, com cancelar; o Paulo continua editando o resto.
- O resultado entra como Markdown, desfazível com Ctrl+Z, e o registro de mudanças anota o agente como autor.

## Cuidados (anotação técnica)

- Demora: um agente leva de segundos a mais de um minuto. Por isso é assíncrono, com marcador e cancelar.
- Permissões: no modo não interativo o agente não pode parar para pedir aprovação. Liberar só as ferramentas de
  **leitura** do MCP do atelier e rodar na pasta do item.
- Cada agente tem flags diferentes: guardar por agente o "comando de execução" (com um padrão já pronto para os
  conhecidos), editável em Configurações → Agentes.
- Nome do comando: `/prompt` por enquanto (alternativa: `/pedir`).
