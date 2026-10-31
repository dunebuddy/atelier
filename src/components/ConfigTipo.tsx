import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Star, Trash2 } from "lucide-react";
import { api, CORES, Cor, ESPECIES, Esquema, Modelo, Opcao, opcoesDe, Propriedade, propsDoTipo, Tipo } from "../api";
import { EMOJIS, falhou, Rota } from "../ui";
import { Editor } from "./Editor";
import { Popover, usePopover } from "./Popover";
import { AdicionarProp, BotaoAdicionarProp, MenuProp } from "./Propriedades";
import { Etiqueta, IconeEspecie, ValorProp } from "./Valor";

export function ConfigTipo({
  esquema, id, ir, aoMudarEsquema,
}: {
  esquema: Esquema;
  id: number;
  ir: (r: Rota) => void;
  aoMudarEsquema: () => Promise<void>;
}) {
  const tipo = esquema.tipos.find((t) => t.id === id);
  const emoji = usePopover();
  const addProp = usePopover();
  const [menuProp, setMenuProp] = useState<{ ancora: HTMLElement; prop: Propriedade } | null>(null);
  const [apagar, setApagar] = useState(false);

  if (!tipo) return <div className="config">Tipo não encontrado.</div>;
  const props = propsDoTipo(esquema, tipo);
  const modelos = esquema.modelos.filter((m) => m.tipo_id === tipo.id);

  const atualizar = async (d: Parameters<typeof api.atualizarTipo>[1]) => {
    try {
      await api.atualizarTipo(tipo.id, d);
      await aoMudarEsquema();
    } catch (e) {
      falhou(e);
    }
  };

  const mover = async (i: number, delta: number) => {
    const ordem = [...props];
    const j = i + delta;
    if (j < 0 || j >= ordem.length) return;
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
    try {
      await Promise.all(ordem.map((p, k) => api.porPropNoTipo(tipo.id, p.id, { ordem: k + 1 })));
      await aoMudarEsquema();
    } catch (e) {
      falhou(e);
    }
  };

  return (
    <div className="config">
      <div className="vista-cabeca" style={{ marginBottom: 6 }}>
        <button className="btn-icone" style={{ width: 52, height: 52, fontSize: 34 }} onClick={emoji.abrir} title="Trocar ícone">
          {tipo.icone}
        </button>
        <input
          key={tipo.id + tipo.nome}
          className="titulo-grande"
          style={{ margin: 0 }}
          defaultValue={tipo.nome}
          onBlur={(e) => e.target.value.trim() && e.target.value !== tipo.nome && atualizar({ nome: e.target.value.trim() })}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <button className="btn" onClick={() => ir({ v: "lista", tipo: tipo.id })}>Ver os itens de {tipo.nome} →</button>

      <h2>Propriedades</h2>
      <p className="dica">
        Propriedades são compartilhadas: a mesma “Frente” pode estar em Dívida e em Task, e o filtro pega as duas.
        Tirar uma propriedade do tipo não apaga os valores dos itens.
      </p>
      {props.map((p, i) => (
        <div key={p.id}>
          <div className="linha-config">
            <IconeEspecie especie={p.especie} />
            <span className="nome" style={{ cursor: "pointer" }} onClick={(e) => setMenuProp({ ancora: e.currentTarget, prop: p })}>
              {p.nome}
            </span>
            <span className="especie">{ESPECIES.find((e) => e.id === p.especie)?.nome}</span>
            <button className="btn-icone" onClick={() => mover(i, -1)} disabled={i === 0} title="Subir"><ArrowUp size={14} /></button>
            <button className="btn-icone" onClick={() => mover(i, 1)} disabled={i === props.length - 1} title="Descer"><ArrowDown size={14} /></button>
          </div>
          {(p.especie === "selecao" || p.especie === "status" || p.especie === "multisselecao") && (
            <EditorOpcoes esquema={esquema} tipo={tipo} prop={p} aoMudarEsquema={aoMudarEsquema} />
          )}
        </div>
      ))}
      <BotaoAdicionarProp onClick={addProp.abrir} />

      <h2>Modelos</h2>
      <p className="dica">
        O item novo nasce do modelo padrão (★), com as propriedades e o texto já preenchidos. Dá para ter vários e
        escolher na hora de criar.
      </p>
      {modelos.map((m) => (
        <CartaoModelo key={m.id} esquema={esquema} tipo={tipo} modelo={m} aoMudarEsquema={aoMudarEsquema} />
      ))}
      <button
        className="btn"
        onClick={async () => {
          try {
            await api.criarModelo({ tipo_id: tipo.id, nome: `Modelo ${modelos.length + 1}`, padrao: modelos.length === 0 });
            await aoMudarEsquema();
          } catch (e) {
            falhou(e);
          }
        }}
      >
        <Plus size={14} /> Novo modelo
      </button>

      <h2 style={{ marginTop: 48 }}>Zona de perigo</h2>
      <button
        className="btn perigo"
        onClick={async () => {
          if (!apagar) return setApagar(true);
          try {
            await api.apagarTipo(tipo.id);
            await aoMudarEsquema();
            ir({ v: "lista", tipo: null });
          } catch (e) {
            falhou(e);
          }
        }}
      >
        <Trash2 size={14} /> {apagar ? `Clique de novo: apagar o tipo ${tipo.nome} (os itens ficam, sem tipo)` : `Apagar o tipo ${tipo.nome}`}
      </button>

      {emoji.ancora && (
        <Popover ancora={emoji.ancora} aoFechar={emoji.fechar}>
          <div className="seletor-emoji">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => { atualizar({ icone: e }); emoji.fechar(); }}>{e}</button>
            ))}
          </div>
          <input
            className="campo"
            placeholder="ou cole um emoji (Win + .)"
            onKeyDown={(e) => {
              const v = (e.target as HTMLInputElement).value.trim();
              if (e.key === "Enter" && v) { atualizar({ icone: v }); emoji.fechar(); }
            }}
          />
        </Popover>
      )}
      {addProp.ancora && (
        <AdicionarProp ancora={addProp.ancora} aoFechar={addProp.fechar} esquema={esquema} tipo={tipo} aoMudarEsquema={aoMudarEsquema} />
      )}
      {menuProp && (
        <MenuProp ancora={menuProp.ancora} aoFechar={() => setMenuProp(null)} prop={menuProp.prop} tipo={tipo} aoMudarEsquema={aoMudarEsquema} />
      )}
    </div>
  );
}

function EditorOpcoes({ esquema, tipo, prop, aoMudarEsquema }: { esquema: Esquema; tipo: Tipo; prop: Propriedade; aoMudarEsquema: () => Promise<void> }) {
  const opcoes = opcoesDe(esquema, prop, tipo.id);
  const proprias = tipo.propriedades.find((x) => x.propriedade_id === prop.id)?.opcoes != null;
  const [editar, setEditar] = useState<{ ancora: HTMLElement; i: number } | null>(null);
  const nova = usePopover();
  const [nome, setNome] = useState("");

  const gravar = async (lista: Opcao[]) => {
    try {
      if (proprias || prop.especie === "status") await api.porPropNoTipo(tipo.id, prop.id, { opcoes: lista });
      else await api.atualizarProp(prop.id, { opcoes: lista });
      await aoMudarEsquema();
    } catch (e) {
      falhou(e);
    }
  };

  return (
    <div className="opcoes-editor">
      {opcoes.map((o, i) => (
        <span key={o.nome + i} onClick={(e) => setEditar({ ancora: e.currentTarget, i })}>
          <Etiqueta opcao={o} status={prop.especie === "status"} />
        </span>
      ))}
      <button className="btn" style={{ padding: "1px 6px", fontSize: 12.5 }} onClick={nova.abrir}><Plus size={13} /> opção</button>
      {prop.especie === "status" && <span style={{ fontSize: 12, color: "var(--texto-3)" }}>opções só deste tipo · clique para marcar como histórico</span>}

      {nova.ancora && (
        <Popover ancora={nova.ancora} aoFechar={nova.fechar} largura={230}>
          <input
            className="campo"
            autoFocus
            placeholder="Nome da opção"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter" && nome.trim()) {
                await gravar([...opcoes, { nome: nome.trim(), cor: CORES[(opcoes.length + 1) % CORES.length] }]);
                setNome("");
                nova.fechar();
              }
            }}
          />
        </Popover>
      )}

      {editar && opcoes[editar.i] && (
        <EditarOpcao
          ancora={editar.ancora}
          opcao={opcoes[editar.i]}
          status={prop.especie === "status"}
          aoFechar={() => setEditar(null)}
          aoGravar={(o) => gravar(opcoes.map((x, k) => (k === editar.i ? o : x)))}
          aoApagar={() => { gravar(opcoes.filter((_, k) => k !== editar.i)); setEditar(null); }}
        />
      )}
    </div>
  );
}

function EditarOpcao({
  ancora, opcao, status, aoFechar, aoGravar, aoApagar,
}: {
  ancora: HTMLElement;
  opcao: Opcao;
  status: boolean;
  aoFechar: () => void;
  aoGravar: (o: Opcao) => void;
  aoApagar: () => void;
}) {
  const [nome, setNome] = useState(opcao.nome);
  const fechar = () => {
    if (nome.trim() && nome.trim() !== opcao.nome) aoGravar({ ...opcao, nome: nome.trim() });
    aoFechar();
  };
  return (
    <Popover ancora={ancora} aoFechar={fechar} largura={230}>
      <input className="campo" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === "Enter" && fechar()} />
      <div className="menu-rotulo">Cor</div>
      {CORES.map((c: Cor) => (
        <button key={c} className="menu-item" onClick={() => aoGravar({ ...opcao, nome: nome.trim() || opcao.nome, cor: c })}>
          <span className={`bolinha cor-${c}`} /> {c}
          {(opcao.cor ?? "gray") === c && <span className="dir">✓</span>}
        </button>
      ))}
      {status && (
        <>
          <div className="menu-sep" />
          <label className="menu-item" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={!!opcao.historico}
              onChange={(e) => aoGravar({ ...opcao, historico: e.target.checked || undefined })}
              style={{ accentColor: "var(--acento)" }}
            />
            É histórico (some da lista ativa)
          </label>
        </>
      )}
      <div className="menu-sep" />
      <button className="menu-item" style={{ color: "var(--t-red)" }} onClick={aoApagar}>
        <Trash2 size={14} /> Apagar opção
      </button>
    </Popover>
  );
}

function CartaoModelo({ esquema, tipo, modelo, aoMudarEsquema }: { esquema: Esquema; tipo: Tipo; modelo: Modelo; aoMudarEsquema: () => Promise<void> }) {
  const props = propsDoTipo(esquema, tipo);
  const gravar = async (d: Partial<Modelo>) => {
    try {
      await api.atualizarModelo(modelo.id, d);
      await aoMudarEsquema();
    } catch (e) {
      falhou(e);
    }
  };
  return (
    <div className="cartao">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <input
          key={modelo.nome}
          defaultValue={modelo.nome}
          className="campo"
          style={{ fontWeight: 600, border: 0, background: "none", padding: "2px 0", boxShadow: "none" }}
          onBlur={(e) => e.target.value.trim() && e.target.value !== modelo.nome && gravar({ nome: e.target.value.trim() })}
        />
        <button
          className="btn"
          style={modelo.padrao ? { color: "var(--acento)" } : undefined}
          onClick={() => gravar({ padrao: !modelo.padrao })}
          title="Modelo padrão ao criar"
        >
          <Star size={14} fill={modelo.padrao ? "currentColor" : "none"} /> {modelo.padrao ? "Padrão" : "Tornar padrão"}
        </button>
        <button
          className="btn-icone"
          title="Apagar modelo"
          onClick={async () => {
            await api.apagarModelo(modelo.id).catch(falhou);
            await aoMudarEsquema();
          }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="props">
        {props.map((p) => (
          <div key={p.id} style={{ display: "contents" }}>
            <div className="prop-nome"><IconeEspecie especie={p.especie} /> {p.nome}</div>
            <ValorProp
              esquema={esquema}
              prop={p}
              tipoId={tipo.id}
              valor={modelo.props[p.id]}
              aoMudar={(v) => {
                const novo = { ...modelo.props };
                if (v == null) delete novo[p.id];
                else novo[p.id] = v;
                gravar({ props: novo });
              }}
              aoMudarEsquema={aoMudarEsquema}
            />
          </div>
        ))}
      </div>
      <div className="divisor" style={{ margin: "8px 0 12px" }} />
      <Editor key={modelo.id} valor={modelo.corpo} aoMudar={(corpo) => gravar({ corpo })} placeholder="Texto que o item já traz ao nascer…" />
    </div>
  );
}
