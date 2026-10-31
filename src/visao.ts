// Períodos relativos das visões ("hoje", "esta semana"...) viram datas AAAA-MM-DD no fuso local.

import { Periodo } from "./api";

export const PERIODOS: { id: Periodo; nome: string }[] = [
  { id: "hoje", nome: "Hoje" },
  { id: "ontem", nome: "Ontem" },
  { id: "semana", nome: "Esta semana" },
  { id: "7d", nome: "Últimos 7 dias" },
  { id: "30d", nome: "Últimos 30 dias" },
  { id: "mes", nome: "Este mês" },
];

export function iso(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function soma(d: Date, dias: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + dias);
  return r;
}

/** `desloca` anda para trás/frente na unidade do período (dias para hoje/ontem, semanas, meses...). */
export function datasDo(p: Periodo, desloca = 0): { de: string; ate: string } {
  const hoje = new Date();
  switch (p) {
    case "hoje": { const d = soma(hoje, desloca); return { de: iso(d), ate: iso(d) }; }
    case "ontem": { const d = soma(hoje, desloca - 1); return { de: iso(d), ate: iso(d) }; }
    case "semana": {
      const seg = soma(hoje, -((hoje.getDay() + 6) % 7) + 7 * desloca);
      return { de: iso(seg), ate: iso(soma(seg, 6)) };
    }
    case "7d": return { de: iso(soma(hoje, -6 + 7 * desloca)), ate: iso(soma(hoje, 7 * desloca)) };
    case "30d": return { de: iso(soma(hoje, -29 + 30 * desloca)), ate: iso(soma(hoje, 30 * desloca)) };
    case "mes": {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() + desloca, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth() + desloca + 1, 0);
      return { de: iso(ini), ate: iso(fim) };
    }
  }
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "2026-10-30" → "quinta, 30 de outubro de 2026" */
export function diaPorExtenso(dia: string) {
  const [a, m, d] = dia.split("-").map(Number);
  const dt = new Date(a, m - 1, d);
  return `${DIAS[dt.getDay()]}, ${d} de ${MESES[m - 1]} de ${a}`;
}

/** Data e hora sempre completas: "30/10/2026 18:55". */
export function dataHora(isoCompleto: string) {
  const d = new Date(isoCompleto);
  if (isNaN(d.getTime())) return isoCompleto;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

export function hora(isoCompleto: string) {
  const d = new Date(isoCompleto);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Rótulo do intervalo para a barra de navegação. */
export function rotuloIntervalo(de: string, ate: string) {
  const br = (s: string) => s.split("-").reverse().join("/");
  if (de === ate) {
    const hoje = iso(new Date());
    const ontem = iso(soma(new Date(), -1));
    return de === hoje ? `Hoje · ${br(de)}` : de === ontem ? `Ontem · ${br(de)}` : `${diaPorExtenso(de)}`;
  }
  return `${br(de)} a ${br(ate)}`;
}
