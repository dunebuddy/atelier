// Janela destacada: uma aba do atelier numa janela separada, para pôr do lado do que você está fazendo (o caso do
// checklist durante uma sessão). Ela mostra só o conteúdo da aba (sem barra lateral, workspaces nem terminais) e não
// grava nada do workspace da janela principal. A barra de título é a do atelier: devolver (a aba volta para a janela
// de onde saiu), "sempre por cima", minimizar, maximizar e fechar.
// No app, é uma janela do Tauri (`abrir_janela_solta`); no navegador de teste, uma janela do navegador.
import { useCallback, useEffect, useState } from "react";
import { Copy, Minus, Pin, PinOff, Square, Undo2, X } from "lucide-react";
import { api, Esquema, TemaArquivo, Visao } from "../api";
import { falhou, ler, guardar, Rota } from "../ui";
import * as P from "../painel";
import { aplicarTema } from "../tema";
import { PainelTrabalho, Contexto } from "./Painel";
import { PilhaDeAvisos } from "./Avisos";
import { JanelaSegredo, PedidoDoAgente } from "./Cofre";
import { BANCADA_DA_JANELA } from "../janela";

const params = new URLSearchParams(location.search);

/** A rota da janelinha (JSON na URL), ou null na janela normal. */
export const ROTA_SOLTA: Rota | null = (() => {
  const s = params.get("solta");
  if (!s) return null;
  try { return JSON.parse(s) as Rota; } catch { return null; }
})();

const TAMANHO = "janela-solta.tamanho";
/** o rótulo da janela de onde a aba saiu (o "devolver" manda para ela) */
const ORIGEM = params.get("origem");

/** De onde a aba saiu, na janela de origem: workspace, painel (0 = esquerda, 1 = direita) e a aba que vinha depois. */
export type Lugar = { ws?: string; mi: number; antes?: string };
const LUGAR: Lugar | null = (() => {
  const s = params.get("de");
  if (!s) return null;
  try { return JSON.parse(s) as Lugar; } catch { return null; }
})();

/** Manda a aba de volta para a janela do atelier de onde saiu (mesmo workspace e mesmo painel). Devolve se foi. */
export async function devolverAba(rota: Rota): Promise<boolean> {
  const detalhe = { rota, de: LUGAR };
  if (await janelaTauri()) {
    try {
      const { emitTo } = await import("@tauri-apps/api/event");
      await emitTo(ORIGEM ?? "main", "atelier:devolver", detalhe);
      return true;
    } catch (e) { falhou(e); return false; }
  }
  // navegador de teste: a janela que abriu esta
  const dono = window.opener as Window | null;
  if (!dono) return false;
  dono.dispatchEvent(new CustomEvent("atelier:devolver", { detail: detalhe }));
  return true;
}

async function janelaTauri() {
  if (!("__TAURI_INTERNALS__" in window)) return null;
  try { return (await import("@tauri-apps/api/window")).getCurrentWindow(); } catch { return null; }
}

/** Destaca a rota numa janelinha (o tamanho da última fica lembrado). `onde`: posição na tela (arrastou para fora);
 *  a janelinha nasce com o canto ali. Devolve se abriu. */
export async function destacarEmJanela(rota: Rota, titulo: string, onde?: { x: number; y: number }, de?: Lugar): Promise<boolean> {
  const t = ler<{ largura: number; altura: number }>(TAMANHO, { largura: 480, altura: 820 });
  let invoke: typeof import("@tauri-apps/api/core").invoke | null = null;
  try { invoke = (await import("@tauri-apps/api/core")).invoke; if (!("__TAURI_INTERNALS__" in window)) invoke = null; } catch { invoke = null; }
  if (invoke) {
    try {
      const origem = (await janelaTauri())?.label ?? "main";
      await invoke("abrir_janela_solta", {
        origem, de: de ? encodeURIComponent(JSON.stringify(de)) : null,
        rota: encodeURIComponent(JSON.stringify(rota)), titulo, bancada: BANCADA_DA_JANELA, largura: t.largura, altura: t.altura,
        x: onde ? Math.max(0, onde.x - 40) : null, y: onde ? Math.max(0, onde.y - 15) : null,
      });
      return true;
    } catch (e) {
      falhou(`Não consegui destacar: ${e}`);
      return false;
    }
  }
  const q = new URLSearchParams({ solta: JSON.stringify(rota) });
  if (BANCADA_DA_JANELA) q.set("bancada", BANCADA_DA_JANELA);
  if (de) q.set("de", JSON.stringify(de));
  const pos = onde ? `,left=${Math.round(onde.x - 40)},top=${Math.round(onde.y - 15)}` : "";
  return !!window.open(`${location.pathname}?${q}`, "_blank", `popup,width=${t.largura},height=${t.altura}${pos}`);
}

export function JanelaSolta({ rota }: { rota: Rota }) {
  const [esquema, setEsquema] = useState<Esquema | null>(null);
  const [visoes, setVisoes] = useState<Visao[]>([]);
  const [estado, setEstado] = useState(() => P.inicial(rota));
  const [porCima, setPorCima] = useState(false);
  const [temas, setTemas] = useState<TemaArquivo[]>([]);

  const carregarEsquema = useCallback(async () => { setEsquema(await api.esquema()); }, []);
  const carregarVisoes = useCallback(async () => { setVisoes(await api.visoes()); }, []);
  useEffect(() => {
    carregarEsquema().catch(falhou);
    carregarVisoes().catch(() => {});
    api.temas().then((r) => setTemas(r.temas)).catch(() => {});
    api.preferencias().then((p) => aplicarTema(p.tema, temas)).catch(() => aplicarTema(ler("tema", "escuro"), []));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.preferencias().then((p) => aplicarTema(p.tema, temas)).catch(() => {}); }, [temas]);

  // o título acompanha a aba; o tamanho fica lembrado para a próxima janelinha
  const j = P.janelaAtiva(estado);
  useEffect(() => { document.title = `${j?.titulo ?? "atelier"} · atelier`; }, [j?.titulo]);
  useEffect(() => {
    const f = () => guardar(TAMANHO, { largura: window.innerWidth, altura: window.innerHeight });
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  // abrir algo daqui (um link, um documento): abre aqui mesmo, numa aba nova da janelinha
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ rota: Rota }>).detail;
      setEstado((s) => P.abrirNova(s, d.rota));
    };
    window.addEventListener("atelier:abrir", f);
    return () => window.removeEventListener("atelier:abrir", f);
  }, []);

  // a última aba saiu (fechou, ou foi devolvida): a janela não fica vazia
  const vazia = estado.metades.every((m) => m.janelas.length === 0);
  useEffect(() => { if (vazia) fecharJanela(); }, [vazia]);

  const [maximizada, setMaximizada] = useState(false);
  useEffect(() => {
    let largar: (() => void) | undefined;
    janelaTauri().then(async (w) => {
      if (!w) return;
      const ver = () => { w.isMaximized().then(setMaximizada).catch(() => {}); };
      ver();
      largar = await w.onResized(ver);
    });
    return () => largar?.();
  }, []);

  /** devolve todas as abas desta janela (cada uma para o lugar de onde veio); a janela fecha quando esvazia */
  const devolver = async () => {
    for (const m of estado.metades) for (const x of m.janelas) {
      if (await devolverAba(P.rotaDe(x))) setEstado((s) => P.fechar(s, x.id));
    }
  };

  const alternarPorCima = async () => {
    const v = !porCima;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setAlwaysOnTop(v);
      setPorCima(v);
    } catch {
      falhou("“Sempre por cima” só funciona no app (no navegador de teste não dá).");
    }
  };

  if (!esquema) return <div className="vazio-grande">Abrindo…</div>;
  const ctx: Contexto = {
    esquema, visoes,
    criarVisao: async (d) => { const { id } = await api.criarVisao(d); await carregarVisoes(); return id; },
    salvarVisao: (id, d) => { setVisoes((l) => l.map((x) => (x.id === id ? { ...x, ...d } : x))); api.atualizarVisao(id, d).catch(falhou); },
    apagarVisao: async (id) => { await api.apagarVisao(id); await carregarVisoes(); },
    aoMudarEsquema: carregarEsquema,
  };
  return (
    <div className="app janela-solta">
      <header className="solta-barra" data-tauri-drag-region>
        <span className="solta-titulo" data-tauri-drag-region>{j?.titulo ?? "…"}</span>
        <button className="bt-btn" onClick={devolver} title="Devolver tudo: as abas voltam para a janela do atelier de onde saíram (cada aba também tem o seu botão de devolver)">
          <Undo2 size={15} />
        </button>
        <button className={`bt-btn${porCima ? " ativo" : ""}`} onClick={alternarPorCima}
          title={porCima ? "Sempre por cima: ligado (clique para desligar)" : "Sempre por cima: esta janela fica à frente das outras"}>
          {porCima ? <Pin size={15} /> : <PinOff size={15} />}
        </button>
        <div className="bt-janela">
          <button title="Minimizar" onClick={() => janelaTauri().then((w) => w?.minimize())}><Minus size={15} /></button>
          <button title={maximizada ? "Restaurar" : "Maximizar"} onClick={() => janelaTauri().then((w) => w?.toggleMaximize())}>
            {maximizada ? <Copy size={12} style={{ transform: "scaleX(-1)" }} /> : <Square size={12} />}
          </button>
          <button className="fechar" title="Fechar" onClick={fecharJanela}><X size={16} /></button>
        </div>
      </header>
      <div className="solta-corpo">
        <PainelTrabalho estado={estado} mudar={setEstado} ctx={ctx} ativo />
      </div>
      <PilhaDeAvisos />
      <PedidoDoAgente />
      <JanelaSegredo esquema={esquema} wsItem={null} />
    </div>
  );
}

function fecharJanela() {
  janelaTauri().then((w) => (w ? w.close() : window.close()));
}
