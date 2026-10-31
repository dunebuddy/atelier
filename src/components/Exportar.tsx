import { useEffect, useMemo, useState } from "react";
import { Download, FileDown, X } from "lucide-react";
import { marked } from "marked";
import { api, BASE, Esquema, Item, Link, Propriedade, propsDoTipo } from "../api";
import { avisar, falhou, guardar, ler } from "../ui";
import { dataBR, ferramentaDo } from "./Valor";

// Tudo pode virar relatório: um item ou os itens de uma visão, em Markdown, HTML, PDF, Excel ou CSV, com os campos
// escolhidos. O conteúdo é montado aqui; o backend só grava (e monta a planilha do Excel).

type Formato = "md" | "html" | "pdf" | "xlsx" | "csv";
type Arranjo = "relatorio" | "tabela" | "lista";
type Notas = "nenhuma" | "anotacoes" | "todas";

interface Opcoes {
  formato: Formato;
  arranjo: Arranjo;
  titulo: boolean;
  codigo: boolean;
  tipo: boolean;
  link: boolean;
  datas: boolean;
  props: number[] | null;
  corpo: boolean;
  notas: Notas;
  apontado: boolean;
  /** inclui também os itens ligados pelas propriedades de relação (um nível) */
  ligados: boolean;
}

const PADRAO: Opcoes = {
  formato: "md", arranjo: "relatorio", titulo: true, codigo: true, tipo: true, link: false, datas: false,
  props: null, corpo: true, notas: "anotacoes", apontado: false, ligados: false,
};

const FORMATOS: { id: Formato; nome: string; dica: string }[] = [
  { id: "md", nome: "Markdown", dica: ".md" },
  { id: "html", nome: "HTML", dica: ".html" },
  { id: "pdf", nome: "PDF", dica: "pela impressão" },
  { id: "xlsx", nome: "Excel", dica: ".xlsx" },
  { id: "csv", nome: "CSV", dica: ".csv (;)" },
];

/** Nota que o atelier escreveu sozinho (mudança de propriedade, criado, texto editado...). */
const AUTOMATICA = /^(Criado\.|Texto editado\.|Pasta desligada\.|Movido para a lixeira\.|Restaurado da lixeira\.|Texto restaurado|Ligado: |Desligado: |Arquivos em |Pasta: |Texto escrito por \/prompt)|^[^\n]{1,60}: .* → /;

const linkAtelier = (codigo: string) => `atelier://item/${codigo}`;
const dataHoraBR = (iso: string) => `${dataBR(iso)} ${iso.slice(11, 16)}`;

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function Exportar({ esquema, ids, nome, aoFechar }: {
  esquema: Esquema;
  /** itens na ordem em que aparecem (um só, para exportar o item) */
  ids: number[];
  nome: string;
  aoFechar: () => void;
}) {
  const umSo = ids.length === 1;
  const [o, setO] = useState<Opcoes>(() => ({ ...PADRAO, ...ler<Partial<Opcoes>>(umSo ? "exportarItem" : "exportarVisao", {}) }));
  const [itens, setItens] = useState<Item[] | null>(null);
  const [nomeArq, setNomeArq] = useState(nome);
  const [ocupado, setOcupado] = useState(false);
  const mudar = (d: Partial<Opcoes>) => setO((x) => ({ ...x, ...d }));

  useEffect(() => {
    // o item inteiro (corpo, notas, relacionados) de cada um, em lotes
    (async () => {
      const r: Item[] = [];
      for (let i = 0; i < ids.length; i += 8) r.push(...(await Promise.all(ids.slice(i, i + 8).map((id) => api.item(id)))));
      setItens(r);
    })().catch(falhou);
  }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // propriedades que aparecem nesses itens (pelos tipos deles)
  const disponiveis: Propriedade[] = useMemo(() => {
    const vistos = new Map<number, Propriedade>();
    for (const it of itens ?? []) for (const p of propsDoTipo(esquema, esquema.tipos.find((t) => t.id === it.tipo_id))) vistos.set(p.id, p);
    return [...vistos.values()];
  }, [itens, esquema]);
  const escolhidas = disponiveis.filter((p) => (o.props ?? disponiveis.map((x) => x.id)).includes(p.id));
  const tabular = o.formato === "xlsx" || o.formato === "csv";
  const arranjo: Arranjo = tabular ? "tabela" : o.arranjo;

  const exportar = async () => {
    if (!itens) return;
    setOcupado(true);
    guardar(umSo ? "exportarItem" : "exportarVisao", o);
    try {
      // itens ligados (um nível), sem repetir
      let todos = itens;
      if (o.ligados) {
        const ja = new Set(itens.map((i) => i.id));
        const extra = itens.flatMap((i) => i.relacionados ?? []).filter((r) => !ja.has(r.id) && !r.na_lixeira);
        const unicos = [...new Map(extra.map((r) => [r.id, r])).values()];
        todos = [...itens, ...(await Promise.all(unicos.map((r) => api.item(r.id))))];
      }
      const doc = montar(esquema, todos, itens.length, escolhidas, o, arranjo, nomeArq);
      if (o.formato === "pdf") {
        imprimir(doc.html);
        aoFechar();
        return;
      }
      const ext = o.formato;
      const corpo: Record<string, unknown> = { nome: nomeArq, ext };
      if (ext === "xlsx") corpo.planilha = { nome: nomeArq.slice(0, 31), cabecalho: doc.cabecalho, linhas: doc.linhas };
      else corpo.texto = ext === "md" ? doc.md : ext === "html" ? doc.html : doc.csv;
      // no app: o Paulo escolhe onde salvar; sem a janela de salvar (navegador de teste), vai para relatorios/
      let destino: string | null = null;
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        destino = await save({ defaultPath: `${nomeArq}.${ext}`, filters: [{ name: FORMATOS.find((f) => f.id === ext)!.nome, extensions: [ext] }] });
        if (destino === null) { setOcupado(false); return; }
      } catch {
        destino = null;
      }
      if (destino) corpo.destino = destino;
      const r = await fetch(`${BASE}/exportar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).then(async (x) => {
        const d = await x.json();
        if (!x.ok) throw new Error(d.erro ?? `erro ${x.status}`);
        return d as { caminho: string };
      });
      avisar(`Exportado: ${r.caminho}`, undefined);
      api.abrirArquivo(r.caminho).catch(() => {});
      aoFechar();
    } catch (e) {
      falhou(e);
    } finally {
      setOcupado(false);
    }
  };

  const caixa = (k: keyof Opcoes, rotulo: string, desligado = false) => (
    <label className={`chip${o[k] ? " ligado" : ""}`} style={{ opacity: desligado ? 0.5 : 1 }}>
      <input type="checkbox" checked={!!o[k]} disabled={desligado} onChange={(e) => mudar({ [k]: e.target.checked } as Partial<Opcoes>)} /> {rotulo}
    </label>
  );

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal exportar">
        <div className="modal-cabeca">
          <FileDown size={17} />
          <h3>Exportar {umSo ? "item" : `${ids.length} itens`}</h3>
          <span style={{ flex: 1 }} />
          <button className="btn-icone" onClick={aoFechar} title="Fechar"><X size={16} /></button>
        </div>

        <div className="menu-rotulo">Formato</div>
        <div className="filtro-chips">
          {FORMATOS.map((f) => (
            <button key={f.id} className={`chip${o.formato === f.id ? " ligado" : ""}`} onClick={() => mudar({ formato: f.id })} title={f.dica}>
              {f.nome} <span className="chip-dica">{f.dica}</span>
            </button>
          ))}
        </div>

        {!umSo && (
          <>
            <div className="menu-rotulo">Como</div>
            <div className="filtro-chips">
              {([
                ["relatorio", "Relatório: um bloco por item"],
                ["tabela", "Tabela: uma linha por item"],
                ["lista", "Lista: só títulos e códigos"],
              ] as const).map(([id, nome]) => (
                <button key={id} className={`chip${arranjo === id ? " ligado" : ""}`} disabled={tabular && id !== "tabela"} onClick={() => mudar({ arranjo: id })}>{nome}</button>
              ))}
            </div>
            {tabular && <div className="dica-inline">Excel e CSV saem sempre em tabela.</div>}
          </>
        )}

        <div className="menu-rotulo">O que vai de cada item</div>
        <div className="filtro-chips">
          {caixa("titulo", "Título")}
          {caixa("codigo", "Código")}
          {caixa("tipo", "Tipo")}
          {caixa("link", "Link do atelier")}
          {caixa("datas", "Criado e atualizado")}
          {caixa("corpo", "Texto", arranjo === "lista")}
          {caixa("apontado", "Apontado por", arranjo === "lista")}
          {caixa("ligados", "Incluir os itens ligados")}
        </div>

        {disponiveis.length > 0 && arranjo !== "lista" && (
          <>
            <div className="menu-rotulo">
              Propriedades
              <button className="link-acao" onClick={() => mudar({ props: o.props?.length === 0 ? null : [] })}>{o.props?.length === 0 ? "todas" : "nenhuma"}</button>
            </div>
            <div className="filtro-chips">
              {disponiveis.map((p) => {
                const marcada = escolhidas.some((x) => x.id === p.id);
                return (
                  <label key={p.id} className={`chip${marcada ? " ligado" : ""}`}>
                    <input type="checkbox" checked={marcada} onChange={() => {
                      const atual = escolhidas.map((x) => x.id);
                      mudar({ props: marcada ? atual.filter((id) => id !== p.id) : [...atual, p.id] });
                    }} /> {p.nome}
                  </label>
                );
              })}
            </div>
          </>
        )}

        {arranjo !== "lista" && (
          <>
            <div className="menu-rotulo">Linha do tempo</div>
            <div className="filtro-chips">
              {([["nenhuma", "Não incluir"], ["anotacoes", "Só as anotações"], ["todas", "Tudo (com as mudanças automáticas)"]] as const).map(([id, nome]) => (
                <button key={id} className={`chip${o.notas === id ? " ligado" : ""}`} onClick={() => mudar({ notas: id })}>{nome}</button>
              ))}
            </div>
          </>
        )}

        <div className="menu-rotulo">Nome do arquivo</div>
        <input className="campo" value={nomeArq} onChange={(e) => setNomeArq(e.target.value)} />

        <div className="modal-rodape">
          <span className="dica-inline">{o.formato === "pdf" ? "Abre a impressão com o relatório pronto: escolha “Salvar como PDF”." : "Você escolhe onde salvar; o arquivo abre em seguida."}</span>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primario" onClick={exportar} disabled={!itens || ocupado}>
            <Download size={14} /> {itens ? (ocupado ? "Exportando…" : "Exportar") : "Carregando…"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- montagem ----------

function valorTexto(it: Item, p: Propriedade): string {
  const v = it.props[p.id];
  if (v == null || v === "") return "";
  if (p.especie === "relacao") {
    const cods = Array.isArray(v) ? (v as string[]) : [String(v)];
    return cods.map((c) => { const r = it.relacionados?.find((x) => x.codigo === c); return r ? `#${c} ${r.titulo}` : `#${c}`; }).join(", ");
  }
  if (p.especie === "links") return (v as Link[]).map((l) => `${l.rotulo ?? ferramentaDo(l.url).nome}: ${l.url}`).join("\n");
  if (p.especie === "data") return dataBR(String(v));
  if (p.especie === "checkbox") return v ? "sim" : "não";
  if (Array.isArray(v)) return (v as string[]).join(", ");
  return String(v);
}

function notasDe(it: Item, modo: Notas) {
  if (modo === "nenhuma") return [];
  return (it.notas ?? []).filter((n) => modo === "todas" || !AUTOMATICA.test(n.texto));
}

function montar(esquema: Esquema, itens: Item[], principais: number, props: Propriedade[], o: Opcoes, arranjo: Arranjo, nome: string) {
  const tipoDe = (it: Item) => esquema.tipos.find((t) => t.id === it.tipo_id);
  const agora = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");

  // tabela (Excel, CSV e o arranjo "tabela")
  const cabecalho: string[] = [];
  if (o.titulo) cabecalho.push("Título");
  if (o.codigo) cabecalho.push("Código");
  if (o.tipo) cabecalho.push("Tipo");
  for (const p of props) cabecalho.push(p.nome);
  if (o.link) cabecalho.push("Link do atelier");
  if (o.datas) cabecalho.push("Criado em", "Atualizado em");
  if (o.corpo) cabecalho.push("Texto");
  if (o.apontado) cabecalho.push("Apontado por");
  if (o.notas !== "nenhuma") cabecalho.push("Linha do tempo");
  const linhas = itens.map((it) => {
    const l: string[] = [];
    if (o.titulo) l.push(it.titulo || "Sem título");
    if (o.codigo) l.push(it.codigo);
    if (o.tipo) l.push(tipoDe(it)?.nome ?? "sem tipo");
    for (const p of props) l.push(valorTexto(it, p));
    if (o.link) l.push(linkAtelier(it.codigo));
    if (o.datas) l.push(dataHoraBR(it.criado_em), dataHoraBR(it.atualizado_em));
    if (o.corpo) l.push(it.corpo ?? "");
    if (o.apontado) l.push((it.referencias ?? []).map((r) => `${r.rotulo}: #${r.item.codigo} ${r.item.titulo}`).join("\n"));
    if (o.notas !== "nenhuma") l.push(notasDe(it, o.notas).map((n) => `${dataHoraBR(n.criado_em)} ${n.autor}: ${n.texto}`).join("\n"));
    return l;
  });
  const csvCel = (s: string) => (/[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const csv = [cabecalho, ...linhas].map((l) => l.map(csvCel).join(";")).join("\r\n") + "\r\n";

  // markdown
  const md: string[] = [`# ${nome}`, "", `_Exportado do atelier em ${agora}._`, ""];
  const bloco = (it: Item) => {
    const t = tipoDe(it);
    const out: string[] = [];
    const cab = [o.titulo ? it.titulo || "Sem título" : "", o.codigo ? `#${it.codigo}` : ""].filter(Boolean).join(" · ");
    out.push(`## ${t && o.tipo ? `${t.icone} ` : ""}${cab || it.codigo}`, "");
    const meta: string[] = [];
    if (o.tipo) meta.push(`- **Tipo:** ${t?.nome ?? "sem tipo"}`);
    for (const p of props) { const v = valorTexto(it, p); if (v) meta.push(`- **${p.nome}:** ${v.replace(/\n/g, "; ")}`); }
    if (o.link) meta.push(`- **Link:** ${linkAtelier(it.codigo)}`);
    if (o.datas) meta.push(`- **Criado:** ${dataHoraBR(it.criado_em)} · **Atualizado:** ${dataHoraBR(it.atualizado_em)}`);
    if (o.apontado && it.referencias?.length) meta.push(...it.referencias.map((r) => `- **${r.rotulo}:** #${r.item.codigo} ${r.item.titulo}`));
    if (meta.length) out.push(...meta, "");
    if (o.corpo && it.corpo?.trim()) out.push(it.corpo.trim(), "");
    const ns = notasDe(it, o.notas);
    if (ns.length) out.push("### Linha do tempo", "", ...ns.map((n) => `- ${dataHoraBR(n.criado_em)} · **${n.autor}** — ${n.texto.replace(/\n/g, " ")}`), "");
    return out;
  };
  if (arranjo === "lista") {
    md.push(...itens.map((it) => `- ${o.codigo ? `#${it.codigo} ` : ""}${it.titulo || "Sem título"}${o.tipo ? ` (${tipoDe(it)?.nome ?? "sem tipo"})` : ""}`), "");
  } else if (arranjo === "tabela") {
    const cel = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
    md.push(`| ${cabecalho.join(" | ")} |`, `|${cabecalho.map(() => " --- ").join("|")}|`, ...linhas.map((l) => `| ${l.map(cel).join(" | ")} |`), "");
  } else {
    itens.forEach((it, i) => {
      if (i === principais && principais < itens.length) md.push("---", "", "# Itens ligados", "");
      md.push(...bloco(it));
    });
  }
  const mdTexto = md.join("\n");

  // html (também a base do PDF)
  const corpoHtml = arranjo === "tabela"
    ? `<h1>${esc(nome)}</h1><p class="sub">Exportado do atelier em ${agora}.</p><table><thead><tr>${cabecalho.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${linhas.map((l) => `<tr>${l.map((c) => `<td>${esc(c).replace(/\n/g, "<br>")}</td>`).join("")}</tr>`).join("")}</tbody></table>`
    : (marked.parse(mdTexto, { async: false }) as string);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(nome)}</title><style>
body{font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#222;max-width:900px;margin:32px auto;padding:0 20px}
h1{font-size:26px;margin-bottom:4px}h2{font-size:19px;margin-top:32px;padding-top:12px;border-top:1px solid #ddd}h3{font-size:15px;color:#555}
.sub,em{color:#777}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f4f2ea}code{background:#f4f2ea;padding:1px 4px;border-radius:4px}ul{padding-left:20px}
@media print{body{margin:0;max-width:none}h2{break-after:avoid}tr{break-inside:avoid}}
</style></head><body>${corpoHtml}</body></html>`;

  return { md: mdTexto, html, csv, cabecalho, linhas };
}

/** PDF: imprime o HTML num quadro escondido (a janela de impressão tem "Salvar como PDF"). */
function imprimir(html: string) {
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open();
  d.write(html);
  d.close();
  window.setTimeout(() => {
    f.contentWindow?.focus();
    f.contentWindow?.print();
    window.setTimeout(() => f.remove(), 60_000);
  }, 300);
}
