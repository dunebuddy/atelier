const path = require("path");
const { Unicode11Addon } = require(path.resolve("node_modules/@xterm/addon-unicode11"));
let p; new Unicode11Addon().activate({ unicode: { register: (x) => { p = x; } } });
const t = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8").replace(/^\uFEFF/, ""));
const hex = (n) => (+n).toString(16).toUpperCase();
// diferenças de 1 codepoint, agrupadas em faixas
function faixas(mapa, larg) {
  const dif = Object.keys(mapa).map(Number).sort((a, b) => a - b).filter((cp) => mapa[cp] !== larg(cp));
  const out = []; let ini = null, ant = null, chave = null;
  for (const cp of dif) {
    const k = `${larg(cp)}->${mapa[cp]}`;
    if (ini !== null && cp === ant + 1 && k === chave) { ant = cp; continue; }
    if (ini !== null) out.push(`${hex(ini)}${ant !== ini ? "-" + hex(ant) : ""} ${chave}`);
    ini = ant = cp; chave = k;
  }
  if (ini !== null) out.push(`${hex(ini)}${ant !== ini ? "-" + hex(ant) : ""} ${chave}`);
  return { n: dif.length, out };
}
const um = faixas(t.um, (cp) => p.wcwidth(cp));
console.log("SOZINHO: diferenças", um.n); console.log(um.out.join("\n"));
// com FE0F: ConPTY vs (largura do xterm unicode11 da base, que ignora FE0F)
const v = faixas(t.vs16, (cp) => (cp < 0x80 ? 1 : p.wcwidth(cp)));
console.log("\n+FE0F: diferenças vs xterm11", v.n); console.log(v.out.slice(0, 80).join("\n"));
// regra: FE0F => 2 se a base tem Emoji (ConPTY dá 2 com FE0F), senão igual ao sozinho
const vs2 = Object.entries(t.vs16).filter(([cp, w]) => w !== 2 && w !== t.um[cp]);
console.log("\n+FE0F nem 2 nem igual ao sozinho:", vs2.length, vs2.slice(0, 20).map(([c, w]) => hex(c) + "=" + w + "(só " + t.um[c] + ")").join(" "));
const vs16dois = Object.entries(t.vs16).filter(([cp, w]) => w === 2 && t.um[cp] === 1).map(([c]) => +c);
console.log("FE0F alarga 1->2:", vs16dois.length);
const vs15 = Object.entries(t.vs15).filter(([cp, w]) => w !== t.um[cp]);
console.log("+FE0E muda:", vs15.length, vs15.slice(0, 20).map(([c, w]) => hex(c) + "=" + w + "(só " + t.um[c] + ")").join(" "));
console.log("extra", JSON.stringify(t.extra));
require("fs").writeFileSync(process.argv[3], JSON.stringify(vs16dois));
