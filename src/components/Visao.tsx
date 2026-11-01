import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowUpDown, FileDown, ChevronLeft, ChevronRight, Columns3, Eye, EyeOff, Filter, Layers, List, MoreHorizontal, Search,
  SlidersHorizontal, Table2, Trash2,
} from "lucide-react";
import { api, Esquema, FiltroData, FiltroVisao, Item, Layout, opcoesDe, Propriedade, propsDoTipo, Visao } from "../api";
import { EMOJIS, falhou, Rota } from "../ui";
import { datasDo, PERIODOS, rotuloIntervalo } from "../visao";
import { Kanban, ListaCompacta, Tabela } from "./Layouts";
import { LinhaDoTempo } from "./LinhaDoTempo";
import { Popover, usePopover } from "./Popover";
import { Etiqueta, IconeEspecie, valorDe } from "./Valor";
import { useAoReaparecer, useVisivel } from "../visivel";

// só carrega quando o Paulo pede para exportar
const Exportar = lazy(() => import("./Exportar").then((m) => ({ default: m.Exportar })));

const LAYOUTS: { id: Layout; nome: string; icone: React.ReactNode }[] = [
  { id: "tabela", nome: "Tabela", icone: <Table2 size={15} /> },
  { id: "lista", nome: "Lista", icone: <List size={15} /> },
  { id: "kanban", nome: "Quadro", icone: <Columns3 size={15} /> },
  { id: "linha", nome: "Linha do tempo", icone: <Activity size={15} /> },
];

const AGRUPAVEL = new Set(["status", "selecao"]);
const NA_VISAO_GERAL = new Set(["status", "selecao", "data"]);

/** Tipos que a visão alcança (todos, se o filtro não diz). */
export function tiposDaVisao(e: Esquema, f: FiltroVisao) {
  return f.tipos?.length ? e.tipos.filter((t) => f.tipos!.includes(t.id)) : e.tipos;
}

/** Propriedades usadas pelos tipos da visão, na ordem em que aparecem. */
export function propsDaVisao(e: Esquema, f: FiltroVisao): Propriedade[] {
  const vistos = new Map<number, Propriedade>();
  for (const t of tiposDaVisao(e, f)) for (const p of propsDoTipo(e, t)) vistos.set(p.id, p);
  return [...vistos.values()];
}

export function ehHistorico(e: Esquema, it: Item) {
  const t = e.tipos.find((x) => x.id === it.tipo_id);
  return propsDoTipo(e, t)
    .filter((p) => p.especie === "status")
    .some((p) => opcoesDe(e, p, it.tipo_id).find((o) => o.nome === it.props[p.id])?.historico);
}

/**
 * O item aparece na visão? Com "esconder concluídos" ligado, o item em status de histórico sai — a não ser que o
 * filtro peça aquele status de propósito (filtrar Status = Feito tem de mostrar os feitos).
 */
export function visivelNaVisao(e: Esquema, f: FiltroVisao, it: Item) {
  if (!f.esconder_historico || !ehHistorico(e, it)) return true;
  return Object.entries(f.props ?? {}).some(([pid, valores]) => valores.length > 0 && valores.includes(String(it.props[pid] ?? "")));
}

export function VisaoTela({
  esquema, visao, salvar, ir, aoMudarEsquema, aoApagar,
}: {
  esquema: Esquema;
  visao: Visao;
  /** null = visão avulsa (não salva) */
  salvar: ((d: Partial<Visao>) => void) | null;
  ir: (r: Rota) => void;
  aoMudarEsquema: () => Promise<void>;
  aoApagar?: () => void;
}) {
  const [v, setV] = useState(visao);
  useEffect(() => setV(visao), [visao]);
  const mudar = (d: Partial<Visao>) => {
    setV((x) => ({ ...x, ...d }));
    salvar?.(d);
  };
  const f = v.filtro ?? {};

  const [itens, setItens] = useState<Item[] | null>(null);
  const [busca, setBusca] = useState("");
  const [desloca, setDesloca] = useState(0);
  const [recarga, setRecarga] = useState(0);
  const [exportando, setExportando] = useState(false);
  const pFiltro = usePopover();
  const pAgrupar = usePopover();
  const pColunas = usePopover();
  const pMenu = usePopover();
  const pIcone = usePopover();
  const pOrdem = usePopover();

  const periodo = f.periodo ?? (v.layout === "linha" ? "hoje" : null);
  const datas = periodo ? datasDo(periodo, desloca) : null;
  useEffect(() => setDesloca(0), [visao.id, periodo]);

  const carregar = useCallback(() => setRecarga((n) => n + 1), []);
  // a releitura de 15 s quase sempre traz o mesmo: só troca a lista (e redesenha) se algo mudou. Compara com a lista
  // da tela (não com a última lida), porque o quadro e a tabela também mexem nela por conta própria.
  useEffect(() => {
    if (v.layout === "linha") return;
    const t = window.setTimeout(() => {
      api.itensDaVisao(f, datas, busca)
        .then((novo) => setItens((atual) => (atual && JSON.stringify(atual) === JSON.stringify(novo) ? atual : novo)))
        .catch(falhou);
    }, busca ? 200 : 0);
    return () => window.clearTimeout(t);
  }, [JSON.stringify(f), datas?.de, datas?.ate, busca, v.layout, recarga]); // eslint-disable-line react-hooks/exhaustive-deps

  // o agente pode pedir para filtrar a visão aberta (MCP: tela filtrar): só a que está à vista
  const visivel = useVisivel();
  useEffect(() => {
    if (!visivel) return;
    const f = (e: Event) => setBusca((e as CustomEvent<{ texto: string }>).detail.texto);
    window.addEventListener("atelier:filtrar", f);
    return () => window.removeEventListener("atelier:filtrar", f);
  }, [visivel]);

  // o agente pode mudar as coisas por fora: relê ao voltar para a janela e a cada 15 s (escondida, só ao reaparecer)
  useEffect(() => {
    if (!visivel) return;
    window.addEventListener("focus", carregar);
    const t = window.setInterval(carregar, 15000);
    return () => { window.removeEventListener("focus", carregar); window.clearInterval(t); };
  }, [visivel, carregar]);
  useAoReaparecer(visivel, carregar);

  const ordenar = v.config?.ordenar;
  const visiveis = useMemo(() => {
    const l = (itens ?? []).filter((i) => visivelNaVisao(esquema, f, i));
    if (!ordenar) return l;
    // ordem fixa da visão (ex.: por prazo); sem valor vai para o fim
    const p = esquema.propriedades.find((x) => x.id === ordenar.prop);
    // número compara como número; o resto como texto (datas AAAA-MM-DD ordenam certo)
    const val = (i: Item): string | number | null => {
      const x = p ? valorDe(i, p) : i.props[ordenar.prop];
      if (x == null || x === "") return null;
      return typeof x === "number" ? x : Array.isArray(x) ? String(x[0] ?? "") : String(x);
    };
    return [...l].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va === vb) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va < vb ? -1 : 1) * (ordenar.asc ? 1 : -1);
    });
  }, [itens, f.esconder_historico, JSON.stringify(f.props), esquema, ordenar?.prop, ordenar?.asc]); // eslint-disable-line react-hooks/exhaustive-deps
  const escondidos = (itens?.length ?? 0) - visiveis.length;

  const props = propsDaVisao(esquema, f);
  const colunas: Propriedade[] = v.config?.colunas
    ? v.config.colunas.map((id) => esquema.propriedades.find((p) => p.id === id)).filter((p): p is Propriedade => !!p)
    : f.tipos?.length === 1 ? props : props.filter((p) => NA_VISAO_GERAL.has(p.especie));
  const agrupaveis = props.filter((p) => AGRUPAVEL.has(p.especie));
  const agruparPor = esquema.propriedades.find((p) => p.id === v.config?.agrupar_por) ?? agrupaveis.find((p) => p.especie === "status") ?? agrupaveis[0];

  const unicoTipo = f.tipos?.length === 1 ? f.tipos[0] : null;

  const filtrosAtivos = (f.tipos?.length ?? 0) + (f.sem_tipo ? 1 : 0) + Object.values(f.props ?? {}).filter((l) => l.length).length + (f.periodo ? 1 : 0) + Object.keys(f.datas ?? {}).length;

  return (
    <div className="vista">
      <div className="vista-cabeca">
        <button className="tipo-chip grande" onClick={salvar ? pIcone.abrir : undefined} title={salvar ? "Trocar ícone" : undefined}>
          {v.icone || <Layers size={22} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          {salvar ? (
            <input
              key={visao.id + visao.nome}
              className="titulo-visao serif"
              defaultValue={v.nome}
              onBlur={(e) => e.target.value.trim() && e.target.value !== v.nome && mudar({ nome: e.target.value.trim() })}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <h1>{v.nome}</h1>
          )}
          <div className="vista-sub">
            {v.layout === "linha" ? "Linha do tempo" : itens ? `${visiveis.length} ${visiveis.length === 1 ? "item" : "itens"}` : "…"}
            {v.layout !== "linha" && escondidos > 0 && ` · ${escondidos} concluídos escondidos`}
          </div>
        </div>
        {salvar && aoApagar && (
          <button className="btn-icone" onClick={pMenu.abrir} title="Mais"><MoreHorizontal size={17} /></button>
        )}
      </div>

      <div className="vista-ferramentas">
        <div className="seletor-layout">
          {LAYOUTS.map((l) => (
            <button key={l.id} className={v.layout === l.id ? "ativo" : ""} onClick={() => mudar({ layout: l.id })} title={l.nome}>
              {l.icone} <span>{l.nome}</span>
            </button>
          ))}
        </div>
        {v.layout !== "linha" && (
          <label className="busca-local">
            <Search size={14} />
            <input placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </label>
        )}
        <span className="espaco" />
        {datas && (
          <div className="navega-periodo">
            <button className="btn-icone" onClick={() => setDesloca((d) => d - 1)} title="Anterior"><ChevronLeft size={16} /></button>
            <button className="btn" onClick={() => setDesloca(0)} title="Voltar para o atual">{rotuloIntervalo(datas.de, datas.ate)}</button>
            <button className="btn-icone" onClick={() => setDesloca((d) => d + 1)} disabled={desloca >= 0} title="Próximo"><ChevronRight size={16} /></button>
          </div>
        )}
        {!v.fixa && (
          <button className={`btn${filtrosAtivos ? " com-filtro" : ""}`} onClick={pFiltro.abrir}>
            <Filter size={14} /> Filtro{filtrosAtivos ? ` · ${filtrosAtivos}` : ""}
          </button>
        )}
        {v.layout === "kanban" && agrupaveis.length > 0 && (
          <button className="btn" onClick={pAgrupar.abrir}><SlidersHorizontal size={14} /> Agrupar: {agruparPor?.nome}</button>
        )}
        {(v.layout === "tabela" || v.layout === "lista") && (
          <button className="btn" onClick={pColunas.abrir}><SlidersHorizontal size={14} /> Propriedades</button>
        )}
        {v.layout !== "linha" && (
          <button className="btn" onClick={pOrdem.abrir}>
            <ArrowUpDown size={14} /> {ordenar ? `${esquema.propriedades.find((p) => p.id === ordenar.prop)?.nome ?? "?"} ${ordenar.asc ? "↑" : "↓"}` : "Ordem"}
          </button>
        )}
        {!v.fixa && v.layout !== "linha" && (f.esconder_historico || (itens ?? []).some((i) => ehHistorico(esquema, i))) && (
          <button
            className={`btn${f.esconder_historico ? " com-filtro" : ""}`}
            onClick={() => mudar({ filtro: { ...f, esconder_historico: !f.esconder_historico } })}
            title="Itens com status de histórico (feitos, descartados…). A escolha fica guardada nesta visão."
          >
            {f.esconder_historico ? <Eye size={14} /> : <EyeOff size={14} />} {f.esconder_historico ? `Mostrar concluídos (${escondidos})` : "Esconder concluídos"}
          </button>
        )}
        {v.layout !== "linha" && (
          <button className="btn" onClick={() => setExportando(true)} disabled={!visiveis.length} title="Exportar os itens desta visão (Markdown, HTML, PDF, Excel, CSV)">
            <FileDown size={14} /> Exportar
          </button>
        )}
      </div>

      {v.layout === "linha" && datas && (
        <LinhaDoTempo esquema={esquema} filtro={f} de={datas.de} ate={datas.ate} ir={ir} recarga={recarga} capturar={desloca === 0 && (periodo === "hoje")} />
      )}
      {v.layout === "tabela" && itens && (
        <Tabela esquema={esquema} itens={visiveis} colunas={colunas} mostrarTipo={unicoTipo == null} ir={ir} aoMudarEsquema={aoMudarEsquema} aoMudarItens={(l) => setItens(l)} todos={itens} />
      )}
      {v.layout === "lista" && itens && (
        <ListaCompacta esquema={esquema} itens={visiveis} colunas={colunas} ir={ir} />
      )}
      {v.layout === "kanban" && itens && (
        agruparPor ? (
          <Kanban esquema={esquema} itens={visiveis} agruparPor={agruparPor} tipoUnico={unicoTipo} tiposDaVisao={tiposDaVisao(esquema, f).map((t) => t.id)} mostrarHistorico={!f.esconder_historico} ir={ir} aoMudarItens={(l) => setItens(l)} todos={itens} />
        ) : (
          <div className="vazio-grande">Para ver em quadro, os tipos desta visão precisam de uma propriedade de seleção ou status.</div>
        )
      )}

      {exportando && (
        <Suspense fallback={null}>
          <Exportar esquema={esquema} ids={visiveis.map((i) => i.id)} nome={v.nome} aoFechar={() => setExportando(false)} />
        </Suspense>
      )}
      {pFiltro.ancora && <EditorFiltro esquema={esquema} filtro={f} aoMudar={(nf) => mudar({ filtro: nf })} ancora={pFiltro.ancora} aoFechar={pFiltro.fechar} />}

      {pAgrupar.ancora && (
        <Popover ancora={pAgrupar.ancora} aoFechar={pAgrupar.fechar} largura={230}>
          <div className="menu-rotulo">Colunas do quadro por</div>
          {agrupaveis.map((p) => (
            <button key={p.id} className="menu-item" onClick={() => { mudar({ config: { ...v.config, agrupar_por: p.id } }); pAgrupar.fechar(); }}>
              <IconeEspecie especie={p.especie} /> {p.nome}
              {agruparPor?.id === p.id && <span className="dir">✓</span>}
            </button>
          ))}
        </Popover>
      )}

      {pColunas.ancora && (
        <Popover ancora={pColunas.ancora} aoFechar={pColunas.fechar} largura={240}>
          <div className="menu-rotulo">Propriedades visíveis</div>
          {props.map((p) => {
            const marcada = colunas.some((c) => c.id === p.id);
            return (
              <label key={p.id} className="menu-item" style={{ cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={marcada}
                  style={{ accentColor: "var(--acento)" }}
                  onChange={() => {
                    const atual = colunas.map((c) => c.id);
                    const nova = marcada ? atual.filter((id) => id !== p.id) : [...atual, p.id];
                    mudar({ config: { ...v.config, colunas: props.map((x) => x.id).filter((id) => nova.includes(id)) } });
                  }}
                />
                <IconeEspecie especie={p.especie} /> {p.nome}
              </label>
            );
          })}
          {v.config?.colunas && (
            <>
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => { const { colunas: _c, ...resto } = v.config; mudar({ config: resto }); pColunas.fechar(); }}>
                Voltar ao padrão
              </button>
            </>
          )}
        </Popover>
      )}

      {pOrdem.ancora && (
        <Popover ancora={pOrdem.ancora} aoFechar={pOrdem.fechar} largura={240}>
          <div className="menu-rotulo">Ordenar por</div>
          <button className="menu-item" onClick={() => { const { ordenar: _o, ...resto } = v.config ?? {}; mudar({ config: resto }); pOrdem.fechar(); }}>
            Última atualização {!ordenar && <span className="dir">✓</span>}
          </button>
          {props.filter((p) => ["data", "numero", "texto", "selecao", "status", "criado_em", "atualizado_em", "email", "telefone"].includes(p.especie)).map((p) => (
            <button key={p.id} className="menu-item" onClick={() => {
              const asc = ordenar?.prop === p.id ? !ordenar.asc : true;
              mudar({ config: { ...v.config, ordenar: { prop: p.id, asc } } });
              pOrdem.fechar();
            }}>
              <IconeEspecie especie={p.especie} /> {p.nome}
              {ordenar?.prop === p.id && <span className="dir">{ordenar.asc ? "↑" : "↓"}</span>}
            </button>
          ))}
        </Popover>
      )}

      {pMenu.ancora && aoApagar && (
        <Popover ancora={pMenu.ancora} aoFechar={pMenu.fechar} largura={250}>
          <div className="menu-rotulo">Grupo no menu</div>
          <input
            className="campo"
            placeholder="Sem grupo (ex.: Trabalho, Pessoal)"
            defaultValue={v.grupo ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") { mudar({ grupo: (e.target as HTMLInputElement).value.trim() || "" }); pMenu.fechar(); }
            }}
            onBlur={(e) => { if ((e.target.value.trim() || null) !== (v.grupo ?? null)) mudar({ grupo: e.target.value.trim() || "" }); }}
          />
          <div className="menu-sep" />
          <button className="menu-item" style={{ color: "var(--t-red)" }} onClick={() => { pMenu.fechar(); aoApagar(); }}>
            <Trash2 size={14} /> Apagar esta visão
          </button>
          <div className="menu-rotulo">Os itens não são apagados.</div>
        </Popover>
      )}

      {pIcone.ancora && (
        <Popover ancora={pIcone.ancora} aoFechar={pIcone.fechar}>
          <div className="seletor-emoji">
            {["☀️", "📥", "🗂️", "🧱", "⭐", "🔥", ...EMOJIS].map((e, i) => (
              <button key={e + i} onClick={() => { mudar({ icone: e }); pIcone.fechar(); }}>{e}</button>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}

function EditorFiltro({ esquema, filtro, aoMudar, ancora, aoFechar }: { esquema: Esquema; filtro: FiltroVisao; aoMudar: (f: FiltroVisao) => void; ancora: HTMLElement; aoFechar: () => void }) {
  const f = filtro;
  const props = propsDaVisao(esquema, f).filter((p) => ["status", "selecao", "multisselecao"].includes(p.especie));
  const datas = propsDaVisao(esquema, f).filter((p) => p.especie === "data");
  const relacoes = propsDaVisao(esquema, f).filter((p) => p.especie === "relacao");
  const mudarData = (pid: number, fd: FiltroData | null) => {
    const ds: Record<string, FiltroData> = { ...(f.datas ?? {}) };
    if (fd) ds[pid] = fd;
    else delete ds[pid];
    aoMudar({ ...f, datas: ds });
  };
  const alternarTipo = (id: number) => {
    const l = f.tipos ?? [];
    aoMudar({ ...f, tipos: l.includes(id) ? l.filter((x) => x !== id) : [...l, id] });
  };
  const alternarValor = (pid: number, valor: string) => {
    const atual = f.props?.[pid] ?? [];
    const novo = atual.includes(valor) ? atual.filter((x) => x !== valor) : [...atual, valor];
    const ps: Record<string, string[]> = { ...(f.props ?? {}), [pid]: novo };
    if (!novo.length) delete ps[pid];
    aoMudar({ ...f, props: ps });
  };
  const opcoesDaVisao = (p: Propriedade) => {
    const nomes = new Map<string, ReturnType<typeof opcoesDe>[number]>();
    for (const t of tiposDaVisao(esquema, f)) {
      if (!t.propriedades.some((x) => x.propriedade_id === p.id)) continue;
      for (const o of opcoesDe(esquema, p, t.id)) if (!nomes.has(o.nome)) nomes.set(o.nome, o);
    }
    return [...nomes.values()];
  };

  return (
    <Popover ancora={ancora} aoFechar={aoFechar} largura={330}>
      <div className="menu-rotulo">Tipos</div>
      <div className="filtro-chips">
        {esquema.tipos.map((t) => (
          <button key={t.id} className={`chip${f.tipos?.includes(t.id) ? " ligado" : ""}`} onClick={() => alternarTipo(t.id)}>
            {t.icone} {t.nome}
          </button>
        ))}
        <button className={`chip${f.sem_tipo ? " ligado" : ""}`} onClick={() => aoMudar({ ...f, sem_tipo: !f.sem_tipo })}>· Sem tipo</button>
      </div>
      <div className="menu-rotulo">Período (com atividade)</div>
      <div className="filtro-chips">
        <button className={`chip${!f.periodo ? " ligado" : ""}`} onClick={() => aoMudar({ ...f, periodo: null })}>Sempre</button>
        {PERIODOS.map((p) => (
          <button key={p.id} className={`chip${f.periodo === p.id ? " ligado" : ""}`} onClick={() => aoMudar({ ...f, periodo: p.id })}>{p.nome}</button>
        ))}
      </div>
      {datas.map((p) => {
        const fd = f.datas?.[p.id];
        const chip = (rotulo: string, novo: FiltroData | null, ligado: boolean) => (
          <button key={rotulo} className={`chip${ligado ? " ligado" : ""}`} onClick={() => mudarData(p.id, novo)}>{rotulo}</button>
        );
        return (
          <div key={p.id}>
            <div className="menu-rotulo">{p.nome}</div>
            <div className="filtro-chips">
              {chip("Qualquer", null, !fd)}
              {chip("Vencidos", { modo: "vencidos" }, fd?.modo === "vencidos")}
              {chip("Hoje", { modo: "hoje" }, fd?.modo === "hoje")}
              {chip("Esta semana", { modo: "semana" }, fd?.modo === "semana")}
              {chip("Sem data", { modo: "sem" }, fd?.modo === "sem")}
              <span className={`chip chip-dias${fd?.modo === "proximos" ? " ligado" : ""}`} onClick={() => fd?.modo !== "proximos" && mudarData(p.id, { modo: "proximos", dias: 7, com_vencidos: true })}>
                Próximos
                <input
                  type="number"
                  min={1}
                  value={fd?.modo === "proximos" ? fd.dias ?? 7 : 7}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => mudarData(p.id, { modo: "proximos", dias: Math.max(1, Number(e.target.value) || 1), com_vencidos: fd?.com_vencidos ?? true })}
                />
                dias
              </span>
              {fd?.modo === "proximos" && (
                <label className="chip" style={{ cursor: "pointer" }}>
                  <input type="checkbox" checked={!!fd.com_vencidos} onChange={(e) => mudarData(p.id, { ...fd, com_vencidos: e.target.checked })} style={{ accentColor: "var(--acento)", marginRight: 4 }} />
                  e os vencidos
                </label>
              )}
            </div>
          </div>
        );
      })}
      {relacoes.map((p) => {
        const fd = f.datas?.[p.id];
        return (
          <div key={p.id}>
            <div className="menu-rotulo">{p.nome}</div>
            <div className="filtro-chips">
              <button className={`chip${!fd ? " ligado" : ""}`} onClick={() => mudarData(p.id, null)}>Qualquer</button>
              <button className={`chip${fd?.modo === "preenchido" ? " ligado" : ""}`} onClick={() => mudarData(p.id, { modo: "preenchido" })}>Preenchida</button>
              <button className={`chip${fd?.modo === "sem" ? " ligado" : ""}`} onClick={() => mudarData(p.id, { modo: "sem" })}>Vazia</button>
            </div>
          </div>
        );
      })}
      {props.map((p) => {
        const ops = opcoesDaVisao(p);
        if (!ops.length) return null;
        return (
          <div key={p.id}>
            <div className="menu-rotulo">{p.nome}</div>
            <div className="filtro-chips">
              {ops.map((o) => (
                <button key={o.nome} className={`chip-tag${f.props?.[p.id]?.includes(o.nome) ? " ligado" : ""}`} onClick={() => alternarValor(p.id, o.nome)}>
                  <Etiqueta opcao={o} status={p.especie === "status"} />
                </button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="menu-sep" />
      <button className="menu-item" onClick={() => aoMudar({ esconder_historico: f.esconder_historico })}>Limpar filtros</button>
    </Popover>
  );
}
