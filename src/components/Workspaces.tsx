import { IndicadorDitado } from "./Ditado";
import { useEffect, useRef, useState } from "react";
import {
  Archive, ArchiveRestore, ChevronDown, ChevronRight, Cpu, GalleryHorizontalEnd, HardDrive, LayoutDashboard, LayoutPanelLeft, MemoryStick, PanelTop, Pencil, Power, Trash2,
} from "lucide-react";
import { rotaDe } from "../painel";
import { api, BASE } from "../api";
import { GERAL, InfoWorkspace, itemDa, sessoesDe, workspaceDaSessao, Workspaces } from "../workspaces";
import { guardar, ler } from "../ui";
import { Popover, usePopover } from "./Popover";
import { Marca } from "./Marca";
import { CarinhaAgente } from "./Avisos";
import { Interruptor } from "./Automacao";
import { estadoDe, filaDeEspera } from "../agentes";

/** Pede para abrir o workspace de um item (ou o "Geral", sem id). */
/** O ícone do workspace: o da bancada (fixo, nunca some) é a marca do atelier; o de um documento, o ícone dele. */
function IconeWs({ k, icone }: { k: string; icone?: string }) {
  if (k === GERAL) return <span className="ws-icone"><Marca tamanho={13} /></span>;
  return icone ? <span className="ws-icone">{icone}</span> : null;
}

/** O nome do workspace, que vira campo ao renomear (Enter grava, Esc desiste; vazio volta ao título do documento). */
function NomeWs({ info, editando, aoGravar, aoSair, classe, children }: {
  info: InfoWorkspace;
  editando: boolean;
  aoGravar: (nome: string) => void;
  aoSair: () => void;
  classe: string;
  children?: React.ReactNode;
}) {
  if (!editando) {
    const dica = info.nome && info.doc && info.nome !== info.doc ? `${info.titulo}\n(documento: ${info.doc})` : info.titulo;
    return <span className={classe} title={dica}>{children}{info.titulo}</span>;
  }
  return (
    <input
      autoFocus
      className="campo ws-renomear"
      defaultValue={info.nome ?? info.titulo}
      placeholder={info.doc ?? "Nome do workspace"}
      title="Enter grava · Esc desiste · vazio volta ao nome do documento"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.target.select()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") { aoGravar(e.currentTarget.value); aoSair(); }
        if (e.key === "Escape") aoSair();
      }}
      onBlur={(e) => { aoGravar(e.target.value); aoSair(); }}
    />
  );
}

export function abrirWorkspace(item?: { id: number; titulo: string; icone?: string }) {
  window.dispatchEvent(new CustomEvent("atelier:workspace", { detail: item ?? null }));
}

/** Arquivar sozinho os workspaces parados (Configurações → Automação). Vale para todas as bancadas desta máquina. */
interface AutoArquivar { ativo: boolean; dias: number }
const lerAuto = (): AutoArquivar => {
  const v = ler<AutoArquivar | number>("workspaces.autoArquivar", { ativo: false, dias: 30 });
  return typeof v === "number" ? { ativo: v > 0, dias: v || 30 } : v;
};
/** Quantos dias parado até arquivar (0 = desligado). */
export const diasAutoArquivar = () => { const a = lerAuto(); return a.ativo ? a.dias : 0; };

export function DiasAutoArquivar() {
  const [a, setA] = useState(lerAuto);
  const mudar = (n: AutoArquivar) => { setA(n); guardar("workspaces.autoArquivar", n); window.dispatchEvent(new Event("atelier:auto-arquivar")); };
  return (
    <div className="auto-bloco">
      <div className="auto-cabeca">
        <Archive size={16} />
        <strong>Arquivar workspaces parados</strong>
        <Interruptor ligado={a.ativo} aoMudar={(v) => mudar({ ...a, ativo: v })} />
      </div>
      <p className="dica">
        Tira da lista de workspaces o que ficou fechado e sem ser aberto por muito tempo. As janelas ficam guardadas: ele
        vai para “Arquivados”, no fim da lista, e abrir de novo desarquiva. O da bancada e os abertos nunca são arquivados.
      </p>
      <div className={`auto-campos${a.ativo ? "" : " desligado"}`}>
        <label>Depois de <input type="number" min={1} value={a.dias} onChange={(e) => mudar({ ...a, dias: Math.max(1, Number(e.target.value) || 1) })} /> dias parado</label>
      </div>
    </div>
  );
}

const mb = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${Math.round(b / 1024 ** 2)} MB`);

/** Na barra de título: o workspace atual; o menu troca, fecha (para os terminais) ou esquece. */
/** Apagar (esquecer) um workspace desligado: pede confirmação ali mesmo, na linha (Sim / Não). */
function ApagarWs({ aoApagar }: { aoApagar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  if (!confirmando) {
    return (
      <button className="btn-icone mini" title="Apagar (some da lista; o workspace do documento volta vazio; o documento fica)"
        onClick={(e) => { e.stopPropagation(); setConfirmando(true); }}><Trash2 size={12} /></button>
    );
  }
  return (
    <span className="ws-confirma" onClick={(e) => e.stopPropagation()}>
      Apagar?
      <button className="btn mini ws-confirma-sim" autoFocus onClick={() => { setConfirmando(false); aoApagar(); }}>Sim</button>
      <button className="btn mini" onClick={() => setConfirmando(false)}>Não</button>
    </span>
  );
}

export function SeletorWorkspace({ ws, trocar, fechar, esquecer, renomear, arquivar, desarquivar }: {
  ws: Workspaces;
  trocar: (chave: string) => void;
  fechar: (chave: string) => void;
  esquecer: (chave: string) => void;
  renomear: (chave: string, nome: string) => void;
  arquivar: (chave: string) => void;
  desarquivar: (chave: string) => void;
}) {
  const pop = usePopover();
  const [editando, setEditando] = useState<string | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);
  const info = ws.info[ws.ativo] ?? { titulo: "?" };
  // status dos agentes: redesenha quando um hook avisa
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    window.addEventListener("atelier:agentes", f);
    return () => window.removeEventListener("atelier:agentes", f);
  }, []);
  const agentesDe = (k: string) => {
    const e = ws.estados[k];
    const ss = e ? sessoesDe(e) : [];
    return { estado: estadoDe(ss.map((s) => s.sessao)), temAgente: ss.some((s) => !!s.programa) };
  };
  // no botão: o mais importante entre todos os workspaces abertos
  const todos = ws.abertos.flatMap((k) => (ws.estados[k] ? sessoesDe(ws.estados[k]) : []));
  const geral = { estado: estadoDe(todos.map((s) => s.sessao)), temAgente: todos.some((s) => !!s.programa) };
  // os ativos (abertos) primeiro, o da bancada na frente; depois os fechados; os arquivados à parte, no fim
  const porNome = (a: string, b: string) => (a === GERAL ? -1 : b === GERAL ? 1 : (ws.info[a]?.titulo ?? "").localeCompare(ws.info[b]?.titulo ?? ""));
  const todas = Object.keys(ws.estados);
  const arquivados = todas.filter((k) => ws.info[k]?.arquivado).sort(porNome);
  const chaves = [
    ...todas.filter((k) => ws.abertos.includes(k) && !ws.info[k]?.arquivado).sort(porNome),
    ...todas.filter((k) => !ws.abertos.includes(k) && !ws.info[k]?.arquivado).sort(porNome),
  ];
  return (
    <>
      <button className="bt-btn seletor-ws" title="Workspace (Ctrl+Alt+PgUp / PgDn troca entre os abertos)" onClick={pop.abrir}>
        <LayoutDashboard size={14} />
        <span className="ws-nome" title={info.titulo}><IconeWs k={ws.ativo} icone={info.icone} />{info.titulo}</span>
        {(geral.temAgente || geral.estado) && <CarinhaAgente {...geral} />}
        {ws.abertos.length > 1 && <span className="ws-conta">{ws.abertos.length}</span>}
        <ChevronDown size={12} />
      </button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={480}>
          <div className="menu-rotulo">Workspaces</div>
          {chaves.map((k) => {
            const i = ws.info[k] ?? { titulo: k };
            const aberto = ws.abertos.includes(k);
            const janelas = ws.estados[k].metades.reduce((n, m) => n + m.janelas.length, 0);
            return (
              <div key={k} className={`menu-item ws-linha${k === ws.ativo ? " atual" : ""}`} onClick={() => { if (editando !== k) { trocar(k); pop.fechar(); } }}>
                <span className={`ws-ponto${aberto ? " vivo" : ""}`} title={aberto ? "Aberto (terminais rodando)" : "Fechado (as janelas voltam ao abrir)"} />
                <NomeWs info={i} editando={editando === k} aoGravar={(n) => renomear(k, n)} aoSair={() => setEditando(null)} classe="ws-titulo">
                  <IconeWs k={k} icone={i.icone} />
                </NomeWs>
                <button className="btn-icone mini ws-lapis" title="Renomear" onClick={(e) => { e.stopPropagation(); setEditando(k); }}><Pencil size={12} /></button>
                {aberto && <CarinhaAgente {...agentesDe(k)} />}
                <span className="dir" style={{ fontSize: 11 }}>{janelas} {janelas === 1 ? "janela" : "janelas"}</span>
                {/* ligado: só desligar (o atual vai para o da bancada; o da bancada, sendo o atual, não desliga).
                    desligado: arquivar ou apagar */}
                {aberto && !(k === GERAL && k === ws.ativo) && (
                  <button className="btn-icone mini" onClick={(e) => { e.stopPropagation(); fechar(k); }}
                    title={k === ws.ativo ? "Desligar (para os terminais; as janelas ficam guardadas) e ir para o workspace da bancada" : "Desligar (para os terminais; as janelas ficam guardadas)"}>
                    <Power size={12} />
                  </button>
                )}
                {!aberto && k !== GERAL && (
                  <button className="btn-icone mini" title="Arquivar (sai da lista; as janelas ficam guardadas)" onClick={(e) => { e.stopPropagation(); arquivar(k); }}><Archive size={12} /></button>
                )}
                {!aberto && k !== GERAL && <ApagarWs aoApagar={() => esquecer(k)} />}
              </div>
            );
          })}
          {arquivados.length > 0 && (
            <>
              <button className="menu-item ws-arquivados" onClick={() => setVerArquivados((v) => !v)}>
                {verArquivados ? <ChevronDown size={13} /> : <ChevronRight size={13} />} Arquivados ({arquivados.length})
              </button>
              {verArquivados && arquivados.map((k) => {
                const i = ws.info[k] ?? { titulo: k };
                return (
                  <div key={k} className="menu-item ws-linha arquivada" title="Clique para abrir (desarquiva)" onClick={() => { trocar(k); pop.fechar(); }}>
                    <span className="ws-ponto" />
                    <span className="ws-titulo"><IconeWs k={k} icone={i.icone} />{i.titulo}</span>
                    <span className="dir" style={{ fontSize: 11 }}>{i.arquivado ? `desde ${new Date(i.arquivado).toLocaleDateString("pt-BR")}` : ""}</span>
                    <button className="btn-icone mini" title="Desarquivar (volta para a lista, fechado)" onClick={(e) => { e.stopPropagation(); desarquivar(k); }}><ArchiveRestore size={12} /></button>
                    <ApagarWs aoApagar={() => esquecer(k)} />
                  </div>
                );
              })}
            </>
          )}
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => { pop.fechar(); verWorkspaces(); }}>
            <LayoutDashboard size={14} /> Ver todos <span className="dir"><kbd>Ctrl Shift O</kbd></span>
          </button>
          <div className="menu-rotulo" style={{ textTransform: "none", letterSpacing: 0 }}>Todo documento tem o seu: na página do documento, “Workspace”.</div>
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
/** Bytes como gente lê: 840 KB, 12 MB, 1,4 GB. */
const tamanho = (b: number) =>
  b >= 1024 ** 3 ? `${(b / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB`
  : b >= 1024 ** 2 ? `${Math.round(b / 1024 ** 2)} MB`
  : `${Math.max(1, Math.round(b / 1024))} KB`;

/** Quanto o workspace ocupa no disco: o do item (só ele e com os filhos) ou a bancada inteira. O núcleo guarda a
 *  medida por 5 minutos; aqui relê ao trocar de workspace e a cada 5 minutos. */
function IndicadorDisco({ ativo }: { ativo: string }) {
  const id = ativo === GERAL ? null : itemDa(ativo);
  const [item, setItem] = useState<{ proprio: number; com_filhos: number; filhos: number } | null>(null);
  const [bancada, setBancada] = useState<number | null>(null);
  const pop = usePopover();
  useEffect(() => {
    let vivo = true;
    const medir = () => {
      if (id != null) api.tamanhoDoItem(id).then((r) => vivo && setItem(r)).catch(() => {});
      else setItem(null);
      api.tamanhoDaBancada().then((r) => vivo && setBancada(r.bytes)).catch(() => {});
    };
    setItem(null);
    medir();
    // de 5 em 5 minutos, só com o app à vista (minimizado ou na bandeja não mede)
    const t = window.setInterval(() => { if (!document.hidden) medir(); }, 300000);
    return () => { vivo = false; window.clearInterval(t); };
  }, [id]);
  const principal = id != null ? (item ? tamanho(item.proprio) : "…") : bancada != null ? tamanho(bancada) : "…";
  return (
    <>
      <button className="bs-medida bs-disco" onClick={pop.abrir} title="Espaço em disco deste workspace (clique para ver com os filhos e a bancada inteira)">
        <HardDrive size={12} /> {principal}
        {id != null && item && item.filhos > 0 && <span className="rotulo-fraco">· {tamanho(item.com_filhos)} com os filhos</span>}
      </button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={300}>
          <div className="menu-rotulo">Espaço em disco</div>
          {id != null && (
            <div className="bs-grupo">
              <div className="bs-linha forte"><span>Só este documento</span><span>{item ? tamanho(item.proprio) : "calculando…"}</span></div>
              <div className="bs-linha forte">
                <span>Com os filhos{item ? ` (${item.filhos})` : ""}</span><span>{item ? tamanho(item.com_filhos) : "calculando…"}</span>
              </div>
            </div>
          )}
          <div className="bs-grupo">
            <div className="bs-linha forte"><span>A bancada inteira</span><span>{bancada != null ? tamanho(bancada) : "calculando…"}</span></div>
          </div>
          <div className="menu-rotulo" style={{ textTransform: "none", letterSpacing: 0 }}>
            Filhos são os itens que têm este como Pai, descendo a árvore. Para ver um filho, abra o workspace dele (ou
            pergunte ao agente da bancada). A medida é refeita a cada 5 minutos.
          </div>
        </Popover>
      )}
    </>
  );
}

/** A fila dos agentes que esperam você (terminaram ou pedem ação), um por workspace, o mais antigo à esquerda. */
function FilaAgentes({ ws, irAoAgente }: { ws: Workspaces; irAoAgente: (sessao: number) => void }) {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    window.addEventListener("atelier:agentes", f);
    return () => window.removeEventListener("atelier:agentes", f);
  }, []);
  const vistos = new Set<string>();
  const fila: { k: string; sessao: number; estado: "esperando" | "terminou" }[] = [];
  for (const f of filaDeEspera()) {
    const k = workspaceDaSessao(ws, f.sessao);
    // só os abertos: fechar ou arquivar o workspace para os terminais (o agente dele já não espera ninguém)
    if (!k || vistos.has(k) || !ws.abertos.includes(k)) continue;
    vistos.add(k);
    fila.push({ k, sessao: f.sessao, estado: f.estado as "esperando" | "terminou" });
  }
  if (!fila.length) return null;
  return (
    <span className="bs-fila">
      {fila.map((f) => {
        const titulo = ws.info[f.k]?.titulo ?? f.k;
        return (
          <button key={f.k} className={`bs-pilula ${f.estado}`} onClick={() => irAoAgente(f.sessao)}
            title={`${titulo}: ${f.estado === "esperando" ? "um agente está esperando você" : "um agente terminou"} (clique para ir até ele)`}>
            <CarinhaAgente estado={f.estado} temAgente />
            <span className="bs-pilula-nome">{titulo}</span>
          </button>
        );
      })}
    </span>
  );
}

export function BarraStatus({ ws, irAoAgente }: { ws: Workspaces; irAoAgente: (sessao: number) => void }) {
  const [m, setM] = useState<Medida | null>(null);
  const pop = usePopover();
  useEffect(() => {
    let vivo = true;
    const medir = () => fetch(`${BASE}/sistema`).then((r) => r.json()).then((d) => vivo && !d.erro && setM(d)).catch(() => {});
    medir();
    // app minimizado ou na bandeja: ninguém está olhando, não mede
    const t = window.setInterval(() => { if (!document.hidden) medir(); }, 3000);
    return () => { vivo = false; window.clearInterval(t); };
  }, []);
  const botaoWs = (
    <button className="bs-ws" title="Workspaces: ver todos (Ctrl+Shift+O)" onClick={() => window.dispatchEvent(new Event("atelier:ver-workspaces"))}>
      <LayoutPanelLeft size={13} />
    </button>
  );
  if (!m) return <footer className="barra-status">{botaoWs}<FilaAgentes ws={ws} irAoAgente={irAoAgente} /></footer>;

  const pct = Math.min(100, (m.ram / m.ram_maquina) * 100);
  const porWs = ws.abertos.map((k) => {
    const ss = sessoesDe(ws.estados[k]).map((s) => ({ ...s, ...(m.sessoes[String(s.sessao)] ?? { ram: 0, cpu: 0 }) }));
    return { k, info: ws.info[k] ?? { titulo: k }, ram: ss.reduce((n, s) => n + s.ram, 0), cpu: ss.reduce((n, s) => n + s.cpu, 0), ss };
  });
  const terminais = porWs.reduce((n, w) => n + w.ram, 0);
  const resto = Math.max(0, m.ram - terminais - m.interface - m.nucleo);

  return (
    <footer className="barra-status">
      {botaoWs}
      <FilaAgentes ws={ws} irAoAgente={irAoAgente} />
      <span style={{ flex: 1, minWidth: 8 }} />
      <IndicadorDitado interfaceRam={m.interface} />
      <IndicadorDisco ativo={ws.ativo} />
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
                <span><IconeWs k={w.k} icone={w.info.icone} />{w.info.titulo}{w.k === ws.ativo ? " (atual)" : ""}</span>
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
export function VisaoGeralWorkspaces({ ws, aoEscolher, aoFechar, fecharWs, renomear }: {
  ws: Workspaces;
  aoEscolher: (chave: string) => void;
  aoFechar: () => void;
  fecharWs: (chave: string) => void;
  renomear: (chave: string, nome: string) => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [m, setM] = useState<Medida | null>(null);
  const [busca, setBusca] = useState("");
  // os abertos primeiro (o atual na frente), depois os guardados
  // os arquivados não entram
  const ordem = [
    ...ws.abertos,
    ...Object.keys(ws.estados).filter((k) => !ws.abertos.includes(k)).sort((a, b) => (ws.info[a]?.titulo ?? "").localeCompare(ws.info[b]?.titulo ?? "")),
  ].filter((k) => ws.estados[k] && !ws.info[k]?.arquivado && (ws.info[k]?.titulo ?? k).toLowerCase().includes(busca.trim().toLowerCase()));
  // os arquivados, à parte: só com "Mostrar arquivados", embaixo, depois de um traço
  const [verArquivados, setVerArquivados] = useState(() => ler("workspaces.geral.arquivados", false));
  const todosArquivados = Object.keys(ws.estados).filter((k) => ws.info[k]?.arquivado);
  const arquivados = todosArquivados
    .filter((k) => (ws.info[k]?.titulo ?? k).toLowerCase().includes(busca.trim().toLowerCase()))
    .sort((a, b) => (ws.info[a]?.titulo ?? "").localeCompare(ws.info[b]?.titulo ?? ""));
  // o que as setas percorrem: os ativos e, se à vista, os arquivados
  const nav = verArquivados ? [...ordem, ...arquivados] : ordem;
  const [sel, setSel] = useState(() => Math.max(0, ordem.indexOf(ws.ativo)));
  const grade = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    const medir = () => fetch(`${BASE}/sistema`).then((r) => r.json()).then((d) => vivo && !d.erro && setM(d)).catch(() => {});
    medir();
    // app minimizado ou na bandeja: ninguém está olhando, não mede
    const t = window.setInterval(() => { if (!document.hidden) medir(); }, 2000);
    return () => { vivo = false; window.clearInterval(t); };
  }, []);
  useEffect(() => setSel((s) => Math.min(s, Math.max(0, nav.length - 1))), [nav.length]);
  useEffect(() => { grade.current?.querySelector(".ws-cartao.sel")?.scrollIntoView({ block: "nearest" }); }, [sel]);

  const colunas = () => {
    const el = grade.current?.firstElementChild as HTMLElement | null;
    return el && grade.current ? Math.max(1, Math.round(grade.current.clientWidth / (el.offsetWidth + 14))) : 3;
  };
  const tecla = (e: React.KeyboardEvent) => {
    if (editando) return;
    const n = nav.length;
    if (e.key === "Escape") { e.preventDefault(); aoFechar(); }
    if (!n) return;
    if (e.key === "ArrowRight") { e.preventDefault(); setSel((s) => (s + 1) % n); }
    if (e.key === "ArrowLeft") { e.preventDefault(); setSel((s) => (s - 1 + n) % n); }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(n - 1, s + colunas())); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - colunas())); }
    if (e.key === "Enter") { e.preventDefault(); aoEscolher(nav[sel]); }
  };

  return (
    <div className="ws-geral" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()} onKeyDown={tecla}>
      <div className="ws-geral-topo">
        <LayoutDashboard size={18} />
        <strong>Workspaces</strong>
        <input autoFocus className="campo" placeholder="Filtrar pelo nome do documento…" value={busca} onChange={(e) => { setBusca(e.target.value); setSel(0); }} />
        {m && <span className="dica-inline">atelier: {mb(m.ram)} · CPU {m.cpu.toFixed(0)}%</span>}
        <span style={{ flex: 1 }} />
        {todosArquivados.length > 0 && (
          <button className={`btn${verArquivados ? " ativo" : ""}`} title="Mostra os arquivados embaixo, separados"
            onClick={() => { const v = !verArquivados; setVerArquivados(v); guardar("workspaces.geral.arquivados", v); }}>
            <Archive size={13} /> {verArquivados ? "Esconder" : "Mostrar"} arquivados ({todosArquivados.length})
          </button>
        )}
        <span className="dica-inline">← → ↑ ↓ escolhe · Enter vai · Esc fecha</span>
      </div>
      <div className="ws-grade" ref={grade}>
        {ordem.map((k, i) => cartao(k, i))}
        {ordem.length === 0 && <div className="vazio-grande">Nenhum workspace com esse nome.</div>}
        {verArquivados && todosArquivados.length > 0 && (
          <>
            <div className="ws-geral-traco"><span>Arquivados ({arquivados.length})</span></div>
            {arquivados.map((k, i) => cartao(k, ordem.length + i))}
            {arquivados.length === 0 && <div className="vazio-grande">Nenhum arquivado com esse nome.</div>}
          </>
        )}
      </div>
    </div>
  );

  function cartao(k: string, i: number) {
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
              className={`ws-cartao${i === sel ? " sel" : ""}${k === ws.ativo ? " atual" : ""}${aberto ? "" : " guardado"}${info.arquivado ? " arquivado" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => editando !== k && aoEscolher(k)}
            >
              <div className="ws-cartao-cabeca">
                <span className="ws-cartao-icone">{k === GERAL ? <Marca tamanho={18} /> : info.icone ?? "📄"}</span>
                <NomeWs info={info} editando={editando === k} aoGravar={(n) => renomear(k, n)} aoSair={() => setEditando(null)} classe="ws-cartao-titulo" />
                {k === ws.ativo && <span className="ws-selo-atual">atual</span>}
                <button className="btn-icone mini ws-lapis" title="Renomear" onClick={(ev) => { ev.stopPropagation(); setEditando(k); }}><Pencil size={12} /></button>
                {aberto && !(k === GERAL && k === ws.ativo) && (
                  <button className="btn-icone mini" onClick={(ev) => { ev.stopPropagation(); fecharWs(k); }}
                    title={k === ws.ativo ? "Desligar (para os terminais; as janelas ficam guardadas) e ir para o workspace da bancada" : "Desligar (para os terminais; as janelas ficam guardadas)"}>
                    <Power size={12} />
                  </button>
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
                <span>{aberto ? (k === ws.ativo ? "atual" : "aberto") : info.arquivado ? `arquivado em ${new Date(info.arquivado).toLocaleDateString("pt-BR")}` : "guardado"}</span>
                <span>· {janelas} {janelas === 1 ? "janela" : "janelas"}</span>
                {ss.length > 0 && <span>· {ss.length} {ss.length === 1 ? "terminal" : "terminais"}</span>}
                <span style={{ flex: 1 }} />
                {aberto && ss.length > 0 && (
                  <span className="ws-uso"><MemoryStick size={11} /> {mb(ram)} <Cpu size={11} /> {cpu.toFixed(0)}%</span>
                )}
              </div>
            </div>
          );
  }
}
