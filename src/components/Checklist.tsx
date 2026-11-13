import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowLeft, ArrowUp, Braces, Check, ChevronDown, ChevronRight, FilePlus, FileText, GripVertical, Link2, ListChecks,
  Paperclip, Pencil, Plus, RefreshCw, SkipForward, Trash2, Undo2, X,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, BASE, Esquema, Props, Resumo } from "../api";
import { abrir, avisar, falhou, lerBase64 } from "../ui";
import { useAoReaparecer, useVisivel } from "../visivel";
import { lembrarResumo, useResumos } from "../resumos";
import { abrirCodigo } from "./Mencoes";
import { ChipItem, EscolherItem } from "./Valor";
import { Popover, usePopover } from "./Popover";
import { trazerArquivos } from "./Arquivos";
import { Editor } from "./Editor";
import {
  alvoDe, apagarComentario, apagarPasso, blocos, chaveDeCampo, Checklist, corDaTag, criarComentario, criarPasso, dependeDe, dependentes, donoDaPasta, EstadoPasso,
  escreverChecklist, faltando, feito, juntar, lerChecklist, Link, moverParaSecao, moverPasso, moverSecao, Passo, preencher,
  progresso, relativo, renomearSecao, rotuloDe, tagsDe,
} from "../checklist";
import "../checklist.css";

const urlDo = (caminho: string) => `${BASE}/arquivo?caminho=${encodeURIComponent(caminho)}`;
const pastaDe = (c: string) => c.slice(0, Math.max(c.lastIndexOf("\\"), c.lastIndexOf("/")));
const nomeDe = (c: string) => c.split(/[\\/]/).filter(Boolean).pop() ?? c;
const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const dataCurta = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const est = (d: Checklist, id: string): EstadoPasso => ((d.estado ??= {})[id] ??= {});
const passoDe = (d: Checklist, id: string) => d.passos.find((p) => p.id === id);
/** "opcional" entra no filtro como se fosse uma tag */
const OPCIONAL = "opcional";

function copiar(texto: string) {
  navigator.clipboard.writeText(texto).then(() => avisar("Copiado")).catch(falhou);
}

/** Copia com formatação (HTML, que o Teams e o Outlook entendem) e, para quem só aceita texto, o markdown. */
function copiarRico(html: string, texto: string) {
  const blob = (t: string, tipo: string) => new Blob([t], { type: tipo });
  navigator.clipboard.write([new ClipboardItem({ "text/html": blob(html, "text/html"), "text/plain": blob(texto, "text/plain") })])
    .then(() => avisar("Copiado"))
    .catch(() => copiar(texto));
}

/** O HTML de um trecho renderizado, sem os botões de copiar e com borda nas tabelas (o tema não vai junto). */
function htmlParaColar(el: Element): string {
  const c = el.cloneNode(true) as Element;
  c.querySelectorAll(".ck-copiar").forEach((b) => b.remove());
  [...(c.tagName === "TABLE" ? [c] : []), ...c.querySelectorAll("table")].forEach((t) => t.setAttribute("style", "border-collapse:collapse"));
  c.querySelectorAll("td, th").forEach((x) => x.setAttribute("style", "border:1px solid #999;padding:4px 8px;text-align:left"));
  return c.tagName === "TABLE" ? c.outerHTML : c.innerHTML;
}

/** A tabela em markdown (para colar onde só entra texto). */
function tabelaEmMarkdown(t: HTMLTableElement): string {
  const linhas = [...t.rows].map((r) => `| ${[...r.cells].map((c) => (c.textContent ?? "").trim().replace(/\s+/g, " ").replace(/\|/g, "\\|")).join(" | ")} |`);
  if (linhas.length) linhas.splice(1, 0, `|${" --- |".repeat(t.rows[0].cells.length)}`);
  return linhas.join("\n");
}

/** Abre o alvo de um link. Documento e arquivo abrem na outra metade do painel, como referência ao lado do checklist. */
function seguir(link: Link, pasta: string, raiz: string) {
  const a = alvoDe(link, pasta);
  if (a.tipo === "doc") abrirCodigo(a.codigo, (r) => abrir(r, true, true));
  else if (a.tipo === "url") openUrl(a.url).catch(() => window.open(a.url, "_blank"));
  else {
    const caminho = raiz.includes("\\") ? a.caminho.replace(/\//g, "\\") : a.caminho;
    abrir({ v: "arquivos", raiz: caminho.toLowerCase().startsWith(raiz.toLowerCase()) ? raiz : pastaDe(caminho), arquivo: caminho }, true, true);
  }
}

/** Markdown → HTML sem script nem evento, com botão de copiar nos blocos de código. */
function limpar(html: string, pasta: string): string {
  const d = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  d.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (src && !/^(https?:|data:|blob:)/i.test(src)) {
      const abs = src.startsWith("file:///") ? decodeURI(src.slice(8)) : juntar(pasta, decodeURI(src));
      img.setAttribute("src", urlDo(abs));
    }
  });
  d.querySelectorAll("script, style, iframe, object, embed, link, meta, form").forEach((n) => n.remove());
  d.querySelectorAll("*").forEach((el) => {
    for (const at of [...el.attributes]) {
      if (at.name.startsWith("on") || (/^(href|src)$/.test(at.name) && /^\s*javascript:/i.test(at.value))) el.removeAttribute(at.name);
    }
  });
  // tabela ganha "copiar tabela" (com formatação, para o Teams; em markdown para quem só aceita texto)
  d.querySelectorAll("table").forEach((t) => {
    const caixa = d.createElement("div");
    caixa.className = "ck-tabela";
    const b = d.createElement("button");
    b.className = "ck-copiar";
    b.textContent = "copiar tabela";
    b.setAttribute("data-copiar-tabela", "");
    t.replaceWith(caixa);
    caixa.append(b, t);
  });
  d.querySelectorAll("pre").forEach((pre) => {
    const b = d.createElement("button");
    b.className = "ck-copiar";
    b.textContent = "copiar";
    b.setAttribute("data-copiar", "");
    pre.prepend(b);
  });
  return d.body.firstElementChild?.innerHTML ?? "";
}

type Marked = typeof import("marked");

function Markdown({ texto, md, pasta, raiz }: { texto: string; md: Marked | null; pasta: string; raiz: string }) {
  const html = useMemo(() => (md ? limpar(md.marked.parse(texto, { async: false }) as string, pasta) : null), [texto, md, pasta]);
  const corpo = useRef<HTMLDivElement>(null);
  if (html == null) return <div className="ck-md">{texto}</div>;
  return (
    <div className="ck-md-caixa">
    {/* copia o texto inteiro (o passo a passo do card), com formatação */}
    <button className="ck-copiar ck-copiar-tudo" title="Copiar o texto inteiro, com formatação (cola no Teams)"
      onClick={() => corpo.current && copiarRico(htmlParaColar(corpo.current), texto)}>copiar texto</button>
    <div
      ref={corpo}
      className="ck-md"
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.matches("[data-copiar-tabela]")) {
          e.preventDefault();
          const tab = t.parentElement?.querySelector("table");
          if (tab) copiarRico(htmlParaColar(tab), tabelaEmMarkdown(tab));
          return;
        }
        if (t.matches("[data-copiar]")) {
          e.preventDefault();
          copiar((t.parentElement?.textContent ?? "").replace(/^copiar/, "").replace(/\n$/, ""));
          return;
        }
        const a = t.closest("a");
        if (a) {
          e.preventDefault();
          const href = a.getAttribute("href") ?? "";
          if (href) seguir(href, pasta, raiz);
          return;
        }
        // código solto no texto: um clique copia
        // (menos quando você está selecionando texto: aí o clique é do arrasto da seleção)
        if (t.tagName === "CODE" && t.parentElement?.tagName !== "PRE" && !window.getSelection()?.toString()) copiar(t.textContent ?? "");
      }}
    />
    </div>
  );
}

/** O que os cartões precisam da tela. */
interface Ctx {
  doc: Checklist;
  esquema: Esquema | null;
  md: Marked | null;
  pasta: string;
  raiz: string;
  caminho: string;
  numDe: (id: string) => number;
  mudar: (rotulo: string | null, f: (d: Checklist) => void) => void;
  digitar: (f: (d: Checklist) => void) => void;
  fotoAoFocar: (rotulo: string) => void;
  marcar: (p: Passo, pular?: boolean) => void;
  desmarcar: (p: Passo) => void;
  desfazer: () => void;
}

/** Tela de um `*.checklist.json`: lê, mostra, edita e grava no próprio arquivo. */
export function ChecklistTela({ caminho, raiz, aoVoltar, aoVerTexto }: { caminho: string; raiz: string; aoVoltar: () => void; aoVerTexto: () => void }) {
  const [doc, setDoc] = useState<Checklist | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const [esquema, setEsquema] = useState<Esquema | null>(null);
  const [md, setMd] = useState<Marked | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string[]>([]);
  const [esconderFeitos, setEsconderFeitos] = useState(false);
  const [verValores, setVerValores] = useState(true);
  const [arrasto, setArrasto] = useState<{ id: string; alvo?: string; antes?: boolean } | null>(null);
  const [secaoNova, setSecaoNova] = useState<{ b: number; nome: string } | null>(null);
  const [comentarioNovo, setComentarioNovo] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<{ b: number; nome: string } | null>(null);
  const docRef = useRef<Checklist | null>(null);
  const modRef = useRef<string | null>(null);
  // gravações em fila (uma de cada vez, cada uma com o `modificado` da anterior); `pendentes` > 0 = não reler do disco
  const fila = useRef<Promise<void>>(Promise.resolve());
  const pendentes = useRef(0);
  const pilha = useRef<{ rotulo: string; doc: Checklist }[]>([]);
  const [, setPilhaN] = useState(0);
  const pasta = pastaDe(caminho);
  const visivel = useVisivel();

  useEffect(() => { import("marked").then(setMd).catch(falhou); }, []);
  useEffect(() => { api.esquema().then(setEsquema).catch(() => {}); }, []);

  const lerDoDisco = useCallback(async () => {
    const i = await api.infoArquivo(caminho);
    const texto = await fetch(urlDo(caminho), { cache: "no-store" }).then((r) => r.text());
    return { ...lerChecklist(texto), modificado: i.modificado };
  }, [caminho]);

  const carregar = useCallback(async () => {
    try {
      const l = await lerDoDisco();
      if (pendentes.current > 0) return; // uma gravação começou enquanto lia: ela vale mais
      modRef.current = l.modificado;
      docRef.current = l.doc;
      setDoc(l.doc);
      setAvisos(l.avisos);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [lerDoDisco]);
  useEffect(() => { carregar(); }, [carregar]);

  // o agente pode mexer no arquivo enquanto ele está aberto: confere e recarrega (só com a janela à vista)
  const verificar = useCallback(async () => {
    if (pendentes.current > 0) return;
    try {
      const i = await api.infoArquivo(caminho);
      if (i.modificado !== modRef.current && pendentes.current === 0) carregar();
    } catch { /* sumiu */ }
  }, [caminho, carregar]);
  useEffect(() => {
    if (!visivel) return;
    const t = window.setInterval(verificar, 2500);
    return () => window.clearInterval(t);
  }, [visivel, verificar]);
  useAoReaparecer(visivel, verificar);

  /** Grava. Se o arquivo mudou fora, relê, aplica a mesma mudança por cima e grava de novo. */
  const gravar = useCallback((novo: Checklist, refazer?: (d: Checklist) => void) => {
    pendentes.current++;
    fila.current = fila.current.then(() => gravarAgora(novo, refazer)).finally(() => { pendentes.current--; });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const gravarAgora = async (novo: Checklist, refazer?: (d: Checklist) => void) => {
    try {
      try {
        const r = await api.salvarArquivo(caminho, escreverChecklist(novo), modRef.current);
        modRef.current = r.modificado;
      } catch (e) {
        if (!refazer || !String(e).includes("mudou")) throw e;
        const fresco = await lerDoDisco();
        refazer(fresco.doc);
        const r = await api.salvarArquivo(caminho, escreverChecklist(fresco.doc), fresco.modificado);
        modRef.current = r.modificado;
        docRef.current = fresco.doc;
        setDoc(fresco.doc);
        setAvisos(fresco.avisos);
      }
      setSalvoEm(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (e) {
      falhou(e);
    }
  };

  const foto = (rotulo: string) => {
    if (!docRef.current) return;
    pilha.current.push({ rotulo, doc: clonar(docRef.current) });
    if (pilha.current.length > 100) pilha.current.shift();
    setPilhaN(pilha.current.length);
  };

  /** Muda o checklist e grava. `rotulo` vai para a pilha do desfazer. */
  const mudar = useCallback((rotulo: string | null, f: (d: Checklist) => void) => {
    const atual = docRef.current;
    if (!atual) return;
    if (rotulo) foto(rotulo);
    const novo = clonar(atual);
    f(novo);
    docRef.current = novo;
    setDoc(novo);
    gravar(novo, f);
  }, [gravar]);

  const desfazer = useCallback(() => {
    const h = pilha.current.pop();
    setPilhaN(pilha.current.length);
    if (!h) { avisar("Nada para desfazer"); return; }
    mudar(null, (d) => {
      for (const k of Object.keys(d)) delete (d as unknown as Record<string, unknown>)[k];
      Object.assign(d, clonar(h.doc));
    });
    avisar(`Desfeito: ${h.rotulo}`);
  }, [mudar]);

  // texto (título, corpo, observação, valor): grava depois de uma pausa. A foto do desfazer é a de quando o campo
  // ganhou o foco, mas só entra na pilha na primeira tecla (focar sem mudar nada não cria um "desfazer" vazio).
  const tTexto = useRef<number | undefined>(undefined);
  const fotoPendente = useRef<{ rotulo: string; doc: Checklist } | null>(null);
  const fotoAoFocar = (rotulo: string) => { if (docRef.current) fotoPendente.current = { rotulo, doc: clonar(docRef.current) }; };
  const digitar = useCallback((f: (d: Checklist) => void) => {
    const atual = docRef.current;
    if (!atual) return;
    if (fotoPendente.current) {
      pilha.current.push(fotoPendente.current);
      if (pilha.current.length > 100) pilha.current.shift();
      fotoPendente.current = null;
      setPilhaN(pilha.current.length);
    }
    const novo = clonar(atual);
    f(novo);
    docRef.current = novo;
    setDoc(novo);
    window.clearTimeout(tTexto.current);
    tTexto.current = window.setTimeout(() => gravar(novo, f), 700);
  }, [gravar]);

  const marcar = (p: Passo, pular = false) => {
    const d = docRef.current!;
    // sem caixa de confirmação (o navegador embutido não mostra): marca e avisa, com Desfazer no aviso
    const falta = pular ? [] : faltando(d, p);
    const agora = new Date().toISOString();
    mudar(`${pular ? "Ignorado" : "Feito"} · ${p.titulo}`, (x) => {
      const e = est(x, p.id);
      e.feito = agora;
      e.por = "Paulo";
      if (pular) e.pulado = true; else delete e.pulado;
    });
    // fecha este e abre o próximo que falta (o seguinte na ordem; no fim, volta ao começo), trazendo-o à vista
    const d2 = docRef.current!;
    const i = d2.passos.findIndex((x) => x.id === p.id);
    const prox = [...d2.passos.slice(i + 1), ...d2.passos.slice(0, i)].find((x) => !feito(d2, x.id));
    setAbertos((a) => ({ ...a, [p.id]: false, ...(prox ? { [prox.id]: true } : {}) }));
    if (prox) window.setTimeout(() => document.querySelector(`[data-passo="${prox.id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
    if (falta.length) {
      const nums = falta.map((id) => d.passos.findIndex((x) => x.id === id) + 1).join(", ");
      avisar(`Feito: ${p.titulo}. Atenção: ainda faltavam os passos ${nums}, de que ele depende.`, desfazer);
    } else {
      avisar(pular ? `Ignorado: ${p.titulo}` : `Feito: ${p.titulo}`);
    }
  };
  const desmarcar = (p: Passo) => {
    mudar(`Desfeito · ${p.titulo}`, (x) => {
      const e = est(x, p.id);
      delete e.feito; delete e.por; delete e.pulado;
    });
  };

  const tecla = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key.toLowerCase() === "z" && !(e.target as HTMLElement).closest("input, textarea")) {
      e.preventDefault();
      desfazer();
    }
  };

  if (erro) {
    return (
      <div className="ex-previa">
        <div className="ex-barra">
          <button className="btn" onClick={aoVoltar}><ArrowLeft size={14} /> Pasta</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={aoVerTexto}><Braces size={14} /> Ver o JSON</button>
        </div>
        <div className="vazio-grande">Não deu para abrir como checklist. {erro}</div>
      </div>
    );
  }
  if (!doc) return <div className="vazio-grande">Abrindo…</div>;

  const { feitos, total } = progresso(doc);
  const tags = tagsDe(doc);
  const nOpcionais = doc.passos.filter((p) => p.opcional).length;
  const numDe = (id: string) => doc.passos.findIndex((p) => p.id === id) + 1;
  const proximo = doc.passos.find((p) => !feito(doc, p.id) && faltando(doc, p).length === 0)?.id;
  const filtrando = filtro.length > 0 || esconderFeitos;
  const passa = (p: Passo) =>
    (!esconderFeitos || !feito(doc, p.id)) && filtro.every((t) => (t === OPCIONAL ? p.opcional : p.tags?.includes(t)));
  const campos = Object.entries(doc.campos ?? {});
  const comObs = doc.passos.filter((p) => doc.estado?.[p.id]?.obs);
  const ctx: Ctx = { doc, esquema, md, pasta, raiz, caminho, numDe, mudar, digitar, fotoAoFocar, marcar, desmarcar, desfazer };

  const alternarTag = (t: string) => setFiltro((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));
  const novoPasso = (grupo: string | undefined, indice: number) => {
    let id = "";
    mudar("Novo passo", (d) => { id = criarPasso(d, grupo, indice); });
    setAbertos((a) => ({ ...a, [id]: true }));
    setEditando(id);
  };

  const cartao = (p: Passo, podeArrastar: boolean) => (
    <CartaoPasso
      key={p.id}
      ctx={ctx}
      p={p}
      proximo={p.id === proximo}
      aberto={abertos[p.id] ?? (p.id === proximo)}
      alternar={() => setAbertos((a) => ({ ...a, [p.id]: !(a[p.id] ?? p.id === proximo) }))}
      editando={editando === p.id}
      setEditando={(v) => { setEditando(v ? p.id : null); if (v) setAbertos((a) => ({ ...a, [p.id]: true })); }}
      arrastar={podeArrastar ? {
        estado: arrasto,
        inicio: () => setArrasto({ id: p.id }),
        sobre: (antes) => setArrasto((a) => (a && a.id !== p.id ? { ...a, alvo: p.id, antes } : a)),
        soltar: () => {
          const a = arrasto;
          setArrasto(null);
          if (a?.alvo && a.alvo !== a.id) mudar(`Mover · ${passoDe(doc, a.id)?.titulo ?? ""}`, (d) => moverPasso(d, a.id, a.alvo!, !!a.antes));
        },
        fim: () => setArrasto(null),
      } : undefined}
    />
  );

  // comentários (blocos de markdown entre as seções), presos ao passo que vem logo depois; null = os do fim e os
  // que perderam o passo
  const bs = blocos(doc);
  const idsPassos = new Set(doc.passos.map((p) => p.id));
  const comentariosAntes = (id: string | null) =>
    (doc.comentarios ?? [])
      .filter((c) => (id === null ? !c.antes_de || !idsPassos.has(c.antes_de) : c.antes_de === id))
      .map((c) => (
        <BlocoComentario key={c.id} ctx={ctx} id={c.id} editandoAoNascer={comentarioNovo === c.id} aoTerminar={() => setComentarioNovo(null)} />
      ));
  /** Divisória depois da seção `b` (-1 = antes da primeira): acrescenta uma seção ou um comentário ali. */
  const divisoria = (b: number) => {
    const pos = b < 0 ? 0 : bs[b].fim + 1;
    const antes = doc.passos[pos]?.id ?? null;
    if (secaoNova?.b === b) {
      return (
        <div className="ck-nova-secao">
          <input className="campo" autoFocus placeholder="Nome da seção nova (Enter cria, com um passo; Esc cancela)" value={secaoNova.nome}
            onChange={(e) => setSecaoNova({ b, nome: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSecaoNova(null);
              if (e.key === "Enter" && secaoNova.nome.trim()) { const n = secaoNova.nome.trim(); setSecaoNova(null); novoPasso(n, pos); }
            }}
            onBlur={() => { if (!secaoNova.nome.trim()) setSecaoNova(null); }} />
        </div>
      );
    }
    return (
      <div className="ck-divisoria">
        <span className="ck-div-mais"><Plus size={12} /></span>
        <button onClick={() => setSecaoNova({ b, nome: "" })} title="Acrescentar uma seção aqui">Seção</button>
        <button onClick={() => { let id = ""; mudar("Comentário novo", (d) => { id = criarComentario(d, antes); }); setComentarioNovo(id); }}
          title="Acrescentar um comentário (texto em markdown) aqui">Comentário</button>
      </div>
    );
  };

  // sem filtro: o roteiro inteiro, por seção, com tudo editável; com filtro: só o que passa, sem mexer na ordem
  const filtrados = doc.passos.filter(passa);
  const gruposFiltrados: { nome: string; passos: Passo[] }[] = [];
  for (const p of filtrados) {
    const ult = gruposFiltrados[gruposFiltrados.length - 1];
    if (ult && ult.nome === (p.grupo ?? "")) ult.passos.push(p);
    else gruposFiltrados.push({ nome: p.grupo ?? "", passos: [p] });
  }

  return (
    <div className="ex-previa ck" tabIndex={-1} onKeyDown={tecla}>
      <div className="ex-barra">
        <button className="btn" onClick={aoVoltar}><ArrowLeft size={14} /> Pasta</button>
        <button className="btn" onClick={desfazer} disabled={!pilha.current.length}
          title={pilha.current.length ? `Desfazer: ${pilha.current[pilha.current.length - 1].rotulo} (Ctrl+Z)` : "Nada para desfazer"}>
          <Undo2 size={14} /> Desfazer
        </button>
        <span style={{ flex: 1 }} />
        <span className="ex-meta">{salvoEm ? `salvo no arquivo às ${salvoEm}` : "o progresso fica no próprio arquivo"}</span>
        <button className="btn-icone" title="Recarregar" onClick={() => carregar()}><RefreshCw size={14} /></button>
        <button className="btn-icone" title="Ver o JSON" onClick={aoVerTexto}><Braces size={14} /></button>
      </div>
      <div className="ex-conteudo">
        <div className="ck-folha">
          <div className="ck-cabeca">
            <ListChecks size={20} />
            <input className="ck-h1" value={doc.titulo ?? ""} placeholder={nomeDe(caminho).replace(/\.checklist\.json$/i, "")}
              onFocus={() => fotoAoFocar("Título do checklist")}
              onChange={(e) => { const v = e.target.value; digitar((d) => { d.titulo = v; }); }} />
          </div>
          <div className="ck-progresso">
            <div className="ck-barra"><div style={{ width: `${total ? (100 * feitos) / total : 0}%` }} /></div>
            <span>{feitos} de {total} passos</span>
          </div>

          {(tags.size > 0 || nOpcionais > 0) && (
            <div className="ck-filtros">
              <span className="ck-filtros-rot">Filtrar</span>
              {[...tags.entries()].map(([t, n]) => (
                <button key={t} className={`ck-tag cor-${corDaTag(t)}${filtro.includes(t) ? " ligada" : ""}`} onClick={() => alternarTag(t)}>
                  {t} <span className="ck-conta">{n}</span>
                </button>
              ))}
              {nOpcionais > 0 && (
                <button className={`ck-tag opcional${filtro.includes(OPCIONAL) ? " ligada" : ""}`} onClick={() => alternarTag(OPCIONAL)}>
                  opcional <span className="ck-conta">{nOpcionais}</span>
                </button>
              )}
              <span style={{ flex: 1 }} />
              <label className="ck-check"><input type="checkbox" checked={esconderFeitos} onChange={(e) => setEsconderFeitos(e.target.checked)} /> Esconder feitos</label>
              {filtro.length > 0 && <button className="btn" onClick={() => setFiltro([])}><X size={13} /> Limpar</button>}
            </div>
          )}

          {avisos.length > 0 && <div className="aviso-lixeira ck-avisos">{avisos.map((a, i) => <div key={i}>{a}</div>)}</div>}

          {!filtrando ? (
            <>
              {divisoria(-1)}
              {bs.map((b, i) => (
                <Fragment key={`${i}-${b.nome}`}>
                  {comentariosAntes(doc.passos[b.ini].id)}
                  <section className="ck-secao">
                    <div className="ck-grupo">
                      {renomeando?.b === i ? (
                        <input className="campo" autoFocus value={renomeando.nome}
                          onChange={(e) => setRenomeando({ b: i, nome: e.target.value })}
                          onBlur={() => { const n = renomeando.nome.trim(); setRenomeando(null); if (n !== b.nome) mudar("Renomear seção", (d) => renomearSecao(d, i, n)); }}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenomeando(null); }} />
                      ) : (
                        <button className="ck-grupo-nome" title="Renomear a seção" onClick={() => setRenomeando({ b: i, nome: b.nome })}>
                          {b.nome || "(sem seção)"}
                        </button>
                      )}
                      <button className="btn-icone ck-grupo-mais" title="Acrescentar um passo nesta seção" onClick={() => novoPasso(b.nome || undefined, b.fim + 1)}><Plus size={14} /></button>
                      <span className="ck-grupo-acoes">
                        <button className="btn-icone" title="Subir a seção" disabled={i === 0} onClick={() => mudar("Subir seção", (d) => moverSecao(d, i, -1))}><ArrowUp size={13} /></button>
                        <button className="btn-icone" title="Descer a seção" disabled={i === bs.length - 1} onClick={() => mudar("Descer seção", (d) => moverSecao(d, i, 1))}><ArrowDown size={13} /></button>
                      </span>
                    </div>
                    {doc.passos.slice(b.ini, b.fim + 1).map((p, j) => (
                      <Fragment key={p.id}>
                        {j > 0 && comentariosAntes(p.id)}
                        {cartao(p, true)}
                      </Fragment>
                    ))}
                  </section>
                  {divisoria(i)}
                </Fragment>
              ))}
              {comentariosAntes(null)}
            </>
          ) : (
            <>
              {filtrados.length === 0 && <div className="ck-vazio">Nenhum passo com esse filtro.</div>}
              {gruposFiltrados.map((g, i) => (
                <section key={i} className="ck-secao">
                  {g.nome && <div className="ck-grupo"><span className="ck-grupo-nome">{g.nome}</span></div>}
                  {g.passos.map((p) => cartao(p, false))}
                </section>
              ))}
            </>
          )}

          {campos.length > 0 && (
            <>
              <h2 className="ck-h-recolhe">
                <button onClick={() => setVerValores((v) => !v)}>
                  {verValores ? <ChevronDown size={15} /> : <ChevronRight size={15} />} Valores coletados
                  <span className="ck-conta">{campos.filter(([k]) => doc.valores?.[k]).length}/{campos.length}</span>
                </button>
              </h2>
              {verValores && (
                <div className="ck-painel ck-painel-valores">
                  <div className="ck-campos">
                    {campos.map(([k, rot]) => (
                      <label key={k} className="ck-campo">
                        <span className="ck-campo-rot">{rot}</span>
                        <input className="campo" value={doc.valores?.[k] ?? ""} placeholder="—"
                          onFocus={() => fotoAoFocar(`Valor · ${rot}`)}
                          onChange={(e) => { const v = e.target.value; digitar((d) => { if (v.trim()) (d.valores ??= {})[k] = v; else delete d.valores?.[k]; }); }} />
                      </label>
                    ))}
                  </div>
                  <button className="btn" onClick={() => copiar(campos.map(([k]) => `${k}: ${doc.valores?.[k] ?? ""}`).join("\n"))}>Copiar como YAML</button>
                </div>
              )}
            </>
          )}

          {comObs.length > 0 && (
            <>
              <h2>Observações</h2>
              {comObs.map((p) => (
                <div key={p.id} className="ck-obs-item">
                  <b>{numDe(p.id)}. {p.titulo}</b>
                  <div>{doc.estado?.[p.id]?.obs}</div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface Arrastar {
  estado: { id: string; alvo?: string; antes?: boolean } | null;
  inicio: () => void;
  sobre: (antes: boolean) => void;
  soltar: () => void;
  fim: () => void;
}

function CartaoPasso({ ctx, p, proximo, aberto, alternar, editando, setEditando, arrastar }: {
  ctx: Ctx; p: Passo; proximo: boolean; aberto: boolean; alternar: () => void;
  editando: boolean; setEditando: (v: boolean) => void; arrastar?: Arrastar;
}) {
  const { doc, esquema, pasta, raiz, numDe, mudar, marcar, desmarcar } = ctx;
  const e = doc.estado?.[p.id] ?? {};
  const ok = !!e.feito;
  const falta = ok ? [] : faltando(doc, p);
  const links = p.links ?? [];
  const docs = [...new Set([...(e.documento ? [e.documento] : []), ...links.map((l) => alvoDe(l, pasta)).flatMap((a) => (a.tipo === "doc" ? [a.codigo] : []))])];
  const resumos = useResumos(docs);
  const n = numDe(p.id);
  const tituloDe = (id: string) => passoDe(doc, id)?.titulo ?? id;
  const deps = p.depende_de ?? [];
  const libera = dependentes(doc, p.id);
  // o cartão só fica arrastável enquanto a alça está pressionada: o cartão inteiro arrastável não deixava selecionar texto
  const [pega, setPega] = useState(false);
  const comDrop = arrastar?.estado?.alvo === p.id ? (arrastar.estado.antes ? " drop-antes" : " drop-depois") : "";
  const mudarPasso = (rotulo: string, f: (x: Passo) => void) => mudar(`${rotulo} · ${p.titulo}`, (d) => { const x = passoDe(d, p.id); if (x) f(x); });
  const parar = (ev: React.SyntheticEvent) => ev.stopPropagation();
  const tirarDep = (d: string) => mudarPasso("Tirar dependência", (x) => { x.depende_de = (x.depende_de ?? []).filter((y) => y !== d); if (!x.depende_de.length) delete x.depende_de; });
  const porDep = (d: string) => mudarPasso("Dependência", (x) => { x.depende_de = [...new Set([...(x.depende_de ?? []), d])]; });
  const mostrarDeps = deps.length > 0 || libera.length > 0 || editando;

  // os comandos que encerram o passo: no cabeçalho com o passo fechado, no rodapé com ele aberto
  const encerrar = ok ? (
    <button className="btn" onClick={() => desmarcar(p)} title="Volta o passo para a fazer"><Undo2 size={13} /> Desfazer</button>
  ) : (
    <>
      <button className="btn" onClick={() => marcar(p, true)} title="Não se aplica: marca como ignorado"><SkipForward size={13} /> Ignorar</button>
      <button className="btn primario" onClick={() => marcar(p)}><Check size={13} /> Pronto</button>
    </>
  );
  const etiquetas = (comX: boolean) => (
    <>
      {(p.tags ?? []).map((t) => (
        <span key={t} className={`ck-tag cor-${corDaTag(t)}`}>
          {t}
          {comX && <button className="ck-tag-x" title="Tirar a tag" onClick={() => mudarPasso("Tirar tag", (x) => { x.tags = (x.tags ?? []).filter((y) => y !== t); if (!x.tags.length) delete x.tags; })}><X size={10} /></button>}
        </span>
      ))}
      {p.opcional && <span className="ck-tag opcional">opcional</span>}
      {falta.length > 0 && <span className="ck-tag aguarda" title={"Falta: " + falta.map((d) => `${numDe(d)}. ${tituloDe(d)}`).join(" · ")}>aguarda {falta.map(numDe).join(", ")}</span>}
    </>
  );

  return (
    <div
      data-passo={p.id}
      className={`ck-passo${proximo ? " proximo" : ""}${ok ? " feito" : ""}${aberto ? " aberto" : ""}${editando ? " editando" : ""}${arrastar?.estado?.id === p.id ? " arrastando" : ""}${comDrop}`}
      draggable={!!arrastar && !editando && pega}
      onDragStart={(ev) => { if (!arrastar) return; ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", p.id); arrastar.inicio(); }}
      onDragOver={(ev) => {
        if (!arrastar?.estado) return;
        ev.preventDefault();
        const r = ev.currentTarget.getBoundingClientRect();
        arrastar.sobre(ev.clientY < r.top + r.height / 2);
      }}
      onDrop={(ev) => { if (!arrastar) return; ev.preventDefault(); arrastar.soltar(); }}
      onDragEnd={() => { setPega(false); arrastar?.fim(); }}
    >
      {/* topo: cabeçalho e, com o passo aberto, a faixa de tags; o realce do mouse cobre os dois */}
      <div className="ck-topo" onClick={editando ? undefined : alternar}>
        <div className="ck-cab">
          {arrastar && <span className="ck-alca" title="Arraste para mudar de lugar"
            onMouseDown={() => { setPega(true); window.addEventListener("mouseup", () => setPega(false), { once: true }); }}><GripVertical size={14} /></span>}
          <span className="ck-num">{n}</span>
          {editando ? (
            <input className="campo ck-titulo-edit" autoFocus value={p.titulo} onClick={parar} onKeyDown={(ev) => ev.stopPropagation()}
              onFocus={() => ctx.fotoAoFocar(`Título · ${p.titulo}`)}
              onChange={(ev) => { const v = ev.target.value; ctx.digitar((d) => { const x = passoDe(d, p.id); if (x) x.titulo = v; }); }} />
          ) : (
            <span className="ck-titulo">{p.titulo}</span>
          )}
          {!aberto && (
            <span className="ck-cab-tags">
              {etiquetas(false)}
              {links.length > 0 && <span className="ck-tag cor-gray" title="Links"><Link2 size={11} /> {links.length}</span>}
              {e.documento && <span className="ck-tag doc" title="Documento criado a partir deste passo"><FileText size={11} /> #{e.documento}</span>}
            </span>
          )}
          {ok && (
            <span className={`ck-estado${e.pulado ? " pulado" : ""}`}>
              {e.pulado ? <SkipForward size={12} /> : <Check size={12} />} {e.pulado ? "ignorado" : "feito"} {dataCurta(e.feito!)}
              {e.por && e.por !== "Paulo" ? ` · ${e.por}` : ""}
            </span>
          )}
          <span className="ck-cab-acoes" onClick={parar}>
            {editando ? (
              <button className="btn primario" onClick={() => setEditando(false)} title="Termina a edição do passo"><Check size={13} /> Pronto</button>
            ) : (
              <button className="ck-lapis" onClick={() => setEditando(true)} title="Editar o passo: título, texto, seção, opcional e dados">
                <Pencil size={13} /><span>Editar</span>
              </button>
            )}
            {!aberto && encerrar}
          </span>
        </div>
        {editando && <LinhaSecao ctx={ctx} p={p} />}
        {aberto && (
          <div className="ck-faixa" onClick={parar}>
            {etiquetas(true)}
            <AcrescentarTag doc={doc} p={p} aoAcrescentar={(t) => mudarPasso("Tag", (x) => { x.tags = [...new Set([...(x.tags ?? []), t])]; })} />
            {!mostrarDeps && <AcrescentarDependencia doc={doc} p={p} numDe={numDe} aoEscolher={porDep} />}
          </div>
        )}
      </div>

      {aberto && (
        <>
          {mostrarDeps && (
            <div className="ck-parte ck-deps">
              <div className="ck-parte-rot">Depende de</div>
              {deps.length === 0 && <div className="ck-nada">nada</div>}
              {deps.length > 0 && (
                <ul className="ck-lista-deps">
                  {deps.map((d) => (
                    <li key={d} className={feito(doc, d) ? "ok" : ""}>
                      {feito(doc, d) ? "✅" : "⏳"} <span className="ck-num">{numDe(d)}</span> {tituloDe(d)}
                      <button className="ck-tag-x" title="Tirar a dependência" onClick={() => tirarDep(d)}><X size={11} /></button>
                    </li>
                  ))}
                </ul>
              )}
              <AcrescentarDependencia doc={doc} p={p} numDe={numDe} aoEscolher={porDep} />
              {libera.length > 0 && (
                <>
                  <div className="ck-parte-rot">Libera</div>
                  <ul className="ck-lista-deps libera">
                    {libera.map((x) => <li key={x.id}><span className="ck-num">{numDe(x.id)}</span> {x.titulo}</li>)}
                  </ul>
                </>
              )}
            </div>
          )}

          {e.documento && esquema && (
            <div className="ck-parte">
              <div className="ck-virou">
                <FileText size={14} />
                <span>Documento criado</span>
                <ChipDoc esquema={esquema} r={resumos.get(e.documento) ?? null} codigo={e.documento} />
              </div>
            </div>
          )}

          <div className="ck-parte">
            <div className={`ck-painel ck-painel-texto${editando ? " editando" : ""}`}>
              <PainelTexto ctx={ctx} p={p} editando={editando} />
              {((p.pede ?? []).length > 0 || editando) && <PainelDados ctx={ctx} p={p} editando={editando} />}
            </div>
          </div>

          <div className="ck-parte ck-links">
            <div className="ck-parte-rot">Links</div>
            <div className="ck-links-lista">
              {links.map((l, i) => {
                const a = alvoDe(l, pasta);
                const tirar = () => mudarPasso("Tirar link", (x) => { x.links = (x.links ?? []).filter((_, j) => j !== i); if (!x.links.length) delete x.links; });
                if (a.tipo === "doc" && esquema) return <ChipDoc key={i} esquema={esquema} r={resumos.get(a.codigo) ?? null} codigo={a.codigo} remover={tirar} />;
                return (
                  <span key={i} className="ck-link">
                    <button onClick={() => seguir(l, pasta, raiz)} title={a.tipo === "arquivo" ? `${a.caminho}\n(abre na outra metade)` : a.tipo === "url" ? a.url : ""}>
                      {a.tipo === "url" ? "🌐" : <FileText size={12} />} {rotuloDe(l)}
                    </button>
                    <button className="ck-tirar" title="Tirar o link" onClick={tirar}><X size={11} /></button>
                  </span>
                );
              })}
              <AcrescentarLink ctx={ctx} aoAcrescentar={(l) => mudarPasso("Link", (x) => { x.links = [...(x.links ?? []), l]; })} />
            </div>
          </div>

          <div className="ck-parte">
            <div className="ck-painel ck-painel-obs">
              <div className="ck-painel-cab"><span className="ck-painel-rot">Observação</span></div>
              <textarea className="campo" value={e.obs ?? ""} placeholder='ex.: "criamos com outro nome: …"'
                onFocus={() => ctx.fotoAoFocar(`Observação · ${p.titulo}`)}
                onChange={(ev) => { const v = ev.target.value; ctx.digitar((d) => { const x = est(d, p.id); if (v.trim()) x.obs = v; else delete x.obs; }); }} />
            </div>
          </div>

          <div className="ck-parte ck-rodape">
            {!e.documento && esquema && <CriarDocumento ctx={ctx} p={p} aoCriar={(c) => mudar(`Documento criado · ${p.titulo}`, (d) => { est(d, p.id).documento = c; })} />}
            <ConfirmarApagar mensagem={`Apagar o passo ${n}, "${p.titulo}"?`}
              detalhe={libera.length ? `${libera.length} passo(s) dependem dele; a dependência some. Dá para desfazer.` : "Dá para desfazer."}
              aoApagar={() => { mudar(`Apagar · ${p.titulo}`, (d) => apagarPasso(d, p.id)); avisar(`Passo ${n} apagado: ${p.titulo}`, ctx.desfazer); }}>
              {(abrirConfirma) => <button className="btn-icone ck-apagar" title="Apagar o passo" onClick={abrirConfirma}><Trash2 size={14} /></button>}
            </ConfirmarApagar>
            <span style={{ flex: 1 }} />
            {/* editando, o Pronto de cima termina a edição: o de marcar o passo some para não confundir */}
            {!editando && encerrar}
          </div>
        </>
      )}
    </div>
  );
}

/** Editando: a seção e o opcional, entre o título e as tags. */
function LinhaSecao({ ctx, p }: { ctx: Ctx; p: Passo }) {
  const { doc, mudar } = ctx;
  const bs = blocos(doc);
  const i = doc.passos.findIndex((x) => x.id === p.id);
  const minha = bs.findIndex((b) => i >= b.ini && i <= b.fim);
  return (
    <div className="ck-linha-secao" onClick={(ev) => ev.stopPropagation()}>
      <span className="ck-parte-rot">Seção</span>
      <select className="campo" value={minha} onChange={(ev) => mudar(`Seção · ${p.titulo}`, (d) => moverParaSecao(d, p.id, Number(ev.target.value)))}>
        {bs.map((b, j) => <option key={j} value={j}>{b.nome || "(sem seção)"}</option>)}
      </select>
      <label className="ck-check">
        <input type="checkbox" checked={!!p.opcional}
          onChange={(ev) => { const v = ev.target.checked; mudar(`Opcional · ${p.titulo}`, (d) => { const x = passoDe(d, p.id); if (x) { if (v) x.opcional = true; else delete x.opcional; } }); }} />
        Opcional
      </label>
    </div>
  );
}

/** Comentário: bloco de markdown entre as seções. Lápis no canto (vira Pronto) e lixeira com confirmação. */
function BlocoComentario({ ctx, id, editandoAoNascer, aoTerminar }: { ctx: Ctx; id: string; editandoAoNascer: boolean; aoTerminar: () => void }) {
  const { doc, md, pasta, raiz, mudar, digitar } = ctx;
  const [editando, setEditando] = useState(editandoAoNascer);
  const c = doc.comentarios?.find((x) => x.id === id);
  if (!c) return null;
  const pronto = () => {
    setEditando(false);
    aoTerminar();
    // comentário que ficou vazio some
    if (!c.texto.trim()) mudar(null, (d) => apagarComentario(d, id));
  };
  return (
    <div className={`ck-comentario${editando ? " editando" : ""}`}>
      <span className="ck-comentario-acoes">
        {editando ? (
          <button className="btn primario ck-btn-26" onClick={pronto} title="Termina a edição do comentário"><Check size={13} /> Pronto</button>
        ) : (
          <>
            <ConfirmarApagar mensagem="Apagar este comentário?" detalhe="Dá para desfazer."
              aoApagar={() => { mudar("Apagar comentário", (d) => apagarComentario(d, id)); avisar("Comentário apagado", ctx.desfazer); }}>
              {(abrirConfirma) => <button className="ck-lapis" onClick={abrirConfirma} title="Apagar o comentário"><Trash2 size={13} /><span>Apagar</span></button>}
            </ConfirmarApagar>
            <button className="ck-lapis" onClick={() => setEditando(true)} title="Editar o comentário"><Pencil size={13} /><span>Editar</span></button>
          </>
        )}
      </span>
      {editando ? (
        <EditorTexto ctx={ctx} rotulo="Comentário" valor={c.texto} placeholder="Comentário: contexto, avisos, links de referência."
          aoMudar={(v) => digitar((d) => { const x = d.comentarios?.find((y) => y.id === id); if (x) x.texto = v; })} />
      ) : (
        <Markdown texto={preencher(c.texto, doc.valores ?? {})} md={md} pasta={pasta} raiz={raiz} />
      )}
    </div>
  );
}

/** Editor visual de markdown (o mesmo do corpo dos documentos) com a barra de botões. Arquivo do computador e
 *  arquivo colado vão para `insumos/` do documento dono; os caminhos ficam relativos à pasta do checklist. */
function EditorTexto({ ctx, rotulo, valor, placeholder, aoMudar }: {
  ctx: Ctx; rotulo: string; valor: string; placeholder: string; aoMudar: (md: string) => void;
}) {
  const { pasta, caminho, fotoAoFocar } = ctx;
  // a foto do desfazer é a de quando a edição começou (entra na pilha na primeira mudança)
  useEffect(() => { fotoAoFocar(rotulo); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const dono = donoDaPasta(caminho);
  const itemDono = async () => {
    if (!dono) { avisar("Este checklist não está na pasta de um documento."); return null; }
    const it = (await api.itens({ q: dono.codigo })).find((x) => x.codigo === dono.codigo);
    if (!it) avisar(`Não achei o documento #${dono.codigo}.`);
    return it ?? null;
  };
  return (
    <div className="ck-editor">
      <Editor barra autoFoco valor={valor} aoMudar={aoMudar} placeholder={placeholder} pasta={pasta}
        aoMencao={(c) => abrirCodigo(c, (r) => abrir(r, true, true))}
        aoEscolherArquivo={async () => {
          const it = await itemDono();
          if (!it || !dono) return [];
          const { open } = await import("@tauri-apps/plugin-dialog");
          const r = await open({ multiple: true, title: "Escolher arquivo (vai para insumos/)" });
          const caminhos = Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
          const copiados = await trazerArquivos(await api.item(it.id), caminhos);
          return copiados.map((c) => relativo(pasta, juntar(dono.pasta, c)));
        }}
        aoColarArquivo={async (f) => {
          const it = await itemDono();
          if (!it) return null;
          const r = await api.colarArquivo(it.id, f.name || "colado.png", await lerBase64(f));
          return r.caminho;
        }} />
    </div>
  );
}

/** Confirmação de apagar num balãozinho ancorado no botão (o navegador embutido não mostra a caixa do sistema). */
function ConfirmarApagar({ mensagem, detalhe, aoApagar, children }: {
  mensagem: string; detalhe?: string; aoApagar: () => void;
  children: (abrirConfirma: (e: { currentTarget: HTMLElement }) => void) => React.ReactNode;
}) {
  const pop = usePopover();
  return (
    <>
      {children(pop.abrir)}
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={280}>
          <div className="ck-confirma">
            <div className="ck-confirma-msg">{mensagem}</div>
            {detalhe && <div className="ck-confirma-det">{detalhe}</div>}
            <div className="ck-confirma-acoes">
              <button className="btn" onClick={pop.fechar}>Cancelar</button>
              <button className="btn ck-perigo" autoFocus onClick={() => { pop.fechar(); aoApagar(); }}><Trash2 size={13} /> Apagar</button>
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

/** O texto do passo; editando (o card inteiro está em edição), a caixa do texto. */
function PainelTexto({ ctx, p, editando }: { ctx: Ctx; p: Passo; editando: boolean }) {
  const { doc, md, pasta, raiz, digitar } = ctx;
  if (!editando) {
    return p.corpo
      ? <Markdown texto={preencher(p.corpo, doc.valores ?? {})} md={md} pasta={pasta} raiz={raiz} />
      : <div className="ck-nada">Sem texto. Use o lápis no canto de cima para escrever o que fazer.</div>;
  }
  return (
    <EditorTexto ctx={ctx} rotulo={`Texto · ${p.titulo}`} valor={p.corpo ?? ""}
      placeholder="O que fazer neste passo. Blocos de código ganham botão copiar; {{campo}} vira o valor coletado."
      aoMudar={(v) => digitar((d) => { const x = passoDe(d, p.id); if (x) { if (v.trim()) x.corpo = v; else delete x.corpo; } })} />
  );
}

/** Os dados que o passo coleta. Editando: o rótulo muda ali, × tira o dado do passo (o valor fica guardado) e
 *  "+ dado" põe um que o checklist já tem ou cria um novo. */
function PainelDados({ ctx, p, editando }: { ctx: Ctx; p: Passo; editando: boolean }) {
  const { doc, mudar, digitar, fotoAoFocar } = ctx;
  const [novo, setNovo] = useState("");
  const pede = p.pede ?? [];
  const outros = Object.entries(doc.campos ?? {}).filter(([k]) => !pede.includes(k));
  const mudarPasso = (rotulo: string, f: (x: Passo) => void) => mudar(`${rotulo} · ${p.titulo}`, (d) => { const x = passoDe(d, p.id); if (x) f(x); });
  const criar = () => {
    const rotulo = novo.trim();
    if (!rotulo) return;
    setNovo("");
    mudar(`Dado novo · ${rotulo}`, (d) => {
      const k = chaveDeCampo(d, rotulo);
      (d.campos ??= {})[k] = rotulo;
      const x = passoDe(d, p.id);
      if (x) x.pede = [...(x.pede ?? []), k];
    });
  };
  return (
    <div className={`ck-dados${editando ? " editando" : ""}`}>
      <div className="ck-painel-rot">Dados deste passo</div>
      {pede.length === 0 && <div className="ck-nada">Nenhum dado ainda.</div>}
      <div className={`ck-campos${editando ? " com-x" : ""}`}>
        {pede.map((k) => (
          <div key={k} className="ck-campo">
            {editando ? (
              <input className="campo ck-campo-rot" value={doc.campos?.[k] ?? k} title="Rótulo do dado (vale para o checklist inteiro)"
                onFocus={() => fotoAoFocar(`Rótulo · ${doc.campos?.[k] ?? k}`)}
                onChange={(ev) => { const v = ev.target.value; digitar((d) => { (d.campos ??= {})[k] = v; }); }} />
            ) : (
              <span className="ck-campo-rot">{doc.campos?.[k] ?? k}</span>
            )}
            <input className="campo" value={doc.valores?.[k] ?? ""}
              onFocus={() => fotoAoFocar(`Valor · ${doc.campos?.[k] ?? k}`)}
              onChange={(ev) => { const v = ev.target.value; digitar((d) => { if (v.trim()) (d.valores ??= {})[k] = v; else delete d.valores?.[k]; }); }} />
            {editando && (
              <button className="btn-icone" title="Tirar este dado do passo (o valor fica guardado)"
                onClick={() => mudarPasso("Tirar dado", (x) => { x.pede = (x.pede ?? []).filter((y) => y !== k); if (!x.pede.length) delete x.pede; })}><X size={13} /></button>
            )}
          </div>
        ))}
      </div>
      {editando && (
        <div className="ck-dados-mais">
          {outros.length > 0 && (
            <select className="campo" value="" onChange={(ev) => { const k = ev.target.value; if (k) mudarPasso("Dado do passo", (x) => { x.pede = [...new Set([...(x.pede ?? []), k])]; }); }}>
              <option value="">+ dado que o checklist já tem…</option>
              {outros.map(([k, r]) => <option key={k} value={k}>{r}</option>)}
            </select>
          )}
          <input className="campo" placeholder="+ dado novo: rótulo e Enter" value={novo}
            onChange={(ev) => setNovo(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") criar(); }} />
        </div>
      )}
    </div>
  );
}

/** Chip de documento (título e status) que abre na outra metade, sem tirar o checklist da tela. */
function ChipDoc({ esquema, r, codigo, remover }: { esquema: Esquema; r: Resumo | null; codigo: string; remover?: () => void }) {
  return (
    <span
      className="ck-doc"
      title="Abrir na outra metade"
      onClickCapture={(ev) => {
        if ((ev.target as HTMLElement).closest(".rel-tirar, .rel-ws") || !r) return;
        ev.stopPropagation();
        abrir({ v: "item", id: r.id }, true, true);
      }}
    >
      <ChipItem esquema={esquema} r={r} codigo={codigo} comStatus remover={remover} />
    </span>
  );
}

/** "+ tag": uma que o checklist já usa, ou uma nova. */
function AcrescentarTag({ doc, p, aoAcrescentar }: { doc: Checklist; p: Passo; aoAcrescentar: (t: string) => void }) {
  const pop = usePopover();
  const [q, setQ] = useState("");
  const existentes = [...tagsDe(doc).keys()].filter((t) => !p.tags?.includes(t) && t.toLowerCase().includes(q.trim().toLowerCase()));
  const por = (t: string) => { aoAcrescentar(t); setQ(""); pop.fechar(); };
  return (
    <>
      <button className="ck-mais-mini" onClick={pop.abrir} title="Acrescentar tag"><Plus size={11} /> tag</button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={240}>
          <input className="campo" autoFocus placeholder="Tag (Enter cria)" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) por(existentes.find((t) => t.toLowerCase() === q.trim().toLowerCase()) ?? q.trim()); }} />
          {existentes.map((t) => (
            <button key={t} className="menu-item" onClick={() => por(t)}><span className={`ck-tag cor-${corDaTag(t)}`}>{t}</span></button>
          ))}
        </Popover>
      )}
    </>
  );
}

/** "+ dependência": escolhe um passo (sem os que criariam um ciclo). */
function AcrescentarDependencia({ doc, p, numDe, aoEscolher }: { doc: Checklist; p: Passo; numDe: (id: string) => number; aoEscolher: (id: string) => void }) {
  const pop = usePopover();
  const [q, setQ] = useState("");
  const b = q.trim().toLowerCase();
  const opcoes = doc.passos.filter((x) => x.id !== p.id && !p.depende_de?.includes(x.id) && !dependeDe(doc, x.id, p.id))
    .filter((x) => !b || x.titulo.toLowerCase().includes(b) || String(numDe(x.id)) === b);
  return (
    <>
      <button className="ck-mais-mini" onClick={pop.abrir}><Plus size={11} /> dependência</button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={380}>
          <div className="menu-rotulo">Este passo depende de…</div>
          <input className="campo" autoFocus placeholder="Buscar passo (título ou número)" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="ck-lista-pop">
            {opcoes.slice(0, 40).map((x) => (
              <button key={x.id} className="menu-item" onClick={() => { aoEscolher(x.id); setQ(""); pop.fechar(); }}>
                <span className="ck-num">{numDe(x.id)}</span> {x.titulo}
              </button>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

/** "+ link": um documento (busca), um arquivo do computador (copiado para a pasta do documento) ou um caminho / site. */
function AcrescentarLink({ ctx, aoAcrescentar }: { ctx: Ctx; aoAcrescentar: (l: Link) => void }) {
  const { esquema, pasta, caminho } = ctx;
  const pop = usePopover();
  const docPop = usePopover();
  const [alvo, setAlvo] = useState("");
  const [rotulo, setRotulo] = useState("");
  const confirmar = () => {
    const a = alvo.trim().replace(/^"|"$/g, "");
    if (!a) return;
    // caminho dentro da pasta do checklist fica relativo (continua valendo se a pasta mudar de lugar)
    const rel = /^[a-z]:[\\/]|^[\\/]/i.test(a) ? relativo(pasta, a) : a;
    aoAcrescentar(rotulo.trim() ? { rotulo: rotulo.trim(), alvo: rel } : rel);
    setAlvo(""); setRotulo(""); pop.fechar();
  };
  const doComputador = async () => {
    pop.fechar();
    try {
      const dono = donoDaPasta(caminho);
      if (!dono) { avisar("Este checklist não está na pasta de um documento."); return; }
      const it = (await api.itens({ q: dono.codigo })).find((x) => x.codigo === dono.codigo);
      if (!it) { avisar(`Não achei o documento #${dono.codigo}.`); return; }
      const { open } = await import("@tauri-apps/plugin-dialog");
      const r = await open({ multiple: true });
      const caminhos = Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
      const copiados = await trazerArquivos(await api.item(it.id), caminhos);
      for (const c of copiados) aoAcrescentar(relativo(pasta, juntar(dono.pasta, c)));
    } catch (e) {
      falhou(e);
    }
  };
  return (
    <>
      <button className="ck-mais-mini" onClick={pop.abrir} title="Acrescentar link"><Plus size={11} /> link</button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={380}>
          <div className="menu-rotulo">Link para este passo</div>
          <button className="menu-item" onClick={() => { if (pop.ancora) docPop.abrir({ currentTarget: pop.ancora }); pop.fechar(); }}>📄 Um documento do atelier…</button>
          <button className="menu-item" onClick={doComputador}><Paperclip size={14} /> Um arquivo do computador (vai para insumos/)…</button>
          <div className="menu-rotulo">ou um caminho / site</div>
          <input className="campo" autoFocus placeholder={`caminho (relativo a ${nomeDe(pasta)}) ou https://…`} value={alvo}
            onChange={(e) => setAlvo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }} />
          <input className="campo" placeholder="rótulo (opcional)" value={rotulo}
            onChange={(e) => setRotulo(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") confirmar(); }} />
          <button className="btn primario" onClick={confirmar} disabled={!alvo.trim()}>Acrescentar</button>
        </Popover>
      )}
      {docPop.ancora && esquema && (
        <EscolherItem ancora={docPop.ancora} aoFechar={docPop.fechar} esquema={esquema} selecionados={[]} titulo="Documento"
          aoEscolher={(it) => { lembrarResumo(it); aoAcrescentar(`#${it.codigo}`); docPop.fechar(); }} />
      )}
    </>
  );
}

/** "Criar documento": um documento a partir do passo (filho do documento dono da pasta, se o tipo tiver "Pai"). */
function CriarDocumento({ ctx, p, aoCriar }: { ctx: Ctx; p: Passo; aoCriar: (codigo: string) => void }) {
  const { esquema, doc, caminho, numDe } = ctx;
  const pop = usePopover();
  if (!esquema) return null;
  const tipos = [...esquema.tipos].sort((a, b) => (a.nome === "Passo" ? -1 : b.nome === "Passo" ? 1 : 0));
  const criar = async (tipoId: number) => {
    pop.fechar();
    try {
      const dono = donoDaPasta(caminho);
      const pai = esquema.propriedades.find((x) => x.nome === "Pai" && x.especie === "relacao");
      const props: Props = {};
      if (dono && pai) props[String(pai.id)] = [dono.codigo];
      const corpo = `${p.corpo ? preencher(p.corpo, doc.valores ?? {}) : ""}\n\n---\nVeio do passo ${numDe(p.id)} do checklist \`${nomeDe(caminho)}\`.`;
      const r = await api.criarItem({ titulo: p.titulo, tipo_id: tipoId, props, corpo });
      const it = await api.item(r.id);
      lembrarResumo(it);
      aoCriar(it.codigo);
      avisar(`Documento criado: #${it.codigo}`);
      abrir({ v: "item", id: r.id }, true, true);
    } catch (e) {
      falhou(e);
    }
  };
  return (
    <>
      <button className="btn-icone" onClick={pop.abrir} title="Criar documento a partir deste passo (filho do documento desta pasta, ligado ao passo)">
        <FilePlus size={14} />
      </button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={240}>
          <div className="menu-rotulo">Tipo do documento</div>
          {tipos.map((t) => (
            <button key={t.id} className="menu-item" onClick={() => criar(t.id)}>
              <span className="tipo-chip pequeno">{t.icone ?? "·"}</span> {t.nome}
            </button>
          ))}
        </Popover>
      )}
    </>
  );
}
