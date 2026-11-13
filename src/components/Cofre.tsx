// Cofre de segredos da bancada (o arquivo `cofre.db`, todo criptografado; a chave fica no cofre do Windows).
// - TelaCofre: todos os segredos da bancada, com busca;
// - SegredosDoDocumento: a parte "Segredos" da página do documento (os dele e os dos descendentes);
// - PedidoDoAgente: a caixa "o agente quer o segredo X: Permitir por 5 min / Só desta vez / Negar".
// O valor nunca vem na lista: só ao clicar em mostrar ou copiar (e a área de transferência se limpa em 30 s).
import { useCallback, useEffect, useState } from "react";
import { Bot, Copy, Eye, EyeOff, KeyRound, Lock, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { api, Segredo } from "../api";
import { avisar, falhou } from "../ui";
import { abrirCodigo } from "./Mencoes";
import { abrir } from "../ui";

const LIMPAR_EM = 30_000;
let limpeza = 0;

/** Copia o valor e limpa a área de transferência depois de 30 s. */
export async function copiarSegredo(id: number, nome: string) {
  try {
    const { valor } = await api.cofreValor(id);
    await navigator.clipboard.writeText(valor);
    avisar(`Copiado: ${nome}. A área de transferência se limpa em 30 s.`);
    window.clearTimeout(limpeza);
    limpeza = window.setTimeout(() => { navigator.clipboard.writeText("").catch(() => {}); }, LIMPAR_EM);
  } catch (e) {
    falhou(e);
  }
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

function LinhaSegredo({ s, aoMudar, mostrarDocumento = true }: { s: Segredo; aoMudar: () => void; mostrarDocumento?: boolean }) {
  const [valor, setValor] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const mostrar = async () => {
    if (valor != null) return setValor(null);
    try { setValor((await api.cofreValor(s.id)).valor); } catch (e) { falhou(e); }
  };
  if (editando) return <FormSegredo inicial={s} aoFechar={() => { setEditando(false); aoMudar(); }} />;
  return (
    <div className="cofre-linha">
      <KeyRound size={15} className="cofre-icone" />
      <div className="cofre-info">
        <div className="cofre-nome">
          {s.nome}
          {s.chave && <code className="cofre-chave">{s.chave}</code>}
          {mostrarDocumento && s.documento && (
            <button className="mencao" title="Abrir o documento que gerou este segredo" onClick={() => abrirCodigo(s.documento!, (r) => abrir(r))}>#{s.documento}</button>
          )}
        </div>
        {s.descricao && <div className="cofre-desc">{s.descricao}</div>}
        <div className="cofre-valor">{valor != null ? <code>{valor}</code> : <span>••••••••</span>}</div>
      </div>
      <div className="cofre-acoes">
        <button className="btn-icone" title={valor != null ? "Esconder" : "Mostrar o valor"} onClick={mostrar}>{valor != null ? <EyeOff size={14} /> : <Eye size={14} />}</button>
        <button className="btn-icone" title="Copiar o valor (limpa a área de transferência em 30 s)" onClick={() => copiarSegredo(s.id, s.nome)}><Copy size={14} /></button>
        <button className="btn-icone" title="Editar" onClick={() => setEditando(true)}><Pencil size={14} /></button>
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

/** Criar (sem `inicial`) ou editar um segredo. Editando, o valor só muda se você digitar um novo. */
export function FormSegredo({ inicial, documento, aoFechar, aoCriar }: {
  inicial?: Segredo; documento?: string; aoFechar: () => void; aoCriar?: (id: number, nome: string) => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [chave, setChave] = useState(inicial?.chave ?? "");
  const [valor, setValor] = useState("");
  const [doc, setDoc] = useState(inicial?.documento ?? documento ?? "");
  const [ver, setVer] = useState(false);
  const salvar = async () => {
    try {
      if (inicial) {
        await api.cofreMudar(inicial.id, { nome, descricao, chave, documento: doc.trim() || null, ...(valor ? { valor } : {}) });
      } else {
        if (!nome.trim() || !valor) return avisar("O segredo precisa de nome e valor.");
        const { id } = await api.cofreCriar({ nome, descricao, chave, valor, documento: doc.trim() || null });
        aoCriar?.(id, nome);
      }
      aoFechar();
    } catch (e) {
      falhou(e);
    }
  };
  return (
    <div className="cofre-form" onKeyDown={(e) => { if (e.key === "Escape") aoFechar(); }}>
      <input className="campo" autoFocus placeholder="Nome (ex.: Secret do app da API, DEV)" value={nome} onChange={(e) => setNome(e.target.value)} />
      <input className="campo" placeholder="Descrição (de onde veio, para que serve)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      <div className="cofre-form-linha">
        <input className="campo" placeholder="Chave (ex.: client_secret)" value={chave} onChange={(e) => setChave(e.target.value)} />
        <input className="campo" placeholder="Documento (#código)" value={doc} onChange={(e) => setDoc(e.target.value.replace(/^#/, ""))} style={{ maxWidth: 150 }} />
      </div>
      <div className="cofre-form-linha">
        <input className="campo cofre-campo-valor" type={ver ? "text" : "password"} autoComplete="off"
          placeholder={inicial ? "Novo valor (vazio: fica o atual)" : "Valor"} value={valor}
          onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} />
        <button className="btn-icone" title={ver ? "Esconder" : "Ver o que está digitando"} onClick={() => setVer((v) => !v)}>{ver ? <EyeOff size={14} /> : <Eye size={14} />}</button>
      </div>
      <div className="cofre-form-acoes">
        <button className="btn" onClick={aoFechar}>Cancelar</button>
        <button className="btn primario" onClick={salvar}><Lock size={13} /> {inicial ? "Salvar" : "Guardar no cofre"}</button>
      </div>
    </div>
  );
}

/** Todos os segredos da bancada. */
export function TelaCofre() {
  const [lista, setLista] = useState<Segredo[] | null>(null);
  const [q, setQ] = useState("");
  const [novo, setNovo] = useState(false);
  const carregar = useCallback(() => { api.cofre().then(setLista).catch((e) => { setLista([]); falhou(e); }); }, []);
  useCofre(carregar);
  const b = q.trim().toLowerCase().replace(/^#/, "");
  const vis = (lista ?? []).filter((s) => !b || [s.nome, s.descricao, s.chave, s.documento ?? ""].some((x) => x.toLowerCase().includes(b)));
  return (
    <div className="pagina cofre">
      <div className="cofre-topo">
        <h1 className="serif"><Lock size={22} /> Cofre</h1>
        <span className="dica-inline">Os segredos desta bancada, criptografados (a chave fica no cofre do Windows, presa ao seu usuário). O agente só lê um valor com você permitindo.</span>
      </div>
      <div className="cofre-barra">
        <span className="cofre-busca"><Search size={14} /><input className="campo" placeholder="Buscar no nome, descrição, chave ou documento…" value={q} onChange={(e) => setQ(e.target.value)} /></span>
        <button className="btn primario" onClick={() => setNovo(true)}><Plus size={14} /> Novo segredo</button>
      </div>
      {novo && <FormSegredo aoFechar={() => { setNovo(false); carregar(); }} />}
      {lista == null && <div className="vazio-grande">Abrindo o cofre…</div>}
      {lista?.length === 0 && !novo && <div className="vazio-grande">Nenhum segredo ainda. Senha, secret ou token que você receber vem para cá, não para o texto.</div>}
      <div className="cofre-lista">
        {vis.map((s) => <LinhaSegredo key={s.id} s={s} aoMudar={carregar} />)}
      </div>
    </div>
  );
}

/** A parte "Segredos" da página do documento: os dele e, à parte, os dos descendentes (a cadeia). */
export function SegredosDoDocumento({ codigo }: { codigo: string }) {
  const [lista, setLista] = useState<Segredo[]>([]);
  const [novo, setNovo] = useState(false);
  const carregar = useCallback(() => { api.cofre({ de: codigo }).then(setLista).catch(() => setLista([])); }, [codigo]);
  useCofre(carregar);
  const proprios = lista.filter((s) => s.documento === codigo);
  const dosFilhos = lista.filter((s) => s.documento !== codigo);
  if (!lista.length && !novo) {
    return (
      <div className="cofre-doc vazio">
        <button className="btn" onClick={() => setNovo(true)} title="Guardar uma senha, secret ou token ligado a este documento"><Lock size={13} /> Guardar segredo</button>
      </div>
    );
  }
  return (
    <div className="cofre-doc">
      <div className="cofre-doc-cab">
        <Lock size={14} /> <strong>Segredos</strong> <span className="ck-conta">{lista.length}</span>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setNovo(true)}><Plus size={13} /> Guardar segredo</button>
      </div>
      {novo && <FormSegredo documento={codigo} aoFechar={() => { setNovo(false); carregar(); }} />}
      {proprios.map((s) => <LinhaSegredo key={s.id} s={s} aoMudar={carregar} mostrarDocumento={false} />)}
      {dosFilhos.length > 0 && (
        <details className="cofre-filhos">
          <summary>Dos descendentes ({dosFilhos.length})</summary>
          {dosFilhos.map((s) => <LinhaSegredo key={s.id} s={s} aoMudar={carregar} />)}
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
          {p.segredo.chave && <code className="cofre-chave">{p.segredo.chave}</code>}
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
