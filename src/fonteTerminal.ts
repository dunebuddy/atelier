import { guardar, ler } from "./ui";

// Fonte do terminal (Configurações → Terminal). Fica no navegador desta máquina: fonte instalada é coisa da máquina.
// Os ícones dos prompts (oh-my-posh, starship...) vêm das Nerd Fonts: elas entram depois da escolhida, só para os
// caracteres que a escolhida não tem; o resto do texto continua na escolhida.

export interface FonteTerminal { familia: string; tamanho: number }

export const FONTE_PADRAO: FonteTerminal = { familia: "Cascadia Code", tamanho: 13 };

const SIMBOLOS = [
  "CaskaydiaCove Nerd Font Mono", "CaskaydiaMono Nerd Font Mono", "CaskaydiaCove NFM", "Symbols Nerd Font Mono",
  "Symbols Nerd Font", "JetBrainsMono Nerd Font Mono", "MesloLGM Nerd Font Mono", "MesloLGS NF", "Hack Nerd Font Mono",
  "FiraCode Nerd Font Mono",
];

/** Fontes de terminal comuns, para sugerir na configuração (só as instaladas aparecem). */
export const SUGESTOES = [
  "Cascadia Code", "Cascadia Mono", "CaskaydiaCove Nerd Font Mono", "CaskaydiaMono Nerd Font Mono", "JetBrains Mono",
  "JetBrainsMono Nerd Font Mono", "Fira Code", "FiraCode Nerd Font Mono", "MesloLGS NF", "Hack Nerd Font Mono",
  "Consolas", "Lucida Console", "Courier New", "DejaVu Sans Mono", "Ubuntu Mono", "Liberation Mono", "Noto Sans Mono",
];

const aspas = (f: string) => (/^[\w-]+$/.test(f) ? f : `"${f.replace(/"/g, "")}"`);

export function lerFonteTerminal(): FonteTerminal {
  const f = ler<Partial<FonteTerminal>>("terminal.fonte", {});
  return {
    familia: (f.familia ?? "").trim() || FONTE_PADRAO.familia,
    tamanho: Math.min(32, Math.max(8, Number(f.tamanho) || FONTE_PADRAO.tamanho)),
  };
}

export function guardarFonteTerminal(f: FonteTerminal) {
  guardar("terminal.fonte", f);
  window.dispatchEvent(new Event("atelier:fonte-terminal"));
}

/** A pilha de fontes para o xterm: a escolhida, as Nerd Fonts para os ícones e as de sempre. */
export function pilhaDeFontes(familia: string): string {
  const lista = [familia, ...SIMBOLOS, "Cascadia Code", "JetBrains Mono", "Consolas"];
  return [...new Set(lista)].map(aspas).join(", ") + ", monospace";
}

/** A fonte está instalada? (mede um texto com ela e com as genéricas; se nenhuma medida muda, ela não existe) */
export function instalada(familia: string): boolean {
  const c = document.createElement("canvas").getContext("2d");
  if (!c) return true;
  const t = "mmmmmmmmmmlli1WW@#";
  return ["monospace", "serif", "sans-serif"].some((g) => {
    c.font = `40px ${g}`;
    const base = c.measureText(t).width;
    c.font = `40px ${aspas(familia)}, ${g}`;
    return c.measureText(t).width !== base;
  });
}
