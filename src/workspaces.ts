// Workspaces: cada item tem o seu (vazio até ser usado), além do da bancada ("Bancada", chave "geral"), cuja
// pasta é a raiz da bancada (o agente aberto ali coordena tudo). Terminal aberto num workspace nasce na pasta dele. Um workspace é o estado do painel de
// trabalho (metades, janelas, terminais). Fica guardado por bancada: ao reabrir o app, as janelas voltam (os
// terminais voltam parados). Os workspaces abertos nesta sessão ficam vivos por trás quando se troca de um para outro.
import * as P from "./painel";
import { EstadoPainel } from "./painel";
import { guardar, ler, Rota } from "./ui";

export const GERAL = "geral";
export const chaveItem = (id: number) => `item:${id}`;
export const itemDa = (chave: string) => (chave.startsWith("item:") ? Number(chave.slice(5)) : null);

export interface InfoWorkspace {
  /** o nome que aparece: o dado à mão (`nome`) ou, sem ele, o título do documento (`doc`) */
  titulo: string;
  /** nome dado à mão (renomear); vale mais que o título do documento */
  nome?: string;
  /** o título atual do documento (o workspace acompanha quando o documento muda de nome) */
  doc?: string;
  icone?: string;
  /** quando foi aberto pela última vez (para a poda do que fica guardado) */
  usado?: number;
}

/** O que fica guardado entre uma sessão e outra: os workspaces de item usados por último e, em cada janela, os
 *  últimos passos do histórico. Na sessão o histórico vai até 50 passos; guardado, até este tanto. */
const GUARDAR_WORKSPACES = 40;
const GUARDAR_PASSOS = 15;

function podarJanelas(e: EstadoPainel): EstadoPainel {
  return {
    ...e,
    metades: e.metades.map((m) => ({
      ...m,
      janelas: m.janelas.map((j) => {
        const ini = Math.max(0, j.pos - (GUARDAR_PASSOS - 1));
        const hist = j.hist.slice(ini, j.pos + 1);
        const chaves = new Set(hist.map(P.chaveRota));
        const rotulos = j.rotulos && Object.fromEntries(Object.entries(j.rotulos).filter(([k]) => chaves.has(k)));
        return { ...j, hist, pos: hist.length - 1, rotulos };
      }),
    })),
  };
}

export interface Workspaces {
  ativo: string;
  estados: Record<string, EstadoPainel>;
  info: Record<string, InfoWorkspace>;
  /** vivos nesta sessão (os terminais deles estão rodando); os outros só têm o estado guardado */
  abertos: string[];
}

const chaveGuardada = (bancada: string) => `workspaces:${bancada}`;

export function carregar(bancada: string): Workspaces {
  const g = ler<Omit<Workspaces, "abertos"> | null>(chaveGuardada(bancada), null);
  if (!g?.estados?.[GERAL]) {
    // primeira vez: o painel de antes vira o "Geral"
    const geral = P.restaurar(ler<EstadoPainel | null>("painel", null), ler<Rota>("rota", { v: "inicio" }));
    return { ativo: GERAL, estados: { [GERAL]: geral }, info: { [GERAL]: { titulo: "Bancada" } }, abertos: [GERAL] };
  }
  const estados: Record<string, EstadoPainel> = {};
  for (const [k, e] of Object.entries(g.estados)) estados[k] = P.restaurar(e, k === GERAL ? { v: "inicio" } : { v: "item", id: itemDa(k) ?? 0 });
  const ativo = estados[g.ativo] ? g.ativo : GERAL;
  return { ativo, estados, info: { ...g.info, [GERAL]: { ...g.info?.[GERAL], titulo: g.info?.[GERAL]?.nome || "Bancada" } }, abertos: [ativo] };
}

export function salvar(bancada: string, w: Workspaces) {
  // ficam: o da bancada, os abertos agora e os de item usados por último
  const deItem = Object.keys(w.estados).filter((k) => k !== GERAL && !w.abertos.includes(k));
  deItem.sort((a, b) => (w.info[b]?.usado ?? 0) - (w.info[a]?.usado ?? 0));
  const ficam = new Set([GERAL, ...w.abertos, ...deItem.slice(0, GUARDAR_WORKSPACES)]);
  const estados = Object.fromEntries(Object.entries(w.estados).filter(([k]) => ficam.has(k)).map(([k, e]) => [k, podarJanelas(e)]));
  const info = Object.fromEntries(Object.entries(w.info).filter(([k]) => ficam.has(k)));
  guardar(chaveGuardada(bancada), { ativo: w.ativo, estados, info });
}

/** Vai para o workspace (criando o do item, se ainda não existe: começa com o próprio item aberto). */
export function abrir(w: Workspaces, chave: string, info?: InfoWorkspace): Workspaces {
  const id = itemDa(chave);
  const estados = w.estados[chave] ? w.estados : { ...w.estados, [chave]: P.inicial(id != null ? { v: "item", id } : { v: "inicio" }) };
  return {
    ...w,
    ativo: chave,
    estados,
    info: { ...w.info, [chave]: { ...juntarInfo(w.info[chave] ?? { titulo: chave }, info), usado: Date.now() } },
    abertos: w.abertos.includes(chave) ? w.abertos : [...w.abertos, chave],
  };
}

/** O título que vem do documento entra em `doc`; o que aparece só muda se não houver nome dado à mão. */
function juntarInfo(antes: InfoWorkspace, novo?: Partial<InfoWorkspace>): InfoWorkspace {
  if (!novo) return antes;
  const doc = novo.titulo ?? antes.doc;
  return { ...antes, ...novo, doc, titulo: antes.nome || novo.titulo || antes.titulo };
}

/** Renomeia à mão; nome vazio volta ao título do documento (ou "Bancada"). */
export function renomear(w: Workspaces, chave: string, nome: string): Workspaces {
  const i = w.info[chave];
  if (!i && !w.estados[chave]) return w;
  const n = nome.trim();
  const base = i ?? { titulo: chave };
  const titulo = n || base.doc || (chave === GERAL ? "Bancada" : base.titulo);
  const { nome: _n, ...resto } = base;
  return { ...w, info: { ...w.info, [chave]: n ? { ...resto, nome: n, titulo } : { ...resto, titulo } } };
}

/** O documento mudou de título (ou de ícone): o workspace dele acompanha. */
export function seguirDocumento(w: Workspaces, id: number, titulo: string, icone?: string): Workspaces {
  const k = chaveItem(id);
  const i = w.info[k];
  if (!i || (i.doc === titulo && (icone == null || i.icone === icone))) return w;
  return { ...w, info: { ...w.info, [k]: { ...i, doc: titulo, titulo: i.nome || titulo, ...(icone != null ? { icone } : {}) } } };
}

/** Fecha (suspende): os terminais dele param, as janelas ficam guardadas. */
export function fechar(w: Workspaces, chave: string): Workspaces {
  const abertos = w.abertos.filter((k) => k !== chave);
  const ativo = w.ativo === chave ? abertos[abertos.length - 1] ?? GERAL : w.ativo;
  return { ...w, abertos: abertos.includes(ativo) ? abertos : [...abertos, ativo], ativo };
}

/** Esquece: some da lista (o do item volta a ser vazio). O da bancada não sai. */
export function esquecer(w: Workspaces, chave: string): Workspaces {
  if (chave === GERAL) return w;
  const f = fechar(w, chave);
  const { [chave]: _e, ...estados } = f.estados;
  const { [chave]: _i, ...info } = f.info;
  return { ...f, estados, info };
}

/** Próximo/anterior entre os abertos. */
export function vizinho(w: Workspaces, passo: number): Workspaces {
  const i = w.abertos.indexOf(w.ativo);
  const k = w.abertos[(i + passo + w.abertos.length) % w.abertos.length];
  return { ...w, ativo: k };
}

/** Sessões de terminal de cada workspace (para a barra de status somar a memória). */
export function sessoesDe(e: EstadoPainel): { sessao: number; titulo: string; programa?: string }[] {
  return e.metades.flatMap((m) => m.janelas).map((j) => ({ r: P.rotaDe(j), j }))
    .filter((x) => x.r.v === "terminal")
    .map((x) => ({ sessao: (x.r as { sessao: number }).sessao, titulo: x.j.titulo ?? "terminal", programa: (x.r as { programa?: string }).programa }));
}
