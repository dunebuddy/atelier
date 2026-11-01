// Ditado: roda o modelo de voz fora da tela (num Worker), para não travar nada enquanto baixa ou transcreve.
// Parakeet (parakeet.js, guarda no IndexedDB) e Whisper (transformers.js, guarda no Cache Storage). Tudo local: o
// áudio não sai da máquina; só o modelo é baixado, uma vez, do Hugging Face.
import type { ModeloDitado } from "./ditado";

type Pedido =
  | { t: "carregar"; modelo: ModeloDitado }
  | { t: "transcrever"; modelo: ModeloDitado; audio: Float32Array }
  | { t: "apagar"; modelo: ModeloDitado };

interface Motor {
  transcrever: (audio: Float32Array) => Promise<string>;
}

let carregado: { id: string; motor: Motor } | null = null;
let carregando: Promise<Motor> | null = null;
let carregandoId = "";

const ORT_WASM = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";

function avisar(m: unknown) {
  (self as unknown as Worker).postMessage(m);
}

async function abrirParakeet(m: ModeloDitado): Promise<Motor> {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.wasmPaths = ORT_WASM;
  const { fromHub } = await import("parakeet.js");
  const modelo = await fromHub(m.repo, {
    backend: "wasm",
    encoderQuant: "int8",
    decoderQuant: "int8",
    progress: (p: { file?: string; loaded?: number; total?: number }) =>
      avisar({ t: "progresso", arquivo: p.file ?? "", feito: p.loaded ?? 0, total: p.total ?? 0 }),
  });
  return {
    transcrever: async (audio) => {
      const r = await modelo.transcribe(audio, 16000, {});
      return (r?.utterance_text ?? "").trim();
    },
  };
}

async function abrirWhisper(m: ModeloDitado): Promise<Motor> {
  const tf = await import("@huggingface/transformers");
  tf.env.allowLocalModels = false;
  const onnx = tf.env.backends.onnx as { wasm?: { wasmPaths?: string } };
  if (onnx.wasm) onnx.wasm.wasmPaths = ORT_WASM;
  const asr = await tf.pipeline("automatic-speech-recognition", m.repo, {
    device: "wasm",
    dtype: "q8",
    progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress") avisar({ t: "progresso", arquivo: p.file ?? "", feito: p.loaded ?? 0, total: p.total ?? 0 });
    },
  });
  return {
    transcrever: async (audio) => {
      // trechos de 30 s (o tamanho que o Whisper enxerga de uma vez), em português
      const r = (await asr(audio, { language: "portuguese", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 })) as { text?: string } | { text?: string }[];
      const t = Array.isArray(r) ? r.map((x) => x.text ?? "").join(" ") : r.text ?? "";
      return t.trim();
    },
  };
}

async function motorDo(m: ModeloDitado): Promise<Motor> {
  if (carregado?.id === m.id) return carregado.motor;
  if (carregando && carregandoId === m.id) return carregando;
  carregado = null;
  carregandoId = m.id;
  carregando = (m.motor === "parakeet" ? abrirParakeet(m) : abrirWhisper(m)).then((motor) => {
    carregado = { id: m.id, motor };
    return motor;
  }).finally(() => { carregando = null; });
  return carregando;
}

async function apagar(m: ModeloDitado) {
  if (carregado?.id === m.id) carregado = null;
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
      await motorDo(d.modelo);
      avisar({ t: "pronto", id: d.modelo.id });
    } else if (d.t === "transcrever") {
      const motor = await motorDo(d.modelo);
      avisar({ t: "texto", texto: await motor.transcrever(d.audio) });
    } else if (d.t === "apagar") {
      await apagar(d.modelo);
      avisar({ t: "apagado", id: d.modelo.id });
    }
  } catch (erro) {
    avisar({ t: "erro", erro: erro instanceof Error ? erro.message : String(erro) });
  }
};
