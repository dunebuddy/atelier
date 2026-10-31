import { useEffect, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import { api, Versao } from "../api";
import { avisar, falhou } from "../ui";
import { dataHora } from "../visao";

/** Versões anteriores de um texto (corpo do item ou nota), com prévia e restaurar. */
export function Historico({
  alvo, id, atual, aoFechar, aoRestaurar,
}: {
  alvo: "item" | "nota";
  id: number;
  atual: string;
  aoFechar: () => void;
  aoRestaurar: () => void;
}) {
  const [versoes, setVersoes] = useState<Versao[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    (alvo === "item" ? api.versoesItem(id) : api.versoesNota(id)).then((v) => { setVersoes(v); setSel(v[0]?.id ?? null); }).catch(falhou);
  }, [alvo, id]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [aoFechar]);

  const escolhida = versoes?.find((v) => v.id === sel);

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal historico">
        <nav className="config-nav">
          <div className="config-nav-titulo"><History size={12} /> Versões</div>
          <button className={sel === null ? "ativo" : ""} onClick={() => setSel(null)}>
            <span className="hv-rotulo">Atual</span>
          </button>
          {versoes?.map((v) => (
            <button key={v.id} className={sel === v.id ? "ativo" : ""} onClick={() => setSel(v.id)}>
              <span className="hv-rotulo">{dataHora(v.criado_em)}</span>
              <span className="hv-autor">substituída por {v.autor}</span>
            </button>
          ))}
          {versoes && versoes.length === 0 && <div className="agente-nota" style={{ padding: 8 }}>Ainda não há versões anteriores.</div>}
        </nav>
        <section className="config-corpo">
          <button className="btn-icone fechar" onClick={aoFechar} title="Fechar (Esc)"><X size={17} /></button>
          <h3>{escolhida ? `Como estava antes de ${dataHora(escolhida.criado_em)}` : "Texto atual"}</h3>
          <p className="dica">
            Uma versão é guardada cada vez que alguém volta a editar depois de uma pausa. Restaurar não perde nada: o
            texto atual também vira versão.
          </p>
          <pre className="hv-previa">{escolhida ? escolhida.conteudo : atual || "(vazio)"}</pre>
          {escolhida && (
            <button
              className="btn primario"
              onClick={async () => {
                try {
                  await api.restaurarVersao(escolhida.id);
                  avisar("Versão restaurada.");
                  aoRestaurar();
                  aoFechar();
                } catch (e) {
                  falhou(e);
                }
              }}
            >
              <RotateCcw size={14} /> Restaurar esta versão
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
