import type { IUnicodeVersionProvider, Terminal } from "@xterm/xterm";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { BASE } from "./api";

// Quantas colunas cada caractere ocupa no terminal. A conta do xterm tem de bater com a de quem está do outro lado,
// senão o texto cai no lugar errado (letra trocada, linha sobreposta). Medido e testado em 2026-11-19 com a bateria
// de scripts/terminal/ (ver docs/PENDENCIAS.md e src-tauri/conpty/LEIAME.md):
// - "graphemes" (padrão; Linux e o ConPTY novo que o instalador do Windows leva): um emoji é um grapheme de 2 colunas,
//   com U+FE0F (⚙️ = 2), ZWJ (👨‍💻 = 2), tom de pele (👍🏽 = 2), bandeira (🇧🇷 = 2) e keycap (1️⃣ = 2). É também a
//   conta do Claude Code e dos apps de tela (string-width), que pulam o cursor para a coluna que eles calculam.
// - "conpty-sistema": o ConPTY do próprio Windows (sem os arquivos ao lado do exe) redesenha a tela contando cada
//   codepoint numa coluna, inclusive os invisíveis (⚙️ = 2, ✅️ = 3, 👨‍💻 = 5, 🇧🇷 = 4).

type Conpty = "novo" | "sistema" | "nenhum";

let qualConpty: Promise<Conpty> | null = null;
/** Qual ConPTY o núcleo usa (pergunta uma vez). */
function conpty(): Promise<Conpty> {
  if (!qualConpty) {
    qualConpty = fetch(`${BASE}/terminal/conpty`)
      .then((r) => r.json())
      .then((d) => d.conpty as Conpty)
      .catch(() => (navigator.userAgent.includes("Windows") ? "sistema" : "nenhum"));
  }
  return qualConpty;
}

// valor de charProperties do xterm: estado (bits 3+), largura (bits 1-2), junta com o anterior (bit 0)
const valor = (estado: number, largura: number, junta: boolean) => ((estado & 0xffffff) << 3) | ((largura & 3) << 1) | (junta ? 1 : 0);
const largura = (v: number) => (v >> 1) & 3;
const estado = (v: number) => v >> 3;
const DEPOIS_DO_ZWJ = 1;
const BANDEIRA_ABERTA = 2;
const regional = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;

function graphemes(u11: IUnicodeVersionProvider): IUnicodeVersionProvider {
  return {
    version: "graphemes",
    wcwidth: (cp) => (regional(cp) ? 1 : u11.wcwidth(cp)),
    charProperties: (cp, antes) => {
      const la = largura(antes);
      const temBase = antes !== 0 && la > 0;
      if (temBase) {
        if (cp === 0xfe0f || cp === 0x20e3) return valor(0, 2, true); // apresentação emoji, keycap
        if (cp === 0xfe0e) return valor(0, la, true); // apresentação texto: fica como estava
        if (cp === 0x200d) return valor(DEPOIS_DO_ZWJ, la, true);
        if (estado(antes) === DEPOIS_DO_ZWJ) return valor(0, 2, true); // 👨 + ZWJ + 💻
        if (cp >= 0x1f3fb && cp <= 0x1f3ff) return valor(0, 2, true); // tom de pele
      }
      if (regional(cp)) return estado(antes) === BANDEIRA_ABERTA ? valor(0, 2, true) : valor(BANDEIRA_ABERTA, 1, false);
      const l = u11.wcwidth(cp);
      return l === 0 && temBase ? valor(0, la, true) : valor(0, l, false);
    },
  };
}

// Exceções do ConPTY do sistema ao Unicode 11 (Windows 11 26200, medido com scripts/terminal/tabela.ps1)
const EXCECOES_SISTEMA: [number, number, 1 | 2][] = [
  [0x302a, 0x302d, 2], [0x3099, 0x309a, 2], [0x31bb, 0x31bf, 2], [0x1f1e6, 0x1f1ff, 2], [0x1f6d6, 0x1f6d7, 2],
  [0x1f6dc, 0x1f6df, 2], [0x1f6fb, 0x1f6fc, 2], [0x1f7f0, 0x1f7f0, 2], [0x1f90c, 0x1f90c, 2], [0x1f93b, 0x1f93b, 1],
  [0x1f946, 0x1f946, 1], [0x1f972, 0x1f972, 2], [0x1f977, 0x1f979, 2], [0x1f9a3, 0x1f9a4, 2], [0x1f9ab, 0x1f9ad, 2],
  [0x1f9cb, 0x1f9cc, 2], [0x1fa74, 0x1fa77, 2], [0x1fa7b, 0x1fa7c, 2], [0x1fa83, 0x1fa88, 2], [0x1fa96, 0x1fabd, 2],
  [0x1fabf, 0x1fac5, 2], [0x1face, 0x1fadb, 2], [0x1fae0, 0x1fae8, 2], [0x1faf0, 0x1faf8, 2],
];

function conptySistema(u11: IUnicodeVersionProvider): IUnicodeVersionProvider {
  const l = (cp: number): 0 | 1 | 2 => {
    for (const [a, b, w] of EXCECOES_SISTEMA) if (cp >= a && cp <= b) return w;
    const w = u11.wcwidth(cp);
    return w === 0 ? 1 : w; // invisíveis (FE0F, ZWJ, acento combinante) ocupam a própria coluna
  };
  return { version: "conpty-sistema", wcwidth: l, charProperties: (cp) => valor(0, l(cp), false) };
}

/** Liga no terminal a conta de largura que bate com o outro lado. Chamar antes de ligar o websocket. */
export async function usarLarguras(term: Terminal) {
  // o addon só faz unicode.register(provedor do Unicode 11): ativado num objeto nosso, o provedor fica de base
  // (term.unicode é um objeto novo a cada acesso, não dá para pegar o provedor depois)
  let u11: IUnicodeVersionProvider | undefined;
  new Unicode11Addon().activate({ unicode: { register: (p: IUnicodeVersionProvider) => { u11 = p; } } } as unknown as Terminal);
  term.loadAddon(new Unicode11Addon());
  if (!u11) { term.unicode.activeVersion = "11"; return; }
  term.unicode.register(graphemes(u11));
  term.unicode.register(conptySistema(u11));
  term.unicode.activeVersion = (await conpty()) === "sistema" ? "conpty-sistema" : "graphemes";
}

