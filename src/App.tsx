import { useCallback, useEffect, useRef, useState } from "react";
import { api, BASE, Bancadas, Esquema, Preferencias, TemaArquivo, Visao } from "./api";
import { aplicarTema } from "./tema";
import { BarraTitulo } from "./components/BarraTitulo";
import { Configuracoes, SecaoConfig } from "./components/Configuracoes";
import { EscolherAgente } from "./components/Terminal";
import { CapturaGlobal } from "./components/Captura";
import { Atalhos } from "./components/Atalhos";
import { Sidebar } from "./components/Sidebar";
import { Contexto, PainelTrabalho } from "./components/Painel";
import * as P from "./painel";
import { EstadoPainel, janelaAtiva, rotaDe } from "./painel";
import { avisar, falhou, guardar, ler, Rota, Tema } from "./ui";

/** Pisca o item onde ele aparecer (linhas das visões, árvore, citações). */
function destacar(codigo: string) {
  const els = [...document.querySelectorAll<HTMLElement>(`[data-codigo="${CSS.escape(codigo)}"]`)];
  els[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
  for (const el of els) {
    el.classList.remove("destaque");
    void el.offsetWidth;
    el.classList.add("destaque");
    window.setTimeout(() => el.classList.remove("destaque"), 3200);
  }
  if (!els.length) avisar(`#${codigo} não está na tela agora.`);
}

/** Nome de um lugar do histórico quando a janela ainda não guardou o título dele. */
function rotuloSimples(r: Rota): string {
  switch (r.v) {
    case "item": return `Item ${r.id}`;
    case "visao": return "Visão";
    case "lixeira": return "Lixeira";
    case "terminal": return r.titulo ?? "terminal";
    case "arquivos": return r.titulo ?? "arquivos";
    default: return r.v;
  }
}

export default function App() {
  const [esquema, setEsquema] = useState<Esquema | null>(null);
  const [visoes, setVisoes] = useState<Visao[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [tema, setTemaEstado] = useState<Tema>(() => ler("tema", "nord"));
  const [fechada, setFechada] = useState<boolean>(() => ler("sidebarFechada", false));
  const [largura, setLargura] = useState<number>(() => ler("sidebarLargura", 248));
  useEffect(() => guardar("sidebarLargura", largura), [largura]);
  const [painel, setPainel] = useState<EstadoPainel>(() => P.restaurar(ler<EstadoPainel | null>("painel", null), ler<Rota>("rota", { v: "inicio" })));
  const [aviso, setAviso] = useState<{ msg: string; desfazer?: () => Promise<unknown> | void } | null>(null);
  const [bancadas, setBancadas] = useState<Bancadas | null>(null);
  const [config, setConfig] = useState<null | SecaoConfig>(null);
  const [temas, setTemas] = useState<TemaArquivo[]>([]);
  const [prefs, setPrefs] = useState<Preferencias | null>(null);
  const [verAtalhos, setVerAtalhos] = useState(false);

  const ativa = janelaAtiva(painel);
  const rota: Rota = ativa ? rotaDe(ativa) : { v: "inicio" };
  useEffect(() => {
    const t = window.setTimeout(() => guardar("painel", painel), 300);
    return () => window.clearTimeout(t);
  }, [painel]);

  // itens abertos por último (aparecem na busca rápida vazia)
  useEffect(() => {
    if (rota.v !== "item" || !ativa?.titulo) return;
    const r = ler<{ id: number; codigo: string; titulo: string; tipo_id: number | null }[]>("recentes", []);
    const velho = r.find((x) => x.id === rota.id);
    const novo = [{ id: rota.id, codigo: velho?.codigo ?? "", titulo: ativa.titulo, tipo_id: ativa.tipo_id ?? null }, ...r.filter((x) => x.id !== rota.id)].slice(0, 12);
    guardar("recentes", novo);
  }, [JSON.stringify(rota), ativa?.titulo]); // eslint-disable-line react-hooks/exhaustive-deps

  const carregarEsquema = useCallback(async () => {
    try {
      setEsquema(await api.esquema());
      setOffline(false);
    } catch {
      setOffline(true);
    }
  }, []);
  const carregarVisoes = useCallback(async () => {
    try {
      setVisoes(await api.visoes());
    } catch (e) {
      falhou(e);
    }
  }, []);
  // criar ou apagar tipo mexe nas visões também
  const aoMudarEsquema = useCallback(async () => {
    await Promise.all([carregarEsquema(), carregarVisoes()]);
  }, [carregarEsquema, carregarVisoes]);

  const carregarBancadas = useCallback(() => api.bancadas().then(setBancadas).catch(() => {}), []);

  useEffect(() => {
    aoMudarEsquema();
    carregarBancadas();
    // o tema mora no config.toml; o localStorage só evita piscar na abertura
    api.preferencias().then((p) => { setTemaEstado(p.tema); setPrefs(p); }).catch(() => {});
  }, [aoMudarEsquema, carregarBancadas]);

  // temas em arquivo: relê ao voltar para a janela (quem editou o .toml vê na hora)
  const carregarTemas = useCallback(() => api.temas().then((r) => setTemas(r.temas)).catch(() => {}), []);
  useEffect(() => {
    carregarTemas();
    window.addEventListener("focus", carregarTemas);
    return () => window.removeEventListener("focus", carregarTemas);
  }, [carregarTemas]);

  useEffect(() => {
    aplicarTema(tema, temas);
    guardar("tema", tema);
  }, [tema, temas]);

  const mudarPrefs = useCallback((d: Partial<Preferencias>) => {
    setPrefs((p) => (p ? { ...p, ...d } : p));
    api.mudarPreferencias(d).then(setPrefs).catch(falhou);
  }, []);

  // tamanho da letra (zoom da página inteira); Ctrl + / Ctrl − / Ctrl 0
  const zoom = prefs?.zoom ?? 100;
  useEffect(() => {
    (document.body.style as CSSStyleDeclaration & { zoom: string }).zoom = String(zoom / 100);
  }, [zoom]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.altKey) return;
      const passos = [80, 85, 90, 100, 110, 125, 140, 160];
      const i = passos.findIndex((p) => p >= zoom);
      if (e.key === "=" || e.key === "+") { e.preventDefault(); mudarPrefs({ zoom: passos[Math.min(passos.length - 1, (passos[i] === zoom ? i : i - 1) + 1)] }); }
      if (e.key === "-") { e.preventDefault(); mudarPrefs({ zoom: passos[Math.max(0, i - 1)] }); }
      if (e.key === "0") { e.preventDefault(); mudarPrefs({ zoom: 100 }); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [zoom, mudarPrefs]);

  const setTema = (t: Tema) => {
    setTemaEstado(t);
    api.mudarPreferencias({ tema: t }).catch(falhou);
  };

  // depois de trocar a bancada: tudo da bancada anterior sai de cena
  const aposTrocarBancada = useCallback(async () => {
    setConfig(null);
    setPainel(P.inicial({ v: "inicio" }));
    setEsquema(null);
    setVisoes(null);
    await Promise.all([aoMudarEsquema(), carregarBancadas()]);
  }, [aoMudarEsquema, carregarBancadas]);

  const trocarBancada = async (caminho: string) => {
    try {
      await api.ativarBancada(caminho);
      await aposTrocarBancada();
    } catch (e) {
      falhou(e);
    }
  };

  useEffect(() => guardar("sidebarFechada", fechada), [fechada]);

  useEffect(() => {
    let t: number;
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ msg: string; desfazer?: () => Promise<unknown> | void }>).detail;
      setAviso(d);
      window.clearTimeout(t);
      t = window.setTimeout(() => setAviso(null), d.desfazer ? 8000 : 4000);
    };
    window.addEventListener("atelier:aviso", f);
    return () => window.removeEventListener("atelier:aviso", f);
  }, []);

  // Ctrl+Z desfaz a última ação que ofereceu "Desfazer" (fora de campos de texto, que têm o seu próprio)
  const avisoRef = useRef(aviso);
  avisoRef.current = aviso;
  const desfazerAgora = useCallback(async () => {
    const d = avisoRef.current?.desfazer;
    if (!d) return;
    setAviso(null);
    try {
      await d();
      window.dispatchEvent(new Event("focus"));
    } catch (e) {
      falhou(e);
    }
  }, []);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const alvo = e.target as HTMLElement;
      if (alvo.closest("input, textarea, [contenteditable=true], .xterm")) return;
      if (avisoRef.current?.desfazer) { e.preventDefault(); desfazerAgora(); }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [desfazerAgora]);

  // a barra lateral, o Ctrl+K e os links abrem na janela com o foco; "nova" abre ao lado
  const ir = useCallback((r: Rota) => setPainel((e) => P.navegar(e, r)), []);
  const abrirAoLado = useCallback((r: Rota) => setPainel((e) => P.abrirNova(e, r)), []);
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ rota: Rota; nova?: boolean }>).detail;
      (d.nova ? abrirAoLado : ir)(d.rota);
    };
    window.addEventListener("atelier:abrir", f);
    return () => window.removeEventListener("atelier:abrir", f);
  }, [ir, abrirAoLado]);
  // pedidos do MCP para a tela (abrir, recarregar, filtrar, destacar)
  useEffect(() => {
    let ws: WebSocket | null = null;
    let parar = false;
    let espera = 0;
    const ligar = () => {
      ws = new WebSocket(BASE.replace(/^http/, "ws") + "/tela/eventos");
      ws.onmessage = (m) => {
        const d = JSON.parse(String(m.data)) as { acao: string; rota?: Rota; ao_lado?: boolean; texto?: string; codigo?: string };
        if (d.acao === "abrir" && d.rota) (d.ao_lado ? abrirAoLado : ir)(d.rota);
        if (d.acao === "recarregar") window.dispatchEvent(new Event("focus"));
        if (d.acao === "filtrar") window.dispatchEvent(new CustomEvent("atelier:filtrar", { detail: { texto: d.texto ?? "" } }));
        if (d.acao === "destacar" && d.codigo) destacar(d.codigo);
      };
      ws.onopen = () => { espera = 0; };
      ws.onclose = () => { if (!parar) window.setTimeout(ligar, Math.min(10000, (espera = espera * 2 || 500))); };
    };
    ligar();
    return () => { parar = true; ws?.close(); };
  }, [ir, abrirAoLado]);

  const passo = (n: number) => setPainel((e) => { const a = janelaAtiva(e); return a ? P.irParaPasso(e, a.id, a.pos + n) : e; });
  const voltar = () => passo(-1);
  const avancar = () => passo(1);

  // atalhos do painel de trabalho (Ctrl+Alt+…; os dígitos ficam de fora quando se está digitando, por causa do AltGr)
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const digitando = !!(e.target as HTMLElement).closest?.("input, textarea, [contenteditable=true]");
      // no terminal, Ctrl+W apaga palavra e as setas são do programa: o painel não rouba
      if ((e.target as HTMLElement).closest?.(".xterm") && !(e.ctrlKey && e.altKey && !e.key.startsWith("Arrow"))) return;
      if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "w") {
        e.preventDefault();
        setPainel((s) => { const a = janelaAtiva(s); return a ? P.fechar(s, a.id) : s; });
        return;
      }
      if (e.ctrlKey && !e.altKey && e.key === "Tab") {
        e.preventDefault();
        setPainel((s) => P.focarVizinha(s, e.shiftKey ? -1 : 1));
        return;
      }
      if (!e.ctrlKey || !e.altKey) return;
      const com = (g: (s: EstadoPainel, id: string) => EstadoPainel) => setPainel((s) => { const a = janelaAtiva(s); return a ? g(s, a.id) : s; });
      const modos: Record<string, P.Modo> = { "1": "abas", "2": "tile", "3": "fita" };
      if (modos[e.key] && !digitando) { e.preventDefault(); setPainel((s) => P.mudarModo(s, s.foco, modos[e.key])); return; }
      switch (e.key) {
        case "\\": e.preventDefault(); setPainel(P.dividir); break;
        case "ArrowLeft": e.preventDefault(); if (e.shiftKey) com((s, id) => P.moverLado(s, id, -1)); else setPainel((s) => P.focarVizinha(s, -1)); break;
        case "ArrowRight": e.preventDefault(); if (e.shiftKey) com((s, id) => P.moverLado(s, id, 1)); else setPainel((s) => P.focarVizinha(s, 1)); break;
        case "ArrowDown": e.preventDefault(); com((s, id) => P.empilhar(s, id, true)); break;
        case "ArrowUp": e.preventDefault(); com((s, id) => P.empilhar(s, id, false)); break;
        case "Enter": e.preventDefault(); com(P.promover); break;
        case "r": case "R": e.preventDefault(); com(P.proximaLargura); break;
        case "o": case "O": e.preventDefault(); setPainel((s) => (s.metades.length > 1 ? { ...s, foco: 1 - s.foco } : s)); break;
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "\\") { e.preventDefault(); setFechada((f) => !f); }
      if (e.ctrlKey && e.key === ",") { e.preventDefault(); setConfig("aparencia"); }
      if (e.ctrlKey && e.key === "/") { e.preventDefault(); setVerAtalhos((v) => !v); }
      if (e.altKey && e.key === "ArrowLeft") voltar();
      if (e.altKey && e.key === "ArrowRight") avancar();
    };
    const mouse = (e: MouseEvent) => {
      if (e.button === 3) voltar();
      if (e.button === 4) avancar();
    };
    window.addEventListener("keydown", tecla);
    window.addEventListener("mouseup", mouse);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("mouseup", mouse);
    };
  }, []);

  if (offline) {
    return (
      <div className="offline">
        <h2>Não achei a API do atelier</h2>
        <p>Ela sobe junto com o app, em 127.0.0.1:7477. Se outra cópia do atelier estiver aberta, feche e abra de novo.</p>
        <button className="btn primario" onClick={aoMudarEsquema}>Tentar de novo</button>
      </div>
    );
  }
  if (!esquema || !visoes) return null;

  // a trilha da barra de título: bancada › tipo (do item) › o que está aberto na janela com o foco
  const visaoDoTipo = (tid: number) => visoes.find((v) => v.filtro?.tipos?.length === 1 && v.filtro.tipos[0] === tid);
  const trilha: { rotulo: string; rota?: Rota }[] = [{ rotulo: bancadas?.ativa?.nome ?? "atelier", rota: { v: "inicio" } }];
  const tipoDoItem = rota.v === "item" ? esquema.tipos.find((t) => t.id === ativa?.tipo_id) : undefined;
  if (tipoDoItem) {
    const vt = visaoDoTipo(tipoDoItem.id);
    trilha.push({ rotulo: `${tipoDoItem.icone} ${tipoDoItem.nome}`, rota: vt ? { v: "visao", id: vt.id } : { v: "lista", tipo: tipoDoItem.id } });
  }
  if (ativa?.titulo) trilha.push({ rotulo: rota.v === "item" || !ativa.icone ? ativa.titulo : `${ativa.icone} ${ativa.titulo}` });

  // título da janela (e da barra de tarefas) acompanha onde você está, sem o emoji
  document.title = `${trilha[trilha.length - 1].rotulo.replace(/^\p{Extended_Pictographic}\S*\s+/u, "")} · atelier`;

  const ctx: Contexto = {
    esquema,
    visoes,
    salvarVisao: (id, d) => {
      setVisoes((l) => l?.map((x) => (x.id === id ? { ...x, ...d } : x)) ?? l);
      api.atualizarVisao(id, d).catch(falhou);
    },
    apagarVisao: async (id) => {
      try {
        await api.apagarVisao(id);
        await carregarVisoes();
      } catch (e) {
        falhou(e);
      }
    },
    aoMudarEsquema,
  };

  return (
    <div className="app">
      <BarraTitulo
        esquema={esquema}
        rota={rota}
        ir={ir}
        trilha={trilha}
        alternarMenu={() => setFechada((f) => !f)}
        abrirConfig={() => setConfig("aparencia")}
        aoApagarItem={
          rota.v === "item"
            ? async () => {
                try {
                  const id = rota.id;
                  await api.apagarItem(id);
                  avisar("Movido para a lixeira.", async () => { await api.restaurarItem(id); ir({ v: "item", id }); });
                  if (ativa && ativa.pos > 0) voltar();
                  else if (ativa) setPainel((e) => P.fechar(e, ativa.id));
                } catch (e) {
                  falhou(e);
                }
              }
            : null
        }
      />
      <div className="corpo-app">
        <Sidebar
          visoes={visoes}
          esquema={esquema}
          rota={rota}
          ir={ir}
          bancadas={bancadas}
          abrirConfig={(secao) => setConfig(secao ?? "aparencia")}
          trocarBancada={trocarBancada}
          fechada={fechada}
          aoMudarVisoes={carregarVisoes}
          largura={largura}
          setLargura={setLargura}
          nav={{
            podeVoltar: !!ativa && ativa.pos > 0,
            podeAvancar: !!ativa && ativa.pos < ativa.hist.length - 1,
            voltar,
            avancar,
            passos: ativa ? ativa.hist.map((r, i) => ({ rotulo: ativa.rotulos?.[P.chaveRota(r)] ?? rotuloSimples(r), atual: i === ativa.pos })) : [],
            irPara: (i) => ativa && setPainel((e) => P.irParaPasso(e, ativa.id, i)),
          }}
        />
        <main className="principal">
          <PainelTrabalho estado={painel} mudar={setPainel} ctx={ctx} />
        </main>
      </div>
      {config && (
        <Configuracoes
          inicial={config}
          tema={tema}
          temas={temas}
          recarregarTemas={carregarTemas}
          setTema={setTema}
          esquema={esquema}
          irTipo={(id) => { setConfig(null); ir({ v: "tipo", id }); }}
          aoMudarEsquema={aoMudarEsquema}
          aoFechar={() => { setConfig(null); carregarBancadas(); }}
          aoTrocarBancada={aposTrocarBancada}
          prefs={prefs}
          mudarPrefs={mudarPrefs}
        />
      )}
      <CapturaGlobal prefs={prefs} />
      <EscolherAgente />
      {verAtalhos && <Atalhos aoFechar={() => setVerAtalhos(false)} />}
      {aviso && (
        <div className="toast">
          {aviso.msg}
          {aviso.desfazer && <button className="toast-desfazer" onClick={desfazerAgora}>Desfazer <kbd>Ctrl Z</kbd></button>}
        </div>
      )}
    </div>
  );
}
