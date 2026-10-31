import { Esquema, Item } from "../api";
import { ChipItem } from "./Valor";

/**
 * Quem aponta para este item. As ligações que saem dele são propriedades (na ficha); aqui fica o outro lado,
 * pelo nome inverso de cada propriedade ("Filhos", "Bloqueia"...), e quem cita o #código no texto.
 */
export function Relacoes({ esquema, item }: { esquema: Esquema; item: Item }) {
  const refs = item.referencias ?? [];
  const men = item.mencionado_em ?? [];
  if (refs.length === 0 && men.length === 0) return null;

  const grupos = new Map<string, typeof refs>();
  for (const r of refs) {
    if (!grupos.has(r.rotulo)) grupos.set(r.rotulo, []);
    grupos.get(r.rotulo)!.push(r);
  }

  return (
    <div className="relacoes">
      <div className="ficha-titulo">Apontado por</div>
      {[...grupos.entries()].map(([rotulo, lista]) => (
        <div key={rotulo} className="rel-grupo">
          <div className="rel-rotulo">{rotulo}</div>
          <div className="rel-lista">{lista.map((r) => <ChipItem key={r.item.id} esquema={esquema} r={r.item} />)}</div>
        </div>
      ))}
      {men.length > 0 && (
        <div className="rel-grupo">
          <div className="rel-rotulo">Mencionado em</div>
          <div className="rel-lista">{men.map((m) => <ChipItem key={m.id} esquema={esquema} r={m} />)}</div>
        </div>
      )}
    </div>
  );
}
