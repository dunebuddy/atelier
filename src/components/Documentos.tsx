import { ReactNode, useEffect, useState } from "react";
import type { WorkBook } from "xlsx";

/** Até quantas linhas e colunas a planilha mostra (mais que isso trava a janela; o resto, no programa dela). */
const MAX_LINHAS = 2000;
const MAX_COLUNAS = 200;

/**
 * Planilha (xlsx, xls, ods; ou CSV/TSV já lido como texto) mostrada como tabela, com abas quando há mais de uma.
 * Só leitura: para mexer, abra no programa dela.
 */
export function Planilha({ url, texto }: { url?: string; texto?: string }) {
  const [livro, setLivro] = useState<{ xlsx: typeof import("xlsx"); wb: WorkBook } | null>(null);
  const [aba, setAba] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const xlsx = await import("xlsx");
        const wb = texto != null
          ? xlsx.read(texto, { type: "string", raw: true })
          : xlsx.read(await fetch(url!, { cache: "no-store" }).then((r) => r.arrayBuffer()), { type: "array", dateNF: "dd/mm/yyyy" });
        if (!cancelado) { setLivro({ xlsx, wb }); setErro(null); }
      } catch (e) {
        if (!cancelado) setErro(String(e));
      }
    })();
    return () => { cancelado = true; };
  }, [url, texto]);

  if (erro) return <div className="vazio-grande">Não consegui ler a planilha ({erro}).</div>;
  if (!livro) return <div className="vazio-grande">Abrindo…</div>;
  const { xlsx, wb } = livro;
  const nomes = wb.SheetNames;
  const i = Math.min(aba, nomes.length - 1);
  const ws = wb.Sheets[nomes[i]];

  let corpo: ReactNode;
  if (!ws || !ws["!ref"]) {
    corpo = <div className="vazio-grande">Planilha vazia.</div>;
  } else {
    const faixa = xlsx.utils.decode_range(ws["!ref"]);
    const totalLinhas = faixa.e.r - faixa.s.r + 1;
    const totalColunas = faixa.e.c - faixa.s.c + 1;
    const corte = {
      s: faixa.s,
      e: { r: Math.min(faixa.e.r, faixa.s.r + MAX_LINHAS - 1), c: Math.min(faixa.e.c, faixa.s.c + MAX_COLUNAS - 1) },
    };
    const linhas = xlsx.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "", blankrows: true, range: corte });
    const colunas = Array.from({ length: corte.e.c - corte.s.c + 1 }, (_, k) => xlsx.utils.encode_col(corte.s.c + k));
    const cortou = totalLinhas > MAX_LINHAS || totalColunas > MAX_COLUNAS;
    corpo = (
      <>
        {cortou && (
          <div className="doc-aviso">
            A planilha tem {totalLinhas.toLocaleString("pt-BR")} linhas e {totalColunas} colunas; aqui aparecem
            {" "}{Math.min(totalLinhas, MAX_LINHAS).toLocaleString("pt-BR")} × {Math.min(totalColunas, MAX_COLUNAS)}. O resto, no programa dela.
          </div>
        )}
        <div className="doc-tabela-caixa">
          <table className="doc-tabela">
            <thead>
              <tr><th className="doc-canto" />{colunas.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {linhas.map((l, r) => (
                <tr key={r}>
                  <th>{corte.s.r + r + 1}</th>
                  {colunas.map((_, c) => <td key={c}>{l[c] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  return (
    <div className="doc-planilha">
      {corpo}
      {nomes.length > 1 && (
        <div className="doc-abas">
          {nomes.map((n, k) => (
            <button key={n} className={k === i ? "ativa" : ""} onClick={() => setAba(k)}>{n}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Documento do Word (.docx) convertido para HTML pelo mammoth, numa folha branca isolada (sem script). */
export function DocumentoWord({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const mammoth = await import("mammoth");
        const arrayBuffer = await fetch(url, { cache: "no-store" }).then((r) => r.arrayBuffer());
        const r = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelado) { setHtml(r.value); setErro(null); }
      } catch (e) {
        if (!cancelado) setErro(String(e));
      }
    })();
    return () => { cancelado = true; };
  }, [url]);

  if (erro) return <div className="vazio-grande">Não consegui ler o documento ({erro}).</div>;
  if (html == null) return <div className="vazio-grande">Abrindo…</div>;
  const fundo = getComputedStyle(document.documentElement).getPropertyValue("--bg-fundo").trim() || "#eee";
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    body{margin:0;padding:20px 12px 40px;background:${fundo}}
    .folha{max-width:780px;margin:0 auto;background:#fff;color:#1f1f1f;padding:48px 56px;box-shadow:0 1px 4px rgba(0,0,0,.18);
      border-radius:3px;font:14.5px/1.6 Calibri,"Segoe UI",system-ui,sans-serif;overflow-wrap:break-word}
    h1,h2,h3,h4{line-height:1.25;margin:1.1em 0 .4em} h1{font-size:24px} h2{font-size:20px} h3{font-size:17px}
    p{margin:0 0 .7em} a{color:#1a5fb4} img{max-width:100%;height:auto}
    table{border-collapse:collapse;margin:.6em 0} td,th{border:1px solid #bbb;padding:4px 8px;vertical-align:top}
    td p,th p{margin:0}
  </style></head><body><div class="folha">${html || "<p><em>Documento sem texto.</em></p>"}</div></body></html>`;
  return <iframe className="ex-moldura" sandbox="allow-popups" srcDoc={doc} title="Documento" />;
}
