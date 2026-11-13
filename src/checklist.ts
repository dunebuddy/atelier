// Checklist do atelier: um arquivo `*.checklist.json` na pasta do documento, com os passos e o estado no mesmo arquivo.
// Os passos são escritos pelo agente e editados na tela; o estado (feito, pulado, observação) é ligado ao passo pelo
// `id`, então reordenar, inserir ou apagar passos não perde progresso nem quebra dependências. Tudo aqui é função
// pura (sem tela).

/** Link de um passo: "#a3f9c21" (documento), "https://..." (site) ou um caminho de arquivo (relativo à pasta do
 *  checklist, ou absoluto). Com rótulo: `{ "rotulo": "Guia", "alvo": "guia.md" }`. */
export type Link = string | { rotulo?: string; alvo: string };

export interface Passo {
  id: string;
  titulo: string;
  /** seção onde o passo aparece (passos seguidos com o mesmo grupo formam uma seção) */
  grupo?: string;
  /** etiquetas livres do checklist (onde se faz, ambiente...), para filtrar */
  tags?: string[];
  /** ids dos passos que precisam estar feitos antes */
  depende_de?: string[];
  opcional?: boolean;
  /** campos (chaves de `campos`) que este passo coleta; o valor aparece no corpo onde houver {{chave}} */
  pede?: string[];
  /** o que fazer, em markdown */
  corpo?: string;
  links?: Link[];
}

export interface EstadoPasso {
  /** quando foi feito (ISO); pulado também tem data */
  feito?: string;
  por?: string;
  pulado?: boolean;
  obs?: string;
  /** código do documento em que o passo virou ("Virar documento") */
  documento?: string;
}

/** Bloco de texto (markdown) entre as seções: fica logo antes do passo `antes_de` (sem ele, no fim). */
export interface Comentario {
  id: string;
  texto: string;
  antes_de?: string | null;
}

export interface Checklist {
  atelier?: "checklist";
  versao?: number;
  titulo?: string;
  /** formato antigo: vira o primeiro comentário ao ler */
  descricao?: string;
  comentarios?: Comentario[];
  /** chave → rótulo dos valores coletados durante a execução */
  campos?: Record<string, string>;
  passos: Passo[];
  estado?: Record<string, EstadoPasso>;
  valores?: Record<string, string>;
  /** as trocas de valor (de → para): o "log" de quando um nome mudou no meio da sessão */
  historico?: TrocaDeValor[];
}

export interface TrocaDeValor { quando: string; chave: string; de: string; para: string; por: string }

/** Muda o valor de um campo e registra a troca no histórico (vazio apaga o valor; o mesmo valor não registra). */
/** O valor virou segredo: no histórico, os valores antigos dessa chave viram •••• (o texto do segredo sai do
 *  arquivo inteiro), e a troca registra só "→ cofre". */
export function valorParaOCofre(d: Checklist, chave: string, id: number, por = "Paulo") {
  for (const h of d.historico ?? []) {
    if (h.chave !== chave) continue;
    if (h.de && idNoCofre(h.de) == null) h.de = "••••";
    if (h.para && idNoCofre(h.para) == null) h.para = "••••";
  }
  (d.valores ??= {})[chave] = `cofre:${id}`;
  (d.historico ??= []).push({ quando: new Date().toISOString(), chave, de: "••••", para: `cofre:${id}`, por });
}

export function trocarValor(d: Checklist, chave: string, para: string, por = "Paulo") {
  const de = d.valores?.[chave] ?? "";
  if (de === para) return;
  if (para.trim()) (d.valores ??= {})[chave] = para; else delete d.valores?.[chave];
  (d.historico ??= []).push({ quando: new Date().toISOString(), chave, de, para, por });
}

/** Marca de referência no texto antes do markdown (vira etiqueta depois): caracteres de uso privado, que o markdown
 *  deixa passar como texto (U+E000 e U+E001, gravados direto entre as aspas). */
export const REF_INI = "", REF_FIM = "";
export const marcarRefs = (texto: string) => texto.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k: string) => `${REF_INI}${k}${REF_FIM}`);

export const ehChecklist = (caminho: string) => /\.checklist\.json$/i.test(caminho);

/** Lê o texto do arquivo. Erro grave (não é JSON, sem passos) lança; problemas menores vêm em `avisos`. Formatos
 *  antigos são trazidos para o atual (props → tags; links do estado → links do passo). */
export function lerChecklist(texto: string): { doc: Checklist; avisos: string[] } {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch (e) {
    throw new Error(`O arquivo não é um JSON válido: ${(e as Error).message}`);
  }
  if (!bruto || typeof bruto !== "object" || !Array.isArray((bruto as Checklist).passos)) {
    throw new Error('O arquivo não tem a lista "passos".');
  }
  const doc = bruto as Checklist;
  const avisos: string[] = [];
  const vistos = new Set<string>();
  doc.estado ??= {};
  doc.valores ??= {};
  doc.passos = doc.passos.filter((p, i) => {
    if (!p || typeof p !== "object" || typeof p.id !== "string" || !p.id) {
      avisos.push(`O passo ${i + 1} não tem "id" e ficou de fora.`);
      return false;
    }
    if (vistos.has(p.id)) {
      avisos.push(`O id "${p.id}" se repete; só o primeiro vale.`);
      return false;
    }
    vistos.add(p.id);
    if (typeof p.titulo !== "string") p.titulo = String(p.titulo ?? p.id);
    const velho = p as Passo & { props?: Record<string, unknown> };
    if (velho.props && typeof velho.props === "object") {
      p.tags = sem_repetir([...(p.tags ?? []), ...Object.values(velho.props).map(String)]);
      delete velho.props;
    }
    const e = doc.estado![p.id] as (EstadoPasso & { links?: Link[] }) | undefined;
    if (e?.links?.length) {
      p.links = [...(p.links ?? []), ...e.links];
      delete e.links;
    }
    return true;
  });
  // a descrição antiga vira um comentário no topo
  if (typeof doc.descricao === "string") {
    if (doc.descricao.trim()) {
      doc.comentarios = [{ id: novoIdComentario(doc), texto: doc.descricao, antes_de: doc.passos[0]?.id ?? null }, ...(doc.comentarios ?? [])];
    }
    delete doc.descricao;
  }
  doc.comentarios = (doc.comentarios ?? []).filter((c) => c && typeof c.texto === "string").map((c) => ({ ...c, id: c.id || novoIdComentario(doc) }));
  if (!doc.comentarios.length) delete doc.comentarios;
  for (const p of doc.passos) {
    const faltam = (p.depende_de ?? []).filter((d) => !vistos.has(d));
    if (faltam.length) {
      avisos.push(`"${p.titulo}" dependia de ${faltam.map((d) => `"${d}"`).join(", ")}, que não existe (ignorado).`);
      p.depende_de = (p.depende_de ?? []).filter((d) => vistos.has(d));
    }
  }
  return { doc, avisos };
}

const sem_repetir = (l: string[]) => [...new Set(l.map((x) => x.trim()).filter(Boolean))];

/** O texto que vai para o arquivo (sempre com a marca do formato na frente). */
export function escreverChecklist(doc: Checklist): string {
  const { atelier: _a, versao: _v, ...resto } = doc;
  return JSON.stringify({ atelier: "checklist", versao: 2, ...resto }, null, 2) + "\n";
}

export const feito = (doc: Checklist, id: string) => !!doc.estado?.[id]?.feito;

/** Dependências ainda não feitas (pulado conta como feito). */
export const faltando = (doc: Checklist, p: Passo) => (p.depende_de ?? []).filter((d) => !feito(doc, d));

/** Passos que dependem deste. */
export const dependentes = (doc: Checklist, id: string) => doc.passos.filter((p) => p.depende_de?.includes(id));

export function progresso(doc: Checklist) {
  const feitos = doc.passos.filter((p) => feito(doc, p.id)).length;
  const pulados = doc.passos.filter((p) => doc.estado?.[p.id]?.pulado).length;
  return { feitos, pulados, total: doc.passos.length };
}

/** As tags do checklist, na ordem em que aparecem, com quantos passos têm cada uma. */
export function tagsDe(doc: Checklist): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of doc.passos) for (const t of p.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

/** Seções do roteiro: cada sequência de passos seguidos com o mesmo grupo. `ini`/`fim` são índices em `passos`. */
export interface Bloco { nome: string; ini: number; fim: number }
export function blocos(doc: Checklist): Bloco[] {
  const out: Bloco[] = [];
  doc.passos.forEach((p, i) => {
    const nome = p.grupo ?? "";
    const ult = out[out.length - 1];
    if (ult && ult.nome === nome) ult.fim = i;
    else out.push({ nome, ini: i, fim: i });
  });
  return out;
}

export function novoId(doc: Checklist): string {
  const usados = new Set(doc.passos.map((p) => p.id));
  for (;;) {
    const id = "p" + Math.random().toString(36).slice(2, 8);
    if (!usados.has(id)) return id;
  }
}

/** Cria um passo na posição `indice` (fim, sem índice), na seção `grupo`. Devolve o id. */
export function criarPasso(doc: Checklist, grupo: string | undefined, indice = doc.passos.length, titulo = "Novo passo"): string {
  const id = novoId(doc);
  doc.passos.splice(indice, 0, { id, titulo, ...(grupo ? { grupo } : {}) });
  return id;
}

export function novoIdComentario(doc: Checklist): string {
  const usados = new Set((doc.comentarios ?? []).map((c) => c.id));
  for (;;) {
    const id = "c" + Math.random().toString(36).slice(2, 8);
    if (!usados.has(id)) return id;
  }
}

/** Cria um comentário antes do passo `antes_de` (null: no fim). Devolve o id. */
export function criarComentario(doc: Checklist, antes_de: string | null, texto = ""): string {
  const id = novoIdComentario(doc);
  (doc.comentarios ??= []).push({ id, texto, antes_de });
  return id;
}

export function apagarComentario(doc: Checklist, id: string) {
  doc.comentarios = (doc.comentarios ?? []).filter((c) => c.id !== id);
  if (!doc.comentarios.length) delete doc.comentarios;
}

/** Apaga o passo, o estado dele e as dependências que apontavam para ele. Comentários presos a ele passam para o
 *  passo seguinte. */
export function apagarPasso(doc: Checklist, id: string) {
  const i = doc.passos.findIndex((p) => p.id === id);
  const seguinte = doc.passos[i + 1]?.id ?? null;
  for (const c of doc.comentarios ?? []) if (c.antes_de === id) c.antes_de = seguinte;
  doc.passos = doc.passos.filter((p) => p.id !== id);
  for (const p of doc.passos) {
    if (p.depende_de?.includes(id)) {
      p.depende_de = p.depende_de.filter((d) => d !== id);
      if (!p.depende_de.length) delete p.depende_de;
    }
  }
  delete doc.estado?.[id];
}

/** Move o passo `id` para antes (ou depois) do passo `alvo`, entrando na seção dele. */
export function moverPasso(doc: Checklist, id: string, alvo: string, antes: boolean) {
  if (id === alvo) return;
  const i = doc.passos.findIndex((p) => p.id === id);
  if (i < 0) return;
  const [p] = doc.passos.splice(i, 1);
  const j = doc.passos.findIndex((x) => x.id === alvo);
  if (j < 0) { doc.passos.splice(i, 0, p); return; }
  const g = doc.passos[j].grupo;
  if (g) p.grupo = g; else delete p.grupo;
  doc.passos.splice(antes ? j : j + 1, 0, p);
}

/** Move o passo para o fim da seção `b` (índice em `blocos`). */
export function moverParaSecao(doc: Checklist, id: string, b: number) {
  const bl = blocos(doc)[b];
  if (!bl) return;
  const ultimo = doc.passos[bl.fim];
  if (ultimo.id === id) return;
  moverPasso(doc, id, ultimo.id, false);
}

/** Troca a seção `b` de lugar com a de cima (-1) ou a de baixo (+1). */
export function moverSecao(doc: Checklist, b: number, dir: -1 | 1) {
  const bs = blocos(doc);
  const a = bs[b], c = bs[b + dir];
  if (!a || !c) return;
  const [cima, baixo] = dir < 0 ? [c, a] : [a, c];
  const p = doc.passos;
  doc.passos = [...p.slice(0, cima.ini), ...p.slice(baixo.ini, baixo.fim + 1), ...p.slice(cima.ini, cima.fim + 1), ...p.slice(baixo.fim + 1)];
}

export function renomearSecao(doc: Checklist, b: number, nome: string) {
  const bl = blocos(doc)[b];
  if (!bl) return;
  for (let i = bl.ini; i <= bl.fim; i++) {
    if (nome) doc.passos[i].grupo = nome; else delete doc.passos[i].grupo;
  }
}

/** `para` depende (direta ou indiretamente) de `de`? Pôr `para` como dependência de `de` criaria um ciclo. */
export function dependeDe(doc: Checklist, para: string, de: string): boolean {
  const porId = new Map(doc.passos.map((p) => [p.id, p]));
  const vistos = new Set<string>();
  const pilha = [para];
  while (pilha.length) {
    const x = pilha.pop()!;
    if (x === de) return true;
    if (vistos.has(x)) continue;
    vistos.add(x);
    pilha.push(...(porId.get(x)?.depende_de ?? []));
  }
  return false;
}

/** Troca {{chave}} pelo valor coletado; sem valor, fica ‹chave› (à vista, e sem virar tag no markdown). */
/** Valor que mora no cofre de segredos: no arquivo fica só `cofre:<id>` (a referência), nunca o valor. */
export const idNoCofre = (v: string | undefined): number | null => {
  const m = v?.match(/^cofre:(\d+)$/);
  return m ? Number(m[1]) : null;
};

/** Troca {{chave}} pelo valor (segredo do cofre aparece como ••••••, nunca o valor). */
export const preencher = (texto: string, valores: Record<string, string>) =>
  texto.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k: string) => (idNoCofre(valores[k]) != null ? "••••••" : valores[k] ? valores[k] : `‹${k}›`));

/** Chave de campo a partir do rótulo ("Nome do Key Vault" → "nome_do_key_vault"), sem repetir as que existem. */
export function chaveDeCampo(doc: Checklist, rotulo: string): string {
  const base = rotulo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "campo";
  let k = base, n = 2;
  while (doc.campos?.[k] !== undefined) k = `${base}_${n++}`;
  return k;
}

export type Alvo = { tipo: "doc"; codigo: string } | { tipo: "url"; url: string } | { tipo: "arquivo"; caminho: string };

const RE_CODIGO = /^#?([0-9a-f]{7})$/i;

/** Para onde um link aponta. Caminho relativo é relativo à pasta do checklist (como num link de markdown). */
export function alvoDe(link: Link, pastaDoChecklist: string): Alvo {
  const alvo = (typeof link === "string" ? link : link.alvo).trim();
  const cod = alvo.match(RE_CODIGO);
  if (cod && alvo.startsWith("#")) return { tipo: "doc", codigo: cod[1].toLowerCase() };
  const atelier = alvo.match(/^atelier:\/\/doc\/([0-9a-f]{7})/i);
  if (atelier) return { tipo: "doc", codigo: atelier[1].toLowerCase() };
  if (/^file:\/\/\//i.test(alvo)) return { tipo: "arquivo", caminho: decodeURI(alvo.slice(8)) };
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(alvo) || alvo.startsWith("mailto:")) return { tipo: "url", url: alvo };
  return { tipo: "arquivo", caminho: juntar(pastaDoChecklist, alvo) };
}

export const rotuloDe = (link: Link) => {
  if (typeof link !== "string" && link.rotulo) return link.rotulo;
  const alvo = typeof link === "string" ? link : link.alvo;
  return alvo.split(/[\\/]/).filter(Boolean).pop() ?? alvo;
};

/** pasta + caminho relativo (ou o próprio caminho, se for absoluto), resolvendo "." e "..". */
export function juntar(pasta: string, rel: string): string {
  if (/^([a-z]:[\\/]|[\\/]{1,2})/i.test(rel)) return rel;
  const sep = pasta.includes("\\") ? "\\" : "/";
  const partes = pasta.split(/[\\/]/);
  for (const p of rel.split(/[\\/]/)) {
    if (!p || p === ".") continue;
    if (p === "..") partes.length > 1 && partes.pop();
    else partes.push(p);
  }
  return partes.join(sep);
}

/** Caminho de `para` relativo à pasta `de` (com "/"), ou o absoluto se não houver como (outro disco). */
export function relativo(de: string, para: string): string {
  const a = de.split(/[\\/]/).filter(Boolean), b = para.split(/[\\/]/).filter(Boolean);
  if (!a.length || !b.length || a[0].toLowerCase() !== b[0].toLowerCase()) return para;
  let i = 0;
  while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
  return [...a.slice(i).map(() => ".."), ...b.slice(i)].join("/");
}

/** Pasta do documento dono e o código dele, pela pasta padrão `itens/<código>-<título>/`. */
export function donoDaPasta(caminho: string): { codigo: string; pasta: string } | null {
  const m = caminho.match(/^(.*[\\/]itens[\\/]([0-9a-f]{7})-[^\\/]*)[\\/]/i);
  return m ? { codigo: m[2].toLowerCase(), pasta: m[1] } : null;
}

/** Cor da etiqueta, sempre a mesma para o mesmo nome. */
const CORES = ["blue", "green", "orange", "purple", "pink", "yellow", "brown", "gray"];
export function corDaTag(t: string): string {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return CORES[h % CORES.length];
}
