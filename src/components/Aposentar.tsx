import { useEffect, useState } from "react";
import { api, AnaliseAposentar } from "../api";
import { avisar, falhou } from "../ui";

// Arquivar o workspace de um documento é aposentar a pasta dele (cold storage): compactar em <bancada>/aposentados/
// e tirar de itens/. Antes, mostra quanto ela ocupa e os arquivos grandes (> 5 MB), para o Paulo decidir quais
// mantém (entram no zip) e quais vão para a Lixeira. Sem pasta, arquiva direto.

export const tamanho = (b: number) => {
  const mb = b / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 10) return `${mb.toFixed(0)} MB`;
  if (mb >= 0.1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(b / 1024))} KB`;
};

export function AposentarWorkspace({ id, titulo, aoArquivar, aoFechar }: {
  id: number;
  titulo: string;
  /** arquivar o workspace (a pasta já foi aposentada, ou não havia pasta) */
  aoArquivar: () => void;
  aoFechar: () => void;
}) {
  const [a, setA] = useState<AnaliseAposentar | null>(null);
  const [remover, setRemover] = useState<Set<string>>(new Set());
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    api.analisarAposentar(id)
      .then((r) => {
        // sem pasta (ou já aposentada): só arquiva
        if (!r.pasta || !r.existe) { aoArquivar(); aoFechar(); return; }
        setA(r);
      })
      .catch((e) => { falhou(e); aoFechar(); });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!a) return null;
  const grandes = a.grandes ?? [];
  const tirar = grandes.filter((g) => remover.has(g.caminho)).reduce((s, g) => s + g.bytes, 0);
  const marcar = (c: string) => setRemover((r) => { const n = new Set(r); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  const confirmar = async () => {
    setIndo(true);
    try {
      const r = await api.aposentar(id, [...remover]);
      aoArquivar();
      aoFechar();
      if (r.aposentada) {
        const lixo = r.lixeira ? ` · ${r.lixeira} arquivo${r.lixeira > 1 ? "s" : ""} para a Lixeira` : "";
        avisar(`Pasta aposentada: ${tamanho(r.bytes ?? 0)} → ${tamanho(r.bytes_zip ?? 0)} em aposentados/${lixo}.${r.aviso ? " " + r.aviso : ""}`);
      }
    } catch (e) {
      setIndo(false);
      falhou(e);
    }
  };

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && !indo && aoFechar()}>
      <div className="modal confirmar-bancada aposentar" role="dialog" aria-label="Arquivar workspace">
        <h3>Arquivar “{titulo}”</h3>
        <p>
          A pasta do documento ({a.arquivos} arquivo{a.arquivos === 1 ? "" : "s"}, <strong>{tamanho(a.bytes ?? 0)}</strong>) vai ser
          compactada em <code>aposentados/</code> e sai de <code>itens/</code>. Reabrir o workspace traz ela de volta.
        </p>
        {grandes.length > 0 && (
          <>
            <p className="aposentar-aviso">
              {grandes.length === 1 ? "Um arquivo passa" : `${grandes.length} arquivos passam`} de {tamanho(a.limite ?? 5242880)}.
              Quer manter? Os marcados vão para a Lixeira em vez de entrar no zip.
            </p>
            <ul className="aposentar-grandes">
              {grandes.map((g) => (
                <li key={g.caminho}>
                  <label>
                    <input type="checkbox" checked={remover.has(g.caminho)} onChange={() => marcar(g.caminho)} disabled={indo} />
                    <span className="aposentar-nome" title={g.caminho}>{g.caminho}</span>
                    <span className="aposentar-tam">{tamanho(g.bytes)}</span>
                  </label>
                </li>
              ))}
            </ul>
            {remover.size > 0 && <p className="dica">Para a Lixeira: {remover.size} arquivo{remover.size > 1 ? "s" : ""}, {tamanho(tirar)}.</p>}
          </>
        )}
        <div className="ca-acoes">
          <button className="btn" onClick={aoFechar} disabled={indo}>Cancelar</button>
          <button className="btn primario" autoFocus onClick={confirmar} disabled={indo}>{indo ? "Compactando…" : "Arquivar e compactar"}</button>
        </div>
      </div>
    </div>
  );
}
