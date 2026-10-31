import { useEffect, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, History, ListTree, Plus, Settings, Settings2, Trash2 } from "lucide-react";
import { api, Bancadas, Esquema, Visao } from "../api";
import { falhou, guardar, ler, Rota } from "../ui";
import { datasDo } from "../visao";
import { ehHistorico } from "./Visao";
import { Popover, usePopover } from "./Popover";
import { ArvoreVisao } from "./Arvore";

/** Navegação da janela com o foco: voltar, avançar e a lista do histórico. */
export interface Navegacao {
  podeVoltar: boolean;
  podeAvancar: boolean;
  voltar: () => void;
  avancar: () => void;
  passos: { rotulo: string; atual: boolean }[];
  irPara: (i: number) => void;
}

export function Sidebar({
  visoes, esquema, rota, ir, bancadas, abrirConfig, trocarBancada, fechada, aoMudarVisoes, nav, largura, setLargura,
}: {
  nav: Navegacao;
  largura: number;
  setLargura: (n: number) => void;
  visoes: Visao[];
  esquema: Esquema;
  rota: Rota;
  ir: (r: Rota) => void;
  bancadas: Bancadas | null;
  abrirConfig: (secao?: "aparencia" | "bancadas" | "tipos") => void;
  trocarBancada: (caminho: string) => void;
  fechada: boolean;
  aoMudarVisoes: () => Promise<void>;
}) {
  const seletor = usePopover();
  const [fechados, setFechados] = useState<string[]>(() => ler("gruposFechados", []));
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | string | null>(null);
  const [contagens, setContagens] = useState<Record<number, number>>({});
  const [focada, setFocada] = useState<number | null>(() => ler("visaoFocada", null));
  const pHist = usePopover();
  useEffect(() => guardar("visaoFocada", focada), [focada]);
  const visaoFocada = focada != null ? visoes.find((v) => v.id === focada) : undefined;

  // arrastar a borda direita muda a largura (fica guardada)
  const arrastarBorda = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX, l0 = largura;
    const mover = (ev: MouseEvent) => setLargura(Math.min(520, Math.max(180, l0 + ev.clientX - x0)));
    const soltar = () => { window.removeEventListener("mousemove", mover); window.removeEventListener("mouseup", soltar); document.body.classList.remove("redimensionando"); };
    document.body.classList.add("redimensionando");
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
  };

  // contagem ao lado de cada visão (menos a linha do tempo); relê a cada 30 s e ao voltar para a janela
  useEffect(() => {
    const contar = () => {
      for (const v of visoes) {
        if (v.layout === "linha") continue;
        const datas = v.filtro?.periodo ? datasDo(v.filtro.periodo) : null;
        api.itensDaVisao(v.filtro ?? {}, datas)
          .then((l) => setContagens((c) => ({ ...c, [v.id]: l.filter((i) => v.filtro?.historico || !ehHistorico(esquema, i)).length })))
          .catch(() => {});
      }
    };
    contar();
    const t = window.setInterval(contar, 30000);
    window.addEventListener("focus", contar);
    return () => { window.clearInterval(t); window.removeEventListener("focus", contar); };
  }, [visoes, esquema]);

  // arrastar uma visão para cima de outra: fica antes dela e no mesmo grupo
  const soltar = async (alvo: Visao | null, grupo: string | null) => {
    const v = visoes.find((x) => x.id === arrastando);
    setArrastando(null);
    setSobre(null);
    if (!v || v.id === alvo?.id) return;
    const resto = visoes.filter((x) => x.id !== v.id);
    const pos = alvo ? resto.findIndex((x) => x.id === alvo.id) : resto.length;
    const nova = [...resto.slice(0, pos), { ...v, grupo }, ...resto.slice(pos)];
    try {
      await Promise.all(
        nova.map((x, i) => {
          const d: Partial<Visao> = {};
          if (x.ordem !== i + 1) d.ordem = i + 1;
          if (x.id === v.id && (v.grupo ?? null) !== grupo) d.grupo = grupo ?? "";
          return Object.keys(d).length ? api.atualizarVisao(x.id, d) : Promise.resolve();
        }),
      );
      await aoMudarVisoes();
    } catch (e) {
      falhou(e);
    }
  };

  const alternarGrupo = (g: string) => {
    const n = fechados.includes(g) ? fechados.filter((x) => x !== g) : [...fechados, g];
    setFechados(n);
    guardar("gruposFechados", n);
  };

  const linha = (v: Visao) => (
    <button
      key={v.id}
      draggable
      onDragStart={(e) => { setArrastando(v.id); e.dataTransfer.effectAllowed = "move"; }}
      onDragEnd={() => { setArrastando(null); setSobre(null); }}
      onDragOver={(e) => { if (arrastando != null) { e.preventDefault(); setSobre(v.id); } }}
      onDrop={(e) => { e.preventDefault(); soltar(v, v.grupo ?? null); }}
      className={`sb-item${rota.v === "visao" && rota.id === v.id ? " ativo" : ""}${sobre === v.id ? " soltar-antes" : ""}${arrastando === v.id ? " arrastando" : ""}`}
      onClick={() => ir({ v: "visao", id: v.id })}
    >
      <span className="tipo-chip">{v.icone}</span>
      <span className="rotulo">{v.nome}</span>
      {contagens[v.id] != null && <span className="conta">{contagens[v.id]}</span>}
      <span className="sb-expandir" role="button" title="Ver os itens aqui na barra" onClick={(e) => { e.stopPropagation(); setFocada(v.id); }}>
        <ListTree size={13} />
      </span>
    </button>
  );

  const soltas = visoes.filter((v) => !v.grupo);
  const grupos: string[] = [];
  for (const v of visoes) if (v.grupo && !grupos.includes(v.grupo)) grupos.push(v.grupo);

  const novaVisao = async () => {
    try {
      const { id } = await api.criarVisao({ nome: "Nova visão", icone: "◇", layout: "tabela", filtro: {}, config: {} });
      await aoMudarVisoes();
      ir({ v: "visao", id });
    } catch (e) {
      falhou(e);
    }
  };

  return (
    <aside className={`sidebar${fechada ? " fechada" : ""}`} style={{ width: largura, marginLeft: fechada ? -largura : undefined }}>
      <div className="sb-alca" onMouseDown={arrastarBorda} title="Arraste para mudar a largura" />
      <div className="sb-nav">
        <button className="btn-icone" title="Voltar (Alt+←) · botão direito: histórico" onClick={nav.voltar} disabled={!nav.podeVoltar} onContextMenu={(e) => { e.preventDefault(); pHist.abrir(e); }}><ChevronLeft size={17} /></button>
        <button className="btn-icone" title="Avançar (Alt+→) · botão direito: histórico" onClick={nav.avancar} disabled={!nav.podeAvancar} onContextMenu={(e) => { e.preventDefault(); pHist.abrir(e); }}><ChevronRight size={17} /></button>
        <button className="btn-icone" title="Histórico desta janela" onClick={pHist.abrir} disabled={nav.passos.length < 2}><History size={15} /></button>
      </div>
      {visaoFocada ? (
        <div className="sb-rolagem">
          <ArvoreVisao visao={visaoFocada} esquema={esquema} rota={rota} ir={ir} aoSair={() => setFocada(null)} aoMudarVisoes={aoMudarVisoes} />
        </div>
      ) : (
      <div className="sb-rolagem">
        <div className="sb-secao" style={{ marginTop: 6 }}>
          <div className="sb-titulo-secao">
            <span>Visões</span>
            <button title="Nova visão" onClick={novaVisao}><Plus size={14} /></button>
          </div>
          {soltas.map(linha)}
          {grupos.map((g) => {
            const fechado = fechados.includes(g);
            return (
              <div key={g} className="sb-grupo">
                <button
                  className={`sb-grupo-titulo${sobre === `g:${g}` ? " soltar-antes" : ""}`}
                  onClick={() => alternarGrupo(g)}
                  onDragOver={(e) => { if (arrastando != null) { e.preventDefault(); setSobre(`g:${g}`); } }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const primeira = visoes.find((x) => x.grupo === g && x.id !== arrastando) ?? null;
                    soltar(primeira, g);
                  }}
                >
                  {fechado ? <ChevronRight size={13} /> : <ChevronDown size={13} />} {g}
                </button>
                {!fechado && visoes.filter((v) => v.grupo === g).map(linha)}
              </div>
            );
          })}
          <button className="sb-item" onClick={novaVisao} style={{ color: "var(--texto-3)" }}>
            <span className="tipo-chip vazio"><Plus size={14} /></span>
            <span className="rotulo">Nova visão</span>
          </button>
        </div>
        <div className="sb-secao">
          <button className={`sb-item${rota.v === "lixeira" ? " ativo" : ""}`} onClick={() => ir({ v: "lixeira" })} style={{ color: "var(--texto-3)" }}>
            <span className="tipo-chip vazio" style={{ borderStyle: "solid" }}><Trash2 size={14} /></span>
            <span className="rotulo">Lixeira</span>
          </button>
        </div>
      </div>
      )}

      <div className="sb-rodape">
        <button className="bancada-atual" onClick={seletor.abrir} title="Trocar de bancada">
          <span className="bancada-icone">{bancadas?.ativa?.nome.slice(0, 1).toUpperCase() ?? "?"}</span>
          <span className="rotulo">
            <span className="sobre">Bancada</span>
            {bancadas?.ativa?.nome ?? "…"}
          </span>
          <ChevronsUpDown size={14} />
        </button>
        <button className="btn-icone" title="Tipos e modelos" onClick={() => abrirConfig("tipos")}>
          <Settings2 size={16} />
        </button>
        <button className="btn-icone" title="Configurações (Ctrl+,)" onClick={() => abrirConfig()}>
          <Settings size={17} />
        </button>
      </div>

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

      {seletor.ancora && bancadas && (
        <Popover ancora={seletor.ancora} aoFechar={seletor.fechar} largura={260}>
          <div className="menu-rotulo">Bancadas</div>
          {bancadas.bancadas.map((b) => (
            <button
              key={b.caminho}
              className="menu-item"
              title={b.caminho}
              onClick={() => { seletor.fechar(); if (b.caminho !== bancadas.ativa?.caminho) trocarBancada(b.caminho); }}
            >
              <span className="bancada-icone pequeno">{b.nome.slice(0, 1).toUpperCase()}</span> {b.nome}
              {b.caminho === bancadas.ativa?.caminho && <span className="dir"><Check size={14} /></span>}
            </button>
          ))}
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => { seletor.fechar(); abrirConfig("bancadas"); }}>
            <Settings2 size={14} /> Gerenciar bancadas…
          </button>
        </Popover>
      )}
    </aside>
  );
}
