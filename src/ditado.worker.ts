// Ditado: roda o modelo de voz fora da tela (num Worker), para não travar nada enquanto baixa ou transcreve.
// Dois jeitos: de lote (transcreve tudo ao parar: Parakeet, com o parakeet.js, guarda no IndexedDB; Whisper, com o
// transformers.js, guarda no Cache Storage) e de streaming (escreve enquanto fala: Nemotron, ver nemotron.ts, guarda no
// Cache Storage). Tudo local: o áudio não sai da máquina; só o modelo é baixado, uma vez, do Hugging Face.
import type { Dispositivo, ModeloDitado } from "./ditado";
import { ARQUIVOS_NEMOTRON, Nemotron } from "./nemotron";

type Pedido =
  | { t: "carregar"; modelo: ModeloDitado; dispositivo: Dispositivo }
  | { t: "baixar"; modelo: ModeloDitado; dispositivo: Dispositivo }
  | { t: "transcrever"; modelo: ModeloDitado; dispositivo: Dispositivo; audio: Float32Array }
  | { t: "apagar"; modelo: ModeloDitado }
  // streaming: começa um ditado, manda áudio aos pedaços (volta o texto novo), termina (volta o texto inteiro)
  | { t: "stream_inicio"; modelo: ModeloDitado; dispositivo: Dispositivo }
  | { t: "stream_audio"; modelo: ModeloDitado; dispositivo: Dispositivo; audio: Float32Array }
  | { t: "stream_fim"; modelo: ModeloDitado; dispositivo: Dispositivo };

interface Motor {
  transcrever: (audio: Float32Array) => Promise<string>;
  /** onde ficou de verdade (a placa de vídeo pode falhar e cair para o processador) */
  dispositivo: Dispositivo;
  /** só no de streaming */
  stream?: Nemotron;
}

let carregado: { id: string; motor: Motor } | null = null;
let carregando: Promise<Motor> | null = null;
let carregandoId = "";

const ORT_WASM = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";

function avisar(m: unknown) {
  (self as unknown as Worker).postMessage(m);
}

const progressoParakeet = (p: { file?: string; loaded?: number; total?: number }) =>
  avisar({ t: "progresso", arquivo: p.file ?? "", feito: p.loaded ?? 0, total: p.total ?? 0 });

/** Opções do Parakeet por dispositivo: no processador, 8 bits; na placa de vídeo, o encoder vai em 32 bits (o de 8
 *  bits dá texto errado no WebGPU), por isso o download é outro e maior. */
const opcoesParakeet = (d: Dispositivo) =>
  d === "gpu"
    ? ({ backend: "webgpu-hybrid", encoderQuant: "fp32", decoderQuant: "int8" } as const)
    : ({ backend: "wasm", encoderQuant: "int8", decoderQuant: "int8" } as const);

/** Os arquivos do Parakeet, do IndexedDB (baixa o que falta). Devolve links `blob:` que precisam ser soltos depois. */
async function arquivosParakeet(m: ModeloDitado, d: Dispositivo) {
  const { getParakeetModel } = await import("parakeet.js");
  return getParakeetModel(m.repo, { ...opcoesParakeet(d), progress: progressoParakeet });
}

/** Solta os links `blob:` que o parakeet.js cria e nunca revoga: sem isso, o arquivo inteiro (~680 MB) fica preso na
 *  memória ao lado da cópia que o ONNX Runtime já fez, e o ditado ocupa o dobro do modelo. */
function soltar(urls: Record<string, unknown>) {
  for (const u of Object.values(urls)) if (typeof u === "string" && u.startsWith("blob:")) URL.revokeObjectURL(u);
}

async function abrirParakeet(m: ModeloDitado, d: Dispositivo): Promise<Motor> {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = ORT_WASM;
  const { ParakeetModel } = await import("parakeet.js");
  const r = await arquivosParakeet(m, d);
  try {
    const modelo = await ParakeetModel.fromUrls({ ...r.urls, filenames: r.filenames, preprocessorBackend: r.preprocessorBackend, ...opcoesParakeet(d), wasmPaths: ORT_WASM });
    return {
      dispositivo: d,
      transcrever: async (audio) => {
        const t = await modelo.transcribe(audio, 16000, {});
        return (t?.utterance_text ?? "").trim();
      },
    };
  } finally {
    soltar(r.urls);
  }
}

async function abrirWhisper(m: ModeloDitado, d: Dispositivo) {
  const tf = await import("@huggingface/transformers");
  tf.env.allowLocalModels = false;
  const onnx = tf.env.backends.onnx as { wasm?: { wasmPaths?: string } };
  if (onnx.wasm) onnx.wasm.wasmPaths = ORT_WASM;
  const asr = await tf.pipeline("automatic-speech-recognition", m.repo, {
    device: d === "gpu" ? "webgpu" : "wasm",
    dtype: d === "gpu" ? "fp32" : "q8",
    progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress") avisar({ t: "progresso", arquivo: p.file ?? "", feito: p.loaded ?? 0, total: p.total ?? 0 });
    },
  });
  return {
    asr,
    motor: {
      dispositivo: d,
      transcrever: async (audio: Float32Array) => {
        // trechos de 30 s (o tamanho que o Whisper enxerga de uma vez), em português
        const r = (await asr(audio, { language: "portuguese", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 })) as { text?: string } | { text?: string }[];
        const t = Array.isArray(r) ? r.map((x) => x.text ?? "").join(" ") : r.text ?? "";
        return t.trim();
      },
    } as Motor,
  };
}

// ---------- streaming (Nemotron) ----------

// os arquivos ficam no OPFS (o disco privado do navegador): o Cache Storage recusa arquivo do tamanho do encoder
// (~700 MB), e o OPFS grava direto no disco enquanto baixa, sem juntar tudo na memória
/** a placa falhou uma vez neste Worker: não insiste */
let caiuStreaming = false;
const urlHf = (m: ModeloDitado, arquivo: string) => `https://huggingface.co/${m.repo}/resolve/main/${arquivo}`;

async function pastaStreaming(m: ModeloDitado, criar = true) {
  const raiz = await navigator.storage.getDirectory();
  const geral = await raiz.getDirectoryHandle("ditado-streaming", { create: criar });
  return geral.getDirectoryHandle(m.repo.replace(/[^\w.-]+/g, "--"), { create: criar });
}

async function temArquivo(dir: FileSystemDirectoryHandle, nome: string) {
  try {
    return (await (await dir.getFileHandle(nome)).getFile()).size > 0;
  } catch {
    return false;
  }
}

/** Baixa o que falta, com progresso por arquivo. O arquivo só aparece quando termina (o createWritable troca no fim). */
async function baixarStreaming(m: ModeloDitado) {
  const dir = await pastaStreaming(m);
  for (const f of ARQUIVOS_NEMOTRON) {
    if (await temArquivo(dir, f)) continue;
    const r = await fetch(urlHf(m, f));
    if (!r.ok || !r.body) throw new Error(`${f}: HTTP ${r.status}`);
    const total = Number(r.headers.get("content-length") ?? 0);
    let feito = 0;
    const contar = new TransformStream<Uint8Array, Uint8Array>({
      transform(pedaco, c) {
        feito += pedaco.length;
        avisar({ t: "progresso", arquivo: f, feito, total });
        c.enqueue(pedaco);
      },
    });
    const escrita = await (await dir.getFileHandle(f, { create: true })).createWritable();
    await r.body.pipeThrough(contar).pipeTo(escrita);
  }
}

async function abrirStreaming(m: ModeloDitado, d: Dispositivo): Promise<Motor> {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = ORT_WASM;
  await baixarStreaming(m);
  const dir = await pastaStreaming(m);
  const ler = async (f: string) => new Uint8Array(await (await (await dir.getFileHandle(f)).getFile()).arrayBuffer());
  // o encoder (o pesado) vai na placa de vídeo; no processador, sem várias threads no WebView, ele não acompanha a
  // fala. Decoder e joint são pequenos e rodam um passo por letra: no processador é mais rápido que ir à placa.
  const naPlaca = d === "gpu";
  const stream = await Nemotron.abrir(ort, { ler }, {
    idioma: "auto",
    sessaoEncoder: { executionProviders: naPlaca ? ["webgpu"] : ["wasm"] },
    sessao: { executionProviders: ["wasm"] },
  });
  return {
    dispositivo: d,
    stream,
    // de lote (se alguém pedir): passa tudo de uma vez pelo streaming
    transcrever: async (audio) => {
      stream.recomecar();
      await stream.aceitar(audio);
      await stream.fechar();
      return stream.texto();
    },
  };
}

async function abrir(m: ModeloDitado, pedido: Dispositivo): Promise<Motor> {
  // o de streaming tenta sempre a placa primeiro (no processador não acompanha a fala); cai para o processador se falhar
  const d: Dispositivo = m.motor === "streaming" && !caiuStreaming ? "gpu" : pedido;
  try {
    if (m.motor === "streaming") return await abrirStreaming(m, d);
    return m.motor === "parakeet" ? await abrirParakeet(m, d) : (await abrirWhisper(m, d)).motor;
  } catch (e) {
    // a placa de vídeo falhou (driver, WebGPU indisponível): cai para o processador e avisa a tela
    if (d !== "gpu") throw e;
    avisar({ t: "caiu", erro: e instanceof Error ? e.message : String(e) });
    if (m.motor === "streaming") caiuStreaming = true;
    return abrir(m, "cpu");
  }
}

async function motorDo(m: ModeloDitado, d: Dispositivo): Promise<Motor> {
  const id = `${m.id}@${d}`;
  if (carregado?.id === id) return carregado.motor;
  if (carregando && carregandoId === id) return carregando;
  carregado = null;
  carregandoId = id;
  carregando = abrir(m, d).then((motor) => {
    carregado = { id, motor };
    return motor;
  }).finally(() => { carregando = null; });
  return carregando;
}

/** Só baixa (para o disco do navegador), sem deixar o modelo na memória. */
async function baixar(m: ModeloDitado, d: Dispositivo) {
  if (m.motor === "streaming") {
    await baixarStreaming(m);
  } else if (m.motor === "parakeet") {
    const r = await arquivosParakeet(m, d);
    soltar(r.urls);
  } else {
    // o transformers.js baixa ao montar o pipeline; monta e desmonta na hora
    const { asr } = await abrirWhisper(m, d);
    await asr.dispose();
  }
}

async function apagar(m: ModeloDitado) {
  if (carregado?.id.startsWith(`${m.id}@`)) carregado = null;
  if (m.motor === "streaming") {
    const raiz = await navigator.storage.getDirectory();
    try {
      const geral = await raiz.getDirectoryHandle("ditado-streaming");
      await geral.removeEntry((await pastaStreaming(m, false)).name, { recursive: true });
    } catch {
      // não tinha nada
    }
  } else if (m.motor === "parakeet") {
    // parakeet.js: banco "parakeet-cache-db", chaves com o repositório no nome
    await new Promise<void>((ok, erro) => {
      const req = indexedDB.open("parakeet-cache-db", 1);
      req.onerror = () => erro(req.error);
      req.onupgradeneeded = () => req.result.createObjectStore("file-store");
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("file-store")) { db.close(); ok(); return; }
        const st = db.transaction("file-store", "readwrite").objectStore("file-store");
        const cur = st.openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) { db.close(); ok(); return; }
          if (String(c.key).includes(m.repo.split("/").pop() ?? m.repo)) c.delete();
          c.continue();
        };
        cur.onerror = () => erro(cur.error);
      };
    });
  } else {
    const cache = await caches.open("transformers-cache");
    for (const r of await cache.keys()) if (r.url.includes(m.repo)) await cache.delete(r);
  }
}

self.onmessage = async (e: MessageEvent<Pedido>) => {
  const d = e.data;
  try {
    if (d.t === "carregar") {
      const motor = await motorDo(d.modelo, d.dispositivo);
      avisar({ t: "pronto", id: d.modelo.id, dispositivo: motor.dispositivo });
    } else if (d.t === "baixar") {
      await baixar(d.modelo, d.dispositivo);
      avisar({ t: "pronto", id: d.modelo.id, dispositivo: d.dispositivo });
    } else if (d.t === "transcrever") {
      const motor = await motorDo(d.modelo, d.dispositivo);
      avisar({ t: "texto", texto: await motor.transcrever(d.audio), dispositivo: motor.dispositivo });
    } else if (d.t === "stream_inicio" || d.t === "stream_audio" || d.t === "stream_fim") {
      const motor = await motorDo(d.modelo, d.dispositivo);
      const s = motor.stream;
      if (!s) throw new Error("este modelo não é de streaming");
      if (d.t === "stream_inicio") {
        s.recomecar();
        avisar({ t: "pronto", id: d.modelo.id, dispositivo: motor.dispositivo });
      } else if (d.t === "stream_audio") {
        avisar({ t: "parcial", texto: await s.aceitar(d.audio), dispositivo: motor.dispositivo });
      } else {
        await s.fechar();
        avisar({ t: "texto", texto: s.texto(), dispositivo: motor.dispositivo });
      }
    } else if (d.t === "apagar") {
      await apagar(d.modelo);
      avisar({ t: "apagado", id: d.modelo.id });
    }
  } catch (erro) {
    avisar({ t: "erro", erro: erro instanceof Error ? erro.message : String(erro) });
  }
};
