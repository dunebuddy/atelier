// Comentários num arquivo aberto no atelier (markdown, texto, HTML), como numa revisão: seleciona um trecho do que
// está vendo → escreve na caixinha que aparece ali mesmo (core/src/comentar.js, embutido na moldura) e dá Enter → o
// trecho fica grifado (passar o mouse mostra o comentário) e a margem lista todos (clicar leva ao trecho). Guardados em <arquivo>.comentarios.json (core/src/comentarios.rs); o agente lê,
// ajusta e resolve pelo MCP (`comentarios`), e esta margem acompanha sozinha.
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, MessageSquare, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { BASE } from "../api";
import { falhou } from "../ui";
import { dataHora } from "../visao";

export type Comentario = {
  id: number;
  trecho: string;
  antes?: string;
  depois?: string;
  comentario: string;
  autor?: string;
  criado?: string;
  editado?: string;
  resposta?: { em: string; autor: string; texto: string } | null;
  resolvido?: { em: string; autor: string; resposta: string } | null;
};
type Dados = { comentarios: Comentario[]; abertos: number; modificado: string | null };

async function pedir<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: corpo ? { "content-type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j as { erro?: string }).erro) throw new Error((j as { erro?: string }).erro ?? `HTTP ${r.status}`);
  return j as T;
}

/** Os comentários do arquivo, vigiados (o agente resolve pelo MCP e a margem acompanha). */
export function useComentarios(caminho: string, ligado: boolean) {
  const [dados, setDados] = useState<Dados>({ comentarios: [], abertos: 0, modificado: null });
  const mod = useRef<string | null | undefined>(undefined);
  const carregar = useCallback(async () => {
    const d = await pedir<Dados>("GET", `/comentarios?caminho=${encodeURIComponent(caminho)}`);
    if (d.modificado === mod.current) return;
    mod.current = d.modificado;
    setDados(d);
  }, [caminho]);
  useEffect(() => {
    mod.current = undefined;
    if (!ligado) return;
    carregar().catch(() => {});
    const t = window.setInterval(() => carregar().catch(() => {}), 2500);
    return () => window.clearInterval(t);
  }, [carregar, ligado]);
  const mexer = useCallback(async (acao: string, extra: Record<string, unknown> = {}) => {
    try {
      const r = await pedir<{ comentarios: Dados; id?: number }>("POST", "/comentarios", { caminho, acao, ...extra });
      mod.current = r.comentarios.modificado;
      setDados(r.comentarios);
      return r;
    } catch (e) {
      falhou(e);
      return null;
    }
  }, [caminho]);
  return { dados, mexer };
}

/** Manda os grifos para a moldura (ela acha cada trecho, grifa e mostra o comentário ao passar o mouse), com as
 *  cores do tema para a caixinha de comentar. */
export function enviarGrifos(frame: HTMLIFrameElement | null, lista: Comentario[]) {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(`--${n}`).trim();
  frame?.contentWindow?.postMessage({
    atelier: "grifos",
    tema: { bg: v("bg-elev"), texto: v("texto"), texto3: v("texto-3"), borda: v("borda-forte"), acento: v("acento") },
    lista: lista.map((c) => ({
      id: c.id, trecho: c.trecho, antes: c.antes, depois: c.depois, resolvido: !!c.resolvido,
      comentario: c.comentario, autor: c.autor,
      resposta: c.resolvido ? (c.resolvido.resposta ? `${c.resolvido.autor || "agente"}: ${c.resolvido.resposta}` : "")
        : c.resposta ? `${c.resposta.autor}: ${c.resposta.texto}` : "",
    })),
  }, "*");
}

/** O botão do cabeçalho do arquivo: mostra/esconde a margem, com quantos estão abertos. */
export function BotaoComentarios({ abertos, total, aberto, alternar }: { abertos: number; total: number; aberto: boolean; alternar: () => void }) {
  return (
    <button className={`btn${aberto ? " ativo" : ""}`} onClick={alternar}
      title="Comentários: selecione um trecho do texto, escreva na caixinha que aparece e dê Enter. Aqui abre e fecha a lista.">
      <MessageSquare size={14} /> {abertos > 0 ? `${abertos} ${abertos === 1 ? "aberto" : "abertos"}` : total > 0 ? "Comentários" : "Comentar"}
    </button>
  );
}

/** A margem: a lista dos comentários (clicar leva ao trecho no texto). */
export function MargemComentarios({ dados, mexer, foco, aoIr }: {
  dados: Dados;
  mexer: (acao: string, extra?: Record<string, unknown>) => Promise<unknown>;
  foco: number | null;
  aoIr: (id: number) => void;
}) {
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const [verResolvidos, setVerResolvidos] = useState(true);
  const lista = dados.comentarios.filter((c) => verResolvidos || !c.resolvido);
  const resolvidos = dados.comentarios.filter((c) => c.resolvido).length;
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (foco == null) return;
    caixa.current?.querySelector(`[data-comentario="${foco}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [foco]);

  return (
    <aside className="cm-margem" ref={caixa}>
      <div className="cm-topo">
        <span>Comentários</span>
        <span className="cm-conta">{dados.abertos} {dados.abertos === 1 ? "aberto" : "abertos"}</span>
        <span style={{ flex: 1 }} />
        {resolvidos > 0 && (
          <>
            <button className="btn-icone mini" title={verResolvidos ? "Esconder os resolvidos" : "Mostrar os resolvidos"} onClick={() => setVerResolvidos((v) => !v)}>
              <Check size={13} />
            </button>
            <button className="btn-icone mini" title={`Limpar os resolvidos (${resolvidos})`} onClick={() => mexer("limpar_resolvidos")}>
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>

      {dados.comentarios.length === 0 && (
        <div className="cm-vazio">Selecione um trecho do texto: aparece uma caixinha para escrever o comentário, e Enter salva. O trecho fica grifado (passe o mouse para ler). Depois diga ao agente que comentou: ele lê, ajusta e responde aqui.</div>
      )}

      {lista.map((c) => (
        <div key={c.id} data-comentario={c.id} title={foco === c.id ? undefined : c.comentario}
          className={`cm-cartao${c.resolvido ? " resolvido" : ""}${foco === c.id ? " foco" : editando?.id === c.id ? "" : " recolhido"}`} onClick={() => aoIr(c.id)}>
          <blockquote className="cm-trecho">{c.trecho}</blockquote>
          {editando?.id === c.id ? (
            <>
              <textarea autoFocus className="campo" rows={3} value={editando.texto} onClick={(e) => e.stopPropagation()}
                onChange={(e) => setEditando({ id: c.id, texto: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); mexer("editar", { id: c.id, comentario: editando.texto }).then(() => setEditando(null)); }
                  if (e.key === "Escape") { e.preventDefault(); setEditando(null); }
                }} />
              <div className="cm-acoes" onClick={(e) => e.stopPropagation()}>
                <button className="btn" onClick={() => setEditando(null)}>Cancelar</button>
                <button className="btn primario" disabled={!editando.texto.trim()} onClick={() => mexer("editar", { id: c.id, comentario: editando.texto }).then(() => setEditando(null))}>Salvar</button>
              </div>
            </>
          ) : (
            <div className="cm-texto">{c.comentario}</div>
          )}
          <div className="cm-meta">
            <span>{c.autor ?? "você"}{c.criado ? ` · ${dataHora(c.criado)}` : ""}{c.editado ? " · editado" : ""}</span>
            <span style={{ flex: 1 }} />
            {!c.resolvido && editando?.id !== c.id && (
              <>
                <button className="btn-icone mini" title="Editar" onClick={(e) => { e.stopPropagation(); setEditando({ id: c.id, texto: c.comentario }); }}><Pencil size={12} /></button>
                <button className="btn-icone mini" title="Marcar como resolvido" onClick={(e) => { e.stopPropagation(); mexer("resolver", { id: c.id, resposta: "" }); }}><Check size={12} /></button>
              </>
            )}
            {c.resolvido && (
              <button className="btn-icone mini" title="Reabrir" onClick={(e) => { e.stopPropagation(); mexer("reabrir", { id: c.id }); }}><RotateCcw size={12} /></button>
            )}
            <button className="btn-icone mini" title="Apagar" onClick={(e) => { e.stopPropagation(); mexer("apagar", { id: c.id }); }}><X size={12} /></button>
          </div>
          {c.resposta && !c.resolvido && (
            <div className="cm-resposta"><b>{c.resposta.autor}:</b> {c.resposta.texto}</div>
          )}
          {c.resolvido && (
            <div className="cm-resposta"><b>✓ Resolvido{c.resolvido.autor && c.resolvido.autor !== "Paulo" ? ` (${c.resolvido.autor})` : ""}</b>{c.resolvido.resposta ? `: ${c.resolvido.resposta}` : ""}</div>
          )}
        </div>
      ))}
    </aside>
  );
}
