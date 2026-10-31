import { useEffect, useState } from "react";
import { Check, Copy, FileCode, FolderOpen, FolderPlus, Languages, Package, Palette, Pencil, Plug, Plus, RefreshCw, Shapes, Timer, X } from "lucide-react";
import { Agente, api, Bancada, Bancadas, Esquema, Integracoes, Preferencias, TemaArquivo, AgenteCli, UsoAgente } from "../api";
import { SecaoAutomacao } from "./Automacao";
import { avisar, falhou, Tema } from "../ui";

export type SecaoConfig = "aparencia" | "geral" | "bancadas" | "tipos" | "integracoes" | "automacao" | "editor";
type Secao = SecaoConfig;

const TEMAS: { id: Tema; nome: string; cores: string[] }[] = [
  { id: "claro", nome: "Claro", cores: ["#faf9f5", "#f2f0e8", "#c96442", "#2b2a27"] },
  { id: "escuro", nome: "Escuro", cores: ["#262624", "#1f1e1d", "#d97757", "#ecebe6"] },
];

/** Pede uma pasta ao sistema (no app). No navegador de teste não há diálogo: devolve null. */
async function escolherPasta(inicial?: string): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ directory: true, defaultPath: inicial });
    return typeof r === "string" ? r : null;
  } catch {
    return null;
  }
}

function slug(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function Configuracoes({
  inicial = "aparencia", tema, temas, recarregarTemas, setTema, esquema, irTipo, aoMudarEsquema, aoFechar, aoTrocarBancada, prefs, mudarPrefs,
}: {
  inicial?: Secao;
  prefs: Preferencias | null;
  mudarPrefs: (d: Partial<Preferencias>) => void;
  esquema: Esquema;
  irTipo: (id: number) => void;
  aoMudarEsquema: () => Promise<void>;
  tema: Tema;
  temas: TemaArquivo[];
  recarregarTemas: () => void;
  setTema: (t: Tema) => void;
  aoFechar: () => void;
  aoTrocarBancada: () => void;
}) {
  const [secao, setSecao] = useState<Secao>(inicial);

  useEffect(() => {
    const f = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [aoFechar]);

  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal config-modal">
        <nav className="config-nav">
          <div className="config-nav-titulo">Configurações</div>
          <button className={secao === "aparencia" ? "ativo" : ""} onClick={() => setSecao("aparencia")}><Palette size={15} /> Aparência</button>
          <button className={secao === "geral" ? "ativo" : ""} onClick={() => setSecao("geral")}><Languages size={15} /> Idioma</button>
          <button className={secao === "bancadas" ? "ativo" : ""} onClick={() => setSecao("bancadas")}><Package size={15} /> Bancadas</button>
          <button className={secao === "tipos" ? "ativo" : ""} onClick={() => setSecao("tipos")}><Shapes size={15} /> Tipos e modelos</button>
          <button className={secao === "integracoes" ? "ativo" : ""} onClick={() => setSecao("integracoes")}><Plug size={15} /> Integrações</button>
          <button className={secao === "editor" ? "ativo" : ""} onClick={() => setSecao("editor")}><FileCode size={15} /> Editor de arquivos</button>
          <button className={secao === "automacao" ? "ativo" : ""} onClick={() => setSecao("automacao")}><Timer size={15} /> Automação</button>
        </nav>
        <section className="config-corpo">
          <button className="btn-icone fechar" onClick={aoFechar} title="Fechar (Esc)"><X size={17} /></button>
          {secao === "aparencia" && (
            <SecaoAparencia tema={tema} temas={temas} setTema={setTema} recarregar={recarregarTemas} zoom={prefs?.zoom ?? 100} setZoom={(z) => mudarPrefs({ zoom: z })} />
          )}
          {secao === "geral" && (
            <>
              <h3>Idioma</h3>
              <p className="dica">Por enquanto só português. Quando houver outros, aparecem aqui.</p>
              <select className="campo" style={{ maxWidth: 260 }} value="pt-BR" disabled>
                <option value="pt-BR">Português (Brasil)</option>
              </select>
            </>
          )}
          {secao === "bancadas" && <SecaoBancadas aoTrocar={aoTrocarBancada} />}
          {secao === "integracoes" && <SecaoIntegracoes />}
          {secao === "automacao" && prefs && <SecaoAutomacao prefs={prefs} mudar={mudarPrefs} />}
          {secao === "editor" && prefs && (
            <>
              <h3>Editor de arquivos</h3>
              <p className="dica">Vale para os arquivos abertos no painel da direita (texto, código, Markdown, HTML).</p>
              <h4>Salvar automaticamente</h4>
              <div className="inicio-bancada">
                {([
                  ["desligado", "Desligado", "Você salva com Ctrl+S ou no botão Salvar."],
                  ["atraso", "Depois de uma pausa", "Salva sozinho quando você para de digitar."],
                  ["foco", "Ao sair do arquivo", "Salva quando o foco sai do editor (clicar em outro lugar, trocar de janela)."],
                ] as const).map(([id, nome, dica]) => (
                  <label key={id} className={prefs.editor.auto_salvar === id ? "ligado" : ""}>
                    <input type="radio" checked={prefs.editor.auto_salvar === id} onChange={() => mudarPrefs({ editor: { ...prefs.editor, auto_salvar: id } })} />
                    <strong>{nome}</strong>
                    <small>{dica}</small>
                  </label>
                ))}
              </div>
              {prefs.editor.auto_salvar === "atraso" && (
                <div className="auto-campos" style={{ marginTop: 10 }}>
                  <label>Pausa de <input type="number" min={200} step={100} value={prefs.editor.atraso_ms} onChange={(e) => mudarPrefs({ editor: { ...prefs.editor, atraso_ms: Math.max(200, Number(e.target.value) || 1000) } })} /> ms</label>
                </div>
              )}
              <p className="dica" style={{ marginTop: 16 }}>Se o arquivo mudar fora daqui (o agente editou) enquanto você tem mudanças, nada é salvo por cima: o painel avisa.</p>
            </>
          )}
          {secao === "tipos" && <SecaoTipos esquema={esquema} irTipo={irTipo} aoMudarEsquema={aoMudarEsquema} />}
        </section>
      </div>
    </div>
  );
}

function SecaoBancadas({ aoTrocar }: { aoTrocar: () => void }) {
  const [dados, setDados] = useState<Bancadas | null>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [local, setLocal] = useState("");
  const [localMexido, setLocalMexido] = useState(false);
  const [inicio, setInicio] = useState<"vazia" | "trabalho">("vazia");

  const carregar = () => api.bancadas().then(setDados).catch(falhou);
  useEffect(() => { carregar(); }, []);

  if (!dados) return null;
  const sep = dados.separador;
  const localSugerido = nome.trim() ? `${dados.sugestao}${sep}${slug(nome) || "bancada"}` : "";
  const localFinal = localMexido ? local : localSugerido;

  const ativar = async (b: Bancada) => {
    try {
      await api.ativarBancada(b.caminho);
      aoTrocar();
    } catch (e) {
      falhou(e);
    }
  };

  const criar = async () => {
    if (!nome.trim() || !localFinal.trim()) return;
    try {
      await api.criarBancada({ nome: nome.trim(), caminho: localFinal.trim(), ativar: true, inicio });
      aoTrocar();
    } catch (e) {
      falhou(e);
    }
  };

  const abrirExistente = async () => {
    const p = await escolherPasta(dados.sugestao);
    if (!p) return;
    try {
      await api.criarBancada({ nome: "", caminho: p, ativar: true });
      aoTrocar();
    } catch (e) {
      falhou(e);
    }
  };

  return (
    <>
      <h3>Bancadas</h3>
      <p className="dica">
        Cada bancada é uma pasta com tudo dentro: o banco (<code>atelier.db</code>) e as pastas dos itens. Uma por
        cliente ou contexto. Para backup, copie a pasta.
      </p>

      <div className="bancadas-lista">
        {dados.bancadas.map((b) => {
          const ativa = dados.ativa?.caminho === b.caminho;
          return (
            <div key={b.caminho} className={`bancada-linha${ativa ? " ativa" : ""}`}>
              <div className="bancada-icone">{b.nome.slice(0, 1).toUpperCase()}</div>
              <div className="bancada-info">
                {renomeando === b.caminho ? (
                  <input
                    className="campo"
                    autoFocus
                    defaultValue={b.nome}
                    onBlur={async (e) => {
                      setRenomeando(null);
                      if (e.target.value.trim() && e.target.value !== b.nome) {
                        await api.renomearBancada(b.caminho, e.target.value).catch(falhou);
                        carregar();
                      }
                    }}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  />
                ) : (
                  <div className="bancada-nome">{b.nome} {ativa && <span className="selo">aberta</span>}</div>
                )}
                <div className="bancada-caminho">{b.caminho}</div>
              </div>
              <button className="btn-icone" title="Renomear" onClick={() => setRenomeando(b.caminho)}><Pencil size={14} /></button>
              <button className="btn-icone" title="Abrir a pasta" onClick={() => api.abrirPasta(b.caminho).catch(falhou)}><FolderOpen size={14} /></button>
              {!ativa && (
                <>
                  <button className="btn" onClick={() => ativar(b)}>Abrir</button>
                  <button
                    className="btn-icone"
                    title="Tirar da lista (não apaga nada do disco)"
                    onClick={async () => { await api.removerBancada(b.caminho).catch(falhou); carregar(); }}
                  >
                    <X size={14} />
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      <h4>Nova bancada</h4>
      <div className="nova-bancada">
        <label>
          <span>Nome</span>
          <input className="campo" placeholder="Ex.: Trabalho, Fábrica, Pessoal" value={nome} onChange={(e) => setNome(e.target.value)} />
        </label>
        <label>
          <span>Pasta</span>
          <div style={{ display: "flex", gap: 6 }}>
            <input
              className="campo mono"
              placeholder={`${dados.sugestao}${sep}...`}
              value={localFinal}
              onChange={(e) => { setLocal(e.target.value); setLocalMexido(true); }}
            />
            <button
              className="btn"
              onClick={async () => {
                const p = await escolherPasta(dados.sugestao);
                if (p) { setLocal(nome.trim() ? `${p}${sep}${slug(nome)}` : p); setLocalMexido(true); }
              }}
            >
              <FolderOpen size={14} /> Escolher…
            </button>
          </div>
        </label>
        <div className="inicio-bancada">
          <span>Começar com</span>
          <label className={inicio === "vazia" ? "ligado" : ""}>
            <input type="radio" checked={inicio === "vazia"} onChange={() => setInicio("vazia")} />
            <strong>Em branco</strong>
            <small>Só as visões Hoje, Caixa de entrada e Todos os itens. Você cria os tipos (ex.: Personagem, Cena, Local).</small>
          </label>
          <label className={inicio === "trabalho" ? "ligado" : ""}>
            <input type="radio" checked={inicio === "trabalho"} onChange={() => setInicio("trabalho")} />
            <strong>Trabalho</strong>
            <small>Já vem com Task, Dívida, Pendência, Desejo e Nota, com status e modelos.</small>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button className="btn primario" onClick={criar} disabled={!nome.trim()}>
            <FolderPlus size={14} /> Criar e abrir
          </button>
          <button className="btn" onClick={abrirExistente}>Abrir pasta que já é bancada…</button>
        </div>
      </div>

      <p className="dica" style={{ marginTop: 22 }}>
        Configuração geral em <code>{dados.pasta_atelier}{sep}config.toml</code>
      </p>
    </>
  );
}

function Amostra({ cores }: { cores: string[] }) {
  return (
    <div className="tema-amostra" style={{ background: cores[0] }}>
      <div style={{ background: cores[1] }} />
      <div>
        <span style={{ background: cores[3], opacity: 0.85 }} />
        <span style={{ background: cores[3], opacity: 0.35, width: "60%" }} />
        <span style={{ background: cores[2], width: "34%" }} />
      </div>
    </div>
  );
}

function SecaoAparencia({ tema, temas, setTema, recarregar, zoom, setZoom }: { tema: Tema; temas: TemaArquivo[]; setTema: (t: Tema) => void; recarregar: () => void; zoom: number; setZoom: (z: number) => void }) {
  const [pasta, setPasta] = useState("");
  useEffect(() => {
    recarregar();
    api.temas().then((r) => setPasta(r.pasta)).catch(() => {});
  }, [recarregar]);

  const cartao = (id: string, nome: string, cores: string[], erro?: string) => (
    <button key={id} className={`tema-cartao${tema === id ? " ativo" : ""}`} onClick={() => !erro && setTema(id)} title={erro}>
      <Amostra cores={cores} />
      <div className="tema-nome">{tema === id && <Check size={13} />} {nome}</div>
      {erro && <div className="tema-erro">arquivo com erro</div>}
    </button>
  );

  return (
    <>
      <h3>Aparência</h3>
      <p className="dica">O tema vale para todas as bancadas.</p>
      <h4>Tamanho da letra</h4>
      <div className="zoom-linha">
        {[85, 90, 100, 110, 125, 140].map((z) => (
          <button key={z} className={`chip${zoom === z ? " ligado" : ""}`} onClick={() => setZoom(z)}>{z}%</button>
        ))}
        <span className="dica" style={{ margin: 0 }}>Atalhos: Ctrl + / Ctrl − / Ctrl 0</span>
      </div>
      <h4>De fábrica</h4>
      <div className="temas-grade">{TEMAS.map((t) => cartao(t.id, t.nome, t.cores))}</div>
      <h4>Da pasta de temas</h4>
      <div className="temas-grade">
        {temas.map((t) => {
          const c = t.cores ?? {};
          return cartao(t.id, t.nome, [c["bg"] ?? "#888", c["moldura"] ?? "#666", c["acento"] ?? "#aaa", c["texto"] ?? "#fff"], t.erro);
        })}
      </div>
      <p className="dica" style={{ marginTop: 16 }}>
        Cada tema é um arquivo <code>.toml</code> em <code>{pasta}</code>. Para criar o seu, copie um deles com outro nome e
        mude as cores; o app relê quando você volta para a janela.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn" onClick={() => pasta && api.abrirPasta(pasta).catch(falhou)}><FolderOpen size={14} /> Abrir pasta de temas</button>
        <button className="btn" onClick={recarregar}><RefreshCw size={14} /> Recarregar</button>
      </div>
    </>
  );
}

const SITUACAO: Record<Agente["situacao"], { rotulo: string; cor: string }> = {
  instalado: { rotulo: "instalado", cor: "green" },
  desatualizado: { rotulo: "caminho antigo", cor: "yellow" },
  disponivel: { rotulo: "encontrado", cor: "blue" },
  ausente: { rotulo: "não encontrado", cor: "gray" },
  manual: { rotulo: "à mão", cor: "purple" },
};

function SecaoIntegracoes() {
  const [dados, setDados] = useState<Integracoes | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const [clis, setClis] = useState<AgenteCli[]>([]);
  const [testes, setTestes] = useState<Record<string, { ok: boolean; versao?: string; erro?: string | null } | "testando">>({});

  const carregar = () => Promise.all([api.integracoes().then(setDados), api.agentes().then((r) => setClis(r.agentes))]).catch(falhou);
  useEffect(() => { carregar(); }, []);

  const testar = async (id: string) => {
    setTestes((t) => ({ ...t, [id]: "testando" }));
    const r = await api.testarAgente(id).catch((e) => ({ ok: false, erro: String(e) }));
    setTestes((t) => ({ ...t, [id]: r }));
  };
  const detectarTodos = async () => {
    await carregar();
    const r = await api.agentes().catch(() => null);
    await Promise.all((r?.agentes ?? []).filter((a) => a.detectado).map((a) => testar(a.id)));
  };
  // liga/desliga Terminal, Executor ou Prompt (fica no config.toml)
  const usar = async (id: string, d: UsoAgente) => {
    try {
      const prefs = await api.preferencias();
      await api.mudarPreferencias({ agentes: { ...prefs.agentes, [id]: { ...prefs.agentes?.[id], ...d } } });
      setClis((await api.agentes()).agentes);
    } catch (e) {
      falhou(e);
    }
  };
  if (!dados) return (<><h3>Integrações</h3><p className="dica">Procurando agentes nesta máquina…</p></>);

  const agir = async (a: Agente, instalar: boolean) => {
    setOcupado(a.id);
    try {
      if (instalar) await api.instalarIntegracao(a.id);
      else await api.removerIntegracao(a.id);
      await carregar();
    } catch (e) {
      falhou(e);
    } finally {
      setOcupado(null);
    }
  };

  const ordem = { instalado: 0, desatualizado: 1, disponivel: 2, manual: 3, ausente: 4 };
  const lista = [...dados.agentes]
    .sort((x, y) => ordem[x.situacao] - ordem[y.situacao])
    .filter((a) => verTodos || a.situacao !== "ausente");
  const escondidos = dados.agentes.filter((a) => a.situacao === "ausente").length;

  return (
    <>
      <h3>Integrações</h3>
      <p className="dica">
        Instala o servidor MCP do atelier nos agentes desta máquina. Com ele, o agente busca, lê, cria e anota itens na
        bancada aberta (mesmo com o app fechado). Antes de mexer no arquivo de um agente, o atelier guarda uma cópia{" "}
        <code>.bak-atelier</code> ao lado.
      </p>
      <p className="dica">
        Os agentes de linha de comando só entram em uso (terminal, executor e <code>/prompt</code> no editor) depois de
        terem o MCP do atelier instalado: sem ele, o agente não enxerga a bancada. Cada uso é ligado aqui e vem desligado.
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className="btn" onClick={detectarTodos}><RefreshCw size={14} /> Detectar todos</button>
      </div>
      <div className={`servidor-mcp${dados.servidor_existe ? "" : " falta"}`}>
        <Plug size={15} />
        <div>
          <div className="bancada-nome">Servidor MCP {dados.servidor_existe ? "pronto" : "não encontrado"}</div>
          <div className="bancada-caminho">{dados.servidor}</div>
        </div>
      </div>

      <div className="agentes">
        {lista.map((a) => {
          const s = SITUACAO[a.situacao];
          const instalado = a.situacao === "instalado" || a.situacao === "desatualizado";
          return (
            <div key={a.id} className="agente">
              <div className="agente-linha">
                <div className="agente-info">
                  <div className="bancada-nome">
                    {a.nome}
                    <span className={`tag cor-${s.cor}`}>{s.rotulo}</span>
                    {!a.confirmado && <span className="selo-aviso" title="Caminho ou formato não confirmado na documentação oficial">não confirmado</span>}
                  </div>
                  <div className="bancada-caminho">{a.arquivos.join("  ·  ")}{a.via_cli ? "  (via claude mcp)" : ""}</div>
                </div>
                <button className="btn" onClick={() => setAberto(aberto === a.id ? null : a.id)}>Ver config</button>
                {a.automatico && (instalado ? (
                  <>
                    {a.situacao === "desatualizado" && <button className="btn" disabled={!!ocupado} onClick={() => agir(a, true)}>Atualizar</button>}
                    <button className="btn perigo" disabled={!!ocupado} onClick={() => agir(a, false)}>{ocupado === a.id ? "…" : "Remover"}</button>
                  </>
                ) : (
                  <button className="btn primario" disabled={!!ocupado || !dados.servidor_existe} onClick={() => agir(a, true)}>
                    {ocupado === a.id ? "Instalando…" : "Instalar"}
                  </button>
                ))}
              </div>
              {a.erro && <div className="agente-nota erro">{a.erro}</div>}
              {(() => {
                const c = clis.find((x) => x.id === a.id);
                if (!c) return null;
                const t = testes[a.id];
                return (
                  <div className="agente-uso">
                    <span className="agente-cli">{c.detectado ? <code title={c.executavel ?? ""}>{c.executavel?.split(/[\\/]/).pop()}</code> : "linha de comando não encontrada"}</span>
                    {c.detectado && <button className="btn" onClick={() => testar(a.id)} disabled={t === "testando"}>{t === "testando" ? "Testando…" : "Testar"}</button>}
                    {t && t !== "testando" && (
                      <span className={`tag cor-${t.ok ? "green" : "red"}`} title={t.erro ?? ""}>{t.ok ? `ok ${t.versao ?? ""}` : "falhou"}</span>
                    )}
                    {c.detectado && !c.mcp && <span className="dica-inline">Instale o MCP para ligar os usos.</span>}
                    {c.detectado && c.mcp && (
                      <span className="usos">
                        {([
                          ["terminal", "Terminal", "Aparece no botão de terminal"],
                          ["executor", "Executor", "O atelier pode chamá-lo sem terminal"],
                          ["prompt", "Prompt", "Aparece no /prompt do editor"],
                        ] as const).map(([k, nome, dica]) => (
                          <label key={k} title={dica} className={c[k] ? "ligado" : ""}>
                            <input type="checkbox" checked={c[k]} disabled={k !== "terminal" && !c.exec.trim()} onChange={(e) => usar(a.id, { [k]: e.target.checked })} />
                            {nome}
                          </label>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })()}
              {aberto === a.id && (
                <div className="agente-detalhe">
                  {a.nota && <div className="agente-nota">{a.nota}</div>}
                  {!a.automatico && <div className="agente-nota">Cole este trecho no arquivo acima:</div>}
                  <pre className="trecho">{a.trecho}</pre>
                  {clis.find((x) => x.id === a.id) && (() => {
                    const c = clis.find((x) => x.id === a.id)!;
                    return (
                      <div className="agente-nota">
                        Execução sem terminal (Executor e Prompt): argumentos do <code>{c.executavel?.split(/[\\/]/).pop() ?? a.id}</code>.{" "}
                        <code>{"{prompt}"}</code> vira o pedido; sem ele, o pedido vai pela entrada padrão.
                        <input
                          className="campo mono"
                          style={{ marginTop: 6 }}
                          defaultValue={c.exec}
                          placeholder={c.exec_padrao || "sem modo não interativo conhecido"}
                          onBlur={(e) => e.target.value.trim() !== c.exec && usar(a.id, { exec: e.target.value.trim() || null })}
                        />
                      </div>
                    );
                  })()}
                  <button className="btn" onClick={() => navigator.clipboard.writeText(a.trecho).then(() => avisar("Copiado."))}>
                    <Copy size={14} /> Copiar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {escondidos > 0 && (
        <button className="btn" style={{ marginTop: 10 }} onClick={() => setVerTodos((v) => !v)}>
          {verTodos ? "Esconder os que não estão nesta máquina" : `Mostrar os outros ${escondidos} agentes (não encontrados nesta máquina)`}
        </button>
      )}
    </>
  );
}

function SecaoTipos({ esquema, irTipo, aoMudarEsquema }: { esquema: Esquema; irTipo: (id: number) => void; aoMudarEsquema: () => Promise<void> }) {
  const [nome, setNome] = useState("");
  const criar = async () => {
    if (!nome.trim()) return;
    try {
      const { id } = await api.criarTipo({ nome: nome.trim() });
      await aoMudarEsquema();
      setNome("");
      irTipo(id);
    } catch (e) {
      falhou(e);
    }
  };
  return (
    <>
      <h3>Tipos e modelos</h3>
      <p className="dica">
        O tipo diz o que um item é: quais propriedades ele tem, os status e os modelos (templates) com que nasce.
        Tipo novo já ganha uma visão no menu.
      </p>
      <div className="bancadas-lista">
        {esquema.tipos.map((t) => {
          const n = esquema.modelos.filter((m) => m.tipo_id === t.id).length;
          return (
            <div key={t.id} className="bancada-linha">
              <span className="tipo-chip">{t.icone}</span>
              <div className="bancada-info">
                <div className="bancada-nome">{t.nome}</div>
                <div className="bancada-caminho">{t.propriedades.length} propriedades · {n} {n === 1 ? "modelo" : "modelos"}</div>
              </div>
              <button className="btn" onClick={() => irTipo(t.id)}>Configurar</button>
            </div>
          );
        })}
      </div>
      <h4>Novo tipo</h4>
      <div style={{ display: "flex", gap: 8, maxWidth: 460 }}>
        <input className="campo" placeholder="Ex.: Demanda, Reunião, Leitura…" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && criar()} />
        <button className="btn primario" onClick={criar} disabled={!nome.trim()}><Plus size={14} /> Criar</button>
      </div>
    </>
  );
}
