// Resumo dos itens apontados por propriedades de relação (título, tipo), com cache: a tabela mostra o título de
// cada item ligado sem carregar item por item.
import { useEffect, useState } from "react";
import { api, Resumo } from "./api";

const cache = new Map<string, Resumo | null>();
const ouvintes = new Set<() => void>();
let pendentes = new Set<string>();
let timer = 0;

function buscar() {
  const lista = [...pendentes];
  pendentes = new Set();
  api.resumos(lista)
    .then((r) => {
      for (const c of lista) cache.set(c, r.find((x) => x.codigo === c) ?? null);
      ouvintes.forEach((f) => f());
    })
    .catch(() => lista.forEach((c) => cache.delete(c)));
}

// o título de um item pode mudar: ao voltar para a janela, esquece o que sabia
window.addEventListener("focus", () => {
  cache.clear();
  ouvintes.forEach((f) => f());
});

export function lembrarResumo(r: Resumo) {
  cache.set(r.codigo, r);
}

/** Resumos destes códigos; o que não está no cache chega num pedido só, logo depois. */
export function useResumos(codigos: string[]): Map<string, Resumo | null> {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    ouvintes.add(f);
    return () => { ouvintes.delete(f); };
  }, []);
  const faltam = codigos.filter((c) => !cache.has(c));
  useEffect(() => {
    if (!faltam.length) return;
    for (const c of faltam) { cache.set(c, null); pendentes.add(c); }
    window.clearTimeout(timer);
    timer = window.setTimeout(buscar, 30);
  }, [faltam.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  return new Map(codigos.map((c) => [c, cache.get(c) ?? null]));
}
