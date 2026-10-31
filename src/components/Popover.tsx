import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Caixinha flutuante ancorada num elemento. Fecha com clique fora ou Esc. */
export function Popover({
  ancora,
  aoFechar,
  children,
  largura,
}: {
  ancora: HTMLElement | null;
  aoFechar: () => void;
  children: ReactNode;
  largura?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!ancora || !ref.current) return;
    const a = ancora.getBoundingClientRect();
    const p = ref.current.getBoundingClientRect();
    let top = a.bottom + 4;
    let left = a.left;
    if (top + p.height > window.innerHeight - 8) top = Math.max(8, a.top - p.height - 4);
    if (left + p.width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - p.width - 8);
    setPos({ top, left });
  }, [ancora]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !ancora?.contains(e.target as Node)) aoFechar();
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [ancora, aoFechar]);

  return createPortal(
    <div
      ref={ref}
      className="popover"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: largura }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Estado de popover pronto: `abrir(e)` no clique, `<Popover>` quando `ancora` existir. */
export function usePopover() {
  const [ancora, setAncora] = useState<HTMLElement | null>(null);
  return {
    ancora,
    abrir: (e: { currentTarget: HTMLElement }) => setAncora(e.currentTarget),
    fechar: () => setAncora(null),
  };
}
