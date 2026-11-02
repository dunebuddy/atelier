import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeftToLine, Bot, ChevronDown, ChevronLeft, ChevronRight, Columns2, FolderOpen, FolderTree, GalleryHorizontalEnd, LayoutPanelLeft, List,
  PanelTop, Rows2, SquareTerminal, X,
} from "lucide-react";
import { Esquema, Visao } from "../api";
import * as P from "../painel";
import { EstadoPainel, Janela, Lugar, Modo, rotaDe } from "../painel";
import { Rota } from "../ui";
import { ConfigTipo } from "./ConfigTipo";
import { ArvoreArquivos, Explorador } from "./Explorador";
import { Lixeira } from "./Lixeira";
import { PaginaItem } from "./PaginaItem";
import { BotaoTerminal, TerminalJanela } from "./Terminal";
import { VisaoTela } from "./Visao";
import { VisivelContext } from "../visivel";
import { Popover, usePopover } from "./Popover";
import "../painel-arrastar.css";

export interface Contexto {
  esquema: Esquema;
  visoes: Visao[];
  salvarVisao: (id: number, d: Partial<Visao>) => void;
  /** cria uma visão no menu e devolve o id */
  criarVisao: (d: Partial<Visao>) => Promise<number>;
  apagarVisao: (id: number) => Promise<void>;
  aoMudarEsquema: () => Promise<void>;
}

type Mudar = (f: (e: EstadoPainel) => EstadoPainel) => void;

const CABECA = 38;

export const MODOS: { id: Modo; nome: string; icone: React.ReactNode; atalho: string }[] = [
  { id: "abas", nome: "Abas", icone: <PanelTop size={15} />, atalho: "Ctrl+Alt+1" },
  { id: "tile", nome: "Tile: um principal e os outros empilhados", icone: <LayoutPanelLeft size={15} />, atalho: "Ctrl+Alt+2" },
  { id: "fita", nome: "Fita: colunas lado a lado que rolam", icone: <GalleryHorizontalEnd size={15} />, atalho: "Ctrl+Alt+3" },
];

const FRACOES: Record<number, string> = { 1: "1/1", 2: "1/2", 3: "1/3", 4: "1/4" };

/** Como arrumar as janelas da metade: um botão com o modo atual e a setinha (se ajusta uma vez e pronto). */
function SeletorModo({ modo, aoEscolher }: { modo: Modo; aoEscolher: (m: Modo) => void }) {
  const pop = usePopover();
  const atual = MODOS.find((x) => x.id === modo) ?? MODOS[0];
  return (
    <span className="seletor-modo">
      <button className="btn-icone" title={`Arrumação desta metade: ${atual.nome}`} onClick={pop.abrir}>
        {atual.icone}<ChevronDown size={12} />
      </button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={290}>
          <div className="menu-rotulo">Arrumar as janelas desta metade</div>
          {MODOS.map((x) => (
            <button key={x.id} className="menu-item" onClick={() => { aoEscolher(x.id); pop.fechar(); }} style={x.id === modo ? { fontWeight: 600 } : undefined}>
              {x.icone} <span style={{ flex: 1 }}>{x.nome}</span> <kbd>{x.atalho}</kbd>
            </button>
          ))}
        </Popover>
      )}
    </span>
  );
}

function IconeJanela({ j }: { j: Janela }) {
  const r = rotaDe(j);
  if (r.v === "terminal") return r.programa ? <Bot size={13} /> : <SquareTerminal size={13} />;
  if (r.v === "arquivos") return <FolderOpen size={13} />;
  if (r.v === "pastas") return <FolderTree size={13} />;
  return <span className="j-emoji">{j.icone ?? "·"}</span>;
}

/** `ativo`: é o workspace que está na tela (os outros ficam montados por trás). */
export function PainelTrabalho({ estado, mudar, ctx, ativo }: { estado: EstadoPainel; mudar: Mudar; ctx: Contexto; ativo: boolean }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 0, h: 0 });
  const [rolagem, setRolagem] = useState<number[]>([0, 0]);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  // só anima depois de medir: na abertura as janelas não "crescem" do canto
  const [animar, setAnimar] = useState(false);
  useEffect(() => {
    if (tam.w && !animar) requestAnimationFrame(() => requestAnimationFrame(() => setAnimar(true)));
  }, [tam.w, animar]);

  useLayoutEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setTam({ w: el.clientWidth, h: el.clientHeight }));
    obs.observe(el);
    setTam({ w: el.clientWidth, h: el.clientHeight });
    return () => obs.disconnect();
  }, []);

  const duas = estado.metades.length > 1;
  const retMetade = (mi: number): P.Retangulo => {
    if (!duas) return { x: 0, y: 0, w: tam.w, h: tam.h };
    const corte = Math.round(tam.w * estado.divisao);
    return mi === 0 ? { x: 0, y: 0, w: corte - 3, h: tam.h } : { x: corte + 3, y: 0, w: tam.w - corte - 3, h: tam.h };
  };
  const corpoDe = (mi: number): P.Retangulo => {
    const m = retMetade(mi);
    return { x: m.x, y: m.y + CABECA, w: m.w, h: m.h - CABECA };
  };

  // fita: a janela ativa sempre inteira à vista; a de antes fica junto quando cabe (como no Niri)
  const ativasAntes = useRef<(string | null)[]>([]);
  useEffect(() => {
    setRolagem((rs) => estado.metades.map((m, mi) => (m.modo === "fita" ? P.rolagemPara(m, corpoDe(mi).w, m.ativa, rs[mi] ?? 0, ativasAntes.current[mi]) : 0)));
    ativasAntes.current = estado.metades.map((m) => m.ativa);
  }, [estado, tam.w]); // eslint-disable-line react-hooks/exhaustive-deps

  // o teclado vai junto com o foco (Ctrl+Alt+setas): se ele ficou numa janela que deixou de ser a ativa (ou em lugar
  // nenhum), passa para o terminal da nova ou sai da velha (senão o que se digita cai na janela de antes)
  useEffect(() => {
    const foco = document.activeElement as HTMLElement | null;
    const velha = foco?.closest?.(".janela");
    if (velha?.classList.contains("ativa") || (!velha && foco && foco !== document.body)) return;
    const term = caixa.current?.querySelector<HTMLElement>(".janela.ativa .xterm-helper-textarea");
    if (term) term.focus();
    else if (velha) foco?.blur();
  }, [estado]);

  const lugares: Lugar[] = estado.metades.flatMap((m, mi) => P.arrumar(m, mi, corpoDe(mi), rolagem[mi] ?? 0));
  // todas as janelas num lugar só do DOM: mudar de modo ou de metade não desmonta nada (o terminal continua vivo)
  const todas = estado.metades.flatMap((m, mi) => m.janelas.map((j) => ({ j, mi })));
  todas.sort((a, b) => (a.j.id < b.j.id ? -1 : 1));

  const arrastarDivisao = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = caixa.current!.getBoundingClientRect().left;
    const mover = (ev: MouseEvent) => mudar((s) => P.mudarDivisao(s, (ev.clientX - x0) / tam.w));
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
  };
  const arrastarProporcao = (mi: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    const c = corpoDe(mi);
    const x0 = caixa.current!.getBoundingClientRect().left + c.x;
    const mover = (ev: MouseEvent) => mudar((s) => P.mudarProporcao(s, mi, (ev.clientX - x0) / c.w));
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); };
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
  };

  // Arrastar janela por eventos de ponteiro, não pelo arrastar HTML5: no app instalado (WebView2) o soltar de
  // arquivos do sistema que o Tauri liga bloqueia o arrastar HTML5 dentro da página ("não pode soltar").
  // Alvos marcados com data-soltar-metade (+ data-soltar-antes numa aba; data-soltar-chave é o realce).
  const fantasma = useRef<HTMLDivElement>(null);
  const posFantasma = useRef({ x: 0, y: 0 });
  const pegar = (j: Janela) => (e: React.PointerEvent<HTMLElement>) => {
    // só o botão esquerdo, e não nos botões de dentro (fechar, larguras...)
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    const el = e.currentTarget;
    const { pointerId: pid, clientX: x0, clientY: y0 } = e;
    let ativo = false;
    let alvo: { mi: number; antes?: string } | null = null;
    const mover = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      // só vira arrasto depois de andar uns pixels: clique normal continua ativando a aba
      if (!ativo) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
        ativo = true;
        // com a captura, passar por cima do terminal ou de um iframe não rouba os eventos
        try { el.setPointerCapture(pid); } catch { /* ponteiro já solto */ }
        setArrastando(j.id);
      }
      posFantasma.current = { x: ev.clientX, y: ev.clientY };
      if (fantasma.current) fantasma.current.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 10}px)`;
      const t = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-soltar-metade]");
      const dentro = !!t && !!caixa.current?.contains(t);
      alvo = dentro ? { mi: Number(t.dataset.soltarMetade), antes: t.dataset.soltarAntes } : null;
      setSobre(dentro ? t.dataset.soltarChave ?? null : null);
    };
    const fim = (soltar: boolean) => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", aoSoltar);
      window.removeEventListener("pointercancel", aoCancelar);
      window.removeEventListener("keydown", aoTecla, true);
      if (!ativo) return;
      try { el.releasePointerCapture(pid); } catch { /* já solto */ }
      // o clique que vem logo depois do soltar não ativa a aba de origem
      const engolir = (ev: MouseEvent) => { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener("click", engolir, true);
      setTimeout(() => window.removeEventListener("click", engolir, true), 0);
      setArrastando(null);
      setSobre(null);
      const a = alvo;
      if (soltar && a) mudar((s) => P.mover(s, j.id, a.mi, a.antes));
    };
    const aoSoltar = (ev: PointerEvent) => { if (ev.pointerId === pid) fim(true); };
    const aoCancelar = (ev: PointerEvent) => { if (ev.pointerId === pid) fim(false); };
    const aoTecla = (ev: KeyboardEvent) => { if (ev.key === "Escape" && ativo) { ev.stopPropagation(); fim(false); } };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", aoSoltar);
    window.addEventListener("pointercancel", aoCancelar);
    window.addEventListener("keydown", aoTecla, true);
  };
  const alvo = (chave: string, mi: number, antesDe?: string) => ({
    "data-soltar-chave": chave, "data-soltar-metade": mi, ...(antesDe ? { "data-soltar-antes": antesDe } : {}),
  });
  const janelaArrastada = arrastando ? P.acharJanela(estado, arrastando)?.j : undefined;

  // lista de todas as abas de uma metade (as que não cabem ficam escondidas à direita)
  const [listaAbas, setListaAbas] = useState<{ ancora: HTMLElement; mi: number } | null>(null);
  // a aba ativa sempre à vista na faixa de abas
  useEffect(() => {
    for (const m of estado.metades) {
      if (!m.ativa) continue;
      caixa.current?.querySelector<HTMLElement>(`[data-aba="${CSS.escape(m.ativa)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [estado]);

  // menu do botão direito na aba
  const [menu, setMenu] = useState<{ ancora: HTMLElement; id: string; mi: number } | null>(null);
  const doMenu = (f: (s: EstadoPainel, id: string, mi: number) => EstadoPainel) => () => {
    if (!menu) return;
    const { id, mi } = menu;
    setMenu(null);
    mudar((s) => f(s, id, mi));
  };

  return (
    <div className={`painel${arrastando ? " arrastando" : ""}${animar ? " animar" : ""}`} ref={caixa}>
      {estado.metades.map((m, mi) => {
        const r = retMetade(mi);
        const focada = estado.foco === mi;
        return (
          <div
            key={`cab${mi}`}
            className={`metade-cabeca${focada && duas ? " focada" : ""}${sobre === `m${mi}` ? " soltar" : ""}`}
            style={{ left: r.x, width: r.w, height: CABECA }}
            {...alvo(`m${mi}`, mi)}
            onMouseDown={() => !focada && mudar((s) => ({ ...s, foco: mi }))}
          >
            {m.janelas.length > 1 && (
              <button className="btn-icone botao-abas" title="Todas as abas desta metade" onClick={(e) => setListaAbas({ ancora: e.currentTarget, mi })}>
                <List size={15} />
              </button>
            )}
            <div className="abas" onWheel={(e) => { (e.currentTarget as HTMLDivElement).scrollLeft += e.deltaY + e.deltaX; }}>
              {m.janelas.map((j) => (
                <div
                  key={j.id}
                  data-aba={j.id}
                  className={`aba${j.id === m.ativa ? " ativa" : ""}${sobre === j.id ? " soltar-antes" : ""}${j.empilhada && m.modo === "fita" ? " empilhada" : ""}${arrastando === j.id ? " arrastada" : ""}`}
                  {...alvo(j.id, mi, j.id)}
                  onPointerDown={pegar(j)}
                  onClick={() => mudar((s) => P.ativar(s, mi, j.id))}
                  onContextMenu={(e) => { e.preventDefault(); setMenu({ ancora: e.currentTarget, id: j.id, mi }); }}
                  onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); mudar((s) => P.fechar(s, j.id)); } }}
                  title={j.titulo}
                >
                  <IconeJanela j={j} />
                  <span className="aba-rotulo">{j.titulo ?? "…"}</span>
                  <button title="Fechar (Ctrl+W)" onClick={(e) => { e.stopPropagation(); mudar((s) => P.fechar(s, j.id)); }}><X size={12} /></button>
                </div>
              ))}
            </div>
            {m.modo === "fita" && (
              <div className="fita-nav">
                <button className="btn-icone" title="Janela anterior (Ctrl+Alt+←)" onClick={() => mudar((s) => P.focarVizinha({ ...s, foco: mi }, -1))}><ChevronLeft size={15} /></button>
                <button className="btn-icone" title="Próxima janela (Ctrl+Alt+→)" onClick={() => mudar((s) => P.focarVizinha({ ...s, foco: mi }, 1))}><ChevronRight size={15} /></button>
              </div>
            )}
            <SeletorModo modo={m.modo} aoEscolher={(x) => mudar((s) => P.mudarModo(s, mi, x))} />
            <BotaoTerminal />
            {mi === estado.metades.length - 1 && (
              <button className="btn-icone" title={duas ? "Juntar as metades (Ctrl+Alt+\\)" : "Dividir o painel em dois (Ctrl+Alt+\\)"} onClick={() => mudar(P.dividir)}>
                {duas ? <ArrowLeftToLine size={15} /> : <Columns2 size={15} />}
              </button>
            )}
          </div>
        );
      })}

      {duas && <div className="alca-painel" title="Arraste para mudar o tamanho das metades" style={{ left: retMetade(0).w - 1, width: 8 }} onMouseDown={arrastarDivisao} />}

      {estado.metades.map((m, mi) =>
        m.modo === "tile" && m.janelas.length > 1 ? (
          <div key={`prop${mi}`} className="alca-painel" style={{ left: corpoDe(mi).x + corpoDe(mi).w * m.proporcao - 3, top: CABECA, width: 6, bottom: 0 }} onMouseDown={arrastarProporcao(mi)} />
        ) : null,
      )}

      {estado.metades.map((m, mi) =>
        !m.janelas.length ? (
          <div key={`vazia${mi}`} className="metade-vazia" style={{ left: corpoDe(mi).x, top: CABECA, width: corpoDe(mi).w, bottom: 0 }}
            onMouseDown={() => mudar((s) => ({ ...s, foco: mi }))} {...alvo(`m${mi}`, mi)}>
            Metade vazia. Clique aqui e escolha uma visão na barra ao lado, use Ctrl+K, abra um terminal ou arraste uma aba para cá.
          </div>
        ) : null,
      )}

      {todas.map(({ j, mi }) => {
        const l = lugares.find((x) => x.id === j.id);
        if (!l) return null;
        const m = estado.metades[mi];
        const corpo = corpoDe(mi);
        // fita: a parte que sai da metade fica cortada
        const corte = {
          top: Math.max(0, corpo.y - l.r.y),
          right: Math.max(0, l.r.x + l.r.w - (corpo.x + corpo.w)),
          bottom: Math.max(0, l.r.y + l.r.h - (corpo.y + corpo.h)),
          left: Math.max(0, corpo.x - l.r.x),
        };
        const ativa = m.ativa === j.id && estado.foco === mi;
        return (
          <section
            key={j.id}
            className={`janela${ativa ? " ativa" : ""}${m.modo !== "abas" && m.janelas.length > 1 ? " moldura" : ""}${m.modo === "fita" ? " na-fita" : ""}`}
            style={{
              left: l.r.x, top: l.r.y, width: l.r.w, height: l.r.h,
              // na fita, as janelas de fora seguem no lugar (cortadas): assim deslizam para dentro em vez de surgir
              display: l.visivel || m.modo === "fita" ? undefined : "none",
              // na fita o corte vale sempre (mesmo zerado), para animar junto com a posição
              clipPath: m.modo === "fita" || corte.top || corte.right || corte.bottom || corte.left ? `inset(${corte.top}px ${corte.right}px ${corte.bottom}px ${corte.left}px)` : undefined,
            }}
            onMouseDownCapture={() => { if (m.ativa !== j.id || estado.foco !== mi) mudar((s) => P.ativar(s, mi, j.id)); }}
          >
            {l.cabeca && m.janelas.length > 1 && (
              <div className="janela-cabeca" onPointerDown={pegar(j)}>
                <IconeJanela j={j} />
                <span className="aba-rotulo">{j.titulo ?? "…"}</span>
                {m.modo === "fita" && (
                  <>
                    <div className="larguras" title="Largura da coluna (Ctrl+Alt+R)">
                      {P.LARGURAS.map((n) => (
                        <button key={n} className={j.largura === n ? "ativo" : ""} onClick={() => mudar((s) => P.mudarLargura(s, j.id, n))}>{FRACOES[n]}</button>
                      ))}
                    </div>
                    {m.janelas[0].id !== j.id && (
                      <button className="btn-icone mini" title={j.empilhada ? "Tirar da coluna (Ctrl+Alt+↑)" : "Empilhar embaixo da anterior (Ctrl+Alt+↓)"} onClick={() => mudar((s) => P.empilhar(s, j.id, !j.empilhada))}>
                        <Rows2 size={13} />
                      </button>
                    )}
                  </>
                )}
                {m.modo === "tile" && m.janelas[0].id !== j.id && (
                  <button className="btn-icone mini" title="Virar a principal (Ctrl+Alt+Enter)" onClick={() => mudar((s) => P.promover(s, j.id))}><LayoutPanelLeft size={13} /></button>
                )}
                <button className="btn-icone mini" title="Fechar (Ctrl+W)" onClick={() => mudar((s) => P.fechar(s, j.id))}><X size={13} /></button>
              </div>
            )}
            <div className="janela-corpo">
              {/* o terminal segue o lugar da janela; o resto também para quando o workspace está escondido */}
              <VisivelContext.Provider value={ativo && l.visivel}>
                <Conteudo j={j} ctx={ctx} visivel={l.visivel} mudar={mudar} />
              </VisivelContext.Provider>
            </div>
          </section>
        );
      })}

      {arrastando && estado.metades.length === 1 && (
        <div className={`soltar-metade${sobre === "nova" ? " sobre" : ""}`} style={{ left: tam.w / 2, top: CABECA, width: tam.w / 2, bottom: 0 }}
          {...alvo("nova", 1)}>
          Solte aqui para abrir na metade da direita
        </div>
      )}
      {arrastando && duas && estado.metades.map((_, mi) => (
        <div key={`zona${mi}`} className={`soltar-metade${sobre === `z${mi}` ? " sobre" : ""}`} style={{ left: corpoDe(mi).x, top: CABECA, width: corpoDe(mi).w, bottom: 0 }}
          {...alvo(`z${mi}`, mi)} />
      ))}

      {janelaArrastada && createPortal(
        <div className="aba-fantasma" ref={fantasma} style={{ transform: `translate(${posFantasma.current.x + 12}px, ${posFantasma.current.y + 10}px)` }}>
          <IconeJanela j={janelaArrastada} />
          <span className="aba-rotulo">{janelaArrastada.titulo ?? "…"}</span>
        </div>,
        document.body,
      )}

      {listaAbas && estado.metades[listaAbas.mi] && (
        <Popover ancora={listaAbas.ancora} aoFechar={() => setListaAbas(null)} largura={300}>
          <div className="menu-rotulo">Abas desta metade</div>
          {estado.metades[listaAbas.mi].janelas.map((j) => {
            const ativa = j.id === estado.metades[listaAbas.mi].ativa;
            return (
              <button key={j.id} className="menu-item" style={ativa ? { fontWeight: 600 } : undefined}
                onClick={() => { const mi = listaAbas.mi; setListaAbas(null); mudar((s) => P.ativar(s, mi, j.id)); }}>
                <IconeJanela j={j} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.titulo ?? "…"}</span>
                {ativa && <span className="dir">aberta</span>}
              </button>
            );
          })}
        </Popover>
      )}

      {menu && (
        <Popover ancora={menu.ancora} aoFechar={() => setMenu(null)} largura={250}>
          <button className="menu-item" onClick={doMenu(P.moverParaOutraMetade)}>
            <Columns2 size={14} /> {duas ? "Mover para a outra metade" : "Mover para a metade da direita"}
          </button>
          <button className="menu-item" onClick={doMenu((s, id) => P.fechar(s, id))}>
            <X size={14} /> Fechar
          </button>
          <button className="menu-item" onClick={doMenu(P.fecharOutras)}>
            <X size={14} /> Fechar as outras desta metade
          </button>
        </Popover>
      )}
    </div>
  );
}

// Ctrl+clique (ou clique do meio) em qualquer coisa que navega dentro de uma janela abre ao lado, em vez de trocar
let aoLadoAte = 0;
const marcar = (e: MouseEvent) => { if (e.ctrlKey || e.metaKey || e.button === 1) aoLadoAte = Date.now() + 400; };
window.addEventListener("click", marcar, true);
window.addEventListener("auxclick", marcar, true);

/** O que a janela mostra, conforme a rota dela. */
function Conteudo({ j, ctx, visivel, mudar }: { j: Janela; ctx: Contexto; visivel: boolean; mudar: Mudar }) {
  const r = rotaDe(j);
  const ir = (nova: Rota) => {
    const aoLado = Date.now() < aoLadoAte;
    aoLadoAte = 0;
    mudar((s) => (aoLado ? P.abrirNova(s, nova, P.acharJanela(s, j.id)?.mi ?? s.foco) : P.irNaJanela(s, j.id, nova)));
  };
  const rotular = (d: Pick<Janela, "titulo" | "icone" | "tipo_id">) => mudar((s) => P.rotular(s, j.id, d));
  const { esquema, visoes } = ctx;

  // "início" ou visão que não existe mais: vira a primeira visão
  const visao = r.v === "visao" ? visoes.find((v) => v.id === r.id) : undefined;
  const cair = (r.v === "inicio" || (r.v === "lista" && r.tipo === null) || (r.v === "visao" && !visao)) && visoes.length > 0;
  useEffect(() => {
    if (cair) mudar((s) => P.substituir(s, j.id, { v: "visao", id: visoes[0].id }));
  }, [cair]); // eslint-disable-line react-hooks/exhaustive-deps

  const tipoDaLista = r.v === "lista" ? esquema.tipos.find((t) => t.id === r.tipo) : undefined;
  const tipoConfig = r.v === "tipo" ? esquema.tipos.find((t) => t.id === r.id) : undefined;
  // título e ícone da aba
  useEffect(() => {
    if (visao) rotular({ titulo: visao.nome, icone: visao.icone, tipo_id: null });
    else if (tipoDaLista) rotular({ titulo: tipoDaLista.nome, icone: tipoDaLista.icone, tipo_id: tipoDaLista.id });
    else if (r.v === "consulta") rotular({ titulo: r.titulo, icone: r.icone ?? "🔗", tipo_id: null });
    else if (r.v === "lixeira") rotular({ titulo: "Lixeira", icone: "🗑️", tipo_id: null });
    else if (tipoConfig) rotular({ titulo: `Tipo: ${tipoConfig.nome}`, icone: tipoConfig.icone, tipo_id: null });
    else if (r.v === "terminal") rotular({ titulo: r.titulo ?? "terminal", tipo_id: null });
    else if (r.v === "pastas") rotular({ titulo: r.titulo ?? r.raiz.split(/[\\/]/).filter(Boolean).pop() ?? "pastas", tipo_id: null });
    else if (r.v === "arquivos") rotular({ titulo: r.titulo ?? r.raiz.split(/[\\/]/).filter(Boolean).pop() ?? "arquivos", tipo_id: null });
  }, [JSON.stringify(r), visao?.nome, visao?.icone, tipoDaLista?.nome, tipoConfig?.nome]); // eslint-disable-line react-hooks/exhaustive-deps

  switch (r.v) {
    case "visao":
      return visao ? (
        <VisaoTela
          key={visao.id}
          esquema={esquema}
          visao={visao}
          salvar={(d) => ctx.salvarVisao(visao.id, d)}
          aoApagar={visao.fixa ? undefined : async () => { await ctx.apagarVisao(visao.id); ir({ v: "inicio" }); }}
          ir={ir}
          aoMudarEsquema={ctx.aoMudarEsquema}
        />
      ) : null;
    case "lista":
      return tipoDaLista ? (
        <VisaoTela
          key={-tipoDaLista.id}
          esquema={esquema}
          visao={{ id: -tipoDaLista.id, nome: tipoDaLista.nome, icone: tipoDaLista.icone, ordem: 0, layout: "tabela", filtro: { tipos: [tipoDaLista.id] }, config: {} }}
          salvar={null}
          ir={ir}
          aoMudarEsquema={ctx.aoMudarEsquema}
        />
      ) : null;
    case "consulta":
      return (
        <VisaoTela
          key={JSON.stringify(r.filtro)}
          esquema={esquema}
          visao={{ id: 0, nome: r.titulo, icone: r.icone ?? "🔗", ordem: 0, layout: "tabela", filtro: r.filtro, config: {} }}
          salvar={null}
          aoSalvarComo={async (v) => {
            const id = await ctx.criarVisao({ nome: v.nome, icone: v.icone, layout: v.layout, filtro: v.filtro, config: v.config });
            mudar((s) => P.substituir(s, j.id, { v: "visao", id }));
          }}
          ir={ir}
          aoMudarEsquema={ctx.aoMudarEsquema}
        />
      );
    case "item":
      return (
        <PaginaItem
          key={r.id}
          esquema={esquema}
          id={r.id}
          ir={ir}
          aoMudarEsquema={ctx.aoMudarEsquema}
          aoCarregar={(it) => it && rotular({ titulo: it.titulo || "Sem título", icone: esquema.tipos.find((t) => t.id === it.tipo_id)?.icone ?? "📄", tipo_id: it.tipo_id })}
        />
      );
    case "lixeira":
      return <Lixeira esquema={esquema} ir={ir} />;
    case "tipo":
      return <ConfigTipo key={r.id} esquema={esquema} id={r.id} ir={ir} aoMudarEsquema={ctx.aoMudarEsquema} />;
    case "terminal":
      return <TerminalJanela sessao={r.sessao} cwd={r.cwd} programa={r.programa} shell={r.shell} visivel={visivel} />;
    case "pastas":
      return <ArvoreArquivos key={r.raiz} raiz={r.raiz} titulo={r.titulo} />;
    case "arquivos":
      return <Explorador key={r.raiz + (r.arquivo ?? "")} raiz={r.raiz} arquivo={r.arquivo} titulo={r.titulo} />;
    default:
      return null;
  }
}
