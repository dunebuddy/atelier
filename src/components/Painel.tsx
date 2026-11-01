import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeftToLine, Bot, ChevronLeft, ChevronRight, Columns2, FolderOpen, FolderTree, GalleryHorizontalEnd, LayoutPanelLeft,
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

export interface Contexto {
  esquema: Esquema;
  visoes: Visao[];
  salvarVisao: (id: number, d: Partial<Visao>) => void;
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

  // fita: a janela ativa sempre inteira à vista
  useEffect(() => {
    setRolagem((rs) => estado.metades.map((m, mi) => (m.modo === "fita" ? P.rolagemPara(m, corpoDe(mi).w, m.ativa, rs[mi] ?? 0) : 0)));
  }, [estado, tam.w]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const pegar = (j: Janela) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/atelier-janela", j.id);
    e.dataTransfer.effectAllowed = "move";
    setArrastando(j.id);
  };
  const soltarEm = (mi: number, antesDe?: string) => (e: React.DragEvent) => {
    const id = e.dataTransfer.getData("text/atelier-janela");
    setArrastando(null);
    setSobre(null);
    if (!id) return;
    e.preventDefault();
    mudar((s) => P.mover(s, id, mi, antesDe));
  };
  const aceitar = (chave: string) => (e: React.DragEvent) => {
    if (!arrastando) return;
    e.preventDefault();
    setSobre(chave);
  };

  return (
    <div className={`painel${arrastando ? " arrastando" : ""}${animar ? " animar" : ""}`} ref={caixa} onDragEnd={() => { setArrastando(null); setSobre(null); }}>
      {estado.metades.map((m, mi) => {
        const r = retMetade(mi);
        const focada = estado.foco === mi;
        return (
          <div
            key={`cab${mi}`}
            className={`metade-cabeca${focada && duas ? " focada" : ""}${sobre === `m${mi}` ? " soltar" : ""}`}
            style={{ left: r.x, width: r.w, height: CABECA }}
            onDragOver={aceitar(`m${mi}`)}
            onDrop={soltarEm(mi)}
            onMouseDown={() => !focada && mudar((s) => ({ ...s, foco: mi }))}
          >
            <div className="seletor-modo" title="Como arrumar as janelas desta metade">
              {MODOS.map((x) => (
                <button key={x.id} className={m.modo === x.id ? "ativo" : ""} title={`${x.nome} (${x.atalho})`} onClick={() => mudar((s) => P.mudarModo(s, mi, x.id))}>
                  {x.icone}
                </button>
              ))}
            </div>
            <div className="abas" onWheel={(e) => { (e.currentTarget as HTMLDivElement).scrollLeft += e.deltaY; }}>
              {m.janelas.map((j) => (
                <div
                  key={j.id}
                  className={`aba${j.id === m.ativa ? " ativa" : ""}${sobre === j.id ? " soltar-antes" : ""}${j.empilhada && m.modo === "fita" ? " empilhada" : ""}`}
                  draggable
                  onDragStart={pegar(j)}
                  onDragOver={aceitar(j.id)}
                  onDrop={(e) => { e.stopPropagation(); soltarEm(mi, j.id)(e); }}
                  onClick={() => mudar((s) => P.ativar(s, mi, j.id))}
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
            onMouseDown={() => mudar((s) => ({ ...s, foco: mi }))} onDragOver={aceitar(`m${mi}`)} onDrop={soltarEm(mi)}>
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
            className={`janela${ativa ? " ativa" : ""}${m.modo !== "abas" && m.janelas.length > 1 ? " moldura" : ""}`}
            style={{
              left: l.r.x, top: l.r.y, width: l.r.w, height: l.r.h,
              display: l.visivel ? undefined : "none",
              clipPath: corte.top || corte.right || corte.bottom || corte.left ? `inset(${corte.top}px ${corte.right}px ${corte.bottom}px ${corte.left}px)` : undefined,
            }}
            onMouseDownCapture={() => { if (m.ativa !== j.id || estado.foco !== mi) mudar((s) => P.ativar(s, mi, j.id)); }}
          >
            {l.cabeca && m.janelas.length > 1 && (
              <div className="janela-cabeca" draggable onDragStart={pegar(j)}>
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
          onDragOver={aceitar("nova")} onDrop={soltarEm(1)}>
          Solte aqui para abrir na metade da direita
        </div>
      )}
      {arrastando && duas && estado.metades.map((_, mi) => (
        <div key={`zona${mi}`} className={`soltar-metade${sobre === `z${mi}` ? " sobre" : ""}`} style={{ left: corpoDe(mi).x, top: CABECA, width: corpoDe(mi).w, bottom: 0 }}
          onDragOver={aceitar(`z${mi}`)} onDrop={soltarEm(mi)} />
      ))}
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
