import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { BASE } from "../api";
import { bate, doPainel } from "../atalhos";

// O terminal em si (xterm ligado ao processo pelo WebSocket). Fica num arquivo à parte para ser carregado só quando
// o primeiro terminal abre (ver TerminalJanela em Terminal.tsx).

export interface Aba {
  id: number;
  titulo: string;
  cwd?: string;
  programa?: string;
  shell?: string;
}

const WS = BASE.replace(/^http/, "ws");

function cor(nome: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${nome}`).trim() || undefined;
}

export function TerminalXterm({ aba, visivel }: { aba: Aba; visivel: boolean; aoSair: () => void }) {
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
      // false: o xterm não trata a tecla e ela sobe até o app (novo terminal, andar na fita...)
      if (bate("terminal", e) || doPainel(e)) return false;
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
