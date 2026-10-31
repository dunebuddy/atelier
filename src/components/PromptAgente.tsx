import { useEffect, useRef, useState } from "react";
import { Extension } from "@tiptap/react";
import type { Editor as TipEditor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Bot } from "lucide-react";
import { AgenteCli, api } from "../api";
import { avisar, falhou } from "../ui";

/** O item que está sendo editado: vai para o agente como contexto (ele lê o resto pelo MCP). */
export interface ContextoPrompt {
  itemId: number;
  codigo: string;
  titulo: string;
}

// Pontos do texto esperando a resposta de um agente. A posição acompanha o que o Paulo digita em volta.
type Pendente = { pos: number; rotulo: string };
const chave = new PluginKey<Map<string, Pendente>>("prompt-pendente");

export const PromptPendente = Extension.create<{ aoCancelar: (id: string) => void }>({
  name: "promptPendente",
  addOptions() {
    return { aoCancelar: () => {} };
  },
  addProseMirrorPlugins() {
    const opcoes = this.options;
    return [
      new Plugin({
        key: chave,
        state: {
          init: () => new Map<string, Pendente>(),
          apply(tr, mapa) {
            const novo = new Map<string, Pendente>();
            for (const [k, v] of mapa) novo.set(k, { ...v, pos: tr.mapping.map(v.pos) });
            const meta = tr.getMeta(chave) as { poe?: { id: string } & Pendente; tira?: string } | undefined;
            if (meta?.poe) novo.set(meta.poe.id, { pos: meta.poe.pos, rotulo: meta.poe.rotulo });
            if (meta?.tira) novo.delete(meta.tira);
            return novo;
          },
        },
        props: {
          decorations(state) {
            const mapa = chave.getState(state)!;
            return DecorationSet.create(
              state.doc,
              [...mapa].map(([id, v]) =>
                Decoration.widget(v.pos, () => {
                  const el = document.createElement("span");
                  el.className = "prompt-pendente";
                  el.textContent = `⏳ ${v.rotulo} escrevendo…`;
                  const b = document.createElement("button");
                  b.textContent = "cancelar";
                  b.onmousedown = (e) => { e.preventDefault(); opcoes.aoCancelar(id); };
                  el.appendChild(b);
                  return el;
                }, { key: id, side: -1 }),
              ),
            );
          },
        },
      }),
    ];
  },
});

const pedidos = new Map<string, AbortController>();

export function cancelarPrompt(editor: TipEditor, id: string) {
  pedidos.get(id)?.abort();
  pedidos.delete(id);
  editor.view.dispatch(editor.state.tr.setMeta(chave, { tira: id }));
}

/** Tira cercas de código que embrulham a resposta inteira. */
function limpar(s: string) {
  const m = s.trim().match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  return (m ? m[1] : s).trim();
}

/** Caixinha do /prompt: escolhe o agente, escreve o pedido; a resposta entra no ponto onde o /prompt foi digitado. */
export function CaixaPrompt({ editor, pos, top, left, ctx, aoFechar }: {
  editor: TipEditor; pos: number; top: number; left: number; ctx: ContextoPrompt; aoFechar: () => void;
}) {
  const [agentes, setAgentes] = useState<AgenteCli[] | null>(null);
  const [agente, setAgente] = useState<string>(() => localStorage.getItem("atelier.promptAgente") ?? "");
  const [pedido, setPedido] = useState("");
  const campo = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.agentes().then((r) => {
      const l = r.agentes.filter((a) => a.prompt);
      setAgentes(l);
      if (!l.some((a) => a.id === agente)) setAgente(l[0]?.id ?? "");
    }).catch(falhou);
    campo.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = () => {
    const a = agentes?.find((x) => x.id === agente);
    if (!a || !pedido.trim()) return;
    localStorage.setItem("atelier.promptAgente", a.id);
    const id = `p${Date.now()}`;
    editor.view.dispatch(editor.state.tr.setMeta(chave, { poe: { id, pos, rotulo: a.nome } }));
    aoFechar();
    // o texto em volta do ponto, para o agente saber onde está escrevendo
    const doc = editor.state.doc;
    const antes = doc.textBetween(0, pos, "\n\n").slice(-6000);
    const depois = doc.textBetween(pos, doc.content.size, "\n\n").slice(0, 3000);
    const prompt = [
      `Você está ajudando a escrever o item #${ctx.codigo} ("${ctx.titulo}") do atelier, o sistema de gestão do usuário.`,
      `Se precisar de contexto, consulte pelo MCP do atelier (ler_item com o código ${ctx.codigo}, buscar, itens relacionados). Não altere nada pelo MCP.`,
      ``,
      `Pedido: ${pedido.trim()}`,
      ``,
      `O seu texto vai entrar no ponto marcado com ⟦AQUI⟧ no documento abaixo. Responda SOMENTE com o texto a inserir, em Markdown, sem explicações antes ou depois.`,
      ``,
      `-----`,
      `${antes}⟦AQUI⟧${depois}`,
      `-----`,
    ].join("\n");
    const ctl = new AbortController();
    pedidos.set(id, ctl);
    api.executar({ agente: a.id, prompt, uso: "prompt", item: ctx.itemId }, ctl.signal)
      .then((r) => {
        const mapa = chave.getState(editor.state);
        const p = mapa?.get(id)?.pos;
        if (p == null || editor.isDestroyed) return;
        editor.view.dispatch(editor.state.tr.setMeta(chave, { tira: id }));
        const texto = limpar(r.saida);
        if (!texto) { avisar(`${a.nome} não devolveu texto.`); return; }
        editor.chain().insertContentAt(p, texto).run();
        api.anotar(ctx.itemId, `Texto escrito por /prompt (${r.segundos} s): ${pedido.trim()}`, a.nome).catch(() => {});
      })
      .catch((e) => {
        if (ctl.signal.aborted) return;
        if (!editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(chave, { tira: id }));
        falhou(e);
      })
      .finally(() => pedidos.delete(id));
  };

  return (
    <div className="prompt-caixa" style={{ top, left }} onMouseDown={(e) => e.stopPropagation()}>
      <div className="linha">
        <Bot size={15} />
        <strong style={{ fontSize: 13 }}>Pedir ao agente</strong>
        <span style={{ flex: 1 }} />
        {agentes && agentes.length > 0 && (
          <select value={agente} onChange={(e) => setAgente(e.target.value)}>
            {agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        )}
      </div>
      {agentes && agentes.length === 0 ? (
        <div className="dica-inline">Nenhum agente ligado para Prompt. Ligue em Configurações → Integrações (precisa do MCP instalado).</div>
      ) : (
        <textarea
          ref={campo}
          placeholder="O que escrever aqui? (Enter envia, Shift+Enter quebra a linha, Esc cancela)"
          value={pedido}
          onChange={(e) => setPedido(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
            if (e.key === "Escape") { e.preventDefault(); aoFechar(); editor.commands.focus(); }
          }}
        />
      )}
      <div className="linha">
        <span className="dica-inline">O texto entra onde você digitou /prompt. Dá para continuar editando enquanto ele escreve.</span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => { aoFechar(); editor.commands.focus(); }}>Cancelar</button>
        <button className="btn primario" onClick={enviar} disabled={!agente || !pedido.trim()}>Enviar</button>
      </div>
    </div>
  );
}
