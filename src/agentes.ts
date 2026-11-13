// Status dos agentes rodando nos terminais do atelier, por sessão de terminal. Quem avisa é o hook do agente
// (atelier-mcp hook ..., pela API → tela) e o sino do terminal (BEL), que vários agentes tocam quando esperam.
// O status de um workspace é o mais importante dos agentes dele: esperando > trabalhando > terminou > parado.

export type EstadoAgente = "esperando" | "trabalhando" | "terminou" | "parado";

const ORDEM: EstadoAgente[] = ["esperando", "trabalhando", "terminou", "parado"];
const estados = new Map<number, EstadoAgente>();
/** desde quando a sessão está no estado de agora (a fila da barra de status: quem espera há mais tempo vem antes) */
const desde = new Map<number, number>();
/** já atendidas: a pessoa foi até o agente; saem da fila até ele mudar de estado de novo */
const atendidas = new Set<number>();

/** o último estado que virou notificação, por sessão (o mesmo aviso repetido não vira outro toast) */
const avisado = new Map<number, EstadoAgente>();

/** Avisar (toast/sininho) deste estado? Não, se já avisou dele e ninguém foi ver nem o agente mudou de estado. */
export function deveAvisar(sessao: number, estado: EstadoAgente): boolean {
  if (avisado.get(sessao) === estado) return false;
  avisado.set(sessao, estado);
  return true;
}

export function marcarAgente(sessao: number, estado: EstadoAgente) {
  if (avisado.has(sessao) && avisado.get(sessao) !== estado) avisado.delete(sessao);
  // o mesmo estado de novo: só importa se já tinha sido atendido (o agente pediu de novo: volta para a fila)
  if (estados.get(sessao) === estado && !atendidas.has(sessao)) return;
  estados.set(sessao, estado);
  desde.set(sessao, Date.now());
  atendidas.delete(sessao);
  window.dispatchEvent(new Event("atelier:agentes"));
}

/** Esperam você: terminaram ou pedem uma ação, e ninguém foi ver ainda. A mais antiga primeiro. */
export function filaDeEspera(): { sessao: number; estado: EstadoAgente; desde: number }[] {
  return [...estados.entries()]
    .filter(([s, e]) => (e === "esperando" || e === "terminou") && !atendidas.has(s))
    .map(([s, e]) => ({ sessao: s, estado: e, desde: desde.get(s) ?? 0 }))
    .sort((a, b) => a.desde - b.desde);
}

/** A pessoa foi até estes agentes: saem da fila (o "terminou" vira "parado"; o "esperando" continua, mas atendido). */
export function atender(sessoes: number[]) {
  let mudou = false;
  for (const s of sessoes) {
    avisado.delete(s);
    const e = estados.get(s);
    if (e === "terminou") { estados.set(s, "parado"); mudou = true; }
    if (e === "esperando" && !atendidas.has(s)) { atendidas.add(s); mudou = true; }
  }
  if (mudou) window.dispatchEvent(new Event("atelier:agentes"));
}

/** A sessão do terminal que está com o foco agora (o app em foco e o cursor nele), ou null. */
export function sessaoEmFoco(): number | null {
  if (!document.hasFocus()) return null;
  const t = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(".pt-term[data-sessao]");
  return t ? Number(t.dataset.sessao) : null;
}

export function estadoDaSessao(sessao: number): EstadoAgente | undefined {
  return estados.get(sessao);
}

/** O mais importante entre as sessões (null: nenhuma tem agente que avisou). */
export function estadoDe(sessoes: number[]): EstadoAgente | null {
  let melhor: EstadoAgente | null = null;
  for (const s of sessoes) {
    const e = estados.get(s);
    if (e && (melhor === null || ORDEM.indexOf(e) < ORDEM.indexOf(melhor))) melhor = e;
  }
  return melhor;
}

/** Abriu o workspace: o que tinha terminado passa a "parado" (já foi visto). */
export function verSessoes(sessoes: number[]) {
  let mudou = false;
  for (const s of sessoes) {
    if (estados.get(s) === "terminou") {
      estados.set(s, "parado");
      mudou = true;
    }
  }
  if (mudou) window.dispatchEvent(new Event("atelier:agentes"));
}
