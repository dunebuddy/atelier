import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowUp, ChevronDown, ChevronRight, Code2, Eye, File, FileText, Film, Folder, FolderOpen, Image, Music, Pencil, RefreshCw, Save,
} from "lucide-react";
import { marked } from "marked";
import { api, BASE, Entrada } from "../api";
import { abrir, avisar, falhou } from "../ui";
import { dataHora } from "../visao";
import { MenuPasta } from "./MenuPasta";

/** Abre o explorador numa janela ao lado, na pasta (e, se vier, já mostrando um arquivo). */
export function abrirExplorador(raiz: string, arquivo?: string, titulo?: string) {
  abrir({ v: "arquivos", raiz, arquivo, titulo }, true);
}

const urlDo = (caminho: string) => `${BASE}/arquivo?caminho=${encodeURIComponent(caminho)}`;
const separador = (c: string) => (c.includes("\\") ? "\\" : "/");
const pai = (c: string) => c.slice(0, Math.max(c.lastIndexOf("\\"), c.lastIndexOf("/")));
const nomeDe = (c: string) => c.split(/[\\/]/).filter(Boolean).pop() ?? c;

function Icone({ especie }: { especie: string }) {
  const P = { size: 15, strokeWidth: 1.7 };
  switch (especie) {
    case "pasta": return <Folder {...P} />;
    case "pdf": case "markdown": return <FileText {...P} />;
    case "html": case "texto": return <Code2 {...P} />;
    case "imagem": return <Image {...P} />;
    case "video": return <Film {...P} />;
    case "audio": return <Music {...P} />;
    default: return <File {...P} />;
  }
}

/**
 * Árvore de pastas (como a do VS Code): abre e fecha pastas no lugar; clicar num arquivo abre ele numa janela ao lado
 * (o Markdown aparece formatado, o texto dá para editar).
 */
export function ArvoreArquivos({ raiz, titulo }: { raiz: string; titulo?: string }) {
  const [recarga, setRecarga] = useState(0);
  // o agente pode criar arquivos enquanto você olha: relê de tempos em tempos
  useEffect(() => {
    const t = window.setInterval(() => setRecarga((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="explorador">
      <div className="ex-cabeca">
        <FolderOpen size={15} />
        <div className="ex-trilha"><strong title={raiz}>{titulo ?? nomeDe(raiz)}</strong></div>
        <button className="btn-icone" title="Reler" onClick={() => setRecarga((n) => n + 1)}><RefreshCw size={14} /></button>
        <MenuPasta pasta={raiz} classe="btn-icone"><FolderOpen size={14} /></MenuPasta>
      </div>
      <div className="ex-lista ex-arvore">
        <RamoPasta raiz={raiz} dir={raiz} nivel={0} recarga={recarga} />
      </div>
    </div>
  );
}

function RamoPasta({ raiz, dir, nivel, recarga }: { raiz: string; dir: string; nivel: number; recarga: number }) {
  const [entradas, setEntradas] = useState<Entrada[] | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  useEffect(() => {
    api.explorar(dir).then((r) => setEntradas(r.entradas)).catch(() => setEntradas([]));
  }, [dir, recarga]);
  if (!entradas) return null;
  if (!entradas.length && nivel === 0) return <div className="vazio-grande">Pasta vazia.</div>;
  const alternar = (c: string) => setAbertas((s) => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  return (
    <>
      {entradas.map((e) => (
        <div key={e.caminho}>
          <button
            className="ex-entrada"
            style={{ paddingLeft: 8 + nivel * 16 }}
            onClick={() => (e.pasta ? alternar(e.caminho) : abrirExplorador(raiz, e.caminho, nomeDe(e.caminho)))}
            title={e.caminho}
          >
            {e.pasta ? (abertas.has(e.caminho) ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span style={{ width: 13 }} />}
            <Icone especie={e.especie} />
            <span className="ex-nome">{e.nome}</span>
          </button>
          {e.pasta && abertas.has(e.caminho) && <RamoPasta raiz={raiz} dir={e.caminho} nivel={nivel + 1} recarga={recarga} />}
        </div>
      ))}
    </>
  );
}

function tamanho(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

/** Janela de arquivos: navega na pasta do item e mostra/edita os arquivos ali mesmo. */
export function Explorador({ raiz, arquivo, titulo }: { raiz: string; arquivo?: string; titulo?: string }) {
  const [estado, setEstado] = useState<{ raiz: string; titulo?: string; dir: string; arquivo: string | null }>(
    () => ({ raiz, titulo, dir: arquivo ? pai(arquivo) : raiz, arquivo: arquivo ?? null }),
  );
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [recarga, setRecarga] = useState(0);

  const dir = estado?.dir;
  useEffect(() => {
    if (!dir) return;
    api.explorar(dir).then((r) => setEntradas(r.entradas)).catch((e) => { setEntradas([]); falhou(e); });
  }, [dir, recarga]);

  // o agente pode criar arquivos enquanto você olha: relê a pasta de tempos em tempos
  useEffect(() => {
    if (!dir) return;
    const t = window.setInterval(() => setRecarga((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, [dir]);

  const sep = separador(estado.raiz);
  const relativo = estado.dir.startsWith(estado.raiz) ? estado.dir.slice(estado.raiz.length).split(/[\\/]/).filter(Boolean) : [];

  return (
    <div className="explorador">
      <div className="ex-cabeca">
        <FolderOpen size={15} />
        <div className="ex-trilha">
          <button onClick={() => setEstado({ ...estado, dir: estado.raiz, arquivo: null })} title={estado.raiz}>{estado.titulo ?? nomeDe(estado.raiz)}</button>
          {relativo.map((p, i) => (
            <span key={i}>
              <span className="sep">/</span>
              <button onClick={() => setEstado({ ...estado, dir: estado.raiz + sep + relativo.slice(0, i + 1).join(sep), arquivo: null })}>{p}</button>
            </span>
          ))}
          {estado.arquivo && (<><span className="sep">/</span><strong>{nomeDe(estado.arquivo)}</strong></>)}
        </div>
        <MenuPasta pasta={estado.dir} classe="btn-icone"><FolderOpen size={14} /></MenuPasta>
      </div>

      {estado.arquivo ? (
        <Previa key={estado.arquivo} caminho={estado.arquivo} aoVoltar={() => setEstado({ ...estado, arquivo: null })} />
      ) : (
        <div className="ex-lista">
          {estado.dir !== estado.raiz && (
            <button className="ex-entrada" onClick={() => setEstado({ ...estado, dir: pai(estado.dir) })}>
              <ArrowUp size={15} /> <span className="ex-nome">..</span>
            </button>
          )}
          {entradas.map((e) => (
            <button
              key={e.caminho}
              className="ex-entrada"
              onClick={() => setEstado({ ...estado, ...(e.pasta ? { dir: e.caminho, arquivo: null } : { arquivo: e.caminho }) })}
              title={`${e.caminho}${e.modificado ? `\nmodificado ${dataHora(e.modificado)}` : ""}`}
            >
              <Icone especie={e.especie} />
              <span className="ex-nome">{e.nome}</span>
              {!e.pasta && <span className="ex-meta">{tamanho(e.tamanho)}</span>}
              {e.modificado && <span className="ex-meta">{dataHora(e.modificado)}</span>}
            </button>
          ))}
          {entradas.length === 0 && <div className="vazio-grande">Pasta vazia. Arraste arquivos para a página do item.</div>}
        </div>
      )}
    </div>
  );
}

function Previa({ caminho, aoVoltar }: { caminho: string; aoVoltar: () => void }) {
  const [info, setInfo] = useState<{ especie: string; tamanho: number; modificado: string | null } | null>(null);
  const [texto, setTexto] = useState<string | null>(null);
  const [editado, setEditado] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [mudouFora, setMudouFora] = useState(false);
  const [versao, setVersao] = useState(0);
  const modRef = useRef<string | null>(null);
  const [auto, setAuto] = useState<{ auto_salvar: string; atraso_ms: number }>({ auto_salvar: "desligado", atraso_ms: 1000 });
  useEffect(() => { api.preferencias().then((p) => setAuto(p.editor)).catch(() => {}); }, []);

  const ehTexto = info && ["texto", "markdown", "html"].includes(info.especie);
  const carregar = useCallback(async () => {
    const i = await api.infoArquivo(caminho);
    setInfo(i);
    modRef.current = i.modificado;
    if (["texto", "markdown", "html"].includes(i.especie)) {
      if (i.tamanho > 3 * 1024 * 1024) { setTexto(null); return; }
      setTexto(await fetch(urlDo(caminho), { cache: "no-store" }).then((r) => r.text()));
    }
    setVersao((v) => v + 1);
    setMudouFora(false);
  }, [caminho]);

  useEffect(() => { carregar().catch(falhou); }, [carregar]);

  // mudou fora (o agente editou)? recarrega sozinho, a não ser que você esteja com edição pendente
  const pendente = editado != null && editado !== texto;
  useEffect(() => {
    const t = window.setInterval(async () => {
      try {
        const i = await api.infoArquivo(caminho);
        if (i.modificado !== modRef.current) {
          if (pendente) setMudouFora(true);
          else carregar();
        }
      } catch { /* arquivo sumiu */ }
    }, 2500);
    return () => window.clearInterval(t);
  }, [caminho, pendente, carregar]);

  const salvar = useCallback(async () => {
    if (editado == null) return;
    try {
      const r = await api.salvarArquivo(caminho, editado, modRef.current);
      modRef.current = r.modificado;
      setTexto(editado);
      setEditado(null);
      setEditando(false);
      avisar(`Salvo: ${nomeDe(caminho)}`);
    } catch (e) {
      falhou(e);
    }
  }, [caminho, editado]);

  // auto-salvar "depois de uma pausa" (nunca por cima de uma mudança feita fora)
  useEffect(() => {
    if (auto.auto_salvar !== "atraso" || !pendente || mudouFora) return;
    const t = window.setTimeout(salvar, Math.max(200, auto.atraso_ms));
    return () => window.clearTimeout(t);
  }, [editado, auto, pendente, mudouFora, salvar]);

  // "ao sair do arquivo": trocar de janela também conta
  useEffect(() => {
    if (auto.auto_salvar !== "foco") return;
    const f = () => { if (pendente && !mudouFora) salvar(); };
    window.addEventListener("blur", f);
    return () => window.removeEventListener("blur", f);
  }, [auto, pendente, mudouFora, salvar]);

  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "s" && pendente) { e.preventDefault(); salvar(); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [pendente, salvar]);

  if (!info) return <div className="vazio-grande">Abrindo…</div>;
  const mostrarEditor = ehTexto && (info.especie === "texto" || editando);

  return (
    <div className="ex-previa">
      <div className="ex-barra">
        <button
          className="btn"
          onClick={async () => {
            if (pendente && auto.auto_salvar !== "desligado" && !mudouFora) { await salvar(); aoVoltar(); return; }
            if (!pendente || window.confirm("Descartar as mudanças não salvas?")) aoVoltar();
          }}
        >
          <ArrowLeft size={14} /> Pasta
        </button>
        <span className="ex-meta">{tamanho(info.tamanho)}{info.modificado ? ` · modificado ${dataHora(info.modificado)}` : ""}</span>
        <span style={{ flex: 1 }} />
        {ehTexto && info.especie !== "texto" && (
          <button className="btn" onClick={() => setEditando((v) => !v)}>{editando ? <><Eye size={14} /> Ver</> : <><Pencil size={14} /> Editar</>}</button>
        )}
        {pendente && <button className="btn primario" onClick={salvar}><Save size={14} /> Salvar <kbd>Ctrl S</kbd></button>}
        {!pendente && auto.auto_salvar !== "desligado" && ehTexto && <span className="ex-meta">auto-salvar ligado</span>}
        <button className="btn-icone" title="Recarregar" onClick={() => carregar().catch(falhou)}><RefreshCw size={14} /></button>
        <button className="btn-icone" title="Abrir no programa padrão" onClick={() => api.abrirArquivo(caminho).catch(falhou)}><FolderOpen size={14} /></button>
      </div>
      {mudouFora && (
        <div className="aviso-lixeira" style={{ margin: "8px 10px 0" }}>
          O arquivo mudou fora daqui (talvez o agente).
          <button className="btn" onClick={() => { setEditado(null); carregar(); }}>Recarregar e perder a edição</button>
        </div>
      )}
      <div className="ex-conteudo">
        {mostrarEditor && texto != null ? (
          <textarea
            className="ex-editor"
            spellCheck={false}
            value={editado ?? texto}
            onChange={(e) => setEditado(e.target.value)}
            onBlur={() => { if (auto.auto_salvar === "foco" && pendente && !mudouFora) salvar(); }}
            onKeyDown={(e) => {
              if (e.key === "Tab") {
                e.preventDefault();
                const t = e.currentTarget, ini = t.selectionStart, fim = t.selectionEnd, v = editado ?? texto;
                setEditado(v.slice(0, ini) + "  " + v.slice(fim));
                requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = ini + 2; });
              }
            }}
          />
        ) : info.especie === "markdown" && texto != null ? (
          <Moldura html={marked.parse(editado ?? texto, { async: false }) as string} />
        ) : info.especie === "html" ? (
          <iframe key={versao} className="ex-moldura" src={urlDo(caminho) + `&v=${versao}`} sandbox="allow-scripts allow-popups" title="HTML" />
        ) : info.especie === "pdf" ? (
          <Pdf key={versao} url={urlDo(caminho) + `&v=${versao}`} />
        ) : info.especie === "imagem" ? (
          <div className="ex-centro"><img src={urlDo(caminho) + `&v=${versao}`} alt={nomeDe(caminho)} /></div>
        ) : info.especie === "video" ? (
          <div className="ex-centro"><video src={urlDo(caminho)} controls /></div>
        ) : info.especie === "audio" ? (
          <div className="ex-centro"><audio src={urlDo(caminho)} controls /></div>
        ) : (
          <div className="vazio-grande">
            Sem pré-visualização para este tipo de arquivo.
            <div style={{ marginTop: 12 }}><button className="btn primario" onClick={() => api.abrirArquivo(caminho).catch(falhou)}>Abrir no programa padrão</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Markdown renderizado numa caixa isolada (sem script, sem acesso ao atelier), com as cores do tema. */
function Moldura({ html }: { html: string }) {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(`--${n}`).trim();
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
    body{margin:0;padding:18px 22px 40px;font:14.5px/1.65 "Inter Variable","Segoe UI",system-ui,sans-serif;color:${v("texto")};background:${v("bg")}}
    h1,h2,h3{font-family:"Fraunces Variable",Georgia,serif;font-weight:600;line-height:1.25;margin:1.2em 0 .4em}
    h1{font-size:26px} h2{font-size:21px} h3{font-size:17px}
    a{color:${v("acento")}} code{background:${v("codigo")};padding:1px 5px;border-radius:5px;font:12.5px "Cascadia Code",Consolas,monospace}
    pre{background:${v("codigo")};padding:12px 14px;border-radius:9px;overflow:auto} pre code{background:none;padding:0}
    blockquote{border-left:3px solid ${v("acento")};margin:.6em 0;padding:2px 14px;color:${v("texto-2")}}
    table{border-collapse:collapse} td,th{border:1px solid ${v("borda-forte")};padding:5px 9px}
    img{max-width:100%} hr{border:0;border-top:1px dashed ${v("borda-forte")}}
  </style></head><body>${html}</body></html>`;
  return <iframe className="ex-moldura" sandbox="allow-popups" srcDoc={doc} title="Markdown" />;
}

/** PDF pelo pdf.js (igual no Windows e no Linux). Renderiza as páginas uma embaixo da outra. */
function Pdf({ url }: { url: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [paginas, setPaginas] = useState(0);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = worker;
        const doc = await pdfjs.getDocument({ url }).promise;
        if (cancelado) return;
        setPaginas(doc.numPages);
        const alvo = caixa.current!;
        alvo.innerHTML = "";
        const largura = alvo.clientWidth - 24;
        for (let n = 1; n <= Math.min(doc.numPages, 300); n++) {
          if (cancelado) return;
          const pag = await doc.getPage(n);
          const base = pag.getViewport({ scale: 1 });
          const escala = (largura / base.width) * (window.devicePixelRatio || 1);
          const vp = pag.getViewport({ scale: escala });
          const canvas = document.createElement("canvas");
          canvas.width = vp.width;
          canvas.height = vp.height;
          canvas.style.width = `${largura}px`;
          canvas.className = "ex-pdf-pagina";
          alvo.appendChild(canvas);
          await pag.render({ canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
        }
      } catch (e) {
        if (!cancelado) setErro(String(e));
      }
    })();
    return () => { cancelado = true; };
  }, [url]);

  if (erro) return <div className="vazio-grande">Não consegui mostrar o PDF ({erro}).</div>;
  return (
    <div className="ex-pdf">
      {paginas > 0 && <div className="ex-meta" style={{ padding: "4px 12px" }}>{paginas} {paginas === 1 ? "página" : "páginas"}</div>}
      <div ref={caixa} />
    </div>
  );
}
