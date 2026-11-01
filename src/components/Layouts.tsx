import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, FolderOpen, Layers, Maximize2, Type } from "lucide-react";
import { api, ConfigProp, Esquema, Item, Opcao, opcoesDe, Propriedade, Valor } from "../api";
import { avisar, falhou, Rota } from "../ui";
import { dataHora } from "../visao";
import { BotaoWorkspace } from "./BotaoWorkspace";
import { MenuPasta } from "./MenuPasta";
import { Etiqueta, IconeEspecie, textoSimples, urgencia, valorDe, ValorProp } from "./Valor";

/** Grava uma propriedade com otimismo: a tela muda na hora e confirma com o banco. */
function useMudarProp(todos: Item[], aoMudarItens: (l: Item[]) => void, esquema?: Esquema) {
  return async (it: Item, pid: number, v: Valor) => {
    const antes = it.props[pid] ?? null;
    aoMudarItens(todos.map((x) => (x.id === it.id ? { ...x, props: { ...x.props, [pid]: v } } : x)));
    try {
      const novo = await api.atualizarItem(it.id, { props: { [pid]: v } });
      aoMudarItens(todos.map((x) => (x.id === it.id ? { ...novo, corpo: undefined, notas: undefined } : x)));
      const nome = esquema?.propriedades.find((p) => p.id === pid)?.nome ?? "Propriedade";
      const fmt = (x: Valor) => (x == null || x === "" ? "vazio" : Array.isArray(x) ? x.join(", ") : String(x));
      avisar(`#${it.codigo} · ${nome}: ${fmt(antes)} → ${fmt(v)}`, () => api.atualizarItem(it.id, { props: { [pid]: antes } }));
    } catch (e) {
      falhou(e);
    }
  };
}

function BotaoPasta({ pasta }: { pasta: string | null }) {
  if (!pasta) return null;
  return <MenuPasta pasta={pasta}><FolderOpen size={13} /></MenuPasta>;
}

// ---------- tabela ----------

/** "Quebrar linha na tabela" (config.quebrar): a coluna volta a quebrar; o padrão é uma linha só por item. */
const quebra = (p: Propriedade) => !!(p.config as ConfigProp & { quebrar?: boolean } | undefined)?.quebrar;

/** Largura de quem não tem uma guardada, quando a tabela passa a ter larguras fixas. */
const LARGURA_PADRAO: Record<string, number> = { titulo: 320, tipo: 130 };
const LARGURA_MINIMA = 60;

export function Tabela({
  esquema, itens, todos, colunas, mostrarTipo, ir, aoMudarEsquema, aoMudarItens, larguras, aoReordenar, aoMudarLarguras, ordem, aoOrdenar,
}: {
  esquema: Esquema;
  itens: Item[];
  todos: Item[];
  colunas: Propriedade[];
  mostrarTipo: boolean;
  ir: (r: Rota) => void;
  aoMudarEsquema: () => Promise<void>;
  aoMudarItens: (l: Item[]) => void;
  /** largura de cada coluna (chave: "titulo", "tipo", "atualizado" ou o id da propriedade), guardada na visão */
  larguras?: Record<string, number>;
  /** nova ordem das colunas de propriedade (arrastando o cabeçalho) */
  aoReordenar?: (ids: number[]) => void;
  aoMudarLarguras?: (l: Record<string, number>) => void;
  /** a ordem da visão (os itens já chegam ordenados); o clique no cabeçalho pede outra */
  ordem: { col: string; asc: boolean } | null;
  aoOrdenar: (o: { col: string; asc: boolean } | null) => void;
}) {
  const mudar = useMudarProp(todos, aoMudarItens, esquema);
  // arrastando um cabeçalho: qual coluna e antes de qual posição ela cai
  const [arrasto, setArrasto] = useState<{ id: number; antes: number } | null>(null);
  // larguras enquanto a alça é arrastada (grava só ao soltar)
  const [provisorias, setProvisorias] = useState<Record<string, number> | null>(null);
  const linhaCab = useRef<HTMLTableRowElement>(null);
  // o clique que encerra um arrasto não ordena
  const acabouDeArrastar = useRef(false);

  const linhas = itens;

  const larg = provisorias ?? larguras ?? {};
  const fixas = Object.keys(larg).length > 0;
  const larguraDe = (k: string) => larg[k] ?? LARGURA_PADRAO[k] ?? 170;
  const chaves = ["titulo", ...(mostrarTipo ? ["tipo"] : []), ...colunas.map((p) => String(p.id)), "atualizado"];

  /** A alça na borda do cabeçalho: arrastar muda a largura; duplo clique devolve ao automático. */
  const redimensionar = (chave: string) => (e: React.PointerEvent) => {
    if (e.button !== 0 || !aoMudarLarguras) return;
    e.preventDefault();
    e.stopPropagation();
    // a primeira vez congela todas as colunas como estão, para só a arrastada mudar
    const base: Record<string, number> = { ...larg };
    if (!fixas) {
      linhaCab.current?.querySelectorAll<HTMLElement>("th[data-chave]").forEach((th) => {
        base[th.dataset.chave!] = Math.round(th.getBoundingClientRect().width);
      });
    }
    const x0 = e.clientX;
    const w0 = base[chave] ?? larguraDe(chave);
    let atual = base;
    const mover = (ev: PointerEvent) => {
      atual = { ...base, [chave]: Math.max(LARGURA_MINIMA, Math.round(w0 + ev.clientX - x0)) };
      setProvisorias(atual);
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      setProvisorias(null);
      aoMudarLarguras(atual);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };
  const automatico = (chave: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!aoMudarLarguras || !(chave in larg)) return;
    const { [chave]: _fora, ...resto } = larg;
    aoMudarLarguras(resto);
  };

  /** Arrastar o cabeçalho de uma propriedade para o lado muda a ordem das colunas (eventos de ponteiro: o arrastar
   *  HTML5 não funciona no app instalado). */
  const pegar = (id: number) => (e: React.PointerEvent) => {
    if (e.button !== 0 || !aoReordenar) return;
    // sem isso, arrastar vai selecionando o texto das outras colunas
    e.preventDefault();
    const x0 = e.clientX;
    let antes: number | null = null;
    const mover = (ev: PointerEvent) => {
      if (antes === null && Math.abs(ev.clientX - x0) < 6) return;
      const ths = [...(linhaCab.current?.querySelectorAll<HTMLElement>("th[data-prop]") ?? [])];
      const i = ths.findIndex((th) => {
        const r = th.getBoundingClientRect();
        return ev.clientX < r.left + r.width / 2;
      });
      antes = i < 0 ? ths.length : i;
      setArrasto({ id, antes });
    };
    const soltar = () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      setArrasto(null);
      if (antes === null) return;
      acabouDeArrastar.current = true;
      setTimeout(() => (acabouDeArrastar.current = false), 0);
      const ids = colunas.map((p) => p.id);
      const de = ids.indexOf(id);
      const para = antes > de ? antes - 1 : antes;
      if (para === de) return;
      ids.splice(de, 1);
      ids.splice(para, 0, id);
      aoReordenar(ids);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
  };

  const cab = (chave: string, rotulo: React.ReactNode, prop?: Propriedade) => {
    const i = prop ? colunas.indexOf(prop) : -1;
    const classes = [
      prop && arrasto?.id === prop.id ? "arrastada" : "",
      prop && arrasto?.antes === i ? "soltar-antes" : "",
      prop && arrasto?.antes === colunas.length && i === colunas.length - 1 ? "soltar-depois" : "",
      prop && aoReordenar ? "movel" : "",
    ].filter(Boolean).join(" ");
    return (
      <th
        key={chave}
        data-chave={chave}
        data-prop={prop?.id}
        className={classes || undefined}
        onPointerDown={prop ? pegar(prop.id) : undefined}
        onClick={() => {
          if (acabouDeArrastar.current) return;
          aoOrdenar(ordem?.col === chave ? (ordem.asc ? { col: chave, asc: false } : null) : { col: chave, asc: true });
        }}
        style={{ cursor: "pointer" }}
        title={prop && aoReordenar ? "Clique ordena · arraste para o lado para mudar a ordem das colunas" : undefined}
      >
        <span className="th-in">{rotulo}{ordem?.col === chave && (ordem.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</span>
        {aoMudarLarguras && (
          <span className="th-alca" title="Arraste para mudar a largura · duplo clique volta ao automático"
            onPointerDown={redimensionar(chave)} onClick={(e) => e.stopPropagation()} onDoubleClick={automatico(chave)} />
        )}
      </th>
    );
  };

  return (
    <div className="tabela-rolagem cartao-tabela">
      <table
        className={`tabela${fixas ? " larguras-fixas" : ""}`}
        style={fixas ? { width: chaves.reduce((t, k) => t + (k === "atualizado" && !larg.atualizado ? 150 : larguraDe(k)), 0) } : undefined}
      >
        {fixas && (
          <colgroup>
            {/* "Atualizado" sem largura guardada fica com a sobra, para a tabela encher o cartão */}
            {chaves.map((k) => <col key={k} style={k === "atualizado" && !larg.atualizado ? undefined : { width: larguraDe(k) }} />)}
          </colgroup>
        )}
        <thead>
          <tr ref={linhaCab}>
            {cab("titulo", <><Type size={13} /> Título</>)}
            {mostrarTipo && cab("tipo", <><Layers size={13} /> Tipo</>)}
            {colunas.map((p) => cab(String(p.id), <><IconeEspecie especie={p.especie} tam={13} /> {p.nome}</>, p))}
            {cab("atualizado", <>Atualizado</>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((it) => {
            const t = esquema.tipos.find((x) => x.id === it.tipo_id);
            const doTipo = new Set(t?.propriedades.map((p) => p.propriedade_id));
            return (
              <tr key={it.id} data-codigo={it.codigo}>
                <td>
                  <div className="celula titulo" onClick={() => ir({ v: "item", id: it.id })} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); ir({ v: "item", id: it.id }); } }}>
                    <span className="id-item">#{it.codigo}</span>
                    {mostrarTipo && <span>{t?.icone ?? "·"}</span>}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.titulo || <span className="vazio" style={{ opacity: 1 }}>Sem título</span>}
                    </span>
                    <span className="acoes-linha">
                      <BotaoWorkspace esquema={esquema} item={it} />
                      <BotaoPasta pasta={it.pasta} />
                      <span className="abrir"><Maximize2 size={11} /> Abrir</span>
                    </span>
                  </div>
                </td>
                {mostrarTipo && <td><div className="celula" style={{ color: "var(--texto-2)" }}>{t?.nome ?? "—"}</div></td>}
                {colunas.map((p) => (
                  <td key={p.id} className={quebra(p) ? "quebra" : undefined}>
                    {doTipo.has(p.id) ? (
                      <ValorProp classe="celula" linhaUnica={!quebra(p)} esquema={esquema} prop={p} tipoId={it.tipo_id} valor={valorDe(it, p)} proprio={it.codigo} aoMudar={(v) => mudar(it, p.id, v)} aoMudarEsquema={aoMudarEsquema} />
                    ) : (
                      <div className="celula" />
                    )}
                  </td>
                ))}
                <td><div className="celula data-hora">{dataHora(it.atualizado_em)}</div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {linhas.length === 0 && <div className="vazio-grande">Nada por aqui com esse filtro.</div>}
    </div>
  );
}

// ---------- lista ----------

export function ListaCompacta({ esquema, itens, colunas, ir }: { esquema: Esquema; itens: Item[]; colunas: Propriedade[]; ir: (r: Rota) => void }) {
  if (itens.length === 0) return <div className="vazio-grande">Nada por aqui com esse filtro.</div>;
  return (
    <div className="lista-compacta">
      {itens.map((it) => {
        const t = esquema.tipos.find((x) => x.id === it.tipo_id);
        return (
          <div key={it.id} data-codigo={it.codigo} className="lc-linha" onClick={() => ir({ v: "item", id: it.id })} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); ir({ v: "item", id: it.id }); } }}>
            <span className="tipo-chip pequeno">{t?.icone ?? "·"}</span>
            <span className="id-item">#{it.codigo}</span>
            <span className="lc-titulo">{it.titulo || "Sem título"}</span>
            <span className="lc-props">
              {colunas.map((p) => <Resumo key={p.id} esquema={esquema} prop={p} item={it} />)}
            </span>
            <BotaoWorkspace esquema={esquema} item={it} />
            <BotaoPasta pasta={it.pasta} />
            <span className="data-hora">{dataHora(it.atualizado_em)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Valor de propriedade só para ler (lista e cartões). */
function Resumo({ esquema, prop, item }: { esquema: Esquema; prop: Propriedade; item: Item }) {
  const v = valorDe(item, prop);
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return null;
  const ops = opcoesDe(esquema, prop, item.tipo_id);
  const achar = (n: string): Opcao => ops.find((o) => o.nome === n) ?? { nome: n };
  if (prop.especie === "status" || prop.especie === "selecao") return <Etiqueta opcao={achar(String(v))} status={prop.especie === "status"} />;
  if (prop.especie === "multisselecao" && Array.isArray(v)) return <>{(v as string[]).map((x) => <Etiqueta key={x} opcao={achar(x)} />)}</>;
  if (prop.especie === "data" && typeof v === "string") return <span className={`resumo-texto data ${urgencia(v)}`}>{prop.nome} {v.split("-").reverse().join("/")}</span>;
  if (prop.especie === "checkbox") return v ? <span className="resumo-texto">✓ {prop.nome}</span> : null;
  if (Array.isArray(v)) return <span className="resumo-texto">{(v as (string | number)[]).map((x) => textoSimples(x, prop)).join(", ")}</span>;
  return <span className="resumo-texto">{textoSimples(v, prop)}</span>;
}

// ---------- quadro (kanban) ----------

export function Kanban({
  esquema, itens, todos, agruparPor, tipoUnico, tiposDaVisao, mostrarHistorico, ir, aoMudarItens,
}: {
  esquema: Esquema;
  itens: Item[];
  todos: Item[];
  agruparPor: Propriedade;
  tipoUnico: number | null;
  tiposDaVisao: number[];
  mostrarHistorico: boolean;
  ir: (r: Rota) => void;
  aoMudarItens: (l: Item[]) => void;
}) {
  const mudar = useMudarProp(todos, aoMudarItens, esquema);
  const [sobre, setSobre] = useState<string | null>(null);

  // colunas: as opções dos tipos da visão, na ordem em que aparecem
  const colunas = new Map<string, Opcao>();
  for (const tid of tipoUnico != null ? [tipoUnico] : tiposDaVisao) {
    const t = esquema.tipos.find((x) => x.id === tid);
    if (!t?.propriedades.some((p) => p.propriedade_id === agruparPor.id)) continue;
    for (const o of opcoesDe(esquema, agruparPor, tid)) if (!colunas.has(o.nome)) colunas.set(o.nome, o);
  }
  for (const it of itens) {
    const v = it.props[agruparPor.id];
    if (typeof v === "string" && !colunas.has(v)) colunas.set(v, { nome: v });
  }
  const lista = [...colunas.values()].filter((o) => mostrarHistorico || !o.historico);
  const outros = esquema.propriedades.filter((p) => p.id !== agruparPor.id && ["status", "selecao", "multisselecao", "data"].includes(p.especie));

  const coluna = (chave: string | null, opcao: Opcao | null) => {
    const cartoes = itens.filter((it) => {
      const v = it.props[agruparPor.id];
      return chave == null ? v == null || v === "" : v === chave;
    });
    if (chave == null && cartoes.length === 0) return null;
    const id = chave ?? "∅";
    return (
      <div
        key={id}
        className={`kb-coluna${sobre === id ? " sobre" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setSobre(id); }}
        onDragLeave={() => setSobre((s) => (s === id ? null : s))}
        onDrop={(e) => {
          e.preventDefault();
          setSobre(null);
          const it = todos.find((x) => String(x.id) === e.dataTransfer.getData("text/atelier-item"));
          if (it && it.props[agruparPor.id] !== chave) mudar(it, agruparPor.id, chave);
        }}
      >
        <div className="kb-cabeca">
          {opcao ? <Etiqueta opcao={opcao} status={agruparPor.especie === "status"} /> : <span className="vazio" style={{ opacity: 1 }}>Sem {agruparPor.nome.toLowerCase()}</span>}
          <span className="kb-conta">{cartoes.length}</span>
        </div>
        <div className="kb-cartoes">
          {cartoes.map((it) => {
            const t = esquema.tipos.find((x) => x.id === it.tipo_id);
            return (
              <div
                key={it.id}
                data-codigo={it.codigo}
                className="kb-cartao"
                draggable
                onDragStart={(e) => { e.dataTransfer.setData("text/atelier-item", String(it.id)); e.dataTransfer.effectAllowed = "move"; }}
                onClick={() => ir({ v: "item", id: it.id })} onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); ir({ v: "item", id: it.id }); } }}
              >
                <div className="kb-titulo">{tipoUnico == null && <span>{t?.icone} </span>}{it.titulo || "Sem título"}</div>
                <div className="kb-props">
                  {outros.filter((p) => t?.propriedades.some((x) => x.propriedade_id === p.id)).map((p) => <Resumo key={p.id} esquema={esquema} prop={p} item={it} />)}
                </div>
                <div className="kb-rodape">
                  <span className="id-item">#{it.codigo}</span>
                  <BotaoWorkspace esquema={esquema} item={it} />
                  <BotaoPasta pasta={it.pasta} />
                  <span className="data-hora">{dataHora(it.atualizado_em)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="kanban">
      {coluna(null, null)}
      {lista.map((o) => coluna(o.nome, o))}
    </div>
  );
}
