import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Copy, FileDown, PanelRight, FolderOpen, FolderPlus, History, Layers, Pencil, RotateCcw, Send, Trash2, X } from "lucide-react";
import { Exportar } from "./Exportar";
import { api, Esquema, Item, Nota, Propriedade, propsDoTipo, Valor } from "../api";
import { avisar, falhou, Rota } from "../ui";
import { dataHora } from "../visao";
import { Editor, lerBase64 } from "./Editor";
import { Historico } from "./Historico";
import { abrirCodigo, ComMencoes } from "./Mencoes";
import { abrirTerminalEmbutido, MenuPasta } from "./MenuPasta";
import { Relacoes } from "./Relacoes";
import { Arquivos, trazerArquivos } from "./Arquivos";
import { abrirExplorador } from "./Explorador";
import { Popover, usePopover } from "./Popover";
import { AdicionarProp, BotaoAdicionarProp, MenuProp } from "./Propriedades";
import { IconeEspecie, ValorProp } from "./Valor";

export function PaginaItem({
  esquema, id, ir, aoMudarEsquema, aoCarregar,
}: {
  esquema: Esquema;
  id: number;
  ir: (r: Rota) => void;
  aoMudarEsquema: () => Promise<void>;
  aoCarregar: (it: Item | null) => void;
}) {
  const [item, setItem] = useState<Item | null>(null);
  const [nota, setNota] = useState("");
  const [arrastando, setArrastando] = useState(false);
  const [recargaArquivos, setRecargaArquivos] = useState(0);
  const [historico, setHistorico] = useState<{ alvo: "item" | "nota"; id: number; atual: string } | null>(null);
  const [exportando, setExportando] = useState(false);
  const [menuProp, setMenuProp] = useState<{ ancora: HTMLElement; prop: Propriedade } | null>(null);
  const addProp = usePopover();
  const escolherTipo = usePopover();
  const tituloRef = useRef<HTMLTextAreaElement>(null);

  // quem avisa muda a cada desenho do painel: guardado num ref para não recarregar o item em laço
  const avisarCarga = useRef(aoCarregar);
  avisarCarga.current = aoCarregar;
  const carregar = useCallback(() => {
    api.item(id).then((it) => { setItem(it); avisarCarga.current(it); }).catch(falhou);
  }, [id]);

  useEffect(() => {
    setItem(null);
    carregar();
    window.addEventListener("focus", carregar);
    return () => window.removeEventListener("focus", carregar);
  }, [carregar]);

  // arrastar arquivos do sistema para cima da página: copia para insumos/ (só no app; o navegador não dá o caminho)
  const itemRef = useRef<Item | null>(null);
  itemRef.current = item;
  useEffect(() => {
    let solta: (() => void) | undefined;
    let vivo = true;
    import("@tauri-apps/api/webview")
      .then(async ({ getCurrentWebview }) => {
        const f = await getCurrentWebview().onDragDropEvent(async (ev) => {
          const p = ev.payload;
          if (p.type === "enter" || p.type === "over") setArrastando(true);
          else if (p.type === "leave") setArrastando(false);
          else if (p.type === "drop") {
            setArrastando(false);
            const it = itemRef.current;
            if (!it) return;
            try {
              await trazerArquivos(it, p.paths);
              carregar();
              setRecargaArquivos((n) => n + 1);
            } catch (e) {
              falhou(e);
            }
          }
        });
        if (vivo) solta = f;
        else f();
      })
      .catch(() => {});
    return () => { vivo = false; solta?.(); };
  }, [carregar]);

  // título novo e vazio já chega com o cursor nele
  useEffect(() => {
    if (item && !item.titulo) tituloRef.current?.focus();
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // altura do título acompanha o texto; refaz quando a fonte serifada terminar de carregar
  useEffect(() => {
    const ajustar = () => {
      const t = tituloRef.current;
      if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + "px"; }
    };
    ajustar();
    document.fonts?.ready.then(ajustar);
    window.addEventListener("resize", ajustar);
    return () => window.removeEventListener("resize", ajustar);
  }, [item?.titulo]);

  if (!item) return null;

  const tipo = esquema.tipos.find((t) => t.id === item.tipo_id);
  const props = propsDoTipo(esquema, tipo);
  const noTipo = new Set(props.map((p) => p.id));
  const guardadas = esquema.propriedades.filter((p) => !noTipo.has(p.id) && item.props[p.id] != null);

  const salvar = async (d: Parameters<typeof api.atualizarItem>[1]) => {
    try {
      const novo = await api.atualizarItem(item.id, d);
      setItem((atual) => (atual ? { ...novo, corpo: d.corpo !== undefined ? atual.corpo : novo.corpo } : novo));
      aoCarregar(novo);
    } catch (e) {
      falhou(e);
    }
  };

  const mudarProp = (pid: number, v: Valor) => {
    const antes = item.props[pid] ?? null;
    setItem({ ...item, props: { ...item.props, [pid]: v } });
    salvar({ props: { [pid]: v } }).then(() => {
      const nome = esquema.propriedades.find((p) => p.id === pid)?.nome ?? "Propriedade";
      avisar(`${nome} alterado.`, async () => { await api.atualizarItem(item.id, { props: { [pid]: antes } }); carregar(); });
    });
  };

  const anotar = async () => {
    if (!nota.trim()) return;
    try {
      await api.anotar(item.id, nota.trim());
      setNota("");
      carregar();
    } catch (e) {
      falhou(e);
    }
  };

  const duplicar = async () => {
    try {
      const props = Object.fromEntries(Object.entries(item.props).filter(([pid]) => noTipo.has(Number(pid))));
      const novo = await api.criarItem({ titulo: `${item.titulo} (cópia)`, tipo_id: item.tipo_id, modelo_id: null, props, corpo: item.corpo ?? "" });
      avisar(`Cópia criada: #${novo.codigo}`);
      ir({ v: "item", id: novo.id });
    } catch (e) {
      falhou(e);
    }
  };

  const linhaProp = (p: Propriedade, fora = false) => (
    <div key={p.id} style={{ display: "contents" }}>
      <div className="prop-nome" style={fora ? { opacity: 0.6 } : undefined} onClick={(e) => setMenuProp({ ancora: e.currentTarget, prop: p })}>
        <IconeEspecie especie={p.especie} /> {p.nome}
      </div>
      <ValorProp
        esquema={esquema}
        prop={p}
        tipoId={item.tipo_id}
        valor={item.props[p.id]}
        proprio={item.codigo}
        aoMudar={(v) => mudarProp(p.id, v)}
        aoMudarEsquema={aoMudarEsquema}
      />
    </div>
  );

  return (
    <div className="pagina">
      {arrastando && (
        <div className="soltar-aqui">
          <div>Solte para copiar para <code>insumos/</code> de <strong>#{item.codigo}</strong></div>
        </div>
      )}
      {item.apagado_em && (
        <div className="aviso-lixeira">
          <Trash2 size={15} /> Este item está na lixeira desde {dataHora(item.apagado_em)}.
          <button
            className="btn"
            onClick={async () => {
              await api.restaurarItem(item.id).catch(falhou);
              avisar("Item restaurado.");
              carregar();
            }}
          >
            <RotateCcw size={13} /> Restaurar
          </button>
        </div>
      )}
      {historico && (
        <Historico alvo={historico.alvo} id={historico.id} atual={historico.atual} aoFechar={() => setHistorico(null)} aoRestaurar={carregar} />
      )}
      <div className="pagina-cabeca">
        <div className="pagina-icone">{tipo?.icone ?? "·"}</div>
        <div className="pagina-meta">
          <button
            className="id-item copiar"
            title="Copiar o código"
            onClick={() => navigator.clipboard.writeText(`#${item.codigo}`).then(() => avisar(`#${item.codigo} copiado.`))}
          >
            #{item.codigo}
          </button>
          <span className="ponto">·</span>
          <button className="meta-tipo" onClick={escolherTipo.abrir}>{tipo ? tipo.nome : "sem tipo"}</button>
          <span className="ponto">·</span>
          <span title="Criado em">criado {dataHora(item.criado_em)}</span>
          <span className="ponto">·</span>
          <span title="Última mudança">atualizado {dataHora(item.atualizado_em)}</span>
          <span className="meta-acoes">
            {item.pasta && (
              <MenuPasta pasta={item.pasta} classe="btn">
                <FolderOpen size={14} /> Abrir pasta
              </MenuPasta>
            )}
            <button
              className="btn"
              title="Abre um agente (Claude, Codex...) num terminal aqui no atelier, dentro da pasta do item. Cria a pasta se faltar."
              onClick={async () => {
                try {
                  const pasta = item.pasta ?? (await api.criarPasta(item.id)).pasta;
                  if (!item.pasta) carregar();
                  abrirTerminalEmbutido(pasta, "agente", `#${item.codigo}`);
                } catch (e) {
                  falhou(e);
                }
              }}
            >
              <Bot size={14} /> Agente
            </button>
            <button
              className="btn"
              title="Ver e editar os arquivos do item aqui, num painel à direita. Cria a pasta se faltar."
              onClick={async () => {
                try {
                  const pasta = item.pasta ?? (await api.criarPasta(item.id)).pasta;
                  if (!item.pasta) carregar();
                  abrirExplorador(pasta, undefined, `#${item.codigo}`);
                } catch (e) {
                  falhou(e);
                }
              }}
            >
              <PanelRight size={14} /> Arquivos
            </button>
            <button className="btn" onClick={() => setHistorico({ alvo: "item", id: item.id, atual: item.corpo ?? "" })} title="Versões anteriores do texto">
              <History size={14} /> Histórico
            </button>
            <button className="btn" onClick={duplicar} title="Cria uma cópia com o mesmo tipo, propriedades e texto">
              <Copy size={14} /> Duplicar
            </button>
            <button className="btn" onClick={() => setExportando(true)} title="Markdown, HTML, PDF, Excel ou CSV, com os campos que você escolher">
              <FileDown size={14} /> Exportar
            </button>
            {exportando && <Exportar esquema={esquema} ids={[item.id]} nome={item.titulo || item.codigo} aoFechar={() => setExportando(false)} />}
          </span>
        </div>
        <textarea
          ref={tituloRef}
          className="titulo-grande"
          rows={1}
          placeholder="Sem título"
          value={item.titulo}
          onChange={(e) => setItem({ ...item, titulo: e.target.value })}
          onBlur={(e) => salvar({ titulo: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
        />
      </div>

      <div className="pagina-grade">
        <div className="pagina-texto">
          <Editor
            key={item.id}
            valor={item.corpo ?? ""}
            aoMudar={(corpo) => salvar({ corpo })}
            aoMencao={(c) => abrirCodigo(c, ir)}
            prompt={{ itemId: item.id, codigo: item.codigo, titulo: item.titulo }}
            aoColarArquivo={async (f) => {
              try {
                const agora = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
                const ext = (f.type.split("/")[1] ?? "bin").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
                const nome = f.name && !/^image\.\w+$/.test(f.name) ? f.name : `colado-${agora}.${ext}`;
                const r = await api.colarArquivo(item.id, nome, await lerBase64(f));
                avisar(`Guardado em insumos/: ${r.caminho.split(/[\\/]/).pop()}`);
                setRecargaArquivos((n) => n + 1);
                if (!item.pasta) carregar();
                return r.caminho;
              } catch (e) {
                falhou(e);
                return null;
              }
            }}
            placeholder="Escreva aqui… (markdown: ## título, - lista, [ ] tarefa; cite outro item com #código)"
          />

          <div className="secao-titulo">Linha do tempo</div>
          <div className="nova-nota">
            <textarea
              className="campo"
              rows={Math.min(6, Math.max(1, nota.split("\n").length))}
              placeholder="Anotar acompanhamento… (Enter anota, Shift+Enter quebra linha)"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); anotar(); }
              }}
            />
            <button className="btn-icone" onClick={anotar} title="Anotar"><Send size={15} /></button>
          </div>
          <div className="linha-tempo">
            {item.notas?.map((n) => (
              <NotaLinha key={n.id} nota={n} ir={ir} aoMudar={carregar} aoHistorico={() => setHistorico({ alvo: "nota", id: n.id, atual: n.texto })} />
            ))}
          </div>
        </div>

        <aside className="ficha">
          <div className="ficha-titulo">Ficha</div>
          <div className="props">
            <div className="prop-nome"><Layers size={14} strokeWidth={1.8} /> Tipo</div>
            <div className={`prop-valor${escolherTipo.ancora ? " editando" : ""}`} onClick={escolherTipo.abrir}>
              {tipo ? <span>{tipo.icone} {tipo.nome}</span> : <span className="vazio">Sem tipo</span>}
            </div>

            {props.map((p) => linhaProp(p))}

            <div className="prop-nome"><FolderOpen size={14} strokeWidth={1.8} /> Pasta</div>
            <PastaValor
              pasta={item.pasta}
              aoMudar={(pasta) => salvar({ pasta })}
              aoCriar={() => api.criarPasta(item.id).then(carregar).catch(falhou)}
            />
          </div>

          {tipo && (
            <div className="prop-acoes">
              <BotaoAdicionarProp onClick={addProp.abrir} />
            </div>
          )}

          <Relacoes esquema={esquema} item={item} />

          <Arquivos item={item} recarga={recargaArquivos} aoMudar={() => { carregar(); setRecargaArquivos((n) => n + 1); }} />

          {guardadas.length > 0 && (
            <div className="guardadas">
              <div className="ficha-titulo">Guardado de outros tipos</div>
              <div className="props">{guardadas.map((p) => linhaProp(p, true))}</div>
            </div>
          )}
        </aside>
      </div>

      {escolherTipo.ancora && (
        <Popover ancora={escolherTipo.ancora} aoFechar={escolherTipo.fechar} largura={240}>
          <div className="menu-rotulo">Este item é um…</div>
          {esquema.tipos.map((t) => (
            <button
              key={t.id}
              className="menu-item"
              onClick={() => { escolherTipo.fechar(); salvar({ tipo_id: t.id }); }}
            >
              <span style={{ width: 18, textAlign: "center" }}>{t.icone}</span> {t.nome}
              {t.id === item.tipo_id && <span className="dir">✓</span>}
            </button>
          ))}
          <div className="menu-sep" />
          <div className="menu-rotulo">Para um tipo novo, crie no menu lateral (+)</div>
        </Popover>
      )}

      {addProp.ancora && tipo && (
        <AdicionarProp ancora={addProp.ancora} aoFechar={addProp.fechar} esquema={esquema} tipo={tipo} aoMudarEsquema={aoMudarEsquema} />
      )}

      {menuProp && (
        <MenuProp
          ancora={menuProp.ancora}
          aoFechar={() => setMenuProp(null)}
          prop={menuProp.prop}
          tipo={tipo && noTipo.has(menuProp.prop.id) ? tipo : undefined}
          aoMudarEsquema={aoMudarEsquema}
        />
      )}

    </div>
  );
}

function PastaValor({ pasta, aoMudar, aoCriar }: { pasta: string | null; aoMudar: (p: string | null) => void; aoCriar: () => void }) {
  const [editando, setEditando] = useState(false);
  if (editando) {
    const gravar = (s: string) => {
      setEditando(false);
      const v = s.trim().replace(/^"|"$/g, "") || null;
      if (v !== pasta) aoMudar(v);
    };
    return (
      <div className="prop-valor editando">
        <input
          className="inline"
          autoFocus
          placeholder="C:\projetos\..."
          defaultValue={pasta ?? ""}
          onBlur={(e) => gravar(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") gravar(e.currentTarget.value);
            if (e.key === "Escape") setEditando(false);
          }}
        />
      </div>
    );
  }
  return (
    <div className="prop-valor" onClick={() => setEditando(true)} style={{ gap: 6 }} title={pasta ?? "Clique para ligar uma pasta existente"}>
      {pasta ? (
        <>
          <span style={{ fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pasta.split(/[\\/]/).filter(Boolean).pop()}
          </span>
          <span style={{ marginLeft: "auto" }} onClick={(e) => e.stopPropagation()}>
            <MenuPasta pasta={pasta} classe="btn btn-pequeno">
              <FolderOpen size={13} /> Abrir
            </MenuPasta>
          </span>
        </>
      ) : (
        <>
          <span className="vazio">Nenhuma</span>
          <button
            className="btn"
            style={{ padding: "1px 8px", fontSize: 12.5, marginLeft: "auto" }}
            title="Cria itens/00042-titulo/ na bancada, com insumos, artefatos e rascunho"
            onClick={(e) => { e.stopPropagation(); aoCriar(); }}
          >
            <FolderPlus size={13} /> Criar
          </button>
        </>
      )}
    </div>
  );
}

const AGENTES = new Set(["Claude", "Codex", "Gemini", "Antigravity", "OpenCode", "Kiro", "Copilot", "Cursor", "Windsurf", "Zed", "Pi", "Agente"]);

/** Uma entrada da linha do tempo do item: data e hora sempre; dá para corrigir o texto ou apagar. */
function NotaLinha({ nota, ir, aoMudar, aoHistorico }: { nota: Nota; ir: (r: Rota) => void; aoMudar: () => void; aoHistorico: () => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nota.texto);
  const [apagar, setApagar] = useState(false);
  const agente = AGENTES.has(nota.autor);

  const gravar = async () => {
    if (!texto.trim() || texto.trim() === nota.texto) return setEditando(false);
    try {
      await api.editarNota(nota.id, texto.trim());
      setEditando(false);
      aoMudar();
    } catch (e) {
      falhou(e);
    }
  };

  return (
    <div className="nota">
      <span className={`nota-ponto${agente ? " claude" : ""}`} />
      <div style={{ minWidth: 0 }}>
        <div className="nota-cabeca">
          <span className={`autor${agente ? " claude" : ""}`}>{nota.autor}</span>
          <span className="quando" title={nota.criado_em}>{dataHora(nota.criado_em)}</span>
          {nota.editado_em && (
            <button className="quando editada" title="Ver versões anteriores" onClick={aoHistorico}>· editada {dataHora(nota.editado_em)}</button>
          )}
          {!editando && (
            <span className="nota-acoes">
              <button className="mini-acao" title="Editar" onClick={() => { setTexto(nota.texto); setEditando(true); }}><Pencil size={12} /></button>
              <button
                className={`mini-acao${apagar ? " perigo" : ""}`}
                title={apagar ? "Clique de novo: vai para a lixeira" : "Mover para a lixeira"}
                onClick={async () => {
                  if (!apagar) { setApagar(true); window.setTimeout(() => setApagar(false), 3000); return; }
                  await api.apagarNota(nota.id).catch(falhou);
                  avisar("Anotação na lixeira.", async () => { await api.restaurarNota(nota.id); aoMudar(); });
                  aoMudar();
                }}
              >
                <Trash2 size={12} />
              </button>
            </span>
          )}
        </div>
        {editando ? (
          <div className="nota-edicao">
            <textarea
              className="campo"
              autoFocus
              rows={Math.min(8, Math.max(2, texto.split("\n").length))}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); gravar(); }
                if (e.key === "Escape") setEditando(false);
              }}
            />
            <button className="mini-acao" title="Salvar (Enter)" onClick={gravar}><Check size={13} /></button>
            <button className="mini-acao" title="Cancelar (Esc)" onClick={() => setEditando(false)}><X size={13} /></button>
          </div>
        ) : (
          <div className="nota-texto"><ComMencoes texto={nota.texto} ir={ir} /></div>
        )}
      </div>
    </div>
  );
}
