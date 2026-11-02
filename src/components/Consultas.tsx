// Consultas: SQL só de leitura sobre a bancada (a tabela `documentos` tem uma coluna por propriedade). Salva-se à
// parte das visões; com a coluna `codigo`, a consulta vira uma visão (que roda o SQL de novo a cada abertura).
import { useEffect, useRef, useState } from "react";
import { Play, Save, Table2, Trash2 } from "lucide-react";
import { api, Esquema } from "../api";
import { abrir, avisar, falhou } from "../ui";
import { abrirCodigo } from "./Mencoes";

export interface Consulta { id: number; nome: string; sql: string; atualizado_em: string }

interface Resultado { colunas: string[]; linhas: unknown[][]; total: number; cortada: boolean }

const EXEMPLO = `-- documentos: uma linha por documento, uma coluna por propriedade (nome entre aspas duplas)
SELECT codigo, titulo, tipo, "Status"
FROM documentos
WHERE "Status" IS NOT NULL
ORDER BY atualizado_em DESC`;

function celula(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

export function PaginaConsulta({ id, esquema, aoMudarConsultas, criarVisao }: {
  id?: number;
  esquema: Esquema;
  aoMudarConsultas: () => void;
  criarVisao: (nome: string, sql: string) => Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [sql, setSql] = useState(EXEMPLO);
  const [res, setRes] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, setRodando] = useState(false);
  const [atual, setAtual] = useState<number | undefined>(id);
  const caixa = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (id == null) return;
    api.consultas().then((l) => {
      const c = l.find((x) => x.id === id);
      if (c) { setNome(c.nome); setSql(c.sql); setAtual(c.id); rodar(c.sql); }
    }).catch(falhou);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const rodar = async (q = sql) => {
    setRodando(true);
    try {
      setRes(await api.rodarConsulta(q));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
      setRes(null);
    } finally {
      setRodando(false);
    }
  };
  const salvar = async () => {
    const n = nome.trim() || window.prompt("Nome da consulta:")?.trim();
    if (!n) return;
    try {
      const r = await api.salvarConsulta({ id: atual, nome: n, sql });
      setNome(n);
      setAtual(r.id);
      aoMudarConsultas();
      avisar(`Consulta “${n}” salva.`);
    } catch (e) {
      falhou(e);
    }
  };
  const apagar = async () => {
    if (atual == null || !window.confirm(`Apagar a consulta “${nome}”?`)) return;
    try {
      await api.apagarConsulta(atual);
      aoMudarConsultas();
      setAtual(undefined);
      avisar("Consulta apagada.");
    } catch (e) {
      falhou(e);
    }
  };
  const temCodigo = !!res?.colunas.includes("codigo");
  const colCodigo = res?.colunas.indexOf("codigo") ?? -1;

  return (
    <div className="vista consulta-sql">
      <div className="consulta-topo">
        <input className="campo consulta-nome" placeholder="Consulta sem nome" value={nome} onChange={(e) => setNome(e.target.value)} />
        <button className="btn primario" onClick={() => rodar()} disabled={rodando} title="Rodar (Ctrl+Enter)"><Play size={14} /> Rodar</button>
        <button className="btn" onClick={salvar} title="Guardar em Consultas, na barra lateral"><Save size={14} /> Salvar</button>
        <button className="btn" disabled={!temCodigo} title={temCodigo ? "Uma visão que roda esta consulta (tabela, lista, quadro...)" : "Para virar visão, devolva a coluna codigo"}
          onClick={() => criarVisao(nome.trim() || "Consulta", sql).catch(falhou)}>
          <Table2 size={14} /> Virar visão
        </button>
        {atual != null && <button className="btn-icone" title="Apagar a consulta" onClick={apagar}><Trash2 size={15} /></button>}
      </div>
      <textarea
        ref={caixa}
        className="consulta-sql-texto"
        spellCheck={false}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); rodar(); } }}
      />
      <p className="dica">
        Só leitura. <code>documentos</code> tem <code>codigo</code>, <code>titulo</code>, <code>tipo</code>, <code>corpo</code>,
        <code> criado_em</code>, <code>atualizado_em</code> e uma coluna por propriedade
        ({esquema.propriedades.filter((p) => !["lista", "formula"].includes(p.especie)).slice(0, 6).map((p) => `"${p.nome}"`).join(", ")}…).
        Relação vem como lista de códigos.
      </p>
      {erro && <div className="agente-nota erro">{erro}</div>}
      {res && (
        <>
          <div className="dica">{res.total} {res.total === 1 ? "linha" : "linhas"}{res.cortada ? " (mostrando as 1000 primeiras)" : ""}</div>
          <div className="consulta-resultado">
            <table>
              <thead><tr>{res.colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {res.linhas.map((l, i) => (
                  <tr key={i}>
                    {l.map((v, j) => (
                      <td key={j}>
                        {j === colCodigo && typeof v === "string" ? (
                          <button className="lista-abrir" title="Abrir (Ctrl+clique: ao lado)" onClick={(e) => abrirPorCodigo(v, e.ctrlKey || e.metaKey)}>#{v}</button>
                        ) : celula(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function abrirPorCodigo(codigo: string, nova: boolean) {
  abrirCodigo(codigo, (r) => abrir(r, nova));
}
