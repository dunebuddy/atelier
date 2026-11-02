// Atalhos de teclado: todos num lugar só, com o padrão e o que o Paulo mudou (preferencias.atalhos, no config.toml).
// A combinação é guardada como texto ("Ctrl+Alt+R") e comparada pela tecla física (e.code), então o AltGr e o
// layout do teclado (ABNT2) não confundem.

export interface DefAtalho {
  id: string;
  nome: string;
  grupo: "Geral" | "Navegação" | "Painel de trabalho" | "Workspaces";
  padrao: string;
}

export const ATALHOS: DefAtalho[] = [
  { id: "busca", nome: "Buscar ou ir para um documento", grupo: "Geral", padrao: "Ctrl+K" },
  { id: "novo", nome: "Novo documento", grupo: "Geral", padrao: "Ctrl+N" },
  { id: "comando", nome: "Comando para o agente", grupo: "Geral", padrao: "Ctrl+J" },
  { id: "config", nome: "Configurações", grupo: "Geral", padrao: "Ctrl+," },
  { id: "atalhos", nome: "Lista de atalhos", grupo: "Geral", padrao: "Ctrl+/" },
  { id: "menu", nome: "Mostrar ou esconder a barra lateral", grupo: "Geral", padrao: "Ctrl+\\" },
  { id: "terminal", nome: "Novo terminal ao lado", grupo: "Geral", padrao: "Ctrl+`" },
  { id: "zoom-mais", nome: "Letra maior", grupo: "Geral", padrao: "Ctrl+=" },
  { id: "zoom-menos", nome: "Letra menor", grupo: "Geral", padrao: "Ctrl+-" },
  { id: "zoom-normal", nome: "Letra no tamanho normal", grupo: "Geral", padrao: "Ctrl+0" },
  { id: "voltar", nome: "Voltar na janela com o foco", grupo: "Navegação", padrao: "Alt+←" },
  { id: "avancar", nome: "Avançar na janela com o foco", grupo: "Navegação", padrao: "Alt+→" },
  { id: "fechar-janela", nome: "Fechar a janela com o foco", grupo: "Painel de trabalho", padrao: "Ctrl+W" },
  { id: "proxima-janela", nome: "Próxima janela da metade", grupo: "Painel de trabalho", padrao: "Ctrl+Tab" },
  { id: "janela-anterior", nome: "Janela anterior da metade", grupo: "Painel de trabalho", padrao: "Ctrl+Shift+Tab" },
  { id: "foco-esquerda", nome: "Foco na janela da esquerda", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+←" },
  { id: "foco-direita", nome: "Foco na janela da direita", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+→" },
  { id: "mover-esquerda", nome: "Mover a janela para a esquerda", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+Shift+←" },
  { id: "mover-direita", nome: "Mover a janela para a direita", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+Shift+→" },
  { id: "dividir", nome: "Dividir o painel em dois (de novo: juntar)", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+\\" },
  { id: "trocar-metade", nome: "Trocar o foco de metade", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+O" },
  { id: "modo-abas", nome: "Modo abas", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+1" },
  { id: "modo-tile", nome: "Modo tile", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+2" },
  { id: "modo-fita", nome: "Modo fita", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+3" },
  { id: "largura", nome: "Fita: próxima largura da coluna", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+R" },
  { id: "empilhar", nome: "Fita: empilhar embaixo da anterior", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+↓" },
  { id: "desempilhar", nome: "Fita: tirar da coluna", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+↑" },
  { id: "promover", nome: "Tile: virar a janela principal", grupo: "Painel de trabalho", padrao: "Ctrl+Alt+Enter" },
  { id: "visao-geral", nome: "Visão geral dos workspaces", grupo: "Workspaces", padrao: "Ctrl+Shift+O" },
  { id: "workspace-proximo", nome: "Próximo workspace aberto", grupo: "Workspaces", padrao: "Ctrl+Alt+PgDn" },
  { id: "workspace-anterior", nome: "Workspace anterior", grupo: "Workspaces", padrao: "Ctrl+Alt+PgUp" },
];

let mudados: Record<string, string> = {};

/** O que o Paulo mudou (vazio = padrão). */
export function definirAtalhos(m: Record<string, string> | undefined) {
  mudados = m ?? {};
  window.dispatchEvent(new Event("atelier:atalhos"));
}

export function combinacao(id: string): string {
  return mudados[id] || ATALHOS.find((a) => a.id === id)?.padrao || "";
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
  const c = combinacao(id);
  return !!c && comboDe(e) === c;
}

/** Atalho do painel ou dos workspaces (andar na fita, mover, dividir...): vale também com o foco num terminal, que
 *  senão engoliria a tecla. Fechar a janela fica de fora: o Ctrl+W é do shell (apagar palavra). */
export function doPainel(e: KeyboardEvent): boolean {
  // Ctrl+Alt+letra/número é o AltGr do teclado (ABNT2: ?, °, ¹...): fica com o terminal
  if (e.ctrlKey && e.altKey && /^(Key|Digit)/.test(e.code)) return false;
  return ATALHOS.some((a) => (a.grupo === "Painel de trabalho" || a.grupo === "Workspaces") && a.id !== "fechar-janela" && bate(a.id, e));
}

/** Qual atalho usa esta combinação (para avisar de conflito). */
export function quemUsa(combo: string, fora?: string): DefAtalho | undefined {
  return ATALHOS.find((a) => a.id !== fora && combinacao(a.id) === combo);
}

/** Teclas para mostrar (`<kbd>`): "Ctrl+Alt+R" → ["Ctrl", "Alt", "R"]. */
export function partes(combo: string): string[] {
  return combo.split("+").filter((x, i, l) => x !== "" || (i === l.length - 1 && combo.endsWith("+"))).map((x) => x || "+");
}
