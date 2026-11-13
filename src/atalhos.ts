// Atalhos de teclado: todos num lugar só, com o padrão e o que o Paulo mudou (preferencias.atalhos, no config.toml).
// A combinação é guardada como texto ("Ctrl+Alt+R") e comparada pela tecla física (e.code), então o AltGr e o
// layout do teclado (ABNT2) não confundem.

export interface DefAtalho {
  id: string;
  nome: string;
  grupo: "Geral" | "Navegação" | "Painel de trabalho" | "Workspaces";
  padrao: string;
  /** combinações que também valem enquanto o atalho não foi mudado (o jeito antigo do atelier, ou outro do VS Code) */
  extras?: string[];
  /** palavras escondidas para a busca achar sem saber o nome ("aumentar janela" acha "Maximizar a janela") */
  tags?: string;
  /** a versão curta em dois tempos: Ctrl+K e depois esta tecla, sem Ctrl (como no VS Code e no tmux) */
  dois?: string;
}

// os padrões seguem o VS Code no Windows (o Paulo usa os de fábrica, mais Ctrl+Shift+Alt+J para maximizar)
export const ATALHOS: DefAtalho[] = [
  { id: "busca", nome: "Buscar ou ir para um documento", grupo: "Geral", padrao: "Ctrl+P", tags: "procurar achar abrir documento item ir para quick open" },
  { id: "acoes", nome: "Todas as ações (com busca)", grupo: "Geral", padrao: "Ctrl+Shift+P", tags: "paleta comandos ações menu o que dá para fazer" },
  { id: "buscar-texto", nome: "Buscar no texto de todos os documentos", grupo: "Geral", padrao: "Ctrl+Shift+F", tags: "procurar palavra conteúdo corpo texto inteiro pesquisa" },
  { id: "novo", nome: "Novo documento", grupo: "Geral", padrao: "Ctrl+N", tags: "criar adicionar item tarefa nota" },
  { id: "comando", nome: "Comando para o agente", grupo: "Geral", padrao: "Ctrl+J", tags: "pedir claude ia assistente conversar falar" },
  { id: "config", nome: "Configurações", grupo: "Geral", padrao: "Ctrl+,", tags: "preferências opções ajustes settings" },
  { id: "atalhos", nome: "Atalhos (ver e mudar)", grupo: "Geral", padrao: "Ctrl+/", tags: "teclado teclas lista cola cheat keyboard" },
  { id: "menu", nome: "Mostrar ou esconder a barra lateral", grupo: "Geral", padrao: "Ctrl+B", tags: "menu esquerda lado sidebar esconder visões" },
  { id: "terminal", nome: "Novo terminal", grupo: "Geral", padrao: "Ctrl+Shift+`", tags: "shell console prompt powershell abrir terminal" },
  { id: "ir-terminal", nome: "Ir para o terminal (abre um, se não há)", grupo: "Geral", padrao: "Ctrl+`", tags: "shell console focar terminal agente" },
  { id: "explorador", nome: "Explorador da pasta do workspace", grupo: "Geral", padrao: "Ctrl+Shift+E", tags: "arquivos pastas árvore explorer" },
  { id: "zoom-mais", nome: "Letra maior", grupo: "Geral", padrao: "Ctrl+=", tags: "zoom aumentar fonte tamanho" },
  { id: "zoom-menos", nome: "Letra menor", grupo: "Geral", padrao: "Ctrl+-", tags: "zoom diminuir fonte tamanho" },
  { id: "zoom-normal", nome: "Letra no tamanho normal", grupo: "Geral", padrao: "Ctrl+0", tags: "zoom voltar fonte tamanho padrão" },
  { id: "voltar", nome: "Voltar na janela com o foco", grupo: "Navegação", padrao: "Alt+←", tags: "anterior histórico back" },
  { id: "avancar", nome: "Avançar na janela com o foco", grupo: "Navegação", padrao: "Alt+→", tags: "próximo histórico forward" },
  { id: "fechar-janela", nome: "Fechar a janela com o foco", grupo: "Painel de trabalho", padrao: "Ctrl+W", tags: "fechar aba sair" },
  { id: "proxima-janela", nome: "Próxima janela da metade", grupo: "Painel de trabalho", padrao: "Ctrl+Tab", extras: ["Ctrl+PgDn"], tags: "próxima aba trocar janela seguinte" },
  { id: "janela-anterior", nome: "Janela anterior da metade", grupo: "Painel de trabalho", padrao: "Ctrl+Shift+Tab", extras: ["Ctrl+PgUp"], tags: "aba anterior trocar janela" },
  { id: "foco-esquerda", dois: "←", nome: "Foco na janela da esquerda", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+←", tags: "fita andar esquerda navegar niri" },
  { id: "foco-direita", dois: "→", nome: "Foco na janela da direita", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+→", tags: "fita andar direita navegar niri" },
  { id: "mover-esquerda", dois: "Shift+←", nome: "Mover a janela para a esquerda", grupo: "Painel de trabalho", padrao: "Ctrl+Shift+PgUp", extras: ["Ctrl+Alt+Shift+←"], tags: "arrastar reordenar aba posição" },
  { id: "mover-direita", dois: "Shift+→", nome: "Mover a janela para a direita", grupo: "Painel de trabalho", padrao: "Ctrl+Shift+PgDn", extras: ["Ctrl+Alt+Shift+→"], tags: "arrastar reordenar aba posição" },
  { id: "maximizar", dois: "J", nome: "Maximizar a janela com foco (de novo: voltar)", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+Shift+J", tags: "aumentar janela grande cheia ampliar esconder metade espaço zoom painel" },
  { id: "zen", dois: "Z", nome: "Modo Zen: a janela com foco na tela toda", grupo: "Painel de trabalho", padrao: "F11", tags: "tela cheia foco concentrar distração fullscreen esconder tudo" },
  { id: "dividir", dois: "\\", nome: "Dividir o painel em dois (de novo: juntar)", grupo: "Painel de trabalho", padrao: "Ctrl+\\", extras: ["Ctrl+Alt+\\"], tags: "split lado a lado duas metades" },
  { id: "painel-0", nome: "Foco no painel 0 (esquerda)", grupo: "Painel de trabalho", padrao: "Ctrl+1", tags: "metade esquerda primeiro grupo" },
  { id: "painel-1", nome: "Foco no painel 1 (direita)", grupo: "Painel de trabalho", padrao: "Ctrl+2", tags: "metade direita segundo grupo" },
  { id: "trocar-metade", dois: "O", nome: "Trocar o foco de painel", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+O", tags: "metade outro lado alternar" },
  { id: "modo-abas", dois: "1", nome: "Modo abas", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+1", tags: "layout tabs" },
  { id: "modo-tile", dois: "2", nome: "Modo tile", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+2", tags: "layout grade mosaico" },
  { id: "modo-fita", dois: "3", nome: "Modo fita", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+3", tags: "layout colunas rolagem niri" },
  { id: "largura", dois: "R", nome: "Fita: próxima largura da coluna", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+R", tags: "tamanho coluna largura redimensionar" },
  { id: "empilhar", dois: "↓", nome: "Fita: empilhar embaixo da anterior", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+↓", tags: "coluna juntar embaixo" },
  { id: "desempilhar", dois: "↑", nome: "Fita: tirar da coluna", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+↑", tags: "coluna separar" },
  { id: "promover", dois: "Enter", nome: "Tile: virar a janela principal", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+Enter", tags: "principal grande destaque" },
  { id: "visao-geral", dois: "W", nome: "Visão geral dos workspaces", grupo: "Workspaces", padrao: "Ctrl+R", extras: ["Ctrl+Shift+O"], tags: "workspaces recentes todos abertos overview trocar" },
  { id: "workspace-proximo", nome: "Próximo workspace aberto", grupo: "Workspaces", padrao: "Ctrl+Alt+PgDn", tags: "trocar workspace seguinte" },
  { id: "workspace-anterior", nome: "Workspace anterior", grupo: "Workspaces", padrao: "Ctrl+Alt+PgUp", tags: "trocar workspace anterior" },
];

let mudados: Record<string, string> = {};

/** O que o Paulo mudou (vazio = padrão). */
export function definirAtalhos(m: Record<string, string> | undefined) {
  mudados = m ?? {};
  window.dispatchEvent(new Event("atelier:atalhos"));
}

/** A combinação principal (a que se mostra). */
export function combinacao(id: string): string {
  return mudados[id] || ATALHOS.find((a) => a.id === id)?.padrao || "";
}

/** Todas as que valem: a mudada pelo Paulo, ou o padrão com os extras. */
export function combinacoes(id: string): string[] {
  if (mudados[id]) return [mudados[id]];
  const d = ATALHOS.find((a) => a.id === id);
  return d ? [d.padrao, ...(d.extras ?? [])] : [];
}

// nome da tecla pela posição física (e.code); o resto pelo e.key
const CODIGOS: Record<string, string> = {
  ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓", PageUp: "PgUp", PageDown: "PgDn",
  Backslash: "\\", IntlBackslash: "\\", Backquote: "`", Comma: ",", Period: ".", Slash: "/", IntlRo: "/", Equal: "=", Minus: "-",
  NumpadAdd: "=", NumpadSubtract: "-", Semicolon: ";", Quote: "'", BracketLeft: "[", BracketRight: "]",
  Enter: "Enter", NumpadEnter: "Enter", Tab: "Tab", Space: "Espaço", Escape: "Esc", Backspace: "Backspace", Delete: "Delete",
  Home: "Home", End: "End", Insert: "Insert",
};

function teclaDe(e: KeyboardEvent): string | null {
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3);
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  if (/^Numpad\d$/.test(e.code)) return e.code.slice(6);
  if (/^F\d{1,2}$/.test(e.code)) return e.code;
  if (CODIGOS[e.code]) return CODIGOS[e.code];
  if (["Control", "Alt", "Shift", "Meta", "AltGraph"].includes(e.key)) return null;
  return e.key.length === 1 ? e.key.toUpperCase() : e.key;
}

/** "Ctrl+Alt+R" a partir da tecla apertada (null se só apertou modificador). */
export function comboDe(e: KeyboardEvent): string | null {
  const t = teclaDe(e);
  if (!t) return null;
  return [e.ctrlKey || e.metaKey ? "Ctrl" : "", e.altKey ? "Alt" : "", e.shiftKey ? "Shift" : "", t].filter(Boolean).join("+");
}

/** A tecla apertada é o atalho `id`? */
export function bate(id: string, e: KeyboardEvent): boolean {
  const c = comboDe(e);
  return !!c && combinacoes(id).includes(c);
}

// do app mesmo com o cursor num terminal (como a lista "pular o shell" do VS Code). Ficam com o terminal: Ctrl+W
// (apagar palavra), Ctrl+B (segundo plano no Claude Code), Ctrl+J (quebra de linha), Ctrl+R (busca no histórico)
const FORA_DO_TERMINAL = new Set(["busca", "acoes", "buscar-texto", "config", "explorador", "zen", "maximizar"]);
const DO_TERMINAL = new Set(["fechar-janela", "visao-geral"]);

/** Atalho que vale também com o foco num terminal, que senão engoliria a tecla: os do painel e dos workspaces
 *  (andar na fita, mover, dividir...) e os de `FORA_DO_TERMINAL`. */
export function doPainel(e: KeyboardEvent): boolean {
  // Ctrl+Alt+letra/número é o AltGr do teclado (ABNT2: ?, °, ¹...): fica com o terminal
  if (e.ctrlKey && e.altKey && !e.shiftKey && /^(Key|Digit)/.test(e.code)) return false;
  return ATALHOS.some((a) => (FORA_DO_TERMINAL.has(a.id) || a.grupo === "Painel de trabalho" || a.grupo === "Workspaces") && !DO_TERMINAL.has(a.id) && bate(a.id, e));
}

/** Qual atalho usa esta combinação (para avisar de conflito). */
export function quemUsa(combo: string, fora?: string): DefAtalho | undefined {
  return ATALHOS.find((a) => a.id !== fora && combinacoes(a.id).includes(combo));
}

/** Busca nos atalhos pelo nome, pelas palavras escondidas e pela combinação, sem ligar para acento. */
export function acharAtalhos(texto: string): DefAtalho[] {
  const t = semAcento(texto.trim());
  if (!t) return ATALHOS;
  const palavras = t.split(/\s+/);
  return ATALHOS.filter((a) => {
    const onde = semAcento(`${a.nome} ${a.tags ?? ""} ${a.grupo} ${combinacoes(a.id).join(" ")} ${doisTempos(a.id)}`);
    return palavras.every((p) => onde.includes(p));
  });
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Aperta o atalho `id` de mentira: a lista de ações executa assim (cada ação já escuta o seu atalho). */
export function dispararAtalho(id: string) {
  const c = combinacao(id);
  if (!c) return;
  const p = partes(c);
  const tecla = p[p.length - 1];
  const codigoDe = Object.fromEntries(Object.entries(CODIGOS).map(([k, v]) => [v, k]));
  const code = /^[A-Z]$/.test(tecla) ? `Key${tecla}` : /^\d$/.test(tecla) ? `Digit${tecla}` : /^F\d{1,2}$/.test(tecla) ? tecla : codigoDe[tecla] ?? tecla;
  document.body.dispatchEvent(new KeyboardEvent("keydown", {
    key: tecla.length === 1 ? tecla.toLowerCase() : tecla, code, bubbles: true, cancelable: true,
    ctrlKey: p.includes("Ctrl"), altKey: p.includes("Alt"), shiftKey: p.includes("Shift"),
  }));
}

/** Teclas para mostrar (`<kbd>`): "Ctrl+Alt+R" → ["Ctrl", "Alt", "R"]. */
export function partes(combo: string): string[] {
  return combo.split("+").filter((x, i, l) => x !== "" || (i === l.length - 1 && combo.endsWith("+"))).map((x) => x || "+");
}

// ---------- dois tempos: Ctrl+K e depois uma tecla ----------

/** O prefixo dos atalhos em dois tempos. No terminal ele fica com o shell (lá Ctrl+K apaga até o fim da linha). */
export const PREFIXO = "Ctrl+K";
const ESPERA = 2000;

/** "Ctrl+K J" para mostrar. */
export const doisTempos = (id: string) => {
  const d = ATALHOS.find((a) => a.id === id)?.dois;
  return d ? `${PREFIXO} ${d}` : "";
};

/** A segunda tecla como no `dois` ("J", "Shift+←", "\\", "Enter"). */
function segundaDe(e: KeyboardEvent): string | null {
  const t = teclaDe(e);
  if (!t) return null;
  return e.shiftKey && !/^[A-Z]$/.test(t) ? `Shift+${t}` : t;
}

let esperando = 0;
const avisarModo = (ativo: boolean) => window.dispatchEvent(new CustomEvent("atelier:dois-tempos", { detail: ativo }));

/** Liga os atalhos em dois tempos (uma vez, no App). Ctrl+K arma; a tecla seguinte, sem Ctrl, dispara o atalho. */
export function instalarDoisTempos() {
  const sair = () => { window.clearTimeout(esperando); esperando = 0; avisarModo(false); };
  window.addEventListener("keydown", (e) => {
    if (!e.isTrusted) return; // o dispararAtalho manda teclas de mentira: não são para cá
    if (esperando) {
      if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const seg = segundaDe(e);
      const a = !e.ctrlKey && !e.altKey && seg ? ATALHOS.find((x) => x.dois === seg) : undefined;
      sair();
      if (a) window.setTimeout(() => dispararAtalho(a.id), 0);
      return;
    }
    if (comboDe(e) !== PREFIXO) return;
    if ((document.activeElement as HTMLElement | null)?.closest(".pt-term")) return; // no terminal, é do shell
    e.preventDefault();
    e.stopImmediatePropagation();
    avisarModo(true);
    esperando = window.setTimeout(sair, ESPERA);
  }, true);
}

/** Os atalhos que têm a versão em dois tempos (para o selo mostrar o que dá para apertar). */
export const comDoisTempos = () => ATALHOS.filter((a) => a.dois);
