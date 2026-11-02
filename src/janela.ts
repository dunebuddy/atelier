// A bancada desta janela. A janela principal segue a bancada ativa; as outras (abertas por "abrir em nova janela")
// nascem com `?bancada=<caminho codificado>` e mandam a bancada em todo pedido à API: cada janela é de uma bancada.

const params = new URLSearchParams(location.search);

/** O caminho codificado (como a API recebe no cabeçalho `x-atelier-bancada`), ou null na janela principal. */
export const BANCADA_DA_JANELA: string | null = params.get("bancada");

/** Documento para abrir quando a janela carregar (veio de um link atelier://doc/... de outra bancada). */
export const ABRIR_AO_CARREGAR: string | null = params.get("abrir");

/** O caminho de verdade (a codificação é a do núcleo: `%` + hexa dos bytes UTF-8). */
export function decodificarBancada(c: string): string {
  try {
    return decodeURIComponent(c);
  } catch {
    return c;
  }
}

export function codificarBancada(caminho: string): string {
  return [...new TextEncoder().encode(caminho)]
    .map((b) => (/[A-Za-z0-9\-_.:/\\]/.test(String.fromCharCode(b)) && b < 128 ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, "0")}`))
    .join("");
}

/** Mesmo caminho de bancada (o Windows não liga para maiúsculas nem para / ou \). */
export function mesmaBancada(a?: string | null, b?: string | null): boolean {
  const n = (x: string) => x.trim().replace(/[\\/]+$/, "").replace(/\//g, "\\").toLowerCase();
  return !!a && !!b && n(a) === n(b);
}

/** Abre a bancada numa janela nova (no app; no navegador de teste, uma aba). */
export async function abrirJanelaDaBancada(caminho: string, nome: string, abrir?: string) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("abrir_janela_bancada", { caminho, nome, abrir: abrir ?? null });
  } catch {
    const q = new URLSearchParams({ bancada: codificarBancada(caminho) });
    if (abrir) q.set("abrir", abrir);
    window.open(`${location.pathname}?${q}`, "_blank");
  }
}

// todo pedido à API desta janela leva a bancada dela (inclusive os fetch soltos dos componentes)
if (BANCADA_DA_JANELA) {
  const original = window.fetch.bind(window);
  window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (/\/api(\/|$|\?)/.test(url)) {
      const headers = new Headers(init?.headers ?? (entrada instanceof Request ? entrada.headers : undefined));
      headers.set("x-atelier-bancada", BANCADA_DA_JANELA!);
      return original(entrada, { ...init, headers });
    }
    return original(entrada, init);
  };
}

/** O pedaço de query com a bancada, para os websockets (que não levam cabeçalho). */
export function bancadaNaQuery(): string {
  return BANCADA_DA_JANELA ? `bancada=${encodeURIComponent(BANCADA_DA_JANELA)}` : "";
}
