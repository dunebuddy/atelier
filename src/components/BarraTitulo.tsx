import { useEffect, useRef, useState } from "react";
import { BotaoWorkspace } from "./BotaoWorkspace";
import {
  ChevronLeft, ChevronRight, Copy, Keyboard, Minus, PanelLeft, Search, Settings, Sparkles, Square, Trash2, X,
} from "lucide-react";
import { api, Esquema, Item } from "../api";
import { falhou, ler, Rota } from "../ui";
import { Popover, usePopover } from "./Popover";
import { acharAtalhos, bate, combinacao, dispararAtalho } from "../atalhos";
import type { Navegacao } from "./Sidebar";
import { Marca } from "./Marca";

/** Janela do Tauri, se estivermos no app (no navegador de teste não há). */
async function janela() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export { Marca };

export function BarraTitulo({
  esquema, rota, ir, trilha, alternarMenu, abrirConfig, abrirAtalhos, aoApagarItem, workspace, nav,
}: {
  /** voltar/avançar da janela com o foco: ficam aqui em cima, à vista mesmo com a barra lateral escondida */
  nav: Navegacao;
  abrirAtalhos: () => void;
  /** seletor de workspace */
  workspace?: React.ReactNode;
  esquema: Esquema | null;
  rota: Rota;
  ir: (r: Rota) => void;
  trilha: { rotulo: string; rota?: Rota }[];
  alternarMenu: () => void;
  abrirConfig: () => void;
  aoApagarItem: (() => void) | null;
}) {
  const [maximizada, setMaximizada] = useState(false);
  const [buscando, setBuscando] = useState<boolean | string>(false);
  useEffect(() => {
    const f = (e: Event) => setBuscando((e as CustomEvent<string>).detail || true);
    window.addEventListener("atelier:busca", f);
    return () => window.removeEventListener("atelier:busca", f);
  }, []);
  const [apagando, setApagando] = useState(false);
  const novo = usePopover();
  const pHist = usePopover();
  // sem botão Novo na barra: o Ctrl+N abre o menu "Criar" embaixo da busca
  const ancoraNovo = useRef<HTMLButtonElement>(null);

  useEffect(() => setApagando(false), [rota]);

  useEffect(() => {
    let solta: (() => void) | undefined;
    janela().then(async (w) => {
      if (!w) return;
      setMaximizada(await w.isMaximized());
      solta = await w.onResized(async () => setMaximizada(await w.isMaximized()));
    });
    return () => solta?.();
  }, []);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (bate("busca", e) || bate("buscar-texto", e)) { e.preventDefault(); setBuscando(true); }
      // a lista de ações é a busca começando com ">" (como no VS Code)
      if (bate("acoes", e)) { e.preventDefault(); setBuscando(">"); }
      if (bate("novo", e) && ancoraNovo.current) { e.preventDefault(); novo.abrir({ currentTarget: ancoraNovo.current }); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const criar = async (tipo_id: number | null) => {
    novo.fechar();
    try {
      const it = await api.criarItem({ tipo_id });
      ir({ v: "item", id: it.id });
    } catch (e) {
      falhou(e);
    }
  };

  return (
    <header className="barra-titulo" data-tauri-drag-region>
      <div className="bt-esq" data-tauri-drag-region>
        <Marca />
        <button className="bt-btn" title={`Menu lateral (${combinacao("menu")})`} onClick={alternarMenu}><PanelLeft size={16} /></button>
        <button className="bt-btn" title={`Voltar (${combinacao("voltar")}) · botão direito: histórico`} onClick={nav.voltar} disabled={!nav.podeVoltar} onContextMenu={(e) => { e.preventDefault(); pHist.abrir(e); }}><ChevronLeft size={17} /></button>
        <button className="bt-btn" title={`Avançar (${combinacao("avancar")}) · botão direito: histórico`} onClick={nav.avancar} disabled={!nav.podeAvancar} onContextMenu={(e) => { e.preventDefault(); pHist.abrir(e); }}><ChevronRight size={17} /></button>
        {workspace}
        <nav className="trilha" data-tauri-drag-region>
          {trilha.map((t, i) => (
            <span key={i} className="trilha-pedaco">
              {i > 0 && <span className="sep">›</span>}
              <button onClick={() => t.rota && ir(t.rota)} disabled={!t.rota}>{t.rotulo}</button>
            </span>
          ))}
        </nav>
      </div>

      <button ref={ancoraNovo} className="bt-busca" onClick={() => setBuscando(true)}>
        <Search size={14} /> <span>Buscar ou ir para…</span> <kbd>{combinacao("busca").replace(/\+/g, " ")}</kbd>
      </button>

      <div className="bt-dir" data-tauri-drag-region>
        {aoApagarItem && (
          <button
            className={`bt-btn${apagando ? " perigo" : ""}`}
            title="Mover para a lixeira"
            onClick={() => (apagando ? aoApagarItem() : setApagando(true))}
          >
            <Trash2 size={16} /> {apagando && <span style={{ fontSize: 12.5 }}>Confirmar</span>}
          </button>
        )}
        <button className="bt-btn" title={`Comando para o agente (${combinacao("comando")})`} onClick={() => window.dispatchEvent(new Event("atelier:comando"))}><Sparkles size={16} /></button>
        <button className="bt-btn" title={`Atalhos: ver, procurar e mudar (${combinacao("atalhos")})`} onClick={abrirAtalhos}><Keyboard size={16} /></button>
        <button className="bt-btn" title={`Configurações do app (${combinacao("config")})`} onClick={abrirConfig}><Settings size={16} /></button>
        <div className="bt-janela">
          <button title="Minimizar" onClick={() => janela().then((w) => w?.minimize())}><Minus size={15} /></button>
          <button title={maximizada ? "Restaurar" : "Maximizar"} onClick={() => janela().then((w) => w?.toggleMaximize())}>
            {maximizada ? <Copy size={12} style={{ transform: "scaleX(-1)" }} /> : <Square size={12} />}
          </button>
          <button className="fechar" title="Fechar" onClick={() => janela().then((w) => w?.close())}><X size={16} /></button>
        </div>
      </div>

      {novo.ancora && esquema && (
        <Popover ancora={novo.ancora} aoFechar={novo.fechar} largura={230}>
          <div className="menu-rotulo">Criar</div>
          {esquema.tipos.map((t) => (
            <button key={t.id} className="menu-item" onClick={() => criar(t.id)}>
              <span className="tipo-chip pequeno">{t.icone}</span> {t.nome}
            </button>
          ))}
          <button className="menu-item" onClick={() => criar(null)}>
            <span className="tipo-chip pequeno">·</span> Sem tipo
          </button>
        </Popover>
      )}

      {pHist.ancora && (
        <Popover ancora={pHist.ancora} aoFechar={pHist.fechar} largura={280}>
          <div className="menu-rotulo">Histórico desta janela</div>
          {nav.passos.map((p, i) => ({ p, i })).reverse().map(({ p, i }) => (
            <button key={i} className="menu-item" onClick={() => { nav.irPara(i); pHist.fechar(); }} style={p.atual ? { fontWeight: 600 } : undefined}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.rotulo}</span>
              {p.atual && <span className="dir">aqui</span>}
            </button>
          ))}
        </Popover>
      )}

      {buscando !== false && esquema && <BuscaRapida esquema={esquema} ir={ir} inicial={typeof buscando === "string" ? buscando : ""} aoFechar={() => setBuscando(false)} />}
    </header>
  );
}

/** Ctrl+K: acha item por título ou texto e vai direto; também pula para um tipo. */
function BuscaRapida({ esquema, ir, aoFechar, inicial = "" }: { esquema: Esquema; ir: (r: Rota) => void; aoFechar: () => void; inicial?: string }) {
  const [q, setQ] = useState(inicial);
  const [itens, setItens] = useState<Item[]>([]);
  const [foco, setFoco] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (q.startsWith(">")) { setFoco(0); return; }
    const t = window.setTimeout(() => api.itens({ q }).then((r) => { setItens(r.slice(0, 30)); setFoco(0); }).catch(() => {}), 120);
    return () => window.clearTimeout(t);
  }, [q]);

  // ">" no começo: a lista de ações (todos os atalhos, com as palavras escondidas)
  const emAcoes = q.startsWith(">");
  const b = emAcoes ? "" : q.trim().toLowerCase();
  const tipos = esquema.tipos.filter((t) => b && t.nome.toLowerCase().includes(b));
  // busca vazia: os itens abertos por último
  const recentes = !b
    ? ler<{ id: number; codigo: string; titulo: string; tipo_id: number | null }[]>("recentes", []).map((r) => ({
        rotulo: r.titulo || "Sem título",
        icone: esquema.tipos.find((t) => t.id === r.tipo_id)?.icone ?? "·",
        detalhe: `#${r.codigo} · recente`,
        rota: { v: "item", id: r.id } as Rota,
        item: r,
      }))
    : [];
  const opcoes: { rotulo: string; icone: string; detalhe: string; rota?: Rota; acao?: string; item?: { id: number; titulo: string; tipo_id: number | null } }[] = emAcoes
    ? acharAtalhos(q.slice(1)).map((a) => ({ rotulo: a.nome, icone: "⌨", detalhe: combinacao(a.id), acao: a.id }))
    : [
    ...recentes,
    ...tipos.map((t) => ({ rotulo: t.nome, icone: t.icone, detalhe: "tipo", rota: { v: "lista", tipo: t.id } as Rota })),
    ...itens.filter((it) => !recentes.some((r) => (r.rota as { id: number }).id === it.id)).map((it) => {
      const t = esquema.tipos.find((x) => x.id === it.tipo_id);
      return { rotulo: it.titulo || "Sem título", icone: t?.icone ?? "·", detalhe: `#${it.codigo} · ${t?.nome ?? "sem tipo"}`, rota: { v: "item", id: it.id } as Rota, item: it };
    }),
  ];

  const escolher = (i: number) => {
    const o = opcoes[i];
    if (!o) return;
    aoFechar();
    if (o.acao) { const id = o.acao; window.setTimeout(() => dispararAtalho(id), 30); }
    else if (o.rota) ir(o.rota);
  };

  useEffect(() => {
    lista.current?.querySelector(".foco")?.scrollIntoView({ block: "nearest" });
  }, [foco]);

  return (
    <div className="modal-fundo topo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="busca-rapida">
        <div className="br-campo">
          <Search size={17} />
          <input
            autoFocus
            placeholder={emAcoes ? "Ação… (apague o > para buscar documentos)" : "Buscar documentos ou tipos… (> para as ações)"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") aoFechar();
              if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => Math.min(f + 1, opcoes.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)); }
              if (e.key === "Enter") escolher(foco);
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="br-lista" ref={lista}>
          {opcoes.map((o, i) => (
            <button key={i} className={`br-item${i === foco ? " foco" : ""}`} onMouseEnter={() => setFoco(i)} onClick={() => escolher(i)}>
              <span className="tipo-chip pequeno">{o.icone}</span>
              <span className="br-rotulo">{o.rotulo}</span>
              <span className="br-detalhe">{o.detalhe}</span>
              {o.item && <BotaoWorkspace esquema={esquema} item={o.item} depois={aoFechar} />}
            </button>
          ))}
          {opcoes.length === 0 && <div className="br-vazio">{emAcoes ? "Nenhuma ação com isso." : b ? "Nada encontrado." : "Nenhum documento ainda."}</div>}
        </div>
      </div>
    </div>
  );
}
