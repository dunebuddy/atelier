import { useEffect, useRef, useState } from "react";
import { Check, Download, Loader2, Mic, Square, Trash2 } from "lucide-react";
import { api } from "../api";
import * as D from "../ditado";
import { avisar, falhou } from "../ui";
import "../ditado.css";

/** Redesenha quando o ditado muda (modelo escolhido, baixado, carregado, descarregado). */
function useDitado() {
  const [, setN] = useState(0);
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    window.addEventListener("atelier:ditado", f);
    return () => window.removeEventListener("atelier:ditado", f);
  }, []);
}

const abrirConfig = () => window.dispatchEvent(new CustomEvent("atelier:config", { detail: "ditado" }));

/**
 * Microfone: clique para falar, clique de novo para parar; o texto vai para `aoTexto`. Sem modelo baixado e escolhido,
 * avisa e leva às Configurações. Esc cancela a gravação.
 */
export function BotaoDitado({ aoTexto, titulo = "Ditar por voz" }: { aoTexto: (t: string) => void; titulo?: string }) {
  useDitado();
  const [fase, setFase] = useState<"parado" | "gravando" | "transcrevendo">("parado");
  const gravacao = useRef<Awaited<ReturnType<typeof D.gravar>> | null>(null);
  // streaming: o texto que já saiu enquanto você fala (aparece ao lado do microfone) e a fila de envio do áudio
  const [parcial, setParcial] = useState("");
  const envio = useRef<{ buffer: Float32Array[]; tam: number; fila: Promise<unknown> } | null>(null);

  useEffect(() => {
    if (fase !== "gravando") return;
    const f = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      gravacao.current?.cancelar();
      gravacao.current = null;
      envio.current = null;
      setParcial("");
      setFase("parado");
    };
    window.addEventListener("keydown", f, true);
    return () => window.removeEventListener("keydown", f, true);
  }, [fase]);

  const clicar = async () => {
    if (fase === "transcrevendo") return;
    if (fase === "gravando") {
      const g = gravacao.current;
      gravacao.current = null;
      if (!g) return;
      setFase("transcrevendo");
      const stream = envio.current;
      envio.current = null;
      try {
        const audio = await g.parar();
        let t: string;
        if (stream) {
          // manda o que ficou no buffer, espera a fila e fecha o ditado
          if (stream.tam) stream.fila = stream.fila.then(() => D.enviarStreaming(juntar(stream.buffer)));
          await stream.fila;
          t = await D.terminarStreaming();
        } else {
          if (audio.length < 16000 * 0.3) { setFase("parado"); return; }
          t = await D.transcrever(audio);
        }
        if (t) aoTexto(t);
        else avisar("Não entendi nada. Tente falar mais perto do microfone.");
      } catch (e) {
        falhou(e);
      } finally {
        setFase("parado");
        setParcial("");
      }
      return;
    }
    if (!D.modeloAtual()) {
      avisar("Para ditar, escolha e baixe um modelo em Configurações → Ditado.");
      abrirConfig();
      return;
    }
    try {
      if (D.modeloAtual()?.motor === "streaming") {
        // streaming: junta ~0,5 s de áudio e manda; o texto que volta aparece na hora
        const s = { buffer: [] as Float32Array[], tam: 0, fila: D.comecarStreaming() as Promise<unknown> };
        envio.current = s;
        setParcial("");
        s.fila.catch(falhou);
        gravacao.current = await D.gravar((p) => {
          if (envio.current !== s) return;
          s.buffer.push(p);
          s.tam += p.length;
          if (s.tam < 8000) return;
          const audio = juntar(s.buffer);
          s.buffer = [];
          s.tam = 0;
          s.fila = s.fila.then(() => D.enviarStreaming(audio)).then((novo) => {
            if (novo && envio.current === s) setParcial((t) => (t + novo).replace(/^\s+/, ""));
          }).catch(() => {});
        });
        setFase("gravando");
        return;
      }
      gravacao.current = await D.gravar();
      setFase("gravando");
      D.preparar(); // carrega o modelo enquanto você fala
    } catch (e) {
      falhou(`Não consegui usar o microfone: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <>
    {parcial && <span className="ditado-parcial" title={parcial}>{parcial.length > 60 ? `…${parcial.slice(-60)}` : parcial}</span>}
    <button
      type="button"
      className={`btn-icone ditado-botao ${fase}`}
      title={fase === "gravando" ? "Gravando: clique para parar (Esc cancela)" : fase === "transcrevendo" ? "Transcrevendo…" : titulo}
      onClick={clicar}
    >
      {fase === "transcrevendo" ? <Loader2 size={15} className="girando" /> : fase === "gravando" ? <Square size={13} /> : <Mic size={15} />}
    </button>
    </>
  );
}

function juntar(partes: Float32Array[]): Float32Array {
  const a = new Float32Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { a.set(p, i); i += p.length; }
  return a;
}

const TEMPOS: [number, string][] = [[1, "1 minuto"], [5, "5 minutos"], [15, "15 minutos"], [30, "30 minutos"], [0, "Nunca (fica carregado)"]];

/** Configurações → Ditado: a lista de modelos; baixar, escolher, apagar; quanto tempo o modelo fica na memória. */
export function SecaoDitado() {
  useDitado();
  const [baixando, setBaixando] = useState<{ id: string; fracao: number } | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const escolhido = D.modeloEscolhido();
  const baixados = D.baixados();
  const carregado = D.estadoDitado();
  // placa de vídeo com memória própria? sem ela, "Placa de vídeo" fica desabilitada (a integrada usa a RAM)
  const [placas, setPlacas] = useState<{ nome: string; vram_mb: number; dedicada: boolean }[] | null>(null);
  const [webgpu, setWebgpu] = useState<string | null>(null);
  useEffect(() => {
    api.placasDeVideo().then(setPlacas).catch(() => setPlacas([]));
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<{ info?: { description?: string; vendor?: string } } | null> } }).gpu;
    if (!gpu) { setWebgpu(""); return; }
    gpu.requestAdapter().then((a) => setWebgpu(a ? a.info?.description || a.info?.vendor || "placa" : "")).catch(() => setWebgpu(""));
  }, []);
  const dedicada = placas?.find((p) => p.dedicada) ?? null;
  const podeGpu = !!dedicada && webgpu !== "" && webgpu !== null;
  const motivo = placas === null || webgpu === null ? "procurando a placa de vídeo…"
    : !dedicada ? `sem placa de vídeo dedicada (${placas.map((p) => p.nome).join(", ") || "nenhuma achada"}: usa a própria RAM, não economiza nada)`
    : webgpu === "" ? "o WebView desta máquina não tem WebGPU" : "";
  const dispositivo = D.dispositivo();

  const baixar = async (m: D.ModeloDitado) => {
    setBaixando({ id: m.id, fracao: 0 });
    try {
      await D.baixar(m, (fracao) => setBaixando({ id: m.id, fracao }));
      if (!D.modeloEscolhido()) D.escolher(m.id);
      avisar(`${m.nome} baixado.`);
    } catch (e) {
      falhou(`Não consegui baixar ${m.nome}: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBaixando(null);
    }
  };

  const apagar = async (m: D.ModeloDitado) => {
    setApagando(m.id);
    try {
      await D.apagar(m);
      avisar(`${m.nome} apagado do disco.`);
    } catch (e) {
      falhou(e);
    } finally {
      setApagando(null);
    }
  };

  return (
    <>
      <h3>Ditado</h3>
      <p className="dica">
        Fale em vez de escrever (o microfone aparece no Comando e na captura). Tudo roda nesta máquina: o áudio não
        sai daqui. Baixe um modelo e escolha qual usar; sem modelo, o microfone não grava. A lista de modelos vem do
        repositório do atelier e o app avisa quando aparece um novo.
      </p>
      <div className="ditado-modelos">
        <label className={`ditado-modelo${!escolhido ? " escolhido" : ""}`}>
          <input type="radio" checked={!escolhido} onChange={() => D.escolher("")} />
          <div className="ditado-info"><strong>Nenhum</strong><small>Sem ditado.</small></div>
        </label>
        {D.catalogo().map((m) => {
          const tem = baixados.includes(m.id);
          const b = baixando?.id === m.id ? baixando : null;
          return (
            <label key={m.id} className={`ditado-modelo${escolhido === m.id ? " escolhido" : ""}${tem ? "" : " sem"}`}>
              <input type="radio" checked={escolhido === m.id} disabled={!tem} onChange={() => D.escolher(m.id)} />
              <div className="ditado-info">
                <strong>{m.nome}{m.recomendado && <span className="tag cor-green">recomendado</span>}{carregado?.modelo.id === m.id && <span className="tag cor-blue">na memória</span>}</strong>
                <small>
                  {m.nota} · {m.idiomas} · download ~{m.tamanho_mb >= 1000 ? `${(m.tamanho_mb / 1000).toFixed(1)} GB` : `${m.tamanho_mb} MB`}
                  {D.memoriaMedida(m.id) != null && ` · carregado ocupa ~${D.memoriaMedida(m.id)} MB`}
                </small>
                {b && <span className="ditado-barra"><span style={{ width: `${Math.round(b.fracao * 100)}%` }} /></span>}
              </div>
              {tem ? (
                <span className="ditado-acoes">
                  <span className="ditado-ok"><Check size={13} /> baixado</span>
                  <button className="btn-icone" title="Apagar do disco" disabled={apagando === m.id} onClick={(e) => { e.preventDefault(); apagar(m); }}><Trash2 size={14} /></button>
                </span>
              ) : (
                <button className="btn" disabled={!!baixando} onClick={(e) => { e.preventDefault(); baixar(m); }}>
                  {b ? <><Loader2 size={13} className="girando" /> {Math.round(b.fracao * 100)}%</> : <><Download size={13} /> Baixar</>}
                </button>
              )}
            </label>
          );
        })}
      </div>

      <h4>Onde o modelo roda</h4>
      <label className="ditado-tempo">
        <select className="campo" value={dispositivo === "gpu" && podeGpu ? "gpu" : "cpu"} onChange={(e) => D.mudarDispositivo(e.target.value as D.Dispositivo)}>
          <option value="cpu">Processador (RAM)</option>
          <option value="gpu" disabled={!podeGpu}>Placa de vídeo (VRAM){dedicada ? ` · ${dedicada.nome}, ${Math.round(dedicada.vram_mb / 1024)} GB` : ""}</option>
        </select>
      </label>
      <p className="dica">
        {podeGpu
          ? "Na placa de vídeo o ditado sai da RAM e fica mais rápido. O Parakeet na placa usa o modelo em 32 bits (o de 8 bits erra no WebGPU): é outro download, bem maior (~2,4 GB). Se a placa falhar ao carregar, o ditado volta sozinho para o processador e avisa."
          : `Placa de vídeo indisponível: ${motivo}.`}
      </p>

      <h4>Memória</h4>
      <p className="dica">
        Baixar só guarda no disco; o modelo carrega quando você dita e sai da memória depois de um tempo sem uso (a
        barra de status mostra enquanto ele está carregado, com a memória medida de verdade).
      </p>
      <label className="ditado-tempo">
        Descarregar depois de
        <select className="campo" value={D.minutosParaDescarregar()} onChange={(e) => D.mudarMinutos(Number(e.target.value))}>
          {TEMPOS.map(([n, nome]) => <option key={n} value={n}>{nome}</option>)}
        </select>
        sem uso
      </label>
      {carregado && <button className="btn" style={{ marginTop: 10 }} onClick={D.descarregar}>Descarregar agora</button>}

      <h4>Testar</h4>
      <TesteDitado />
    </>
  );
}

function TesteDitado() {
  const [texto, setTexto] = useState("");
  return (
    <div className="ditado-teste">
      <BotaoDitado aoTexto={(t) => setTexto((x) => (x ? `${x} ${t}` : t))} titulo="Clique e fale; clique de novo para parar" />
      <span className={texto ? "" : "vazio"}>{texto || "Clique no microfone, fale e clique de novo."}</span>
    </div>
  );
}

/** Na barra de status, enquanto o modelo está na memória: nome, quanto a interface cresceu e o tempo até descarregar. */
export function IndicadorDitado({ interfaceRam }: { interfaceRam: number | null }) {
  useDitado();
  const [, setTique] = useState(0);
  const e = D.estadoDitado();
  // a medida da interface vai para o ditado: a diferença desde antes de o modelo subir é o que ele ocupa
  useEffect(() => D.anotarRamInterface(interfaceRam), [interfaceRam]);
  useEffect(() => {
    if (!e) return;
    const t = window.setInterval(() => setTique((n) => n + 1), 15_000);
    return () => window.clearInterval(t);
  }, [e]);
  if (!e) return null;
  // medida de verdade: a interface agora menos a interface antes de o modelo subir (sem a medida de antes, "…")
  const ram = interfaceRam != null && e.ramAntes != null ? Math.max(0, interfaceRam - e.ramAntes) : null;
  const mb = ram != null ? `~${Math.round(ram / 1048576)} MB` : "…";
  const onde = e.dispositivo === "gpu" ? "na placa de vídeo" : "no processador";
  const min = D.minutosParaDescarregar();
  const resta = min > 0 ? Math.max(0, Math.ceil((e.ultimoUso + min * 60_000 - Date.now()) / 60_000)) : null;
  return (
    <button
      className="bs-medida ditado-indicador"
      onClick={D.descarregar}
      title={`Ditado: ${e.modelo.nome} carregado ${onde} (a interface cresceu ${mb} desde que ele subiu)${resta != null ? ` · descarrega em ${resta} min sem uso` : ""}. Clique para descarregar agora.`}
    >
      <Mic size={12} /> {e.modelo.nome} · {mb}{e.dispositivo === "gpu" ? " · placa" : ""}{resta != null ? ` · ${resta} min` : ""}
    </button>
  );
}
