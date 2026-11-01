// Se a janela está à vista. Abas de trás e workspaces escondidos continuam montados (o terminal não pode morrer), mas
// não precisam ficar relendo coisas nem ouvindo eventos de quem está na frente.
import { createContext, useContext, useEffect, useRef, useState } from "react";

/** Falso quando a janela é uma aba de trás, saiu da fita ou o workspace dela não é o ativo. Fora do painel: sempre sim. */
export const VisivelContext = createContext(true);

/** O app está na tela (não minimizado nem na bandeja). */
function useDocumentoVisivel() {
  const [v, setV] = useState(() => document.visibilityState !== "hidden");
  useEffect(() => {
    const f = () => setV(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  return v;
}

/** Esta janela está à vista e o app também: polling e ouvintes só agem quando for verdade. */
export function useVisivel() {
  const daJanela = useContext(VisivelContext);
  const doApp = useDocumentoVisivel();
  return daJanela && doApp;
}

/** Chama `f` quando volta a ficar visível (não na montagem), com quanto tempo ficou escondido. */
export function useAoReaparecer(visivel: boolean, f: (msEscondido: number) => void) {
  const fRef = useRef(f);
  fRef.current = f;
  const escondidoDesde = useRef<number | null>(visivel ? null : Date.now());
  useEffect(() => {
    if (!visivel) escondidoDesde.current ??= Date.now();
    else if (escondidoDesde.current != null) {
      const ms = Date.now() - escondidoDesde.current;
      escondidoDesde.current = null;
      fRef.current(ms);
    }
  }, [visivel]);
}
