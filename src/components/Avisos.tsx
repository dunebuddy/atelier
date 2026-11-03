// Pilha de toasts (no canto configurado), sininho com o histórico, Configurações → Notificações e os hooks dos agentes.
import { useEffect, useRef, useState } from "react";
import { Bell, Bot, CircleAlert, Info, Sparkles, Trash2, X } from "lucide-react";
import { BASE } from "../api";
import { abrir, falhou } from "../ui";
import { Popover, usePopover } from "./Popover";
import {
  apagarNotificacao, Assunto, ASSUNTOS, assuntosEscondidos, configuracao, esconderAssuntos, limparNotificacoes, marcarLida, marcarTodasLidas, mudarConfiguracao, Notificacao,
  notificacoes, notificar, Posicao, viraToast,
} from "../notificacoes";
import { EstadoAgente } from "../agentes";

/** O "desfazer" do toast que está na tela (o Ctrl+Z do app usa). */
let desfazerNaTela: (() => void) | null = null;
export function desfazerAgora(): boolean {
  if (!desfazerNaTela) return false;
  desfazerNaTela();
  return true;
}

function useNotificacoes() {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    window.addEventListener("atelier:notificacoes", f);
    return () => window.removeEventListener("atelier:notificacoes", f);
  }, []);
}

function Icone({ n }: { n: Notificacao }) {
  if (n.nivel === "erro") return <CircleAlert size={16} className="ca-icone" />;
  if (n.assunto === "agente") return <Bot size={16} className="ca-icone" />;
  if (n.assunto === "atualizacao") return <Sparkles size={16} className="ca-icone" />;
  return <Info size={16} className="ca-icone" />;
}

/** Os toasts, num canto só (o mesmo dos cartões de versão nova, que entram aqui por portal). */
export function PilhaDeAvisos() {
  useNotificacoes();
  const [toasts, setToasts] = useState<Notificacao[]>([]);
  const timers = useRef(new Map<number, number>());
  const c = configuracao();

  const fechar = (id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((l) => l.filter((x) => x.id !== id));
  };
  const agendar = (n: Notificacao) => {
    const cfg = configuracao();
    const temAcao = !!(n.desfazer || n.rota);
    if (temAcao && cfg.acaoFica) return;
    // erro fica um pouco mais
    const ms = (cfg.segundos + (n.nivel === "erro" ? 3 : 0)) * 1000;
    timers.current.set(n.id, window.setTimeout(() => fechar(n.id), ms));
  };

  useEffect(() => {
    // avisar()/falhou() do app chegam como evento e viram notificação
    const aviso = (e: Event) => {
      const d = (e as CustomEvent<{ msg: string; desfazer?: () => Promise<unknown> | void; erro?: boolean }>).detail;
      notificar({ msg: d.msg, nivel: d.erro ? "erro" : "info", assunto: "app", desfazer: d.desfazer });
    };
    const nova = (e: Event) => {
      const n = (e as CustomEvent<Notificacao>).detail;
      if (!viraToast(n)) return;
      setToasts((l) => [...l.filter((x) => x.id !== n.id), n].slice(-5));
      agendar(n);
    };
    window.addEventListener("atelier:aviso", aviso);
    window.addEventListener("atelier:notificacao", nova);
    return () => { window.removeEventListener("atelier:aviso", aviso); window.removeEventListener("atelier:notificacao", nova); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // o "desfazer" vale enquanto o toast dele está na tela
  const comDesfazer = [...toasts].reverse().find((t) => t.desfazer);
  desfazerNaTela = comDesfazer ? () => { comDesfazer.desfazer?.(); marcarLida(comDesfazer.id); fechar(comDesfazer.id); } : null;

  const agir = (n: Notificacao) => {
    marcarLida(n.id);
    if (n.rota) abrir(n.rota);
    fechar(n.id);
  };

  return (
    <div id="pilha-avisos" className={`pilha-avisos ${c.posicao}`}>
      {toasts.map((n) => (
        <div
          key={n.id}
          className={`cartao-aviso toast${n.nivel === "erro" ? " erro" : ""}`}
          role={n.nivel === "erro" ? "alert" : "status"}
          // mouse em cima segura o toast; saiu, volta a contar
          onMouseEnter={() => { window.clearTimeout(timers.current.get(n.id)); timers.current.delete(n.id); }}
          onMouseLeave={() => agendar(n)}
          onClick={() => agir(n)}
          title={n.rota ? "Clique para abrir" : "Clique para fechar"}
        >
          <div className="ca-cabeca">
            <Icone n={n} />
            <span className="ca-msg">{n.de ? <strong>{n.de}: </strong> : null}{n.msg}</span>
            <button className="btn-icone" title="Fechar (fica no sininho)" onClick={(e) => { e.stopPropagation(); fechar(n.id); }}><X size={14} /></button>
          </div>
          {n.desfazer && (
            <div className="ca-acoes">
              <button className="btn" onClick={(e) => { e.stopPropagation(); n.desfazer?.(); marcarLida(n.id); fechar(n.id); }}>Desfazer <kbd>Ctrl Z</kbd></button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function quando(t: number): string {
  const d = new Date(t);
  const hoje = new Date().toDateString() === d.toDateString();
  return hoje ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Sininho da barra de título: quantas não lidas e o histórico (apagar, agir, limpar). */
export function Sino() {
  useNotificacoes();
  const pop = usePopover();
  const todas = notificacoes();
  const escondidos = assuntosEscondidos();
  const visivel = (n: Notificacao) => !escondidos.includes(n.assunto);
  const lista = todas.filter(visivel);
  const naoLidas = lista.filter((n) => !n.lida).length;
  const alternar = (a: Assunto) => esconderAssuntos(escondidos.includes(a) ? escondidos.filter((x) => x !== a) : [...escondidos, a]);
  return (
    <>
      <button className="bt-btn sino" title={naoLidas ? `${naoLidas} notificações novas` : "Notificações"} onClick={(e) => { if (pop.ancora) marcarTodasLidas(); pop.abrir(e); }}>
        <Bell size={16} />
        {naoLidas > 0 && <span className="sino-conta">{naoLidas > 99 ? "99+" : naoLidas}</span>}
      </button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={() => { marcarTodasLidas(); pop.fechar(); }} largura={380}>
          <div className="menu-rotulo sino-topo">
            <span>Notificações</span>
            {lista.length > 0 && <button className="btn" onClick={() => { limparNotificacoes(visivel); pop.fechar(); }}>Limpar tudo</button>}
          </div>
          <div className="sino-filtro">
            <button className={escondidos.length === 0 ? "ativo" : ""} onClick={() => esconderAssuntos([])}>Todas <span>{todas.length}</span></button>
            {ASSUNTOS.map((a) => (
              <button key={a.id} className={escondidos.includes(a.id) ? "" : "ativo"} title={escondidos.includes(a.id) ? "Mostrar estas" : "Esconder estas"} onClick={() => alternar(a.id)}>
                {a.nome} <span>{todas.filter((n) => n.assunto === a.id).length}</span>
              </button>
            ))}
          </div>
          <div className="sino-lista">
            {lista.length === 0 && <div className="sino-vazio">{todas.length ? "Nada com este filtro." : "Nada por aqui."}</div>}
            {lista.map((n) => (
              <div key={n.id} className={`sino-item${n.lida ? "" : " nova"}${n.nivel === "erro" ? " erro" : ""}`}>
                <Icone n={n} />
                <div className="sino-texto" onClick={() => { if (n.rota) { abrir(n.rota); marcarLida(n.id); pop.fechar(); } }} style={n.rota ? { cursor: "pointer" } : undefined}>
                  <div>{n.de ? <strong>{n.de}: </strong> : null}{n.msg}</div>
                  <div className="sino-quando">{quando(n.quando)}</div>
                </div>
                {n.desfazer && <button className="btn" onClick={() => { n.desfazer?.(); apagarNotificacao(n.id); }}>Desfazer</button>}
                <button className="btn-icone mini" title="Apagar" onClick={() => apagarNotificacao(n.id)}><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

const POSICOES: { id: Posicao; nome: string }[] = [
  { id: "baixo-direita", nome: "Embaixo, à direita" },
  { id: "baixo-esquerda", nome: "Embaixo, à esquerda" },
  { id: "cima-direita", nome: "Em cima, à direita" },
  { id: "cima-esquerda", nome: "Em cima, à esquerda" },
];

/** Configurações → Notificações. */
export function SecaoNotificacoes() {
  useNotificacoes();
  const c = configuracao();
  return (
    <>
      <h3>Notificações</h3>
      <p className="dica">Todo aviso do app fica no sininho, lá em cima, até você apagar. Aqui você escolhe quais aparecem na tela, onde e por quanto tempo.</p>
      <div className="linha-config">
        <span>Onde aparecem</span>
        <select className="campo" value={c.posicao} onChange={(e) => mudarConfiguracao({ posicao: e.target.value as Posicao })}>
          {POSICOES.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
      </div>
      <div className="linha-config">
        <span>Tempo na tela (sem ação)</span>
        <select className="campo" value={c.segundos} onChange={(e) => mudarConfiguracao({ segundos: Number(e.target.value) })}>
          {[3, 5, 8, 12, 20].map((s) => <option key={s} value={s}>{s} segundos</option>)}
        </select>
      </div>
      <label className="linha-config"><span>Aviso com ação (desfazer, abrir) fica até eu mexer</span>
        <input type="checkbox" checked={c.acaoFica} onChange={(e) => mudarConfiguracao({ acaoFica: e.target.checked })} />
      </label>
      <label className="linha-config"><span>Não mostrar na tela, só guardar no sininho</span>
        <input type="checkbox" checked={c.soGuardar} onChange={(e) => mudarConfiguracao({ soGuardar: e.target.checked })} />
      </label>
      <div className="linha-config">
        <span>Mostrar na tela</span>
        <select className="campo" value={c.nivel} onChange={(e) => mudarConfiguracao({ nivel: e.target.value as "erro" | "aviso" | "tudo" })}>
          <option value="tudo">Tudo</option>
          <option value="aviso">Erros e avisos</option>
          <option value="erro">Só erros</option>
        </select>
      </div>
      <h4>Assuntos que aparecem na tela</h4>
      {([["app", "Avisos do app (salvo, copiado, desfazer)"], ["agente", "Agentes (terminou, esperando você, pedidos)"], ["atualizacao", "Versão nova e atualização"]] as const).map(([k, nome]) => (
        <label key={k} className="linha-config"><span>{nome}</span>
          <input type="checkbox" checked={c.assuntos[k]} onChange={(e) => mudarConfiguracao({ assuntos: { ...c.assuntos, [k]: e.target.checked } })} />
        </label>
      ))}
      <button className="btn" style={{ marginTop: 12 }} onClick={() => notificar({ msg: "Assim aparece uma notificação.", nivel: "info", assunto: "app" })}>Mostrar um exemplo</button>
    </>
  );
}

interface Hook { id: string; nome: string; instalado: boolean; arquivo: string; eventos: string; aviso?: string }

/** Configurações → Integrações: instalar os hooks que contam ao atelier quando o agente terminou ou espera você. */
export function SecaoHooks() {
  const [hooks, setHooks] = useState<Hook[] | null>(null);
  const carregar = () => fetch(`${BASE}/hooks`).then((r) => r.json()).then(setHooks).catch(() => setHooks([]));
  useEffect(() => { carregar(); }, []);
  const mudar = async (h: Hook) => {
    try {
      const r = await fetch(`${BASE}/hooks/${h.id}`, { method: h.instalado ? "DELETE" : "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro ?? "não deu");
      notificar({ msg: `${h.nome}: hooks ${h.instalado ? "tirados" : "instalados"} (${j.arquivo}). Vale para os agentes abertos daqui em diante.`, nivel: "info", assunto: "app" });
      carregar();
    } catch (e) {
      falhou(e);
    }
  };
  return (
    <>
      <h4>Status dos agentes (hooks)</h4>
      <p className="dica">
        Com os hooks, o próprio agente avisa quando começou, quando está esperando você e quando terminou: o workspace
        dele ganha a carinha colorida e o sininho avisa. O hook é o <code>atelier-mcp</code> que já está instalado; ele só
        age em terminais do atelier e manda só o evento (nunca a conversa). O arquivo do agente ganha backup antes.
      </p>
      {hooks?.map((h) => (
        <div key={h.id} className="linha-config">
          <span>{h.nome} <span className="dica" style={{ display: "inline" }}>· {h.eventos}{h.aviso ? ` · ${h.aviso}` : ""}</span></span>
          <button className={`btn${h.instalado ? "" : " primario"}`} disabled={!!h.aviso && !h.instalado} onClick={() => mudar(h)}>
            {h.instalado ? "Tirar hooks" : "Instalar hooks"}
          </button>
        </div>
      ))}
    </>
  );
}

const CORES: Record<EstadoAgente | "sem", string> = {
  esperando: "esperando", trabalhando: "trabalhando", terminou: "terminou", parado: "parado", sem: "sem-agente",
};
const DICAS: Record<EstadoAgente | "sem", string> = {
  esperando: "Um agente está esperando você", trabalhando: "Agente trabalhando", terminou: "Um agente terminou",
  parado: "Agente parado", sem: "Sem agente",
};

/** A carinha do agente de um workspace, na cor do status (esperando, trabalhando, terminou, parado, sem). */
export function CarinhaAgente({ estado, temAgente }: { estado: EstadoAgente | null; temAgente: boolean }) {
  const e = estado ?? (temAgente ? "parado" : "sem");
  return <span className={`carinha ${CORES[e]}`} title={DICAS[e]}><Bot size={13} /></span>;
}

/** Para a API do agente avisar pela tela (o caso do `nao_consigo`). */
export function notificarFalta(texto: string, agente?: string) {
  notificar({ msg: `não sabe fazer isto pelo atelier: “${texto}”. Ficou anotado nos pedidos.`, nivel: "aviso", assunto: "agente", de: agente ?? "Agente" });
}
