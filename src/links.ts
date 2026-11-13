// Links atelier://: o "endereço" de qualquer coisa do atelier, para colar no Teams, numa nota ou na busca.
//   atelier://doc/<código>                 um documento (o código é único no atelier inteiro, em qualquer bancada)
//   atelier://doc/<código>/<caminho>       um arquivo dentro da pasta do documento
//   atelier://visao/<nome>                 uma visão da bancada aberta
//   atelier://bancada/<nome>               uma bancada (abre a janela dela)
// `?bancada=<nome>` no fim é opcional: desempata e diz onde procurar primeiro.
import { avisar, falhou } from "./ui";

export const RE_LINK = /^atelier:\/\/\S+$/i;
export const RE_CODIGO_SOLTO = /^#?([0-9a-f]{7})$/i;

export const linkDoc = (codigo: string) => `atelier://doc/${codigo.toLowerCase()}`;
export const linkVisao = (nome: string) => `atelier://visao/${encodeURIComponent(nome)}`;

/** O link de um arquivo que mora na pasta de um documento (`.../itens/<código>-<título>/...`), ou null. */
export function linkDoArquivo(caminho: string): string | null {
  const m = caminho.match(/[\\/]itens[\\/]([0-9a-f]{7})-[^\\/]*[\\/](.+)$/i);
  return m ? `${linkDoc(m[1])}/${m[2].split(/[\\/]/).map(encodeURIComponent).join("/")}` : null;
}

export function copiarLink(url: string) {
  navigator.clipboard.writeText(url).then(() => avisar(`Link copiado: ${url}`)).catch(falhou);
}

/** Segue um link. No app, pelo núcleo: ele acha a bancada do documento e abre a janela dela se for outra. No
 *  navegador de teste (sem o núcleo do app), a própria tela abre. */
export async function seguirLink(url: string) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("seguir_link", { url: url.trim() });
  } catch {
    window.dispatchEvent(new CustomEvent("atelier:link-local", { detail: url.trim() }));
  }
}

/** Separa um link de documento: o código, o caminho de arquivo (se houver) e a bancada pedida (se houver). */
export function partesDoLink(url: string): { tipo: string; valor: string; codigo?: string; caminho?: string; bancada?: string } {
  const [semQuery, query = ""] = url.trim().replace(/^atelier:\/\//i, "").split("?");
  const [tipo, ...resto] = semQuery.replace(/\/+$/, "").split("/");
  const bancada = new URLSearchParams(query).get("bancada") ?? undefined;
  const dec = (s: string) => { try { return decodeURIComponent(s); } catch { return s; } };
  if (tipo === "doc" || tipo === "item") {
    const [codigo, ...cam] = resto;
    return { tipo: "doc", valor: codigo ?? "", codigo: (codigo ?? "").replace(/^#/, "").toLowerCase(), caminho: cam.length ? cam.map(dec).join("/") : undefined, bancada };
  }
  return { tipo, valor: dec(resto.join("/")), bancada };
}
