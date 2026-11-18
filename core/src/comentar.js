// Comentar dentro do que o atelier mostra (markdown, texto, HTML). Roda isolado na moldura (sem acesso ao atelier) e
// fala com a tela por postMessage:
//   → { atelier: "comentar", trecho, antes, depois, comentario }   selecionou, escreveu na caixinha e deu Enter
//   → { atelier: "comentario-clicado", id }                        clicou num grifo
//   ← { atelier: "grifos", lista: [{ id, trecho, antes, depois, resolvido, comentario, autor, resposta }], tema }
//   ← { atelier: "ir", id }                                        rola até o grifo, marca e mostra o comentário
(function () {
  if (window.__atelierComentar) return;
  window.__atelierComentar = 1;
  var P = window.parent;
  var CTX = 40;
  var tema = { bg: "#ffffff", texto: "#222222", texto3: "#888888", borda: "rgba(0,0,0,.18)", acento: "#b8572f" };
  var porId = {};

  var estilo = document.createElement("style");
  function pintar() {
    estilo.textContent =
      "mark.atelier-c{background:rgba(250,200,60,.42);color:inherit;border-radius:2px;cursor:pointer;padding:0;" +
      "border-bottom:2px solid rgba(225,160,20,.9)}" +
      "mark.atelier-c:hover{background:rgba(250,190,40,.62)}" +
      "mark.atelier-c.resolvido{background:transparent;border-bottom:2px dotted rgba(120,180,120,.85)}" +
      "mark.atelier-c.ativo{background:rgba(250,170,40,.7);outline:2px solid rgba(240,150,20,.95);outline-offset:1px}" +
      "mark.atelier-c.pendente{background:rgba(120,170,250,.35);border-bottom:2px solid rgba(80,130,230,.9);cursor:text}" +
      ".atelier-flutua{position:absolute;z-index:2147483647;box-sizing:border-box;width:300px;max-width:calc(100vw - 16px);" +
      "font:13px/1.45 system-ui,'Segoe UI',sans-serif;color:" + tema.texto + ";background:" + tema.bg + ";" +
      "border:1px solid " + tema.borda + ";border-radius:10px;box-shadow:0 8px 26px rgba(0,0,0,.28);padding:8px}" +
      "#atelier-caixa textarea{display:block;width:100%;box-sizing:border-box;resize:none;min-height:54px;max-height:200px;" +
      "font:inherit;color:inherit;background:transparent;border:1px solid " + tema.borda + ";border-radius:7px;padding:6px 8px;outline:none}" +
      "#atelier-caixa textarea:focus{border-color:" + tema.acento + "}" +
      "#atelier-caixa .rodape{display:flex;align-items:center;gap:6px;margin-top:6px;font-size:11px;color:" + tema.texto3 + "}" +
      "#atelier-caixa button{margin-left:auto;font:600 12px system-ui,'Segoe UI',sans-serif;padding:4px 12px;border-radius:7px;" +
      "border:0;background:" + tema.acento + ";color:#fff;cursor:pointer}" +
      "#atelier-caixa button:disabled{opacity:.45;cursor:default}" +
      "#atelier-dica{pointer-events:none}" +
      "#atelier-dica.preso{pointer-events:auto}" +
      "#atelier-dica .txt{white-space:pre-wrap;word-break:break-word}" +
      "#atelier-dica .meta{font-size:11px;color:" + tema.texto3 + ";margin-bottom:3px}" +
      "#atelier-dica .resp{margin-top:6px;padding:4px 7px;border-radius:6px;background:rgba(120,140,200,.14);font-size:12px;white-space:pre-wrap}" +
      "#atelier-dica .ok{color:#3c9a4c;font-weight:600}" +
      "#atelier-dica + #atelier-dica{margin-top:6px}";
  }
  pintar();
  (document.head || document.documentElement).appendChild(estilo);

  // a caixinha de comentar (aparece ao selecionar)
  var caixa = document.createElement("div");
  caixa.id = "atelier-caixa";
  caixa.className = "atelier-flutua";
  caixa.style.display = "none";
  var campo = document.createElement("textarea");
  campo.placeholder = "Comentar este trecho…";
  campo.rows = 2;
  var rodape = document.createElement("div");
  rodape.className = "rodape";
  rodape.appendChild(document.createTextNode("Enter salva · Shift+Enter quebra linha · Esc cancela"));
  var botao = document.createElement("button");
  botao.type = "button";
  botao.textContent = "Comentar";
  botao.disabled = true;
  rodape.appendChild(botao);
  caixa.appendChild(campo);
  caixa.appendChild(rodape);

  // a dica do grifo (passar o mouse mostra; clicar prende até clicar fora)
  var dica = document.createElement("div");
  dica.id = "atelier-dica";
  dica.className = "atelier-flutua";
  dica.style.display = "none";
  var dicaPresa = null;

  var pendente = null;

  function pronto(f) {
    if (document.body) f();
    else document.addEventListener("DOMContentLoaded", f);
  }

  function nosso(n) {
    var e = n && (n.nodeType === 1 ? n : n.parentNode);
    return !!(e && e.closest && e.closest(".atelier-flutua"));
  }

  // os textos da página em ordem, com a posição de cada um no texto inteiro
  function textos() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var t = p.nodeName;
        if (t === "SCRIPT" || t === "STYLE" || t === "NOSCRIPT" || t === "TEXTAREA") return NodeFilter.FILTER_REJECT;
        if (nosso(n)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var l = [], i = 0, n, partes = [];
    while ((n = w.nextNode())) {
      l.push({ n: n, i: i });
      partes.push(n.nodeValue);
      i += n.nodeValue.length;
    }
    return { l: l, texto: partes.join("") };
  }

  // a posição no texto inteiro de um ponto (nó, deslocamento) da seleção
  function posicao(T, no, off) {
    if (no.nodeType === 3) {
      for (var k = 0; k < T.l.length; k++) if (T.l[k].n === no) return T.l[k].i + off;
    }
    var r = document.createRange();
    r.setStart(no, off);
    r.collapse(true);
    for (var j = 0; j < T.l.length; j++) {
      if (r.comparePoint(T.l[j].n, 0) >= 0) return T.l[j].i;
    }
    return T.texto.length;
  }

  // põe a caixa flutuante perto de um retângulo (embaixo; sem espaço, em cima)
  function posicionar(el, ret) {
    el.style.display = "block";
    var larg = document.documentElement.clientWidth, alt = window.innerHeight;
    var x = Math.min(ret.left, larg - el.offsetWidth - 8);
    var y = ret.bottom + 6;
    if (y + el.offsetHeight > alt - 4 && ret.top - el.offsetHeight - 6 > 4) y = ret.top - el.offsetHeight - 6;
    el.style.left = Math.max(4, x) + window.scrollX + "px";
    el.style.top = y + window.scrollY + "px";
  }

  function tirarPendente() {
    var ms = document.querySelectorAll("mark.atelier-c.pendente");
    for (var i = 0; i < ms.length; i++) desembrulhar(ms[i]);
  }

  function fecharCaixa() {
    caixa.style.display = "none";
    campo.value = "";
    botao.disabled = true;
    pendente = null;
    tirarPendente();
  }

  function aoSoltar(e) {
    if (e && nosso(e.target)) return;
    setTimeout(function () {
      var s = window.getSelection();
      if (!s || s.isCollapsed || !s.rangeCount) return;
      var r = s.getRangeAt(0);
      if (nosso(r.commonAncestorContainer)) return;
      var T = textos();
      var a = posicao(T, r.startContainer, r.startOffset);
      var b = posicao(T, r.endContainer, r.endOffset);
      var trecho = T.texto.slice(a, b);
      if (!trecho.trim()) return;
      // já escrevendo outro (a moldura não tem confirm): fica com o que estava, sem perder o texto
      if (pendente && campo.value.trim()) { campo.focus(); return; }
      tirarPendente();
      fecharDica();
      pendente = {
        atelier: "comentar",
        trecho: trecho,
        antes: T.texto.slice(Math.max(0, a - CTX), a),
        depois: T.texto.slice(b, b + CTX),
      };
      var ret = r.getBoundingClientRect();
      // a seleção some ao focar a caixa: o trecho fica marcado de azul enquanto você escreve
      s.removeAllRanges();
      grifar({ id: "novo", trecho: trecho, antes: pendente.antes, depois: pendente.depois }, "pendente");
      campo.value = "";
      botao.disabled = true;
      posicionar(caixa, ret);
      campo.focus();
    }, 0);
  }

  function enviar() {
    var t = campo.value.trim();
    if (!pendente || !t) return;
    pendente.comentario = t;
    P.postMessage(pendente, "*");
    // o grifo de verdade chega com a lista nova; o azul fica até lá
    caixa.style.display = "none";
    campo.value = "";
    pendente = null;
  }

  // o grifo: acha o trecho (o que tem o texto em volta mais parecido) e embrulha em <mark>
  function grifar(c, classe) {
    if (!c.trecho) return;
    var T = textos();
    var melhor = -1, nota = -1, i = T.texto.indexOf(c.trecho);
    while (i >= 0) {
      var n = 0, a = c.antes || "", d = c.depois || "";
      for (var k = 1; k <= a.length && T.texto[i - k] === a[a.length - k]; k++) n++;
      for (var m = 0; m < d.length && T.texto[i + c.trecho.length + m] === d[m]; m++) n++;
      if (n > nota) { nota = n; melhor = i; }
      i = T.texto.indexOf(c.trecho, i + 1);
    }
    if (melhor < 0) return;
    var ini = melhor, fim = melhor + c.trecho.length;
    for (var j = 0; j < T.l.length; j++) {
      var e = T.l[j], tam = e.n.nodeValue.length;
      if (e.i + tam <= ini || e.i >= fim) continue;
      var s = Math.max(ini, e.i) - e.i, f = Math.min(fim, e.i + tam) - e.i;
      if (s >= f || !e.n.nodeValue.slice(s, f).trim()) continue;
      var meio = e.n;
      if (f < tam) meio.splitText(f);
      if (s > 0) meio = meio.splitText(s);
      var mk = document.createElement("mark");
      mk.className = "atelier-c" + (classe ? " " + classe : "");
      mk.dataset.c = String(c.id);
      meio.parentNode.insertBefore(mk, meio);
      mk.appendChild(meio);
    }
  }

  function desembrulhar(mk) {
    var pai = mk.parentNode;
    if (!pai) return;
    while (mk.firstChild) pai.insertBefore(mk.firstChild, mk);
    pai.removeChild(mk);
    pai.normalize();
  }

  function limpar() {
    var ms = document.querySelectorAll("mark.atelier-c");
    for (var i = 0; i < ms.length; i++) desembrulhar(ms[i]);
  }

  function marcasDe(id) {
    return document.querySelectorAll('mark.atelier-c[data-c="' + String(id).replace(/"/g, "") + '"]');
  }

  // os comentários de um grifo (marcas aninhadas: o de dentro e os de fora)
  function idsDoGrifo(mk) {
    var ids = [], e = mk;
    while (e && e.closest) {
      var m = e.closest("mark.atelier-c");
      if (!m) break;
      if (ids.indexOf(m.dataset.c) < 0 && porId[m.dataset.c]) ids.push(m.dataset.c);
      e = m.parentNode;
    }
    return ids;
  }

  function mostrarDica(mk, presa) {
    var ids = idsDoGrifo(mk);
    if (!ids.length) return;
    dica.textContent = "";
    for (var i = 0; i < ids.length; i++) {
      var c = porId[ids[i]];
      var bloco = document.createElement("div");
      if (i > 0) bloco.style.cssText = "margin-top:8px;padding-top:8px;border-top:1px solid " + tema.borda;
      var meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = (c.autor || "você") + (c.resolvido ? " · " : "");
      if (c.resolvido) {
        var ok = document.createElement("span");
        ok.className = "ok";
        ok.textContent = "✓ resolvido";
        meta.appendChild(ok);
      }
      var txt = document.createElement("div");
      txt.className = "txt";
      txt.textContent = c.comentario || "";
      bloco.appendChild(meta);
      bloco.appendChild(txt);
      var r = c.resolvido_resposta || c.resposta;
      if (r) {
        var resp = document.createElement("div");
        resp.className = "resp";
        resp.textContent = r;
        bloco.appendChild(resp);
      }
      dica.appendChild(bloco);
    }
    dica.className = "atelier-flutua" + (presa ? " preso" : "");
    dicaPresa = presa ? mk.dataset.c : null;
    posicionar(dica, mk.getBoundingClientRect());
  }

  function fecharDica() {
    dica.style.display = "none";
    dicaPresa = null;
  }

  function ativar(id) {
    var at = document.querySelectorAll("mark.atelier-c.ativo");
    for (var i = 0; i < at.length; i++) at[i].classList.remove("ativo");
    var ms = marcasDe(id);
    for (var k = 0; k < ms.length; k++) ms[k].classList.add("ativo");
    return ms;
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== P) return;
    var d = ev.data;
    if (!d || typeof d !== "object") return;
    if (d.atelier === "grifos" && Array.isArray(d.lista)) {
      if (d.tema) {
        for (var t in d.tema) if (d.tema[t]) tema[t] = d.tema[t];
        pintar();
      }
      pronto(function () {
        var ativo = document.querySelector("mark.atelier-c.ativo");
        ativo = ativo && ativo.dataset.c;
        limpar();
        porId = {};
        for (var i = 0; i < d.lista.length; i++) {
          var c = d.lista[i];
          porId[String(c.id)] = c;
          grifar(c, c.resolvido ? "resolvido" : "");
        }
        if (pendente) grifar({ id: "novo", trecho: pendente.trecho, antes: pendente.antes, depois: pendente.depois }, "pendente");
        if (ativo) ativar(ativo);
        if (dicaPresa && !porId[dicaPresa]) fecharDica();
      });
    } else if (d.atelier === "ir") {
      var ms = ativar(d.id);
      if (!ms.length) return;
      ms[0].scrollIntoView({ block: "center", behavior: "smooth" });
      setTimeout(function () { if (ms[0].isConnected) mostrarDica(ms[0], true); }, 380);
    }
  });

  pronto(function () {
    document.body.appendChild(caixa);
    document.body.appendChild(dica);
    document.addEventListener("mouseup", aoSoltar);
    document.addEventListener("keyup", function (e) { if (!nosso(e.target) && (e.shiftKey || e.key === "Shift")) aoSoltar(e); });
    campo.addEventListener("input", function () {
      botao.disabled = !campo.value.trim();
      campo.style.height = "auto";
      campo.style.height = Math.min(200, Math.max(54, campo.scrollHeight + 2)) + "px";
    });
    campo.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
      else if (e.key === "Escape") { e.preventDefault(); fecharCaixa(); }
      e.stopPropagation();
    });
    botao.addEventListener("click", function (e) { e.preventDefault(); enviar(); });
    // clicar fora fecha a caixa (se não escreveu nada) e a dica presa
    document.addEventListener("mousedown", function (e) {
      if (nosso(e.target)) return;
      if (caixa.style.display !== "none" && !campo.value.trim()) fecharCaixa();
      if (dicaPresa) fecharDica();
    });
    document.addEventListener("click", function (e) {
      var t = e.target;
      var mk = t && t.closest ? t.closest("mark.atelier-c") : null;
      if (!mk || mk.classList.contains("pendente")) return;
      var sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;
      ativar(mk.dataset.c);
      mostrarDica(mk, true);
      P.postMessage({ atelier: "comentario-clicado", id: Number(mk.dataset.c) }, "*");
    });
    document.addEventListener("mouseover", function (e) {
      if (dicaPresa) return;
      var t = e.target;
      var mk = t && t.closest ? t.closest("mark.atelier-c") : null;
      if (mk && !mk.classList.contains("pendente")) mostrarDica(mk, false);
    });
    document.addEventListener("mouseout", function (e) {
      if (dicaPresa) return;
      var t = e.target, para = e.relatedTarget;
      var de = t && t.closest ? t.closest("mark.atelier-c") : null;
      if (de && !(para && para.closest && para.closest("mark.atelier-c"))) fecharDica();
    });
    window.addEventListener("scroll", function () { if (!dicaPresa) fecharDica(); }, true);
    // pede os grifos (a tela manda quando a moldura carrega; isto cobre quem carregou depois)
    P.postMessage({ atelier: "comentar-pronto" }, "*");
  });
})();
