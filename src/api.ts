// Cliente da API local do atelier (a mesma que o Claude e o MCP usam).

// o teste sem janela (`bun run teste`) aponta para outra porta, ao lado do app aberto
export const BASE: string = import.meta.env.VITE_ATELIER_API ?? "http://127.0.0.1:7477/api";

export type Cor = "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";
export const CORES: Cor[] = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

export interface Opcao {
  nome: string;
  cor?: Cor;
  historico?: boolean;
}

export type Especie =
  | "texto" | "numero" | "data" | "checkbox" | "url" | "email" | "telefone" | "selecao" | "multisselecao" | "status"
  | "relacao" | "links" | "criado_em" | "atualizado_em";

export const ESPECIES: { id: Especie; nome: string }[] = [
  { id: "texto", nome: "Texto" },
  { id: "numero", nome: "Número" },
  { id: "data", nome: "Data" },
  { id: "checkbox", nome: "Sim/não" },
  { id: "url", nome: "Link (URL)" },
  { id: "email", nome: "E-mail" },
  { id: "telefone", nome: "Telefone" },
  { id: "selecao", nome: "Seleção" },
  { id: "multisselecao", nome: "Multisseleção" },
  { id: "status", nome: "Status" },
  { id: "relacao", nome: "Relação (aponta para itens)" },
  { id: "links", nome: "Links (vários, por ferramenta)" },
  { id: "criado_em", nome: "Criado em (automática)" },
  { id: "atualizado_em", nome: "Atualizado em (automática)" },
];

export interface Propriedade {
  id: number;
  nome: string;
  especie: Especie;
  opcoes: Opcao[];
  /** relação: inverso, um_so · número: inteiro, casas, formato · data: hora · texto/número/data/e-mail/telefone/url: lista */
  config: ConfigProp;
}

export interface ConfigProp {
  inverso?: string | null;
  um_so?: boolean;
  lista?: boolean;
  inteiro?: boolean;
  casas?: number | null;
  formato?: "numero" | "percentual" | "moeda";
  hora?: boolean;
  /** na tabela, o valor quebra linha em vez de cortar em "…" (desligado por padrão) */
  quebrar?: boolean;
}

/** Espécies que aceitam vários valores (config.lista). */
export const LISTAVEIS: Especie[] = ["texto", "numero", "data", "email", "telefone", "url"];

/** Os jeitos de criar uma propriedade (espécie + config), como no Notion. */
export const MOLDES: { nome: string; especie: Especie; config?: ConfigProp }[] = [
  { nome: "Texto", especie: "texto" },
  { nome: "Lista de textos", especie: "texto", config: { lista: true } },
  { nome: "Número inteiro", especie: "numero", config: { inteiro: true } },
  { nome: "Número decimal", especie: "numero", config: { casas: 2 } },
  { nome: "Percentual", especie: "numero", config: { formato: "percentual" } },
  { nome: "Moeda (R$)", especie: "numero", config: { formato: "moeda", casas: 2 } },
  { nome: "Lista de números", especie: "numero", config: { lista: true } },
  { nome: "Data", especie: "data" },
  { nome: "Data e hora", especie: "data", config: { hora: true } },
  { nome: "Lista de datas", especie: "data", config: { lista: true } },
  { nome: "Sim/não", especie: "checkbox" },
  { nome: "Seleção", especie: "selecao" },
  { nome: "Multisseleção", especie: "multisselecao" },
  { nome: "Status", especie: "status" },
  { nome: "Item (aponta para um)", especie: "relacao", config: { um_so: true } },
  { nome: "Lista de itens", especie: "relacao" },
  { nome: "Link (URL)", especie: "url" },
  { nome: "Links por ferramenta", especie: "links" },
  { nome: "E-mail", especie: "email" },
  { nome: "Telefone", especie: "telefone" },
  { nome: "Criado em (automática)", especie: "criado_em" },
  { nome: "Atualizado em (automática)", especie: "atualizado_em" },
];

export interface TipoProp {
  propriedade_id: number;
  ordem: number;
  opcoes: Opcao[] | null;
}

export interface Tipo {
  id: number;
  nome: string;
  icone: string;
  cor: string | null;
  ordem: number;
  propriedades: TipoProp[];
}

export interface Modelo {
  id: number;
  tipo_id: number;
  nome: string;
  titulo: string;
  corpo: string;
  props: Props;
  padrao: boolean;
}

export interface Esquema {
  tipos: Tipo[];
  propriedades: Propriedade[];
  modelos: Modelo[];
}

export interface Link {
  url: string;
  rotulo?: string;
}

export type Valor = string | number | boolean | string[] | number[] | Link[] | null;
export type Props = Record<string, Valor>;

export interface Nota {
  id: number;
  texto: string;
  autor: string;
  criado_em: string;
  editado_em?: string | null;
}

export interface Versao {
  id: number;
  conteudo: string;
  autor: string;
  criado_em: string;
}

export interface Item {
  id: number;
  /** código visível, 7 hexadecimais (a3f9c21) */
  codigo: string;
  titulo: string;
  tipo_id: number | null;
  pasta: string | null;
  props: Props;
  criado_em: string;
  atualizado_em: string;
  corpo?: string;
  notas?: Nota[];
  /** na lixeira desde quando */
  apagado_em?: string | null;
  /** quem aponta para este item numa propriedade de relação (lido do lado dele) */
  referencias?: { prop_id: number; rotulo: string; item: Resumo }[];
  /** resumo dos itens que este aponta */
  relacionados?: Resumo[];
  /** itens que citam #código deste */
  mencionado_em?: { id: number; codigo: string; titulo: string; tipo_id: number | null }[];
}

export interface Entrada {
  nome: string;
  caminho: string;
  pasta: boolean;
  tamanho: number;
  modificado: string | null;
  /** pasta · pdf · markdown · html · imagem · video · audio · texto · outro */
  especie: string;
}

export interface Arquivo {
  grupo: "insumos" | "artefatos" | "rascunho" | "raiz";
  nome: string;
  caminho: string;
  pasta: boolean;
  tamanho: number;
  modificado: string | null;
}

export interface Resumo {
  id: number;
  codigo: string;
  titulo: string;
  tipo_id: number | null;
  na_lixeira?: boolean;
}

async function req<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: corpo !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro ?? `erro ${r.status}`);
  return dados as T;
}

export const api = {
  esquema: () => req<Esquema>("GET", "/esquema"),

  criarTipo: (d: { nome: string; icone?: string }) => req<{ id: number }>("POST", "/tipos", d),
  atualizarTipo: (id: number, d: Partial<Pick<Tipo, "nome" | "icone" | "cor" | "ordem">>) => req("PATCH", `/tipos/${id}`, d),
  apagarTipo: (id: number) => req("DELETE", `/tipos/${id}`),
  porPropNoTipo: (tipo: number, prop: number, d: { ordem?: number; opcoes?: Opcao[] | null } = {}) =>
    req("PUT", `/tipos/${tipo}/propriedades/${prop}`, d),
  tirarPropDoTipo: (tipo: number, prop: number) => req("DELETE", `/tipos/${tipo}/propriedades/${prop}`),

  criarProp: (d: { nome: string; especie: Especie; opcoes?: Opcao[]; config?: Propriedade["config"] }) => req<{ id: number }>("POST", "/propriedades", d),
  atualizarProp: (id: number, d: Partial<Pick<Propriedade, "nome" | "especie" | "opcoes" | "config">>) => req("PATCH", `/propriedades/${id}`, d),
  apagarProp: (id: number) => req("DELETE", `/propriedades/${id}`),

  criarModelo: (d: Partial<Modelo> & { tipo_id: number }) => req<{ id: number }>("POST", "/modelos", d),
  atualizarModelo: (id: number, d: Partial<Modelo>) => req("PATCH", `/modelos/${id}`, d),
  apagarModelo: (id: number) => req("DELETE", `/modelos/${id}`),

  itens: (f: { tipo?: number | null; q?: string; props?: Record<number, string> } = {}) => {
    const p = new URLSearchParams();
    if (f.tipo != null) p.set("tipo", String(f.tipo));
    if (f.q) p.set("q", f.q);
    for (const [k, v] of Object.entries(f.props ?? {})) p.set(`p.${k}`, v);
    return req<Item[]>("GET", `/itens?${p}`);
  },
  item: (id: number) => req<Item>("GET", `/itens/${id}`),
  criarItem: (d: { titulo?: string; tipo_id?: number | null; modelo_id?: number | null; props?: Props; corpo?: string }) =>
    req<Item>("POST", "/itens", d),
  atualizarItem: (id: number, d: Partial<Pick<Item, "titulo" | "tipo_id" | "corpo" | "pasta">> & { props?: Props }) =>
    req<Item>("PATCH", `/itens/${id}`, d),
  apagarItem: (id: number) => req("DELETE", `/itens/${id}`),
  anotar: (id: number, texto: string, autor = "Paulo") => req("POST", `/itens/${id}/notas`, { texto, autor }),
  editarNota: (id: number, texto: string) => req("PATCH", `/notas/${id}`, { texto }),
  apagarNota: (id: number) => req("DELETE", `/notas/${id}`),
  restaurarNota: (id: number) => req("POST", `/notas/${id}/restaurar`),
  versoesNota: (id: number) => req<Versao[]>("GET", `/notas/${id}/versoes`),
  versoesItem: (id: number) => req<Versao[]>("GET", `/itens/${id}/versoes`),
  restaurarVersao: (id: number) => req("POST", `/versoes/${id}/restaurar`),
  restaurarItem: (id: number) => req("POST", `/itens/${id}/restaurar`),
  /** liga (ou desliga) o item `de` ao `para` numa propriedade de relação */
  ligar: (de: number, prop: number, para: number | string, desligar = false) => req("POST", `/itens/${de}/ligar`, { prop, para, desligar }),
  /** um nível da árvore: os itens que este aponta ("aponta") ou que apontam para ele ("apontado") na propriedade */
  ramo: (id: number, prop: number, sentido: Sentido) => req<Item[]>("GET", `/itens/${id}/ramo?prop=${prop}&sentido=${sentido}`),
  resumos: (codigos: string[]) => req<Resumo[]>("GET", `/resumos?codigos=${codigos.join(",")}`),
  lixeira: () => req<{ itens: Item[]; notas: any[] }>("GET", "/lixeira"),
  esvaziarLixeira: () => req<{ itens: number; notas: number }>("DELETE", "/lixeira"),
  apagarDeVez: (id: number) => req("DELETE", `/lixeira/itens/${id}`),
  /** com: "arquivos" (padrão), "vscode" ou "terminal" */
  abrirPasta: (caminho: string, com = "arquivos") => req("POST", "/abrir-pasta", { caminho, com }),
  criarPasta: (id: number) => req<{ pasta: string }>("POST", `/itens/${id}/pasta`),
  arquivos: (id: number) => req<Arquivo[]>("GET", `/itens/${id}/arquivos`),
  trazerArquivos: (id: number, caminhos: string[], destino = "insumos") =>
    req<{ copiados: string[] }>("POST", `/itens/${id}/arquivos`, { caminhos, destino }),
  abrirArquivo: (caminho: string) => req("POST", "/abrir-arquivo", { caminho }),
  explorar: (caminho: string) => req<{ caminho: string; pai: string | null; entradas: Entrada[] }>("GET", `/explorar?caminho=${encodeURIComponent(caminho)}`),
  infoArquivo: (caminho: string) =>
    req<{ caminho: string; nome: string; especie: string; tamanho: number; modificado: string | null }>("GET", `/arquivo/info?caminho=${encodeURIComponent(caminho)}`),
  salvarArquivo: (caminho: string, conteudo: string, modificado: string | null) =>
    req<{ ok: boolean; modificado: string | null }>("PUT", "/arquivo", { caminho, conteudo, modificado }),
  colarArquivo: (id: number, nome: string, base64: string) => req<{ caminho: string }>("POST", `/itens/${id}/colar`, { nome, base64 }),
  salvarRelatorio: (nome: string, conteudo: string) => req<{ caminho: string }>("POST", "/relatorios", { nome, conteudo }),

  bancadas: () => req<Bancadas>("GET", "/bancadas"),
  /** inicio: "vazia" (sem tipos) ou "trabalho" (Task, Dívida, Pendência...). Só vale para bancada nova. */
  criarBancada: (d: { nome: string; caminho: string; ativar?: boolean }) => req<Bancada>("POST", "/bancadas", d),
  ativarBancada: (caminho: string) => req<Bancada>("POST", "/bancadas/ativar", { caminho }),
  renomearBancada: (caminho: string, nome: string) => req("PATCH", "/bancadas", { caminho, nome }),
  removerBancada: (caminho: string) => req("DELETE", "/bancadas", { caminho }),

  preferencias: () => req<Preferencias>("GET", "/preferencias"),
  mudarPreferencias: (d: Partial<Preferencias>) => req<Preferencias>("PATCH", "/preferencias", d),

  temas: () => req<{ pasta: string; temas: TemaArquivo[] }>("GET", "/temas"),
  backups: () => req<{ pasta: string; copias: { nome: string; caminho: string; criado_em: string | null; tamanho: number }[] }>("GET", "/backup"),
  backupAgora: () => req<{ caminho: string }>("POST", "/backup"),

  visoes: () => req<Visao[]>("GET", "/visoes"),
  criarVisao: (d: Partial<Visao>) => req<{ id: number }>("POST", "/visoes", d),
  atualizarVisao: (id: number, d: Partial<Visao>) => req("PATCH", `/visoes/${id}`, d),
  apagarVisao: (id: number) => req("DELETE", `/visoes/${id}`),

  /** itens que passam no filtro de uma visão (período já resolvido em datas) */
  itensDaVisao: (f: FiltroVisao, periodo: { de: string; ate: string } | null, q?: string) =>
    req<Item[]>("GET", `/itens?${queryFiltro(f, periodo, q)}`),
  linha: (de: string, ate: string, f: FiltroVisao) => req<Evento[]>("GET", `/linha?${queryFiltro(f, { de, ate })}`),

  integracoes: () => req<Integracoes>("GET", "/integracoes"),
  agentes: () => req<{ agentes: AgenteCli[]; shells: { id: string; nome: string; caminho: string }[] }>("GET", "/agentes"),
  /** Comando do app: o agente faz o pedido pelo MCP; responde quando termina. `sinal` cancela. */
  comando: (d: { agente: string; pedido: string; contexto: string; conversa: { pedido: string; resposta: string }[] }, sinal?: AbortSignal) =>
    fetch(BASE + "/comando", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d), signal: sinal })
      .then(async (r) => {
        const dados = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(dados.erro ?? `erro ${r.status}`);
        return dados as { saida: string; segundos: number };
      }),
  pedidos: () => req<{ arquivo: string; existe: boolean; abertos: number }>("GET", "/falta"),
  estadoDaTela: (texto: string) => req("POST", "/tela/estado", { texto }),
  testarAgente: (id: string) => req<{ ok: boolean; versao?: string; erro?: string | null }>("POST", `/agentes/${id}/testar`),
  /** chama o agente sem terminal e espera a resposta (até 10 min); `sinal` cancela (o processo morre junto) */
  executar: (d: { agente: string; prompt: string; uso: "prompt" | "executor"; item?: number }, sinal?: AbortSignal) =>
    fetch(BASE + "/executar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d), signal: sinal })
      .then(async (r) => {
        const dados = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(dados.erro ?? `erro ${r.status}`);
        return dados as { saida: string; codigo: number | null; segundos: number };
      }),
  instalarIntegracao: (id: string) => req("POST", `/integracoes/${id}`),
  removerIntegracao: (id: string) => req("DELETE", `/integracoes/${id}`),
};

export type Layout = "tabela" | "lista" | "kanban" | "linha";
export type Periodo = "hoje" | "ontem" | "semana" | "7d" | "30d" | "mes";

export interface FiltroVisao {
  tipos?: number[];
  sem_tipo?: boolean;
  /** id da propriedade → valores aceitos */
  props?: Record<string, string[]>;
  texto?: string;
  /** antigo (até a 0.1.3: "mostrar o histórico"); não é mais lido */
  historico?: boolean;
  /** esconder os itens com status de histórico (feitos, descartados…). Desligado por padrão: a visão mostra tudo. */
  esconder_historico?: boolean;
  periodo?: Periodo | null;
  /** id da propriedade de data → janela relativa a hoje */
  datas?: Record<string, FiltroData>;
  /** relações "livres": tudo o que está ligado nelas já foi concluído, ou não há nada (ex.: Bloqueado por → pode andar) */
  livres?: number[];
}

export type Sentido = "aponta" | "apontado";

export interface FiltroData {
  /** "preenchido" e "sem" valem para qualquer propriedade (relação, texto...) */
  modo: "vencidos" | "hoje" | "proximos" | "semana" | "sem" | "preenchido";
  /** para "proximos" */
  dias?: number;
  /** para "proximos": inclui os vencidos também */
  com_vencidos?: boolean;
}

export interface Visao {
  id: number;
  nome: string;
  /** grupo no menu lateral */
  grupo?: string | null;
  /** Todos os itens: não sai nem filtra */
  fixa?: boolean;
  icone: string;
  ordem: number;
  layout: Layout;
  filtro: FiltroVisao;
  config: {
    agrupar_por?: number;
    /** colunas da tabela e da lista, na ordem escolhida */
    colunas?: number[];
    /** largura de cada coluna da tabela em px ("titulo", "tipo", "atualizado" ou o id da propriedade) */
    larguras?: Record<string, number>;
    ordenar?: { prop: number; asc: boolean };
    /** árvore na barra lateral: a propriedade de relação que leva ao nível de baixo */
    arvore?: { prop: number; sentido: Sentido; so_raizes?: boolean } | null;
  };
}

export interface Evento {
  id: number;
  texto: string;
  autor: string;
  criado_em: string;
  item_id: number;
  codigo: string;
  titulo: string;
  tipo_id: number | null;
}

function isoLocal(d: Date) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

/** Janela relativa → "AAAA-MM-DD..AAAA-MM-DD" (pontas podem ficar vazias) ou "vazio". */
export function intervaloData(fd: FiltroData): string {
  const hoje = new Date();
  const mais = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return isoLocal(d); };
  switch (fd.modo) {
    case "sem": return "vazio";
    case "preenchido": return "..";
    case "vencidos": return `..${mais(-1)}`;
    case "hoje": return `${mais(0)}..${mais(0)}`;
    case "semana": { const seg = -((hoje.getDay() + 6) % 7); return `${mais(seg)}..${mais(seg + 6)}`; }
    case "proximos": return `${fd.com_vencidos ? "" : mais(0)}..${mais(fd.dias ?? 7)}`;
  }
}

function queryFiltro(f: FiltroVisao, periodo: { de: string; ate: string } | null, q?: string) {
  const p = new URLSearchParams();
  if (f.tipos?.length) p.set("tipos", f.tipos.join(","));
  if (f.sem_tipo) p.set("sem_tipo", "1");
  for (const [pid, vals] of Object.entries(f.props ?? {})) for (const v of vals) p.append(`p.${pid}`, v);
  if (f.livres?.length) p.set("livre", f.livres.join(","));
  const texto = [f.texto, q].filter(Boolean).join(" ").trim();
  if (texto) p.set("q", texto);
  if (periodo) { p.set("de", periodo.de); p.set("ate", periodo.ate); }
  for (const [pid, fd] of Object.entries(f.datas ?? {})) p.set(`d.${pid}`, intervaloData(fd));
  return p.toString();
}

export interface TemaArquivo {
  id: string;
  nome: string;
  base?: "claro" | "escuro";
  cores?: Record<string, string>;
  etiquetas?: Record<string, string>;
  arquivo: string;
  erro?: string;
}

export interface Agente {
  id: string;
  nome: string;
  situacao: "instalado" | "desatualizado" | "disponivel" | "ausente" | "manual";
  detectado: boolean;
  arquivos: string[];
  trecho: string;
  nota: string;
  confirmado: boolean;
  automatico: boolean;
  via_cli: boolean;
  erro: string | null;
}

/** Agente de linha de comando (mesmo id da integração) e como ele é usado. */
export interface AgenteCli {
  id: string;
  nome: string;
  executavel: string | null;
  detectado: boolean;
  /** tem o MCP do atelier instalado */
  mcp: boolean;
  exec_padrao: string;
  exec: string;
  terminal: boolean;
  executor: boolean;
  prompt: boolean;
  /** recebe os comandos do app (botão e atalho na barra de título) */
  comando: boolean;
}

export interface UsoAgente {
  terminal?: boolean;
  executor?: boolean;
  prompt?: boolean;
  comando?: boolean;
  exec?: string | null;
}

export interface Integracoes {
  servidor: string;
  servidor_existe: boolean;
  agentes: Agente[];
}

export interface Bancada {
  nome: string;
  caminho: string;
}

export interface Bancadas {
  ativa: Bancada | null;
  bancadas: Bancada[];
  /** pasta padrão onde nascem bancadas novas (~/atelier/bancadas) */
  sugestao: string;
  pasta_atelier: string;
  separador: string;
}

export interface Preferencias {
  /** "claro" | "escuro" | "nord" ou o id de um tema em arquivo */
  tema: string;
  idioma: string;
  /** tamanho da letra em % */
  zoom: number;
  backup: { ativo: boolean; intervalo_horas: number; manter: number };
  captura: { ativo: boolean; atalho: string; bandeja: boolean };
  lixeira: { ativo: boolean; dias: number };
  /** editor de arquivos: auto-salvar como no VS Code */
  editor: { auto_salvar: "desligado" | "atraso" | "foco"; atraso_ms: number };
  /** atalhos mudados: id → combinação ("Ctrl+Alt+R"); vazio = padrão */
  atalhos: Record<string, string>;
  /** ao abrir, procura versão nova no GitHub e avisa */
  atualizacao: { avisar: boolean };
  /** por id da integração: Terminal, Executor e Prompt (tudo desligado até ligar) */
  agentes: Record<string, UsoAgente>;
}

// ---------- ajudantes do esquema ----------

export function propsDoTipo(e: Esquema, tipo: Tipo | undefined): Propriedade[] {
  if (!tipo) return [];
  return tipo.propriedades
    .map((tp) => e.propriedades.find((p) => p.id === tp.propriedade_id))
    .filter((p): p is Propriedade => !!p);
}

/** Opções efetivas: as do tipo (status, por ex.) ou as da propriedade. */
export function opcoesDe(e: Esquema, prop: Propriedade, tipoId: number | null | undefined): Opcao[] {
  const tp = e.tipos.find((t) => t.id === tipoId)?.propriedades.find((x) => x.propriedade_id === prop.id);
  return tp?.opcoes ?? prop.opcoes ?? [];
}

/** Grava uma opção nova onde as opções daquela propriedade moram (no tipo ou na propriedade). */
export async function acrescentarOpcao(e: Esquema, prop: Propriedade, tipoId: number | null | undefined, nova: Opcao) {
  const tp = e.tipos.find((t) => t.id === tipoId)?.propriedades.find((x) => x.propriedade_id === prop.id);
  if (tp?.opcoes || (prop.especie === "status" && tipoId != null)) {
    await api.porPropNoTipo(tipoId!, prop.id, { opcoes: [...(tp?.opcoes ?? []), nova] });
  } else {
    await api.atualizarProp(prop.id, { opcoes: [...(prop.opcoes ?? []), nova] });
  }
}

export function corAleatoria(): Cor {
  return CORES[1 + Math.floor(Math.random() * (CORES.length - 1))];
}
