import { useEffect, useState } from "react";
import {
  CalendarDays, Clock, ExternalLink, Flag, Hash, Link2, Mail, PenLine, Phone, Plus, SquareCheck, Tag, Tags, Waypoints, X,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  acrescentarOpcao, api, ConfigProp, Cor, corAleatoria, LISTAVEIS, Especie, Esquema, Item, Link as LinkItem, Opcao, opcoesDe, Propriedade, Valor,
} from "../api";
import { abrir } from "../ui";
import { lembrarResumo, useResumos } from "../resumos";
import { Popover, usePopover } from "./Popover";

export function IconeEspecie({ especie, tam = 15 }: { especie: Especie; tam?: number }) {
  const P = { size: tam, strokeWidth: 1.8 };
  switch (especie) {
    case "texto": return <PenLine {...P} />;
    case "numero": return <Hash {...P} />;
    case "data": return <CalendarDays {...P} />;
    case "checkbox": return <SquareCheck {...P} />;
    case "url": return <Link2 {...P} />;
    case "selecao": return <Tag {...P} />;
    case "multisselecao": return <Tags {...P} />;
    case "status": return <Flag {...P} />;
    case "relacao": return <Waypoints {...P} />;
    case "links": return <Link2 {...P} />;
    case "email": return <Mail {...P} />;
    case "telefone": return <Phone {...P} />;
    case "criado_em": case "atualizado_em": return <Clock {...P} />;
  }
}

export function Etiqueta({ opcao, status }: { opcao: Opcao; status?: boolean }) {
  return (
    <span className={`tag cor-${opcao.cor ?? "gray"}${status ? " status" : ""}${opcao.historico ? " historico" : ""}`}>
      {status && <span className="marcador" />}
      {opcao.nome}
    </span>
  );
}

/** "vencida" (antes de hoje), "perto" (até 3 dias) ou "" */
export function urgencia(iso: string) {
  const z = (n: number) => String(n).padStart(2, "0");
  const d = new Date();
  const hoje = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  d.setDate(d.getDate() + 3);
  const em3 = `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  const v = iso.slice(0, 10);
  return v < hoje ? "vencida" : v <= em3 ? "perto" : "";
}

export function dataBR(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return d && m && a ? `${d}/${m}/${a}` : iso;
}

/** Valor da propriedade no item (as automáticas vêm do próprio item). */
export function valorDe(it: Item, p: Propriedade): Valor | undefined {
  if (p.especie === "criado_em") return it.criado_em;
  if (p.especie === "atualizado_em") return it.atualizado_em;
  return it.props[p.id];
}

/** Número como o Paulo lê: 1.234,5 · 12% · R$ 1.234,50 (conforme a config). */
export function formatarNumero(n: number, c: ConfigProp = {}) {
  const casas = c.inteiro ? 0 : c.casas ?? undefined;
  const o: Intl.NumberFormatOptions = { minimumFractionDigits: casas, maximumFractionDigits: casas ?? 6 };
  if (c.formato === "percentual") return `${n.toLocaleString("pt-BR", o)}%`;
  if (c.formato === "moeda") return n.toLocaleString("pt-BR", { ...o, style: "currency", currency: "BRL" });
  return n.toLocaleString("pt-BR", o);
}

/** Valor simples em texto, conforme a espécie (para chips de lista, resumo e exportar). */
export function textoSimples(v: Valor | undefined, p: Propriedade): string {
  if (v == null || v === "") return "";
  if (p.especie === "numero" && typeof v === "number") return formatarNumero(v, p.config);
  if (p.especie === "data" && typeof v === "string") return v.length > 10 ? `${dataBR(v)} ${v.slice(11, 16)}` : dataBR(v);
  if (p.especie === "criado_em" || p.especie === "atualizado_em") return typeof v === "string" ? `${dataBR(v)} ${v.slice(11, 16)}` : "";
  return String(v);
}

/** Mostra o valor de uma propriedade e deixa editar no lugar, conforme a espécie. */
export function ValorProp({
  esquema, prop, tipoId, valor, aoMudar, aoMudarEsquema, classe = "prop-valor", proprio,
}: {
  /** código do item dono do valor (relação não aponta para ele mesmo) */
  proprio?: string;
  esquema: Esquema;
  prop: Propriedade;
  tipoId: number | null;
  valor: Valor | undefined;
  aoMudar: (v: Valor) => void;
  aoMudarEsquema: () => void;
  classe?: string;
}) {
  const pop = usePopover();
  const [editando, setEditando] = useState(false);
  const vazio = <span className="vazio">Vazio</span>;
  const opcoes = opcoesDe(esquema, prop, tipoId);
  const achar = (nome: string): Opcao => opcoes.find((o) => o.nome === nome) ?? { nome };

  if (prop.config?.lista && LISTAVEIS.includes(prop.especie)) {
    return <ValorLista prop={prop} valor={valor} aoMudar={aoMudar} classe={classe} />;
  }

  switch (prop.especie) {
    case "criado_em":
    case "atualizado_em":
      return <div className={classe} title="Preenchida pelo atelier"><span style={{ color: "var(--texto-2)" }}>{textoSimples(valor, prop) || "—"}</span></div>;

    case "checkbox":
      return (
        <div className={classe} onClick={() => aoMudar(!valor)}>
          <input type="checkbox" checked={!!valor} readOnly style={{ accentColor: "var(--acento)", width: 16, height: 16 }} />
        </div>
      );

    case "texto":
    case "numero":
    case "url":
    case "email":
    case "telefone":
    case "data": {
      if (editando) {
        const comHora = prop.especie === "data" && !!prop.config?.hora;
        const tipoInput = prop.especie === "numero" ? "number" : prop.especie === "data" ? (comHora ? "datetime-local" : "date")
          : prop.especie === "email" ? "email" : prop.especie === "telefone" ? "tel" : "text";
        const gravar = (s: string) => {
          setEditando(false);
          const v = s.trim() === "" ? null : prop.especie === "numero" ? Number(s) : s.trim();
          if (v !== (valor ?? null)) aoMudar(v);
        };
        return (
          <div className={`${classe} editando`}>
            <input
              className="inline"
              type={tipoInput}
              step={prop.especie === "numero" ? (prop.config?.inteiro ? 1 : "any") : undefined}
              autoFocus
              defaultValue={valor == null ? "" : comHora && typeof valor === "string" && valor.length === 10 ? `${valor}T00:00` : String(valor)}
              onBlur={(e) => gravar(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") gravar(e.currentTarget.value);
                if (e.key === "Escape") setEditando(false);
              }}
            />
          </div>
        );
      }
      let mostra = valor == null || valor === "" ? vazio : <span>{textoSimples(valor, prop)}</span>;
      if (prop.especie === "data" && typeof valor === "string") mostra = <span className={`data ${urgencia(valor)}`}>{textoSimples(valor, prop)}</span>;
      if (prop.especie === "numero" && typeof valor === "number") mostra = <span style={{ fontVariantNumeric: "tabular-nums" }}>{textoSimples(valor, prop)}</span>;
      if (prop.especie === "url" && typeof valor === "string" && valor) {
        mostra = (
          <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ textDecoration: "underline", textUnderlineOffset: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {valor}
            </span>
            <button
              className="btn-icone"
              style={{ width: 22, height: 22 }}
              title="Abrir no navegador"
              onClick={(e) => { e.stopPropagation(); openUrl(valor).catch(() => window.open(valor)); }}
            >
              <ExternalLink size={13} />
            </button>
          </span>
        );
      }
      // Ctrl+clique num link abre em vez de editar
      return (
        <div
          className={classe}
          title={["url", "email", "telefone"].includes(prop.especie) && valor ? "Ctrl+clique para abrir" : undefined}
          onClick={(e) => {
            if (["url", "email", "telefone"].includes(prop.especie) && typeof valor === "string" && valor && (e.ctrlKey || e.metaKey)) {
              const u = prop.especie === "email" ? `mailto:${valor}` : prop.especie === "telefone" ? `tel:${valor.replace(/[^\d+]/g, "")}` : valor;
              openUrl(u).catch(() => window.open(u));
              return;
            }
            setEditando(true);
          }}
        >
          {mostra}
        </div>
      );
    }

    case "selecao":
    case "status":
    case "multisselecao": {
      const multi = prop.especie === "multisselecao";
      const lista: string[] = multi
        ? Array.isArray(valor) ? (valor as string[]) : valor ? [String(valor)] : []
        : valor ? [String(valor)] : [];
      return (
        <>
          <div className={`${classe}${pop.ancora ? " editando" : ""}`} onClick={pop.abrir}>
            {lista.length === 0 ? vazio : (
              <span className="tags">
                {lista.map((n) => <Etiqueta key={n} opcao={achar(n)} status={prop.especie === "status"} />)}
              </span>
            )}
          </div>
          {pop.ancora && (
            <EscolherOpcao
              ancora={pop.ancora}
              aoFechar={pop.fechar}
              opcoes={opcoes}
              selecionadas={lista}
              status={prop.especie === "status"}
              aoEscolher={(nome) => {
                if (multi) {
                  const novo = lista.includes(nome) ? lista.filter((x) => x !== nome) : [...lista, nome];
                  aoMudar(novo.length ? novo : null);
                } else {
                  aoMudar(nome === lista[0] ? null : nome);
                  pop.fechar();
                }
              }}
              aoCriar={async (nome) => {
                await acrescentarOpcao(esquema, prop, tipoId, { nome, cor: corAleatoria() });
                aoMudarEsquema();
                if (multi) aoMudar([...lista, nome]);
                else { aoMudar(nome); pop.fechar(); }
              }}
              aoLimpar={() => { aoMudar(null); pop.fechar(); }}
            />
          )}
        </>
      );
    }

    case "links":
      return <ValorLinks valor={valor} aoMudar={aoMudar} classe={classe} />;

    case "relacao":
      return <ValorRelacao esquema={esquema} prop={prop} valor={valor} aoMudar={aoMudar} classe={classe} proprio={proprio} />;
  }
}

// Ferramenta de cada link, pelo endereço: o rótulo curto e a cor do selo (sem logos de terceiros)
const FERRAMENTAS: [RegExp, string, Cor][] = [
  [/dev\.azure\.com|visualstudio\.com/i, "ADO", "blue"],
  [/github\.com/i, "GitHub", "gray"],
  [/gitlab/i, "GitLab", "orange"],
  [/atlassian\.net\/wiki|confluence/i, "Confluence", "blue"],
  [/atlassian\.net|jira/i, "Jira", "blue"],
  [/sharepoint\.com|onedrive/i, "SharePoint", "green"],
  [/teams\.microsoft\.com/i, "Teams", "purple"],
  [/docs\.google\.com|drive\.google\.com/i, "Google", "yellow"],
  [/figma\.com/i, "Figma", "pink"],
  [/notion\.so/i, "Notion", "gray"],
  [/slack\.com/i, "Slack", "purple"],
  [/console\.aws\.amazon\.com|awsapps\.com/i, "AWS", "orange"],
  [/portal\.azure\.com/i, "Azure", "blue"],
  [/service-?now/i, "ServiceNow", "green"],
];
const CORES_LINK: Cor[] = ["blue", "green", "purple", "orange", "pink", "brown", "red", "yellow"];

/** "ADO", "GitHub"... ou, se não conhece, o primeiro pedaço do endereço ("Intranet"). */
export function ferramentaDo(url: string): { nome: string; cor: Cor } {
  for (const [re, nome, cor] of FERRAMENTAS) if (re.test(url)) return { nome, cor };
  let host = url;
  try { host = new URL(url).hostname; } catch { /* não é URL completa */ }
  const nome = host.replace(/^www\./, "").split(".")[0] || "link";
  const cap = nome.charAt(0).toUpperCase() + nome.slice(1);
  let h = 0;
  for (const ch of cap) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { nome: cap, cor: CORES_LINK[h % CORES_LINK.length] };
}

function linksDe(valor: Valor | undefined): LinkItem[] {
  if (!Array.isArray(valor)) return typeof valor === "string" && valor ? [{ url: valor }] : [];
  return (valor as (LinkItem | string)[]).map((x) => (typeof x === "string" ? { url: x } : x));
}

/** Vários links por item, cada um com o selo da ferramenta. Clique abre; o + acrescenta. */
function ValorLinks({ valor, aoMudar, classe }: { valor: Valor | undefined; aoMudar: (v: Valor) => void; classe: string }) {
  const pop = usePopover();
  const lista = linksDe(valor);
  const [url, setUrl] = useState("");
  const [rotulo, setRotulo] = useState("");
  const por = () => {
    const u = url.trim();
    if (!u) return;
    aoMudar([...lista, rotulo.trim() ? { url: u, rotulo: rotulo.trim() } : { url: u }]);
    setUrl("");
    setRotulo("");
    pop.fechar();
  };
  return (
    <>
      <div className={`${classe}${pop.ancora ? " editando" : ""}`} onClick={pop.abrir}>
        {lista.length === 0 ? <span className="vazio">Vazio</span> : (
          <span className="links">
            {lista.map((l, i) => {
              const f = ferramentaDo(l.url);
              return (
                <span key={i} className="link-chip" title={l.url}>
                  <button onClick={(e) => { e.stopPropagation(); openUrl(l.url).catch(() => window.open(l.url)); }}>
                    <span className={`selo cor-${f.cor}`}>{f.nome}</span>
                    <span className="link-rotulo">{l.rotulo ?? l.url.replace(/^https?:\/\//, "")}</span>
                  </button>
                  <button className="rel-tirar" title="Tirar" onClick={(e) => { e.stopPropagation(); const n = lista.filter((_, k) => k !== i); aoMudar(n.length ? n : null); }}><X size={11} /></button>
                </span>
              );
            })}
          </span>
        )}
      </div>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={320}>
          <div className="menu-rotulo">Novo link</div>
          <input className="campo" autoFocus placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && por()} />
          <input className="campo" placeholder="Rótulo (opcional, ex.: Work item 123)" value={rotulo} onChange={(e) => setRotulo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && por()} />
          {url.trim() && <div className="menu-rotulo">Ferramenta: {ferramentaDo(url.trim()).nome}</div>}
          <button className="menu-item" onClick={por} disabled={!url.trim()}><Plus size={14} /> Acrescentar</button>
        </Popover>
      )}
    </>
  );
}

/** Vários valores (lista de textos, números, datas...): chips; o + acrescenta, o x tira. */
function ValorLista({ prop, valor, aoMudar, classe }: { prop: Propriedade; valor: Valor | undefined; aoMudar: (v: Valor) => void; classe: string }) {
  const pop = usePopover();
  const lista: (string | number)[] = Array.isArray(valor) ? (valor as (string | number)[]) : valor == null || valor === "" ? [] : [valor as string];
  const [novo, setNovo] = useState("");
  const tipo = prop.especie === "numero" ? "number" : prop.especie === "data" ? (prop.config?.hora ? "datetime-local" : "date")
    : prop.especie === "email" ? "email" : prop.especie === "telefone" ? "tel" : "text";
  const por = () => {
    const s = novo.trim();
    if (!s) return;
    aoMudar([...lista, prop.especie === "numero" ? Number(s.replace(",", ".")) : s] as Valor);
    setNovo("");
  };
  return (
    <>
      <div className={`${classe}${pop.ancora ? " editando" : ""}`} onClick={pop.abrir}>
        {lista.length === 0 ? <span className="vazio">Vazio</span> : (
          <span className="tags">
            {lista.map((x, i) => <span key={i} className="tag cor-gray">{textoSimples(x, prop)}</span>)}
          </span>
        )}
      </div>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={() => { por(); pop.fechar(); }} largura={280}>
          <div className="menu-rotulo">{prop.nome}</div>
          {lista.map((x, i) => (
            <div key={i} className="menu-item">
              {textoSimples(x, prop)}
              <button className="dir btn-icone mini" title="Tirar" onClick={() => { const n = lista.filter((_, k) => k !== i); aoMudar(n.length ? (n as Valor) : null); }}><X size={12} /></button>
            </div>
          ))}
          <input className="campo" autoFocus type={tipo} step={prop.especie === "numero" ? "any" : undefined} placeholder="Acrescentar… (Enter)" value={novo}
            onChange={(e) => setNovo(e.target.value)} onKeyDown={(e) => e.key === "Enter" && por()} />
        </Popover>
      )}
    </>
  );
}

/** Códigos guardados numa relação (tolera valor solto). */
export function codigos(valor: Valor | undefined): string[] {
  return Array.isArray(valor) ? (valor as string[]) : typeof valor === "string" && valor ? [valor] : [];
}

/** Chip de um item: abre com clique (Ctrl+clique: ao lado). */
export function ChipItem({ esquema, r, codigo, remover }: {
  esquema: Esquema;
  r: { id: number; codigo: string; titulo: string; tipo_id: number | null; na_lixeira?: boolean } | null;
  codigo?: string;
  remover?: () => void;
}) {
  const t = esquema.tipos.find((x) => x.id === r?.tipo_id);
  return (
    <span className={`rel-chip${r?.na_lixeira ? " na-lixeira" : ""}`}>
      <button
        onClick={(e) => { e.stopPropagation(); if (r) abrir({ v: "item", id: r.id }, e.ctrlKey || e.metaKey); }}
        onAuxClick={(e) => { if (e.button === 1 && r) { e.preventDefault(); abrir({ v: "item", id: r.id }, true); } }}
        title={r?.na_lixeira ? "Está na lixeira" : "Abrir (Ctrl+clique: ao lado)"}
      >
        <span>{t?.icone ?? "·"}</span>
        <span className="id-item">#{r?.codigo ?? codigo}</span>
        <span className="rel-titulo">{r ? r.titulo || "Sem título" : "…"}</span>
      </button>
      {remover && <button className="rel-tirar" title="Desligar" onClick={(e) => { e.stopPropagation(); remover(); }}><X size={11} /></button>}
    </span>
  );
}

function ValorRelacao({ esquema, prop, valor, aoMudar, classe, proprio }: {
  esquema: Esquema; prop: Propriedade; valor: Valor | undefined; aoMudar: (v: Valor) => void; classe: string; proprio?: string;
}) {
  const pop = usePopover();
  const lista = codigos(valor);
  const resumos = useResumos(lista);
  const umSo = !!prop.config?.um_so;
  const tirar = (c: string) => { const n = lista.filter((x) => x !== c); aoMudar(n.length ? n : null); };
  return (
    <>
      <div className={`${classe}${pop.ancora ? " editando" : ""}`} onClick={pop.abrir}>
        {lista.length === 0 ? <span className="vazio">Vazio</span> : (
          <span className="rel-lista">
            {lista.map((c) => <ChipItem key={c} esquema={esquema} r={resumos.get(c) ?? null} codigo={c} remover={() => tirar(c)} />)}
          </span>
        )}
      </div>
      {pop.ancora && (
        <EscolherItem
          ancora={pop.ancora}
          aoFechar={pop.fechar}
          esquema={esquema}
          selecionados={lista}
          proprio={proprio}
          titulo={prop.nome}
          aoEscolher={(it) => {
            lembrarResumo(it);
            if (lista.includes(it.codigo)) tirar(it.codigo);
            else aoMudar(umSo ? [it.codigo] : [...lista, it.codigo]);
            if (umSo) pop.fechar();
          }}
        />
      )}
    </>
  );
}

/** Busca um item (título ou código) para ligar. */
export function EscolherItem({ ancora, aoFechar, esquema, selecionados, proprio, titulo, aoEscolher }: {
  ancora: HTMLElement; aoFechar: () => void; esquema: Esquema; selecionados: string[]; proprio?: string; titulo: string;
  aoEscolher: (it: Item) => void;
}) {
  const [q, setQ] = useState("");
  const [achados, setAchados] = useState<Item[]>([]);
  useEffect(() => {
    const t = window.setTimeout(() => api.itens({ q }).then((l) => setAchados(l.filter((x) => x.codigo !== proprio).slice(0, 12))).catch(() => {}), 150);
    return () => window.clearTimeout(t);
  }, [q, proprio]);
  return (
    <Popover ancora={ancora} aoFechar={aoFechar} largura={340}>
      <div className="menu-rotulo">{titulo}</div>
      <input className="campo" autoFocus placeholder="Buscar item (título ou código)…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && achados[0]) aoEscolher(achados[0]); }} />
      {achados.map((o) => {
        const t = esquema.tipos.find((x) => x.id === o.tipo_id);
        return (
          <button key={o.id} className="menu-item" onClick={() => aoEscolher(o)}>
            <span className="tipo-chip pequeno">{t?.icone ?? "·"}</span>
            <span className="id-item">#{o.codigo}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.titulo || "Sem título"}</span>
            {selecionados.includes(o.codigo) && <span className="dir">✓</span>}
          </button>
        );
      })}
    </Popover>
  );
}

function EscolherOpcao({
  ancora, aoFechar, opcoes, selecionadas, status, aoEscolher, aoCriar, aoLimpar,
}: {
  ancora: HTMLElement;
  aoFechar: () => void;
  opcoes: Opcao[];
  selecionadas: string[];
  status: boolean;
  aoEscolher: (nome: string) => void;
  aoCriar: (nome: string) => void;
  aoLimpar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const b = busca.trim().toLowerCase();
  const filtradas = opcoes.filter((o) => o.nome.toLowerCase().includes(b));
  const exata = opcoes.some((o) => o.nome.toLowerCase() === b);
  const ativas = filtradas.filter((o) => !o.historico);
  const historico = filtradas.filter((o) => o.historico);

  const linha = (o: Opcao) => (
    <button key={o.nome} className="menu-item" onClick={() => aoEscolher(o.nome)}>
      <Etiqueta opcao={o} status={status} />
      {selecionadas.includes(o.nome) && <span className="dir">✓</span>}
    </button>
  );

  return (
    <Popover ancora={ancora} aoFechar={aoFechar} largura={260}>
      <input
        className="campo"
        autoFocus
        placeholder="Buscar ou criar opção…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || !b) return;
          if (filtradas.length === 1) aoEscolher(filtradas[0].nome);
          else if (!exata) aoCriar(busca.trim());
        }}
      />
      {status && ativas.length > 0 && historico.length > 0 && <div className="menu-rotulo">Ativos</div>}
      {ativas.map(linha)}
      {historico.length > 0 && <div className="menu-rotulo">{status ? "Histórico" : ""}</div>}
      {historico.map(linha)}
      {b && !exata && (
        <button className="menu-item" onClick={() => aoCriar(busca.trim())}>
          <Plus size={14} /> Criar <span className="tag cor-gray">{busca.trim()}</span>
        </button>
      )}
      {selecionadas.length > 0 && (
        <>
          <div className="menu-sep" />
          <button className="menu-item" onClick={aoLimpar} style={{ color: "var(--texto-2)" }}>
            <X size={14} /> Limpar
          </button>
        </>
      )}
    </Popover>
  );
}
