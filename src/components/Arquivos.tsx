import { useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { api, Item } from "../api";
import { avisar, falhou } from "../ui";
import { useAoReaparecer, useVisivel } from "../visivel";
import { RamoPasta } from "./Explorador";

/** Copia caminhos para a pasta do item (cria a pasta no padrão se faltar). */
export async function trazerArquivos(item: Item, caminhos: string[], destino = "insumos"): Promise<string[]> {
  if (!caminhos.length) return [];
  const r = await api.trazerArquivos(item.id, caminhos, destino);
  avisar(`Copiado para ${destino}/: ${r.copiados.join(", ")}`);
  // os nomes como ficaram (um repetido ganha sufixo), relativos à pasta do documento
  return r.copiados.map((n) => `${destino}/${n}`);
}

/** Arquivos da pasta do item, com "Adicionar…" (escolher no sistema). Arrastar sobre a página também funciona. */
export function Arquivos({ item, recarga, aoMudar }: { item: Item; recarga: number; aoMudar: () => void }) {
  // o agente grava arquivos enquanto você olha: relê de tempos em tempos (só com a página à vista), ao voltar e no botão
  const [releitura, setReleitura] = useState(0);
  const visivel = useVisivel();
  useEffect(() => {
    if (!visivel || !item.pasta) return;
    const t = window.setInterval(() => setReleitura((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, [visivel, item.pasta]);
  useAoReaparecer(visivel, () => setReleitura((n) => n + 1));
  const titulo = `#${item.codigo} ${item.titulo || "Sem título"}`;

  const adicionar = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const r = await open({ multiple: true });
      const caminhos = Array.isArray(r) ? r : typeof r === "string" ? [r] : [];
      await trazerArquivos(item, caminhos);
      aoMudar();
    } catch (e) {
      falhou(e);
    }
  };

  return (
    <div className="arquivos">
      <div className="ficha-titulo" style={{ display: "flex", alignItems: "center" }}>
        <span style={{ flex: 1 }}>Arquivos</span>
        {item.pasta && <button className="mini-acao" title="Reler a pasta" onClick={() => setReleitura((n) => n + 1)}><RefreshCw size={12} /></button>}
        <button className="mini-acao" title="Adicionar arquivos (vão para insumos/)" onClick={adicionar}><Plus size={13} /></button>
      </div>
      {item.pasta ? (
        <div className="ex-arvore arquivos-arvore">
          <RamoPasta
            raiz={item.pasta}
            dir={item.pasta}
            nivel={0}
            recarga={recarga + releitura}
            titulo={titulo}
            abertasAntes={["insumos", "artefatos", "rascunho"]}
            esconder={["CLAUDE.md"]}
            vazio={<div className="rel-vazio">Arraste arquivos para esta página: eles vão para <code>insumos/</code>.</div>}
          />
        </div>
      ) : (
        <div className="rel-vazio">Arraste arquivos para esta página: eles vão para <code>insumos/</code>.</div>
      )}
    </div>
  );
}
