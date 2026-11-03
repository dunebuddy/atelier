// Notificações: todo aviso do app passa por aqui (avisos, erros, "desfazer", pedidos dos agentes, versão nova,
// status dos agentes). Cada um vira um toast (se a configuração deixar) e fica no histórico do sininho, até ser apagado.
// O histórico e a configuração ficam no navegador do app (localStorage), por máquina.
import { guardar, ler, Rota } from "./ui";

export type Nivel = "info" | "aviso" | "erro";
/** de onde veio: o app (salvei, copiei, erro), um agente (pedido, terminou, esperando) ou a atualização */
export type Assunto = "app" | "agente" | "atualizacao";

export interface Notificacao {
  id: number;
  msg: string;
  nivel: Nivel;
  assunto: Assunto;
  quando: number;
  lida: boolean;
  /** quem mandou (o agente) */
  de?: string;
  /** clicar abre isto (um documento, um workspace...) */
  rota?: Rota;
  /** "Desfazer" (só enquanto o app está aberto; não vai para o histórico guardado) */
  desfazer?: () => Promise<unknown> | void;
}

export type Posicao = "baixo-direita" | "baixo-esquerda" | "cima-direita" | "cima-esquerda";

export interface ConfigNotificacoes {
  posicao: Posicao;
  /** quanto tempo fica o toast sem ação */
  segundos: number;
  /** toast com ação (desfazer, abrir, instalar) fica até a pessoa mexer */
  acaoFica: boolean;
  /** não mostra toast: só guarda no histórico */
  soGuardar: boolean;
  /** a partir de que nível mostra toast */
  nivel: "erro" | "aviso" | "tudo";
  /** quais assuntos mostram toast (todos vão para o histórico) */
  assuntos: Record<Assunto, boolean>;
}

const PADRAO: ConfigNotificacoes = {
  posicao: "baixo-direita", segundos: 5, acaoFica: true, soGuardar: false, nivel: "tudo",
  assuntos: { app: true, agente: true, atualizacao: true },
};

const MAX = 200;
let lista: Notificacao[] = ler<Notificacao[]>("notificacoes", []);
let proximo = Math.max(0, ...lista.map((n) => n.id)) + 1;

function salvar() {
  // o "desfazer" é função: não vai para o guardado
  guardar("notificacoes", lista.slice(0, MAX).map(({ desfazer: _d, ...n }) => n));
  window.dispatchEvent(new Event("atelier:notificacoes"));
}

export function configuracao(): ConfigNotificacoes {
  const c = ler<Partial<ConfigNotificacoes>>("notificacoes.config", {});
  return { ...PADRAO, ...c, assuntos: { ...PADRAO.assuntos, ...(c.assuntos ?? {}) } };
}

export function mudarConfiguracao(d: Partial<ConfigNotificacoes>) {
  guardar("notificacoes.config", { ...configuracao(), ...d });
  window.dispatchEvent(new Event("atelier:notificacoes"));
}

export function notificacoes(): Notificacao[] {
  return lista;
}

/** Guarda no histórico e avisa a pilha de toasts (`atelier:notificacao`). */
export function notificar(n: Omit<Notificacao, "id" | "quando" | "lida">, soHistorico = false): Notificacao {
  const nova: Notificacao = { ...n, id: proximo++, quando: Date.now(), lida: false };
  lista = [nova, ...lista].slice(0, MAX);
  salvar();
  // só no histórico: quem avisa já tem o seu cartão na tela (versão nova)
  if (!soHistorico) window.dispatchEvent(new CustomEvent("atelier:notificacao", { detail: nova }));
  return nova;
}

/** Esta notificação vira toast? (configuração: só guardar, nível, assunto) */
export function viraToast(n: Notificacao): boolean {
  const c = configuracao();
  if (c.soGuardar || !c.assuntos[n.assunto]) return false;
  if (c.nivel === "erro") return n.nivel === "erro";
  if (c.nivel === "aviso") return n.nivel !== "info";
  return true;
}

export function marcarLida(id: number) {
  lista = lista.map((n) => (n.id === id ? { ...n, lida: true } : n));
  salvar();
}

export function marcarTodasLidas() {
  if (!lista.some((n) => !n.lida)) return;
  lista = lista.map((n) => ({ ...n, lida: true }));
  salvar();
}

export function apagarNotificacao(id: number) {
  lista = lista.filter((n) => n.id !== id);
  salvar();
}

/** Apaga todas, ou só as que `quais` aceita (o filtro do sininho). */
export function limparNotificacoes(quais?: (n: Notificacao) => boolean) {
  lista = quais ? lista.filter((n) => !quais(n)) : [];
  salvar();
}

// filtro do sininho: assuntos escondidos da lista (e do número); não muda o que vira toast
export const ASSUNTOS: { id: Assunto; nome: string }[] = [
  { id: "app", nome: "Sistema" },
  { id: "agente", nome: "Agentes" },
  { id: "atualizacao", nome: "Atualização" },
];
export const assuntosEscondidos = (): Assunto[] => ler<Assunto[]>("notificacoes.escondidos", []);
export function esconderAssuntos(l: Assunto[]) {
  guardar("notificacoes.escondidos", l);
  window.dispatchEvent(new Event("atelier:notificacoes"));
}
