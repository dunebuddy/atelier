import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Download, Sparkles, X } from "lucide-react";
import { Preferencias } from "../api";
import { avisar, falhou, guardar, ler } from "../ui";
import { procurarModelosNovos } from "../ditado";

// Atualização: o app pergunta ao GitHub (release mais recente) se tem versão nova. Só instala se o Paulo mandar.
// Fora do app (navegador de teste) não há atualizador: não faz nada.

type Achada = { versao: string; notas: string; instalar: (progresso: (p: number) => void) => Promise<void> };

async function procurar(): Promise<Achada | null> {
  const { check } = await import("@tauri-apps/plugin-updater");
  const u = await check();
  if (!u) return null;
  return {
    versao: u.version,
    notas: u.body ?? "",
    instalar: async (progresso) => {
      let total = 0;
      let baixado = 0;
      await u.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        if (ev.event === "Progress") { baixado += ev.data.chunkLength; if (total) progresso(Math.round((baixado / total) * 100)); }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  };
}

/** Procura agora (botão nas Configurações). Responde com aviso quando já está na última. */
export function procurarAtualizacao() {
  window.dispatchEvent(new Event("atelier:atualizacao"));
}

// Uma instalação de cada vez: o clique repetido (ou uma segunda procura no meio) não abre outro instalador.
let instalando = false;

export function AvisoAtualizacao({ prefs }: { prefs: Preferencias | null }) {
  const [achada, setAchada] = useState<Achada | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [fechado, setFechado] = useState(false);
  // a versão de antes da atualização: ao reabrir numa versão diferente, avisa que deu certo
  const [atualizado, setAtualizado] = useState<string | null>(() => {
    const antes = ler<string | null>("atualizacao.antes", null);
    guardar("atualizacao.antes", null);
    return antes && antes !== __VERSAO__ ? antes : null;
  });

  const verificar = useCallback(async (manual: boolean) => {
    // a lista de modelos de ditado também mora no GitHub: modelo novo vira aviso
    procurarModelosNovos();
    if (instalando) return;
    try {
      const a = await procurar();
      setAchada(a);
      setFechado(false);
      if (!a && manual) avisar("Você já está na versão mais nova.");
    } catch (e) {
      if (manual) falhou(e);
    }
  }, []);

  // ao abrir (se ligado nas Configurações) e quando o Paulo pede
  useEffect(() => {
    if (prefs?.atualizacao?.avisar) verificar(false);
  }, [prefs?.atualizacao?.avisar, verificar]);
  useEffect(() => {
    const f = () => verificar(true);
    window.addEventListener("atelier:atualizacao", f);
    return () => window.removeEventListener("atelier:atualizacao", f);
  }, [verificar]);
  useEffect(() => {
    if (!atualizado) return;
    const t = window.setTimeout(() => setAtualizado(null), 12000);
    return () => window.clearTimeout(t);
  }, [atualizado]);

  const instalar = () => {
    if (!achada || instalando) return;
    instalando = true;
    guardar("atualizacao.antes", __VERSAO__);
    setProgresso(0);
    achada.instalar(setProgresso).catch((e) => {
      instalando = false;
      guardar("atualizacao.antes", null);
      setProgresso(null);
      falhou(e);
    });
  };

  if (atualizado) {
    return (
      <div className="cartao-aviso" role="status">
        <div className="ca-cabeca">
          <CircleCheck size={16} className="ca-icone" />
          <span className="ca-titulo">Atualizado para a versão {__VERSAO__}</span>
          <button className="btn-icone" title="Fechar" onClick={() => setAtualizado(null)}><X size={14} /></button>
        </div>
        <div className="ca-texto">Estava na {atualizado}. Deu tudo certo; seus dados continuam onde estavam.</div>
        <div className="ca-acoes">
          <button className="btn" onClick={() => { abrirNotas(); setAtualizado(null); }}>O que mudou</button>
        </div>
      </div>
    );
  }
  if (!achada || fechado) return null;
  const baixando = progresso !== null;
  return (
    <div className="cartao-aviso" role="dialog" aria-label="Versão nova">
      <div className="ca-cabeca">
        <Sparkles size={16} className="ca-icone" />
        <span className="ca-titulo">Tem versão nova do atelier: {achada.versao}</span>
        {!baixando && <button className="btn-icone" title="Fechar" onClick={() => setFechado(true)}><X size={14} /></button>}
      </div>
      <div className="ca-texto">
        {!baixando
          ? "Quer instalar? O app reinicia sozinho no fim; seus dados ficam onde estão."
          : progresso < 100
            ? `Baixando… ${progresso}%`
            : "Instalando… Se demorar, o antivírus pode estar conferindo o instalador: espere, não precisa clicar de novo."}
      </div>
      {baixando && <div className="ca-barra"><span style={{ width: `${progresso}%` }} /></div>}
      {!baixando && (
        <div className="ca-acoes">
          <button className="btn" onClick={() => setFechado(true)}>Agora não</button>
          <button className="btn primario" onClick={instalar}><Download size={14} /> Instalar</button>
        </div>
      )}
    </div>
  );
}

function abrirNotas() {
  const url = "https://github.com/dunebuddy/atelier/releases";
  import("@tauri-apps/plugin-opener").then((o) => o.openUrl(url)).catch(() => window.open(url, "_blank"));
}
