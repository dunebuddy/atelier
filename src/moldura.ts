import { verImagem } from "./components/VerImagem";

// Leitores em moldura (iframe isolado: Markdown, Word): o foco de teclado vai para dentro dela, e as teclas não chegam
// ao app (F11, Ctrl+P, Ctrl+W...); o clique também não, e o painel não sabia que a janela ganhou o foco.
// A moldura ganha um script mínimo, o único que roda nela (CSP com nonce: o resto do documento segue sem script), que
// repassa ao app as teclas de atalho e o clique; o app as recebe como se fossem dele, no próprio <iframe>.

/** Vai no <head> da moldura: a política (só o nosso script roda) e o repasse. Precisa de `sandbox="allow-scripts"`
 *  sem `allow-same-origin` (assim a moldura não alcança o app). */
// um por sessão do app (o mesmo em todo desenho: senão o srcDoc muda e a moldura recarrega a cada tecla)
const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");

export function repasseDaMoldura(): string {
  const js = `(function(){var p=parent;
addEventListener("keydown",function(e){var f=/^F\\d+$/.test(e.key);
if(!(e.ctrlKey||e.altKey||e.metaKey||f||e.key==="Escape"))return;
if((e.ctrlKey||e.metaKey)&&!e.altKey&&!e.shiftKey&&/^[ac]$/i.test(e.key))return;
if(f||e.ctrlKey||e.metaKey)e.preventDefault();
p.postMessage({atelier:"tecla",key:e.key,code:e.code,ctrlKey:e.ctrlKey,altKey:e.altKey,shiftKey:e.shiftKey,metaKey:e.metaKey},"*")},true);
addEventListener("mousedown",function(){p.postMessage({atelier:"clique"},"*")},true);
addEventListener("click",function(e){var t=e.target;if(!t||t.tagName!=="IMG")return;e.preventDefault();
var l=Array.prototype.map.call(document.images,function(x){return x.src});p.postMessage({atelier:"imagem",lista:l,i:l.indexOf(t.src)},"*")},true);})();`;
  return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src * data: blob:; media-src * data: blob:; style-src 'unsafe-inline' *; font-src * data:; script-src 'nonce-${nonce}'"><script nonce="${nonce}">${js}</script>`;
}

window.addEventListener("message", (ev) => {
  const d = ev.data as { atelier?: string; lista?: string[]; i?: number; key?: string; code?: string; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean } | null;
  if (!d || typeof d !== "object" || !d.atelier) return;
  const moldura = Array.from(document.querySelectorAll("iframe")).find((f) => f.contentWindow === ev.source);
  if (!moldura) return;
  if (d.atelier === "clique") moldura.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  // clique numa imagem do leitor: o visualizador em tela cheia (só endereços que a tela já mostraria)
  else if (d.atelier === "imagem" && Array.isArray(d.lista)) {
    const lista = d.lista.filter((s) => typeof s === "string" && /^(https?:|data:image\/|blob:)/i.test(s)).map((src) => ({ src }));
    verImagem(lista, Math.max(0, d.i ?? 0));
  }
  else if (d.atelier === "tecla") {
    moldura.dispatchEvent(new KeyboardEvent("keydown", {
      key: d.key, code: d.code, ctrlKey: d.ctrlKey, altKey: d.altKey, shiftKey: d.shiftKey, metaKey: d.metaKey, bubbles: true, cancelable: true,
    }));
  }
});
