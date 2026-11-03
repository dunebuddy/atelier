// A estrela do favorito: campo fixo de todo documento. Clicar marca ou desmarca (não conta como mudança do documento).
import { Star } from "lucide-react";
import { api } from "../api";
import { falhou } from "../ui";

export function Estrela({ item, aoMudar, tam = 14, classe = "" }: {
  item: { id: number; favorito?: boolean };
  aoMudar: (favorito: boolean) => void;
  tam?: number;
  classe?: string;
}) {
  const f = !!item.favorito;
  return (
    <button
      className={`estrela${f ? " marcada" : ""} ${classe}`}
      title={f ? "Favorito (clique para tirar)" : "Marcar como favorito"}
      onClick={async (e) => {
        e.stopPropagation();
        aoMudar(!f);
        try {
          await api.atualizarItem(item.id, { favorito: !f });
          window.dispatchEvent(new Event("atelier:favoritos"));
        } catch (erro) {
          aoMudar(f);
          falhou(erro);
        }
      }}
    >
      <Star size={tam} fill={f ? "currentColor" : "none"} />
    </button>
  );
}
