// Emojis para os ícones (tipos, visões...), por grupo, cada um com palavras em português para a busca do seletor.
// Uma linha por emoji: o emoji, depois as palavras. Para acrescentar, é só pôr a linha no grupo.

const GRUPOS_TEXTO: [string, string][] = [
  ["Trabalho e tarefas", `
📄 documento página folha arquivo
✅ feito concluído tarefa ok certo check
☑️ caixa marcada tarefa check
📋 lista prancheta checklist tarefas
🗒️ bloco notas lista
📌 fixar alfinete importante pin
📍 local marcador alfinete ponto
🎯 alvo meta objetivo foco demanda
🚀 lançamento foguete projeto entrega deploy
🏁 bandeira chegada fim meta concluir
🪜 passo escada degrau etapa
👣 passos pegadas etapas caminho
🧩 peça quebra-cabeça parte componente módulo
🏗️ obra construção projeto andamento
🧱 tijolo bloco base fundação
🛠️ ferramentas manutenção conserto
🔧 chave ferramenta ajuste conserto
🔨 martelo construir ferramenta
⚙️ engrenagem configuração processo automação
🗂️ pastas divisórias organizar arquivo
📁 pasta arquivo
📂 pasta aberta arquivo
🗃️ arquivo caixa fichas
🗄️ arquivo gaveta armário
📦 caixa pacote entrega produto
📥 entrada caixa receber inbox
📤 saída caixa enviar outbox
📨 mensagem envelope recebida
✉️ email carta envelope
📬 caixa correio mensagem
🧾 recibo nota conta fatura
🏷️ etiqueta tag rótulo
🔖 marcador favorito leitura
⭐ estrela favorito importante destaque
🌟 estrela brilho destaque
✨ brilho novo especial desejo
🔥 fogo urgente quente prioridade
⚡ raio rápido energia urgente
⏳ ampulheta espera aguardando pendente tempo
⌛ ampulheta tempo fim
🐛 bug inseto erro defeito
🐞 joaninha bug erro
🧪 teste experimento laboratório
🔬 microscópio análise pesquisa
🔍 lupa busca investigar análise
🔎 lupa busca consulta procurar
🧭 bússola direção rumo estratégia
🗺️ mapa roteiro plano
🪄 varinha mágica automação
🎛️ painel controle ajustes
🧰 caixa ferramentas kit
🪛 chave fenda ferramenta
🧹 vassoura limpeza faxina
♻️ reciclar refazer reaproveitar
🔁 repetir recorrente rotina ciclo
🔄 atualizar sincronizar
⏯️ pausar continuar
⏸️ pausa parado
⏹️ parar
▶️ começar iniciar play
🚧 obra bloqueio em andamento
🛑 parar bloqueado proibido
🚦 semáforo status
`],
  ["Documentos e escrita", `
📝 nota escrever memo anotação
✏️ lápis editar escrever
🖊️ caneta escrever assinar
🖋️ caneta tinteiro escrita
✍️ escrever mão assinatura
📃 página documento
📑 abas documentos páginas
📜 pergaminho histórico documento antigo
📰 jornal notícia
🗞️ jornal enrolado notícias
📓 caderno anotações
📔 caderno decorado diário
📒 livro-caixa registro
📕 livro vermelho
📗 livro verde
📘 livro azul
📙 livro laranja
📚 livros estudo biblioteca leitura
📖 livro aberto leitura manual
🔗 link corrente ligação url
📎 clipe anexo
🖇️ clipes anexos
📐 esquadro régua desenho medida
📏 régua medida
✂️ tesoura cortar
🗳️ urna voto decisão
💬 conversa balão mensagem chat comentário
🗨️ balão fala comentário
💭 pensamento ideia balão
🗯️ grito balão bravo
❓ pergunta dúvida
❔ pergunta
❗ exclamação atenção importante
❕ exclamação
‼️ dupla exclamação urgente
⁉️ pergunta exclamação
`],
  ["Tempo e agenda", `
📅 calendário data agenda dia
📆 calendário folhinha prazo
🗓️ calendário espiral agenda
⏰ despertador alarme lembrete
⏱️ cronômetro tempo medir
⏲️ timer tempo
🕐 relógio hora
🕰️ relógio antigo tempo
⌚ relógio pulso hora
🌅 amanhecer manhã
☀️ sol dia hoje manhã
🌤️ sol nuvem tempo
🌙 lua noite
🌛 lua noite
🎂 aniversário bolo
🎉 festa comemoração vitória
🎊 confete festa
🎁 presente
🗿 marco permanente
`],
  ["Dinheiro e negócio", `
💰 dinheiro saco custo financeiro
💵 nota dólar dinheiro
💶 nota euro dinheiro
💷 nota libra dinheiro
💴 nota iene dinheiro
💸 dinheiro voando gasto despesa
💳 cartão crédito pagamento
🪙 moeda
🏦 banco
🏧 caixa eletrônico
💹 gráfico alta ações
📈 gráfico subindo crescimento alta
📉 gráfico descendo queda baixa
📊 gráfico barras relatório dados métrica
🧮 ábaco cálculo conta
💼 maleta trabalho negócio empresa
🏢 prédio empresa escritório
🏬 loja comércio
🏭 fábrica indústria produção
🤝 aperto mão acordo parceria negócio
📇 cartões contato fichário
🛒 carrinho compra
🛍️ sacolas compras
🏪 loja conveniência
⚖️ balança justiça jurídico equilíbrio
📃 contrato documento
`],
  ["Tecnologia e infra", `
💻 notebook computador código
🖥️ computador desktop monitor
⌨️ teclado digitar
🖱️ mouse
🖨️ impressora
📱 celular telefone app
📲 celular receber app
☎️ telefone ligação
📞 telefone ligação chamada
📟 pager
📡 antena sinal satélite rede
🛰️ satélite
☁️ nuvem cloud aws azure
🌐 internet web rede mundo site
🔌 tomada plug conexão integração
🔋 bateria energia
🪫 bateria fraca
💾 disquete salvar backup
💿 cd disco
📀 dvd disco
🗜️ compactar
🧬 dna código genética
🤖 robô agente automação ia bot
🧠 cérebro inteligência ia pensar
👾 alien jogo
🕹️ joystick jogo
🎮 videogame jogo controle
🔒 cadeado segurança fechado privado
🔓 cadeado aberto liberado
🔐 cadeado chave seguro
🔑 chave acesso senha credencial
🗝️ chave antiga
🛡️ escudo segurança proteção
🧯 extintor incidente emergência
🚨 sirene alerta incidente emergência
🔔 sino notificação aviso
🔕 sino mudo silêncio
📶 sinal rede wifi
🧲 ímã atrair
💡 lâmpada ideia luz
🔦 lanterna luz
🧱 parede firewall
🐳 baleia docker container
🐙 polvo github
🐍 cobra python
☕ café java
🦀 caranguejo rust
🐧 pinguim linux
🪟 janela windows
🍎 maçã apple mac
`],
  ["Ciência e ideias", `
🔭 telescópio observar futuro
⚗️ alambique química
🧫 placa cultura laboratório
🧴 frasco
🌡️ termômetro temperatura medida
🧑‍🔬 cientista pesquisa
📡 radar sinal
🪐 planeta saturno espaço
🌍 terra mundo planeta
🌎 terra américas mundo
🌌 galáxia universo
☄️ cometa
🌈 arco-íris
🎨 paleta arte design cor
🖌️ pincel pintura design
🖼️ quadro imagem foto
📷 câmera foto
📸 foto flash
🎥 câmera filme vídeo
🎬 claquete filme cinema vídeo
🎙️ microfone podcast gravação voz
🎤 microfone fala
🎧 fone áudio música
🎵 nota música
🎶 música notas
🎹 teclado piano música
🎸 guitarra música
🥁 bateria música
🎭 teatro máscaras
🧸 urso brinquedo
🎲 dado sorte jogo
♟️ xadrez estratégia
🧿 olho proteção
🔮 bola cristal previsão futuro
`],
  ["Pessoas e conversa", `
👤 pessoa usuário contato
👥 pessoas equipe grupo time
🧑 pessoa
👨 homem
👩 mulher
🧑‍💻 programador dev pessoa computador
🧑‍💼 executivo gerente pessoa trabalho
🧑‍🏫 professor ensino
🧑‍🔧 técnico manutenção
🧑‍⚖️ juiz jurídico
🧑‍⚕️ médico saúde
🧑‍🎨 artista design
👶 bebê
👪 família
🙋 pergunta mão levantada
🙌 celebrar mãos
👏 palmas aplauso
👍 positivo joinha aprovado
👎 negativo reprovado
👀 olhos olhar ver acompanhar
🗣️ falar voz
💪 força braço
🫶 coração mãos carinho
❤️ coração amor
💛 coração amarelo
💚 coração verde
💙 coração azul
💜 coração roxo
🖤 coração preto
🤍 coração branco
😀 sorriso feliz
😅 suor alívio
😎 óculos legal
🤔 pensando dúvida
😴 sono dormir
🤯 explodir mente
🥳 festa comemoração
😡 bravo raiva
😢 triste
🙏 por favor obrigado
`],
  ["Lugares e viagem", `
🏠 casa lar pessoal
🏡 casa jardim
🏘️ casas bairro
🏫 escola estudo
🏥 hospital saúde
🏛️ prédio governo instituição
⛪ igreja
🏖️ praia férias
🏝️ ilha férias
⛰️ montanha
🏔️ montanha neve
🌋 vulcão
🏕️ acampamento
🏙️ cidade
🌉 ponte
🛣️ estrada caminho
🚗 carro
🚕 táxi
🚌 ônibus
🚆 trem
🚇 metrô
✈️ avião viagem voo
🛫 decolagem viagem
🚢 navio
⛵ barco vela
🚲 bicicleta
🏍️ moto
🛵 lambreta
⛽ combustível posto
🧳 mala viagem bagagem
🗼 torre
🗽 estátua liberdade
🎡 roda gigante parque
`],
  ["Natureza", `
🌱 broto início semente crescer
🌿 erva folha
🍀 trevo sorte
🌳 árvore
🌲 pinheiro árvore
🌵 cacto
🌻 girassol flor
🌸 flor cerejeira
🌹 rosa flor
🌷 tulipa flor
🍂 folhas outono
🍁 folha bordo outono
🌊 onda mar
💧 gota água
❄️ neve floco frio
🔥 fogo
⛅ nuvem sol
🌧️ chuva
⛈️ tempestade
🌪️ tornado caos
🐶 cachorro
🐱 gato
🦊 raposa
🐻 urso
🐼 panda
🦁 leão
🐯 tigre
🐸 sapo
🐢 tartaruga devagar
🐝 abelha trabalho
🦋 borboleta mudança
🐌 caracol lento
🦉 coruja sabedoria
🐦 pássaro
🦅 águia
🐬 golfinho
🐟 peixe
`],
  ["Comida", `
☕ café pausa
🍵 chá
🍺 cerveja
🍷 vinho
🥤 bebida copo
🍕 pizza
🍔 hambúrguer
🍟 batata frita
🌮 taco
🍣 sushi
🍜 lámen sopa
🍝 macarrão
🥗 salada
🍞 pão
🧀 queijo
🍎 maçã
🍌 banana
🍇 uva
🍓 morango
🍉 melancia
🍰 bolo
🍩 rosquinha
🍪 biscoito cookie
🍫 chocolate
🍿 pipoca
🧂 sal
🍳 ovo frigideira cozinha receita
`],
  ["Objetos", `
🏆 troféu vitória conquista
🥇 medalha ouro primeiro
🥈 medalha prata segundo
🥉 medalha bronze terceiro
🏅 medalha
🎖️ medalha militar honra
👑 coroa rei principal
💎 diamante valioso premium
💍 anel
🎒 mochila escola
👓 óculos ler
🕶️ óculos escuros
👔 gravata trabalho formal
👕 camiseta
🧥 casaco
👟 tênis
🧢 boné
⌛ ampulheta
🪑 cadeira
🛏️ cama
🚪 porta entrada saída
🪞 espelho
🧺 cesta
🛎️ campainha atendimento
🪴 planta vaso
🕯️ vela
🧷 alfinete segurança
🧵 linha costura
🪡 agulha
🎈 balão festa
🎀 laço
🪁 pipa
🔭 telescópio
⚓ âncora
🪝 gancho
⛓️ corrente
💊 remédio saúde
🩺 estetoscópio saúde
🩹 curativo
🧴 loção
`],
  ["Símbolos e status", `
🟢 verde ok ativo
🟡 amarelo atenção
🟠 laranja alerta
🔴 vermelho erro parado urgente
🟣 roxo
🔵 azul
⚪ branco
⚫ preto
🟥 quadrado vermelho
🟧 quadrado laranja
🟨 quadrado amarelo
🟩 quadrado verde
🟦 quadrado azul
🟪 quadrado roxo
⬛ quadrado preto
⬜ quadrado branco
✔️ certo marcado
❌ errado não cancelar
❎ não cancelar
➕ mais adicionar
➖ menos remover
➗ dividir
✖️ multiplicar
💯 cem perfeito
🆕 novo
🆗 ok
🆙 subir
🆒 legal
🆓 grátis
🔝 topo
🔜 em breve
🔙 voltar
🔚 fim
⚠️ atenção alerta cuidado aviso
⛔ proibido bloqueado
🚫 proibido não
📛 crachá nome
🔰 iniciante
♾️ infinito
🔀 aleatório misturar
🔂 repetir um
⬆️ cima subir
⬇️ baixo descer
➡️ direita próximo
⬅️ esquerda anterior
↩️ voltar desfazer
↪️ avançar refazer
🔃 ciclo
🔅 brilho baixo
🔆 brilho alto
#️⃣ número hashtag
*️⃣ asterisco
🔢 números
🔤 letras
🅰️ letra a
🅱️ letra b
ℹ️ informação info
🆘 socorro ajuda
🔣 símbolos
`],
];

export interface Emoji {
  e: string;
  palavras: string;
  grupo: string;
}

/** Todos os emojis, na ordem dos grupos (um emoji repetido fica só no primeiro grupo). */
export const EMOJIS_TODOS: Emoji[] = (() => {
  const vistos = new Set<string>();
  const l: Emoji[] = [];
  for (const [grupo, texto] of GRUPOS_TEXTO) {
    for (const linha of texto.split("\n")) {
      const t = linha.trim();
      if (!t) continue;
      const i = t.indexOf(" ");
      const e = i < 0 ? t : t.slice(0, i);
      if (vistos.has(e)) continue;
      vistos.add(e);
      l.push({ e, palavras: i < 0 ? "" : t.slice(i + 1), grupo });
    }
  }
  return l;
})();

export const GRUPOS_EMOJI = GRUPOS_TEXTO.map(([g]) => g);

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca pelas palavras (sem acento, cada palavra digitada tem de aparecer em alguma palavra do emoji). */
export function buscarEmojis(q: string): Emoji[] {
  const termos = semAcento(q).split(/\s+/).filter(Boolean);
  if (!termos.length) return EMOJIS_TODOS;
  return EMOJIS_TODOS.filter((x) => {
    const p = semAcento(`${x.palavras} ${x.grupo}`);
    return termos.every((t) => p.includes(t)) || x.e === q.trim();
  });
}
