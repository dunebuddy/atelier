// Um site numa aba do atelier (o agente abre com `tela` abrir `url`; links do editor e do checklist também). O
// navegador do sistema só quando o Paulo pede, pelo botão. Site que proíbe ser mostrado dentro de outro (Google,
// bancos: X-Frame-Options) fica em branco: o aviso embaixo aponta o botão.
import { useState } from "react";
import { ExternalLink, RotateCw } from "lucide-react";

/** Abre no navegador do sistema (no app) ou numa aba nova (no navegador de teste). */
export function abrirNoNavegador(url: string) {
  import("@tauri-apps/plugin-opener").then((o) => o.openUrl(url)).catch(() => window.open(url, "_blank"));
}

/** Abre o endereço numa aba de site do atelier, ao lado da atual. */
export function abrirSite(url: string) {
  window.dispatchEvent(new CustomEvent("atelier:abrir", { detail: { rota: { v: "site", url }, nova: true } }));
}

export function Site({ url }: { url: string }) {
  const [versao, setVersao] = useState(0);
  return (
    <div className="site">
      <div className="site-barra">
        <button className="btn-icone" title="Recarregar" onClick={() => setVersao((v) => v + 1)}><RotateCw size={14} /></button>
        <span className="site-url" title={url}>{url}</span>
        <button className="btn-icone" title="Abrir no navegador do sistema" onClick={() => abrirNoNavegador(url)}>
          <ExternalLink size={14} />
        </button>
      </div>
      <iframe key={versao} className="site-moldura" src={url} title={url}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" />
      <div className="site-dica">Ficou em branco? Alguns sites não deixam abrir dentro de outro app: use o botão <ExternalLink size={11} /> lá em cima.</div>
    </div>
  );
}
