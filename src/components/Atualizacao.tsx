import { useCallback, useEffect, useState } from "react";
import { Download, Sparkles, X } from "lucide-react";
import { Preferencias } from "../api";
import { avisar, falhou } from "../ui";
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

export function AvisoAtualizacao({ prefs }: { prefs: Preferencias | null }) {
  const [achada, setAchada] = useState<Achada | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [fechado, setFechado] = useState(false);

  const verificar = useCallback(async (manual: boolean) => {
    // a lista de modelos de ditado também mora no GitHub: modelo novo vira aviso
    procurarModelosNovos();
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

  if (!achada || fechado) return null;
  return (
    <div className="aviso-atualizacao">
      <Sparkles size={16} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>Tem versão nova do atelier: {achada.versao}</strong>
        <div className="dica-inline">
          {progresso === null ? "Quer instalar? O app reinicia sozinho no fim; seus dados ficam onde estão." : `Baixando… ${progresso}%`}
        </div>
      </div>
      {progresso === null && (
        <>
          <button className="btn" onClick={() => setFechado(true)}>Agora não</button>
          <button className="btn primario" onClick={() => { setProgresso(0); achada.instalar(setProgresso).catch((e) => { setProgresso(null); falhou(e); }); }}>
            <Download size={14} /> Instalar
          </button>
        </>
      )}
      {progresso === null && <button className="btn-icone" title="Fechar" onClick={() => setFechado(true)}><X size={14} /></button>}
    </div>
  );
}
