import { lazy, Suspense, useEffect, useState } from "react";
import { Bot, ChevronDown, FolderOpen, FolderTree, SquareTerminal } from "lucide-react";
import { Popover, usePopover } from "./Popover";
import { api, BASE } from "../api";
import { abrir, avisar, falhou } from "../ui";
import { bate } from "../atalhos";

interface Programa {
  id: string;
  nome: string;
  comando: string;
  instalado: boolean;
}

// o xterm (e o CSS dele) só carrega quando o primeiro terminal abre
const TerminalXterm = lazy(() => import("./TerminalXterm").then((m) => ({ default: m.TerminalXterm })));

let proximaSessao = Date.now() % 1_000_000;
/** sessões abertas nesta execução do app; as outras voltaram do workspace guardado e estão paradas */
const vivas = new Set<number>();

/** Pasta do workspace ativo (a do item, ou a raiz da bancada): onde nasce o terminal que não disse onde. */
let pastaDoWorkspace: () => Promise<string | undefined> = async () => undefined;
export function definirPastaDoWorkspace(f: () => Promise<string | undefined>) {
  pastaDoWorkspace = f;
}

/** De quem é a pasta do workspace (para o menu dizer) e o item da janela em foco, quando não é o do workspace. */
export interface InfoWorkspace {
  /** "bancada MDB" ou "#d475363 Calculadora" */
  nome: string;
  /** o item aberto na janela em foco, se for outro que não o do workspace: oferece a pasta dele */
  outroItem?: { id: number; codigo?: string; titulo: string } | null;
}
let infoWorkspace: () => InfoWorkspace = () => ({ nome: "workspace" });
export function definirInfoWorkspace(f: () => InfoWorkspace) {
  infoWorkspace = f;
}

/** Pasta do workspace ativo nas mãos de `f` (avisa se não tem). */
async function naPasta(f: (pasta: string) => void) {
  const p = await pastaDoWorkspace().catch(() => undefined);
  if (p) f(p);
  else avisar("Este workspace não tem pasta.");
}

/** Pasta de um item (criada na hora, se ainda não tem) nas mãos de `f`. */
async function naPastaDoItem(id: number, f: (pasta: string) => void) {
  try {
    f((await api.criarPasta(id)).pasta);
  } catch (e) {
    falhou(e);
  }
}

/** Abre um terminal (o shell, ou um agente) numa janela ao lado. */
export async function abrirTerminal(cwd?: string, programa?: string, titulo?: string, shell?: string) {
  cwd ??= await pastaDoWorkspace().catch(() => undefined);
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
  const info = pop.ancora ? infoWorkspace() : { nome: "" };
  return (
    <span className="botao-terminal">
      <button className="btn-icone" title="Novo terminal (Ctrl+`)" onClick={() => abrirTerminal()}><SquareTerminal size={15} /></button>
      <button className="btn-icone seta" title="Outro terminal, um agente ou a pasta do workspace" onClick={pop.abrir}><ChevronDown size={12} /></button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={250}>
          <div className="menu-rotulo">Terminal</div>
          {(d?.shells ?? []).map((s) => (
            <button key={s.id} className="menu-item" onClick={() => { abrirTerminal(undefined, undefined, s.nome, s.id); pop.fechar(); }}>
              <SquareTerminal size={14} /> {s.nome}
            </button>
          ))}
          <div className="menu-rotulo menu-rotulo-nome" title="O terminal e o explorador abrem na pasta do workspace em que você está">
            Pasta do workspace: {info.nome}
          </div>
          <button className="menu-item" onClick={() => { pop.fechar(); naPasta((p) => abrir({ v: "pastas", raiz: p }, true)); }}>
            <FolderTree size={14} /> Explorador em árvore
          </button>
          <button className="menu-item" onClick={() => { pop.fechar(); naPasta((p) => api.abrirPasta(p).catch(falhou)); }}>
            <FolderOpen size={14} /> No explorador do sistema
          </button>
          {info.outroItem && (
            <>
              <div className="menu-rotulo menu-rotulo-nome" title="O item aberto na janela em foco não é o deste workspace">
                Pasta deste item: {info.outroItem.codigo ? `#${info.outroItem.codigo} ` : ""}{info.outroItem.titulo}
              </div>
              <button className="menu-item" onClick={() => { pop.fechar(); naPastaDoItem(info.outroItem!.id, (p) => abrirTerminal(p)); }}>
                <SquareTerminal size={14} /> Terminal na pasta do item
              </button>
              <button className="menu-item" onClick={() => { pop.fechar(); naPastaDoItem(info.outroItem!.id, (p) => abrir({ v: "pastas", raiz: p }, true)); }}>
                <FolderTree size={14} /> Explorador em árvore
              </button>
              <button className="menu-item" onClick={() => { pop.fechar(); naPastaDoItem(info.outroItem!.id, (p) => api.abrirPasta(p).catch(falhou)); }}>
                <FolderOpen size={14} /> No explorador do sistema
              </button>
            </>
          )}
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
      <Suspense fallback={null}>
        <TerminalXterm aba={{ id: sessao, titulo: "", cwd, programa, shell }} visivel={visivel} aoSair={() => {}} />
      </Suspense>
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
