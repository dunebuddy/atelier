// A marca do app: o carimbo hanko em "A", pintado com as cores do tema aberto
// (variáveis --marca-* em styles.css; fallbacks do Nord).

export function Marca() {
  return (
    <svg className="marca" viewBox="0 0 1024 1024" width={22} height={22} role="img" aria-label="atelier">
      <rect x="32" y="32" width="960" height="960" rx="220" fill="var(--marca-fundo, #2E3440)" />
      <rect
        x="150" y="150" width="724" height="724" rx="120" fill="none"
        stroke="var(--marca-moldura, #88C0D0)" strokeWidth="40"
      />
      <path
        d="M360 330 H664 M420 330 L320 720 M604 330 L704 720"
        stroke="var(--marca-letra, #ECEFF4)" strokeWidth="72"
        strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
      <path d="M379 560 H645" stroke="var(--marca-travessa, #ECEFF4)" strokeWidth="72" strokeLinecap="round" />
    </svg>
  );
}
