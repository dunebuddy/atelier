// Visualizador de imagem em tela cheia: abre por cima de tudo, já encaixado no maior tamanho que cabe; roda do mouse
// amplia em volta do ponteiro, arrastar move, duplo clique alterna encaixar ↔ 100%; Esc, clique fora ou × fecham;
// ← → passam pelas outras imagens do mesmo lugar. Quem quiser abrir chama `verImagem` (ou o evento "atelier:ver-imagem").
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, FolderOpen, Maximize, Minus, Plus, X } from "lucide-react";
import { api } from "../api";
import { falhou } from "../ui";

export interface ImagemVista { src: string; nome?: string }

/** Abre o visualizador com `lista` (a `i`-ésima à vista). */
export function verImagem(lista: ImagemVista[], i = 0) {
  if (!lista.length) return;
  window.dispatchEvent(new CustomEvent("atelier:ver-imagem", { detail: { lista, i } }));
}

/** O arquivo por trás de uma imagem servida pela API (`/arquivo?caminho=...`), para abrir no programa padrão. */
function caminhoDe(src: string): string | null {
  try {
    const u = new URL(src, window.location.href);
    return u.pathname.endsWith("/arquivo") ? u.searchParams.get("caminho") : null;
  } catch {
    return null;
  }
}

const nomeDe = (v: ImagemVista) => v.nome || decodeURIComponent((caminhoDe(v.src) ?? v.src).split(/[\\/?#]/).filter(Boolean).pop() ?? "imagem");
// imagem pequena cresce até encaixar, mas não além disso (senão vira borrão)
const AMPLIAR_NO_MAXIMO = 4;

export function VisualizadorDeImagem() {
  const [lista, setLista] = useState<ImagemVista[] | null>(null);
  const [i, setI] = useState(0);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  // escala e deslocamento do centro da imagem em relação ao centro da tela
  const [vista, setVista] = useState({ s: 1, x: 0, y: 0 });
  const palco = useRef<HTMLDivElement>(null);
  const focoAntes = useRef<Element | null>(null);
  const arrasto = useRef<{ x: number; y: number; vx: number; vy: number; andou: boolean } | null>(null);

  const atual = lista?.[i];
  const area = () => {
    const r = palco.current?.getBoundingClientRect();
    return { w: (r?.width ?? window.innerWidth) - 48, h: (r?.height ?? window.innerHeight) - 48 };
  };
  const encaixe = useCallback(() => {
    if (!nat) return 1;
    const a = area();
    return Math.min(a.w / nat.w, a.h / nat.h, AMPLIAR_NO_MAXIMO);
  }, [nat]);
  const encaixar = useCallback(() => setVista({ s: encaixe(), x: 0, y: 0 }), [encaixe]);

  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ lista: ImagemVista[]; i: number }>).detail;
      focoAntes.current = document.activeElement;
      setLista(d.lista);
      setI(Math.max(0, Math.min(d.i, d.lista.length - 1)));
      setNat(null);
    };
    window.addEventListener("atelier:ver-imagem", f);
    return () => window.removeEventListener("atelier:ver-imagem", f);
  }, []);

  // trocou de imagem: espera o tamanho de verdade e encaixa
  useEffect(() => { if (nat) encaixar(); }, [nat, encaixar]);

  const fechar = useCallback(() => {
    setLista(null);
    setNat(null);
    (focoAntes.current as HTMLElement | null)?.focus?.();
  }, []);
  const passar = useCallback((n: number) => {
    if (!lista || lista.length < 2) return;
    setI((x) => (x + n + lista.length) % lista.length);
    setNat(null);
  }, [lista]);
  // zoom em volta de um ponto da tela (o ponteiro); sem ponto, o centro
  const zoom = useCallback((fator: number, px?: number, py?: number) => {
    setVista((v) => {
      const s = Math.max(0.05, Math.min(40, v.s * fator));
      const r = palco.current?.getBoundingClientRect();
      if (px == null || py == null || !r) return { ...v, s };
      const cx = px - (r.left + r.width / 2), cy = py - (r.top + r.height / 2);
      const k = s / v.s;
      return { s, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
    });
  }, []);

  // as teclas ficam com o visualizador enquanto ele está aberto (o app não vê: nada de zoom do app nem Ctrl+W)
  useEffect(() => {
    if (!lista) return;
    const f = (e: KeyboardEvent) => {
      const k = e.key;
      let feito = true;
      if (k === "Escape") fechar();
      else if (k === "ArrowLeft") passar(-1);
      else if (k === "ArrowRight") passar(1);
      else if (k === "+" || k === "=" ) zoom(1.25);
      else if (k === "-" || k === "_") zoom(0.8);
      else if (k === "0") encaixar();
      else if (k === "1") setVista({ s: 1, x: 0, y: 0 });
      else feito = false;
      if (feito || e.ctrlKey) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("keydown", f, true);
    return () => window.removeEventListener("keydown", f, true);
  }, [lista, fechar, passar, zoom, encaixar]);

  if (!lista || !atual) return null;
  const caminho = caminhoDe(atual.src);
  const pct = Math.round(vista.s * 100);

  return (
    <div className="ver-imagem" role="dialog" aria-label="Imagem">
      <div
        className="ver-imagem-palco"
        ref={palco}
        onWheel={(e) => zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY)}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          arrasto.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y, andou: false };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const a = arrasto.current;
          if (!a) return;
          const dx = e.clientX - a.x, dy = e.clientY - a.y;
          if (!a.andou && Math.hypot(dx, dy) < 4) return;
          a.andou = true;
          setVista((v) => ({ ...v, x: a.vx + dx, y: a.vy + dy }));
        }}
        onPointerUp={(e) => {
          const a = arrasto.current;
          arrasto.current = null;
          // clique (sem arrastar) fora da imagem fecha
          if (a && !a.andou && !(e.target as HTMLElement).closest("img")) fechar();
        }}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest("img")) return;
          if (Math.abs(vista.s - encaixe()) < 0.01) zoom(1 / vista.s, e.clientX, e.clientY);
          else encaixar();
        }}
      >
        <img
          key={atual.src}
          src={atual.src}
          alt={nomeDe(atual)}
          draggable={false}
          onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })}
          style={{
            width: nat ? nat.w * vista.s : undefined, height: nat ? nat.h * vista.s : undefined,
            transform: `translate(calc(-50% + ${vista.x}px), calc(-50% + ${vista.y}px))`, visibility: nat ? "visible" : "hidden",
          }}
        />
      </div>
      {lista.length > 1 && (
        <>
          <button className="ver-imagem-seta esq" title="Anterior (←)" onClick={() => passar(-1)}><ChevronLeft size={26} /></button>
          <button className="ver-imagem-seta dir" title="Próxima (→)" onClick={() => passar(1)}><ChevronRight size={26} /></button>
        </>
      )}
      <button className="ver-imagem-fechar" title="Fechar (Esc)" onClick={fechar}><X size={20} /></button>
      <div className="ver-imagem-barra">
        <span className="ver-imagem-nome" title={caminho ?? atual.src}>{nomeDe(atual)}</span>
        {nat && <span className="ver-imagem-info">{nat.w} × {nat.h}</span>}
        {lista.length > 1 && <span className="ver-imagem-info">{i + 1} de {lista.length}</span>}
        <span className="espaco" />
        <button title="Diminuir (−)" onClick={() => zoom(0.8)}><Minus size={15} /></button>
        <button className="ver-imagem-pct" title="Tamanho real (1)" onClick={() => setVista({ s: 1, x: 0, y: 0 })}>{pct}%</button>
        <button title="Aumentar (+)" onClick={() => zoom(1.25)}><Plus size={15} /></button>
        <button title="Encaixar na tela (0)" onClick={encaixar}><Maximize size={15} /></button>
        {caminho && (
          <>
            <button title="Abrir no programa padrão" onClick={() => api.abrirArquivo(caminho).catch(falhou)}><ExternalLink size={15} /></button>
            <button title="Mostrar na pasta" onClick={() => api.abrirPasta(caminho.replace(/[\\/][^\\/]*$/, ""), "arquivos").catch(falhou)}><FolderOpen size={15} /></button>
          </>
        )}
      </div>
    </div>
  );
}
