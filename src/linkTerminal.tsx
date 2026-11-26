import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { guardar, ler } from "./ui";
import { abrirNoNavegador } from "./components/Site";

// Ctrl+clique num link do terminal (os que o programa marca, como o Claude Code faz). O xterm, sozinho, perguntava
// com o confirm do navegador a cada clique; aqui a pergunta é do atelier, com "não perguntar mais", e a escolha fica
// em Configurações → Terminal.

export const perguntarLink = (): boolean => ler<boolean>("terminal.perguntarLink", true);
export function mudarPerguntarLink(v: boolean) {
  guardar("terminal.perguntarLink", v);
  window.dispatchEvent(new Event("atelier:perguntar-link"));
}

export function abrirLinkDoTerminal(uri: string) {
  if (!perguntarLink()) { abrirNoNavegador(uri); return; }
  const caixa = document.createElement("div");
  document.body.appendChild(caixa);
  const raiz = createRoot(caixa);
  const fechar = () => { raiz.unmount(); caixa.remove(); };
  raiz.render(<Pergunta uri={uri} fechar={fechar} />);
}

function Pergunta({ uri, fechar }: { uri: string; fechar: () => void }) {
  const abrir = (nuncaMais: boolean) => {
    if (nuncaMais) mudarPerguntarLink(false);
    abrirNoNavegador(uri);
    fechar();
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); fechar(); }
      if (e.key === "Enter") { e.stopPropagation(); e.preventDefault(); abrir(false); }
    };
    window.addEventListener("keydown", f, true);
    return () => window.removeEventListener("keydown", f, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <div className="modal" style={{ width: 520, maxWidth: "calc(100vw - 32px)", height: "auto", minHeight: 0, padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>Abrir este link no navegador?</h3>
        <p style={{ fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 12.5, wordBreak: "break-all", margin: "8px 0 16px" }}>{uri}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="btn" onClick={fechar}>Cancelar</button>
          <button className="btn" onClick={() => abrir(true)} title="Volta a perguntar em Configurações → Terminal">Abrir e não perguntar mais</button>
          <button className="btn primario" onClick={() => abrir(false)} autoFocus>Abrir</button>
        </div>
      </div>
    </div>
  );
}
