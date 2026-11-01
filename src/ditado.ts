// Ditado por voz, local. O catálogo de modelos vem de `modelos-ditado.json` (na raiz do repositório): uma cópia vai
// junto com o app e, ao procurar versão nova, o app lê a do GitHub; modelo que aparecer lá vira aviso e já entra na
// lista (sem precisar de versão nova do app). O usuário escolhe, baixa e apaga em Configurações → Ditado; sem modelo
// escolhido e baixado, o microfone não grava.
import catalogoLocal from "../modelos-ditado.json";
import { avisar, guardar, ler } from "./ui";

export interface ModeloDitado {
  id: string;
  nome: string;
  motor: "parakeet" | "whisper";
  repo: string;
  tamanho_mb: number;
  idiomas: string;
  nota: string;
  recomendado?: boolean;
}

const URL_CATALOGO = "https://raw.githubusercontent.com/dunebuddy/atelier/master/modelos-ditado.json";

/** Os modelos conhecidos: os que vieram com o app mais os que apareceram depois no GitHub. */
export function catalogo(): ModeloDitado[] {
  const daqui = catalogoLocal.modelos as ModeloDitado[];
  const de_la = ler<ModeloDitado[]>("ditado.catalogo", []);
  return [...daqui, ...de_la.filter((m) => !daqui.some((x) => x.id === m.id))];
}

/** Onde o modelo roda: processador (RAM) ou placa de vídeo (VRAM, pelo WebGPU). */
export type Dispositivo = "cpu" | "gpu";
export const dispositivo = (): Dispositivo => ler<Dispositivo>("ditado.dispositivo", "cpu");
export function mudarDispositivo(d: Dispositivo) {
  if (d === dispositivo()) return;
  guardar("ditado.dispositivo", d);
  // o modelo carregado é do outro jeito: sai da memória; o próximo ditado carrega do jeito novo
  descarregar();
}
/** o que o modelo ocupa carregado, medido na última vez (MB), por modelo e dispositivo */
export const memoriaMedida = (id: string): number | null => ler<Record<string, number>>("ditado.memoria", {})[`${id}@${dispositivo()}`] ?? null;

export const modeloEscolhido = (): string => ler("ditado.modelo", "");
export const baixados = (): string[] => ler<string[]>("ditado.baixados", []);
const avisarMudanca = () => window.dispatchEvent(new Event("atelier:ditado"));

export function escolher(id: string) {
  guardar("ditado.modelo", id);
  avisarMudanca();
}

/** O modelo pronto para usar (escolhido e baixado), ou null. */
export function modeloAtual(): ModeloDitado | null {
  const id = modeloEscolhido();
  return (baixados().includes(id) && catalogo().find((m) => m.id === id)) || null;
}

// ---------- o Worker (um pedido de cada vez) ----------

type Resposta =
  | { t: "progresso"; arquivo: string; feito: number; total: number }
  | { t: "pronto"; id: string; dispositivo: Dispositivo }
  | { t: "texto"; texto: string; dispositivo: Dispositivo }
  | { t: "apagado"; id: string }
  | { t: "caiu"; erro: string }
  | { t: "erro"; erro: string };

let worker: Worker | null = null;
let fila: Promise<unknown> = Promise.resolve();
/** o modelo que este Worker já carregou: a memória do WASM não volta ao trocar, então outro modelo pede Worker novo */
let modeloNoWorker: string | null = null;

// O modelo não fica na memória o tempo todo: depois de N minutos sem uso (Configurações → Ditado; padrão 5), o
// Worker inteiro é encerrado e a memória volta. A barra de status mostra enquanto ele está carregado.
export interface EstadoDitado {
  modelo: ModeloDitado;
  desde: number;
  ultimoUso: number;
  /** onde ficou de verdade (a placa pode ter falhado e caído para o processador) */
  dispositivo: Dispositivo;
  /** memória da interface antes de o modelo subir: a diferença para agora é o que o modelo ocupa */
  ramAntes: number | null;
}
// a barra de status mede a memória da interface a cada poucos segundos e conta aqui (para medir o modelo)
let ramInterface: number | null = null;
export function anotarRamInterface(n: number | null) {
  ramInterface = n;
  // guarda o maior valor medido para este modelo: é o que a lista de modelos mostra
  if (estado && n != null && estado.ramAntes != null) {
    const mb = Math.round(Math.max(0, n - estado.ramAntes) / 1048576);
    const todas = ler<Record<string, number>>("ditado.memoria", {});
    const k = `${estado.modelo.id}@${estado.dispositivo}`;
    if (mb > (todas[k] ?? 0)) guardar("ditado.memoria", { ...todas, [k]: mb });
  }
}
let estado: EstadoDitado | null = null;
let relogio: number | undefined;
export const minutosParaDescarregar = (): number => ler("ditado.descarregar_min", 5);
export function mudarMinutos(n: number) {
  guardar("ditado.descarregar_min", n);
  usado();
}
export const estadoDitado = () => estado;

/** Marca uso agora e reprograma a descarga. */
function usado(m?: ModeloDitado, onde: Dispositivo = dispositivo()) {
  if (m) {
    const mesmo = estado?.modelo.id === m.id;
    estado = { modelo: m, desde: mesmo ? estado!.desde : Date.now(), ultimoUso: Date.now(), dispositivo: onde, ramAntes: mesmo ? estado!.ramAntes : ramAntesDoWorker };
  }
  else if (estado) estado = { ...estado, ultimoUso: Date.now() };
  window.clearTimeout(relogio);
  const min = minutosParaDescarregar();
  if (estado && min > 0) relogio = window.setTimeout(descarregar, min * 60_000);
  avisarMudanca();
}

/** Tira o modelo da memória agora (encerra o Worker). O próximo ditado carrega de novo, do disco. */
export function descarregar() {
  window.clearTimeout(relogio);
  worker?.terminate();
  worker = null;
  modeloNoWorker = null;
  fila = Promise.resolve();
  estado = null;
  avisarMudanca();
}
let ouvinteProgresso: ((p: { arquivo: string; feito: number; total: number }) => void) | null = null;
/** memória da interface quando o Worker deste modelo nasceu */
let ramAntesDoWorker: number | null = null;

function pedir<T>(msg: { t: string; modelo: ModeloDitado; [k: string]: unknown }, transferir: Transferable[] = []): Promise<T> {
  const vez = fila.then(() => new Promise<T>((ok, erro) => {
    // trocar de modelo: encerra o Worker do anterior (na vez dele na fila, sem cortar um pedido no meio)
    if (msg.t !== "apagar") {
      if (worker && modeloNoWorker && modeloNoWorker !== msg.modelo.id) {
        worker.terminate();
        worker = null;
        if (estado?.modelo.id === modeloNoWorker) { estado = null; avisarMudanca(); }
      }
      modeloNoWorker = msg.modelo.id;
    }
    if (!worker) {
      ramAntesDoWorker = ramInterface;
      worker = new Worker(new URL("./ditado.worker.ts", import.meta.url), { type: "module" });
    }
    worker.onmessage = (e: MessageEvent<Resposta>) => {
      const d = e.data;
      if (d.t === "progresso") { ouvinteProgresso?.(d); return; }
      if (d.t === "caiu") { avisar(`A placa de vídeo não carregou o ditado (${d.erro}); ficou no processador.`, undefined, true); return; }
      if (d.t === "erro") erro(new Error(d.erro));
      else ok(d as T);
    };
    worker.postMessage({ ...msg, dispositivo: dispositivo() }, transferir);
  }));
  fila = vez.catch(() => {});
  return vez;
}

/** Só baixa (se ainda não tem): o modelo não fica na memória; o primeiro ditado carrega. `progresso` recebe 0–1. */
export async function baixar(m: ModeloDitado, progresso?: (fracao: number) => void) {
  const arquivos = new Map<string, { feito: number; total: number }>();
  ouvinteProgresso = (p) => {
    arquivos.set(p.arquivo, p);
    let feito = 0, total = 0;
    arquivos.forEach((a) => { feito += a.feito; total += a.total; });
    if (total) progresso?.(feito / total);
  };
  const jaCarregado = estado != null;
  try {
    await pedir({ t: "baixar", modelo: m });
  } finally {
    ouvinteProgresso = null;
  }
  // o Worker que só baixou não guarda nada que preste: encerra (a memória volta), a não ser que outro modelo estivesse
  // carregado nele para ditar
  if (!jaCarregado) { worker?.terminate(); worker = null; modeloNoWorker = null; fila = Promise.resolve(); }
  guardar("ditado.baixados", [...new Set([...baixados(), m.id])]);
  avisarMudanca();
}

export async function apagar(m: ModeloDitado) {
  if (estado?.modelo.id === m.id) descarregar();
  await pedir({ t: "apagar", modelo: m });
  if (!estado) { worker?.terminate(); worker = null; modeloNoWorker = null; }
  guardar("ditado.baixados", baixados().filter((x) => x !== m.id));
  if (modeloEscolhido() === m.id) guardar("ditado.modelo", "");
  avisarMudanca();
}

/** Deixa o modelo escolhido na memória (o primeiro ditado fica rápido). */
export function preparar() {
  const m = modeloAtual();
  if (m) pedir<{ dispositivo: Dispositivo }>({ t: "carregar", modelo: m }).then((r) => usado(m, r.dispositivo)).catch(() => {});
}

export async function transcrever(audio: Float32Array): Promise<string> {
  const m = modeloAtual();
  if (!m) throw new Error("Nenhum modelo de ditado escolhido (Configurações → Ditado).");
  const r = await pedir<{ texto: string; dispositivo: Dispositivo }>({ t: "transcrever", modelo: m, audio }, [audio.buffer]);
  usado(m, r.dispositivo);
  return r.texto;
}

// ---------- microfone ----------

/** Começa a gravar do microfone (mono, 16 kHz, que é o que os modelos esperam). `parar()` devolve o áudio. */
export async function gravar(): Promise<{ parar: () => Promise<Float32Array>; cancelar: () => void }> {
  const fluxo = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext({ sampleRate: 16000 });
  const fonte = ctx.createMediaStreamSource(fluxo);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const pedacos: Float32Array[] = [];
  proc.onaudioprocess = (e) => pedacos.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  fonte.connect(proc);
  proc.connect(ctx.destination);
  const fechar = () => {
    proc.disconnect();
    fonte.disconnect();
    fluxo.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
  };
  return {
    parar: async () => {
      fechar();
      const total = pedacos.reduce((n, p) => n + p.length, 0);
      const audio = new Float32Array(total);
      let i = 0;
      for (const p of pedacos) { audio.set(p, i); i += p.length; }
      return audio;
    },
    cancelar: fechar,
  };
}

// ---------- modelos novos ----------

/** Lê o catálogo do GitHub; modelo que o usuário ainda não viu vira aviso. Chamado junto com a procura de versão. */
export async function procurarModelosNovos() {
  try {
    const r = await fetch(URL_CATALOGO, { cache: "no-store" });
    if (!r.ok) return;
    const remoto = ((await r.json()) as { modelos?: ModeloDitado[] }).modelos ?? [];
    guardar("ditado.catalogo", remoto);
    const vistos = ler<string[] | null>("ditado.vistos", null) ?? catalogo().map((m) => m.id);
    const novos = remoto.filter((m) => !vistos.includes(m.id));
    guardar("ditado.vistos", [...new Set([...vistos, ...remoto.map((m) => m.id)])]);
    if (novos.length) {
      avisar(`Tem modelo de ditado novo: ${novos.map((m) => m.nome).join(", ")}. Veja em Configurações → Ditado.`);
      avisarMudanca();
    }
  } catch {
    // sem rede: fica para a próxima
  }
}
