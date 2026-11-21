import { useEffect, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { Preferencias } from "../api";
import { acharAtalhos, ATALHOS, chaveDois, comboDe, combinacao, partes, PREFIXO, quemUsa, quemUsaSegunda, segunda, segundaDe } from "../atalhos";

/** Configurações → Atalhos: clique no atalho e aperte a combinação nova. */
export function SecaoAtalhos({ prefs, mudar }: { prefs: Preferencias; mudar: (d: Partial<Preferencias>) => void }) {
  const [gravando, setGravando] = useState<string | null>(null);
  // gravando a segunda tecla do Ctrl+K (o id do atalho)
  const [gravandoDois, setGravandoDois] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [, setN] = useState(0);
  // o registro avisa quando os atalhos mudam (para redesenhar as combinações)
  useEffect(() => {
    const f = () => setN((n) => n + 1);
    window.addEventListener("atelier:atalhos", f);
    return () => window.removeEventListener("atelier:atalhos", f);
  }, []);

  const gravar = (id: string, combo: string) => mudar({ atalhos: { ...prefs.atalhos, [id]: combo } });
  const padraoDois = (id: string) => ATALHOS.find((a) => a.id === id)?.dois ?? "";
  // "" volta ao padrão; tirar um que tem padrão guarda "-"
  const gravarDois = (id: string, seg: string) =>
    gravar(chaveDois(id), seg === padraoDois(id) ? "" : seg || (padraoDois(id) ? "-" : ""));

  useEffect(() => {
    if (!gravandoDois) return;
    const f = (e: KeyboardEvent) => {
      if (["Control", "Shift", "Alt", "Meta", "AltGraph"].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setGravandoDois(null); setAviso(null); return; }
      if (e.key === "Backspace" || e.key === "Delete") { gravarDois(gravandoDois, ""); setGravandoDois(null); setAviso(null); return; }
      const seg = segundaDe(e);
      if (!seg) return;
      if (e.ctrlKey || e.altKey || e.metaKey) { setAviso("A segunda tecla vai sozinha (ou com Shift): o Ctrl já foi no Ctrl+K."); return; }
      const outro = quemUsaSegunda(seg, gravandoDois);
      if (outro) { setAviso(`${PREFIXO} ${seg} já é “${outro.nome}”. Mude aquele antes, ou escolha outra.`); return; }
      gravarDois(gravandoDois, seg);
      setGravandoDois(null);
      setAviso(null);
    };
    window.addEventListener("keydown", f, true);
    return () => window.removeEventListener("keydown", f, true);
  }, [gravandoDois, prefs.atalhos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!gravando) return;
    const f = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setGravando(null); setAviso(null); return; }
      const c = comboDe(e);
      if (!c) return;
      if (!c.includes("+") && !/^F\d+$/.test(c)) { setAviso("Use pelo menos Ctrl, Alt ou Shift junto (ou uma tecla F1–F12)."); return; }
      const outro = quemUsa(c, gravando);
      if (outro) { setAviso(`${c} já é “${outro.nome}”. Mude aquele antes, ou escolha outra.`); return; }
      gravar(gravando, c);
      setGravando(null);
      setAviso(null);
    };
    // captura antes de todo mundo: enquanto grava, nenhum atalho dispara
    window.addEventListener("keydown", f, true);
    return () => window.removeEventListener("keydown", f, true);
  }, [gravando, prefs.atalhos]); // eslint-disable-line react-hooks/exhaustive-deps

  // a busca acha pelo nome, pelas palavras escondidas ("aumentar janela" → Maximizar) e pela combinação
  const achados = acharAtalhos(busca);
  const grupos = [...new Set(achados.map((a) => a.grupo))];
  const mudouDois = (id: string) => !!prefs.atalhos?.[chaveDois(id)];
  const mudados = ATALHOS.filter((a) => prefs.atalhos?.[a.id] || mudouDois(a.id)).length;

  return (
    <>
      <h3>Atalhos</h3>
      <p className="dica">
        Clique no atalho e aperte a combinação nova (Esc cancela). As combinações valem pela posição da tecla, então o
        AltGr do teclado não atrapalha. Os atalhos de dentro do texto (/, #código, Ctrl+clique) não mudam.
        Na coluna do {PREFIXO.replace("+", " ")}, clique e aperte a segunda tecla do atalho em dois tempos (sozinha ou com
        Shift); Backspace tira.
      </p>
      {mudados > 0 && (
        <button className="btn" style={{ marginBottom: 10 }} onClick={() => mudar({ atalhos: Object.fromEntries(ATALHOS.flatMap((a) => [[a.id, ""], [chaveDois(a.id), ""]])) })}>
          <RotateCcw size={14} /> Voltar todos ao padrão ({mudados} mudados)
        </button>
      )}
      <div className="atalhos-busca">
        <Search size={14} />
        <input autoFocus placeholder="Procurar um atalho (ex.: aumentar janela, terminal, Ctrl+B)…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      {aviso && <div className="agente-nota erro" style={{ marginBottom: 10 }}>{aviso}</div>}
      {achados.length === 0 && <p className="dica">Nenhum atalho com isso.</p>}
      {grupos.map((g) => (
        <div key={g}>
          <h4>{g}</h4>
          <div className="atalhos-config">
            {achados.filter((a) => a.grupo === g).map((a) => {
              const mudado = !!prefs.atalhos?.[a.id];
              return (
                <div key={a.id} className="atalho">
                  <span>
                    {a.nome}
                    {!mudado && a.extras?.length ? <span className="atalho-extra"> · também {a.extras.join(", ")}</span> : null}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                    <button
                      className={`atalho-botao dois${gravandoDois === a.id ? " gravando" : ""}${mudouDois(a.id) ? " mudado" : ""}`}
                      title={segunda(a.id) ? `Em dois tempos: ${PREFIXO}, solta, e ${segunda(a.id)}. Clique para mudar` : `Dar a este atalho uma versão em dois tempos (${PREFIXO} e uma tecla)`}
                      onClick={() => { setGravandoDois(a.id); setGravando(null); setAviso(null); }}
                    >
                      {gravandoDois === a.id ? "aperte a tecla…" : segunda(a.id) ? <><kbd>{PREFIXO.replace("+", " ")}</kbd> <kbd>{segunda(a.id)}</kbd></> : <span className="atalho-extra">+ {PREFIXO.replace("+", " ")}</span>}
                    </button>
                    {mudouDois(a.id) && (
                      <button className="btn-icone mini" title={padraoDois(a.id) ? `Voltar ao padrão (${PREFIXO} ${padraoDois(a.id)})` : "Tirar a versão em dois tempos"} onClick={() => gravar(chaveDois(a.id), "")}><RotateCcw size={12} /></button>
                    )}
                    <button className={`atalho-botao${gravando === a.id ? " gravando" : ""}${mudado ? " mudado" : ""}`} onClick={() => { setGravando(a.id); setGravandoDois(null); setAviso(null); }}>
                      {gravando === a.id ? "aperte a combinação…" : partes(combinacao(a.id)).map((t, i) => <kbd key={i}>{t}</kbd>)}
                    </button>
                    {mudado && (
                      <button className="btn-icone mini" title={`Voltar ao padrão (${a.padrao})`} onClick={() => gravar(a.id, "")}><RotateCcw size={12} /></button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}
