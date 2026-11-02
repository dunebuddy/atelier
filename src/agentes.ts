// Status dos agentes rodando nos terminais do atelier, por sessão de terminal. Quem avisa é o hook do agente
// (atelier-mcp hook ..., pela API → tela) e o sino do terminal (BEL), que vários agentes tocam quando esperam.
// O status de um workspace é o mais importante dos agentes dele: esperando > trabalhando > terminou > parado.

export type EstadoAgente = "esperando" | "trabalhando" | "terminou" | "parado";

const ORDEM: EstadoAgente[] = ["esperando", "trabalhando", "terminou", "parado"];
const estados = new Map<number, EstadoAgente>();

export function marcarAgente(sessao: number, estado: EstadoAgente) {
  if (estados.get(sessao) === estado) return;
  estados.set(sessao, estado);
  window.dispatchEvent(new Event("atelier:agentes"));
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
