// Comparador do terminal: colar no console da tela de teste (bun run teste → http://localhost:1430).
// Abre um terminal no servidor de teste, roda cena.py, desenha a saída num xterm (como o app) e compara as linhas
// com a saída crua do programa desenhada num xterm de referência. Uso:
//   await cena("g", 60, 1)            // tabela, colunas, semente (modo "tudo")
//   await cena("g", 100, 1, "tui")    // app de tela: pula para a coluna que ele calculou
//   bateria(["11", "g"], [40, 60, 100], [1, 2, 3, 4], "x"); depois window.__res.x
// Para testar o ConPTY novo: conpty.dll + OpenConsole.exe ao lado de target\debug\examples\servidor.exe.
const CENA = "C:\\projetos\\atelier\\scripts\\terminal\\cena.py";
const { Terminal } = (await import("/node_modules/.vite/deps/@xterm_xterm.js")).default;
const { Unicode11Addon } = (await import("/node_modules/.vite/deps/@xterm_addon-unicode11.js")).default;
let u11; new Unicode11Addon().activate({ unicode: { register: (p) => { u11 = p; } } });
const PV = (st, w, j) => ((st & 0xffffff) << 3) | ((w & 3) << 1) | (j ? 1 : 0);
const W = (v) => (v >> 1) & 3, ST = (v) => v >> 3;
// "cada codepoint": a conta do ConPTY do Windows 11 (26200); exceções medidas com tabela.ps1
const EXC = [[12330,12333,2],[12441,12442,2],[12731,12735,2],[127462,127487,2],[128726,128727,2],[128732,128735,2],[128763,128764,2],[129008,129008,2],[129292,129292,2],[129339,129339,1],[129350,129350,1],[129394,129394,2],[129399,129401,2],[129443,129444,2],[129451,129453,2],[129483,129484,2],[129652,129655,2],[129659,129660,2],[129667,129672,2],[129686,129725,2],[129727,129733,2],[129742,129755,2],[129760,129768,2],[129776,129784,2]];
const wCp = (cp) => { for (const [a, b, l] of EXC) if (cp >= a && cp <= b) return l; const x = u11.wcwidth(cp); return x === 0 ? 1 : x; };
const PROV = {
  conpty: { version: "conpty", wcwidth: wCp, charProperties: (cp) => wCp(cp) << 1 },
  // graphemes (aproximação): FE0F alarga para 2; ZWJ, tom de pele, par de bandeira e keycap juntam
  g: { version: "g", wcwidth: (cp) => (cp >= 0x1f1e6 && cp <= 0x1f1ff ? 1 : u11.wcwidth(cp)),
    charProperties: (cp, prev) => {
      const pw = W(prev), pst = ST(prev), tem = prev !== 0 && pw > 0;
      if (cp === 0xfe0f && tem) return PV(0, 2, true);
      if (cp === 0xfe0e && tem) return PV(0, pw, true);
      if (cp === 0x200d && tem) return PV(1, pw, true);
      if (pst === 1 && tem) return PV(0, 2, true);
      if (cp >= 0x1f3fb && cp <= 0x1f3ff && tem) return PV(0, 2, true);
      if (cp >= 0x1f1e6 && cp <= 0x1f1ff) return pst === 2 ? PV(0, 2, true) : PV(2, 1, false);
      if (cp === 0x20e3 && tem) return PV(0, 2, true);
      const w = u11.wcwidth(cp);
      return w === 0 && tem ? PV(0, pw, true) : PV(0, w, false);
    } },
};
window.novoTerm = (prov, cols, rows) => {
  const t = new Terminal({ cols, rows, allowProposedApi: true, scrollback: 5000, windowsPty: { backend: "conpty", buildNumber: 22000 } });
  t.loadAddon(new Unicode11Addon());
  for (const p of Object.values(PROV)) t.unicode.register(p);
  t.unicode.activeVersion = prov;
  return t;
};
const logicas = (t) => { const b = t.buffer.active, out = []; for (let y = 0; y < b.length; y++) { const l = b.getLine(y); const s = l.translateToString(true); if (l.isWrapped && out.length) out[out.length - 1] += s; else out.push(s); } return out.map((s) => s.replace(/\s+$/, "")); };
const wr = (t, d) => new Promise((r) => t.write(d, r));
window.cena = (prov, cols, semente, modo = "tudo") => new Promise((ok) => {
  const t = novoTerm(prov, cols, 30);
  const ws = new WebSocket(`ws://127.0.0.1:7488/api/terminal?cols=${cols}&rows=30`);
  ws.binaryType = "arraybuffer";
  let out = "", resp = false, fase = 0, tela = null; const dec = new TextDecoder();
  const enviar = (d) => ws.send(JSON.stringify({ t: "i", d }));
  ws.onmessage = async (e) => {
    const s = typeof e.data === "string" ? e.data : dec.decode(e.data, { stream: true });
    out += s;
    // o ConPTY pergunta a posição do cursor ao abrir
    if (!resp && out.includes("\x1b[6n")) { resp = true; enviar("\x1b[1;1R"); setTimeout(() => enviar(`cls; python '${CENA}' ${semente} ${modo}\r`), 2500); }
    await wr(t, s);
    if (out.includes("##PRONTO##") && tela === null) { tela = 0; setTimeout(() => { tela = logicas(t); fase = 1; }, 700); }
    const m = fase === 1 ? logicas(t).join("").match(/##CRU##([A-Za-z0-9+/=]*)##FIMCRU##/) : null;
    if (m) {
      fase = 2; ws.close();
      const cru = new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
      const ref = novoTerm(prov, cols, 30); ref.options.convertEol = true; await wr(ref, cru);
      const esperado = logicas(ref).filter(Boolean);
      const i = tela.findIndex((l) => l.includes("##PRONTO##"));
      const visto = tela.slice(0, i).filter(Boolean).slice(-esperado.length);
      let erradas = 0; const exemplos = [];
      for (let k = 0; k < esperado.length; k++) if (esperado[k] !== visto[k]) { erradas++; if (exemplos.length < 3) exemplos.push({ esp: esperado[k], viu: visto[k] }); }
      ok({ prov, cols, semente, modo, linhas: esperado.length, erradas, exemplos });
    }
  };
  setTimeout(() => { try { ws.close(); } catch { /* já foi */ } ok({ prov, cols, semente, erro: "timeout" }); }, 40000);
});
window.bateria = async (provs, colss, sementes, tag, modo = "tudo") => {
  const res = []; window.__res = window.__res || {}; window.__res[tag] = res;
  for (const s of sementes) for (const c of colss) for (const p of provs) { const r = await cena(p, c, s, modo); res.push({ p, c, s, linhas: r.linhas, erradas: r.erradas ?? "ERRO " + r.erro, ex: r.exemplos?.[0] }); }
  res.fim = true;
};
