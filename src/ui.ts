// Pequenos utilitários de interface compartilhados.

export type Rota =
  | { v: "inicio" }
  | { v: "lixeira" }
  | { v: "visao"; id: number }
  | { v: "lista"; tipo: number | null }
  | { v: "item"; id: number }
  | { v: "tipo"; id: number }
  /** janela de terminal: `sessao` identifica o processo (muda = outro terminal) */
  | { v: "terminal"; sessao: number; cwd?: string; programa?: string; shell?: string; titulo?: string }
  /** janela de arquivos: navega a partir de `raiz` */
  | { v: "arquivos"; raiz: string; arquivo?: string; titulo?: string }
  /** árvore de pastas: clicar num arquivo abre ele numa janela ao lado */
  | { v: "pastas"; raiz: string; titulo?: string };

/** Abre uma rota de qualquer lugar (um chip de relação, a barra lateral, o MCP). `nova`: ao lado, sem trocar a atual. */
export function abrir(rota: Rota, nova = false) {
  window.dispatchEvent(new CustomEvent("atelier:abrir", { detail: { rota, nova } }));
}

/** "claro" | "escuro" | "nord" ou o id de um tema em arquivo (~/atelier/temas) */
export type Tema = string;

/** Mostra um aviso embaixo. Com `desfazer`, o aviso ganha o botão "Desfazer" (e Ctrl+Z, enquanto estiver na tela). */
export function avisar(msg: string, desfazer?: () => Promise<unknown> | void) {
  window.dispatchEvent(new CustomEvent("atelier:aviso", { detail: { msg, desfazer } }));
}

export function falhou(e: unknown) {
  avisar(e instanceof Error ? e.message : String(e));
}

export function ler<T>(chave: string, padrao: T): T {
  try {
    const s = localStorage.getItem("atelier." + chave);
    return s ? (JSON.parse(s) as T) : padrao;
  } catch {
    return padrao;
  }
}

export function guardar(chave: string, valor: unknown) {
  try {
    localStorage.setItem("atelier." + chave, JSON.stringify(valor));
  } catch {
    /* sem storage: só não lembra */
  }
}

export function quando(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const hh = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return `hoje ${hh}`;
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return `ontem ${hh}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " " + hh;
}

export const EMOJIS = [
  "📄", "✅", "🧾", "⏳", "✨", "📝", "📥", "🎯", "🐛", "🔧", "🚀", "📌", "💡", "📚", "🗂️", "🧪",
  "🔥", "⭐", "🧭", "🏗️", "💬", "📅", "💰", "🔒", "☁️", "🗄️", "🤝", "🎨", "🧱", "📊", "🛠️", "❓",
];

