import { abrirCodigo } from "./components/Mencoes";
import { abrirJanelaDaBancada, ABRIR_AO_CARREGAR, BANCADA_DA_JANELA, bancadaNaQuery, codificarBancada, decodificarBancada, mesmaBancada } from "./janela";
import { desfazerAgora, notificarFalta, PilhaDeAvisos } from "./components/Avisos";
import { notificar } from "./notificacoes";
import { atender, EstadoAgente, marcarAgente, verSessoes } from "./agentes";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, BASE, Bancadas, Esquema, Preferencias, TemaArquivo, Visao } from "./api";
import { aplicarTema } from "./tema";
import { BarraTitulo } from "./components/BarraTitulo";
import type { SecaoConfig } from "./components/Configuracoes";
import { abrirTerminal, definirInfoWorkspace, definirPastaDoWorkspace, EscolherAgente } from "./components/Terminal";
import { ComandoAgente, descreverTela, PedidoTela } from "./components/Comando";
import { AvisoAtualizacao } from "./components/Atualizacao";
import { CapturaGlobal } from "./components/Captura";
import { Atalhos } from "./components/Atalhos";
import { VisualizadorDeImagem } from "./components/VerImagem";
import "./moldura";
import { Sidebar, type Navegacao } from "./components/Sidebar";
import { cliqueNoOutro, Contexto, PainelTrabalho } from "./components/Painel";
import * as P from "./painel";
import { EstadoPainel, janelaAtiva, rotaDe } from "./painel";
import { avisar, falhou, guardar, ler, Rota, Tema } from "./ui";
import * as W from "./workspaces";
import { bate, definirAtalhos, doPainel } from "./atalhos";
import { BarraStatus, diasAutoArquivar, SeletorWorkspace, VisaoGeralWorkspaces } from "./components/Workspaces";

// só carrega quando abre (é grande e quase nunca está na tela)
const Configuracoes = lazy(() => import("./components/Configuracoes").then((m) => ({ default: m.Configuracoes })));

const VAZIO: EstadoPainel = P.inicial({ v: "inicio" });

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
    case "item": return `Documento ${r.id}`;
    case "visao": return "Visão";
    case "lixeira": return "Lixeira";
    case "sql": return "Consulta";
    case "terminal": return r.titulo ?? "terminal";
    case "arquivos": return r.titulo ?? "arquivos";
    case "pastas": return r.titulo ?? "pastas";
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
  // workspaces da bancada aberta (o painel de agora é o do workspace ativo)
  const [ws, setWs] = useState<W.Workspaces | null>(null);
  const [bancadas, setBancadas] = useState<Bancadas | null>(null);
  const [config, setConfig] = useState<null | SecaoConfig>(null);
  const [temas, setTemas] = useState<TemaArquivo[]>([]);
  const [prefs, setPrefs] = useState<Preferencias | null>(null);
  const [verAtalhos, setVerAtalhos] = useState(false);
  const [verWs, setVerWs] = useState(false);
  // modo Zen: a janela com foco maximizada, sem barras, e o app em tela cheia (F11; Esc duas vezes sai)
  const [zen, setZen] = useState(false);
  useEffect(() => {
    import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().setFullscreen(zen)).catch(() => {});
  }, [zen]);
  useEffect(() => {
    const abrir = () => setVerWs(true);
    // Ctrl+Shift+O (o "O" do overview do Niri)
    const tecla = (e: KeyboardEvent) => {
      if (bate("visao-geral", e)) { e.preventDefault(); setVerWs((v) => !v); }
    };
    window.addEventListener("atelier:ver-workspaces", abrir);
    window.addEventListener("keydown", tecla);
    return () => { window.removeEventListener("atelier:ver-workspaces", abrir); window.removeEventListener("keydown", tecla); };
  }, []);

  const painel: EstadoPainel = ws?.estados[ws.ativo] ?? VAZIO;
  const wsRef = useRef(ws);
  wsRef.current = ws;
  // abriu o workspace: o agente que tinha terminado ali já foi visto
  useEffect(() => {
    if (ws?.estados[ws.ativo]) verSessoes(W.sessoesDe(ws.estados[ws.ativo]).map((t) => t.sessao));
  }, [ws?.ativo]); // eslint-disable-line react-hooks/exhaustive-deps
  // muda o painel de um workspace (o ativo, se não disser qual)
  const mudarDe = useCallback((chave?: string) => (f: EstadoPainel | ((e: EstadoPainel) => EstadoPainel)) =>
    setWs((w) => {
      if (!w) return w;
      const k = chave ?? w.ativo;
      const atual = w.estados[k];
      if (!atual) return w;
      const novo = typeof f === "function" ? f(atual) : f;
      return novo === atual ? w : { ...w, estados: { ...w.estados, [k]: novo } };
    }), []);
  const setPainel = useMemo(() => mudarDe(), [mudarDe]);
  const ativa = janelaAtiva(painel);
  const rota: Rota = ativa ? rotaDe(ativa) : { v: "inicio" };
  const bancadaAtual = bancadas?.ativa?.caminho ?? null;
  useEffect(() => {
    if (bancadaAtual) setWs(W.carregar(bancadaAtual));
  }, [bancadaAtual]);
  // arquivar sozinho os workspaces parados (ao abrir a bancada, ao mudar a configuração e de hora em hora)
  useEffect(() => {
    if (!bancadaAtual) return;
    const rodar = () => {
      const dias = diasAutoArquivar();
      const w = wsRef.current;
      const r = w ? W.autoArquivar(w, dias) : null;
      if (!r?.arquivados.length) return;
      setWs((x) => (x ? W.autoArquivar(x, dias).w : x));
      const um = r.arquivados.length === 1;
      notificar({
        msg: `${um ? "arquivei o workspace" : "arquivei os workspaces"} ${r.arquivados.map((t) => `“${t}”`).join(", ")}, parado${um ? "" : "s"} há mais de ${dias} dias. ${um ? "Está" : "Estão"} em “Arquivados”, na lista de workspaces.`,
        nivel: "info", assunto: "app",
      });
    };
    const t0 = window.setTimeout(rodar, 2000);
    const t = window.setInterval(rodar, 3_600_000);
    window.addEventListener("atelier:auto-arquivar", rodar);
    return () => { window.clearTimeout(t0); window.clearInterval(t); window.removeEventListener("atelier:auto-arquivar", rodar); };
  }, [bancadaAtual]);
  // ir até um agente (a pílula da barra de status, a notificação): o workspace dele, o foco no terminal, sai da fila
  const irAoAgente = useCallback((sessao: number) => {
    setVerWs(false);
    setWs((w) => (w ? W.irAoAgente(w, sessao) : w));
    atender([sessao]);
  }, []);
  useEffect(() => {
    const f = (e: Event) => irAoAgente((e as CustomEvent<number>).detail);
    window.addEventListener("atelier:ir-agente", f);
    return () => window.removeEventListener("atelier:ir-agente", f);
  }, [irAoAgente]);
  // terminal e agente nascem na pasta do workspace: a do item (criada na hora, se ainda não tem) ou a raiz da bancada
  const wsAtivo = ws?.ativo;
  useEffect(() => {
    const id = wsAtivo ? W.itemDa(wsAtivo) : null;
    definirPastaDoWorkspace(async () => (id != null ? (await api.criarPasta(id)).pasta : bancadaAtual ?? undefined));
  }, [wsAtivo, bancadaAtual]);
  // o menu do terminal diz de quem é a pasta, e oferece a do item em foco quando ele não é o do workspace
  useEffect(() => {
    const id = wsAtivo ? W.itemDa(wsAtivo) : null;
    const doItem = rota.v === "item" && rota.id !== id ? rota.id : null;
    definirInfoWorkspace(() => ({
      nome: id != null ? `${ws?.info[wsAtivo!]?.titulo ?? "item"}` : `bancada ${bancadas?.ativa?.nome ?? ""}`.trim(),
      outroItem: doItem != null ? { id: doItem, titulo: ativa?.titulo ?? "item" } : null,
    }));
  });
  useEffect(() => {
    if (!ws || !bancadaAtual) return;
    const t = window.setTimeout(() => W.salvar(bancadaAtual, ws), 300);
    return () => window.clearTimeout(t);
  }, [ws, bancadaAtual]);
  // "Workspace" na página do item (ou o Geral)
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ id: number; titulo: string; icone?: string } | null>).detail;
      setWs((w) => (w ? W.abrir(w, d ? W.chaveItem(d.id) : W.GERAL, d ? { titulo: d.titulo || "Sem título", icone: d.icone } : undefined) : w));
    };
    window.addEventListener("atelier:workspace", f);
    // um documento foi lido (aberto, recarregado): o workspace dele acompanha o título
    const lido = (e: Event) => {
      const d = (e as CustomEvent<{ id: number; titulo: string; icone?: string }>).detail;
      setWs((w) => (w ? W.seguirDocumento(w, d.id, d.titulo, d.icone) : w));
    };
    window.addEventListener("atelier:documento-lido", lido);
    return () => { window.removeEventListener("atelier:workspace", f); window.removeEventListener("atelier:documento-lido", lido); };
  }, []);

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

  const carregarBancadas = useCallback(() => api.bancadas().then((b) => {
    if (BANCADA_DA_JANELA) {
      const minha = b.bancadas.find((x) => mesmaBancada(x.caminho, decodificarBancada(BANCADA_DA_JANELA!)));
      if (minha) b = { ...b, ativa: minha };
    }
    setBancadas(b);
  }).catch(() => {}), []);

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
  // atalhos que o Paulo mudou (Configurações → Atalhos)
  useEffect(() => definirAtalhos(prefs?.atalhos), [prefs?.atalhos]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const passos = [80, 85, 90, 100, 110, 125, 140, 160];
      const i = passos.findIndex((p) => p >= zoom);
      if (bate("zoom-mais", e)) { e.preventDefault(); mudarPrefs({ zoom: passos[Math.min(passos.length - 1, (passos[i] === zoom ? i : i - 1) + 1)] }); }
      if (bate("zoom-menos", e)) { e.preventDefault(); mudarPrefs({ zoom: passos[Math.max(0, i - 1)] }); }
      if (bate("zoom-normal", e)) { e.preventDefault(); mudarPrefs({ zoom: 100 }); }
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
    setWs(null);
    setEsquema(null);
    setVisoes(null);
    await Promise.all([aoMudarEsquema(), carregarBancadas()]);
  }, [aoMudarEsquema, carregarBancadas]);

  const trocarBancadaJa = async (caminho: string) => {
    try {
      // janela de outra bancada: troca só esta janela (a principal e a ativa ficam como estão)
      if (BANCADA_DA_JANELA) {
        location.search = `?bancada=${encodeURIComponent(codificarBancada(caminho))}`;
        return;
      }
      await api.ativarBancada(caminho);
      await aposTrocarBancada();
    } catch (e) {
      falhou(e);
    }
  };
  // toda troca pergunta antes, seja o Paulo clicando, seja o agente pedindo
  const [pedidoTroca, setPedidoTroca] = useState<{ caminho: string; nome: string; doAgente: boolean } | null>(null);
  const trocarBancada = (caminho: string) => {
    const b = bancadas?.bancadas.find((x) => mesmaBancada(x.caminho, caminho));
    setPedidoTroca({ caminho, nome: b?.nome ?? caminho, doAgente: false });
  };

  useEffect(() => guardar("sidebarFechada", fechada), [fechada]);

  // Ctrl+Z desfaz a última ação que ofereceu "Desfazer" (fora de campos de texto, que têm o seu próprio)
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.key.toLowerCase() !== "z" || e.shiftKey) return;
      const alvo = e.target as HTMLElement;
      if (alvo.closest("input, textarea, [contenteditable=true], .xterm")) return;
      if (desfazerAgora()) e.preventDefault();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  // a barra lateral, o Ctrl+K e os links abrem na janela com o foco; "nova" abre ao lado
  const ir = useCallback((r: Rota) => setPainel((e) => P.navegar(e, r)), []);
  const abrirAoLado = useCallback((r: Rota) => setPainel((e) => P.abrirNova(e, r)), []);
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ rota: Rota; nova?: boolean }>).detail;
      // Ctrl+Alt+clique (barra lateral, busca...): no outro painel
      if (cliqueNoOutro()) setPainel((s) => P.abrirNoOutro(s, d.rota));
      else (d.nova ? abrirAoLado : ir)(d.rota);
    };
    window.addEventListener("atelier:abrir", f);
    return () => window.removeEventListener("atelier:abrir", f);
  }, [ir, abrirAoLado]);
  // uma rajada de gravações do agente vira uma recarga só
  const tRecarga = useRef<number | undefined>(undefined);
  const recarregarTudo = () => {
    window.clearTimeout(tRecarga.current);
    tRecarga.current = window.setTimeout(() => {
      aoMudarEsquema();
      carregarBancadas();
      window.dispatchEvent(new Event("focus"));
    }, 300);
  };
  // pedidos para a tela, vindos do MCP (o agente) e do Comando: a lista está em core/src/api.rs (ACOES_TELA)
  const pedidoDaTela = (d: PedidoTela) => {
    const naMetade = (f: (s: EstadoPainel) => EstadoPainel) => setPainel((s) => {
      if (d.metade == null) return f(s);
      const n = d.metade > 0 && s.metades.length < 2 ? P.dividir(s) : s;
      return f(P.focar(n, Math.min(d.metade, n.metades.length - 1)));
    });
    switch (d.acao) {
      case "abrir":
        if (!d.rota) return;
        if (d.metade != null) setPainel((s) => P.abrirNaMetade(s, d.rota!, d.metade!, d.ao_lado));
        else (d.ao_lado ? abrirAoLado : ir)(d.rota);
        return;
      case "workspace":
        setWs((w) => (w ? W.abrir(w, d.item ? W.chaveItem(d.item.id) : W.GERAL, d.item ? { titulo: d.item.titulo || "Sem título" } : undefined) : w));
        return;
      case "fechar_workspace":
        setWs((w) => (w ? W.fechar(w, d.item ? W.chaveItem(d.item.id) : w.ativo) : w));
        return;
      case "visao_geral": setVerWs(true); return;
      case "renomear_workspace":
        setWs((w) => (w ? W.renomear(w, d.item ? W.chaveItem(d.item.id) : W.GERAL, d.nome ?? "") : w));
        return;
      case "dividir": case "mostrar_direita": setPainel((s) => (s.metades.length > 1 && !s.metades[1].escondida ? s : P.dividir(s))); return;
      case "esconder_direita": setPainel((s) => (P.duasVisiveis(s) ? P.dividir(s) : s)); return;
      case "fixar": case "desafixar": case "expandir": {
        const qual = d.janela ?? "atual";
        setPainel((s) => {
          const id = qual === "atual" ? janelaAtiva(s)?.id : P.acharJanela(s, qual)?.j.id;
          if (!id) return s;
          if (d.acao === "expandir") return P.alternarExpandida(s, id);
          const j = P.acharJanela(s, id)!.j;
          return !!j.fixada === (d.acao === "fixar") ? s : P.alternarFixada(s, id);
        });
        return;
      }
      case "juntar": setPainel(P.juntar); return;
      case "modo": naMetade((s) => P.mudarModo(s, s.foco, d.modo as P.Modo)); return;
      case "fechar": naMetade((s) => P.fecharJanelas(s, d.janela ?? "atual")); return;
      case "focar": {
        const id = d.janela;
        if (id) setPainel((s) => { const achada = P.acharJanela(s, id); return achada ? P.ativar(s, achada.mi, id) : s; });
        else naMetade((s) => s);
        return;
      }
      case "terminal":
        naMetade((s) => s);
        // espera o foco mudar de metade antes de abrir
        window.setTimeout(() => abrirTerminal(d.cwd ?? undefined, d.programa ?? undefined, d.titulo ?? undefined, d.shell ?? undefined), 0);
        return;
      case "barra_lateral": setFechada(!d.mostrar); return;
      case "tema": if (d.tema) setTema(d.tema); return;
      case "zoom": if (d.zoom) mudarPrefs({ zoom: d.zoom }); return;
      case "configuracoes": setConfig((d.secao as SecaoConfig) ?? "aparencia"); return;
      case "busca": window.dispatchEvent(new CustomEvent("atelier:busca", { detail: d.texto ?? "" })); return;
      case "bancada": return;
      // o agente pediu para trocar de bancada: pergunta
      case "pedir_bancada": if (d.caminho) setPedidoTroca({ caminho: d.caminho, nome: d.nome ?? d.caminho, doAgente: true }); return;
      case "recarregar": window.dispatchEvent(new Event("focus")); return;
      // outro processo (o agente, pelo MCP) gravou no banco: esquema, visões, bancadas e o que está à vista
      case "mudou": recarregarTudo(); return;
      case "filtrar": window.dispatchEvent(new CustomEvent("atelier:filtrar", { detail: { texto: d.texto ?? "" } })); return;
      case "destacar": if (d.codigo) destacar(d.codigo); return;
      case "falta": notificarFalta(d.texto ?? "", d.agente ?? undefined); return;
      // o hook de um agente avisou: acende o workspace e, se terminou ou espera você, avisa
      case "agente": {
        if (d.sessao == null || !d.estado) return;
        marcarAgente(d.sessao, d.estado as EstadoAgente);
        if (d.estado === "trabalhando") return;
        const w = wsRef.current;
        const k = w ? Object.keys(w.estados).find((x) => W.sessoesDe(w.estados[x]).some((t) => t.sessao === d.sessao)) : undefined;
        // o agente que você está olhando agora (app em foco, workspace dele aberto, terminal dele à vista) não vira
        // toast: vai só para o sininho, e a carinha muda de cor
        const est = k && w && k === w.ativo ? w.estados[k] : null;
        const aVista = document.hasFocus() && !verWs && !!est && est.metades.some((m, mi) => {
          if (est.maximizada && mi !== est.foco) return false;
          return m.janelas.some((j) => {
            const r = P.rotaDe(j);
            if (r.v !== "terminal" || r.sessao !== d.sessao) return false;
            return (m.modo === "tile" && !est.maximizada) || m.ativa === j.id;
          });
        });
        // olhando para ele: já foi atendido (não entra na fila da barra de status)
        if (aVista) atender([d.sessao]);
        // quem manda é o workspace (o nome dele em destaque); clicar vai até o agente
        notificar({
          msg: d.estado === "esperando" ? "um agente está esperando você." : "um agente terminou.",
          nivel: d.estado === "esperando" ? "aviso" : "info", assunto: "agente",
          de: k && w ? (w.info[k]?.titulo ?? k) : "Agente", agente: k ? d.sessao : undefined,
        }, aVista);
        return;
      }
    }
  };
  // outras telas pedem as Configurações numa seção (ex.: o Comando sem agente → Integrações)
  useEffect(() => {
    const f = (e: Event) => setConfig(((e as CustomEvent<string>).detail as SecaoConfig) || "aparencia");
    window.addEventListener("atelier:config", f);
    return () => window.removeEventListener("atelier:config", f);
  }, []);
  const pedidoRef = useRef(pedidoDaTela);
  pedidoRef.current = pedidoDaTela;
  // os pedidos vão em fila: o que vem logo depois de uma troca de bancada espera ela terminar (o agente costuma
  // trocar e já mandar abrir alguma coisa)
  const fila = useRef(Promise.resolve());
  const enfileirar = (d: PedidoTela) => {
    if (d.bancada) {
      const minha = BANCADA_DA_JANELA ? decodificarBancada(BANCADA_DA_JANELA) : bancadasRef.current?.ativa?.caminho;
      if (minha && !mesmaBancada(minha, d.bancada)) return;
    }
    if (d.acao === "bancada" && BANCADA_DA_JANELA) return;
    fila.current = fila.current.then(async () => {
      if (d.acao === "bancada") {
        await aposTrocarBancadaRef.current();
        await new Promise((r) => window.setTimeout(r, 300));
      } else pedidoRef.current(d);
    }).catch(() => {});
  };
  const bancadasRef = useRef(bancadas);
  bancadasRef.current = bancadas;
  const aposTrocarBancadaRef = useRef(aposTrocarBancada);
  aposTrocarBancadaRef.current = aposTrocarBancada;
  useEffect(() => {
    let ws: WebSocket | null = null;
    let parar = false;
    let espera = 0;
    const ligar = () => {
      ws = new WebSocket(BASE.replace(/^http/, "ws") + "/tela/eventos" + (bancadaNaQuery() ? `?${bancadaNaQuery()}` : ""));
      ws.onmessage = (m) => enfileirar(JSON.parse(String(m.data)) as PedidoTela);
      ws.onopen = () => { espera = 0; };
      ws.onclose = () => { if (!parar) window.setTimeout(ligar, Math.min(10000, (espera = espera * 2 || 500))); };
    };
    ligar();
    return () => { parar = true; ws?.close(); };
  }, []);

  useEffect(() => {
    let solta: (() => void) | undefined;
    const seguir = (url: string) => {
      const resto = url.replace(/^atelier:\/\//, "").replace(/\/+$/, "");
      const [tipo, ...nome] = resto.split("/");
      const valor = decodeURIComponent(nome.join("/"));
      if (tipo === "doc") abrirCodigo(valor, (r) => abrirAoLado(r));
      else if (tipo === "visao") {
        api.visoes().then((vs) => {
          const v = vs.find((x) => x.nome.toLowerCase() === valor.toLowerCase());
          if (v) abrirAoLado({ v: "visao", id: v.id });
          else avisar(`A visão “${valor}” não existe nesta bancada.`);
        }).catch(falhou);
      } else if (tipo === "bancada") {
        const b = bancadasRef.current?.bancadas.find((x) => x.nome.toLowerCase() === valor.toLowerCase());
        if (b) abrirJanelaDaBancada(b.caminho, b.nome);
        else avisar(`A bancada “${valor}” não existe.`);
      }
    };
    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        solta = await getCurrentWebviewWindow().listen<string>("atelier:link", (e) => seguir(e.payload));
        void listen;
        if (!BANCADA_DA_JANELA) {
          const { invoke } = await import("@tauri-apps/api/core");
          const inicial = await invoke<string | null>("link_inicial");
          if (inicial) await invoke("seguir_link", { url: inicial });
        }
      } catch { /* no navegador de teste não há Tauri */ }
      if (ABRIR_AO_CARREGAR) window.setTimeout(() => seguir(`atelier://doc/${ABRIR_AO_CARREGAR}`), 800);
    })();
    return () => solta?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // o que está na tela, em texto: vai para a API (o agente consulta com tela → estado) e para o Comando
  const descricaoTela = useMemo(() => (ws ? descreverTela(ws, bancadas, visoes) : ""), [ws, bancadas, visoes]);
  useEffect(() => {
    if (!descricaoTela) return;
    const t = window.setTimeout(() => api.estadoDaTela(descricaoTela).catch(() => {}), 400);
    return () => window.clearTimeout(t);
  }, [descricaoTela]);

  const passo = (n: number) => setPainel((e) => { const a = janelaAtiva(e); return a ? P.irParaPasso(e, a.id, a.pos + n) : e; });
  const voltar = () => passo(-1);
  const avancar = () => passo(1);
  const voltarRef = useRef(voltar);
  voltarRef.current = voltar;
  const avancarRef = useRef(avancar);
  avancarRef.current = avancar;

  const zenRef = useRef(zen);
  zenRef.current = zen;
  const ultimoEsc = useRef(0);
  // atalhos do painel de trabalho e da navegação (todos configuráveis: src/atalhos.ts)
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      const digitando = !!alvo.closest?.("input, textarea, [contenteditable=true]");
      // no terminal, as teclas são do programa (Ctrl+W apaga palavra, setas...): só passam os atalhos do painel (andar
      // na fita com Ctrl+Alt+setas, mover, dividir...), que o terminal também deixa subir
      if (alvo.closest?.(".xterm") && !doPainel(e)) return;
      // digitando, Ctrl+Alt+letra/número é o AltGr do teclado (ABNT2: ?, °, ¹...): não é atalho
      // (o AltGr nunca vem com Shift: Ctrl+Alt+Shift+J, o expandir, vale digitando)
      if (digitando && e.ctrlKey && e.altKey && !e.shiftKey && /^(Key|Digit)/.test(e.code)) return;
      const com = (g: (s: EstadoPainel, id: string) => EstadoPainel) => setPainel((s) => { const a = janelaAtiva(s); return a ? g(s, a.id) : s; });
      const acoes: [string, () => void][] = [
        // a fixada não fecha pelo atalho: o alfinete na aba desafixa, e aí fecha
        ["fechar-janela", () => com((s, id) => {
          if (P.acharJanela(s, id)?.j.fixada) { window.setTimeout(() => avisar("Janela fixada: tire o alfinete (na aba) para fechar."), 0); return s; }
          return P.fechar(s, id);
        })],
        ["proxima-janela", () => setPainel((s) => P.focarVizinha(s, 1))],
        ["janela-anterior", () => setPainel((s) => P.focarVizinha(s, -1))],
        ["modo-abas", () => setPainel((s) => P.mudarModo(s, s.foco, "abas"))],
        ["modo-tile", () => setPainel((s) => P.mudarModo(s, s.foco, "tile"))],
        ["modo-fita", () => setPainel((s) => P.mudarModo(s, s.foco, "fita"))],
        ["dividir", () => setPainel(P.dividir)],
        ["foco-esquerda", () => setPainel((s) => P.focarVizinha(s, -1))],
        ["foco-direita", () => setPainel((s) => P.focarVizinha(s, 1))],
        ["mover-esquerda", () => com((s, id) => P.moverLado(s, id, -1))],
        ["mover-direita", () => com((s, id) => P.moverLado(s, id, 1))],
        ["empilhar", () => com((s, id) => P.empilhar(s, id, true))],
        ["desempilhar", () => com((s, id) => P.empilhar(s, id, false))],
        ["promover", () => com(P.promover)],
        ["largura", () => com(P.proximaLargura)],
        ["trocar-metade", () => setPainel((s) => (s.metades.length > 1 ? P.focar(s, 1 - s.foco) : s))],
        ["workspace-proximo", () => setWs((w) => (w ? W.vizinho(w, 1) : w))],
        ["workspace-anterior", () => setWs((w) => (w ? W.vizinho(w, -1) : w))],
        ["menu", () => setFechada((x) => !x)],
        ["config", () => setConfig("aparencia")],
        ["atalhos", () => setConfig("atalhos")],
        ["maximizar", () => setPainel((s) => P.alternarExpandida(s))],
        ["zen", () => setZen((z) => { setPainel((s) => ({ ...s, maximizada: !z })); return !z; })],
        ["painel-0", () => setPainel((s) => P.focar(s, 0))],
        ["painel-1", () => setPainel((s) => (s.metades.length > 1 ? P.focar(s, 1) : P.dividir(s)))],
        ["ir-terminal", () => setPainel((s) => {
          // o último terminal do painel com foco (ou de qualquer um); sem terminal, abre um
          const ordem = [s.foco, ...s.metades.map((_, i) => i).filter((i) => i !== s.foco)];
          for (const mi of ordem) {
            const t = [...s.metades[mi].janelas].reverse().find((j) => P.rotaDe(j).v === "terminal");
            if (t) return P.ativar(s, mi, t.id);
          }
          window.setTimeout(() => abrirTerminal(), 0);
          return s;
        })],
        ["voltar", voltarRef.current],
        ["avancar", avancarRef.current],
      ];
      for (const [id, faz] of acoes) {
        // Ctrl+B no texto é negrito: a barra lateral só fora do editor
        if (id === "menu" && alvo.closest?.(".ProseMirror")) continue;
        if (bate(id, e)) { e.preventDefault(); faz(); return; }
      }
      // Esc duas vezes seguidas sai do modo Zen
      if (e.key === "Escape" && zenRef.current) {
        if (Date.now() - ultimoEsc.current < 600) { setZen(false); setPainel((s) => ({ ...s, maximizada: false })); }
        ultimoEsc.current = Date.now();
      }
    };
    const mouse = (e: MouseEvent) => {
      if (e.button === 3) voltarRef.current();
      if (e.button === 4) avancarRef.current();
    };
    window.addEventListener("keydown", f);
    window.addEventListener("mouseup", mouse);
    return () => { window.removeEventListener("keydown", f); window.removeEventListener("mouseup", mouse); };
  }, [setPainel]);

  if (offline) {
    return (
      <div className="offline">
        <h2>Não achei a API do atelier</h2>
        <p>Ela sobe junto com o app, em 127.0.0.1:7477. Se outra cópia do atelier estiver aberta, feche e abra de novo.</p>
        <button className="btn primario" onClick={aoMudarEsquema}>Tentar de novo</button>
      </div>
    );
  }
  if (!esquema || !visoes || !ws) return null;

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
    criarVisao: async (d) => {
      const { id } = await api.criarVisao(d);
      await carregarVisoes();
      return id;
    },
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

  const nav: Navegacao = {
    podeVoltar: !!ativa && ativa.pos > 0,
    podeAvancar: !!ativa && ativa.pos < ativa.hist.length - 1,
    voltar,
    avancar,
    passos: ativa ? ativa.hist.map((r, i) => ({ rotulo: ativa.rotulos?.[P.chaveRota(r)] ?? rotuloSimples(r), atual: i === ativa.pos })) : [],
    irPara: (i) => ativa && setPainel((e) => P.irParaPasso(e, ativa.id, i)),
  };

  return (
    <div className={`app${zen ? " zen" : ""}`}>
      <BarraTitulo
        esquema={esquema}
        rota={rota}
        ir={ir}
        trilha={trilha}
        alternarMenu={() => setFechada((f) => !f)}
        abrirConfig={() => setConfig("aparencia")}
        abrirAtalhos={() => setConfig("atalhos")}
        nav={nav}
        workspace={
          <SeletorWorkspace
            ws={ws}
            trocar={(k) => setWs((w) => (w ? W.abrir(w, k) : w))}
            fechar={(k) => setWs((w) => (w ? W.fechar(w, k) : w))}
            esquecer={(k) => setWs((w) => (w ? W.esquecer(w, k) : w))}
            renomear={(k, n) => setWs((w) => (w ? W.renomear(w, k, n) : w))}
            arquivar={(k) => setWs((w) => (w ? W.arquivar(w, k) : w))}
            desarquivar={(k) => setWs((w) => (w ? W.desarquivar(w, k) : w))}
          />
        }
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
      <div className={`corpo-app${fechada || zen ? " sem-barra" : ""}`}>
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
        />
        <main className="principal">
          {/* os workspaces abertos ficam montados por trás: trocar não mata terminal nem agente */}
          {ws.abertos.filter((k) => ws.estados[k]).map((k) => (
            <div key={k} className="workspace" style={{ display: k === ws.ativo ? undefined : "none" }}>
              <PainelTrabalho estado={ws.estados[k]} mudar={mudarDe(k)} ctx={ctx} ativo={k === ws.ativo} />
            </div>
          ))}
        </main>
      </div>
      {config && (
        <Suspense fallback={null}>
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
            bancada={bancadas?.ativa ?? null}
          />
        </Suspense>
      )}
      <ComandoAgente descricao={descricaoTela} />
      <BarraStatus ws={ws} irAoAgente={irAoAgente} />
      <CapturaGlobal prefs={prefs} />
      <VisualizadorDeImagem />
      <EscolherAgente />
      <AvisoAtualizacao prefs={prefs} />
      {verAtalhos && <Atalhos aoFechar={() => setVerAtalhos(false)} />}
      {verWs && (
        <VisaoGeralWorkspaces
          ws={ws}
          aoEscolher={(k) => { setWs((w) => (w ? W.abrir(w, k) : w)); setVerWs(false); }}
          aoFechar={() => setVerWs(false)}
          fecharWs={(k) => setWs((w) => (w ? W.fechar(w, k) : w))}
          renomear={(k, n) => setWs((w) => (w ? W.renomear(w, k, n) : w))}
        />
      )}
      <PilhaDeAvisos />
      {pedidoTroca && (
        <div className="modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && setPedidoTroca(null)}>
          <div className="modal confirmar-bancada">
            <h3>{pedidoTroca.doAgente ? "O agente quer trocar de bancada" : "Trocar de bancada"}</h3>
            <p>
              Trocar esta janela para a bancada <strong>{pedidoTroca.nome}</strong>?
              {ws && ws.abertos.some((k) => ws.estados[k] && W.sessoesDe(ws.estados[k]).length > 0)
                ? " Os terminais e agentes abertos nesta janela vão fechar."
                : ""}
            </p>
            <p className="dica">Para trabalhar nas duas ao mesmo tempo, abra a outra numa janela nova.</p>
            <div className="ca-acoes">
              <button className="btn" onClick={() => setPedidoTroca(null)}>Cancelar</button>
              <button className="btn" onClick={() => { const p = pedidoTroca; setPedidoTroca(null); abrirJanelaDaBancada(p.caminho, p.nome); }}>Abrir em nova janela</button>
              <button className="btn primario" autoFocus onClick={() => { const p = pedidoTroca; setPedidoTroca(null); trocarBancadaJa(p.caminho); }}>Trocar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
