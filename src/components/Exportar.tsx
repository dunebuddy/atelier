import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Download, FileDown, Sparkles, Square, X } from "lucide-react";
import { marked } from "marked";
import { AgenteCli, api, BASE, Cor, Esquema, Item, Link, Propriedade, propsDoTipo } from "../api";
import { CampoRel, DocRel, htmlRelatorio, Layout, LAYOUTS } from "../relatorio";
import { avisar, falhou, guardar, ler } from "../ui";
import { dataBR, ferramentaDo, textoSimples, valorDe } from "./Valor";

// Tudo pode virar relatório: um item ou os itens de uma visão, em Markdown, HTML, PDF, Excel ou CSV, com os campos
// escolhidos. O conteúdo é montado aqui; o backend só grava (e monta a planilha do Excel).

type Formato = "md" | "html" | "pdf" | "xlsx" | "csv";
type Arranjo = "relatorio" | "tabela" | "lista";
type Notas = "nenhuma" | "anotacoes" | "todas";
/** O que fazer com o texto de cada documento: inteiro, ou pedir a um agente (resumo, tópicos...). */
type Texto = "inteiro" | "resumo" | "topicos" | "decisoes" | "livre";

const INSTRUCOES: Record<Exclude<Texto, "inteiro" | "livre">, string> = {
  resumo: "Resuma este documento num único parágrafo curto (3 a 5 frases), com o essencial: o que é, onde está e o que falta.",
  topicos: "Resuma este documento em 3 a 6 tópicos curtos (uma linha cada), do mais importante para o menos.",
  decisoes: "Liste só as decisões tomadas e os próximos passos deste documento, em tópicos curtos. Se não houver, diga \"Sem decisões registradas.\"",
};
const NOTAS_RESUMO = "Resuma esta linha do tempo num parágrafo curto: o que aconteceu, em ordem, e onde parou.";

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
  /** HTML e PDF: o molde */
  layout: Layout;
  /** o texto de cada documento: inteiro ou redigido por um agente */
  texto: Texto;
  textoLivre: string;
  /** a linha do tempo vira um parágrafo (pelo agente) */
  notasResumo: boolean;
  /** quem redige e com qual modelo (o barato para os campos; outro para o ajuste final) */
  agente: string;
  modelo: string;
  modeloFinal: string;
  /** HTML e PDF: o agente passa no relatório inteiro com esta instrução */
  ajuste: string;
}

const PADRAO: Opcoes = {
  formato: "md", arranjo: "relatorio", titulo: true, codigo: true, tipo: true, link: false, datas: false,
  props: null, corpo: true, notas: "anotacoes", apontado: false, ligados: false,
  layout: "executivo", texto: "inteiro", textoLivre: "", notasResumo: false, agente: "", modelo: "", modeloFinal: "", ajuste: "",
};

// o que o agente já escreveu (mesmo texto + mesma instrução + mesmo modelo = não paga de novo)
const CACHE_CHAVE = "relatorio.cache";
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + s.length.toString(36);
}
const cache: Record<string, string> = ler<Record<string, string>>(CACHE_CHAVE, {});
function guardarCache(k: string, v: string) {
  cache[k] = v;
  const ks = Object.keys(cache);
  for (const x of ks.slice(0, Math.max(0, ks.length - 300))) delete cache[x];
  guardar(CACHE_CHAVE, cache);
}
/** Tira cercas de código e conversa em volta (o modelo às vezes embrulha a resposta). */
function limpar(s: string, html: boolean) {
  let t = s.trim().replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  if (html) {
    const i = t.search(/<!doctype html|<html/i);
    const j = t.toLowerCase().lastIndexOf("</html>");
    if (i >= 0 && j > i) t = t.slice(i, j + 7);
  }
  return t;
}

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
  // agentes que redigem (ligados como Executor, Prompt ou Comando)
  const [agentes, setAgentes] = useState<AgenteCli[] | null>(null);
  useEffect(() => {
    api.agentes().then((r) => setAgentes(r.agentes.filter((a) => a.executor || a.prompt || a.comando))).catch(() => setAgentes([]));
  }, []);
  const agente = agentes?.find((a) => a.id === o.agente) ?? agentes?.[0];
  const modelos = agente?.modelos ?? [];
  const modelo = o.modelo || modelos[0] || "";
  const modeloFinal = o.modeloFinal || modelos[1] || modelos[0] || "";
  // o que o agente fez nesta janela: textos por documento e o relatório ajustado
  const [redigidos, setRedigidos] = useState<Record<number, { corpo?: string; notas?: string }>>({});
  const [ajustado, setAjustado] = useState<{ base: string; html: string } | null>(null);
  const [progresso, setProgresso] = useState<{ feitos: number; total: number; fase: string } | null>(null);
  const cancelar = useRef<AbortController | null>(null);

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
  const comLayout = o.formato === "html" || o.formato === "pdf";
  const arranjo: Arranjo = tabular ? "tabela" : o.arranjo;
  const instrucaoTexto = o.texto === "inteiro" ? "" : o.texto === "livre" ? o.textoLivre.trim() : INSTRUCOES[o.texto];
  const usaAgenteNoTexto = o.corpo && !!instrucaoTexto && arranjo !== "lista";
  const usaAgenteNasNotas = o.notasResumo && o.notas !== "nenhuma" && arranjo !== "lista";
  const chaveDe = (instr: string, texto: string, m: string) => hash(`${agente?.id}|${m}|${instr}|${texto}`);
  // quantos ainda faltam passar pelo agente (os do cache não contam)
  const pendentes = useMemo(() => {
    if (!itens || !agente) return { docs: 0, chars: 0 };
    let docs = 0, chars = 0;
    for (const it of itens) {
      const corpo = it.corpo?.trim() ?? "";
      if (usaAgenteNoTexto && corpo && !cache[chaveDe(instrucaoTexto, corpo, modelo)]) { docs++; chars += corpo.length; }
      const ns = notasDe(it, o.notas).map((n) => `${dataHoraBR(n.criado_em)} ${n.autor}: ${n.texto}`).join("\n");
      if (usaAgenteNasNotas && ns && !cache[chaveDe(NOTAS_RESUMO, ns, modelo)]) { docs++; chars += ns.length; }
    }
    return { docs, chars };
  }, [itens, agente?.id, modelo, instrucaoTexto, usaAgenteNoTexto, usaAgenteNasNotas, o.notas, redigidos]); // eslint-disable-line react-hooks/exhaustive-deps

  // o agente redige o texto (e a linha do tempo) de cada documento: 3 de cada vez, com cache
  const redigirTudo = async (sinal: AbortSignal) => {
    if (!itens || !agente) return redigidos;
    const tarefas: { id: number; campo: "corpo" | "notas"; instr: string; texto: string }[] = [];
    for (const it of itens) {
      const corpo = it.corpo?.trim() ?? "";
      if (usaAgenteNoTexto && corpo) tarefas.push({ id: it.id, campo: "corpo", instr: instrucaoTexto, texto: corpo });
      const ns = notasDe(it, o.notas).map((n) => `${dataHoraBR(n.criado_em)} ${n.autor}: ${n.texto}`).join("\n");
      if (usaAgenteNasNotas && ns) tarefas.push({ id: it.id, campo: "notas", instr: NOTAS_RESUMO, texto: ns });
    }
    const novo: Record<number, { corpo?: string; notas?: string }> = {};
    let feitos = 0;
    setProgresso({ feitos, total: tarefas.length, fase: "Redigindo" });
    const fila = [...tarefas];
    const trabalhar = async () => {
      for (let t = fila.shift(); t; t = fila.shift()) {
        if (sinal.aborted) return;
        const k = chaveDe(t.instr, t.texto, modelo);
        let saida = cache[k];
        if (!saida) {
          const r = await api.redigir({ agente: agente.id, modelo, instrucao: `${t.instr}\nDocumento: ${itens.find((x) => x.id === t!.id)?.titulo ?? ""}`, texto: t.texto }, sinal);
          saida = limpar(r.saida, false);
          guardarCache(k, saida);
        }
        novo[t.id] = { ...novo[t.id], [t.campo]: saida };
        feitos++;
        setProgresso({ feitos, total: tarefas.length, fase: "Redigindo" });
      }
    };
    await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
    setRedigidos(novo);
    return novo;
  };

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
      // o agente: textos que ainda faltam e o ajuste final (o que já foi feito nesta janela fica)
      let red = redigidos;
      let htmlFinal: string | null = null;
      if ((usaAgenteNoTexto || usaAgenteNasNotas) && pendentes.docs > 0) {
        if (!agente) throw new Error("Nenhum agente ligado para redigir (Configurações → Integrações).");
        cancelar.current = new AbortController();
        red = await redigirTudo(cancelar.current.signal);
      }
      const doc = montar(esquema, todos, itens.length, escolhidas, o, arranjo, nomeArq, red);
      if (comLayout && o.ajuste.trim()) {
        if (ajustado?.base === doc.html) htmlFinal = ajustado.html;
        else htmlFinal = await ajustar(doc.html);
      }
      if (htmlFinal) doc.html = htmlFinal;
      setProgresso(null);
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
      if (!cancelar.current?.signal.aborted) falhou(e);
    } finally {
      setOcupado(false);
      setProgresso(null);
    }
  };

  // o agente passa no relatório inteiro (com cache: o mesmo HTML e a mesma instrução não pagam de novo)
  const ajustar = async (base: string) => {
    if (!agente) throw new Error("Nenhum agente ligado para redigir (Configurações → Integrações).");
    const k = chaveDe(`ajuste|${o.ajuste.trim()}`, base, modeloFinal);
    let html = cache[k];
    if (!html) {
      cancelar.current = new AbortController();
      setProgresso({ feitos: 0, total: 1, fase: "Ajustando o relatório inteiro" });
      const r = await api.redigir({ agente: agente.id, modelo: modeloFinal, instrucao: o.ajuste.trim(), texto: base, html: true }, cancelar.current.signal);
      html = limpar(r.saida, true);
      if (!/<html|<body|<div/i.test(html)) throw new Error("O agente não devolveu um HTML: " + html.slice(0, 160));
      guardarCache(k, html);
    }
    setAjustado({ base, html });
    return html;
  };

  // prévia (HTML e PDF): o relatório como vai sair, atualizado enquanto se mexe nas opções
  const [previa, setPrevia] = useState("");
  useEffect(() => {
    if (!comLayout || !itens) return;
    const t = window.setTimeout(() => {
      const d = montar(esquema, itens, itens.length, escolhidas, o, arranjo, nomeArq, redigidos);
      setPrevia(ajustado?.base === d.html ? ajustado.html : d.html);
    }, 250);
    return () => window.clearTimeout(t);
  }, [comLayout, itens, JSON.stringify(o), nomeArq, redigidos, ajustado, escolhidas.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Rodar o agente" sem exportar: para ver na prévia antes
  const rodarAgente = async () => {
    if (!itens) return;
    setOcupado(true);
    try {
      cancelar.current = new AbortController();
      const red = (usaAgenteNoTexto || usaAgenteNasNotas) && pendentes.docs > 0 ? await redigirTudo(cancelar.current.signal) : redigidos;
      if (comLayout && o.ajuste.trim()) await ajustar(montar(esquema, itens, itens.length, escolhidas, o, arranjo, nomeArq, red).html);
    } catch (e) {
      if (!cancelar.current?.signal.aborted) falhou(e);
    } finally {
      setOcupado(false);
      setProgresso(null);
    }
  };
  const precisaAgente = (usaAgenteNoTexto || usaAgenteNasNotas || (comLayout && !!o.ajuste.trim()));
  const kTokens = Math.max(1, Math.round(pendentes.chars / 4 / 1000));

  const caixa = (k: keyof Opcoes, rotulo: string, desligado = false) => (
    <label className={`chip${o[k] ? " ligado" : ""}`} style={{ opacity: desligado ? 0.5 : 1 }}>
      <input type="checkbox" checked={!!o[k]} disabled={desligado} onChange={(e) => mudar({ [k]: e.target.checked } as Partial<Opcoes>)} /> {rotulo}
    </label>
  );

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className={`modal exportar${comLayout ? " com-previa" : ""}`}>
        <div className="exportar-opcoes">
        <div className="modal-cabeca">
          <FileDown size={17} />
          <h3>Exportar {umSo ? "documento" : `${ids.length} documentos`}</h3>
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

        {comLayout && (
          <>
            <div className="menu-rotulo">Layout</div>
            <div className="filtro-chips">
              {LAYOUTS.map((l) => (
                <button key={l.id} className={`chip${o.layout === l.id ? " ligado" : ""}`} title={l.dica} onClick={() => mudar({ layout: l.id })}>{l.nome}</button>
              ))}
            </div>
            <div className="dica-inline">{LAYOUTS.find((l) => l.id === o.layout)?.dica}</div>
          </>
        )}

        {!umSo && !comLayout && (
          <>
            <div className="menu-rotulo">Como</div>
            <div className="filtro-chips">
              {([
                ["relatorio", "Relatório: um bloco por documento"],
                ["tabela", "Tabela: uma linha por documento"],
                ["lista", "Lista: só títulos e códigos"],
              ] as const).map(([id, nome]) => (
                <button key={id} className={`chip${arranjo === id ? " ligado" : ""}`} disabled={tabular && id !== "tabela"} onClick={() => mudar({ arranjo: id })}>{nome}</button>
              ))}
            </div>
            {tabular && <div className="dica-inline">Excel e CSV saem sempre em tabela.</div>}
          </>
        )}

        <div className="menu-rotulo">O que vai de cada documento</div>
        <div className="filtro-chips">
          {caixa("titulo", "Título")}
          {caixa("codigo", "Código")}
          {caixa("tipo", "Tipo")}
          {caixa("link", "Link do atelier")}
          {caixa("datas", "Criado e atualizado")}
          {caixa("corpo", "Texto", arranjo === "lista")}
          {caixa("apontado", "Apontado por", arranjo === "lista")}
          {caixa("ligados", "Incluir os documentos ligados")}
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

        {o.corpo && arranjo !== "lista" && (
          <>
            <div className="menu-rotulo">Texto de cada documento</div>
            <div className="filtro-chips">
              {([["inteiro", "Inteiro"], ["resumo", "Resumo em 1 parágrafo"], ["topicos", "Em tópicos"], ["decisoes", "Só decisões e próximos passos"], ["livre", "Outra instrução…"]] as const).map(([id, nome]) => (
                <button key={id} className={`chip${o.texto === id ? " ligado" : ""}`} onClick={() => mudar({ texto: id })}>
                  {id !== "inteiro" && <Bot size={12} />} {nome}
                </button>
              ))}
            </div>
            {o.texto === "livre" && (
              <textarea className="campo" rows={2} value={o.textoLivre} placeholder="Ex.: em duas frases, o que está bloqueando e quem precisa agir"
                onChange={(e) => mudar({ textoLivre: e.target.value })} />
            )}
          </>
        )}
        {o.notas !== "nenhuma" && arranjo !== "lista" && (
          <div className="filtro-chips">
            <label className={`chip${o.notasResumo ? " ligado" : ""}`}>
              <input type="checkbox" checked={o.notasResumo} onChange={(e) => mudar({ notasResumo: e.target.checked })} /> <Bot size={12} /> Linha do tempo resumida num parágrafo
            </label>
          </div>
        )}

        {comLayout && (
          <>
            <div className="menu-rotulo">Ajuste final pelo agente (opcional)</div>
            <textarea className="campo" rows={2} value={o.ajuste}
              placeholder="Ex.: mais executivo; destaque os riscos e o que está atrasado; agrupe por frente"
              onChange={(e) => mudar({ ajuste: e.target.value })} />
          </>
        )}

        {precisaAgente && (
          <>
            <div className="menu-rotulo">Agente</div>
            {agentes && agentes.length === 0 ? (
              <div className="dica-inline">Nenhum agente ligado para redigir. Em Configurações → Integrações, ligue um agente como Executor, Prompt ou Comando.</div>
            ) : (
              <div className="exportar-agente">
                <select className="campo" value={agente?.id ?? ""} onChange={(e) => mudar({ agente: e.target.value, modelo: "", modeloFinal: "" })}>
                  {(agentes ?? []).map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
                {agente?.escolhe_modelo && (
                  <>
                    <label title="Para os resumos de cada documento: um modelo barato e rápido basta">
                      campos
                      <input className="campo" list="modelos-relatorio" value={modelo} onChange={(e) => mudar({ modelo: e.target.value })} />
                    </label>
                    {comLayout && o.ajuste.trim() && (
                      <label title="Para o ajuste do relatório inteiro">
                        ajuste final
                        <input className="campo" list="modelos-relatorio" value={modeloFinal} onChange={(e) => mudar({ modeloFinal: e.target.value })} />
                      </label>
                    )}
                    <datalist id="modelos-relatorio">{modelos.map((m) => <option key={m} value={m} />)}</datalist>
                  </>
                )}
              </div>
            )}
            <div className="dica-inline">
              {pendentes.docs > 0
                ? `${pendentes.docs} texto${pendentes.docs === 1 ? "" : "s"} vão passar pelo agente (~${kTokens} mil tokens de entrada no ${modelo || "modelo padrão"}; uns ${Math.max(5, Math.round(pendentes.docs / 3) * 8)} s).`
                : usaAgenteNoTexto || usaAgenteNasNotas ? "Os textos já foram redigidos (ficam guardados: não paga de novo)." : ""}
              {comLayout && o.ajuste.trim() ? " O ajuste final passa o relatório inteiro uma vez." : ""}
            </div>
          </>
        )}

        <div className="menu-rotulo">Nome do arquivo</div>
        <input className="campo" value={nomeArq} onChange={(e) => setNomeArq(e.target.value)} />

        <div className="modal-rodape">
          {progresso ? (
            <span className="dica-inline exportar-progresso">
              <span className="pontinho" /> {progresso.fase}… {progresso.total > 1 ? `${progresso.feitos} de ${progresso.total}` : ""}
              <button className="btn" onClick={() => cancelar.current?.abort()}><Square size={11} /> Parar</button>
            </span>
          ) : (
            <span className="dica-inline">{o.formato === "pdf" ? "Abre a impressão com o relatório pronto: escolha “Salvar como PDF”." : "Você escolhe onde salvar; o arquivo abre em seguida."}</span>
          )}
          <span style={{ flex: 1 }} />
          {precisaAgente && comLayout && (
            <button className="btn" onClick={rodarAgente} disabled={!itens || ocupado || !agente} title="Roda o agente e mostra na prévia, sem salvar ainda">
              <Sparkles size={14} /> Ver com o agente
            </button>
          )}
          <button className="btn" onClick={aoFechar}>Cancelar</button>
          <button className="btn primario" onClick={exportar} disabled={!itens || ocupado}>
            <Download size={14} /> {itens ? (ocupado ? "Trabalhando…" : "Exportar") : "Carregando…"}
          </button>
        </div>
        </div>
        {comLayout && (
          <div className="exportar-previa">
            <div className="menu-rotulo">Prévia{ajustado && previa === ajustado.html ? " · ajustada pelo agente" : ""}</div>
            {previa ? <iframe title="Prévia do relatório" sandbox="" srcDoc={previa} /> : <div className="vazio-grande">Montando…</div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- montagem ----------

function valorTexto(it: Item, p: Propriedade): string {
  const v = valorDe(it, p);
  if (v == null || v === "") return "";
  if (p.especie === "relacao") {
    const cods = Array.isArray(v) ? (v as string[]) : [String(v)];
    return cods.map((c) => { const r = it.relacionados?.find((x) => x.codigo === c); return r ? `#${c} ${r.titulo}` : `#${c}`; }).join(", ");
  }
  if (p.especie === "links") return (v as Link[]).map((l) => `${l.rotulo ?? ferramentaDo(l.url).nome}: ${l.url}`).join("\n");
  if (p.especie === "checkbox") return v ? "sim" : "não";
  if (Array.isArray(v)) return (v as (string | number)[]).map((x) => textoSimples(x, p)).join(", ");
  return textoSimples(v, p);
}

function notasDe(it: Item, modo: Notas) {
  if (modo === "nenhuma") return [];
  return (it.notas ?? []).filter((n) => modo === "todas" || !AUTOMATICA.test(n.texto));
}

/** Valor como vai no HTML com layout: opções (status, seleção) viram chips com a cor delas. */
function campoRel(it: Item, p: Propriedade): CampoRel {
  const texto = valorTexto(it, p);
  if (!texto || !p.opcoes?.length || !["selecao", "multisselecao", "status"].includes(p.especie)) return { nome: p.nome, texto };
  const v = valorDe(it, p);
  const nomes = (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
  return { nome: p.nome, texto, chips: nomes.map((n) => ({ nome: n, cor: p.opcoes.find((x) => x.nome === n)?.cor as Cor | undefined })) };
}

function montar(esquema: Esquema, itensOrig: Item[], principais: number, props: Propriedade[], o: Opcoes, arranjo: Arranjo, nome: string, red: Record<number, { corpo?: string; notas?: string }> = {}) {
  const tipoDe = (it: Item) => esquema.tipos.find((t) => t.id === it.tipo_id);
  // o que o agente redigiu entra no lugar do texto
  const itens = itensOrig.map((it) => (red[it.id]?.corpo ? { ...it, corpo: red[it.id].corpo } : it));
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
    if (red[it.id]?.notas) out.push("### Linha do tempo", "", red[it.id].notas!, "");
    else if (ns.length) out.push("### Linha do tempo", "", ...ns.map((n) => `- ${dataHoraBR(n.criado_em)} · **${n.autor}** — ${n.texto.replace(/\n/g, " ")}`), "");
    return out;
  };
  if (arranjo === "lista") {
    md.push(...itens.map((it) => `- ${o.codigo ? `#${it.codigo} ` : ""}${it.titulo || "Sem título"}${o.tipo ? ` (${tipoDe(it)?.nome ?? "sem tipo"})` : ""}`), "");
  } else if (arranjo === "tabela") {
    const cel = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
    md.push(`| ${cabecalho.join(" | ")} |`, `|${cabecalho.map(() => " --- ").join("|")}|`, ...linhas.map((l) => `| ${l.map(cel).join(" | ")} |`), "");
  } else {
    itens.forEach((it, i) => {
      if (i === principais && principais < itens.length) md.push("---", "", "# Documentos ligados", "");
      md.push(...bloco(it));
    });
  }
  const mdTexto = md.join("\n");

  // html com layout (também a base do PDF)
  if (o.formato === "html" || o.formato === "pdf") {
    const docs: DocRel[] = itens.map((it, i) => {
      const t = tipoDe(it);
      return {
        codigo: it.codigo,
        titulo: it.titulo,
        tipo: t ? { nome: t.nome, icone: t.icone, cor: t.cor } : undefined,
        ligado: i >= principais,
        campos: props.map((p) => campoRel(it, p)),
        corpo: o.corpo ? it.corpo ?? "" : undefined,
        redigido: !!red[it.id]?.corpo,
        notas: notasDe(it, o.notas).map((n) => ({ quando: dataHoraBR(n.criado_em), autor: n.autor, texto: n.texto })),
        notasResumo: red[it.id]?.notas,
        apontado: o.apontado ? (it.referencias ?? []).map((r) => `${r.rotulo}: #${r.item.codigo} ${r.item.titulo}`) : [],
        link: o.link ? linkAtelier(it.codigo) : undefined,
        datas: o.datas ? `criado ${dataHoraBR(it.criado_em)} · atualizado ${dataHoraBR(it.atualizado_em)}` : undefined,
      };
    });
    const html = htmlRelatorio(o.layout ?? "executivo", nome, docs, { codigo: o.codigo, tipo: o.tipo, titulo: o.titulo }, agora);
    return { md: mdTexto, html, csv, cabecalho, linhas };
  }
  // html simples (sem layout: não é mais usado pela tela, fica para quem chamar)
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
