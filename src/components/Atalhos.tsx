import { useEffect } from "react";
import { Keyboard, X } from "lucide-react";
import { ATALHOS, combinacao, partes } from "../atalhos";

// os que não se configuram (dependem de onde se está)
const FIXOS: [string, string][] = [
  ["Ctrl Z", "Desfazer a última mudança que mostrou \"Desfazer\""],
  ["Ctrl clique / clique do meio", "Num documento (lista, árvore, relação): abre numa janela ao lado"],
  ["Ctrl clique", "Abrir link, #código de documento ou arquivo colado no texto"],
  ["/", "No texto: menu para inserir título, lista, tarefa, código, data…"],
  ["/prompt", "No texto do documento: pede a um agente para escrever ali (ligue em Configurações → Integrações)"],
  ["#código", "No texto ou numa nota: cita outro documento (vira link e aparece em \"Mencionado em\")"],
  ["Enter / Shift Enter", "Na anotação: anota / quebra linha"],
  ["Esc", "Fecha menus e janelas"],
  ["Ctrl K", "Atalho em dois tempos: aperte Ctrl+K, solte, e a segunda tecla (a lista aparece embaixo). Fora do terminal"],
];

export function Atalhos({ aoFechar }: { aoFechar: () => void }) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [aoFechar]);
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal atalhos">
        <div className="atalhos-cabeca">
          <Keyboard size={18} /> <h3 className="serif">Atalhos</h3>
          <button className="btn-icone" onClick={aoFechar} title="Fechar (Esc)"><X size={17} /></button>
        </div>
        <div className="atalhos-lista">
          {ATALHOS.map((a) => (
            <div key={a.id} className="atalho">
              <span className="atalho-teclas">
                {partes(combinacao(a.id)).map((t, i) => <kbd key={i}>{t}</kbd>)}
                {a.dois && <span className="atalho-ou" title="Em dois tempos: Ctrl+K, solta, e a outra tecla"> ou <kbd>Ctrl K</kbd> <kbd>{a.dois}</kbd></span>}
              </span>
              <span>{a.nome}</span>
            </div>
          ))}
          {FIXOS.map(([k, o]) => (
            <div key={k} className="atalho">
              <span className="atalho-teclas">{k.split(" / ").map((t, i) => <kbd key={i}>{t}</kbd>)}</span>
              <span>{o}</span>
            </div>
          ))}
          <div className="dica" style={{ marginTop: 10 }}>Para mudar: Configurações → Atalhos.</div>
        </div>
      </div>
    </div>
  );
}
