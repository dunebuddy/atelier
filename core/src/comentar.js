// Comentar dentro do que o atelier mostra (markdown, texto, HTML). Roda isolado na moldura (sem acesso ao atelier) e
// fala com a tela por postMessage:
//   → { atelier: "comentar", trecho, antes, depois }   selecionou e clicou em "Comentar"
//   → { atelier: "comentario-clicado", id }             clicou num grifo
//   ← { atelier: "grifos", lista: [{ id, trecho, antes, depois, resolvido }] }   grifa os trechos comentados
//   ← { atelier: "ir", id }                             rola até o grifo e pisca
(function () {
  if (window.__atelierComentar) return;
  window.__atelierComentar = 1;
  var P = window.parent;
  var CTX = 40;

  var estilo = document.createElement("style");
  estilo.textContent =
    "mark.atelier-c{background:rgba(250,200,60,.38);color:inherit;border-radius:2px;cursor:pointer;padding:0}" +
    "mark.atelier-c.resolvido{background:transparent;border-bottom:2px dotted rgba(120,180,120,.8)}" +
    "mark.atelier-c.piscar{outline:2px solid rgba(250,170,40,.95);outline-offset:1px}" +
    "#atelier-comentar{position:absolute;z-index:2147483647;display:none;font:600 12.5px system-ui,'Segoe UI',sans-serif;" +
    "padding:5px 10px;border-radius:8px;border:1px solid rgba(0,0,0,.25);background:#b8572f;color:#fff;cursor:pointer;" +
    "box-shadow:0 4px 14px rgba(0,0,0,.3)}";
  (document.head || document.documentElement).appendChild(estilo);

  var botao = document.createElement("button");
  botao.id = "atelier-comentar";
  botao.type = "button";
  botao.textContent = "💬 Comentar";
  var pendente = null;

  function pronto(f) {
    if (document.body) f();
    else document.addEventListener("DOMContentLoaded", f);
  }

  // os textos da página em ordem, com a posição de cada um no texto inteiro
  function textos() {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var t = p.nodeName;
        if (t === "SCRIPT" || t === "STYLE" || t === "NOSCRIPT" || t === "TEXTAREA") return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest("#atelier-comentar")) return NodeFilter.FILTER_REJECT;
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

  function esconder() {
    botao.style.display = "none";
    pendente = null;
  }

  function aoSoltar() {
    setTimeout(function () {
      var s = window.getSelection();
      if (!s || s.isCollapsed || !s.rangeCount) return esconder();
      var r = s.getRangeAt(0);
      if (botao.contains(r.commonAncestorContainer)) return;
      var T = textos();
      var a = posicao(T, r.startContainer, r.startOffset);
      var b = posicao(T, r.endContainer, r.endOffset);
      var trecho = T.texto.slice(a, b);
      if (!trecho.trim()) return esconder();
      pendente = {
        atelier: "comentar",
        trecho: trecho,
        antes: T.texto.slice(Math.max(0, a - CTX), a),
        depois: T.texto.slice(b, b + CTX),
      };
      var ret = r.getBoundingClientRect();
      botao.style.display = "block";
      var x = Math.min(ret.right + window.scrollX - 10, window.scrollX + document.documentElement.clientWidth - botao.offsetWidth - 8);
      botao.style.left = Math.max(window.scrollX + 4, x) + "px";
      botao.style.top = ret.bottom + window.scrollY + 6 + "px";
    }, 0);
  }

  // o grifo: acha o trecho (o que tem o texto em volta mais parecido) e embrulha em <mark>
  function grifar(c) {
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
      mk.className = "atelier-c" + (c.resolvido ? " resolvido" : "");
      mk.dataset.c = String(c.id);
      meio.parentNode.insertBefore(mk, meio);
      mk.appendChild(meio);
    }
  }

  function limpar() {
    var ms = document.querySelectorAll("mark.atelier-c");
    for (var i = 0; i < ms.length; i++) {
      var mk = ms[i], pai = mk.parentNode;
      while (mk.firstChild) pai.insertBefore(mk.firstChild, mk);
      pai.removeChild(mk);
      pai.normalize();
    }
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== P) return;
    var d = ev.data;
    if (!d || typeof d !== "object") return;
    if (d.atelier === "grifos" && Array.isArray(d.lista)) {
      pronto(function () {
        limpar();
        for (var i = 0; i < d.lista.length; i++) grifar(d.lista[i]);
      });
    } else if (d.atelier === "ir") {
      var mk = document.querySelector('mark.atelier-c[data-c="' + String(d.id).replace(/"/g, "") + '"]');
      if (!mk) return;
      mk.scrollIntoView({ block: "center", behavior: "smooth" });
      var todos = document.querySelectorAll('mark.atelier-c[data-c="' + mk.dataset.c + '"]');
      for (var k = 0; k < todos.length; k++) todos[k].classList.add("piscar");
      setTimeout(function () { for (var k = 0; k < todos.length; k++) todos[k].classList.remove("piscar"); }, 1400);
    }
  });

  pronto(function () {
    document.body.appendChild(botao);
    document.addEventListener("mouseup", aoSoltar);
    document.addEventListener("keyup", function (e) { if (e.shiftKey || e.key === "Shift") aoSoltar(); });
    // clicar no botão não pode desfazer a seleção antes de mandar
    botao.addEventListener("mousedown", function (e) { e.preventDefault(); e.stopPropagation(); });
    botao.addEventListener("click", function (e) {
      e.preventDefault();
      if (pendente) P.postMessage(pendente, "*");
      esconder();
      var s = window.getSelection();
      if (s) s.removeAllRanges();
    });
    document.addEventListener("click", function (e) {
      var t = e.target;
      var mk = t && t.closest ? t.closest("mark.atelier-c") : null;
      if (mk) P.postMessage({ atelier: "comentario-clicado", id: Number(mk.dataset.c) }, "*");
    });
    // pede os grifos (a tela manda quando a moldura carrega; isto cobre quem carregou depois)
    P.postMessage({ atelier: "comentar-pronto" }, "*");
  });
})();
