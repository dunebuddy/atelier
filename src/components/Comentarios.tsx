// Comentários num arquivo aberto no atelier (markdown, texto, HTML), como numa revisão: seleciona um trecho do que
// está vendo → "Comentar" (o botão aparece dentro da moldura, pelo /api/comentar.js) → o comentário entra aqui, na
// margem, e o trecho fica grifado. Guardados em <arquivo>.comentarios.json (core/src/comentarios.rs); o agente lê,
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
export type Selecao = { trecho: string; antes: string; depois: string };

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

/** Manda os grifos para a moldura (ela acha cada trecho e grifa). */
export function enviarGrifos(frame: HTMLIFrameElement | null, lista: Comentario[]) {
  frame?.contentWindow?.postMessage({
    atelier: "grifos",
    lista: lista.map((c) => ({ id: c.id, trecho: c.trecho, antes: c.antes, depois: c.depois, resolvido: !!c.resolvido })),
  }, "*");
}

/** O botão do cabeçalho do arquivo: mostra/esconde a margem, com quantos estão abertos. */
export function BotaoComentarios({ abertos, total, aberto, alternar }: { abertos: number; total: number; aberto: boolean; alternar: () => void }) {
  return (
    <button className={`btn${aberto ? " ativo" : ""}`} onClick={alternar}
      title="Comentários: selecione um trecho do texto e clique em “Comentar”. Depois é só dizer ao agente que comentou.">
      <MessageSquare size={14} /> {abertos > 0 ? `${abertos} ${abertos === 1 ? "aberto" : "abertos"}` : total > 0 ? "Comentários" : "Comentar"}
    </button>
  );
}

/** A margem: o comentário novo (quando selecionou), e a lista. */
export function MargemComentarios({ dados, compondo, aoCancelar, mexer, foco, aoIr }: {
  dados: Dados;
  compondo: Selecao | null;
  aoCancelar: () => void;
  mexer: (acao: string, extra?: Record<string, unknown>) => Promise<unknown>;
  foco: number | null;
  aoIr: (id: number) => void;
}) {
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState<{ id: number; texto: string } | null>(null);
  const [verResolvidos, setVerResolvidos] = useState(true);
  useEffect(() => { setTexto(""); }, [compondo]);
  const lista = dados.comentarios.filter((c) => verResolvidos || !c.resolvido);
  const resolvidos = dados.comentarios.filter((c) => c.resolvido).length;
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (foco == null) return;
    caixa.current?.querySelector(`[data-comentario="${foco}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [foco]);

  const salvar = async () => {
    if (!compondo || !texto.trim()) return;
    const r = await mexer("criar", { ...compondo, comentario: texto });
    if (r) aoCancelar();
  };

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

      {compondo && (
        <div className="cm-cartao cm-novo">
          <blockquote className="cm-trecho">{compondo.trecho}</blockquote>
          <textarea autoFocus className="campo" rows={3} placeholder="Seu comentário (Ctrl+Enter salva)" value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar(); }
              if (e.key === "Escape") { e.preventDefault(); aoCancelar(); }
            }} />
          <div className="cm-acoes">
            <button className="btn" onClick={aoCancelar}>Cancelar</button>
            <button className="btn primario" disabled={!texto.trim()} onClick={salvar}>Comentar</button>
          </div>
        </div>
      )}

      {!compondo && dados.comentarios.length === 0 && (
        <div className="cm-vazio">Selecione um trecho do texto e clique em <b>💬 Comentar</b>. Depois diga ao agente que comentou: ele lê, ajusta e responde aqui.</div>
      )}

      {lista.map((c) => (
        <div key={c.id} data-comentario={c.id} className={`cm-cartao${c.resolvido ? " resolvido" : ""}${foco === c.id ? " foco" : ""}`} onClick={() => aoIr(c.id)}>
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
