import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Esquema, FiltroVisao, Item } from "../api";
import { abrir } from "../ui";
import { ChipItem } from "./Valor";

/**
 * Quem aponta para este item. As ligações que saem dele são propriedades (na ficha); aqui fica o outro lado,
 * pelo nome inverso de cada propriedade ("Filhos", "Bloqueia"...), e quem cita o #código no texto.
 */
export function Relacoes({ esquema, item }: { esquema: Esquema; item: Item }) {
  // a relação diz se aparece deste lado ("Mostrar do outro lado")
  const refs = (item.referencias ?? []).filter((r) => r.outro_lado !== false);
  const men = item.mencionado_em ?? [];
  if (refs.length === 0 && men.length === 0) return null;

  const grupos = new Map<string, typeof refs>();
  for (const r of refs) {
    if (!grupos.has(r.rotulo)) grupos.set(r.rotulo, []);
    grupos.get(r.rotulo)!.push(r);
  }
  // o grupo vira uma visão avulsa ao lado: tabela, concluídos escondidos (um clique mostra), filtros e busca
  const abrirLista = (rotulo: string, filtro: FiltroVisao) =>
    abrir({ v: "consulta", titulo: `${rotulo} · ${item.titulo || "#" + item.codigo}`, icone: "🔗", filtro: { ...filtro, esconder_historico: true } }, true);

  return (
    <div className="relacoes">
      <div className="ficha-titulo">Apontado por</div>
      {[...grupos.entries()].map(([rotulo, lista]) => (
        <div key={rotulo} className="rel-grupo">
          <button className="rel-rotulo rel-abrir" title={`Abrir os ${lista.length} como lista ao lado (os concluídos ficam escondidos)`}
            onClick={() => {
              // os tipos dos itens listados: dão as colunas e os filtros certos na lista
              const tipos = [...new Set(lista.map((r) => r.item.tipo_id))];
              const comTipo = tipos.every((t) => t != null) ? { tipos: tipos as number[] } : {};
              abrirLista(rotulo, { ...comTipo, props: { [lista[0].prop_id]: [item.codigo] } });
            }}>
            {rotulo} <span className="rel-conta">{lista.length}</span> <ChevronRight size={12} />
          </button>
          <ListaCurta itens={lista.map((r) => r.item)} esquema={esquema} />
        </div>
      ))}
      {men.length > 0 && (
        <div className="rel-grupo">
          <button className="rel-rotulo rel-abrir" title={`Abrir os ${men.length} como lista ao lado`}
            onClick={() => abrirLista("Mencionado em", { texto: `#${item.codigo}` })}>
            Mencionado em <span className="rel-conta">{men.length}</span> <ChevronRight size={12} />
          </button>
          <ListaCurta itens={men} esquema={esquema} />
        </div>
      )}
    </div>
  );
}

/** Os primeiros da lista e um "ver mais": com 100, a ficha não vira a página toda. */
export function ListaCurta({ itens, esquema, limite = 8 }: { itens: { id: number; codigo: string; titulo: string; tipo_id: number | null }[]; esquema: Esquema; limite?: number }) {
  const [todos, setTodos] = useState(false);
  const vistos = todos ? itens : itens.slice(0, limite);
  return (
    <div className="rel-lista">
      {vistos.map((r) => <ChipItem key={r.id} esquema={esquema} r={r} />)}
      {itens.length > limite && (
        <button className="rel-mais" onClick={() => setTodos((t) => !t)}>{todos ? "ver menos" : `ver mais ${itens.length - limite}`}</button>
      )}
    </div>
  );
}
