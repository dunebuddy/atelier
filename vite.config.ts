import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
// O ditado (src/ditado.worker.ts) busca o ONNX Runtime em WASM na CDN, com versão fixa: as cópias que as bibliotecas
// de voz arrastam para a build (~78 MB, três variantes) nunca seriam usadas e só engordariam o executável.
const semWasmDoOnnx = {
  name: "sem-wasm-do-onnx",
  generateBundle(_: unknown, bundle: Record<string, unknown>) {
    for (const nome of Object.keys(bundle)) if (/ort-wasm.*\.wasm$/.test(nome)) delete bundle[nome];
  },
};

export default defineConfig(() => ({
  plugins: [react(), semWasmDoOnnx],
  // versão do app, para a tela de Configurações (a mesma do package.json, do tauri.conf e da tag)
  define: { __VERSAO__: JSON.stringify(process.env.npm_package_version ?? "dev") },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    // o teste sem janela (`bun run teste`) usa outra porta, para rodar ao lado do app aberto
    port: Number(process.env.ATELIER_VITE_PORTA ?? 1420),
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
