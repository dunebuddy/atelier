// Painel de trabalho: uma ou duas metades lado a lado; cada metade tem janelas abertas (item, visão, terminal,
// arquivos...) e um modo de arrumar: abas, tile (um principal e o resto empilhado, como o MonadTall do Qtile) ou
// fita (colunas que rolam na horizontal, como o Niri). Cada janela tem a sua própria navegação (voltar/avançar).
// Tudo aqui é função pura sobre o estado; o App guarda o estado e desenha.
import { Rota } from "./ui";

export type Modo = "abas" | "tile" | "fita";

export interface Janela {
  id: string;
  hist: Rota[];
  pos: number;
  /** fita: fração do painel (1 = inteiro, 2 = metade, 3 = um terço, 4 = um quarto) */
  largura: number;
  /** fita: fica embaixo da janela anterior, na mesma coluna */
  empilhada?: boolean;
  /** como aparece na aba (vem do conteúdo: título do item, nome da visão...) */
  titulo?: string;
  icone?: string;
  tipo_id?: number | null;
  /** nome de cada lugar por onde a janela passou (para a lista do histórico) */
  rotulos?: Record<string, string>;
}

export interface Metade {
  janelas: Janela[];
  ativa: string | null;
  modo: Modo;
  /** tile: largura do principal, em fração (0.3 a 0.8) */
  proporcao: number;
}

export interface EstadoPainel {
  metades: Metade[];
  /** metade com o foco (onde a barra lateral e o Ctrl+K abrem as coisas) */
  foco: number;
  /** com duas metades: fração da largura da primeira */
  divisao: number;
  /** a janela ativa do painel com foco ocupa o painel inteiro (as outras ficam escondidas, sem desmontar) */
  maximizada?: boolean;
}

export const LARGURAS = [1, 2, 3, 4];

let seq = 0;
const novoId = () => `j${Date.now().toString(36)}${(seq++).toString(36)}`;

export const rotaDe = (j: Janela): Rota => j.hist[j.pos];

/** Terminal e arquivos não navegam para outra coisa: o que se abre "nele" vai para uma janela nova. */
export const fixa = (r: Rota) => r.v === "terminal" || r.v === "arquivos" || r.v === "pastas";

export function novaJanela(r: Rota, largura = 2): Janela {
  return { id: novoId(), hist: [r], pos: 0, largura };
}

export function inicial(r: Rota): EstadoPainel {
  const j = novaJanela(r);
  return { metades: [{ janelas: [j], ativa: j.id, modo: "abas", proporcao: 0.6 }], foco: 0, divisao: 0.5 };
}

/** Estado guardado. Os terminais voltam como janela (parados: o processo morreu com o app; a janela oferece reabrir). */
export function restaurar(e: EstadoPainel | null, padrao: Rota): EstadoPainel {
  if (!e?.metades?.length) return inicial(padrao);
  const metades = e.metades
    .map((m) => {
      const janelas = m.janelas.filter((j) => j.hist?.length && rotaDe(j));
      return { ...m, janelas, ativa: janelas.some((j) => j.id === m.ativa) ? m.ativa : janelas[0]?.id ?? null };
    })
    .slice(0, 2);
  return { ...e, metades, foco: Math.min(e.foco, metades.length - 1) };
}

function trocarMetade(e: EstadoPainel, mi: number, f: (m: Metade) => Metade): EstadoPainel {
  return { ...e, metades: e.metades.map((m, i) => (i === mi ? f(m) : m)) };
}

function trocarJanela(e: EstadoPainel, id: string, f: (j: Janela) => Janela): EstadoPainel {
  return { ...e, metades: e.metades.map((m) => ({ ...m, janelas: m.janelas.map((j) => (j.id === id ? f(j) : j)) })) };
}

export function acharJanela(e: EstadoPainel, id: string): { mi: number; j: Janela } | null {
  for (let mi = 0; mi < e.metades.length; mi++) {
    const j = e.metades[mi].janelas.find((x) => x.id === id);
    if (j) return { mi, j };
  }
  return null;
}

/** Janela com o foco (a ativa da metade com o foco). */
export function janelaAtiva(e: EstadoPainel): Janela | null {
  const m = e.metades[e.foco];
  return m?.janelas.find((j) => j.id === m.ativa) ?? null;
}

/** Abre numa janela nova, logo depois da ativa da metade (`mi`, padrão: a do foco). */
export function abrirNova(e: EstadoPainel, r: Rota, mi = e.foco): EstadoPainel {
  const j = novaJanela(r);
  return {
    ...trocarMetade(e, mi, (m) => {
      const i = m.janelas.findIndex((x) => x.id === m.ativa);
      const janelas = [...m.janelas.slice(0, i + 1), j, ...m.janelas.slice(i + 1)];
      return { ...m, janelas, ativa: j.id };
    }),
    foco: mi,
  };
}

/** Abre na metade `mi` (0 = esquerda, 1 = direita; a direita nasce se o painel não está dividido). `nova`: janela
 * nova; senão navega a janela ativa daquela metade (ou abre uma, se ela está vazia). */
export function abrirNaMetade(e: EstadoPainel, r: Rota, mi: number, nova = false): EstadoPainel {
  let n = e;
  if (mi > 0 && n.metades.length < 2) n = dividir(n);
  const alvo = Math.min(mi, n.metades.length - 1);
  n = { ...n, foco: alvo };
  return nova ? abrirNova(n, r, alvo) : navegar(n, r);
}

/** Fecha janelas da metade com o foco (ou `mi`): "atual", "todas" ou as que têm `texto` no título. */
export function fecharJanelas(e: EstadoPainel, qual: string, mi = e.foco): EstadoPainel {
  const m = e.metades[mi];
  if (!m) return e;
  // o id exato de uma janela (o "estado" da tela mostra) fecha só ela, em qualquer metade
  if (acharJanela(e, qual)) return fechar(e, qual);
  const q = qual.toLowerCase();
  const ids = q === "atual" ? (m.ativa ? [m.ativa] : []) : q === "todas" ? m.janelas.map((j) => j.id)
    : e.metades.flatMap((x) => x.janelas).filter((j) => (j.titulo ?? "").toLowerCase().includes(q)).map((j) => j.id);
  return ids.reduce((s, id) => fechar(s, id), e);
}

/** Vai para `r` na janela ativa (ou abre uma, se não há, ou se a ativa é terminal/arquivos). */
export function navegar(e: EstadoPainel, r: Rota): EstadoPainel {
  const a = janelaAtiva(e);
  if (!a || fixa(rotaDe(a)) || fixa(r)) return abrirNova(e, r);
  return irNaJanela(e, a.id, r);
}

export function irNaJanela(e: EstadoPainel, id: string, r: Rota): EstadoPainel {
  return trocarJanela(e, id, (j) => {
    if (JSON.stringify(rotaDe(j)) === JSON.stringify(r)) return j;
    const hist = [...j.hist.slice(0, j.pos + 1), r].slice(-50);
    return { ...j, hist, pos: hist.length - 1 };
  });
}

/** Troca a rota atual sem criar passo no histórico (ex.: "início" que vira a primeira visão). */
export function substituir(e: EstadoPainel, id: string, r: Rota): EstadoPainel {
  return trocarJanela(e, id, (j) => ({ ...j, hist: j.hist.map((x, i) => (i === j.pos ? r : x)) }));
}

export function irParaPasso(e: EstadoPainel, id: string, pos: number): EstadoPainel {
  return trocarJanela(e, id, (j) => ({ ...j, pos: Math.max(0, Math.min(j.hist.length - 1, pos)) }));
}

export function ativar(e: EstadoPainel, mi: number, id: string): EstadoPainel {
  return { ...trocarMetade(e, mi, (m) => ({ ...m, ativa: id })), foco: mi };
}

/** Liga e desliga o "maximizar": a janela ativa do painel com foco ocupa o painel inteiro. */
export function alternarMaximizada(e: EstadoPainel): EstadoPainel {
  return { ...e, maximizada: !e.maximizada };
}

/** Fecha a janela. A metade fica aberta mesmo vazia (só o "juntar" tira uma metade). */
export function fechar(e: EstadoPainel, id: string): EstadoPainel {
  const achada = acharJanela(e, id);
  if (!achada) return e;
  const { mi } = achada;
  return trocarMetade(e, mi, (m) => {
    const i = m.janelas.findIndex((j) => j.id === id);
    const janelas = m.janelas.filter((j) => j.id !== id);
    // a que vinha empilhada embaixo da fechada não sobe para a coluna de outra
    if (janelas[i] && i === 0) janelas[i] = { ...janelas[i], empilhada: false };
    const ativa = m.ativa === id ? janelas[Math.min(i, janelas.length - 1)]?.id ?? null : m.ativa;
    return { ...m, janelas, ativa };
  });
}

/** Divide o painel em dois: a metade nova nasce vazia (nada é copiado). Com duas, junta. */
export function dividir(e: EstadoPainel): EstadoPainel {
  if (e.metades.length > 1) return juntar(e);
  return { ...e, metades: [...e.metades, { janelas: [], ativa: null, modo: e.metades[0].modo, proporcao: 0.6 }], foco: 1 };
}

/** Junta as metades: as janelas da segunda vão para a primeira, menos as que mostram o mesmo que uma de lá. */
export function juntar(e: EstadoPainel): EstadoPainel {
  if (e.metades.length < 2) return e;
  const [a, b] = e.metades;
  const ja = new Set(a.janelas.map((j) => chaveRota(rotaDe(j))));
  const vem = b.janelas.filter((j) => !ja.has(chaveRota(rotaDe(j))));
  const ativa = vem.some((j) => j.id === b.ativa) ? b.ativa : a.ativa ?? vem[0]?.id ?? null;
  return { ...e, metades: [{ ...a, janelas: [...a.janelas, ...vem.map((j) => ({ ...j, empilhada: false }))], ativa }], foco: 0 };
}

/** Muda a janela de lugar: para outra metade (no fim, ou antes de `antesDe`) ou dentro da mesma. */
export function mover(e: EstadoPainel, id: string, paraMi: number, antesDe?: string): EstadoPainel {
  const achada = acharJanela(e, id);
  if (!achada || id === antesDe) return e;
  const j = { ...achada.j, empilhada: false };
  let metades = e.metades.map((m) => ({ ...m, janelas: m.janelas.filter((x) => x.id !== id) }));
  if (paraMi >= metades.length) metades = [...metades, { janelas: [], ativa: null, modo: e.metades[0].modo, proporcao: 0.6 }];
  metades = metades.map((m, i) => {
    if (i !== paraMi) return { ...m, ativa: m.ativa === id ? m.janelas[0]?.id ?? null : m.ativa };
    const pos = antesDe ? m.janelas.findIndex((x) => x.id === antesDe) : -1;
    const janelas = pos < 0 ? [...m.janelas, j] : [...m.janelas.slice(0, pos), j, ...m.janelas.slice(pos)];
    return { ...m, janelas, ativa: id };
  });
  return { ...e, metades, foco: paraMi };
}

/** Manda a janela para a outra metade (com uma só, divide e manda para a direita). */
export function moverParaOutraMetade(e: EstadoPainel, id: string, mi: number): EstadoPainel {
  return mover(e, id, e.metades.length > 1 ? 1 - mi : 1);
}

/** Fecha as outras janelas da metade `mi`, deixando só `id` (que fica ativa). */
export function fecharOutras(e: EstadoPainel, id: string, mi: number): EstadoPainel {
  const m = e.metades[mi];
  if (!m) return e;
  return m.janelas.filter((j) => j.id !== id).reduce((s, j) => fechar(s, j.id), ativar(e, mi, id));
}

/** Anda a janela uma posição para o lado dentro da metade. */
export function moverLado(e: EstadoPainel, id: string, passo: number): EstadoPainel {
  const achada = acharJanela(e, id);
  if (!achada) return e;
  return trocarMetade(e, achada.mi, (m) => {
    const i = m.janelas.findIndex((x) => x.id === id);
    const k = i + passo;
    if (k < 0 || k >= m.janelas.length) return m;
    const janelas = [...m.janelas];
    [janelas[i], janelas[k]] = [janelas[k], janelas[i]];
    if (janelas[0].empilhada) janelas[0] = { ...janelas[0], empilhada: false };
    return { ...m, janelas };
  });
}

/** Tile: a janela vira a principal. */
export function promover(e: EstadoPainel, id: string): EstadoPainel {
  const achada = acharJanela(e, id);
  if (!achada) return e;
  return trocarMetade(e, achada.mi, (m) => ({ ...m, janelas: [achada.j, ...m.janelas.filter((x) => x.id !== id)], ativa: id }));
}

/** Foco na janela anterior/seguinte da metade com o foco. */
export function focarVizinha(e: EstadoPainel, passo: number): EstadoPainel {
  const m = e.metades[e.foco];
  if (!m?.janelas.length) return e;
  const i = m.janelas.findIndex((x) => x.id === m.ativa);
  const k = (i + passo + m.janelas.length) % m.janelas.length;
  return ativar(e, e.foco, m.janelas[k].id);
}

export const mudarModo = (e: EstadoPainel, mi: number, modo: Modo) => trocarMetade(e, mi, (m) => ({ ...m, modo }));
export const mudarProporcao = (e: EstadoPainel, mi: number, p: number) =>
  trocarMetade(e, mi, (m) => ({ ...m, proporcao: Math.min(0.8, Math.max(0.3, p)) }));
export const mudarDivisao = (e: EstadoPainel, p: number) => ({ ...e, divisao: Math.min(0.8, Math.max(0.2, p)) });
export const mudarLargura = (e: EstadoPainel, id: string, largura: number) => trocarJanela(e, id, (j) => ({ ...j, largura }));
/** Fita: a próxima largura da lista (1/2 → 1/3 → 1/4 → 1/1 → ...). */
export const proximaLargura = (e: EstadoPainel, id: string) =>
  trocarJanela(e, id, (j) => ({ ...j, largura: LARGURAS[(LARGURAS.indexOf(j.largura) + 1) % LARGURAS.length] }));
export function empilhar(e: EstadoPainel, id: string, sim: boolean): EstadoPainel {
  const achada = acharJanela(e, id);
  if (!achada || (sim && achada.mi >= 0 && e.metades[achada.mi].janelas[0].id === id)) return e;
  return trocarJanela(e, id, (j) => ({ ...j, empilhada: sim }));
}
export const chaveRota = (r: Rota) => JSON.stringify(r);
export function rotular(e: EstadoPainel, id: string, d: Pick<Janela, "titulo" | "icone" | "tipo_id">): EstadoPainel {
  return trocarJanela(e, id, (j) => {
    const nome = `${d.icone ? d.icone + " " : ""}${d.titulo ?? ""}`;
    const k = chaveRota(rotaDe(j));
    if (j.titulo === d.titulo && j.icone === d.icone && j.tipo_id === d.tipo_id && j.rotulos?.[k] === nome) return j;
    // guarda só os rótulos de rotas que ainda estão no histórico
    const rotulos = Object.fromEntries(Object.entries({ ...j.rotulos, [k]: nome }).filter(([c]) => j.hist.some((r) => chaveRota(r) === c)));
    return { ...j, ...d, rotulos };
  });
}

// ---------- geometria ----------

export interface Retangulo { x: number; y: number; w: number; h: number }
export interface Lugar { id: string; mi: number; r: Retangulo; visivel: boolean; cabeca: boolean; coluna?: number }

/** Colunas da fita: cada uma com as janelas empilhadas nela e a largura da primeira. */
export function colunasDaFita(m: Metade): { ids: string[]; largura: number }[] {
  const cols: { ids: string[]; largura: number }[] = [];
  for (const j of m.janelas) {
    if (j.empilhada && cols.length) cols[cols.length - 1].ids.push(j.id);
    else cols.push({ ids: [j.id], largura: j.largura || 2 });
  }
  return cols;
}

/** Onde cada janela fica dentro do corpo da metade. `rolagem`: deslocamento da fita. */
export function arrumar(m: Metade, mi: number, corpo: Retangulo, rolagem: number, vao = 6): Lugar[] {
  const n = m.janelas.length;
  if (!n) return [];
  if (m.modo === "abas" || n === 1) {
    return m.janelas.map((j) => ({ id: j.id, mi, r: corpo, visivel: j.id === m.ativa || n === 1, cabeca: m.modo !== "abas" }));
  }
  if (m.modo === "tile") {
    const wp = Math.round(corpo.w * m.proporcao);
    const resto = m.janelas.slice(1);
    const h = (corpo.h - vao * (resto.length - 1)) / resto.length;
    return [
      { id: m.janelas[0].id, mi, r: { x: corpo.x, y: corpo.y, w: wp - vao / 2, h: corpo.h }, visivel: true, cabeca: true },
      ...resto.map((j, i) => ({
        id: j.id, mi, visivel: true, cabeca: true,
        r: { x: corpo.x + wp + vao / 2, y: corpo.y + i * (h + vao), w: corpo.w - wp - vao / 2, h },
      })),
    ];
  }
  const lugares: Lugar[] = [];
  let x = corpo.x - rolagem;
  colunasDaFita(m).forEach((c, ci) => {
    const w = corpo.w / c.largura;
    const h = (corpo.h - vao * (c.ids.length - 1)) / c.ids.length;
    c.ids.forEach((id, k) => {
      const r = { x: x + vao / 2, y: corpo.y + k * (h + vao), w: w - vao, h };
      lugares.push({ id, mi, r, visivel: r.x + r.w > corpo.x && r.x < corpo.x + corpo.w, cabeca: true, coluna: ci });
    });
    x += w;
  });
  return lugares;
}

/**
 * Fita: para onde rolar quando a janela `id` ganha o foco, como no Niri ("center-focused-column on-overflow"):
 * - já está inteira à vista: não mexe;
 * - cabe junto com a janela de antes (`anterior`): rola o mínimo para as duas ficarem à vista;
 * - não cabe: a coluna dela vem para o centro (a de antes fica pela metade dos lados, não some de repente).
 */
export function rolagemPara(m: Metade, largura: number, id: string | null, atual: number, anterior?: string | null): number {
  const cols = colunasDaFita(m);
  let x = 0;
  let total = 0;
  let alvo: { x: number; w: number } | null = null;
  let antes: { x: number; w: number } | null = null;
  for (const c of cols) {
    const w = largura / c.largura;
    if (id && c.ids.includes(id)) alvo = { x, w };
    if (anterior && c.ids.includes(anterior)) antes = { x, w };
    x += w;
    total = x;
  }
  const limitar = (r: number) => Math.max(0, Math.min(r, Math.max(0, total - largura)));
  const r = limitar(atual);
  if (!alvo) return r;
  const folga = 0.5;
  if (alvo.x >= r - folga && alvo.x + alvo.w <= r + largura + folga) return r;
  if (antes && antes !== alvo) {
    const ini = Math.min(antes.x, alvo.x);
    const fim = Math.max(antes.x + antes.w, alvo.x + alvo.w);
    if (fim - ini <= largura + folga) return limitar(alvo.x > antes.x ? fim - largura : ini);
  }
  return limitar(alvo.x - (largura - alvo.w) / 2);
}
