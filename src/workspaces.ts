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
  titulo: string;
  icone?: string;
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
  return { ativo, estados, info: { ...g.info, [GERAL]: { titulo: "Bancada" } }, abertos: [ativo] };
}

export function salvar(bancada: string, w: Workspaces) {
  guardar(chaveGuardada(bancada), { ativo: w.ativo, estados: w.estados, info: w.info });
}

/** Vai para o workspace (criando o do item, se ainda não existe: começa com o próprio item aberto). */
export function abrir(w: Workspaces, chave: string, info?: InfoWorkspace): Workspaces {
  const id = itemDa(chave);
  const estados = w.estados[chave] ? w.estados : { ...w.estados, [chave]: P.inicial(id != null ? { v: "item", id } : { v: "inicio" }) };
  return {
    ...w,
    ativo: chave,
    estados,
    info: info ? { ...w.info, [chave]: info } : w.info,
    abertos: w.abertos.includes(chave) ? w.abertos : [...w.abertos, chave],
  };
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
export function sessoesDe(e: EstadoPainel): { sessao: number; titulo: string }[] {
  return e.metades.flatMap((m) => m.janelas).map((j) => ({ r: P.rotaDe(j), j }))
    .filter((x) => x.r.v === "terminal")
    .map((x) => ({ sessao: (x.r as { sessao: number }).sessao, titulo: x.j.titulo ?? "terminal" }));
}
