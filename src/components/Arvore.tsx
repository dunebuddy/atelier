import { useEffect, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronRight, ListTree, RefreshCw } from "lucide-react";
import { api, Esquema, Item, Sentido, Visao } from "../api";
import { abrir, falhou, Rota } from "../ui";
import { datasDo } from "../visao";
import { BotaoWorkspace } from "./BotaoWorkspace";
import { Popover, usePopover } from "./Popover";
import { codigos } from "./Valor";
import { ehHistorico, visivelNaVisao } from "./Visao";

/**
 * Visão focada na barra lateral: ela sobe para o topo, as outras somem, e os itens dela aparecem em árvore.
 * O nível de baixo vem da propriedade de relação escolhida na visão (config.arvore). Não se atualiza sozinha:
 * o botão de recarregar busca de novo.
 */
export function ArvoreVisao({ visao, esquema, rota, ir, aoSair, aoMudarVisoes }: {
  visao: Visao;
  esquema: Esquema;
  rota: Rota;
  ir: (r: Rota) => void;
  aoSair: () => void;
  aoMudarVisoes: () => Promise<void>;
}) {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [recarga, setRecarga] = useState(0);
  const config = visao.config?.arvore ?? null;
  const pConfig = usePopover();
  const prop = config ? esquema.propriedades.find((p) => p.id === config.prop && p.especie === "relacao") : undefined;

  useEffect(() => {
    const f = visao.filtro ?? {};
    const datas = f.periodo ? datasDo(f.periodo) : null;
    setItens(null);
    api.itensDaVisao(f, datas)
      .then((l) => setItens(l.filter((i) => visivelNaVisao(esquema, f, i))))
      .catch(falhou);
  }, [visao.id, JSON.stringify(visao.filtro), recarga]); // eslint-disable-line react-hooks/exhaustive-deps

  // "só as raízes": some quem já aparece embaixo de outro item da lista
  let raizes = itens ?? [];
  if (prop && config?.so_raizes && itens) {
    const cods = new Set(itens.map((i) => i.codigo));
    raizes = itens.filter((i) =>
      config.sentido === "apontado"
        ? !codigos(i.props[prop.id]).some((c) => cods.has(c) && c !== i.codigo)
        : !itens.some((o) => o.id !== i.id && codigos(o.props[prop.id]).includes(i.codigo)),
    );
  }

  const gravar = async (arvore: Visao["config"]["arvore"]) => {
    try {
      await api.atualizarVisao(visao.id, { config: { ...visao.config, arvore } });
      await aoMudarVisoes();
    } catch (e) {
      falhou(e);
    }
  };
  const relacoes = esquema.propriedades.filter((p) => p.especie === "relacao");

  return (
    <div className="arvore">
      <div className="arv-topo">
        <button className="btn-icone" title="Voltar para todas as visões" onClick={aoSair}><ArrowLeft size={15} /></button>
        <button className={`sb-item arv-visao${rota.v === "visao" && rota.id === visao.id ? " ativo" : ""}`} onClick={() => ir({ v: "visao", id: visao.id })} title="Abrir a visão no painel">
          <span className="tipo-chip">{visao.icone}</span>
          <span className="rotulo">{visao.nome}</span>
        </button>
        <button className="btn-icone" title="Árvore: o que aparece embaixo de cada documento" onClick={pConfig.abrir}><ListTree size={15} /></button>
        <button className="btn-icone" title="Recarregar" onClick={() => setRecarga((n) => n + 1)}><RefreshCw size={14} /></button>
      </div>
      {prop && (
        <div className="arv-legenda">
          embaixo de cada item: {config!.sentido === "apontado" ? prop.config?.inverso || `${prop.nome} (de)` : prop.nome}
        </div>
      )}
      <div className="arv-lista">
        {itens === null && <div className="arv-vazio">Carregando…</div>}
        {itens && raizes.length === 0 && <div className="arv-vazio">Nenhum documento nesta visão.</div>}
        {raizes.map((it) => (
          <No key={`${it.id}-${recarga}`} item={it} esquema={esquema} rota={rota} ir={ir} prop={prop?.id ?? null} sentido={config?.sentido ?? "aponta"} nivel={0} caminho={[it.id]} esconder={!!visao.filtro?.esconder_historico} />
        ))}
      </div>

      {pConfig.ancora && (
        <Popover ancora={pConfig.ancora} aoFechar={pConfig.fechar} largura={290}>
          <div className="menu-rotulo">Embaixo de cada documento, mostrar</div>
          <button className="menu-item" onClick={() => { gravar(null); pConfig.fechar(); }}>
            Nada (lista simples) {!prop && <span className="dir">✓</span>}
          </button>
          {relacoes.map((p) =>
            (["aponta", "apontado"] as Sentido[]).map((s) => {
              const nome = s === "aponta" ? p.nome : p.config?.inverso || `${p.nome} (de)`;
              const ligado = prop?.id === p.id && config?.sentido === s;
              return (
                <button key={`${p.id}${s}`} className="menu-item" onClick={() => { gravar({ prop: p.id, sentido: s, so_raizes: config?.so_raizes }); pConfig.fechar(); }}
                  title={s === "aponta" ? `Os documentos que estão no "${p.nome}" de cada um` : `Os documentos que têm cada um no "${p.nome}" deles`}>
                  {nome}
                  {s === "apontado" && <span className="dir" style={{ fontSize: 11 }}>{ligado ? "✓" : `inverso de ${p.nome}`}</span>}
                  {s === "aponta" && ligado && <span className="dir">✓</span>}
                </button>
              );
            }),
          )}
          {relacoes.length === 0 && <div className="menu-rotulo">Nenhuma propriedade de relação ainda. Crie uma (espécie Relação) num tipo.</div>}
          {prop && (
            <>
              <div className="menu-sep" />
              <label className="menu-item" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={!!config?.so_raizes} style={{ accentColor: "var(--acento)" }}
                  onChange={(e) => gravar({ ...config!, so_raizes: e.target.checked })} />
                Só os do topo (esconde quem já aparece embaixo de outro)
              </label>
            </>
          )}
        </Popover>
      )}
    </div>
  );
}

function No({ item, esquema, rota, ir, prop, sentido, nivel, caminho, esconder }: {
  item: Item; esquema: Esquema; rota: Rota; ir: (r: Rota) => void; prop: number | null; sentido: Sentido; nivel: number; caminho: number[];
  /** a visão esconde os concluídos (desligado por padrão) */
  esconder: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [filhos, setFilhos] = useState<Item[] | null>(null);
  const t = esquema.tipos.find((x) => x.id === item.tipo_id);
  // "aponta" já se sabe pelo próprio valor; "apontado" só perguntando
  const temFilhos = prop != null && (sentido === "apontado" || codigos(item.props[prop]).length > 0);

  const alternar = () => {
    if (!prop) return;
    if (!aberto && filhos === null) {
      api.ramo(item.id, prop, sentido)
        .then((l) => setFilhos(l.filter((x) => !caminho.includes(x.id) && !(esconder && ehHistorico(esquema, x)))))
        .catch(falhou);
    }
    setAberto((a) => !a);
  };

  return (
    <>
      <div
        className={`arv-no${rota.v === "item" && rota.id === item.id ? " ativo" : ""}`}
        data-codigo={item.codigo}
        style={{ paddingLeft: 4 + nivel * 14 }}
        onClick={(e) => (e.ctrlKey || e.metaKey ? abrir({ v: "item", id: item.id }, true) : ir({ v: "item", id: item.id }))}
        onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); abrir({ v: "item", id: item.id }, true); } }}
        title={`#${item.codigo} · Ctrl+clique abre ao lado`}
      >
        <button className={`arv-seta${temFilhos ? "" : " oculta"}`} onClick={(e) => { e.stopPropagation(); alternar(); }}>
          {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
        <span className="arv-icone">{t?.icone ?? "·"}</span>
        <span className="rotulo">{item.titulo || "Sem título"}</span>
        <BotaoWorkspace esquema={esquema} item={item} />
      </div>
      {aberto && filhos === null && <div className="arv-vazio" style={{ paddingLeft: 30 + nivel * 14 }}>…</div>}
      {aberto && filhos?.length === 0 && <div className="arv-vazio" style={{ paddingLeft: 30 + nivel * 14 }}>nada embaixo</div>}
      {aberto && filhos?.map((f) => (
        <No key={f.id} item={f} esquema={esquema} rota={rota} ir={ir} prop={prop} sentido={sentido} nivel={nivel + 1} caminho={[...caminho, f.id]} esconder={esconder} />
      ))}
    </>
  );
}
