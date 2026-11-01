import { useEffect, useRef, useState } from "react";
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
                decos.push(Decoration.inline(ini, ini + 1 + m[2].length, { class: "mencao", "data-codigo": m[2], title: "Ctrl+clique para abrir o item" }));
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

type Cmd = { id: string; nome: string; dica: string; faz: (e: NonNullable<ReturnType<typeof useEditor>>) => void };

/** Menu do "/" no editor. */
const COMANDOS: Cmd[] = [
  { id: "h1", nome: "Título grande", dica: "#", faz: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: "h2", nome: "Título médio", dica: "##", faz: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: "h3", nome: "Título pequeno", dica: "###", faz: (e) => e.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: "lista", nome: "Lista", dica: "-", faz: (e) => e.chain().focus().toggleBulletList().run() },
  { id: "numerada", nome: "Lista numerada", dica: "1.", faz: (e) => e.chain().focus().toggleOrderedList().run() },
  { id: "tarefa", nome: "Tarefa", dica: "[ ]", faz: (e) => e.chain().focus().toggleTaskList().run() },
  { id: "citacao", nome: "Citação", dica: ">", faz: (e) => e.chain().focus().toggleBlockquote().run() },
  { id: "codigo", nome: "Bloco de código", dica: "```", faz: (e) => e.chain().focus().toggleCodeBlock().run() },
  { id: "divisor", nome: "Divisor", dica: "---", faz: (e) => e.chain().focus().setHorizontalRule().run() },
  {
    id: "agora", nome: "Data e hora de agora", dica: "30/10 18:55",
    faz: (e) => e.chain().focus().insertContent(new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "") + " ").run(),
  },
  { id: "item", nome: "Citar outro item", dica: "#código", faz: (e) => e.chain().focus().insertContent("#").run() },
];

/** Só no texto de um item: pede a um agente para escrever ali (abre a caixinha; ver PromptAgente). */
const PROMPT: Cmd = { id: "prompt", nome: "Pedir ao agente", dica: "/prompt", faz: () => {} };

function sem_acento(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Markdown com edição ao vivo: digita `## `, `- [ ] `, `**negrito**` e vira formatação na hora. */
export function Editor({
  valor, aoMudar, placeholder, aoMencao, aoColarArquivo, prompt,
}: {
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
  const [menu, setMenu] = useState<{ de: number; filtro: string; top: number; left: number } | null>(null);
  const [sel, setSel] = useState(0);
  const menuRef = useRef(menu);
  menuRef.current = menu;
  const selRef = useRef(sel);
  selRef.current = sel;
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const [pedindo, setPedindo] = useState<{ pos: number; top: number; left: number } | null>(null);
  const filtrados = (f: string) => [...(promptRef.current ? [PROMPT] : []), ...COMANDOS].filter((c) => sem_acento(c.nome).includes(sem_acento(f)) || c.id.startsWith(sem_acento(f)));
  const aplicarRef = useRef<(c: Cmd) => void>(() => {});
  const ultimo = useRef(valor);
  const timer = useRef<number | undefined>(undefined);
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
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
            const nome = caminho.split(/[\\/]/).pop() ?? f.name;
            const href = "file:///" + encodeURI(caminho.replace(/\\/g, "/"));
            editorRef.current.chain().focus().insertContent([{ type: "text", text: nome, marks: [{ type: "link", attrs: { href } }] }, { type: "text", text: " " }]).run();
          }
        })();
        return true;
      },
      handleClick: (_view, _pos, ev) => {
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

  // "/" no começo da linha ou depois de espaço abre o menu de comandos
  function verMenu(e: NonNullable<typeof editor>) {
    const { $from, empty } = e.state.selection;
    if (!empty || $from.parent.type.name === "codeBlock") return setMenu(null);
    const antes = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
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

  const lista = menu ? filtrados(menu.filtro) : [];
  return (
    <>
      <EditorContent editor={editor} className="editor" />
      {pedindo && editor && prompt && (
        <CaixaPrompt editor={editor} pos={pedindo.pos} top={pedindo.top} left={pedindo.left} ctx={prompt} aoFechar={() => setPedindo(null)} />
      )}
      {menu && lista.length > 0 && (
        <div className="popover menu-barra" style={{ top: menu.top, left: menu.left, width: 250 }} onMouseDown={(e) => e.preventDefault()}>
          <div className="menu-rotulo">Inserir</div>
          {lista.map((c, i) => (
            <button key={c.id} className={`menu-item${i === Math.min(sel, lista.length - 1) ? " foco" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => aplicarRef.current(c)}>
              {c.nome}
              <span className="dir mono-dica">{c.dica}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
