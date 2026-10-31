import { useEffect, useState } from "react";
import { ArrowRight, Copy, CornerDownLeft, FileText, FolderOpen, Inbox, Save, X } from "lucide-react";
import { api, Esquema, Evento, FiltroVisao, Opcao, opcoesDe } from "../api";
import { avisar, falhou, Rota } from "../ui";
import { dataHora, diaPorExtenso, hora, rotuloIntervalo } from "../visao";
import { ComMencoes } from "./Mencoes";
import { MenuPasta } from "./MenuPasta";
import { Etiqueta } from "./Valor";

const AGENTES = new Set(["Claude", "Codex", "Gemini", "Antigravity", "OpenCode", "Kiro", "Copilot", "Cursor", "Windsurf", "Zed", "Pi", "Agente"]);

export function LinhaDoTempo({
  esquema, filtro, de, ate, ir, recarga, capturar,
}: {
  esquema: Esquema;
  filtro: FiltroVisao;
  de: string;
  ate: string;
  ir: (r: Rota) => void;
  recarga: number;
  /** mostra a caixa "o que chegou?" (só no dia de hoje) */
  capturar: boolean;
}) {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [texto, setTexto] = useState("");
  const [local, setLocal] = useState(0);
  const [relatorio, setRelatorio] = useState<string | null>(null);

  useEffect(() => {
    api.linha(de, ate, filtro).then(setEventos).catch(falhou);
  }, [de, ate, JSON.stringify(filtro), recarga, local]); // eslint-disable-line react-hooks/exhaustive-deps

  const capturarAgora = async () => {
    const t = texto.trim();
    if (!t) return;
    try {
      await api.criarItem({ titulo: t, tipo_id: null, modelo_id: null });
      setTexto("");
      setLocal((n) => n + 1);
      avisar("Anotado na caixa de entrada.");
    } catch (e) {
      falhou(e);
    }
  };

  const dias = new Map<string, Evento[]>();
  for (const e of eventos ?? []) {
    const d = e.criado_em.slice(0, 10);
    if (!dias.has(d)) dias.set(d, []);
    dias.get(d)!.push(e);
  }

  return (
    <div className="linha-do-tempo">
      {capturar && (
        <div className="captura">
          <Inbox size={16} />
          <input
            placeholder="O que chegou? Escreva e dê Enter: vira um item na caixa de entrada, para classificar depois."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && capturarAgora()}
          />
          <kbd><CornerDownLeft size={11} /></kbd>
        </div>
      )}

      {eventos && eventos.length > 0 && (
        <div className="ldt-ferramentas">
          <button className="btn" onClick={() => setRelatorio(montarRelatorio(esquema, eventos, de, ate))} title="O que aconteceu neste período, por item, em markdown">
            <FileText size={14} /> Relatório
          </button>
        </div>
      )}
      {relatorio != null && <Relatorio texto={relatorio} nome={`relatorio-${de}${de === ate ? "" : `-a-${ate}`}`} aoFechar={() => setRelatorio(null)} />}

      {eventos && eventos.length === 0 && (
        <div className="vazio-grande">Nada registrado {de === ate ? "neste dia" : "neste período"}.</div>
      )}

      {[...dias.entries()].map(([dia, lista]) => (
        <section key={dia} className="ldt-dia">
          <h3 className="ldt-data serif">
            {diaPorExtenso(dia)}
            <span className="ldt-conta">{lista.length} {lista.length === 1 ? "registro" : "registros"} · {new Set(lista.map((e) => e.item_id)).size} itens</span>
          </h3>
          <ol className="ldt-lista">
            {lista.map((e) => (
              <EventoLinha key={e.id} esquema={esquema} e={e} ir={ir} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

/** Markdown do período: um bloco por item (o mais recente primeiro), com tudo em ordem de hora. */
export function montarRelatorio(esquema: Esquema, eventos: Evento[], de: string, ate: string) {
  const porItem = new Map<number, Evento[]>();
  for (const e of eventos) {
    if (!porItem.has(e.item_id)) porItem.set(e.item_id, []);
    porItem.get(e.item_id)!.push(e);
  }
  const frase = (t: string) =>
    t === "Criado." ? "criou o item" : t === "Texto editado." ? "editou o texto" : t.replace(/\n+/g, " ");
  const linhas = [`# O que aconteceu — ${rotuloIntervalo(de, ate)}`, "", `_gerado pelo atelier em ${dataHora(new Date().toISOString())}_`, ""];
  linhas.push(`${porItem.size} itens · ${eventos.length} registros`, "");
  for (const lista of porItem.values()) {
    const e0 = lista[0];
    const tipo = esquema.tipos.find((t) => t.id === e0.tipo_id)?.nome;
    linhas.push(`## #${e0.codigo} ${e0.titulo || "Sem título"}${tipo ? ` (${tipo})` : ""}`, "");
    for (const e of [...lista].reverse()) linhas.push(`- ${dataHora(e.criado_em)} · ${e.autor} · ${frase(e.texto)}`);
    linhas.push("");
  }
  return linhas.join("\n");
}

function Relatorio({ texto, nome, aoFechar }: { texto: string; nome: string; aoFechar: () => void }) {
  return (
    <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="modal relatorio">
        <div className="atalhos-cabeca">
          <FileText size={18} /> <h3 className="serif">Relatório</h3>
          <button className="btn-icone" onClick={aoFechar} title="Fechar (Esc)"><X size={17} /></button>
        </div>
        <pre className="hv-previa" style={{ flex: 1, maxHeight: "none" }}>{texto}</pre>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn primario" onClick={() => navigator.clipboard.writeText(texto).then(() => avisar("Relatório copiado."))}><Copy size={14} /> Copiar</button>
          <button
            className="btn"
            onClick={async () => {
              try {
                const r = await api.salvarRelatorio(nome, texto);
                avisar(`Salvo em ${r.caminho}`);
              } catch (e) {
                falhou(e);
              }
            }}
          >
            <Save size={14} /> Salvar na bancada (relatorios/)
          </button>
        </div>
      </div>
    </div>
  );
}

function EventoLinha({ esquema, e, ir }: { esquema: Esquema; e: Evento; ir: (r: Rota) => void }) {
  const tipo = esquema.tipos.find((t) => t.id === e.tipo_id);
  const agente = AGENTES.has(e.autor);
  const data = e.criado_em.slice(0, 10).split("-").reverse().join("/");
  return (
    <li className={`ldt-evento${agente ? " por-agente" : ""}`}>
      <span className="ldt-ponto" />
      <div className="ldt-quando" title={e.criado_em}>
        <strong>{hora(e.criado_em)}</strong>
        <span>{data}</span>
      </div>
      <div className="ldt-corpo">
        <div className="ldt-linha1">
          <span className={`ldt-autor${agente ? " por-agente" : ""}`}>{e.autor}</span>
          <button className="ldt-item" onClick={() => ir({ v: "item", id: e.item_id })} title="Abrir o item">
            <span>{tipo?.icone ?? "·"}</span>
            <span className="id-item">#{e.codigo}</span>
            <span className="ldt-titulo">{e.titulo || "Sem título"}</span>
          </button>
        </div>
        <O_que esquema={esquema} e={e} ir={ir} />
      </div>
    </li>
  );
}

/** Traduz a nota gravada pelo atelier ("Status: A → B", "Criado."...) numa frase; nota livre vira citação. */
function O_que({ esquema, e, ir }: { esquema: Esquema; e: Evento; ir: (r: Rota) => void }) {
  const t = e.texto;
  const lig = t.match(/^(Ligado|Desligado): (.+)$/s);
  if (lig) {
    return (
      <div className="ldt-acao">
        {lig[1] === "Ligado" ? "ligou:" : "desligou:"} <ComMencoes texto={lig[2]} ir={ir} />
      </div>
    );
  }
  if (t === "Criado.") return <div className="ldt-acao">criou o item</div>;
  if (t === "Texto editado.") return <div className="ldt-acao">editou o texto</div>;
  if (t === "Pasta desligada.") return <div className="ldt-acao">desligou a pasta</div>;
  const pasta = t.match(/^Pasta(?: criada)?: (.+)$/);
  if (pasta) {
    return (
      <div className="ldt-acao">
        {t.startsWith("Pasta criada") ? "criou a pasta " : "ligou a pasta "}
        <MenuPasta pasta={pasta[1]} classe="ldt-pasta">
          <FolderOpen size={12} /> {pasta[1].split(/[\\/]/).filter(Boolean).pop()}
        </MenuPasta>
      </div>
    );
  }
  const mud = t.match(/^([^:\n]+): (.*) → (.*)$/s);
  if (mud) {
    const [, campo, antes, depois] = mud;
    const prop = esquema.propriedades.find((p) => p.nome === campo);
    const comoTag = prop && ["status", "selecao", "multisselecao"].includes(prop.especie);
    const ops = prop ? opcoesDe(esquema, prop, e.tipo_id) : [];
    const valor = (v: string) => {
      if (v === "—") return <span className="vazio" style={{ opacity: 1 }}>vazio</span>;
      if (!comoTag) return <span className="ldt-valor">{v}</span>;
      return (
        <>
          {v.split(", ").map((n) => {
            const o: Opcao = ops.find((x) => x.nome === n) ?? { nome: n };
            return <Etiqueta key={n} opcao={o} status={prop?.especie === "status"} />;
          })}
        </>
      );
    };
    return (
      <div className="ldt-acao">
        <span className="ldt-campo">{campo}</span> {valor(antes)} <ArrowRight size={12} className="ldt-seta" /> {valor(depois)}
      </div>
    );
  }
  return <div className="ldt-nota"><ComMencoes texto={t} ir={ir} /></div>;
}
