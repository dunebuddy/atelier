import { Fragment } from "react";
import { api } from "../api";
import { avisar, falhou, Rota } from "../ui";

/** `#a3f9c21` em qualquer texto: 7 hexadecimais depois de #, sem letra ou número colado. */
export const RE_MENCAO = /(^|[^\w#])#([0-9a-f]{7})(?![0-9a-z])/gi;

/** Abre o item pelo código (se ele existir e não estiver na lixeira). */
export async function abrirCodigo(codigo: string, ir: (r: Rota) => void) {
  try {
    const achados = await api.itens({ q: codigo.toLowerCase() });
    const it = achados.find((i) => i.codigo === codigo.toLowerCase());
    if (it) ir({ v: "item", id: it.id });
    else avisar(`Não achei o documento #${codigo}.`);
  } catch (e) {
    falhou(e);
  }
}

/** Texto com as menções viradas em botões que abrem o item. */
export function ComMencoes({ texto, ir }: { texto: string; ir: (r: Rota) => void }) {
  const partes: (string | { codigo: string })[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(RE_MENCAO)) {
    const inicio = (m.index ?? 0) + m[1].length;
    partes.push(texto.slice(ultimo, inicio));
    partes.push({ codigo: m[2] });
    ultimo = inicio + 1 + m[2].length;
  }
  partes.push(texto.slice(ultimo));
  return (
    <>
      {partes.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <button key={i} className="mencao" onClick={(e) => { e.stopPropagation(); abrirCodigo(p.codigo, ir); }} title="Abrir o documento">
            #{p.codigo.toLowerCase()}
          </button>
        ),
      )}
    </>
  );
}
