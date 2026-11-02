import { useState } from "react";
import { Plus, Trash2, Unlink } from "lucide-react";
import { api, ConfigProp, Especie, ESPECIES, Esquema, LISTAVEIS, MOLDES, Propriedade, Tipo } from "../api";
import { falhou } from "../ui";
import { Popover } from "./Popover";
import { IconeEspecie } from "./Valor";

/** Popover para pôr uma propriedade num tipo: escolhe uma existente ou cria nova. */
export function AdicionarProp({
  ancora, aoFechar, esquema, tipo, aoMudarEsquema,
}: {
  ancora: HTMLElement;
  aoFechar: () => void;
  esquema: Esquema;
  tipo: Tipo;
  aoMudarEsquema: () => Promise<void>;
}) {
  const [busca, setBusca] = useState("");
  const [especie, setEspecie] = useState<Especie | null>(null);
  const jaTem = new Set(tipo.propriedades.map((p) => p.propriedade_id));
  const b = busca.trim().toLowerCase();
  const livres = esquema.propriedades.filter((p) => !jaTem.has(p.id) && p.nome.toLowerCase().includes(b));
  const existe = esquema.propriedades.some((p) => p.nome.toLowerCase() === b);

  const por = async (pid: number) => {
    try {
      await api.porPropNoTipo(tipo.id, pid);
      await aoMudarEsquema();
      aoFechar();
    } catch (e) {
      falhou(e);
    }
  };

  const criar = async (esp: Especie, config: ConfigProp = {}) => {
    try {
      const { id } = await api.criarProp({ nome: busca.trim(), especie: esp, config: esp === "relacao" ? { inverso: `${busca.trim()} (de)`, outro_lado: false, ...config } : config });
      await por(id);
    } catch (e) {
      falhou(e);
    }
  };

  return (
    <Popover ancora={ancora} aoFechar={aoFechar} largura={270}>
      <input
        className="campo"
        autoFocus
        placeholder="Nome da propriedade…"
        value={busca}
        onChange={(e) => { setBusca(e.target.value); setEspecie(null); }}
      />
      {especie === null && b && !existe && (
        <>
          <div className="menu-rotulo">Criar “{busca.trim()}” como</div>
          {MOLDES.map((m) => (
            <button key={m.nome} className="menu-item" onClick={() => criar(m.especie, m.config)}>
              <IconeEspecie especie={m.especie} /> {m.nome}
            </button>
          ))}
        </>
      )}
      {livres.length > 0 && <div className="menu-rotulo">Propriedades que já existem</div>}
      {livres.map((p) => (
        <button key={p.id} className="menu-item" onClick={() => por(p.id)}>
          <IconeEspecie especie={p.especie} /> {p.nome}
          <span className="dir" style={{ fontSize: 11.5 }}>{ESPECIES.find((e) => e.id === p.especie)?.nome}</span>
        </button>
      ))}
      {!b && livres.length === 0 && <div className="menu-rotulo">Digite um nome para criar</div>}
    </Popover>
  );
}

/** Menu de uma propriedade: renomear, tirar do tipo, apagar de vez. */
export function MenuProp({
  ancora, aoFechar, prop, tipo, aoMudarEsquema, esquema,
}: {
  ancora: HTMLElement;
  aoFechar: () => void;
  prop: Propriedade;
  tipo?: Tipo;
  /** para a lista dinâmica escolher tipos, relação e ordem */
  esquema?: Esquema;
  aoMudarEsquema: () => Promise<void>;
}) {
  const [nome, setNome] = useState(prop.nome);
  const [confirmar, setConfirmar] = useState(false);

  const renomear = async () => {
    if (nome.trim() && nome.trim() !== prop.nome) {
      try {
        await api.atualizarProp(prop.id, { nome: nome.trim() });
        await aoMudarEsquema();
      } catch (e) {
        falhou(e);
      }
    }
  };

  return (
    <Popover ancora={ancora} aoFechar={() => { renomear(); aoFechar(); }} largura={260}>
      <input
        className="campo"
        autoFocus
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && (renomear(), aoFechar())}
      />
      <div className="menu-rotulo">
        {ESPECIES.find((e) => e.id === prop.especie)?.nome} · vale para todos os tipos que a usam
      </div>
      {prop.especie === "relacao" && <ConfigRelacao prop={prop} aoMudarEsquema={aoMudarEsquema} />}
      {prop.especie === "lista" && esquema && <ConfigLista esquema={esquema} prop={prop} aoMudarEsquema={aoMudarEsquema} />}
      {prop.especie === "formula" && <ConfigFormula prop={prop} aoMudarEsquema={aoMudarEsquema} />}
      <ConfigGeral prop={prop} aoMudarEsquema={aoMudarEsquema} />
      <div className="menu-sep" />
      {tipo && (
        <button
          className="menu-item"
          onClick={async () => {
            await api.tirarPropDoTipo(tipo.id, prop.id).catch(falhou);
            await aoMudarEsquema();
            aoFechar();
          }}
        >
          <Unlink size={14} /> Tirar de {tipo.nome}
          <span className="dir" style={{ fontSize: 11 }}>valores ficam guardados</span>
        </button>
      )}
      <button
        className="menu-item"
        style={{ color: "var(--t-red)" }}
        onClick={async () => {
          if (!confirmar) return setConfirmar(true);
          await api.apagarProp(prop.id).catch(falhou);
          await aoMudarEsquema();
          aoFechar();
        }}
      >
        <Trash2 size={14} /> {confirmar ? "Clique de novo para apagar de tudo" : "Apagar propriedade"}
      </button>
    </Popover>
  );
}

/** Relação: como se lê do lado do item apontado ("Bloqueado por" ↔ "Bloqueia") e se aceita um item só. */
function ConfigRelacao({ prop, aoMudarEsquema }: { prop: Propriedade; aoMudarEsquema: () => Promise<void> }) {
  const gravar = async (config: Propriedade["config"]) => {
    try {
      await api.atualizarProp(prop.id, { config: { ...prop.config, ...config } });
      await aoMudarEsquema();
    } catch (e) {
      falhou(e);
    }
  };
  return (
    <>
      <label className="menu-item" style={{ cursor: "pointer" }} title="Na página do documento apontado, uma lista com quem aponta para ele">
        <input type="checkbox" checked={prop.config?.outro_lado !== false} onChange={(e) => gravar({ outro_lado: e.target.checked })} style={{ accentColor: "var(--acento)" }} />
        Mostrar do outro lado
      </label>
      {prop.config?.outro_lado !== false && (
        <>
          <div className="menu-rotulo">Nome do outro lado</div>
          <input
            className="campo"
            placeholder={`${prop.nome} (de)`}
            defaultValue={prop.config?.inverso ?? ""}
            onBlur={(e) => e.target.value.trim() !== (prop.config?.inverso ?? "") && gravar({ inverso: e.target.value.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
        </>
      )}
      <label className="menu-item" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={!!prop.config?.um_so} onChange={(e) => gravar({ um_so: e.target.checked })} style={{ accentColor: "var(--acento)" }} />
        Aponta para um documento só
      </label>
    </>
  );
}

/** Fórmula: a expressão (calculada na hora de ler; não se escreve no valor). */
function ConfigFormula({ prop, aoMudarEsquema }: { prop: Propriedade; aoMudarEsquema: () => Promise<void> }) {
  const gravar = async (expressao: string) => {
    try {
      await api.atualizarProp(prop.id, { config: { ...prop.config, expressao } });
      await aoMudarEsquema();
    } catch (e) {
      falhou(e);
    }
  };
  return (
    <>
      <div className="menu-rotulo">Fórmula</div>
      <textarea
        className="campo formula-campo"
        rows={3}
        spellCheck={false}
        placeholder='{Horas} * {Valor}'
        defaultValue={prop.config?.expressao ?? ""}
        onBlur={(e) => e.target.value !== (prop.config?.expressao ?? "") && gravar(e.target.value)}
      />
      <div className="dica formula-dica">
        {"{Nome}"} é o valor da propriedade; + − × ÷ e parênteses; texto entre aspas (+ junta textos).
        Funções: conta({"{Lista}"}), soma({"{Lista}"}, "Prop"), media, min, max, arred(x, casas), se(cond, então, senão).
      </div>
    </>
  );
}

/** Lista dinâmica: quais tipos, por qual relação (a este) e em que ordem. */
function ConfigLista({ esquema, prop, aoMudarEsquema }: { esquema: Esquema; prop: Propriedade; aoMudarEsquema: () => Promise<void> }) {
  const c = prop.config ?? {};
  const gravar = async (d: ConfigProp) => {
    try {
      await api.atualizarProp(prop.id, { config: { ...c, ...d } });
      await aoMudarEsquema();
    } catch (e) {
      falhou(e);
    }
  };
  const relacoes = esquema.propriedades.filter((p) => p.especie === "relacao");
  const ordenaveis = esquema.propriedades.filter((p) => !["relacao", "links", "lista"].includes(p.especie));
  const tipos = c.tipos ?? [];
  return (
    <>
      <div className="menu-rotulo">Documentos que apontam para este por</div>
      <select className="campo" value={c.relacao ?? ""} onChange={(e) => gravar({ relacao: Number(e.target.value) })}>
        <option value="" disabled>escolha a relação…</option>
        {relacoes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
      </select>
      <div className="menu-rotulo">Dos tipos (nenhum marcado: todos)</div>
      {esquema.tipos.map((t) => (
        <label key={t.id} className="menu-item" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={tipos.includes(t.id)} style={{ accentColor: "var(--acento)" }}
            onChange={(e) => gravar({ tipos: e.target.checked ? [...tipos, t.id] : tipos.filter((x) => x !== t.id) })} />
          {t.icone} {t.nome}
        </label>
      ))}
      <div className="menu-rotulo">Em ordem de</div>
      <select className="campo" value={String(c.ordenar ?? "titulo")} onChange={(e) => gravar({ ordenar: /^\d+$/.test(e.target.value) ? Number(e.target.value) : (e.target.value as "titulo" | "criado_em") })}>
        <option value="titulo">Título</option>
        <option value="criado_em">Criação</option>
        {ordenaveis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </select>
      <label className="menu-item" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={!!c.desc} onChange={(e) => gravar({ desc: e.target.checked })} style={{ accentColor: "var(--acento)" }} />
        Do maior para o menor
      </label>
    </>
  );
}

/** Número (inteiro, casas, formato), data (com hora) e lista (vários valores). */
function ConfigGeral({ prop, aoMudarEsquema }: { prop: Propriedade; aoMudarEsquema: () => Promise<void> }) {
  const c = prop.config ?? {};
  const gravar = async (d: ConfigProp) => {
    try {
      await api.atualizarProp(prop.id, { config: { ...c, ...d } });
      await aoMudarEsquema();
    } catch (e) {
      falhou(e);
    }
  };
  const caixa = (rotulo: string, ligado: boolean, mudar: (v: boolean) => void) => (
    <label className="menu-item" style={{ cursor: "pointer" }}>
      <input type="checkbox" checked={ligado} onChange={(e) => mudar(e.target.checked)} style={{ accentColor: "var(--acento)" }} /> {rotulo}
    </label>
  );
  return (
    <>
      {prop.especie === "numero" && (
        <>
          {caixa("Só números inteiros", !!c.inteiro, (v) => gravar({ inteiro: v }))}
          {!c.inteiro && (
            <label className="menu-item">
              Casas decimais
              <input className="campo" type="number" min={0} max={6} style={{ width: 60, marginLeft: "auto" }} defaultValue={c.casas ?? ""}
                onBlur={(e) => gravar({ casas: e.target.value === "" ? null : Math.max(0, Math.min(6, Number(e.target.value))) })} />
            </label>
          )}
          <div className="filtro-chips">
            {(["numero", "percentual", "moeda"] as const).map((f) => (
              <button key={f} className={`chip${(c.formato ?? "numero") === f ? " ligado" : ""}`} onClick={() => gravar({ formato: f })}>
                {f === "numero" ? "1.234,5" : f === "percentual" ? "12%" : "R$ 1,00"}
              </button>
            ))}
          </div>
        </>
      )}
      {prop.especie === "data" && caixa("Com hora", !!c.hora, (v) => gravar({ hora: v }))}
      {(prop.especie === "texto" || prop.especie === "numero") && (
        <label className="menu-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }} title="Guarde só o número (de um chamado, card...) e o valor vira link. {valor} marca onde ele entra.">
          <span>Molde de link (o valor vira link)</span>
          <input className="campo" placeholder="https://exemplo.com/item/{valor}" defaultValue={c.molde ?? ""}
            onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (c.molde ?? null)) gravar({ molde: v }); }} />
        </label>
      )}
      {LISTAVEIS.includes(prop.especie) && caixa("Aceita vários valores (lista)", !!c.lista, (v) => gravar({ lista: v }))}
      {caixa("Quebrar linha na tabela (em vez de cortar em …)", !!c.quebrar, (v) => gravar({ quebrar: v }))}
    </>
  );
}

export function BotaoAdicionarProp({ onClick }: { onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button className="btn" onClick={onClick}>
      <Plus size={14} /> Adicionar propriedade
    </button>
  );
}
