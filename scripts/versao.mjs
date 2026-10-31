// Muda a versão do app em todos os lugares (package.json, tauri.conf.json e os Cargo.toml).
// Uso: node scripts/versao.mjs 0.2.0   → depois: commit, git tag v0.2.0, git push --tags (o CI gera a release)
import { readFileSync, writeFileSync } from "node:fs";

const nova = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(nova ?? "")) {
  console.error("uso: node scripts/versao.mjs 0.2.0");
  process.exit(1);
}
const trocar = (arquivo, de, para) => {
  const s = readFileSync(arquivo, "utf8");
  const n = s.replace(de, para);
  if (n === s) throw new Error(`não achei a versão em ${arquivo}`);
  writeFileSync(arquivo, n);
};
trocar("package.json", /"version": "[^"]+"/, `"version": "${nova}"`);
trocar("src-tauri/tauri.conf.json", /"version": "[^"]+"/, `"version": "${nova}"`);
for (const c of ["src-tauri/Cargo.toml", "core/Cargo.toml", "mcp/Cargo.toml"]) trocar(c, /^version = "[^"]+"/m, `version = "${nova}"`);
console.log(`versão ${nova}. Agora: commit, git tag v${nova} e git push --tags`);
