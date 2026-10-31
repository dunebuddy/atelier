import { ReactNode } from "react";
import { Bot, Code2, FolderOpen, PanelRight, SquareTerminal } from "lucide-react";
import { abrirExplorador } from "./Explorador";
import { api } from "../api";
import { falhou } from "../ui";
import { Popover, usePopover } from "./Popover";

/** Pede ao app para abrir o terminal embutido (com um agente ou só o shell) nesta pasta. */
export function abrirTerminalEmbutido(cwd: string, programa?: string, titulo?: string) {
  window.dispatchEvent(new CustomEvent("atelier:terminal", { detail: { cwd, programa, titulo } }));
}

/** Botão que abre um menu: gerenciador de arquivos, VS Code, terminal do sistema ou terminal no atelier. */
export function MenuPasta({ pasta, children, classe = "mini-acao", titulo }: { pasta: string; children: ReactNode; classe?: string; titulo?: string }) {
  const pop = usePopover();
  const abrir = (com: string) => {
    pop.fechar();
    api.abrirPasta(pasta, com).catch(falhou);
  };
  return (
    <>
      <button
        className={classe}
        title={titulo ?? `Abrir a pasta\n${pasta}`}
        onClick={(e) => { e.stopPropagation(); pop.abrir(e); }}
      >
        {children}
      </button>
      {pop.ancora && (
        <Popover ancora={pop.ancora} aoFechar={pop.fechar} largura={250}>
          <div className="menu-rotulo">Abrir a pasta</div>
          <button className="menu-item" onClick={() => { pop.fechar(); abrirExplorador(pasta); }}><PanelRight size={14} /> Aqui no atelier (ver e editar)</button>
          <button className="menu-item" onClick={() => abrir("arquivos")}><FolderOpen size={14} /> No gerenciador de arquivos</button>
          <button className="menu-item" onClick={() => abrir("vscode")}><Code2 size={14} /> No VS Code</button>
          <button className="menu-item" onClick={() => abrir("terminal")}><SquareTerminal size={14} /> Num terminal do sistema</button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={() => { pop.fechar(); abrirTerminalEmbutido(pasta); }}>
            <SquareTerminal size={14} /> Terminal aqui no atelier
          </button>
          <button className="menu-item" onClick={() => { pop.fechar(); abrirTerminalEmbutido(pasta, "agente"); }}>
            <Bot size={14} /> Agente aqui no atelier…
          </button>
          <div className="menu-rotulo" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400, fontFamily: "Cascadia Code, Consolas, monospace", fontSize: 11 }}>{pasta}</div>
        </Popover>
      )}
    </>
  );
}
