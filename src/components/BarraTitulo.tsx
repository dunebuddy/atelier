import { useEffect, useRef, useState } from "react";
import {
  Copy, Minus, PanelLeft, Plus, Search, Settings, Square, Trash2, X,
} from "lucide-react";
import { api, Esquema, Item } from "../api";
import { falhou, ler, Rota } from "../ui";
import { Popover, usePopover } from "./Popover";

/** Janela do Tauri, se estivermos no app (no navegador de teste não há). */
async function janela() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  } catch {
    return null;
  }
}

export function Marca() {
  // bancada de trabalho: um tampo com dois pés, em cima a letra
  return (
    <svg className="marca" viewBox="0 0 24 24" width="22" height="22" aria-label="atelier">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="var(--acento)" />
      <path d="M7 16.5V9.2c0-1.2 1-2.2 2.2-2.2h5.6c1.2 0 2.2 1 2.2 2.2v7.3" stroke="var(--bg)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M7 12.2h10" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BarraTitulo({
  esquema, rota, ir, trilha, alternarMenu, abrirConfig, aoApagarItem,
}: {
  esquema: Esquema | null;
  rota: Rota;
  ir: (r: Rota) => void;
  trilha: { rotulo: string; rota?: Rota }[];
  alternarMenu: () => void;
  abrirConfig: () => void;
  aoApagarItem: (() => void) | null;
}) {
  const [maximizada, setMaximizada] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const novo = usePopover();
  const botaoNovo = useRef<HTMLButtonElement>(null);

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
      if (e.ctrlKey && (e.key === "k" || e.key === "K")) { e.preventDefault(); setBuscando(true); }
      if (e.ctrlKey && (e.key === "n" || e.key === "N") && botaoNovo.current) { e.preventDefault(); novo.abrir({ currentTarget: botaoNovo.current }); }
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
        <button className="bt-btn" title="Menu lateral (Ctrl+\)" onClick={alternarMenu}><PanelLeft size={16} /></button>
        <nav className="trilha" data-tauri-drag-region>
          {trilha.map((t, i) => (
            <span key={i} className="trilha-pedaco">
              {i > 0 && <span className="sep">›</span>}
              <button onClick={() => t.rota && ir(t.rota)} disabled={!t.rota}>{t.rotulo}</button>
            </span>
          ))}
        </nav>
      </div>

      <button className="bt-busca" onClick={() => setBuscando(true)}>
        <Search size={14} /> <span>Buscar ou ir para…</span> <kbd>Ctrl K</kbd>
      </button>

      <div className="bt-dir" data-tauri-drag-region>
        {aoApagarItem && (
          <button
            className={`bt-btn${apagando ? " perigo" : ""}`}
            title="Mover para a lixeira"
            onClick={() => (apagando ? aoApagarItem() : setApagando(true))}
          >
            <Trash2 size={15} /> {apagando && <span style={{ fontSize: 12.5 }}>Confirmar</span>}
          </button>
        )}
        <button ref={botaoNovo} className="bt-btn destaque" title="Novo item (Ctrl+N)" onClick={novo.abrir} disabled={!esquema}>
          <Plus size={15} /> <span>Novo</span>
        </button>
        <button className="bt-btn" title="Configurações (Ctrl+,)" onClick={abrirConfig}><Settings size={16} /></button>
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

      {buscando && esquema && <BuscaRapida esquema={esquema} ir={ir} aoFechar={() => setBuscando(false)} />}
    </header>
  );
}

/** Ctrl+K: acha item por título ou texto e vai direto; também pula para um tipo. */
function BuscaRapida({ esquema, ir, aoFechar }: { esquema: Esquema; ir: (r: Rota) => void; aoFechar: () => void }) {
  const [q, setQ] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [foco, setFoco] = useState(0);
  const lista = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => api.itens({ q }).then((r) => { setItens(r.slice(0, 30)); setFoco(0); }).catch(() => {}), 120);
    return () => window.clearTimeout(t);
  }, [q]);

  const b = q.trim().toLowerCase();
  const tipos = esquema.tipos.filter((t) => b && t.nome.toLowerCase().includes(b));
  // busca vazia: os itens abertos por último
  const recentes = !b
    ? ler<{ id: number; codigo: string; titulo: string; tipo_id: number | null }[]>("recentes", []).map((r) => ({
        rotulo: r.titulo || "Sem título",
        icone: esquema.tipos.find((t) => t.id === r.tipo_id)?.icone ?? "·",
        detalhe: `#${r.codigo} · recente`,
        rota: { v: "item", id: r.id } as Rota,
      }))
    : [];
  const opcoes: { rotulo: string; icone: string; detalhe: string; rota: Rota }[] = [
    ...recentes,
    ...tipos.map((t) => ({ rotulo: t.nome, icone: t.icone, detalhe: "tipo", rota: { v: "lista", tipo: t.id } as Rota })),
    ...itens.filter((it) => !recentes.some((r) => (r.rota as { id: number }).id === it.id)).map((it) => {
      const t = esquema.tipos.find((x) => x.id === it.tipo_id);
      return { rotulo: it.titulo || "Sem título", icone: t?.icone ?? "·", detalhe: `#${it.codigo} · ${t?.nome ?? "sem tipo"}`, rota: { v: "item", id: it.id } as Rota };
    }),
  ];

  const escolher = (i: number) => {
    const o = opcoes[i];
    if (o) { ir(o.rota); aoFechar(); }
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
            placeholder="Buscar itens ou tipos…"
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
            </button>
          ))}
          {opcoes.length === 0 && <div className="br-vazio">{b ? "Nada encontrado." : "Nenhum item ainda."}</div>}
        </div>
      </div>
    </div>
  );
}
