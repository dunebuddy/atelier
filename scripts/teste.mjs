// Teste sem janela, ao lado do atelier aberto: sobe só a API (porta 7488, dados de teste) e a tela no Vite (porta
// 1430), para abrir no navegador interno. O app instalado do Paulo continua aberto e intocado.
//   bun run teste            dados em <temp>/atelier-teste
//   bun run teste <pasta>    dados na pasta dada (ATELIER_HOME)
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const API = 7488;
const TELA = 1430;
const home = process.argv[2] ?? path.join(os.tmpdir(), "atelier-teste");
const env = {
  ...process.env,
  ATELIER_HOME: home,
  ATELIER_PORTA: String(API),
  ATELIER_ORIGEM: `http://localhost:${TELA}`,
  ATELIER_VITE_PORTA: String(TELA),
  VITE_ATELIER_API: `http://127.0.0.1:${API}/api`,
};
const filhos = [
  spawn("cargo", ["run", "-q", "-p", "atelier-core", "--example", "servidor"], { env, stdio: "inherit", shell: true }),
  spawn("bun", ["x", "vite"], { env, stdio: "inherit", shell: true }),
];
console.log(`teste sem janela: tela em http://localhost:${TELA}, API em ${API}, dados em ${home}`);
// no Windows o kill não derruba os netos (cargo → servidor, bun → vite): taskkill na árvore inteira
const fim = () => {
  for (const f of filhos) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(f.pid), "/T", "/F"], { stdio: "ignore" });
    else f.kill();
  }
  setTimeout(() => process.exit(0), 300);
};
process.on("SIGINT", fim);
process.on("SIGTERM", fim);
