import { LayoutDashboard } from "lucide-react";
import { Esquema } from "../api";
import { abrirWorkspace } from "./Workspaces";

/**
 * "Abrir workspace": ao lado do abrir, em todo lugar onde um item aparece numa lista (aparece no hover).
 * É um span (com papel de botão) porque várias dessas linhas já são botões.
 */
export function BotaoWorkspace({ esquema, item, tam = 12, classe = "botao-ws", depois }: {
  esquema: Esquema;
  item: { id: number; titulo: string; tipo_id: number | null };
  tam?: number;
  classe?: string;
  /** ex.: fechar a busca rápida */
  depois?: () => void;
}) {
  const abrir = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
    abrirWorkspace({ id: item.id, titulo: item.titulo, icone: esquema.tipos.find((t) => t.id === item.tipo_id)?.icone });
    depois?.();
  };
  return (
    <span
      role="button"
      className={classe}
      title="Abrir o workspace deste item (as janelas, terminais e agentes dele)"
      onClick={abrir}
      onMouseDown={(e) => e.stopPropagation()}
      onAuxClick={(e) => e.stopPropagation()}
    >
      <LayoutDashboard size={tam} />
    </span>
  );
}
