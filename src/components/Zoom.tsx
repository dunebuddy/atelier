import { useCallback, useEffect, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

// Zoom dos visualizadores (PDF e imagem): botões no canto e Ctrl+roda do mouse. 100% = caber na largura (PDF) ou
// na área (imagem); o ponto embaixo do mouse fica no lugar ao dar zoom com a roda.

const MIN = 0.25;
const MAX = 8;
const PASSOS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6, 8];

export interface Ancora { x: number; y: number; k: number }

export function useZoom(rolagem: React.RefObject<HTMLDivElement | null>) {
  const [zoom, setZoomBruto] = useState(1);
  // onde estava o mouse (na vista) e quanto o conteúdo cresceu: quem desenha chama manterAncora depois
  const ancora = useRef<Ancora | null>(null);
  const atual = useRef(1);

  const mudar = useCallback((novo: number, ponto?: { x: number; y: number }) => {
    const z = Math.min(MAX, Math.max(MIN, Math.round(novo * 100) / 100));
    if (z === atual.current) return;
    const el = rolagem.current;
    if (el) {
      const p = ponto ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 };
      ancora.current = { x: p.x, y: p.y, k: z / atual.current };
    }
    atual.current = z;
    setZoomBruto(z);
  }, [rolagem]);

  const passo = useCallback((dir: 1 | -1, ponto?: { x: number; y: number }) => {
    const z = atual.current;
    const prox = dir > 0 ? PASSOS.find((p) => p > z + 0.001) ?? MAX : [...PASSOS].reverse().find((p) => p < z - 0.001) ?? MIN;
    mudar(prox, ponto);
  }, [mudar]);

  /** Depois que o conteúdo mudou de tamanho: rola para o ponto do mouse continuar embaixo dele. */
  const manterAncora = useCallback(() => {
    const el = rolagem.current;
    const a = ancora.current;
    ancora.current = null;
    if (!el || !a) return;
    el.scrollLeft = (el.scrollLeft + a.x) * a.k - a.x;
    el.scrollTop = (el.scrollTop + a.y) * a.k - a.y;
  }, [rolagem]);

  // Ctrl+roda (e o pinçar do touchpad, que chega como Ctrl+roda): zoom aqui, não no app inteiro
  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const roda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      e.stopPropagation();
      const r = el.getBoundingClientRect();
      const ponto = { x: e.clientX - r.left, y: e.clientY - r.top };
      // touchpad manda passos pequenos: proporcional; roda de mouse: um degrau por clique
      if (Math.abs(e.deltaY) < 40) mudar(atual.current * Math.exp(-e.deltaY / 100), ponto);
      else passo(e.deltaY < 0 ? 1 : -1, ponto);
    };
    el.addEventListener("wheel", roda, { passive: false });
    return () => el.removeEventListener("wheel", roda);
  }, [rolagem, mudar, passo]);

  const barra = (
    <div className="zoom-barra" onMouseDown={(e) => e.stopPropagation()}>
      <button className="btn-icone" title="Diminuir (Ctrl+roda para baixo)" onClick={() => passo(-1)} disabled={zoom <= MIN}><Minus size={14} /></button>
      <button className="zoom-valor" title="Voltar a caber (100%)" onClick={() => mudar(1)}>{Math.round(zoom * 100)}%</button>
      <button className="btn-icone" title="Aumentar (Ctrl+roda para cima)" onClick={() => passo(1)} disabled={zoom >= MAX}><Plus size={14} /></button>
      <button className="btn-icone" title="Caber na área" onClick={() => mudar(1)} disabled={zoom === 1}><Maximize2 size={13} /></button>
    </div>
  );
  return { zoom, barra, manterAncora };
}

/** Imagem com zoom: começa cabendo na área; Ctrl+roda ou os botões aumentam, e a área rola. */
export function ImagemComZoom({ src, nome, aoClicar }: { src: string; nome: string; aoClicar?: () => void }) {
  const rolagem = useRef<HTMLDivElement>(null);
  const { zoom, barra, manterAncora } = useZoom(rolagem);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [area, setArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setArea({ w: el.clientWidth - 32, h: el.clientHeight - 32 }));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const caber = nat && area.w > 0 ? Math.min(1, area.w / nat.w, area.h / nat.h) : 1;
  const largura = nat ? nat.w * caber * zoom : undefined;
  useEffect(() => { manterAncora(); }, [zoom, manterAncora]);
  return (
    <div className="zoom-caixa">
      <div ref={rolagem} className="zoom-rolagem zoom-imagem">
        <img src={src} alt={nome} draggable={false}
          onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={largura ? { width: largura, height: "auto", cursor: aoClicar ? "zoom-in" : undefined } : { maxWidth: "100%" }}
          title={aoClicar ? "Clique para ver em tela cheia (Ctrl+roda dá zoom aqui)" : undefined}
          onClick={aoClicar} />
      </div>
      {barra}
    </div>
  );
}
