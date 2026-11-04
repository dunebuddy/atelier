// Relatório em HTML (e PDF, que sai do mesmo HTML) com layout de verdade: capa, sumário, cores do tipo, chips das
// opções, tipografia. Quatro moldes; quem monta os dados é o Exportar, aqui só se desenha.
import { marked } from "marked";
import type { Cor } from "./api";

export type Layout = "executivo" | "fichas" | "compacto" | "documento";

export const LAYOUTS: { id: Layout; nome: string; dica: string }[] = [
  { id: "executivo", nome: "Executivo", dica: "capa com números, sumário e uma seção por documento" },
  { id: "fichas", nome: "Fichas", dica: "um cartão por documento, em duas colunas" },
  { id: "compacto", nome: "Tabela compacta", dica: "uma linha por documento, com chips e resumo" },
  { id: "documento", nome: "Documento corrido", dica: "texto longo, para ler do começo ao fim" },
];

/** Mesmas cores das opções do app (tema claro: o relatório é para papel e tela branca). */
const PALETA: Record<Cor, { bg: string; fg: string; borda: string }> = {
  gray: { bg: "#ece9e1", fg: "#5b574d", borda: "#d9d4c8" },
  brown: { bg: "#f1e4da", fg: "#74472f", borda: "#e2c9b6" },
  orange: { bg: "#fbe4d2", fg: "#96460f", borda: "#f1c39f" },
  yellow: { bg: "#f8eecb", fg: "#7d5d06", borda: "#ead79a" },
  green: { bg: "#e0eedf", fg: "#2c6a39", borda: "#bcd9bd" },
  blue: { bg: "#dde9f5", fg: "#1f4f7c", borda: "#b6cfe8" },
  purple: { bg: "#ebe2f5", fg: "#5a3786", borda: "#d0bfe8" },
  pink: { bg: "#f6e0ec", fg: "#82295b", borda: "#e8bcd5" },
  red: { bg: "#f8dfdb", fg: "#922b20", borda: "#ebb9b1" },
};
const ACENTO = "#3a5a8c";
const corDe = (c?: string | null) => (c && c in PALETA ? PALETA[c as Cor] : null);

/** Um valor de propriedade como vai no relatório: chips (opções com cor) ou texto. */
export interface CampoRel { nome: string; texto: string; chips?: { nome: string; cor?: Cor }[] }
export interface DocRel {
  codigo: string;
  titulo: string;
  tipo?: { nome: string; icone: string; cor: string | null };
  /** os ligados entram depois, numa parte própria */
  ligado: boolean;
  campos: CampoRel[];
  /** markdown (o texto do documento, ou o que o agente escreveu no lugar) */
  corpo?: string;
  /** o texto veio do agente (aparece um selo discreto) */
  redigido?: boolean;
  notas: { quando: string; autor: string; texto: string }[];
  /** já resumida pelo agente: um parágrafo no lugar da lista */
  notasResumo?: string;
  apontado: string[];
  link?: string;
  datas?: string;
}
export interface Mostrar { codigo: boolean; tipo: boolean; titulo: boolean }

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const md = (s: string) => marked.parse(s, { async: false }) as string;
const ancora = (d: DocRel) => `d-${d.codigo}`;

function chips(c: CampoRel) {
  if (!c.chips?.length) return `<span class="valor">${esc(c.texto).replace(/\n/g, "<br>")}</span>`;
  return c.chips.map((x) => {
    const p = corDe(x.cor) ?? PALETA.gray;
    return `<span class="chip" style="background:${p.bg};color:${p.fg};border-color:${p.borda}">${esc(x.nome)}</span>`;
  }).join(" ");
}
/** Os campos com opção (status, seleção) vão em chips no topo; o resto numa grade de rótulo e valor. */
function camposHtml(d: DocRel, onde: "topo" | "grade") {
  const l = d.campos.filter((c) => c.texto && (onde === "topo" ? !!c.chips?.length : !c.chips?.length));
  if (!l.length) return "";
  if (onde === "topo") return `<div class="chips">${l.map((c) => `<span class="rotulo-chip">${esc(c.nome)}</span> ${chips(c)}`).join('<span class="sep"></span>')}</div>`;
  return `<dl class="grade">${l.map((c) => `<dt>${esc(c.nome)}</dt><dd>${chips(c)}</dd>`).join("")}</dl>`;
}
function tipoHtml(d: DocRel, m: Mostrar) {
  if (!m.tipo || !d.tipo) return "";
  const p = corDe(d.tipo.cor);
  return `<span class="tipo" style="${p ? `color:${p.fg};background:${p.bg}` : ""}">${esc(d.tipo.icone)} ${esc(d.tipo.nome)}</span>`;
}
function tituloHtml(d: DocRel, m: Mostrar, tag = "h2") {
  const cod = m.codigo ? `<span class="codigo">#${esc(d.codigo)}</span>` : "";
  return `<${tag} id="${ancora(d)}">${m.titulo ? esc(d.titulo || "Sem título") : `#${esc(d.codigo)}`}${m.titulo ? ` ${cod}` : ""}</${tag}>`;
}
function rodapeDoc(d: DocRel) {
  const l: string[] = [];
  if (d.apontado.length) l.push(`<div class="apontado"><b>Apontado por:</b> ${d.apontado.map(esc).join(" · ")}</div>`);
  if (d.notasResumo) l.push(`<div class="notas"><h4>Linha do tempo</h4>${md(d.notasResumo)}</div>`);
  else if (d.notas.length) {
    l.push(`<div class="notas"><h4>Linha do tempo</h4><ul>${d.notas.map((n) => `<li><span class="quando">${esc(n.quando)}</span> <b>${esc(n.autor)}</b> ${esc(n.texto).replace(/\n/g, " ")}</li>`).join("")}</ul></div>`);
  }
  const meta = [d.datas, d.link ? `<a href="${esc(d.link)}">${esc(d.link)}</a>` : ""].filter(Boolean);
  if (meta.length) l.push(`<div class="meta">${meta.join(" · ")}</div>`);
  return l.join("");
}
const corpoHtml = (d: DocRel) => (d.corpo?.trim() ? `<div class="corpo${d.redigido ? " redigido" : ""}">${md(d.corpo)}</div>` : "");
/** Cor de destaque do documento (a do tipo, ou a do relatório). */
const corDoc = (d: DocRel) => corDe(d.tipo?.cor)?.fg ?? ACENTO;

function contagens(docs: DocRel[]) {
  const porTipo = new Map<string, { n: number; icone: string; cor: string | null }>();
  for (const d of docs) {
    const k = d.tipo?.nome ?? "Sem tipo";
    const x = porTipo.get(k) ?? { n: 0, icone: d.tipo?.icone ?? "·", cor: d.tipo?.cor ?? null };
    x.n++;
    porTipo.set(k, x);
  }
  // a primeira propriedade de opção mais comum (status, em geral): quantos em cada opção
  const porOpcao = new Map<string, { n: number; cor?: Cor }>();
  const primeira = docs.flatMap((d) => d.campos.filter((c) => c.chips?.length)).map((c) => c.nome)[0];
  if (primeira) {
    for (const d of docs) {
      for (const ch of d.campos.find((c) => c.nome === primeira)?.chips ?? []) {
        const x = porOpcao.get(ch.nome) ?? { n: 0, cor: ch.cor };
        x.n++;
        porOpcao.set(ch.nome, x);
      }
    }
  }
  return { porTipo, porOpcao, primeira };
}

const BASE_CSS = `
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;background:#f4f2ee;color:#22231f;font:14.5px/1.6 "Inter","Segoe UI",system-ui,-apple-system,sans-serif}
.folha{max-width:980px;margin:28px auto;background:#fff;padding:48px 56px 56px;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08),0 8px 28px rgba(0,0,0,.06)}
h1,h2,h3{font-family:"Fraunces","Iowan Old Style",Georgia,"Times New Roman",serif;font-weight:600;line-height:1.22;color:#1b1c19}
h1{font-size:34px;margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:21px;margin:0 0 8px}
h4{font:600 11px/1.4 "Inter","Segoe UI",sans-serif;text-transform:uppercase;letter-spacing:.08em;color:#8a877d;margin:16px 0 6px}
.sub{color:#7a776d;font-size:13px}
.codigo{font:500 12px "Cascadia Code",Consolas,monospace;color:#9a978c;font-weight:400;vertical-align:middle}
.tipo{display:inline-block;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:999px;background:#ece9e1;color:#5b574d}
.chips{display:flex;flex-wrap:wrap;align-items:center;gap:6px 4px;margin:8px 0 4px}
.chip{display:inline-block;font-size:11.5px;font-weight:600;padding:1px 9px;border-radius:999px;border:1px solid}
.rotulo-chip{font-size:11px;color:#9a978c;margin-left:2px}
.chips .sep{width:10px}
dl.grade{display:grid;grid-template-columns:max-content 1fr;gap:3px 16px;margin:10px 0;font-size:13px}
dl.grade dt{color:#8a877d}
dl.grade dd{margin:0}
.corpo{margin-top:10px}
.corpo p{margin:.5em 0}
.corpo.redigido{border-left:3px solid #d9d4c8;padding-left:12px}
.corpo table{border-collapse:collapse;font-size:13px}
.corpo td,.corpo th{border:1px solid #ddd;padding:4px 8px}
code{background:#f4f2ea;padding:1px 4px;border-radius:4px;font-size:.9em}
pre{background:#f4f2ea;padding:10px 12px;border-radius:6px;overflow:auto}
.notas ul{list-style:none;padding:0;margin:0;font-size:12.5px;color:#55534b}
.notas li{padding:3px 0;border-bottom:1px dashed #ebe8df}
.notas .quando{color:#9a978c;font-variant-numeric:tabular-nums}
.apontado,.meta{font-size:12px;color:#8a877d;margin-top:8px}
a{color:${ACENTO}}
.parte{font:600 12px "Inter",sans-serif;text-transform:uppercase;letter-spacing:.1em;color:#8a877d;margin:40px 0 12px;padding-top:14px;border-top:2px solid #22231f}
.rodape{margin-top:40px;font-size:11.5px;color:#a3a095;text-align:center}
@page{size:A4;margin:14mm 13mm}
@media print{
  body{background:#fff}
  .folha{max-width:none;margin:0;padding:0;box-shadow:none;border-radius:0}
  h2,h3,h4{break-after:avoid}
  .notas li,tr{break-inside:avoid}
  a{color:inherit;text-decoration:none}
}`;

const CSS: Record<Layout, string> = {
  executivo: `
.capa{border-bottom:2px solid #22231f;padding-bottom:22px;margin-bottom:22px}
.capa .marca{font:600 11px "Inter",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:${ACENTO};margin-bottom:14px}
.numeros{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
.numero{min-width:120px;padding:10px 14px;border-radius:8px;background:#f7f5f0;border:1px solid #ebe8df}
.numero b{display:block;font:600 24px "Fraunces",Georgia,serif;color:#1b1c19}
.numero span{font-size:12px;color:#7a776d}
.sumario{columns:2;column-gap:28px;font-size:13px;margin:6px 0 10px;padding:0;list-style:none}
.sumario li{break-inside:avoid;padding:2px 0;border-bottom:1px dotted #e3e0d6}
.sumario a{color:#22231f;text-decoration:none}
.sumario .codigo{font-size:11px}
section.doc{padding:22px 0 20px;border-top:1px solid #ebe8df}
section.doc h2{border-left:4px solid var(--c);padding-left:12px;margin-left:-16px}
@media print{section.doc{break-inside:auto}.sumario{columns:2}}`,
  fichas: `
.cabeca{display:flex;align-items:baseline;justify-content:space-between;gap:16px;border-bottom:2px solid #22231f;padding-bottom:14px;margin-bottom:22px}
.cartoes{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.cartao{border:1px solid #e6e3da;border-radius:10px;padding:16px 18px 14px;border-top:5px solid var(--c);background:#fff;break-inside:avoid}
.cartao h2{font-size:17px;margin:6px 0 4px}
.cartao .corpo{font-size:13.5px}
@media (max-width:760px){.cartoes{grid-template-columns:1fr}}
@media print{.cartoes{grid-template-columns:1fr 1fr}}`,
  compacto: `
.cabeca{border-bottom:2px solid #22231f;padding-bottom:12px;margin-bottom:18px}
table.lista{width:100%;border-collapse:collapse;font-size:12.5px}
table.lista th{text-align:left;font:600 11px "Inter",sans-serif;text-transform:uppercase;letter-spacing:.06em;color:#8a877d;border-bottom:2px solid #22231f;padding:6px 8px}
table.lista td{padding:8px;border-bottom:1px solid #ebe8df;vertical-align:top}
table.lista tr:nth-child(even) td{background:#faf9f6}
table.lista td.titulo{font-weight:600;min-width:180px;border-left:3px solid var(--c)}
table.lista td.titulo .codigo{display:block;font-weight:400}
table.lista .resumo p{margin:0 0 .3em}
.folha{max-width:1180px}`,
  documento: `
.folha{max-width:820px;padding:64px 72px}
body{font-family:"Iowan Old Style","Fraunces",Georgia,serif;font-size:16px;line-height:1.7}
h1{font-size:38px;text-align:center}
.sub{text-align:center;font-family:"Inter",sans-serif}
article.doc{margin-top:46px}
article.doc h2{font-size:25px;text-align:left}
article.doc h2::after{content:"";display:block;width:56px;height:3px;background:var(--c);margin-top:10px}
dl.grade,.chips,.notas,.apontado,.meta,h4{font-family:"Inter","Segoe UI",sans-serif}`,
};

/** O HTML inteiro do relatório. */
export function htmlRelatorio(layout: Layout, nome: string, docs: DocRel[], m: Mostrar, agora: string): string {
  const principais = docs.filter((d) => !d.ligado);
  const ligados = docs.filter((d) => d.ligado);
  const doc = (d: DocRel) => {
    const estilo = `style="--c:${corDoc(d)}"`;
    const cab = `<div class="linha-tipo">${tipoHtml(d, m)}</div>${tituloHtml(d, m)}${camposHtml(d, "topo")}`;
    if (layout === "fichas") return `<div class="cartao" ${estilo}>${cab}${camposHtml(d, "grade")}${corpoHtml(d)}${rodapeDoc(d)}</div>`;
    if (layout === "documento") return `<article class="doc" ${estilo}>${cab}${camposHtml(d, "grade")}${corpoHtml(d)}${rodapeDoc(d)}</article>`;
    return `<section class="doc" ${estilo}>${cab}${camposHtml(d, "grade")}${corpoHtml(d)}${rodapeDoc(d)}</section>`;
  };
  const grupo = (l: DocRel[]) => {
    if (layout === "fichas") return `<div class="cartoes">${l.map(doc).join("")}</div>`;
    if (layout === "compacto") {
      const nomesCampos = [...new Set(l.flatMap((d) => d.campos.filter((c) => c.texto).map((c) => c.nome)))];
      return `<table class="lista"><thead><tr><th>Documento</th>${m.tipo ? "<th>Tipo</th>" : ""}${nomesCampos.map((n) => `<th>${esc(n)}</th>`).join("")}<th>Resumo</th></tr></thead><tbody>${l.map((d) => `<tr style="--c:${corDoc(d)}"><td class="titulo">${esc(d.titulo || "Sem título")}${m.codigo ? `<span class="codigo">#${esc(d.codigo)}</span>` : ""}</td>${m.tipo ? `<td>${tipoHtml(d, m)}</td>` : ""}${nomesCampos.map((n) => { const c = d.campos.find((x) => x.nome === n); return `<td>${c?.texto ? chips(c) : ""}</td>`; }).join("")}<td class="resumo">${d.corpo?.trim() ? md(d.corpo.length > 600 && !d.redigido ? d.corpo.slice(0, 600) + "…" : d.corpo) : ""}</td></tr>`).join("")}</tbody></table>`;
    }
    return l.map(doc).join("");
  };

  let topo = "";
  if (layout === "executivo") {
    const { porTipo, porOpcao, primeira } = contagens(principais);
    const numeros = [
      `<div class="numero"><b>${principais.length}</b><span>documento${principais.length === 1 ? "" : "s"}</span></div>`,
      ...[...porTipo].map(([n, x]) => `<div class="numero"><b>${x.n}</b><span>${esc(x.icone)} ${esc(n)}</span></div>`),
      ...[...porOpcao].map(([n, x]) => { const p = corDe(x.cor); return `<div class="numero" style="${p ? `background:${p.bg};border-color:${p.borda}` : ""}"><b style="${p ? `color:${p.fg}` : ""}">${x.n}</b><span>${esc(primeira ?? "")}: ${esc(n)}</span></div>`; }),
    ].join("");
    const sumario = principais.length > 1
      ? `<h4>Sumário</h4><ol class="sumario">${principais.map((d) => `<li><a href="#${ancora(d)}">${esc(d.titulo || "Sem título")}</a> ${m.codigo ? `<span class="codigo">#${esc(d.codigo)}</span>` : ""}</li>`).join("")}</ol>`
      : "";
    topo = `<div class="capa"><div class="marca">Relatório · atelier</div><h1>${esc(nome)}</h1><div class="sub">Gerado em ${esc(agora)}</div><div class="numeros">${numeros}</div></div>${sumario}`;
  } else {
    topo = `<div class="cabeca"><h1>${esc(nome)}</h1><div class="sub">Gerado em ${esc(agora)} · ${principais.length} documento${principais.length === 1 ? "" : "s"}</div></div>`;
  }
  const corpo = `${topo}${grupo(principais)}${ligados.length ? `<div class="parte">Documentos ligados</div>${grupo(ligados)}` : ""}<div class="rodape">atelier · ${esc(agora)}</div>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(nome)}</title><style>${BASE_CSS}${CSS[layout]}</style></head><body><div class="folha">${corpo}</div></body></html>`;
}
