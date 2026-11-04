import { MutableRefObject, useEffect, useRef, useState } from "react";
import { EditorContent, Extension, useEditor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { RE_MENCAO } from "./Mencoes";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { Markdown } from "tiptap-markdown";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CaixaPrompt, cancelarPrompt, ContextoPrompt, PromptPendente } from "./PromptAgente";
import { blocosDeTabela, BlocoCodigo, Imagem, TarefasCompactas } from "./EditorBlocos";
import { verImagem } from "./VerImagem";
import { api, Entrada } from "../api";

/** Abre no navegador do sistema (no app) ou numa aba nova (no navegador de teste). */
export function abrirLink(url: string) {
  // arquivo local (imagem colada etc.): abre no programa padrão
  if (url.startsWith("file:///")) {
    import("../api").then(({ api }) => api.abrirArquivo(decodeURI(url.slice(8)).replace(/\//g, navigator.userAgent.includes("Windows") ? "\\" : "/")));
    return;
  }
  openUrl(url).catch(() => window.open(url, "_blank"));
}

/** `#a3f9c21` no texto ganha destaque; Ctrl+clique abre o item. */
const Mencao = Extension.create<{ aoAbrir: (codigo: string) => void }>({
  name: "mencao",
  addOptions() {
    return { aoAbrir: () => {} };
  },
  addProseMirrorPlugins() {
    const opcoes = this.options;
    return [
      new Plugin({
        key: new PluginKey("mencao"),
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText || !node.text) return;
              for (const m of node.text.matchAll(RE_MENCAO)) {
                const ini = pos + (m.index ?? 0) + m[1].length;
                decos.push(Decoration.inline(ini, ini + 1 + m[2].length, { class: "mencao", "data-codigo": m[2], title: "Ctrl+clique para abrir o documento" }));
              }
            });
            return DecorationSet.create(state.doc, decos);
          },
          handleClick(_view, _pos, ev) {
            const el = (ev.target as HTMLElement).closest("[data-codigo]");
            if (el && (ev.ctrlKey || ev.metaKey)) {
              opcoes.aoAbrir(el.getAttribute("data-codigo") ?? "");
              return true;
            }
            return false;
          },
        },
      }),
    ];
  },
});

type Ed = NonNullable<ReturnType<typeof useEditor>>;
/** `id`: o comando em inglês (o que se digita e aparece na dica); `apelidos`: os que também acham (português...);
 *  `arquivo`: comando que pede um caminho (autocomplete de arquivo depois do espaço). */
type Cmd = { id: string; apelidos?: string[]; nome: string; faz: (e: Ed) => void; arquivo?: "image" | "link" | "file" };

/** Menu do "/" no editor. */
const COMANDOS: Cmd[] = [
  { id: "h1", apelidos: ["titulo"], nome: "Título grande", faz: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: "h2", apelidos: ["subtitulo"], nome: "Título médio", faz: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: "h3", nome: "Título pequeno", faz: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: "image", apelidos: ["imagem", "img", "foto", "figura"], nome: "Imagem (de um arquivo)", faz: () => {}, arquivo: "image" },
  { id: "link", apelidos: ["ligacao"], nome: "Link para um arquivo", faz: () => {}, arquivo: "link" },
  { id: "file", apelidos: ["arquivo", "anexo"], nome: "Arquivo (link que abre no programa)", faz: () => {}, arquivo: "file" },
  { id: "list", apelidos: ["lista", "bullet"], nome: "Lista", faz: (e) => e.chain().focus().toggleBulletList().run() },
  { id: "numbered", apelidos: ["numerada", "ol"], nome: "Lista numerada", faz: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: "todo", apelidos: ["tarefa", "task", "checklist"], nome: "Tarefa", faz: (e) => e.chain().focus().toggleTaskList().run() },
  { id: "quote", apelidos: ["citacao"], nome: "Citação", faz: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: "code", apelidos: ["codigo"], nome: "Bloco de código", faz: (e) => e.chain().focus().toggleCodeBlock().run() },
  { id: "divider", apelidos: ["divisor", "hr", "linha"], nome: "Divisor", faz: (e) => e.chain().focus().setHorizontalRule().run() },
  { id: "table", apelidos: ["tabela"], nome: "Tabela", faz: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: "livelist", apelidos: ["listaaovivo", "aovivo", "consulta"], nome: "Lista ao vivo (documentos ligados a este)", faz: (e) => e.chain().focus().insertContent({ type: "codeBlock", attrs: { language: "atelier-lista" }, content: [{ type: "text", text: "tipos: \nrelacao: Pai\nordenar: Título\ncolunas: Status" }] }).run() },
  { id: "diagram", apelidos: ["diagrama", "mermaid", "fluxo"], nome: "Diagrama (Mermaid)", faz: (e) => e.chain().focus().insertContent({ type: "codeBlock", attrs: { language: "mermaid" }, content: [{ type: "text", text: "flowchart LR\n  A --> B" }] }).run() },
  {
    id: "now", apelidos: ["agora", "data", "hoje", "hora"], nome: "Data e hora de agora",
    faz: (e) => e.chain().focus().insertContent(new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "") + " ").run(),
  },
  { id: "mention", apelidos: ["item", "citar", "documento", "doc"], nome: "Citar outro documento", faz: (e) => e.chain().focus().insertContent("#").run() },
];

/** Só no texto de um item: pede a um agente para escrever ali (abre a caixinha; ver PromptAgente). */
const PROMPT: Cmd = { id: "prompt", apelidos: ["pedir", "agente", "ia"], nome: "Pedir ao agente", faz: () => {} };

/** Comandos que pedem caminho, pelo que se digita (inglês ou apelido). */
const DE_ARQUIVO = new Map(COMANDOS.filter((c) => c.arquivo).flatMap((c) => [c.id, ...(c.apelidos ?? [])].map((n) => [n, c.arquivo!] as const)));
const RE_CAMINHO = new RegExp(`(?:^|\\s)\\/(${[...DE_ARQUIVO.keys()].join("|")})\\s(\\S*)$`, "u");

/** Uma linha do autocomplete de caminho. */
type Opcao = { tipo: "pasta" | "arquivo" | "subir" | "doc" | "escolher"; rotulo: string; dica?: string; completa: string; especie?: string };

const ehAbsoluto = (c: string) => /^([a-z]:[\\/]|[\\/])/i.test(c);
const barra = (c: string) => c.replace(/\\/g, "/");
/** `base` + `rel` com `..` resolvido (tudo com /). */
function juntar(base: string, rel: string): string {
  const partes = barra(base).replace(/\/+$/, "").split("/");
  for (const p of rel.split("/")) {
    if (!p || p === ".") continue;
    if (p === "..") { if (partes.length > 1) partes.pop(); } else partes.push(p);
  }
  return partes.join("/");
}
/** Caminho de `alvo` visto a partir de `base` (com `../` se for preciso; absoluto se não têm nada em comum). */
function relativo(base: string, alvo: string): string {
  const b = barra(base).replace(/\/+$/, "").split("/"), a = barra(alvo).replace(/\/+$/, "").split("/");
  if (!b[0] || b[0].toLowerCase() !== a[0].toLowerCase()) return barra(alvo);
  let i = 0;
  while (i < b.length && i < a.length && b[i].toLowerCase() === a[i].toLowerCase()) i++;
  return [...Array(b.length - i).fill(".."), ...a.slice(i)].join("/");
}

function sem_acento(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Markdown com edição ao vivo: digita `## `, `- [ ] `, `**negrito**` e vira formatação na hora. */
/** Documento ligado a este, oferecido na raiz do autocomplete de caminho (para pegar arquivo da pasta dele). */
export type DocComPasta = { codigo: string; titulo: string; icone?: string; pasta: string };
/** Inserir imagens/arquivos de fora no texto (o soltar de arquivos do sistema, na página): caminhos relativos à pasta. */
export type InserirArquivos = (caminhos: string[], ponto?: { x: number; y: number }) => void;

export function Editor({
  valor, aoMudar, placeholder, aoMencao, aoColarArquivo, prompt, pasta, codigo, aoEscolherArquivo, relacionados, inserirRef,
}: {
  /** "Escolher arquivo…" do autocomplete: abre o diálogo, traz para insumos/ e devolve os caminhos relativos */
  aoEscolherArquivo?: () => Promise<string[]>;
  /** documentos ligados a este que têm pasta (a raiz do autocomplete de caminho mostra) */
  relacionados?: () => Promise<DocComPasta[]>;
  /** a página recebe aqui a função de inserir arquivos soltos sobre o texto */
  inserirRef?: MutableRefObject<InserirArquivos | null>;
  /** código do documento: o "este" das listas ao vivo do texto (```atelier-lista) */
  codigo?: string;
  /** pasta do documento: imagens com caminho relativo (`![](artefatos/x.png)`) são lidas a partir dela */
  pasta?: string;
  /** liga o /prompt: o item em edição vai como contexto para o agente */
  prompt?: ContextoPrompt;
  valor: string;
  aoMudar: (md: string) => void;
  placeholder?: string;
  aoMencao?: (codigo: string) => void;
  /** recebe o arquivo colado e devolve o caminho onde ficou (ou null) */
  aoColarArquivo?: (f: File) => Promise<string | null>;
}) {
  const aoMencaoRef = useRef(aoMencao);
  aoMencaoRef.current = aoMencao;
  const aoColarRef = useRef(aoColarArquivo);
  aoColarRef.current = aoColarArquivo;
  // o menu do "/": comandos, ou (depois de "/image ") o autocomplete de caminho
  const [menu, setMenu] = useState<{ de: number; filtro: string; top: number; left: number; caminho?: { tipo: "image" | "link" | "file"; parcial: string } } | null>(null);
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const opcoesRef = useRef(opcoes);
  opcoesRef.current = opcoes;
  const aoEscolherRef = useRef(aoEscolherArquivo);
  aoEscolherRef.current = aoEscolherArquivo;
  const relacionadosRef = useRef(relacionados);
  relacionadosRef.current = relacionados;
  const docsLigados = useRef<DocComPasta[] | null>(null);
  const [sel, setSel] = useState(0);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const selRef = useRef(sel);
  selRef.current = sel;
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const [pedindo, setPedindo] = useState<{ pos: number; top: number; left: number } | null>(null);
  const filtrados = (f: string) => {
    const t = sem_acento(f);
    return [...(promptRef.current ? [PROMPT] : []), ...COMANDOS].filter((c) => c.id.startsWith(t) || (c.apelidos ?? []).some((a) => a.startsWith(t)) || sem_acento(c.nome).includes(t));
  };
  const caminhoRef = useRef<(o: Opcao | null, final: boolean) => void>(() => {});
  const aplicarRef = useRef<(c: Cmd) => void>(() => {});
  const ultimo = useRef(valor);
  const timer = useRef<number | undefined>(undefined);
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const pastaRef = useRef(pasta);
  pastaRef.current = pasta;
  const codigoRef = useRef(codigo);
  codigoRef.current = codigo;

  const editor = useEditor({
    extensions: [
      // o bloco de código do StarterKit dá lugar ao com cores (e ao diagrama Mermaid)
      StarterKit.configure({ codeBlock: false }),
      BlocoCodigo.configure({ codigo: () => codigoRef.current }),
      ...blocosDeTabela,
      Imagem.configure({ pasta: () => pastaRef.current }),
      TaskList,
      TarefasCompactas,
      TaskItem.configure({ nested: true }),
      // clique simples continua editando; Ctrl+clique (ou Cmd) abre o link
      Mencao.configure({ aoAbrir: (c) => aoMencaoRef.current?.(c) }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { title: "Ctrl+clique para abrir" } }),
      Placeholder.configure({ placeholder: placeholder ?? "Escreva aqui… (markdown funciona: ## título, - lista, [ ] tarefa)" }),
      Markdown.configure({ html: false, linkify: true, transformPastedText: true, breaks: false }),
      PromptPendente.configure({ aoCancelar: (id) => editorRef.current && cancelarPrompt(editorRef.current, id) }),
    ],
    content: valor,
    editorProps: {
      handleKeyDown: (_view, ev) => {
        const m = menuRef.current;
        if (!m) return false;
        // autocomplete de caminho: Tab completa, Enter entra na pasta ou troca o comando pelo markdown
        if (m.caminho) {
          const ops = opcoesRef.current;
          const i = Math.min(selRef.current, ops.length - 1);
          if (ev.key === "ArrowDown") { setSel((x) => Math.min(ops.length - 1, x + 1)); return true; }
          if (ev.key === "ArrowUp") { setSel((x) => Math.max(0, x - 1)); return true; }
          if (ev.key === "Tab") { if (ops.length) caminhoRef.current(ops[i], false); return true; }
          if (ev.key === "Enter") { caminhoRef.current(ops.length ? ops[i] : null, true); return true; }
          if (ev.key === "Escape") { setMenu(null); return true; }
          return false;
        }
        const lista = filtrados(m.filtro);
        if (ev.key === "ArrowDown") { setSel((i) => Math.min(lista.length - 1, i + 1)); return true; }
        if (ev.key === "ArrowUp") { setSel((i) => Math.max(0, i - 1)); return true; }
        if (ev.key === "Enter" && lista.length) { aplicarRef.current(lista[Math.min(selRef.current, lista.length - 1)]); return true; }
        if (ev.key === "Escape") { setMenu(null); return true; }
        return false;
      },
      handlePaste: (_view, ev) => {
        const arquivos = [...(ev.clipboardData?.files ?? [])];
        if (!arquivos.length || !aoColarRef.current) return false;
        ev.preventDefault();
        (async () => {
          for (const f of arquivos) {
            const caminho = await aoColarRef.current!(f);
            if (!caminho || !editorRef.current) continue;
            // imagem colada (print, Ctrl+V) entra como imagem, com caminho relativo à pasta (insumos/...)
            if (f.type.startsWith("image/")) {
              const nome = caminho.split(/[\\/]/).pop() ?? f.name;
              const p = pastaRef.current;
              const src = p && barra(caminho).toLowerCase().startsWith(barra(p).toLowerCase()) ? relativo(p, caminho) : `insumos/${nome}`;
              editorRef.current.chain().focus().insertContent({ type: "image", attrs: { src, alt: nome } }).run();
              continue;
            }
            const nome = caminho.split(/[\\/]/).pop() ?? f.name;
            const href = "file:///" + encodeURI(caminho.replace(/\\/g, "/"));
            editorRef.current.chain().focus().insertContent([{ type: "text", text: nome, marks: [{ type: "link", attrs: { href } }] }, { type: "text", text: " " }]).run();
          }
        })();
        return true;
      },
      handleClick: (_view, _pos, ev) => {
        // imagem no texto: clique abre o visualizador em tela cheia (com as outras do documento para passar)
        const img = (ev.target as HTMLElement).closest("img");
        if (img && !(ev.ctrlKey || ev.metaKey)) {
          const todas = Array.from((ev.currentTarget as HTMLElement | null)?.closest?.(".ProseMirror")?.querySelectorAll("img") ?? img.parentElement?.closest(".ProseMirror")?.querySelectorAll("img") ?? [img]);
          const lista = todas.map((x) => ({ src: x.getAttribute("src") ?? "", nome: x.getAttribute("data-src")?.split(/[\\/]/).pop() }));
          verImagem(lista, Math.max(0, todas.indexOf(img)));
          return true;
        }
        const a = (ev.target as HTMLElement).closest("a");
        if (a && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          abrirLink(a.getAttribute("href") ?? "");
          return true;
        }
        return false;
      },
    },
    onSelectionUpdate: ({ editor }) => verMenu(editor),
    onUpdate: ({ editor }) => {
      verMenu(editor);
      const md: string = (editor.storage as any).markdown.getMarkdown();
      ultimo.current = md;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = undefined;
        aoMudarRef.current(md);
      }, 500);
    },
  });

  const editorRef = useRef(editor);
  editorRef.current = editor;

  // "/" no começo da linha ou depois de espaço abre o menu de comandos; "/image " (e /link, /file) abre o de caminho
  function verMenu(e: NonNullable<typeof editor>) {
    const { $from, empty } = e.state.selection;
    if (!empty || $from.parent.type.name === "codeBlock") return setMenu(null);
    const antes = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
    const mc = antes.match(RE_CAMINHO);
    if (mc) {
      const de = $from.pos - mc[0].trimStart().length;
      const c = e.view.coordsAtPos(de);
      const tipo = DE_ARQUIVO.get(mc[1])!;
      setMenu((atual) => {
        if (!atual?.caminho || atual.caminho.parcial !== mc[2]) setSel(0);
        return { de, filtro: "", top: c.bottom + 6, left: c.left, caminho: { tipo, parcial: mc[2] } };
      });
      return;
    }
    const m = antes.match(/(?:^|\s)\/([\p{L}\d]{0,20})$/u);
    if (!m) return setMenu(null);
    const de = $from.pos - m[1].length - 1;
    const c = e.view.coordsAtPos(de);
    setMenu((atual) => {
      if (!atual || atual.filtro !== m[1]) setSel(0);
      return { de, filtro: m[1], top: c.bottom + 6, left: c.left };
    });
  }

  aplicarRef.current = (c: Cmd) => {
    const e = editorRef.current;
    const m = menuRef.current;
    if (!e || !m) return;
    // comando de arquivo: vira "/image " e o menu passa a ser o de caminho
    if (c.arquivo) {
      e.chain().focus().deleteRange({ from: m.de, to: e.state.selection.from }).insertContent(`/${c.id} `).run();
      return;
    }
    e.chain().focus().deleteRange({ from: m.de, to: e.state.selection.from }).run();
    setMenu(null);
    if (c.id === "prompt") {
      const pos = e.state.selection.from;
      const xy = e.view.coordsAtPos(pos);
      setPedindo({ pos, top: Math.min(xy.bottom + 8, window.innerHeight - 220), left: Math.min(xy.left, window.innerWidth - 440) });
      return;
    }
    c.faz(e);
  };

  // autocomplete de caminho: lista a pasta do que já foi digitado (a partir da pasta do documento; ".." sobe), com os
  // documentos ligados na raiz; o Enter troca "/image caminho" pelo markdown (imagem ou link)
  const chaveCaminho = menu?.caminho ? `${menu.caminho.tipo}|${menu.caminho.parcial}` : "";
  useEffect(() => {
    const c = menu?.caminho;
    if (!c) { setOpcoes([]); return; }
    let vivo = true;
    (async () => {
      const base = pastaRef.current;
      const i = c.parcial.lastIndexOf("/");
      const dir = c.parcial.slice(0, i + 1), prefixo = sem_acento(c.parcial.slice(i + 1));
      const abs = ehAbsoluto(c.parcial) ? (dir || c.parcial) : base ? juntar(base, dir) : null;
      const ops: Opcao[] = [];
      if (abs) {
        try {
          const r = await api.explorar(abs);
          if (!prefixo) ops.push({ tipo: "subir", rotulo: "..", dica: "subir uma pasta", completa: `${dir}../` });
          const ent = r.entradas
            .filter((x: Entrada) => sem_acento(x.nome).startsWith(prefixo) || (prefixo.length > 1 && sem_acento(x.nome).includes(prefixo)))
            .filter((x: Entrada) => x.pasta || c.tipo !== "image" || x.especie === "imagem")
            .sort((a: Entrada, b: Entrada) => Number(b.pasta) - Number(a.pasta) || a.nome.localeCompare(b.nome));
          for (const x of ent.slice(0, 60)) {
            ops.push(x.pasta
              ? { tipo: "pasta", rotulo: `${x.nome}/`, completa: `${dir}${x.nome}/` }
              : { tipo: "arquivo", rotulo: x.nome, completa: `${dir}${x.nome}`, especie: x.especie });
          }
        } catch { /* pasta que não existe: só não lista */ }
      }
      // na raiz: as pastas dos documentos ligados a este
      if (!dir && relacionadosRef.current) {
        if (!docsLigados.current) docsLigados.current = await relacionadosRef.current().catch(() => []);
        for (const d of docsLigados.current) {
          if (prefixo && !sem_acento(`${d.codigo} ${d.titulo}`).includes(prefixo)) continue;
          const caminho = base ? relativo(base, d.pasta) : barra(d.pasta);
          ops.push({ tipo: "doc", rotulo: `${d.icone ?? "📄"} #${d.codigo} ${d.titulo || "Sem título"}`, dica: "pasta dele", completa: `${caminho.replace(/\/+$/, "")}/` });
        }
      }
      if (aoEscolherRef.current) ops.push({ tipo: "escolher", rotulo: "Escolher arquivo…", dica: "copia para insumos/", completa: "" });
      if (vivo) setOpcoes(ops);
    })();
    return () => { vivo = false; };
  }, [chaveCaminho]); // eslint-disable-line react-hooks/exhaustive-deps

  // troca "/image caminho" pelo markdown equivalente
  const inserirArquivo = (e: Ed, tipo: "image" | "link" | "file", caminho: string, de?: number) => {
    const ate = e.state.selection.from;
    const ch = e.chain().focus();
    if (de != null) ch.deleteRange({ from: de, to: ate });
    const nome = caminho.split("/").filter(Boolean).pop() ?? caminho;
    if (tipo === "image") ch.insertContent({ type: "image", attrs: { src: caminho, alt: nome } });
    else {
      const p = pastaRef.current;
      const abs = ehAbsoluto(caminho) ? barra(caminho) : p ? juntar(p, caminho) : caminho;
      const href = "file:///" + encodeURI(abs);
      ch.insertContent([{ type: "text", text: nome, marks: [{ type: "link", attrs: { href } }] }, { type: "text", text: " " }]);
    }
    ch.run();
  };
  caminhoRef.current = (o, final) => {
    const e = editorRef.current;
    const m = menuRef.current;
    if (!e || !m?.caminho) return;
    const { tipo } = m.caminho;
    if (o?.tipo === "escolher") {
      const de = m.de;
      setMenu(null);
      aoEscolherRef.current?.().then((cs) => {
        const ed = editorRef.current;
        if (!ed || !cs.length) return;
        ed.chain().focus().deleteRange({ from: de, to: ed.state.selection.from }).run();
        cs.forEach((c) => inserirArquivo(ed, tipo, c));
      }).catch(() => {});
      return;
    }
    // Tab, ou Enter numa pasta: completa o caminho e continua no autocomplete
    if (o && (!final || o.tipo !== "arquivo")) {
      const ini = m.de + m.caminho.tipo.length + 2;
      const fim = e.state.selection.from;
      const atePalavra = e.state.doc.textBetween(m.de, fim);
      const espaco = atePalavra.indexOf(" ");
      e.chain().focus().insertContentAt({ from: espaco >= 0 ? m.de + espaco + 1 : ini, to: fim }, o.completa).run();
      return;
    }
    const caminho = o ? o.completa : m.caminho.parcial;
    setMenu(null);
    if (!caminho) return;
    inserirArquivo(e, tipo, caminho, m.de);
  };

  // arquivos soltos do sistema sobre o texto (a página copia para insumos/ e chama aqui): imagem vira imagem, o resto link
  useEffect(() => {
    if (!inserirRef) return;
    inserirRef.current = (caminhos, ponto) => {
      const e = editorRef.current;
      if (!e) return;
      const pos = ponto ? e.view.posAtCoords({ left: ponto.x, top: ponto.y })?.pos : undefined;
      if (pos != null) e.commands.setTextSelection(pos);
      for (const c of caminhos) inserirArquivo(e, /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(c) ? "image" : "file", c);
    };
    return () => { inserirRef.current = null; };
  });

  // valor mudou por fora (outro item, ou o Claude editou): recarrega sem perder o que está sendo digitado
  useEffect(() => {
    if (editor && valor !== ultimo.current) {
      ultimo.current = valor;
      editor.commands.setContent(valor, false);
    }
  }, [valor, editor]);

  // grava o que estiver pendente ao sair
  useEffect(
    () => () => {
      if (timer.current !== undefined) {
        window.clearTimeout(timer.current);
        aoMudarRef.current(ultimo.current);
      }
    },
    [],
  );

  const lista = menu && !menu.caminho ? filtrados(menu.filtro) : [];
  const iSel = Math.min(sel, Math.max(0, (menu?.caminho ? opcoes.length : lista.length) - 1));
  return (
    <>
      <EditorContent editor={editor} className="editor" />
      {pedindo && editor && prompt && (
        <CaixaPrompt editor={editor} pos={pedindo.pos} top={pedindo.top} left={pedindo.left} ctx={prompt} aoFechar={() => setPedindo(null)} />
      )}
      {menu && !menu.caminho && lista.length > 0 && (
        <div className="popover menu-barra" style={{ top: menu.top, left: menu.left, width: 290 }} onMouseDown={(e) => e.preventDefault()}>
          <div className="menu-rotulo">Inserir</div>
          {lista.map((c, i) => (
            <button key={c.id} className={`menu-item${i === iSel ? " foco" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => aplicarRef.current(c)}>
              {c.nome}
              <span className="dir mono-dica">/{c.id}</span>
            </button>
          ))}
        </div>
      )}
      {menu?.caminho && (
        <div className="popover menu-barra menu-caminho" style={{ top: menu.top, left: menu.left, width: 380 }} onMouseDown={(e) => e.preventDefault()}>
          <div className="menu-rotulo">
            {menu.caminho.tipo === "image" ? "Imagem" : menu.caminho.tipo === "link" ? "Link" : "Arquivo"}: {pasta ? "a partir da pasta do documento" : "documento sem pasta"} · Tab completa · Enter insere
          </div>
          {opcoes.length === 0 && <div className="menu-vazio">Nada aqui com esse começo.</div>}
          <div className="menu-caminho-lista">
            {opcoes.map((o, i) => (
              <button key={`${o.tipo}${o.rotulo}${i}`} className={`menu-item${i === iSel ? " foco" : ""}${o.tipo === "escolher" ? " escolher" : ""}`}
                onMouseEnter={() => setSel(i)} onClick={() => caminhoRef.current(o, true)}>
                <span className="caminho-icone">{o.tipo === "pasta" ? "📁" : o.tipo === "subir" ? "↰" : o.tipo === "doc" ? "🔗" : o.tipo === "escolher" ? "…" : o.especie === "imagem" ? "🖼️" : "📄"}</span>
                <span className="caminho-nome">{o.rotulo}</span>
                {o.dica && <span className="dir mono-dica">{o.dica}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
