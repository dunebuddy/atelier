const path = require("path");
const { Unicode11Addon } = require(path.resolve("node_modules/@xterm/addon-unicode11"));
let p; new Unicode11Addon().activate({ unicode: { register: (x) => { p = x; } } });
const t = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8").replace(/^\uFEFF/, ""));
// regra: largura 0 do Unicode 11 vira 1; o resto, Unicode 11; exceções medidas
const regra = (cp) => { const w = p.wcwidth(cp); return w === 0 ? 1 : w; };
const cps = Object.keys(t.um).map(Number).sort((a, b) => a - b);
const exc = []; let cur = null;
for (const cp of cps) {
  const m = t.um[cp]; if (m === regra(cp)) continue;
  if (cur && cp === cur[1] + 1 && m === cur[2]) cur[1] = cp; else { cur = [cp, cp, m]; exc.push(cur); }
}
console.log(JSON.stringify(exc));
// confere +FE0F = sozinho + 1 e +FE0E = sozinho + 1
let f16 = 0, f15 = 0; for (const k in t.vs16) if (+k >= 0x80 && t.vs16[k] !== t.um[k] + 1) f16++; for (const k in t.vs15) if (t.vs15[k] !== t.um[k] + 1) f15++;
console.error("exceções:", exc.length, "| FE0F fora de sozinho+1:", f16, "| FE0E fora:", f15);
