// O seletor de ícone (emoji) de todo lugar: tipos, visões... Busca em cima (com o foco já nela), os ícones em uso na
// bancada e o atual, e os grupos. Digitar ou colar um emoji que não está na lista também serve (Enter).
import { useMemo, useState } from "react";
import { buscarEmojis, GRUPOS_EMOJI } from "../emojis";
import { Popover } from "./Popover";

const ehEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s) && [...s].length <= 8;

export function SeletorIcone({ ancora, aoFechar, aoEscolher, atual, emUso = [] }: {
  ancora: HTMLElement;
  aoFechar: () => void;
  aoEscolher: (icone: string) => void;
  atual?: string | null;
  /** os já usados (pelos tipos da bancada, pelas visões): aparecem primeiro */
  emUso?: string[];
}) {
  const [q, setQ] = useState("");
  const achados = useMemo(() => buscarEmojis(q), [q]);
  const escolher = (e: string) => { aoEscolher(e); aoFechar(); };
  const colado = q.trim();
  const usados = [...new Set([...(atual ? [atual] : []), ...emUso])].filter(Boolean);

  const botao = (e: string, dica?: string, chave = e) => (
    <button key={chave} className={e === atual ? "atual" : ""} title={dica} onClick={() => escolher(e)}>{e}</button>
  );

  return (
    <Popover ancora={ancora} aoFechar={aoFechar} largura={372}>
      <div className="seletor-icone">
        <input
          autoFocus
          className="campo"
          placeholder="Buscar ícone (passo, dinheiro, bug…) ou colar um emoji"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (ehEmoji(colado) && !achados.some((x) => x.e === colado)) escolher(colado);
            else if (achados[0]) escolher(achados[0].e);
          }}
        />
        <div className="seletor-icone-rolagem">
          {ehEmoji(colado) && !achados.some((x) => x.e === colado) && (
            <>
              <div className="seletor-icone-grupo">Usar o que você colou</div>
              <div className="seletor-emoji">{botao(colado, "Usar este")}</div>
            </>
          )}
          {!q && usados.length > 0 && (
            <>
              <div className="seletor-icone-grupo">Em uso</div>
              <div className="seletor-emoji">{usados.map((e) => botao(e, undefined, `uso-${e}`))}</div>
            </>
          )}
          {q ? (
            achados.length ? (
              <div className="seletor-emoji">{achados.map((x) => botao(x.e, x.palavras))}</div>
            ) : (
              !ehEmoji(colado) && <div className="dica" style={{ padding: 8 }}>Nada com “{q}”. Dá para colar um emoji (Win + .).</div>
            )
          ) : (
            GRUPOS_EMOJI.map((g) => (
              <div key={g}>
                <div className="seletor-icone-grupo">{g}</div>
                <div className="seletor-emoji">{achados.filter((x) => x.grupo === g).map((x) => botao(x.e, x.palavras))}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </Popover>
  );
}
