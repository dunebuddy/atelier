import { useEffect, useState } from "react";
import { File, Folder, Plus } from "lucide-react";
import { api, Arquivo, Item } from "../api";
import { avisar, falhou } from "../ui";
import { dataHora } from "../visao";
import { abrirExplorador } from "./Explorador";

const GRUPOS: { id: string; nome: string }[] = [
  { id: "insumos", nome: "Insumos (entrada)" },
  { id: "artefatos", nome: "Artefatos (saída)" },
  { id: "rascunho", nome: "Rascunho" },
  { id: "raiz", nome: "Soltos na pasta" },
];

function tamanho(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/** Copia caminhos para a pasta do item (cria a pasta no padrão se faltar). */
export async function trazerArquivos(item: Item, caminhos: string[], destino = "insumos") {
  if (!caminhos.length) return;
  const r = await api.trazerArquivos(item.id, caminhos, destino);
  avisar(`Copiado para ${destino}/: ${r.copiados.join(", ")}`);
}

/** Arquivos da pasta do item, com "Adicionar…" (escolher no sistema). Arrastar sobre a página também funciona. */
export function Arquivos({ item, recarga, aoMudar }: { item: Item; recarga: number; aoMudar: () => void }) {
  const [lista, setLista] = useState<Arquivo[]>([]);

  useEffect(() => {
    if (!item.pasta) { setLista([]); return; }
    api.arquivos(item.id).then(setLista).catch(() => setLista([]));
  }, [item.id, item.pasta, recarga]);

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
        <button className="mini-acao" title="Adicionar arquivos (vão para insumos/)" onClick={adicionar}><Plus size={13} /></button>
      </div>
      {lista.length === 0 && <div className="rel-vazio">Arraste arquivos para esta página: eles vão para <code>insumos/</code>.</div>}
      {GRUPOS.map((g) => {
        const doGrupo = lista.filter((a) => a.grupo === g.id);
        if (!doGrupo.length) return null;
        return (
          <div key={g.id} className="rel-grupo">
            <div className="rel-rotulo">{g.nome}</div>
            {doGrupo.map((a) => (
              <button
                key={a.caminho}
                className="arquivo"
                title={`${a.caminho}${a.modificado ? `\nmodificado ${dataHora(a.modificado)}` : ""}`}
                onClick={() => item.pasta && abrirExplorador(item.pasta, a.pasta ? undefined : a.caminho, `#${item.codigo}`)}
              >
                {a.pasta ? <Folder size={13} /> : <File size={13} />}
                <span className="arquivo-nome">{a.nome}</span>
                {!a.pasta && <span className="arquivo-tam">{tamanho(a.tamanho)}</span>}
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
