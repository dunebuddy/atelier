import { useEffect } from "react";
import { Keyboard, X } from "lucide-react";

const ATALHOS: [string, string][] = [
  ["Ctrl K", "Buscar ou ir para um item (vazio mostra os recentes)"],
  ["Ctrl N", "Novo item"],
  ["Ctrl ,", "Configurações"],
  ["Ctrl /", "Esta lista de atalhos"],
  ["Ctrl \\", "Mostrar ou esconder o menu lateral"],
  ["Ctrl `", "Novo terminal numa janela ao lado (a setinha do botão escolhe o tipo)"],
  ["Alt ← / Alt →", "Voltar / avançar na janela com o foco (também os botões laterais do mouse)"],
  ["Ctrl clique / clique do meio", "Num item (lista, árvore, relação): abre numa janela ao lado"],
  ["Ctrl W", "Fechar a janela com o foco"],
  ["Ctrl Tab / Ctrl Shift Tab", "Próxima / anterior janela da metade"],
  ["Ctrl Alt \\", "Dividir o painel em dois (de novo: juntar)"],
  ["Ctrl Alt O", "Trocar o foco de metade"],
  ["Ctrl Alt 1 / Ctrl Alt 2 / Ctrl Alt 3", "Modo da metade: abas / tile / fita"],
  ["Ctrl Alt ← / Ctrl Alt →", "Foco na janela anterior / seguinte"],
  ["Ctrl Alt Shift ← / Ctrl Alt Shift →", "Mover a janela para a esquerda / direita"],
  ["Ctrl Alt R", "Fita: próxima largura da coluna (1/2, 1/3, 1/4, 1/1)"],
  ["Ctrl Alt ↓ / Ctrl Alt ↑", "Fita: empilhar embaixo da anterior / tirar da coluna"],
  ["Ctrl Alt Enter", "Tile: a janela vira a principal"],
  ["Ctrl Z", "Desfazer a última mudança que mostrou \"Desfazer\""],
  ["Ctrl + / Ctrl − / Ctrl 0", "Aumentar, diminuir ou voltar o tamanho da letra"],
  ["Ctrl clique", "Abrir link, #código de item ou arquivo colado no texto"],
  ["/", "No texto: menu para inserir título, lista, tarefa, código, data…"],
  ["/prompt", "No texto do item: pede a um agente para escrever ali (ligue em Configurações → Integrações)"],
  ["#código", "No texto ou numa nota: cita outro item (vira link e aparece em \"Mencionado em\")"],
  ["Enter / Shift Enter", "Na anotação: anota / quebra linha"],
  ["Esc", "Fecha menus e janelas"],
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
          {ATALHOS.map(([k, o]) => (
            <div key={k} className="atalho">
              <span className="atalho-teclas">{k.split(" / ").map((t, i) => <kbd key={i}>{t}</kbd>)}</span>
              <span>{o}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
