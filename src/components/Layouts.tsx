import { useState } from "react";
import { ArrowDown, ArrowUp, FolderOpen, Layers, Maximize2, Type } from "lucide-react";
import { api, Esquema, Item, Opcao, opcoesDe, Propriedade, Valor } from "../api";
import { avisar, falhou, Rota } from "../ui";
import { dataHora } from "../visao";
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

export function Tabela({
  esquema, itens, todos, colunas, mostrarTipo, ir, aoMudarEsquema, aoMudarItens,
}: {
  esquema: Esquema;
  itens: Item[];
  todos: Item[];
  colunas: Propriedade[];
  mostrarTipo: boolean;
  ir: (r: Rota) => void;
  aoMudarEsquema: () => Promise<void>;
  aoMudarItens: (l: Item[]) => void;
}) {
  const [ordem, setOrdem] = useState<{ col: string; asc: boolean } | null>(null);
  const mudar = useMudarProp(todos, aoMudarItens, esquema);

  let linhas = itens;
  if (ordem) {
    const v = (i: Item) => {
      if (ordem.col === "titulo") return i.titulo.toLowerCase();
      if (ordem.col === "tipo") return esquema.tipos.find((t) => t.id === i.tipo_id)?.nome ?? "";
      if (ordem.col === "atualizado") return i.atualizado_em;
      const x = i.props[ordem.col];
      return Array.isArray(x) ? x.join(",") : x == null ? "" : String(x).toLowerCase();
    };
    linhas = [...itens].sort((a, b) => {
      const va = v(a), vb = v(b);
      if (va === vb) return 0;
      if (va === "") return 1;
      if (vb === "") return -1;
      return (va < vb ? -1 : 1) * (ordem.asc ? 1 : -1);
    });
  }
  const cab = (chave: string, rotulo: React.ReactNode) => (
    <th key={chave} onClick={() => setOrdem((o) => (o?.col === chave ? (o.asc ? { col: chave, asc: false } : null) : { col: chave, asc: true }))} style={{ cursor: "pointer" }}>
      <span className="th-in">{rotulo}{ordem?.col === chave && (ordem.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</span>
    </th>
  );

  return (
    <div className="tabela-rolagem cartao-tabela">
      <table className="tabela">
        <thead>
          <tr>
            {cab("titulo", <><Type size={13} /> Título</>)}
            {mostrarTipo && cab("tipo", <><Layers size={13} /> Tipo</>)}
            {colunas.map((p) => cab(String(p.id), <><IconeEspecie especie={p.especie} tam={13} /> {p.nome}</>))}
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
                      <BotaoPasta pasta={it.pasta} />
                      <span className="abrir"><Maximize2 size={11} /> Abrir</span>
                    </span>
                  </div>
                </td>
                {mostrarTipo && <td><div className="celula" style={{ color: "var(--texto-2)" }}>{t?.nome ?? "—"}</div></td>}
                {colunas.map((p) => (
                  <td key={p.id}>
                    {doTipo.has(p.id) ? (
                      <ValorProp classe="celula" esquema={esquema} prop={p} tipoId={it.tipo_id} valor={valorDe(it, p)} proprio={it.codigo} aoMudar={(v) => mudar(it, p.id, v)} aoMudarEsquema={aoMudarEsquema} />
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
