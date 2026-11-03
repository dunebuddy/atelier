// Blocos do editor que o markdown sabe guardar: tabela, imagem, código com cores e diagrama Mermaid.
// Tudo volta para o markdown igual entrou (é o que o `tiptap-markdown` grava), para não perder nada ao editar.
import { useEffect, useRef, useState } from "react";
import { Extension } from "@tiptap/core";
import { NodeViewContent, NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { defaultMarkdownSerializer } from "prosemirror-markdown";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Image, { ImageOptions } from "@tiptap/extension-image";
import CodeBlockLowlight, { CodeBlockLowlightOptions } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { api, BASE, Esquema, Item, Propriedade } from "../api";
import { abrir } from "../ui";

// célula com um parágrafo só: assim a tabela sempre volta como tabela de markdown (com lista ou várias linhas dentro,
// o `tiptap-markdown` gravaria HTML, que o editor não lê de volta)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Estado = any;

/** Grava a tabela como tabela de markdown, escapando a barra `|` de dentro das células (senão vira outra coluna). */
function gravarTabela(state: Estado, node: PMNode) {
  state.inTable = true;
  node.forEach((linha, _p, i) => {
    state.write("| ");
    linha.forEach((celula, _q, j) => {
      if (j) state.write(" | ");
      const ini = state.out.length;
      if (celula.firstChild?.textContent.trim()) state.renderInline(celula.firstChild);
      state.out = state.out.slice(0, ini) + state.out.slice(ini).replace(/(^|[^\\])\|/g, "$1\\|");
    });
    state.write(" |");
    state.ensureNewLine();
    if (!i) {
      state.write(`| ${Array.from({ length: linha.childCount }, () => "---").join(" | ")} |`);
      state.ensureNewLine();
    }
  });
  state.closeBlock(node);
  state.inTable = false;
}

export const blocosDeTabela = [
  Table.extend({ addStorage: () => ({ markdown: { serialize: gravarTabela, parse: {} } }) }).configure({ resizable: false }),
  TableRow,
  TableHeader.extend({ content: "paragraph" }),
  TableCell.extend({ content: "paragraph" }),
];

/** Caminho da imagem como o navegador consegue mostrar: link da web fica; arquivo local passa pela API. */
export function srcDaImagem(src: string, pasta?: string): string {
  if (!src || /^(https?:|data:|blob:)/i.test(src)) return src;
  let caminho = decodeURI(src.replace(/^file:\/\/\/?/i, ""));
  const absoluto = /^([a-z]:[\\/]|[\\/])/i.test(caminho);
  if (!absoluto) {
    if (!pasta) return src;
    caminho = `${pasta.replace(/[\\/]+$/, "")}/${caminho.replace(/^\.\//, "")}`;
  }
  return `${BASE}/arquivo?caminho=${encodeURIComponent(caminho)}`;
}

/** Imagem do markdown (`![](caminho)`): a tela mostra o arquivo, o markdown guarda o caminho como estava. */
export const Imagem = Image.extend<ImageOptions & { pasta: () => string | undefined }>({
  addOptions() {
    return { ...(this.parent?.() as ImageOptions), pasta: () => undefined };
  },
  // imagem é bloco: grava `![](...)` e fecha o bloco (sem isso o que vem depois gruda na mesma linha)
  addStorage() {
    return {
      markdown: {
        serialize(state: Estado, node: PMNode, parent: PMNode, index: number) {
          defaultMarkdownSerializer.nodes.image(state, node, parent, index);
          state.closeBlock(node);
        },
        parse: {},
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", { ...HTMLAttributes, src: srcDaImagem(String(HTMLAttributes.src ?? ""), this.options.pasta()), "data-src": HTMLAttributes.src, loading: "lazy" }];
  },
}).configure({ inline: false, allowBase64: true });

/** Lista de tarefas compacta como as outras listas (sem isso, cada gravação punha linha em branco entre os itens). */
export const TarefasCompactas = Extension.create({
  name: "tarefasCompactas",
  addGlobalAttributes() {
    return [{
      types: ["taskList"],
      attributes: {
        tight: {
          default: true,
          parseHTML: (el: HTMLElement) => el.getAttribute("data-tight") === "true" || !el.querySelector("p"),
          renderHTML: (a: { tight?: boolean }) => (a.tight ? { "data-tight": "true" } : {}),
        },
      },
    }];
  },
});

const lowlight = createLowlight(common);

/** Bloco de código com cores; o de linguagem `mermaid` mostra o diagrama desenhado e o código fica a um clique. */
export const BlocoCodigo = CodeBlockLowlight.extend<CodeBlockLowlightOptions & { codigo: () => string | undefined }>({
  addOptions() {
    return { ...(this.parent?.() as CodeBlockLowlightOptions), codigo: () => undefined };
  },
  addNodeView() {
    return ReactNodeViewRenderer(VistaCodigo);
  },
}).configure({ lowlight, defaultLanguage: null });

function VistaCodigo({ node, extension }: NodeViewProps) {
  const lang = String(node.attrs.language ?? "");
  const mermaid = lang === "mermaid";
  // ```atelier-lista: a lista ao vivo dos documentos ligados a este (o mesmo motor da lista dinâmica)
  const lista = lang === "atelier-lista";
  const especial = mermaid || lista;
  const [verCodigo, setVerCodigo] = useState(false);
  const codigo = (extension.options as { codigo?: () => string | undefined }).codigo?.();
  return (
    <NodeViewWrapper className={`bloco-codigo${mermaid ? " mermaid" : ""}${lista ? " atelier-lista" : ""}`}>
      {mermaid && <Diagrama codigo={node.textContent} aoClicar={() => setVerCodigo((v) => !v)} aberto={verCodigo} />}
      {lista && <ListaNoTexto texto={node.textContent} codigo={codigo} aoClicar={() => setVerCodigo((v) => !v)} aberto={verCodigo} />}
      <pre style={especial && !verCodigo ? { display: "none" } : undefined}>
        {lang && !especial && <span className="bloco-lang" contentEditable={false}>{lang}</span>}
        <NodeViewContent as="code" className={lang ? `language-${lang}` : undefined} />
      </pre>
    </NodeViewWrapper>
  );
}

let proximoDiagrama = 0;

/** Desenha o Mermaid (a biblioteca só carrega quando aparece o primeiro diagrama). */
function Diagrama({ codigo, aoClicar, aberto }: { codigo: string; aoClicar: () => void; aberto: boolean }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const id = useRef(`mermaid-${++proximoDiagrama}`);
  useEffect(() => {
    let vivo = true;
    const t = window.setTimeout(async () => {
      try {
        const { default: m } = await import("mermaid");
        const escuro = getComputedStyle(document.documentElement).colorScheme.includes("dark");
        m.initialize({ startOnLoad: false, theme: escuro ? "dark" : "default", securityLevel: "strict", fontFamily: "inherit" });
        const r = await m.render(id.current, codigo);
        if (vivo) { setSvg(r.svg); setErro(null); }
      } catch (e) {
        document.getElementById("d" + id.current)?.remove();
        if (vivo) setErro(e instanceof Error ? e.message.split("\n")[0] : String(e));
      }
    }, 300);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [codigo]);
  return (
    <div className="diagrama" contentEditable={false}>
      {erro ? <div className="diagrama-erro">Diagrama com erro: {erro}</div> : svg ? <div className="diagrama-svg" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="diagrama-erro">Desenhando…</div>}
      <button className="btn diagrama-botao" onClick={aoClicar}>{aberto ? "Esconder o código" : "Editar o código"}</button>
    </div>
  );
}

let esquemaCache: Promise<Esquema> | null = null;

/** As linhas `chave: valor` do bloco (tipos, relacao, ordenar, colunas). */
export function lerBlocoLista(texto: string): Record<string, string> {
  const c: Record<string, string> = {};
  for (const l of texto.split("\n")) {
    const i = l.indexOf(":");
    if (i > 0) c[l.slice(0, i).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")] = l.slice(i + 1).trim();
  }
  return c;
}

/** A lista ao vivo dentro do texto: busca de novo quando o bloco muda e quando a janela volta a ter foco. */
function ListaNoTexto({ texto, codigo, aoClicar, aberto }: { texto: string; codigo?: string; aoClicar: () => void; aberto: boolean }) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [esquema, setEsquema] = useState<Esquema | null>(null);
  const [recarga, setRecarga] = useState(0);
  const cfg = lerBlocoLista(texto);
  useEffect(() => {
    (esquemaCache ??= api.esquema()).then(setEsquema).catch(() => { esquemaCache = null; });
    const f = () => setRecarga((n) => n + 1);
    window.addEventListener("focus", f);
    return () => window.removeEventListener("focus", f);
  }, []);
  useEffect(() => {
    if (!codigo) return;
    let vivo = true;
    const t = window.setTimeout(() => {
      api.lista(codigo, { tipos: cfg.tipos, relacao: cfg.relacao, ordenar: cfg.ordenar })
        .then((r) => { if (vivo) { setItens(r); setErro(null); } })
        .catch((e) => { if (vivo) setErro(e instanceof Error ? e.message : String(e)); });
    }, 300);
    return () => { vivo = false; window.clearTimeout(t); };
  }, [texto, codigo, recarga]); // eslint-disable-line react-hooks/exhaustive-deps
  const colunas: Propriedade[] = (cfg.colunas ?? "")
    .split(",").map((n) => n.trim().toLowerCase()).filter((n) => n && !["titulo", "título"].includes(n))
    .map((n) => esquema?.propriedades.find((p) => p.nome.toLowerCase() === n))
    .filter((p): p is Propriedade => !!p);
  const mostrar = (it: Item, p: Propriedade) => {
    const v = (it.props as Record<string, unknown>)[String(p.id)];
    if (v == null || v === "") return "";
    return Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
  };
  const mudarStatus = async (it: Item, p: Propriedade, valor: string) => {
    try {
      await api.atualizarItem(it.id, { props: { [p.id]: valor } });
      setRecarga((n) => n + 1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  };
  const opcoesDe = (it: Item, p: Propriedade) => {
    const tp = esquema?.tipos.find((t) => t.id === it.tipo_id)?.propriedades.find((x) => x.propriedade_id === p.id);
    return (tp?.opcoes ?? p.opcoes ?? []).map((o) => o.nome);
  };
  return (
    <div className="lista-no-texto" contentEditable={false}>
      {!codigo ? (
        <div className="diagrama-erro">A lista aparece no documento (aqui não há "este").</div>
      ) : erro ? (
        <div className="diagrama-erro">Lista com erro: {erro}</div>
      ) : !itens ? (
        <div className="diagrama-erro">Buscando…</div>
      ) : (
        <table>
          <thead>
            <tr><th>Título</th>{colunas.map((p) => <th key={p.id}>{p.nome}</th>)}</tr>
          </thead>
          <tbody>
            {itens.map((it) => (
              <tr key={it.id}>
                <td>
                  <button className="lista-abrir" title="Abrir (Ctrl+clique: ao lado)" onClick={(e) => abrir({ v: "item", id: it.id }, e.ctrlKey || e.metaKey)}>
                    <span className="doc-icone">{esquema?.tipos.find((t) => t.id === it.tipo_id)?.icone ?? "·"}</span> <span className="id-item">#{it.codigo}</span> {it.titulo || "Sem título"}
                  </button>
                </td>
                {colunas.map((p) => (
                  <td key={p.id}>
                    {p.especie === "status" || p.especie === "selecao" ? (
                      <select value={mostrar(it, p)} onChange={(e) => mudarStatus(it, p, e.target.value)}>
                        {!mostrar(it, p) && <option value="">—</option>}
                        {opcoesDe(it, p).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : mostrar(it, p)}
                  </td>
                ))}
              </tr>
            ))}
            {itens.length === 0 && <tr><td colSpan={colunas.length + 1} className="vazio">Nenhum documento ligado ainda.</td></tr>}
          </tbody>
        </table>
      )}
      <button className="btn diagrama-botao" onClick={aoClicar}>{aberto ? "Esconder a configuração" : "Configurar a lista"}</button>
    </div>
  );
}
