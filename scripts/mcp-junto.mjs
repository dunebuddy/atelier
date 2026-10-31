// Compila o atelier-mcp e põe em src-tauri/binaries/ com o nome que o Tauri espera (atelier-mcp-<alvo>[.exe]).
// O Tauri copia esse arquivo para o lado do executável do app (no dev e no instalador), onde a tela de Integrações
// procura o servidor MCP. Uso: node scripts/mcp-junto.mjs [debug|release]
import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const perfil = process.argv[2] === "release" ? "release" : "debug";
execSync(`cargo build -p atelier-mcp${perfil === "release" ? " --release" : ""}`, { stdio: "inherit" });
const alvo = execSync("rustc -vV").toString().match(/host: (\S+)/)[1];
const ext = process.platform === "win32" ? ".exe" : "";
mkdirSync(join("src-tauri", "binaries"), { recursive: true });
copyFileSync(join("target", perfil, `atelier-mcp${ext}`), join("src-tauri", "binaries", `atelier-mcp-${alvo}${ext}`));
console.log(`atelier-mcp (${perfil}) pronto para ir junto do app`);
