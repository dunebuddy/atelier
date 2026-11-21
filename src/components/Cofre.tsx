// Cofre de segredos da bancada (o arquivo `cofre.db`, todo criptografado; a chave fica no cofre do Windows).
// - TelaCofre: todos os segredos da bancada, com busca;
// - SegredosDoDocumento: a parte "Segredos" da página do documento (os dele e os dos descendentes);
// - JanelaSegredo: a janelinha de criar/editar (abre de qualquer lugar com `novoSegredo`);
// - PedidoDoAgente: a caixa "o agente quer o segredo X: Permitir por 5 min / Só desta vez / Negar".
// O valor nunca vem na lista: só ao clicar em mostrar ou copiar (e a área de transferência se limpa em 30 s).
// Valor que é um objeto JSON aparece (e se edita) como chave/valor, como no Secrets Manager da AWS.
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, Copy, Eye, EyeOff, KeyRound, LayoutDashboard, Lock, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api, Esquema, Segredo } from "../api";
import { abrir, avisar, falhou } from "../ui";
import { abrirCodigo } from "./Mencoes";
import { Popover, usePopover } from "./Popover";
import { ChipItem, EscolherItem } from "./Valor";
import { lembrarResumo, useResumos } from "../resumos";

const LIMPAR_EM = 30_000;
let limpeza = 0;

/** Copia um pedaço secreto e limpa a área de transferência depois de 30 s. */
async function copiarSecreto(texto: string, rotulo: string) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar(`Copiado: ${rotulo}. A área de transferência se limpa em 30 s.`);
    window.clearTimeout(limpeza);
    limpeza = window.setTimeout(() => { navigator.clipboard.writeText("").catch(() => {}); }, LIMPAR_EM);
  } catch (e) {
    falhou(e);
  }
}

/** Copia o que não é segredo (o nome da chave). */
function copiarAberto(texto: string) {
  navigator.clipboard.writeText(texto).then(() => avisar("Copiado")).catch(falhou);
}

/** Um clique copia, menos quando você está selecionando texto (como no checklist). */
const seNaoSeleciona = (f: () => void) => () => { if (!window.getSelection()?.toString()) f(); };

/** Copia o valor e limpa a área de transferência depois de 30 s. */
export async function copiarSegredo(id: number, nome: string) {
  try {
    const { valor } = await api.cofreValor(id);
    await copiarSecreto(valor, nome);
  } catch (e) {
    falhou(e);
  }
}

/** O valor como objeto JSON (`{...}`), ou null se não for um. */
export function objetoJson(t: string): Record<string, unknown> | null {
  const s = t.trim();
  if (!s.startsWith("{")) return null;
  try {
    const o = JSON.parse(s);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}
const textoDe = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/** Uma linha da aba chave/valor; `cru` = o valor não era texto (número, lista...) e volta a ser JSON ao salvar. */
interface Par { k: string; v: string; cru: boolean }
const paraPares = (o: Record<string, unknown>): Par[] =>
  Object.entries(o).map(([k, v]) => ({ k, v: textoDe(v), cru: typeof v !== "string" }));
function paraTexto(pares: Par[]): string {
  const cheios = pares.filter((p) => p.k || p.v);
  if (!cheios.length) return "";
  const o: Record<string, unknown> = {};
  for (const p of cheios) {
    let v: unknown = p.v;
    if (p.cru) { try { v = JSON.parse(p.v); } catch { /* ficou texto */ } }
    o[p.k] = v;
  }
  return JSON.stringify(o, null, 2);
}

/** Recarrega quando o cofre muda (aqui ou pelo agente). */
function useCofre(carregar: () => void) {
  useEffect(() => {
    carregar();
    const f = (e: Event) => { if ((e as CustomEvent<{ acao: string }>).detail?.acao === "cofre-mudou") carregar(); };
    // o agente guarda pelo próprio núcleo (sem passar pela API): relê quando a janela volta ao foco
    const foco = () => carregar();
    window.addEventListener("atelier:cofre", f);
    window.addEventListener("focus", foco);
    return () => { window.removeEventListener("atelier:cofre", f); window.removeEventListener("focus", foco); };
  }, [carregar]);
}

function LinhaSegredo({ s, aoMudar, foco }: { s: Segredo; aoMudar: () => void; foco?: boolean }) {
  const [valor, setValor] = useState<string | null>(null);
  const [apagando, setApagando] = useState(false);
  const menu = usePopover();
  const resumo = useResumos(s.documento ? [s.documento] : []).get(s.documento ?? "");
  // aberto pela ficha do documento: rola até ele e destaca
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (foco) ref.current?.scrollIntoView({ block: "center" }); }, [foco]);
  const mostrar = async () => {
    if (valor != null) return setValor(null);
    try { setValor((await api.cofreValor(s.id)).valor); } catch (e) { falhou(e); }
  };
  const obj = valor != null ? objetoJson(valor) : null;
  return (
    <div className={`cofre-linha${foco ? " foco" : ""}`} ref={ref}>
      <KeyRound size={15} className="cofre-icone" />
      <div className="cofre-info">
        <div className="cofre-nome">
          {s.nome}
          {s.chave && <code className="cofre-chave copiavel" title="Clique para copiar a chave" onClick={seNaoSeleciona(() => copiarAberto(s.chave))}>{s.chave}</code>}
          {s.documento && (
            <button className="mencao cofre-doc-nome" title={`Abrir o documento deste segredo (#${s.documento})`} onClick={() => abrirCodigo(s.documento!, (r) => abrir(r))}>
              {resumo ? resumo.titulo || "Sem título" : `#${s.documento}`}
            </button>
          )}
        </div>
        {s.descricao && <div className="cofre-desc">{s.descricao}</div>}
        <div className="cofre-valor">
          {valor == null ? <span>••••••••</span> : obj ? (
            <div className="cofre-kv">
              {Object.entries(obj).map(([k, v]) => (
                <div className="cofre-kv-linha" key={k}>
                  <code className="copiavel" title="Clique para copiar a chave" onClick={seNaoSeleciona(() => copiarAberto(k))}>{k}</code>
                  <code className="copiavel" title="Clique para copiar o valor (limpa a área de transferência em 30 s)"
                    onClick={seNaoSeleciona(() => copiarSecreto(textoDe(v), `${s.nome} › ${k}`))}>{textoDe(v)}</code>
                </div>
              ))}
            </div>
          ) : (
            <code className="copiavel cofre-texto" title="Clique para copiar (limpa a área de transferência em 30 s)"
              onClick={seNaoSeleciona(() => copiarSecreto(valor, s.nome))}>{valor}</code>
          )}
        </div>
      </div>
      <div className="cofre-acoes">
        <button className="btn-icone" title={valor != null ? "Esconder" : "Mostrar o valor"} onClick={mostrar}>{valor != null ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        <button className="btn-icone cofre-copiar" title="Copiar…" onClick={menu.abrir}><Copy size={14} /><ChevronDown size={10} /></button>
        {menu.ancora && (
          <Popover ancora={menu.ancora} aoFechar={menu.fechar} largura={180}>
            <button className="menu-item" onClick={() => { menu.fechar(); copiarSegredo(s.id, s.nome); }}><Lock size={14} /> Copiar segredo</button>
            {s.chave && <button className="menu-item" onClick={() => { menu.fechar(); copiarAberto(s.chave); }}><KeyRound size={14} /> Copiar chave</button>}
          </Popover>
        )}
        <button className="btn-icone" title="Editar" onClick={() => novoSegredo({ inicial: s })}><Pencil size={14} /></button>
        {apagando ? (
          <span className="cofre-confirma">
            Apagar de vez?
            <button className="btn perigo" onClick={() => api.cofreApagar(s.id).then(aoMudar).catch(falhou)}>Sim</button>
            <button className="btn" onClick={() => setApagando(false)}>Não</button>
          </span>
        ) : (
          <button className="btn-icone" title="Apagar do cofre" onClick={() => setApagando(true)}><Trash2 size={14} /></button>
        )}
      </div>
    </div>
  );
}

interface PedidoForm { inicial?: Segredo; documento?: string; aoCriar?: (id: number, nome: string) => void;
  /** o valor já preenchido (o trecho selecionado no texto que vai para o cofre) */
  valorInicial?: string }

/** Abre a janelinha de segredo: novo (já ligado a `documento`, se vier) ou editando `inicial`. */
export function novoSegredo(p: PedidoForm = {}) {
  window.dispatchEvent(new CustomEvent("atelier:form-segredo", { detail: p }));
}

/** A janelinha de criar/editar segredo; fica montada no app (e na janelinha destacada). */
export function JanelaSegredo({ esquema, wsItem }: { esquema: Esquema; wsItem: number | null }) {
  const [p, setP] = useState<(PedidoForm & { n: number }) | null>(null);
  useEffect(() => {
    let n = 0;
    const f = (e: Event) => setP({ ...(e as CustomEvent<PedidoForm>).detail, n: ++n });
    window.addEventListener("atelier:form-segredo", f);
    return () => window.removeEventListener("atelier:form-segredo", f);
  }, []);
  if (!p) return null;
  const fechar = () => {
    setP(null);
    window.dispatchEvent(new CustomEvent("atelier:cofre", { detail: { acao: "cofre-mudou" } }));
  };
  return (
    <div className="modal-fundo topo">
      <div className="modal cofre-modal" role="dialog" aria-label="Segredo">
        <FormSegredo key={p.n} {...p} esquema={esquema} wsItem={wsItem} aoFechar={fechar} />
      </div>
    </div>
  );
}

/** Criar (sem `inicial`) ou editar um segredo. Editando, o valor guardado já vem preenchido; só vai se mudar. */
function FormSegredo({ inicial, documento, esquema, wsItem, aoFechar, aoCriar, valorInicial }: PedidoForm & {
  esquema: Esquema; wsItem: number | null; aoFechar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [chave, setChave] = useState(inicial?.chave ?? "");
  const [valor, setValor] = useState(valorInicial ?? "");
  const [doc, setDoc] = useState(inicial?.documento ?? documento ?? "");
  const [ver, setVer] = useState(false);
  const [aba, setAba] = useState<"texto" | "kv">("texto");
  const [pares, setPares] = useState<Par[]>([]);
  const docPop = usePopover();
  const resumos = useResumos(doc ? [doc] : []);
  // a aba chave/valor só aparece quando o texto é um objeto JSON (ou ainda está vazio, para começar por ela)
  const kvPode = !valor.trim() || objetoJson(valor) != null;

  const irPara = (a: "texto" | "kv", texto = valor) => {
    if (a === "kv") {
      const ps = paraPares(objetoJson(texto) ?? {});
      setPares(ps.length ? ps : [{ k: "", v: "", cru: false }]);
    }
    setAba(a);
  };
  const mudarPares = (n: Par[]) => { setPares(n); setValor(paraTexto(n)); };
  const doWorkspace = async () => {
    if (wsItem == null) return;
    try { const it = await api.item(wsItem); lembrarResumo(it); setDoc(it.codigo); } catch (e) { falhou(e); }
  };
  // editando: o valor guardado já vem no campo (escondido até o olhinho); JSON abre na aba chave/valor
  const [original, setOriginal] = useState<string | null>(null);
  useEffect(() => {
    if (!inicial) return;
    api.cofreValor(inicial.id).then(({ valor: v }) => {
      setOriginal(v);
      setValor(v);
      irPara(objetoJson(v) ? "kv" : "texto", v);
    }).catch(falhou);
  }, [inicial?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const salvar = async () => {
    try {
      if (!nome.trim()) return avisar("O segredo precisa de um nome.");
      if (inicial) {
        if (original != null && !valor) return avisar("O segredo precisa de um valor.");
        const mudouValor = original != null && valor !== original;
        await api.cofreMudar(inicial.id, { nome, descricao, chave, documento: doc || null, ...(mudouValor ? { valor } : {}) });
      } else {
        if (!valor) return avisar("O segredo precisa de um valor.");
        const { id } = await api.cofreCriar({ nome, descricao, chave, valor, documento: doc || null });
        aoCriar?.(id, nome);
      }
      aoFechar();
    } catch (e) {
      falhou(e);
    }
  };
  const mascara = ver ? "" : " mascarado";
  return (
    <div className="cofre-form"
      onKeyDown={(e) => {
        if (e.key === "Escape" && !docPop.ancora) aoFechar();
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar(); }
      }}>
      <div className="cofre-form-titulo">
        <Lock size={16} /> <strong>{inicial ? "Editar segredo" : "Novo segredo"}</strong>
        <span style={{ flex: 1 }} />
        <button className="btn-icone" title="Fechar (Esc)" onClick={aoFechar}><X size={15} /></button>
      </div>

      <label className="cofre-rot">Nome</label>
      <input className="campo" autoFocus placeholder="ex.: Secret do app da API, DEV" value={nome} onChange={(e) => setNome(e.target.value)} />

      <label className="cofre-rot">Descrição</label>
      <textarea className="campo cofre-desc-campo" rows={3} placeholder="De onde veio, para que serve" value={descricao} onChange={(e) => setDescricao(e.target.value)} />

      <label className="cofre-rot">Documento</label>
      <div className="cofre-doc-escolha">
        {doc ? <ChipItem esquema={esquema} r={resumos.get(doc) ?? null} codigo={doc} remover={() => setDoc("")} /> : <span className="cofre-nenhum">Nenhum</span>}
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={docPop.abrir}><Search size={13} /> Buscar</button>
        {wsItem != null && (
          <button className="btn" onClick={doWorkspace} title="Ligar ao documento do workspace em que você está"><LayoutDashboard size={13} /> Workspace atual</button>
        )}
      </div>
      {docPop.ancora && (
        <EscolherItem ancora={docPop.ancora} aoFechar={docPop.fechar} esquema={esquema} selecionados={doc ? [doc] : []} titulo="Documento do segredo"
          aoEscolher={(it) => { lembrarResumo(it); setDoc(it.codigo); docPop.fechar(); }} />
      )}

      <label className="cofre-rot">Chave <span className="cofre-opcional">(opcional, ex.: client_secret, usuário)</span></label>
      <input className="campo cofre-mono" placeholder="client_secret" value={chave} onChange={(e) => setChave(e.target.value)} />

      <div className="cofre-valor-cab">
        <label className="cofre-rot">Valor</label>
        <div className="cofre-abas">
          <button className={aba === "texto" ? "ativo" : ""} onClick={() => irPara("texto")}>Texto</button>
          {(kvPode || aba === "kv") && (
            <button className={aba === "kv" ? "ativo" : ""} title="O JSON como chave e valor" onClick={() => irPara("kv")}>Chave/valor</button>
          )}
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn-icone" title={ver ? "Esconder" : "Ver o que está digitando"} onClick={() => setVer((v) => !v)}>{ver ? <EyeOff size={14} /> : <Eye size={14} />}</button>
      </div>
      {aba === "texto" ? (
        <textarea className={`campo cofre-mono cofre-campo-valor${mascara}`} rows={5} autoComplete="off" spellCheck={false}
          placeholder={inicial && original == null ? "Abrindo o valor…" : "Texto ou JSON ({\"usuario\": \"...\", \"senha\": \"...\"})"}
          value={valor} onChange={(e) => setValor(e.target.value)} />
      ) : (
        <div className="cofre-kv-edita">
          {pares.map((p, i) => (
            <div className="cofre-kv-edita-linha" key={i}>
              <input className="campo cofre-mono" placeholder="chave" value={p.k}
                onChange={(e) => mudarPares(pares.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
              <input className={`campo cofre-mono${mascara}`} placeholder="valor" value={p.v} autoComplete="off" spellCheck={false}
                onChange={(e) => mudarPares(pares.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
              <button className="btn-icone" title="Tirar esta linha" onClick={() => mudarPares(pares.filter((_, j) => j !== i))}><X size={13} /></button>
            </div>
          ))}
          <button className="btn cofre-kv-mais" onClick={() => setPares([...pares, { k: "", v: "", cru: false }])}><Plus size={13} /> Linha</button>
        </div>
      )}

      <div className="cofre-form-acoes">
        <span className="dica-inline">Ctrl+Enter guarda · Esc fecha</span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={aoFechar}>Cancelar</button>
        <button className="btn primario" onClick={salvar}><Lock size={13} /> {inicial ? "Salvar" : "Guardar no cofre"}</button>
      </div>
    </div>
  );
}

/** Todos os segredos da bancada. */
export function TelaCofre({ foco }: { foco?: number }) {
  const [lista, setLista] = useState<Segredo[] | null>(null);
  const [q, setQ] = useState("");
  const [chave, setChave] = useState(false);
  const carregar = useCallback(() => { api.cofre().then(setLista).catch((e) => { setLista([]); falhou(e); }); }, []);
  useCofre(carregar);
  const b = q.trim().toLowerCase().replace(/^#/, "");
  const vis = (lista ?? []).filter((s) => !b || [s.nome, s.descricao, s.chave, s.documento ?? ""].some((x) => x.toLowerCase().includes(b)));
  return (
    <div className="pagina cofre">
      <div className="cofre-topo">
        <h1 className="serif"><Lock size={22} /> Cofre</h1>
        <span className="dica-inline">Os segredos desta bancada, criptografados (a chave fica no cofre do sistema, presa ao seu usuário; para outro computador, “Outro computador”). O agente só lê um valor com você permitindo.</span>
      </div>
      <div className="cofre-barra">
        <span className="cofre-busca"><Search size={14} /><input className="campo" placeholder="Buscar no nome, descrição, chave ou documento…" value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <button className="btn" onClick={() => setChave((v) => !v)} title="Exportar a chave com uma senha, ou usar aqui a chave que veio de outro computador">
          <KeyRound size={14} /> Outro computador
        </button>
        <button className="btn primario" onClick={() => novoSegredo()}><Plus size={14} /> Novo segredo</button>
      </div>
      {chave && <ChaveDoCofre aoMudar={carregar} aoFechar={() => setChave(false)} />}
      {lista == null && <div className="vazio-grande">Abrindo o cofre…</div>}
      {lista?.length === 0 && <div className="vazio-grande">Nenhum segredo ainda. Senha, secret ou token que você receber vem para cá, não para o texto.</div>}
      <div className="cofre-lista">
        {vis.map((s) => <LinhaSegredo key={s.id} s={s} aoMudar={carregar} foco={s.id === foco} />)}
      </div>
    </div>
  );
}

/** Levar o cofre para outro computador: a chave fica no cofre do sistema desta máquina, então a pasta da bancada
 *  copiada chega com o cofre trancado. Aqui a chave sai num arquivo com senha e entra do outro lado. */
function ChaveDoCofre({ aoMudar, aoFechar }: { aoMudar: () => void; aoFechar: () => void }) {
  const [modo, setModo] = useState<"exportar" | "importar">("exportar");
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [arquivo, setArquivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const exportar = async () => {
    if (senha.length < 8) return avisar("A senha precisa de pelo menos 8 caracteres.");
    if (senha !== confirma) return avisar("As duas senhas não batem.");
    let destino: string | null = null;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      destino = await save({ title: "Onde guardar a chave do cofre", defaultPath: "cofre.chave-atelier", filters: [{ name: "Chave do cofre", extensions: ["chave-atelier"] }] });
      if (destino === null) return;
    } catch { destino = null; /* navegador de teste: vai para Downloads */ }
    setOcupado(true);
    try {
      const r = await api.cofreExportarChave(senha, destino);
      avisar(`Chave exportada: ${r.caminho}. Leve o arquivo e a senha (separados) para o outro computador.`);
      aoFechar();
    } catch (e) { falhou(e); } finally { setOcupado(false); }
  };
  const escolher = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const r = await open({ title: "A chave do cofre exportada", filters: [{ name: "Chave do cofre", extensions: ["chave-atelier"] }] });
      if (typeof r === "string") setArquivo(r);
    } catch { /* navegador de teste: digita o caminho */ }
  };
  const importar = async () => {
    if (!arquivo.trim() || !senha) return avisar("Escolha o arquivo e digite a senha.");
    setOcupado(true);
    try {
      await api.cofreImportarChave(senha, arquivo.trim());
      avisar("Pronto: o cofre desta bancada abre com a chave importada.");
      aoMudar();
      aoFechar();
    } catch (e) { falhou(e); } finally { setOcupado(false); }
  };
  return (
    <div className="cofre-levar">
      <div className="cofre-levar-abas">
        <button className={`btn${modo === "exportar" ? " primario" : ""}`} onClick={() => setModo("exportar")}>Levar daqui</button>
        <button className={`btn${modo === "importar" ? " primario" : ""}`} onClick={() => setModo("importar")}>Trazer de lá</button>
        <span style={{ flex: 1 }} />
        <button className="btn-icone" onClick={aoFechar} title="Fechar"><X size={15} /></button>
      </div>
      {modo === "exportar" ? (
        <>
          <p className="dica">A chave que abre este cofre fica presa a esta máquina. Ela sai num arquivo trancado com a senha
            que você escolher. No outro computador, abra a mesma bancada (a pasta copiada) e use “Trazer de lá”.</p>
          <input className="campo" type="password" placeholder="Senha (pelo menos 8 caracteres)" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
          <input className="campo" type="password" placeholder="A senha de novo" value={confirma} onChange={(e) => setConfirma(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && exportar()} />
          <button className="btn primario" disabled={ocupado} onClick={exportar}><KeyRound size={14} /> Exportar a chave</button>
        </>
      ) : (
        <>
          <p className="dica">Use aqui a chave exportada no outro computador: escolha o arquivo e digite a senha dele. Se ela não
            abrir o cofre desta bancada, nada muda.</p>
          <span className="cofre-levar-arquivo">
            <input className="campo" placeholder="Arquivo .chave-atelier" value={arquivo} onChange={(e) => setArquivo(e.target.value)} />
            <button className="btn" onClick={escolher}>Escolher…</button>
          </span>
          <input className="campo" type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && importar()} />
          <button className="btn primario" disabled={ocupado} onClick={importar}><Lock size={14} /> Usar esta chave</button>
        </>
      )}
    </div>
  );
}

/** Na ficha do documento o segredo é só nome e descrição; o clique abre ele no Cofre (valor, copiar, editar). */
function ItemDaFicha({ s }: { s: Segredo }) {
  return (
    <button className="cofre-ficha-item" title="Abrir no Cofre (ver, copiar, editar)"
      onClick={(e) => abrir({ v: "cofre", segredo: s.id }, e.ctrlKey || e.metaKey)}>
      <KeyRound size={14} className="cofre-icone" />
      <span className="cofre-info">
        <span className="cofre-nome">{s.nome}</span>
        {s.descricao && <span className="cofre-desc">{s.descricao}</span>}
      </span>
    </button>
  );
}

/** A parte "Segredos" da página do documento: os dele e, à parte, os dos descendentes (a cadeia). */
export function SegredosDoDocumento({ codigo }: { codigo: string }) {
  const [lista, setLista] = useState<Segredo[]>([]);
  const carregar = useCallback(() => { api.cofre({ de: codigo }).then(setLista).catch(() => setLista([])); }, [codigo]);
  useCofre(carregar);
  const novo = () => novoSegredo({ documento: codigo });
  const proprios = lista.filter((s) => s.documento === codigo);
  const dosFilhos = lista.filter((s) => s.documento !== codigo);
  if (!lista.length) {
    return (
      <div className="cofre-doc vazio">
        <button className="btn" onClick={novo} title="Guardar uma senha, secret ou token ligado a este documento"><Lock size={13} /> Guardar segredo</button>
      </div>
    );
  }
  return (
    <div className="cofre-doc">
      <div className="cofre-doc-cab">
        <Lock size={14} /> <strong>Segredos</strong> <span className="ck-conta">{lista.length}</span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={novo}><Plus size={13} /> Guardar segredo</button>
      </div>
      {proprios.map((s) => <ItemDaFicha key={s.id} s={s} />)}
      {dosFilhos.length > 0 && (
        <details className="cofre-filhos">
          <summary>Dos descendentes ({dosFilhos.length})</summary>
          {dosFilhos.map((s) => <ItemDaFicha key={s.id} s={s} />)}
        </details>
      )}
    </div>
  );
}

interface Pedido {
  pedido: number;
  agente: string;
  motivo: string;
  segredo: { id: number; nome: string; descricao: string; chave: string; documento: string | null };
}

/** "O agente quer o segredo X": permitir por alguns minutos (padrão 5), só desta vez, ou negar. */
export function PedidoDoAgente() {
  const [fila, setFila] = useState<Pedido[]>([]);
  const [minutos, setMinutos] = useState(5);
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<Pedido & { acao: string }>).detail;
      if (d.acao === "cofre-pedido") setFila((l) => [...l.filter((x) => x.pedido !== d.pedido), d]);
      if (d.acao === "cofre-pedido-fim") setFila((l) => l.filter((x) => x.pedido !== d.pedido));
    };
    window.addEventListener("atelier:cofre", f);
    return () => window.removeEventListener("atelier:cofre", f);
  }, []);
  const p = fila[0];
  if (!p) return null;
  const responder = (permitir: boolean, min: number) => {
    setFila((l) => l.slice(1));
    api.cofreResponder(p.pedido, permitir, min).catch(falhou);
  };
  return (
    <div className="modal-fundo">
      <div className="modal cofre-pedido" role="alertdialog" aria-label="Pedido de segredo">
        <div className="cofre-pedido-cab"><Bot size={18} /> <strong>{p.agente}</strong> quer usar um segredo</div>
        <div className="cofre-pedido-segredo">
          <KeyRound size={15} /> <strong>{p.segredo.nome}</strong>
          {p.segredo.chave && <code className="cofre-levar">{p.segredo.chave}</code>}
          {p.segredo.documento && <span className="dica-inline">#{p.segredo.documento}</span>}
        </div>
        {p.segredo.descricao && <div className="cofre-desc">{p.segredo.descricao}</div>}
        {p.motivo && <div className="cofre-pedido-motivo">Para quê: “{p.motivo}”</div>}
        <div className="cofre-pedido-acoes">
          <button className="btn perigo" onClick={() => responder(false, 0)}><X size={14} /> Negar</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={() => responder(true, 0)}>Só desta vez</button>
          <span className="cofre-pedido-tempo">
            <button className="btn primario" autoFocus onClick={() => responder(true, minutos)}>Permitir por</button>
            <select className="campo" value={minutos} onChange={(e) => setMinutos(Number(e.target.value))}>
              {[1, 5, 15, 30, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
            </select>
          </span>
        </div>
        <div className="dica" style={{ marginTop: 8 }}>Por tempo: neste prazo, o agente lê esse segredo de novo sem perguntar. Toda leitura fica na linha do tempo do documento.</div>
        {fila.length > 1 && <div className="dica">Mais {fila.length - 1} pedido(s) depois deste.</div>}
      </div>
    </div>
  );
}
