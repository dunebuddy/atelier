// Janelinha destacada: uma aba do atelier numa janela pequena, para pôr do lado do que você está fazendo (o caso do
// checklist durante uma sessão). Ela mostra só o conteúdo da aba (sem barra lateral, workspaces nem terminais) e não
// grava nada do workspace da janela principal. "Sempre por cima" deixa a janelinha à frente das outras janelas.
// No app, é uma janela do Tauri (`abrir_janela_solta`); no navegador de teste, uma janela do navegador.
import { useCallback, useEffect, useState } from "react";
import { Pin, PinOff } from "lucide-react";
import { api, Esquema, TemaArquivo, Visao } from "../api";
import { falhou, ler, guardar, Rota } from "../ui";
import * as P from "../painel";
import { aplicarTema } from "../tema";
import { PainelTrabalho, Contexto } from "./Painel";
import { PilhaDeAvisos } from "./Avisos";
import { PedidoDoAgente } from "./Cofre";
import { BANCADA_DA_JANELA } from "../janela";

const params = new URLSearchParams(location.search);

/** A rota da janelinha (JSON na URL), ou null na janela normal. */
export const ROTA_SOLTA: Rota | null = (() => {
  const s = params.get("solta");
  if (!s) return null;
  try { return JSON.parse(s) as Rota; } catch { return null; }
})();

const TAMANHO = "janela-solta.tamanho";

/** Destaca a rota numa janelinha (o tamanho da última fica lembrado). */
export async function destacarEmJanela(rota: Rota, titulo: string) {
  const t = ler<{ largura: number; altura: number }>(TAMANHO, { largura: 480, altura: 820 });
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("abrir_janela_solta", { rota: encodeURIComponent(JSON.stringify(rota)), titulo, bancada: BANCADA_DA_JANELA, largura: t.largura, altura: t.altura });
  } catch {
    const q = new URLSearchParams({ solta: JSON.stringify(rota) });
    if (BANCADA_DA_JANELA) q.set("bancada", BANCADA_DA_JANELA);
    window.open(`${location.pathname}?${q}`, "_blank", `popup,width=${t.largura},height=${t.altura}`);
  }
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
      <div className="solta-barra">
        <span className="solta-titulo">{j?.titulo ?? "…"}</span>
        <button className={`btn-icone${porCima ? " ativo" : ""}`} onClick={alternarPorCima}
          title={porCima ? "Sempre por cima: ligado (clique para desligar)" : "Sempre por cima: a janelinha fica à frente das outras janelas"}>
          {porCima ? <Pin size={14} /> : <PinOff size={14} />}
        </button>
      </div>
      <div className="solta-corpo">
        <PainelTrabalho estado={estado} mudar={setEstado} ctx={ctx} ativo />
      </div>
      <PilhaDeAvisos />
      <PedidoDoAgente />
    </div>
  );
}
