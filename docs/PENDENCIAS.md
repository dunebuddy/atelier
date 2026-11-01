# Pendências

Desde a 0.1.3 o Paulo usa o atelier de verdade, no dia a dia. Então nada vai direto para uma versão: tudo o que surgir
(pedido, bug, ideia, decisão em aberto) entra aqui primeiro, e cada release é montada escolhendo itens desta lista,
com cuidado para não quebrar o uso.

Como usar:
- Item novo entra em **Caixa de entrada**, com data e de onde veio.
- Na hora de montar uma versão, os itens escolhidos vão para **Próxima versão**; o resto fica.
- Quando sai a versão, os itens dela vão para **Feito**, com o número da versão.

## Próxima versão

(vazio — escolher da caixa de entrada)

## Caixa de entrada

### Bugs
- **Botão "Instalar" do aviso de atualização com o texto fora do centro** (2026-11-01, print do Paulo na 0.1.2 → 0.1.3).
  O aviso em si ficou bom: **ele deve virar o padrão de aviso (toast) do app**, com título, texto, ações e o ×.

- **Atualização da 0.1.2 para a 0.1.3 (2026-11-01):** o primeiro instalador travou ("não respondendo", provavelmente o
  Avast segurando o instalador sem assinatura) e um segundo clique em Instalar abriu outro instalador, que terminou e
  reabriu o app. Corrigir: o botão Instalar trava depois do clique e mostra o progresso (nunca dois instaladores); se o
  instalador demorar, dizer que o antivírus pode estar inspecionando.
- **Confirmar a atualização:** ao reabrir depois de atualizar, avisar "Atualizado para a X.Y.Z" (hoje não há sinal de
  que deu certo; o Paulo teve de perguntar).

### Melhorias pedidas
- **Toast padrão:** o aviso de versão nova é o modelo; os outros avisos do app (`avisar`) devem seguir o mesmo visual.

### Recursos (mudam comportamento: precisam do ok do Paulo antes)
- Desmontar janelas que não são terminal em workspaces escondidos e abas inativas (ganho alto de memória; perde a
  rolagem e o estado local ao voltar).
- PDF: desenhar só as páginas à vista (hoje até 300 de uma vez).
- WebView2 em modo de pouca memória quando o app vai para a bandeja (ao voltar, a tela pode demorar um instante).
- Terminal: matar a árvore inteira (agente aberto no terminal morre junto com o shell e quando o app fecha).
- Podar o histórico guardado dos workspaces (hoje até 50 passos por janela, para sempre).

### Ideias antigas (ninguém pediu agora)
- Abrir o atelier por link (`atelier://`).
- Propriedades calculadas (fórmula; soma a partir de itens ligados).
- Migrar o posto `daily-work` para dentro do atelier.

### A conferir no uso
- Microfone do ditado na janela de verdade (só foi testado no navegador; o WebView2 pode pedir permissão).
- Comando para o agente com o MCP instalado no Claude Code real.
- Ler `~/atelier/pedidos-ao-atelier.md` (o que os agentes não conseguiram fazer) e trazer para cá.

## Do lado do Paulo (fora do código)
- Avast: exceção para `C:\Users\paulo\AppData\Local\atelier\*` (abertura de 12–15 s por causa da inspeção).
- Configurações → Integrações → Claude Code: instalar o MCP e marcar **Comando**.

## Feito
- **0.1.3** (2026-11-01): bancada limpa com a visão fixa Todos os itens; instância única e bandeja; ícone carimbo em A;
  configurações do app e da bancada separadas; painel dividido corrigido e explorador em árvore; comando para o agente
  com MCP ampliado; ditado local (Parakeet e Whisper); Excel e Word no explorador; pedidos anotados; menos memória
  (medição honesta, vazamentos, lazy load); Sobre; barra de título só com ícones.
