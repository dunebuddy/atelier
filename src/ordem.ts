import { Esquema, Item, opcoesDe, Propriedade } from "./api";
import { valorDe } from "./components/Valor";

/** Chave de ordenação de um valor: número compara como número, o resto como texto; `null` (vazio) vai para o fim. */
export type Chave = string | number | null;

// "Etapa 2" antes de "Etapa 10", "#b9…" e "#B9…" juntos, e acento não separa "é" de "e"
const colador = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

/** A chave de um item numa propriedade: seleção e status pela ordem das opções; lista pelo primeiro valor. */
export function chaveDe(esquema: Esquema, it: Item, p: Propriedade): Chave {
  let x: unknown = valorDe(it, p);
  if (Array.isArray(x)) x = x[0];
  if (x == null || x === "") return null;
  if (typeof x === "boolean") return x ? 1 : 0;
  if (typeof x === "object") {
    const l = x as { rotulo?: string; url?: string };
    return l.rotulo || l.url || null;
  }
  if (p.especie === "selecao" || p.especie === "status") {
    const i = opcoesDe(esquema, p, it.tipo_id).findIndex((o) => o.nome === x);
    if (i >= 0) return i;
  }
  return typeof x === "number" ? x : String(x);
}

export function comparar(a: Chave, b: Chave, asc: boolean): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const r = typeof a === "number" && typeof b === "number" ? a - b : colador.compare(String(a), String(b));
  return r * (asc ? 1 : -1);
}
