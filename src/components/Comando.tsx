import { useEffect, useRef, useState } from "react";
import { Mic, RotateCcw, Sparkles, Square, X } from "lucide-react";
import { AgenteCli, api, Bancadas, Visao } from "../api";
import { bate, combinacao } from "../atalhos";
import { janelaAtiva, rotaDe } from "../painel";
import { abrir, avisar, guardar, ler, Rota } from "../ui";
import { BotaoDitado } from "./Ditado";
import * as W from "../workspaces";

/** Pedido que chega para a tela pelo websocket (do MCP ou do Comando). Veja ACOES_TELA em core/src/api.rs. */
export interface PedidoTela {
  acao: string;
  rota?: Rota;
  ao_lado?: boolean;
  metade?: number;
  texto?: string;
  codigo?: string;
  item?: { id: number; titulo: string };
  modo?: string;
  janela?: string;
  cwd?: string | null;
  programa?: string | null;
  shell?: string | null;
  titulo?: string | null;
  mostrar?: boolean;
  tema?: string;
  zoom?: number;
  secao?: string;
}

const LADOS = ["esquerda", "direita"];

function descreverRota(r: Rota): string {
  switch (r.v) {
    case "item": return `item (id ${r.id})`;
    case "visao": return `visão (id ${r.id})`;
    case "terminal": return r.programa ? `agente ${r.programa} no terminal` : "terminal";
    case "arquivos": return `arquivo/pasta ${r.arquivo ?? r.raiz}`;
    case "pastas": return `árvore da pasta ${r.raiz}`;
    default: return r.v;
  }
}

/** O que está na tela, em texto, para o agente saber onde o usuário está. */
export function descreverTela(ws: W.Workspaces, bancadas: Bancadas | null, visoes: Visao[] | null): string {
  const l: string[] = [];
  if (bancadas?.ativa) l.push(`Bancada aberta: ${bancadas.ativa.nome} (${bancadas.ativa.caminho}).`);
  const outras = bancadas?.bancadas.filter((b) => b.caminho !== bancadas.ativa?.caminho).map((b) => b.nome) ?? [];
  if (outras.length) l.push(`Outras bancadas: ${outras.join(", ")}.`);
  if (visoes?.length) l.push(`Visões no menu: ${visoes.map((v) => v.nome).join(", ")}.`);
  const nomeWs = (k: string) => (k === W.GERAL ? "o da bancada" : `o do item "${ws.info[k]?.titulo ?? k}"`);
  l.push(`Workspace ativo: ${nomeWs(ws.ativo)}. Abertos: ${ws.abertos.map(nomeWs).join("; ")}.`);
  const e = ws.estados[ws.ativo];
  if (e) {
    const ativa = janelaAtiva(e);
    l.push(`Painel: ${e.metades.length === 1 ? "uma metade só" : "dividido em esquerda e direita"}; foco na ${LADOS[e.foco] ?? "esquerda"}.`);
    e.metades.forEach((m, i) => {
      const js = m.janelas.map((j) => `${j.id === ativa?.id ? "[em foco] " : ""}"${j.titulo ?? "…"}" — ${descreverRota(rotaDe(j))}`);
      l.push(`Metade ${e.metades.length === 1 ? "única" : LADOS[i]} (modo ${m.modo}): ${js.length ? js.join(" · ") : "vazia"}.`);
    });
  }
  return l.join("\n");
}

interface Troca {
  pedido: string;
  resposta?: string;
  erro?: string;
  segundos?: number;
  agente?: string;
}

/**
 * Comando do app: o usuário escreve (ou dita, com Win+H) o que quer e um agente faz pelo MCP — trocar de bancada,
 * abrir itens, criar coisas, arrumar o painel. Não é de nenhuma bancada. A conversa fica guardada e as últimas trocas
 * vão junto, então dá para dizer "abre aquele" ou "agora muda o status dele".
 */
export function ComandoAgente({ descricao }: { descricao: string }) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [conversa, setConversa] = useState<Troca[]>(() => ler<Troca[]>("comando.conversa", []));
  const [agentes, setAgentes] = useState<AgenteCli[] | null>(null);
  const [agente, setAgente] = useState<string>(() => ler("comando.agente", ""));
  const [trabalhando, setTrabalhando] = useState<{ desde: number; ctl: AbortController } | null>(null);
  const [, setTique] = useState(0);
  const caixa = useRef<HTMLTextAreaElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const abertoRef = useRef(aberto);
  abertoRef.current = aberto;

  useEffect(() => guardar("comando.conversa", conversa.slice(-30)), [conversa]);
  useEffect(() => guardar("comando.agente", agente), [agente]);

  // botão da barra de título e o atalho
  useEffect(() => {
    const abrir = () => setAberto((a) => !a);
    const tecla = (e: KeyboardEvent) => {
      if (bate("comando", e)) { e.preventDefault(); setAberto((a) => !a); }
      else if (e.key === "Escape" && abertoRef.current) setAberto(false);
    };
    window.addEventListener("atelier:comando", abrir);
    window.addEventListener("keydown", tecla);
    return () => { window.removeEventListener("atelier:comando", abrir); window.removeEventListener("keydown", tecla); };
  }, []);

  const [pedidos, setPedidos] = useState<{ arquivo: string; abertos: number } | null>(null);
  useEffect(() => {
    if (!aberto) return;
    api.pedidos().then(setPedidos).catch(() => {});
    api.agentes().then((r) => {
      const l = r.agentes.filter((a) => a.comando);
      setAgentes(l);
      if (!l.some((a) => a.id === agente)) setAgente(l[0]?.id ?? "");
    }).catch(() => setAgentes([]));
    window.setTimeout(() => caixa.current?.focus(), 0);
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => fim.current?.scrollIntoView({ block: "end" }), [conversa, aberto, trabalhando]);
  useEffect(() => {
    if (!trabalhando) return;
    const t = window.setInterval(() => setTique((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [trabalhando]);

  // a caixa cresce com o texto (até um limite)
  useEffect(() => {
    const c = caixa.current;
    if (!c) return;
    c.style.height = "auto";
    c.style.height = `${Math.min(c.scrollHeight, 220)}px`;
  }, [texto, aberto]);

  const enviar = async () => {
    const pedido = texto.trim();
    if (!pedido || trabalhando || !agente) return;
    const nome = agentes?.find((a) => a.id === agente)?.nome ?? agente;
    const anteriores = conversa.filter((t) => t.resposta).slice(-6).map((t) => ({ pedido: t.pedido, resposta: t.resposta! }));
    setConversa((c) => [...c, { pedido, agente: nome }]);
    setTexto("");
    const ctl = new AbortController();
    setTrabalhando({ desde: Date.now(), ctl });
    const marcar = (d: Partial<Troca>) => setConversa((c) => c.map((t, i) => (i === c.length - 1 ? { ...t, ...d } : t)));
    try {
      const r = await api.comando({ agente, pedido, contexto: descricao, conversa: anteriores }, ctl.signal);
      const resposta = r.saida.trim() || "(o agente terminou sem dizer nada)";
      marcar({ resposta, segundos: r.segundos });
      if (!abertoRef.current) avisar(`${nome}: ${resposta.slice(0, 200)}`);
    } catch (e) {
      const erro = ctl.signal.aborted ? "Cancelado." : e instanceof Error ? e.message : String(e);
      marcar({ erro });
      if (!abertoRef.current && !ctl.signal.aborted) avisar(`O comando falhou: ${erro}`);
    } finally {
      setTrabalhando(null);
    }
  };

  const teclas = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); return; }
    // ↑ com a caixa vazia: traz o último pedido para editar e mandar de novo
    if (e.key === "ArrowUp" && !texto) {
      const ultimo = [...conversa].reverse().find((t) => t.pedido)?.pedido;
      if (ultimo) { e.preventDefault(); setTexto(ultimo); }
    }
  };

  if (!aberto) return null;
  const nomeAtalho = combinacao("comando");
  return (
    <div className="comando" role="dialog" aria-label="Comando para o agente">
      <div className="comando-cabeca">
        <Sparkles size={16} />
        <strong>Comando</strong>
        {agentes && agentes.length > 0 && (
          <select className="campo comando-agente" value={agente} onChange={(e) => setAgente(e.target.value)} title="Qual agente faz">
            {agentes.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        )}
        <span className="espaco" />
        {pedidos && pedidos.abertos > 0 && (
          <button
            className="btn comando-pedidos"
            title="O que os agentes não conseguiram fazer pelo atelier (vira lista de recursos)"
            onClick={() => { const a = pedidos.arquivo; abrir({ v: "arquivos", raiz: a.slice(0, Math.max(a.lastIndexOf("\\"), a.lastIndexOf("/"))), arquivo: a, titulo: "Pedidos ao atelier" }, true); setAberto(false); }}
          >
            {pedidos.abertos} {pedidos.abertos === 1 ? "pedido anotado" : "pedidos anotados"}
          </button>
        )}
        {conversa.length > 0 && !trabalhando && (
          <button className="btn-icone" title="Nova conversa (esquece as anteriores)" onClick={() => setConversa([])}><RotateCcw size={14} /></button>
        )}
        <button className="btn-icone" title={`Fechar (Esc ou ${nomeAtalho}); o agente continua trabalhando`} onClick={() => setAberto(false)}><X size={15} /></button>
      </div>

      {agentes && agentes.length === 0 ? (
        <div className="comando-vazio">
          <span>
            Nenhum agente ligado como <strong>Comando</strong>. Em Configurações → Integrações, instale o MCP num agente
            (Claude Code, Codex…) e marque “Comando”.
          </span>
          <button className="btn" onClick={() => { setAberto(false); window.dispatchEvent(new CustomEvent("atelier:config", { detail: "integracoes" })); }}>Abrir Integrações</button>
        </div>
      ) : (
        <>
          {conversa.length > 0 && (
            <div className="comando-conversa">
              {conversa.map((t, i) => (
                <div key={i} className="comando-troca">
                  <div className="comando-pedido">{t.pedido}</div>
                  {t.resposta && <div className="comando-resposta">{t.resposta}{t.segundos != null && <span className="comando-tempo"> · {t.agente} · {t.segundos} s</span>}</div>}
                  {t.erro && <div className="comando-resposta erro">{t.erro}</div>}
                </div>
              ))}
              {trabalhando && (
                <div className="comando-trabalhando">
                  <span className="pontinho" /> Trabalhando… {Math.round((Date.now() - trabalhando.desde) / 1000)} s
                  <button className="btn" onClick={() => trabalhando.ctl.abort()}><Square size={12} /> Parar</button>
                </div>
              )}
              <div ref={fim} />
            </div>
          )}
          <div className="comando-entrada">
            <textarea
              ref={caixa}
              className="campo"
              rows={1}
              value={texto}
              placeholder="Ex.: vai na bancada Firefly e cria um personagem chamado Kaylee, mecânica da nave…"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={teclas}
              disabled={!agente}
            />
            <BotaoDitado aoTexto={(t) => { setTexto((x) => (x.trim() ? `${x.trimEnd()} ${t}` : t)); caixa.current?.focus(); }} />
            <button className="btn primario" onClick={enviar} disabled={!texto.trim() || !!trabalhando || !agente}>Mandar</button>
          </div>
          <div className="comando-dica">
            Enter manda · Shift+Enter quebra a linha · ↑ edita o último pedido · <Mic size={11} /> o microfone dita (dá para editar antes de mandar)
          </div>
        </>
      )}
    </div>
  );
}
