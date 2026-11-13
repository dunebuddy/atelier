// O selo do Ctrl+K: aparece enquanto o atelier espera a segunda tecla, com o que dá para apertar.
import { useEffect, useState } from "react";
import { comDoisTempos, instalarDoisTempos, PREFIXO } from "../atalhos";

let instalado = false;

export function SeloDoisTempos() {
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    if (!instalado) { instalado = true; instalarDoisTempos(); }
    const f = (e: Event) => setAtivo((e as CustomEvent<boolean>).detail);
    window.addEventListener("atelier:dois-tempos", f);
    return () => window.removeEventListener("atelier:dois-tempos", f);
  }, []);
  if (!ativo) return null;
  return (
    <div className="selo-dois-tempos" role="status">
      <div className="sdt-topo"><kbd>{PREFIXO.replace("+", " ")}</kbd> esperando a segunda tecla… <span className="sdt-dica">Esc cancela</span></div>
      <div className="sdt-lista">
        {comDoisTempos().map((a) => (
          <span key={a.id} className="sdt-item"><kbd>{a.dois}</kbd> {a.nome}</span>
        ))}
      </div>
    </div>
  );
}
