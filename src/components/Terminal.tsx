import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Bot, ChevronDown, SquareTerminal } from "lucide-react";
import { Popover, usePopover } from "./Popover";
import { BASE } from "../api";
import { abrir } from "../ui";
import { bate } from "../atalhos";

interface Aba {
  id: number;
  titulo: string;
  cwd?: string;
  programa?: string;
  shell?: string;
}

interface Programa {
  id: string;
  nome: string;
  comando: string;
  instalado: boolean;
}

const WS = BASE.replace(/^http/, "ws");

function cor(nome: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${nome}`).trim() || undefined;
}

let proximaSessao = Date.now() % 1_000_000;
/** sessões abertas nesta execução do app; as outras voltaram do workspace guardado e estão paradas */
const vivas = new Set<number>();

/** Abre um terminal (o shell, ou um agente) numa janela ao lado. */
export function abrirTerminal(cwd?: string, programa?: string, titulo?: string, shell?: string) {
  const sessao = proximaSessao++;
  vivas.add(sessao);
  abrir({ v: "terminal", sessao, cwd, programa, shell, titulo: titulo ?? nomePasta(cwd) ?? "terminal" }, true);
}

/** Botão de terminal, como no VS Code: clique abre o shell padrão; a setinha escolhe o tipo (shells e agentes). */
export function BotaoTerminal() {
  const pop = usePopover();
  const [d, setD] = useState<{ shells: { id: string; nome: string }[]; agentes: Programa[] } | null>(null);
  useEffect(() => {
    if (pop.ancora) fetch(`${BASE}/terminal/programas`).then((r) => r.json()).then(setD).catch(() => {});
  }, [pop.ancora]);
  return (
    <span className="botao-terminal">
      <button className="btn-icone" title="Novo terminal (Ctrl+`)" onClick={() => abrirTerminal()}><SquareTerminal size={15} /></button>
      <button className="btn-icone seta" title="Escolher o tipo de terminal" onClick={pop.abrir}><ChevronDown size={12} /></button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={250}>
          <div className="menu-rotulo">Terminal</div>
          {(d?.shells ?? []).map((s) => (
            <button key={s.id} className="menu-item" onClick={() => { abrirTerminal(undefined, undefined, s.nome, s.id); pop.fechar(); }}>
              <SquareTerminal size={14} /> {s.nome}
            </button>
          ))}
          <div className="menu-rotulo">Agentes</div>
          {(d?.agentes ?? []).map((a) => (
            <button key={a.id} className="menu-item" onClick={() => { abrirTerminal(undefined, a.id, a.nome); pop.fechar(); }}>
              <Bot size={14} /> {a.nome}
            </button>
          ))}
          {d && d.agentes.length === 0 && (
            <div className="menu-rotulo" style={{ textTransform: "none", letterSpacing: 0 }}>
              Nenhum agente ligado como Terminal. Ligue em Configurações → Integrações (precisa do MCP instalado).
            </div>
          )}
        </Popover>
      )}
    </span>
  );
}

/** Conteúdo de uma janela de terminal. A sessão vive enquanto a janela existir (trocar de aba ou de modo não mata). */
export function TerminalJanela({ sessao, cwd, programa, shell, visivel }: { sessao: number; cwd?: string; programa?: string; shell?: string; visivel: boolean }) {
  const [, setN] = useState(0);
  if (!vivas.has(sessao)) {
    return (
      <div className="janela-terminal parado">
        <div>
          <SquareTerminal size={22} />
          <p>Terminal parado: o app foi fechado{programa ? " (o agente também parou)" : ""}.</p>
          {cwd && <p className="dica-inline">{cwd}</p>}
          <button className="btn primario" onClick={() => { vivas.add(sessao); setN((n) => n + 1); }}>Reabrir {programa ? "o agente" : "o terminal"}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="janela-terminal">
      <TerminalXterm aba={{ id: sessao, titulo: "", cwd, programa, shell }} visivel={visivel} aoSair={() => {}} />
    </div>
  );
}

/**
 * Escolha do agente (pedido "agente" vindo do menu de pasta ou do item) e o atalho Ctrl+`.
 * Cada escolha abre uma janela de terminal no painel de trabalho.
 */
export function EscolherAgente() {
  const [escolher, setEscolher] = useState<{ cwd?: string; titulo?: string } | null>(null);
  const [programas, setProgramas] = useState<Programa[]>([]);

  useEffect(() => {
    fetch(`${BASE}/terminal/programas`).then((r) => r.json()).then((d) => setProgramas(d.agentes)).catch(() => {});
  }, [escolher]);

  const rotulo = (programa: string, titulo?: string) => {
    const p = programas.find((x) => x.id === programa);
    return `${p?.nome ?? programa}${titulo ? ` · ${titulo}` : ""}`;
  };

  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ cwd?: string; programa?: string; titulo?: string }>).detail;
      if (d.programa === "agente") setEscolher({ cwd: d.cwd, titulo: d.titulo });
      else abrirTerminal(d.cwd, d.programa, d.programa ? rotulo(d.programa, d.titulo) : d.titulo);
    };
    const tecla = (e: KeyboardEvent) => {
      if (bate("terminal", e)) {
        e.preventDefault();
        abrirTerminal();
      }
    };
    window.addEventListener("atelier:terminal", f);
    window.addEventListener("keydown", tecla);
    return () => { window.removeEventListener("atelier:terminal", f); window.removeEventListener("keydown", tecla); };
  }, [programas]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!escolher) return null;
  return (
    <div className="modal-fundo topo" onMouseDown={(e) => e.target === e.currentTarget && setEscolher(null)}>
      <div className="busca-rapida" style={{ width: 420 }}>
        <div className="br-campo"><Bot size={17} /> <span style={{ flex: 1, color: "var(--texto)" }}>Abrir qual agente{escolher.titulo ? ` em ${escolher.titulo}` : ""}?</span></div>
        <div className="br-lista">
          {programas.map((p) => (
            <button
              key={p.id}
              className="br-item"
              disabled={!p.instalado}
              title={p.instalado ? p.comando : `${p.comando} não está instalado nesta máquina`}
              onClick={() => { abrirTerminal(escolher.cwd, p.id, rotulo(p.id, escolher.titulo)); setEscolher(null); }}
            >
              <Bot size={15} />
              <span className="br-rotulo">{p.nome}</span>
              <span className="br-detalhe">{p.instalado ? p.comando : "não instalado"}</span>
            </button>
          ))}
          {programas.length === 0 && (
            <div className="br-vazio">Nenhum agente ligado como Terminal. Ligue em Configurações → Integrações (precisa do MCP do atelier instalado).</div>
          )}
          <button className="br-item" onClick={() => { abrirTerminal(escolher.cwd, undefined, escolher.titulo); setEscolher(null); }}>
            <SquareTerminal size={15} /> <span className="br-rotulo">Só o terminal</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function nomePasta(cwd?: string) {
  return cwd?.split(/[\\/]/).filter(Boolean).pop();
}

function TerminalXterm({ aba, visivel }: { aba: Aba; visivel: boolean; aoSair: () => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const ajustar = useRef<() => void>(() => {});
  // o xterm só nasce quando a aba aparece pela primeira vez (criado escondido, sem tamanho, ele quebra)
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    if (visivel && !pronto) requestAnimationFrame(() => setPronto(true));
  }, [visivel, pronto]);

  useEffect(() => {
    if (!pronto || !caixa.current) return;
    let morto = false;
    const term = new XTerm({
      fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      theme: {
        background: cor("bg-fundo"),
        foreground: cor("texto"),
        cursor: cor("acento"),
        selectionBackground: cor("acento-suave"),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(caixa.current!);
    try { fit.fit(); } catch { /* ainda sem tamanho */ }

    const q = new URLSearchParams({ cols: String(term.cols), rows: String(term.rows) });
    if (aba.cwd) q.set("cwd", aba.cwd);
    if (aba.programa) q.set("programa", aba.programa);
    if (aba.shell) q.set("shell", aba.shell);
    q.set("sessao", String(aba.id));
    const ws = new WebSocket(`${WS}/terminal?${q}`);
    ws.binaryType = "arraybuffer";
    ws.onmessage = (ev) => !morto && term.write(typeof ev.data === "string" ? ev.data : new Uint8Array(ev.data));
    ws.onclose = () => !morto && term.write("\r\n\x1b[2m[sessão encerrada]\x1b[0m\r\n");
    const dados = term.onData((d) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: "i", d })));

    // Ctrl+V cola, Ctrl+C copia quando há seleção (senão manda o Ctrl+C para o programa)
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      if (e.ctrlKey && e.key === "c" && term.hasSelection()) { navigator.clipboard.writeText(term.getSelection()); return false; }
      if (e.ctrlKey && e.key === "v") { navigator.clipboard.readText().then((t) => ws.send(JSON.stringify({ t: "i", d: t }))); return false; }
      if (bate("terminal", e)) return false;
      return true;
    });

    ajustar.current = () => {
      if (morto || !caixa.current?.offsetHeight) return;
      try {
        fit.fit();
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "r", c: term.cols, l: term.rows }));
      } catch { /* ignore */ }
    };
    const obs = new ResizeObserver(() => ajustar.current());
    obs.observe(caixa.current!);
    ws.onopen = () => ajustar.current();

    return () => {
      morto = true;
      obs.disconnect();
      dados.dispose();
      ws.close();
      // dá um quadro para o xterm terminar o que estava desenhando antes de sumir
      requestAnimationFrame(() => { try { term.dispose(); } catch { /* já foi */ } });
    };
  }, [aba.id, pronto]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (visivel) queueMicrotask(() => ajustar.current());
  }, [visivel]);

  return <div className="pt-term" ref={caixa} style={{ display: visivel ? "block" : "none" }} />;
}
