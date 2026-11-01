import { useEffect, useRef, useState } from "react";
import {
  ChevronDown, Cpu, GalleryHorizontalEnd, LayoutDashboard, LayoutPanelLeft, MemoryStick, PanelTop, Power, Trash2,
} from "lucide-react";
import { rotaDe } from "../painel";
import { BASE } from "../api";
import { GERAL, sessoesDe, Workspaces } from "../workspaces";
import { Popover, usePopover } from "./Popover";

/** Pede para abrir o workspace de um item (ou o "Geral", sem id). */
export function abrirWorkspace(item?: { id: number; titulo: string; icone?: string }) {
  window.dispatchEvent(new CustomEvent("atelier:workspace", { detail: item ?? null }));
}

const mb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`);

/** Na barra de título: o workspace atual; o menu troca, fecha (para os terminais) ou esquece. */
export function SeletorWorkspace({ ws, trocar, fechar, esquecer }: {
  ws: Workspaces;
  trocar: (chave: string) => void;
  fechar: (chave: string) => void;
  esquecer: (chave: string) => void;
}) {
  const pop = usePopover();
  const info = ws.info[ws.ativo] ?? { titulo: "?" };
  const chaves = Object.keys(ws.estados).sort((a, b) => (a === GERAL ? -1 : b === GERAL ? 1 : (ws.info[a]?.titulo ?? "").localeCompare(ws.info[b]?.titulo ?? "")));
  return (
    <>
      <button className="bt-btn seletor-ws" title="Workspace (Ctrl+Alt+PgUp / PgDn troca entre os abertos)" onClick={pop.abrir}>
        <LayoutDashboard size={14} />
        <span className="ws-nome">{info.icone ? `${info.icone} ` : ""}{info.titulo}</span>
        {ws.abertos.length > 1 && <span className="ws-conta">{ws.abertos.length}</span>}
        <ChevronDown size={12} />
      </button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={320}>
          <div className="menu-rotulo">Workspaces</div>
          {chaves.map((k) => {
            const i = ws.info[k] ?? { titulo: k };
            const aberto = ws.abertos.includes(k);
            const janelas = ws.estados[k].metades.reduce((n, m) => n + m.janelas.length, 0);
            return (
              <div key={k} className={`menu-item ws-linha${k === ws.ativo ? " atual" : ""}`} onClick={() => { trocar(k); pop.fechar(); }}>
                <span className={`ws-ponto${aberto ? " vivo" : ""}`} title={aberto ? "Aberto (terminais rodando)" : "Fechado (as janelas voltam ao abrir)"} />
                <span className="ws-titulo">{i.icone ? `${i.icone} ` : ""}{i.titulo}</span>
                <span className="dir" style={{ fontSize: 11 }}>{janelas} {janelas === 1 ? "janela" : "janelas"}</span>
                {aberto && k !== ws.ativo && (
                  <button className="btn-icone mini" title="Fechar (para os terminais; as janelas ficam guardadas)" onClick={(e) => { e.stopPropagation(); fechar(k); }}><Power size={12} /></button>
                )}
                {k !== GERAL && (
                  <button className="btn-icone mini" title="Esquecer (some da lista; o workspace do item volta vazio)" onClick={(e) => { e.stopPropagation(); esquecer(k); }}><Trash2 size={12} /></button>
                )}
              </div>
            );
          })}
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => { pop.fechar(); verWorkspaces(); }}>
            <LayoutDashboard size={14} /> Ver todos <span className="dir"><kbd>Ctrl Shift O</kbd></span>
          </button>
          <div className="menu-rotulo" style={{ textTransform: "none", letterSpacing: 0 }}>Todo item tem o seu: na página do item, “Workspace”.</div>
        </Popover>
      )}
    </>
  );
}

interface Medida {
  ram_maquina: number;
  ram: number;
  cpu: number;
  nucleo: number;
  interface: number;
  sessoes: Record<string, { ram: number; cpu: number }>;
}

/** Barra de status: memória (principal) e CPU do atelier; o detalhe mostra quanto cada workspace gasta. */
export function BarraStatus({ ws }: { ws: Workspaces }) {
  const [m, setM] = useState<Medida | null>(null);
  const pop = usePopover();
  useEffect(() => {
    let vivo = true;
    const medir = () => fetch(`${BASE}/sistema`).then((r) => r.json()).then((d) => vivo && !d.erro && setM(d)).catch(() => {});
    medir();
    const t = window.setInterval(medir, 3000);
    return () => { vivo = false; window.clearInterval(t); };
  }, []);
  if (!m) return <footer className="barra-status" />;

  const pct = Math.min(100, (m.ram / m.ram_maquina) * 100);
  const porWs = ws.abertos.map((k) => {
    const ss = sessoesDe(ws.estados[k]).map((s) => ({ ...s, ...(m.sessoes[String(s.sessao)] ?? { ram: 0, cpu: 0 }) }));
    return { k, info: ws.info[k] ?? { titulo: k }, ram: ss.reduce((n, s) => n + s.ram, 0), cpu: ss.reduce((n, s) => n + s.cpu, 0), ss };
  });
  const terminais = porWs.reduce((n, w) => n + w.ram, 0);
  const resto = Math.max(0, m.ram - terminais - m.interface - m.nucleo);

  return (
    <footer className="barra-status">
      <span className="bs-ws">{ws.info[ws.ativo]?.titulo}</span>
      <span style={{ flex: 1 }} />
      <button className="bs-medida" onClick={pop.abrir} title={`Memória: ${mb(m.ram)} de ${mb(m.ram_maquina)} da máquina · CPU ${m.cpu.toFixed(0)}% (clique para ver por workspace)`}>
        <MemoryStick size={12} />
        <span className="bs-barra"><span style={{ width: `${Math.max(2, pct)}%` }} className={pct > 25 ? "alto" : ""} /></span>
        {mb(m.ram)}
        <Cpu size={12} style={{ marginLeft: 8 }} />
        {m.cpu.toFixed(0)}%
      </button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={340}>
          <div className="menu-rotulo">Memória do atelier: {mb(m.ram)} ({pct.toFixed(1)}% da máquina) · CPU {m.cpu.toFixed(0)}%</div>
          {porWs.map((w) => (
            <div key={w.k} className="bs-grupo">
              <div className="bs-linha forte">
                <span>{w.info.icone ? `${w.info.icone} ` : ""}{w.info.titulo}{w.k === ws.ativo ? " (atual)" : ""}</span>
                <span>{mb(w.ram)} · {w.cpu.toFixed(0)}%</span>
              </div>
              {w.ss.map((s) => (
                <div key={s.sessao} className="bs-linha"><span>{s.titulo}</span><span>{mb(s.ram)}</span></div>
              ))}
              {w.ss.length === 0 && <div className="bs-linha"><span className="vazio">sem terminais nem agentes</span><span /></div>}
            </div>
          ))}
          <div className="bs-grupo">
            <div className="bs-linha forte"><span>Interface (todas as janelas)</span><span>{mb(m.interface)}</span></div>
            <div className="bs-linha forte"><span>Núcleo (banco, API, MCP)</span><span>{mb(m.nucleo + resto)}</span></div>
          </div>
          <div className="menu-rotulo" style={{ textTransform: "none", letterSpacing: 0 }}>
            Terminais e agentes são contados por workspace. A interface é uma só para todos. Fechar um workspace (no seletor lá em cima) para os terminais dele.
          </div>
        </Popover>
      )}
    </footer>
  );
}


/** Abre a visão geral dos workspaces (Ctrl+Shift+O). */
export function verWorkspaces() {
  window.dispatchEvent(new Event("atelier:ver-workspaces"));
}

const ICONE_MODO: Record<string, React.ReactNode> = {
  abas: <PanelTop size={12} />,
  tile: <LayoutPanelLeft size={12} />,
  fita: <GalleryHorizontalEnd size={12} />,
};

/**
 * Visão geral (como o overview do Niri ou do Hyprland): um cartão por workspace, com o item dele, memória e CPU dos
 * terminais e agentes, e um esboço das janelas abertas. Setas escolhem, Enter vai, Esc fecha; digitar filtra.
 */
export function VisaoGeralWorkspaces({ ws, aoEscolher, aoFechar, fecharWs }: {
  ws: Workspaces;
  aoEscolher: (chave: string) => void;
  aoFechar: () => void;
  fecharWs: (chave: string) => void;
}) {
  const [m, setM] = useState<Medida | null>(null);
  const [busca, setBusca] = useState("");
  // os abertos primeiro (o atual na frente), depois os guardados
  const ordem = [
    ...ws.abertos,
    ...Object.keys(ws.estados).filter((k) => !ws.abertos.includes(k)).sort((a, b) => (ws.info[a]?.titulo ?? "").localeCompare(ws.info[b]?.titulo ?? "")),
  ].filter((k) => ws.estados[k] && (ws.info[k]?.titulo ?? k).toLowerCase().includes(busca.trim().toLowerCase()));
  const [sel, setSel] = useState(() => Math.max(0, ordem.indexOf(ws.ativo)));
  const grade = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    const medir = () => fetch(`${BASE}/sistema`).then((r) => r.json()).then((d) => vivo && !d.erro && setM(d)).catch(() => {});
    medir();
    const t = window.setInterval(medir, 2000);
    return () => { vivo = false; window.clearInterval(t); };
  }, []);
  useEffect(() => setSel((s) => Math.min(s, Math.max(0, ordem.length - 1))), [ordem.length]);
  useEffect(() => { grade.current?.querySelector(".ws-cartao.sel")?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const colunas = () => {
    const el = grade.current?.firstElementChild as HTMLElement | null;
    return el && grade.current ? Math.max(1, Math.round(grade.current.clientWidth / (el.offsetWidth + 14))) : 3;
  };
  const tecla = (e: React.KeyboardEvent) => {
    const n = ordem.length;
    if (e.key === "Escape") { e.preventDefault(); aoFechar(); }
    if (!n) return;
    if (e.key === "ArrowRight") { e.preventDefault(); setSel((s) => (s + 1) % n); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setSel((s) => (s - 1 + n) % n); }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(n - 1, s + colunas())); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - colunas())); }
    if (e.key === "Enter") { e.preventDefault(); aoEscolher(ordem[sel]); }
  };

  return (
    <div className="ws-geral" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()} onKeyDown={tecla}>
      <div className="ws-geral-topo">
        <LayoutDashboard size={18} />
        <strong>Workspaces</strong>
        <input autoFocus className="campo" placeholder="Filtrar pelo nome do item…" value={busca} onChange={(e) => { setBusca(e.target.value); setSel(0); }} />
        {m && <span className="dica-inline">atelier: {mb(m.ram)} · CPU {m.cpu.toFixed(0)}%</span>}
        <span style={{ flex: 1 }} />
        <span className="dica-inline">← → ↑ ↓ escolhe · Enter vai · Esc fecha</span>
      </div>
      <div className="ws-grade" ref={grade}>
        {ordem.map((k, i) => {
          const info = ws.info[k] ?? { titulo: k };
          const e = ws.estados[k];
          const aberto = ws.abertos.includes(k);
          const ss = sessoesDe(e);
          const ram = ss.reduce((n, s) => n + (m?.sessoes[String(s.sessao)]?.ram ?? 0), 0);
          const cpu = ss.reduce((n, s) => n + (m?.sessoes[String(s.sessao)]?.cpu ?? 0), 0);
          const janelas = e.metades.reduce((n, x) => n + x.janelas.length, 0);
          return (
            <div
              key={k}
              className={`ws-cartao${i === sel ? " sel" : ""}${k === ws.ativo ? " atual" : ""}${aberto ? "" : " guardado"}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => aoEscolher(k)}
            >
              <div className="ws-cartao-cabeca">
                <span className="ws-cartao-icone">{info.icone ?? (k === GERAL ? "🏠" : "📄")}</span>
                <span className="ws-cartao-titulo">{info.titulo}</span>
                {aberto && k !== ws.ativo && (
                  <button className="btn-icone mini" title="Fechar (para os terminais; as janelas ficam guardadas)" onClick={(ev) => { ev.stopPropagation(); fecharWs(k); }}><Power size={12} /></button>
                )}
              </div>
              {/* esboço das metades e das janelas */}
              <div className="ws-esboco">
                {e.metades.map((mt, mi) => (
                  <div key={mi} className="ws-metade">
                    <div className="ws-modo">{ICONE_MODO[mt.modo]}</div>
                    {mt.janelas.slice(0, 6).map((j) => {
                      const r = rotaDe(j);
                      const s = r.v === "terminal" ? m?.sessoes[String(r.sessao)] : undefined;
                      return (
                        <div key={j.id} className={`ws-janela${j.id === mt.ativa ? " ativa" : ""}`}>
                          <span className="ws-janela-icone">{r.v === "terminal" ? (r.programa ? "🤖" : "›_") : r.v === "arquivos" ? "📁" : r.v === "pastas" ? "🗂️" : j.icone ?? "·"}</span>
                          <span className="ws-janela-titulo">{j.titulo ?? "…"}</span>
                          {s && <span className="ws-janela-ram">{mb(s.ram)}</span>}
                        </div>
                      );
                    })}
                    {mt.janelas.length > 6 && <div className="ws-janela mais">+{mt.janelas.length - 6}</div>}
                    {mt.janelas.length === 0 && <div className="ws-janela vazia">vazio</div>}
                  </div>
                ))}
              </div>
              <div className="ws-cartao-pe">
                <span className={`ws-ponto${aberto ? " vivo" : ""}`} />
                <span>{aberto ? (k === ws.ativo ? "atual" : "aberto") : "guardado"}</span>
                <span>· {janelas} {janelas === 1 ? "janela" : "janelas"}</span>
                {ss.length > 0 && <span>· {ss.length} {ss.length === 1 ? "terminal" : "terminais"}</span>}
                <span style={{ flex: 1 }} />
                {aberto && ss.length > 0 && (
                  <span className="ws-uso"><MemoryStick size={11} /> {mb(ram)} <Cpu size={11} /> {cpu.toFixed(0)}%</span>
                )}
              </div>
            </div>
          );
        })}
        {ordem.length === 0 && <div className="vazio-grande">Nenhum workspace com esse nome.</div>}
      </div>
    </div>
  );
}
