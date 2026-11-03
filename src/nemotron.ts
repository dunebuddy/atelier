// Motor de streaming do ditado: Nemotron 3.5 ASR Streaming (NVIDIA), FastConformer com cache + RNNT, no ONNX do
// onnx-community (encoder, decoder e joint separados). Recebe o áudio aos pedaços enquanto a pessoa fala e devolve o
// texto à medida que sai. Segue o que o onnxruntime-genai faz (nemotron_speech.cpp e nemotron_streaming_processor.cpp)
// e o mel do NeMo (nemo_mel_spectrogram.cc, do onnxruntime-extensions): os números vêm do genai_config.json do modelo.
// Fica sem dependência do Worker para dar para testar fora do app (scripts/teste-nemotron.ts).
import type * as OrtNs from "onnxruntime-web";

type Ort = typeof OrtNs;

export interface ConfigNemotron {
  num_mels: number;
  fft_size: number;
  hop_length: number;
  win_length: number;
  preemph: number;
  log_eps: number;
  left_context: number;
  conv_context: number;
  pre_encode_cache_size: number;
  sample_rate: number;
  chunk_samples: number;
  blank_id: number;
  max_symbols_per_step: number;
  encoder: { hidden_size: number; num_hidden_layers: number };
  decoder: { hidden_size: number; num_hidden_layers: number };
}

/** Os arquivos do modelo (no repositório do Hugging Face). */
export const ARQUIVOS_NEMOTRON = [
  "genai_config.json", "vocab.txt",
  "encoder.onnx", "encoder.onnx.data", "decoder.onnx", "decoder.onnx.data", "joint.onnx", "joint.onnx.data",
];

/** Idioma → lang_id do prompt (a tabela do model-asr.py do onnxruntime-genai). */
export const IDIOMAS_NEMOTRON: Record<string, number> = {
  "pt-BR": 12, "pt-PT": 13, "en-US": 0, "en-GB": 1, "es-ES": 2, "es-US": 3, "fr-FR": 8, "de-DE": 9, "it-IT": 15, auto: 101,
};

// ---------- mel (NeMo: Slaney, pré-ênfase, Hann simétrico, log) ----------

function hzParaMel(hz: number) {
  return hz < 1000 ? hz / (200 / 3) : 15 + Math.log(hz / 1000) / 0.06875177742094912;
}
function melParaHz(mel: number) {
  return mel < 15 ? mel * (200 / 3) : 1000 * Math.exp((mel - 15) * 0.06875177742094912);
}

function bancoMel(nMels: number, nFft: number, sr: number): Float32Array[] {
  const bins = nFft / 2 + 1;
  const baixo = hzParaMel(0), alto = hzParaMel(sr / 2);
  const f = Array.from({ length: nMels + 2 }, (_, i) => melParaHz(baixo + ((alto - baixo) * i) / (nMels + 1)));
  const freqs = Array.from({ length: bins }, (_, k) => (k * sr) / nFft);
  return Array.from({ length: nMels }, (_, m) => {
    const linha = new Float32Array(bins);
    const enorm = 2 / (f[m + 2] - f[m] + 1e-10);
    for (let k = 0; k < bins; k++) {
      const sobe = (freqs[k] - f[m]) / (f[m + 1] - f[m] + 1e-10);
      const desce = (f[m + 2] - freqs[k]) / (f[m + 2] - f[m + 1] + 1e-10);
      linha[k] = Math.max(0, Math.min(sobe, desce)) * enorm;
    }
    return linha;
  });
}

/** FFT real de tamanho potência de 2 (radix-2, no lugar); devolve a potência |X|² dos bins 0..n/2. */
function potencia(re: Float64Array, im: Float64Array, saida: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let tam = 2; tam <= n; tam <<= 1) {
    const ang = (-2 * Math.PI) / tam;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += tam) {
      let cr = 1, ci = 0;
      for (let k = 0; k < tam / 2; k++) {
        const a = i + k, b = a + tam / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nc = cr * wr - ci * wi;
        ci = cr * wi + ci * wr; cr = nc;
      }
    }
  }
  for (let k = 0; k <= n / 2; k++) saida[k] = re[k] * re[k] + im[k] * im[k];
}

/** O mel em streaming: guarda o fim do pedaço anterior (meia FFT) e a última amostra da pré-ênfase. */
class MelStreaming {
  private filtros: Float32Array[];
  private janela: Float32Array;
  private sobra: Float32Array;
  private ultima = 0;
  private re: Float64Array;
  private im: Float64Array;
  private pot: Float32Array;

  constructor(private c: ConfigNemotron) {
    this.filtros = bancoMel(c.num_mels, c.fft_size, c.sample_rate);
    // Hann simétrico, como o extrator de streaming do NeMo
    this.janela = Float32Array.from({ length: c.win_length }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (c.win_length - 1)));
    this.sobra = new Float32Array(c.fft_size / 2);
    this.re = new Float64Array(c.fft_size);
    this.im = new Float64Array(c.fft_size);
    this.pot = new Float32Array(c.fft_size / 2 + 1);
  }

  /** Devolve [quadros][mels] (tempo primeiro). */
  processar(audio: Float32Array): Float32Array[] {
    const { fft_size, win_length, hop_length, preemph, num_mels, log_eps } = this.c;
    const pre = new Float32Array(audio.length);
    for (let i = 0; i < audio.length; i++) pre[i] = audio[i] - preemph * (i ? audio[i - 1] : this.ultima);
    if (audio.length) this.ultima = audio[audio.length - 1];

    const meia = fft_size / 2;
    const desloc = (fft_size - win_length) / 2;
    const tam = Math.max(meia + pre.length + desloc, desloc + win_length);
    const pad = new Float32Array(tam);
    pad.set(this.sobra, 0);
    pad.set(pre, meia);
    // a sobra para o próximo pedaço: as últimas meia-FFT amostras (pré-enfatizadas)
    const junto = new Float32Array(meia + pre.length);
    junto.set(this.sobra, 0);
    junto.set(pre, meia);
    this.sobra = junto.slice(junto.length - meia);

    const quadros = Math.floor((pad.length - desloc - win_length) / hop_length) + 1;
    const saida: Float32Array[] = [];
    for (let t = 0; t < quadros; t++) {
      const ini = t * hop_length + desloc;
      this.re.fill(0); this.im.fill(0);
      for (let n = 0; n < win_length; n++) this.re[n] = pad[ini + n] * this.janela[n];
      potencia(this.re, this.im, this.pot);
      const q = new Float32Array(num_mels);
      for (let m = 0; m < num_mels; m++) {
        const f = this.filtros[m];
        let v = 0;
        for (let k = 0; k < f.length; k++) v += f[k] * this.pot[k];
        q[m] = Math.log(v + log_eps);
      }
      saida.push(q);
    }
    return saida;
  }
}

// ---------- o modelo ----------

export interface FontesNemotron {
  /** conteúdo de cada arquivo (nome → bytes) */
  ler: (nome: string) => Promise<Uint8Array>;
}

export class Nemotron {
  private mel: MelStreaming;
  private cacheMel: Float32Array[];
  private resto = new Float32Array(0);
  private cacheCanal!: OrtNs.Tensor;
  private cacheTempo!: OrtNs.Tensor;
  private cacheLen!: OrtNs.Tensor;
  private h!: OrtNs.Tensor;
  private cel!: OrtNs.Tensor;
  private ultimoToken: number;
  private tokens: number[] = [];
  langId: number;

  private constructor(
    private ort: Ort,
    private c: ConfigNemotron,
    private vocab: string[],
    private enc: OrtNs.InferenceSession,
    private dec: OrtNs.InferenceSession,
    private joint: OrtNs.InferenceSession,
    idioma: string,
  ) {
    this.mel = new MelStreaming(c);
    this.cacheMel = [];
    this.ultimoToken = c.blank_id;
    this.langId = IDIOMAS_NEMOTRON[idioma] ?? IDIOMAS_NEMOTRON["pt-BR"];
    this.recomecar();
  }

  static async abrir(ort: Ort, fontes: FontesNemotron, opcoes: {
    idioma?: string;
    /** opções do decoder e do joint (e do encoder, se `sessaoEncoder` não vier) */
    sessao?: OrtNs.InferenceSession.SessionOptions;
    sessaoEncoder?: OrtNs.InferenceSession.SessionOptions;
  } = {}) {
    const texto = async (n: string) => new TextDecoder().decode(await fontes.ler(n));
    const cfg = JSON.parse(await texto("genai_config.json")).model as ConfigNemotron;
    const vocab = (await texto("vocab.txt")).split(/\r?\n/);
    const sessao = async (nome: string, so = opcoes.sessao) => {
      const modelo = await fontes.ler(`${nome}.onnx`);
      const dados = await fontes.ler(`${nome}.onnx.data`);
      return ort.InferenceSession.create(modelo, { ...so, externalData: [{ path: `${nome}.onnx.data`, data: dados }] });
    };
    // um de cada vez: o encoder sozinho já tem ~700 MB
    const enc = await sessao("encoder", opcoes.sessaoEncoder ?? opcoes.sessao);
    const dec = await sessao("decoder");
    const joint = await sessao("joint");
    return new Nemotron(ort, cfg, vocab, enc, dec, joint, opcoes.idioma ?? "pt-BR");
  }

  /** Zera tudo para um ditado novo. */
  recomecar() {
    const { Tensor } = this.ort;
    const { num_hidden_layers: camadas, hidden_size: dim } = this.c.encoder;
    this.cacheCanal = new Tensor("float32", new Float32Array(camadas * this.c.left_context * dim), [1, camadas, this.c.left_context, dim]);
    this.cacheTempo = new Tensor("float32", new Float32Array(camadas * dim * this.c.conv_context), [1, camadas, dim, this.c.conv_context]);
    this.cacheLen = new Tensor("int64", new BigInt64Array(1), [1]);
    const { num_hidden_layers: lc, hidden_size: ld } = this.c.decoder;
    this.h = new Tensor("float32", new Float32Array(lc * ld), [lc, 1, ld]);
    this.cel = new Tensor("float32", new Float32Array(lc * ld), [lc, 1, ld]);
    this.ultimoToken = this.c.blank_id;
    this.tokens = [];
    this.mel = new MelStreaming(this.c);
    this.cacheMel = Array.from({ length: this.c.pre_encode_cache_size }, () => new Float32Array(this.c.num_mels));
    this.resto = new Float32Array(0);
  }

  /** Recebe mais áudio (16 kHz, mono); processa os pedaços inteiros que fecharem. Devolve o texto novo. */
  async aceitar(audio: Float32Array): Promise<string> {
    const junto = new Float32Array(this.resto.length + audio.length);
    junto.set(this.resto, 0);
    junto.set(audio, this.resto.length);
    let novo = "";
    let i = 0;
    for (; i + this.c.chunk_samples <= junto.length; i += this.c.chunk_samples) novo += await this.pedaco(junto.subarray(i, i + this.c.chunk_samples));
    this.resto = junto.slice(i);
    return novo;
  }

  /** Fim do ditado: o que sobrou vira um último pedaço (completado com silêncio). */
  async fechar(): Promise<string> {
    let novo = "";
    if (this.resto.length) {
      const p = new Float32Array(this.c.chunk_samples);
      p.set(this.resto, 0);
      this.resto = new Float32Array(0);
      novo += await this.pedaco(p);
    }
    // mais um pedaço de silêncio: o encoder olha um pouco à frente, e a última palavra só sai com ele
    novo += await this.pedaco(new Float32Array(this.c.chunk_samples));
    return novo;
  }

  /** O texto inteiro até agora. */
  texto(): string {
    return this.decodificar(this.tokens).trim();
  }

  private decodificar(ids: number[]): string {
    return ids
      .map((t) => this.vocab[t] ?? "")
      .filter((p) => !/^<.*>$/.test(p))
      .join("")
      .replace(/▁/g, " ")
      .replace(/ {2,}/g, " ");
  }

  private async pedaco(audio: Float32Array): Promise<string> {
    const { Tensor } = this.ort;
    const { num_mels } = this.c;
    const quadros = this.mel.processar(audio);
    const todos = [...this.cacheMel, ...quadros];
    // o cache do pré-encoder: os últimos quadros de mel deste pedaço
    this.cacheMel = todos.slice(todos.length - this.c.pre_encode_cache_size);
    const mel = new Float32Array(todos.length * num_mels);
    todos.forEach((q, t) => mel.set(q, t * num_mels));

    const entradas: Record<string, OrtNs.Tensor> = {
      audio_signal: new Tensor("float32", mel, [1, todos.length, num_mels]),
      length: new Tensor("int64", BigInt64Array.from([BigInt(todos.length)]), [1]),
      cache_last_channel: this.cacheCanal,
      cache_last_time: this.cacheTempo,
      cache_last_channel_len: this.cacheLen,
      lang_id: new Tensor("int64", BigInt64Array.from([BigInt(this.langId)]), [1]),
    };
    const nomes = this.enc.inputNames;
    const r = await this.enc.run(Object.fromEntries(Object.entries(entradas).filter(([k]) => nomes.includes(k))));
    this.cacheCanal = r.cache_last_channel_next;
    this.cacheTempo = r.cache_last_time_next;
    this.cacheLen = r.cache_last_channel_len_next;
    const saida = r.outputs;
    const [, passos, dim] = saida.dims as number[];
    const validos = Math.min(passos, Number((r.encoded_lengths.data as BigInt64Array)[0]));
    const dadosEnc = saida.data as Float32Array;

    const novos: number[] = [];
    for (let t = 0; t < validos; t++) {
      const quadro = new Tensor("float32", dadosEnc.slice(t * dim, (t + 1) * dim), [1, 1, dim]);
      for (let s = 0; s < this.c.max_symbols_per_step; s++) {
        const d = await this.dec.run({
          targets: new Tensor("int64", BigInt64Array.from([BigInt(this.ultimoToken)]), [1, 1]),
          h_in: this.h,
          c_in: this.cel,
        });
        // a saída do decoder vem [1, dim, 1] (ou [1, dim]); o joint quer [1, 1, dim]
        const dd = d.decoder_output.data as Float32Array;
        const quadroDec = new Tensor("float32", dd, [1, 1, dd.length]);
        const j = await this.joint.run({ encoder_output: quadro, decoder_output: quadroDec });
        const logits = j.joint_output.data as Float32Array;
        let melhor = 0;
        for (let k = 1; k < logits.length; k++) if (logits[k] > logits[melhor]) melhor = k;
        if (melhor === this.c.blank_id) break;
        novos.push(melhor);
        this.ultimoToken = melhor;
        this.h = d.h_out;
        this.cel = d.c_out;
      }
    }
    this.tokens.push(...novos);
    return this.decodificar(novos);
  }
}
