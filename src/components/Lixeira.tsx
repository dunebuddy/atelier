import { useEffect, useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { api, Esquema, Item } from "../api";
import { avisar, falhou, Rota } from "../ui";
import { dataHora } from "../visao";

interface NotaApagada {
  id: number;
  texto: string;
  autor: string;
  criado_em: string;
  apagado_em: string;
  item_id: number;
  codigo: string;
  titulo: string;
}

/** Lixeira: nada é apagado de verdade até esvaziar. A pasta do item no disco nunca é apagada. */
export function Lixeira({ esquema, ir }: { esquema: Esquema; ir: (r: Rota) => void }) {
  const [dados, setDados] = useState<{ itens: Item[]; notas: NotaApagada[] } | null>(null);
  const [esvaziar, setEsvaziar] = useState(false);
  const [deVez, setDeVez] = useState<number | null>(null);

  const carregar = () => api.lixeira().then(setDados).catch(falhou);
  useEffect(() => { carregar(); }, []);
  if (!dados) return null;
  const vazia = !dados.itens.length && !dados.notas.length;

  return (
    <div className="vista" style={{ maxWidth: 980 }}>
      <div className="vista-cabeca">
        <span className="tipo-chip grande"><Trash2 size={22} /></span>
        <div style={{ flex: 1 }}>
          <h1>Lixeira</h1>
          <div className="vista-sub">
            Apagar no atelier manda para cá. Só some de verdade quando você esvazia. As pastas no disco nunca são apagadas.
          </div>
        </div>
        {!vazia && (
          <button
            className={`btn${esvaziar ? " perigo-ativo" : " perigo"}`}
            onClick={async () => {
              if (!esvaziar) { setEsvaziar(true); window.setTimeout(() => setEsvaziar(false), 4000); return; }
              try {
                const r = await api.esvaziarLixeira();
                avisar(`Lixeira esvaziada: ${r.itens} documentos e ${r.notas} notas apagados de vez.`);
                carregar();
              } catch (e) {
                falhou(e);
              }
            }}
          >
            <Trash2 size={14} /> {esvaziar ? "Clique de novo: apagar tudo de vez" : "Esvaziar lixeira"}
          </button>
        )}
      </div>

      {vazia && <div className="vazio-grande">A lixeira está vazia.</div>}

      {dados.itens.length > 0 && (
        <>
          <div className="secao-titulo" style={{ marginTop: 10 }}>Documentos</div>
          <div className="lista-compacta">
            {dados.itens.map((it) => {
              const t = esquema.tipos.find((x) => x.id === it.tipo_id);
              return (
                <div key={it.id} className="lc-linha" onClick={() => ir({ v: "item", id: it.id })}>
                  <span className="tipo-chip pequeno">{t?.icone ?? "·"}</span>
                  <span className="id-item">#{it.codigo}</span>
                  <span className="lc-titulo">{it.titulo || "Sem título"}</span>
                  <span className="data-hora">apagado {it.apagado_em ? dataHora(it.apagado_em) : ""}</span>
                  <button
                    className="btn"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await api.restaurarItem(it.id).catch(falhou);
                      avisar(`#${it.codigo} restaurado.`);
                      carregar();
                    }}
                  >
                    <RotateCcw size={13} /> Restaurar
                  </button>
                  <button
                    className={`btn${deVez === it.id ? " perigo-ativo" : " perigo"}`}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (deVez !== it.id) { setDeVez(it.id); window.setTimeout(() => setDeVez(null), 3000); return; }
                      await api.apagarDeVez(it.id).catch(falhou);
                      carregar();
                    }}
                  >
                    {deVez === it.id ? "Confirmar" : "Apagar de vez"}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {dados.notas.length > 0 && (
        <>
          <div className="secao-titulo">Anotações</div>
          <div className="lista-compacta">
            {dados.notas.map((n) => (
              <div key={n.id} className="lc-linha" onClick={() => ir({ v: "item", id: n.item_id })}>
                <span className="id-item">#{n.codigo}</span>
                <span className="lc-titulo" style={{ fontWeight: 400 }}>
                  <strong>{n.autor}:</strong> {n.texto}
                </span>
                <span className="data-hora">apagada {dataHora(n.apagado_em)}</span>
                <button
                  className="btn"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await api.restaurarNota(n.id).catch(falhou);
                    carregar();
                  }}
                >
                  <RotateCcw size={13} /> Restaurar
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
