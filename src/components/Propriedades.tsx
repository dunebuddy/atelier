import { useState } from "react";
import { Plus, Trash2, Unlink } from "lucide-react";
import { api, Especie, ESPECIES, Esquema, Propriedade, Tipo } from "../api";
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

  const criar = async (esp: Especie) => {
    try {
      const { id } = await api.criarProp({ nome: busca.trim(), especie: esp, ...(esp === "relacao" ? { config: { inverso: `${busca.trim()} (de)` } } : {}) });
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
          {ESPECIES.map((e) => (
            <button key={e.id} className="menu-item" onClick={() => criar(e.id)}>
              <IconeEspecie especie={e.id} /> {e.nome}
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
  ancora, aoFechar, prop, tipo, aoMudarEsquema,
}: {
  ancora: HTMLElement;
  aoFechar: () => void;
  prop: Propriedade;
  tipo?: Tipo;
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
      <div className="menu-rotulo">Do lado do item apontado, lê-se</div>
      <input
        className="campo"
        placeholder={`${prop.nome} (de)`}
        defaultValue={prop.config?.inverso ?? ""}
        onBlur={(e) => e.target.value.trim() !== (prop.config?.inverso ?? "") && gravar({ inverso: e.target.value.trim() })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      <label className="menu-item" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={!!prop.config?.um_so} onChange={(e) => gravar({ um_so: e.target.checked })} style={{ accentColor: "var(--acento)" }} />
        Aponta para um item só
      </label>
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
