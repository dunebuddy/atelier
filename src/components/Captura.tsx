import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Inbox } from "lucide-react";
import { api, Preferencias } from "../api";
import { avisar, falhou } from "../ui";

async function janela() {
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow();
  } catch {
    return null;
  }
}

/**
 * Captura global: com a preferência ligada, registra o atalho do sistema; ele (ou o "Capturar…" da bandeja) traz a
 * janela para a frente com a caixinha "o que chegou?". O que for digitado vira item sem tipo (caixa de entrada).
 */
export function CapturaGlobal({ prefs }: { prefs: Preferencias | null }) {
  const [aberta, setAberta] = useState(false);
  const [texto, setTexto] = useState("");
  const campo = useRef<HTMLInputElement>(null);

  // atalho do sistema
  useEffect(() => {
    if (!prefs) return;
    const { ativo, atalho } = prefs.captura;
    let registrado: string | null = null;
    (async () => {
      try {
        const gs = await import("@tauri-apps/plugin-global-shortcut");
        if (ativo && atalho.trim()) {
          await gs.register(atalho, async (ev) => {
            if (ev.state !== "Pressed") return;
            const w = await janela();
            await w?.show();
            await w?.unminimize();
            await w?.setFocus();
            setAberta(true);
          });
          registrado = atalho;
        }
      } catch (e) {
        if (ativo) falhou(`Não consegui registrar o atalho "${atalho}": ${e}`);
      }
    })();
    return () => {
      if (registrado) import("@tauri-apps/plugin-global-shortcut").then((gs) => gs.unregister(registrado!)).catch(() => {});
    };
  }, [prefs?.captura.ativo, prefs?.captura.atalho]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Capturar…" da bandeja
  useEffect(() => {
    let solta: (() => void) | undefined;
    import("@tauri-apps/api/event")
      .then(({ listen }) => listen("atelier:capturar", () => setAberta(true)))
      .then((f) => { solta = f; })
      .catch(() => {});
    return () => solta?.();
  }, []);

  useEffect(() => {
    if (aberta) setTimeout(() => campo.current?.focus(), 30);
  }, [aberta]);

  if (!aberta) return null;

  const enviar = async () => {
    const t = texto.trim();
    if (!t) return;
    try {
      const it = await api.criarItem({ titulo: t, tipo_id: null, modelo_id: null });
      avisar(`Anotado na caixa de entrada: #${it.codigo}`);
      setTexto("");
      setAberta(false);
    } catch (e) {
      falhou(e);
    }
  };

  return (
    <div className="modal-fundo topo" onMouseDown={(e) => e.target === e.currentTarget && setAberta(false)}>
      <div className="busca-rapida captura-global">
        <div className="br-campo">
          <Inbox size={18} />
          <input
            ref={campo}
            placeholder="O que chegou? Enter guarda na caixa de entrada"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") enviar();
              if (e.key === "Escape") setAberta(false);
            }}
          />
          <kbd><CornerDownLeft size={11} /></kbd>
        </div>
      </div>
    </div>
  );
}
