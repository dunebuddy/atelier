// Aplica o tema: os de fábrica são só o atributo data-tema; os de arquivo usam a base e sobrescrevem variáveis.

import { TemaArquivo } from "./api";

// Nord continua no CSS como reserva, mas é escolhido pelo arquivo nord.toml
export const DE_FABRICA = ["claro", "escuro", "nord"] as const;

const CORES_ETIQUETA = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
let aplicadas: string[] = [];

export function aplicarTema(id: string, temas: TemaArquivo[]) {
  const raiz = document.documentElement;
  for (const v of aplicadas) raiz.style.removeProperty(v);
  aplicadas = [];

  const t = temas.find((x) => x.id === id && !x.erro);
  if (!t) {
    raiz.dataset.tema = (DE_FABRICA as readonly string[]).includes(id) ? id : "nord";
    return;
  }
  // a base dá os controles do sistema e tudo o que o arquivo não disser
  raiz.dataset.tema = t.base === "claro" ? "claro" : "escuro";
  const por = (nome: string, valor: string) => {
    raiz.style.setProperty(`--${nome}`, valor);
    aplicadas.push(`--${nome}`);
  };
  const cores = t.cores ?? {};
  for (const [k, v] of Object.entries(cores)) por(k, v);
  if (!cores["hover"]) por("hover", "color-mix(in srgb, var(--texto) 6%, transparent)");
  if (!cores["ativo"]) por("ativo", "color-mix(in srgb, var(--texto) 10%, transparent)");
  if (!cores["acento-suave"]) por("acento-suave", "color-mix(in srgb, var(--acento) 16%, transparent)");
  const claro = t.base === "claro";
  for (const c of CORES_ETIQUETA) {
    const base = t.etiquetas?.[c];
    if (!base) continue;
    por(`c-${c}`, `color-mix(in srgb, ${base} ${claro ? 14 : 18}%, var(--bg))`);
    por(`b-${c}`, `color-mix(in srgb, ${base} ${claro ? 38 : 36}%, var(--bg))`);
    por(`t-${c}`, claro ? `color-mix(in srgb, ${base} 78%, #000)` : base);
  }
}
