import { useEffect, useRef, useState } from "react";
import { Terminal as XTerm, type IUnicodeVersionProvider } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { BASE } from "../api";
import { bate, doPainel } from "../atalhos";
import { atender, estadoDaSessao, marcarAgente, sessaoEmFoco } from "../agentes";
import { BANCADA_DA_JANELA } from "../janela";

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

/** Larguras como o ConPTY do Windows conta. Medido no próprio ConPTY (Windows 11, 2026-11-18): tudo de U+2000 a
 *  U+2BFF (✅ ✨ ⚡ ❌ ⭐ ⏺ setas, símbolos) ocupa 1 coluna, e só os emojis de fora do plano básico (🤖 📁) ocupam 2.
 *  O Unicode 11 conta ✅ e cia. como 2: o xterm ficava uma coluna adiantado em toda linha com um deles, e como o
 *  ConPTY redesenha pelo que ele acha, aparecia letra solta na primeira coluna e "›" no fim da linha de cima até
 *  redimensionar. Fora do Windows fica o Unicode 11 puro. */
function usarLargurasDoConpty(term: XTerm) {
  // o addon só faz unicode.register(provedor do Unicode 11): ativado num objeto nosso, o provedor fica de base
  let u11: IUnicodeVersionProvider | undefined;
  new Unicode11Addon().activate({ unicode: { register: (p: IUnicodeVersionProvider) => { u11 = p; } } } as unknown as XTerm);
  term.loadAddon(new Unicode11Addon());
  if (!u11 || !navigator.userAgent.includes("Windows")) { term.unicode.activeVersion = "11"; return; }
  const base = u11;
  const estreito = (cp: number) => cp >= 0x2000 && cp <= 0x2bff;
  term.unicode.register({
    version: "conpty",
    wcwidth: (cp) => (estreito(cp) && base.wcwidth(cp) === 2 ? 1 : base.wcwidth(cp)),
    charProperties: (cp, antes) => {
      const v = base.charProperties(cp, antes);
      // bits 1-2 são a largura (createPropertyValue do xterm): 2 vira 1
      return estreito(cp) && ((v >> 1) & 3) === 2 ? (v & ~6) | (1 << 1) : v;
    },
  });
  term.unicode.activeVersion = "conpty";
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
      // do outro lado está o ConPTY do Windows: sem isto, ao ganhar linhas o xterm puxa o histórico para a tela e o
      // ConPTY acha que elas estão vazias; o redesenho seguinte do agente sai com palavra comida e quebra fora do lugar
      ...(navigator.userAgent.includes("Windows") ? { windowsPty: { backend: "conpty" as const, buildNumber: 22000 } } : {}),
      theme: {
        background: cor("bg-fundo"),
        foreground: cor("texto"),
        cursor: cor("acento"),
        selectionBackground: cor("acento-suave"),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    // larguras: Unicode 11 (emojis como 2 colunas), com o ajuste do ConPTY (ver usarLargurasDoConpty)
    usarLargurasDoConpty(term);
    term.open(caixa.current!);
    try { fit.fit(); } catch { /* ainda sem tamanho */ }
    // a fonte pode chegar depois do open: mede de novo a célula e redesenha
    document.fonts?.ready.then(() => {
      if (morto) return;
      term.options.fontFamily = term.options.fontFamily + " ";
      ajustar.current();
    });

    const q = new URLSearchParams({ cols: String(term.cols), rows: String(term.rows) });
    if (aba.cwd) q.set("cwd", aba.cwd);
    if (aba.programa) q.set("programa", aba.programa);
    if (aba.shell) q.set("shell", aba.shell);
    q.set("sessao", String(aba.id));
    if (BANCADA_DA_JANELA) q.set("bancada", BANCADA_DA_JANELA);
    const ws = new WebSocket(`${WS}/terminal?${q}`);
    ws.binaryType = "arraybuffer";
    ws.onmessage = (ev) => !morto && term.write(typeof ev.data === "string" ? ev.data : new Uint8Array(ev.data));
    ws.onclose = () => !morto && term.write("\r\n\x1b[2m[sessão encerrada]\x1b[0m\r\n");
    const dados = term.onData((d) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: "i", d })));

    // Ctrl+V: false deixa o navegador colar sozinho (o xterm recebe o "paste", com bracketed paste); antes o atalho
    // também lia a área de transferência e mandava, e colava duas vezes. Ctrl+C copia quando há seleção (senão manda
    // o Ctrl+C para o programa)
    // o sino do terminal (vários agentes tocam quando esperam você) acende o workspace; digitar responde
    // (com o cursor neste terminal você já está vendo: não entra na fila da barra de status)
    term.onBell(() => { marcarAgente(aba.id, "esperando"); if (sessaoEmFoco() === aba.id) atender([aba.id]); });
    term.onData(() => { if (estadoDaSessao(aba.id) === "esperando") marcarAgente(aba.id, "trabalhando"); });
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      if (e.ctrlKey && e.key === "c" && term.hasSelection()) { navigator.clipboard.writeText(term.getSelection()); return false; }
      if (e.ctrlKey && !e.shiftKey && e.key === "v") return false;
      // Shift+Enter: quebra de linha no Claude Code (ESC + Enter, como no VS Code do Paulo), em vez de enviar
      if (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey) { ws.send(JSON.stringify({ t: "i", d: "\x1b\r" })); return false; }
      // false: o xterm não trata a tecla e ela sobe até o app (novo terminal, andar na fita...)
      if (bate("terminal", e) || doPainel(e)) return false;
      return true;
    });

    // o tamanho só vai ao processo quando muda de verdade, e uma vez só depois que o arrastar/animar assenta: cada
    // resize faz o agente redesenhar a tela inteira, e uma rajada deles embaralhava o texto (palavra comida, linha
    // quebrada no canto errado)
    let enviado = "";
    let espera = 0;
    const mandarTamanho = () => {
      clearTimeout(espera);
      espera = window.setTimeout(() => {
        const t = `${term.cols}x${term.rows}`;
        if (morto || t === enviado || ws.readyState !== WebSocket.OPEN) return;
        enviado = t;
        ws.send(JSON.stringify({ t: "r", c: term.cols, l: term.rows }));
      }, 120);
    };
    ajustar.current = () => {
      if (morto || !caixa.current?.offsetHeight) return;
      try {
        const antes = `${term.cols}x${term.rows}`;
        fit.fit();
        if (`${term.cols}x${term.rows}` !== antes) term.refresh(0, term.rows - 1);
        mandarTamanho();
      } catch { /* ignore */ }
    };
    const obs = new ResizeObserver(() => ajustar.current());
    obs.observe(caixa.current!);
    ws.onopen = () => ajustar.current();

    return () => {
      morto = true;
      clearTimeout(espera);
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

  // pôr o foco no terminal é ir até o agente: sai da fila da barra de status na hora, sem precisar clicar na pílula
  return <div className="pt-term" ref={caixa} data-sessao={aba.id} onFocus={() => atender([aba.id])} style={{ display: visivel ? "block" : "none" }} />;
}
