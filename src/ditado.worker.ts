// Ditado: roda o modelo de voz fora da tela (num Worker), para não travar nada enquanto baixa ou transcreve.
// Parakeet (parakeet.js, guarda no IndexedDB) e Whisper (transformers.js, guarda no Cache Storage). Tudo local: o
// áudio não sai da máquina; só o modelo é baixado, uma vez, do Hugging Face.
import type { Dispositivo, ModeloDitado } from "./ditado";

type Pedido =
  | { t: "carregar"; modelo: ModeloDitado; dispositivo: Dispositivo }
  | { t: "baixar"; modelo: ModeloDitado; dispositivo: Dispositivo }
  | { t: "transcrever"; modelo: ModeloDitado; dispositivo: Dispositivo; audio: Float32Array }
  | { t: "apagar"; modelo: ModeloDitado };

interface Motor {
  transcrever: (audio: Float32Array) => Promise<string>;
  /** onde ficou de verdade (a placa de vídeo pode falhar e cair para o processador) */
  dispositivo: Dispositivo;
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

async function abrir(m: ModeloDitado, d: Dispositivo): Promise<Motor> {
  try {
    return m.motor === "parakeet" ? await abrirParakeet(m, d) : (await abrirWhisper(m, d)).motor;
  } catch (e) {
    // a placa de vídeo falhou (driver, WebGPU indisponível): cai para o processador e avisa a tela
    if (d !== "gpu") throw e;
    avisar({ t: "caiu", erro: e instanceof Error ? e.message : String(e) });
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
  if (m.motor === "parakeet") {
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
  if (m.motor === "parakeet") {
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
    } else if (d.t === "apagar") {
      await apagar(d.modelo);
      avisar({ t: "apagado", id: d.modelo.id });
    }
  } catch (erro) {
    avisar({ t: "erro", erro: erro instanceof Error ? erro.message : String(erro) });
  }
};
