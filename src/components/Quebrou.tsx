// Quando um pedaço da tela quebra ao desenhar, o React desmonta tudo e sobra só o fundo. Estes "error boundaries"
// seguram o erro: a janela que quebrou mostra o que foi (e o resto do app segue), e o app inteiro, se for o caso,
// mostra uma tela com Recarregar. Os dois gravam o erro em ~/atelier/erros.log (POST /api/log), para achar a causa.
import { Component, ErrorInfo, ReactNode } from "react";
import { BASE } from "../api";

export function registrarErro(erro: unknown, onde: string, componentes = "") {
  const e = erro instanceof Error ? erro : new Error(String(erro));
  fetch(`${BASE}/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ erro: e.message, onde, pilha: e.stack ?? "", componentes }),
  }).catch(() => {});
}

// erro fora do React (promessa sem catch, evento): só registra
let ouvindo = false;
export function ouvirErrosSoltos() {
  if (ouvindo) return;
  ouvindo = true;
  window.addEventListener("error", (ev) => registrarErro(ev.error ?? ev.message, "janela (error)"));
  window.addEventListener("unhandledrejection", (ev) => registrarErro(ev.reason, "promessa sem catch"));
}

interface Props {
  /** onde foi (vai para o log): "janela: Título", "app" */
  onde: string;
  children: ReactNode;
  /** a janela do painel: fechar */
  aoFechar?: () => void;
  /** app inteiro: tela cheia com Recarregar */
  global?: boolean;
}

export class Quebrou extends Component<Props, { erro: Error | null }> {
  state = { erro: null as Error | null };

  static getDerivedStateFromError(erro: Error) {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    registrarErro(erro, this.props.onde, info.componentStack ?? "");
  }

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;
    return (
      <div className={this.props.global ? "quebrou global" : "quebrou"}>
        <strong>{this.props.global ? "O atelier quebrou ao desenhar a tela." : "Esta janela quebrou ao desenhar."}</strong>
        <code>{erro.message}</code>
        <span className="dica">O erro ficou gravado em erros.log, na pasta do atelier.</span>
        <div className="quebrou-acoes">
          {this.props.global ? (
            <button className="btn primario" onClick={() => location.reload()}>Recarregar</button>
          ) : (
            <>
              <button className="btn primario" onClick={() => this.setState({ erro: null })}>Tentar de novo</button>
              {this.props.aoFechar && <button className="btn" onClick={this.props.aoFechar}>Fechar a janela</button>}
            </>
          )}
        </div>
      </div>
    );
  }
}
