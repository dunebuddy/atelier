import { useEffect, useState } from "react";
import { DatabaseBackup, FolderOpen, Keyboard, PanelBottomClose, Trash2 } from "lucide-react";
import { api, Preferencias } from "../api";
import { avisar, falhou } from "../ui";
import { dataHora } from "../visao";

/** Configurações do que roda sozinho. Tudo começa desligado. */
export function SecaoAutomacao({ prefs, mudar }: { prefs: Preferencias; mudar: (d: Partial<Preferencias>) => void }) {
  const [backups, setBackups] = useState<{ pasta: string; copias: { nome: string; criado_em: string | null; tamanho: number }[] } | null>(null);
  const carregar = () => api.backups().then(setBackups).catch(() => {});
  useEffect(() => { carregar(); }, []);

  const b = prefs.backup;
  const c = prefs.captura;
  const l = prefs.lixeira;

  return (
    <>
      <h3>Automação</h3>
      <p className="dica">Coisas que o atelier pode fazer sozinho. Tudo vem desligado; ligue só o que quiser.</p>

      <div className="auto-bloco">
        <div className="auto-cabeca">
          <DatabaseBackup size={16} />
          <strong>Backup automático da bancada</strong>
          <Interruptor ligado={b.ativo} aoMudar={(v) => mudar({ backup: { ...b, ativo: v } })} />
        </div>
        <p className="dica">
          Copia o banco da bancada aberta para <code>backups/</code> dentro dela. A cópia é feita com o app aberto, sem
          parar nada.
        </p>
        <div className={`auto-campos${b.ativo ? "" : " desligado"}`}>
          <label>A cada <input type="number" min={1} value={b.intervalo_horas} onChange={(e) => mudar({ backup: { ...b, intervalo_horas: Math.max(1, Number(e.target.value) || 1) } })} /> horas</label>
          <label>Guardar as últimas <input type="number" min={1} value={b.manter} onChange={(e) => mudar({ backup: { ...b, manter: Math.max(1, Number(e.target.value) || 1) } })} /> cópias</label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" onClick={async () => { try { await api.backupAgora(); avisar("Backup feito."); carregar(); } catch (e) { falhou(e); } }}>
            <DatabaseBackup size={14} /> Fazer backup agora
          </button>
          {backups && <button className="btn" onClick={() => api.abrirPasta(backups.pasta).catch(falhou)}><FolderOpen size={14} /> Abrir a pasta de backups</button>}
          {backups?.copias[0] && <span className="dica" style={{ margin: 0 }}>último: {backups.copias[0].criado_em ? dataHora(backups.copias[0].criado_em) : backups.copias[0].nome} · {backups.copias.length} {backups.copias.length === 1 ? "cópia" : "cópias"}</span>}
        </div>
      </div>

      <div className="auto-bloco">
        <div className="auto-cabeca">
          <Keyboard size={16} />
          <strong>Captura global</strong>
          <Interruptor ligado={c.ativo} aoMudar={(v) => mudar({ captura: { ...c, ativo: v } })} />
        </div>
        <p className="dica">
          Um atalho do sistema traz o atelier com a caixinha “o que chegou?”, de qualquer programa (ou o “Capturar…” do
          ícone na bandeja).
        </p>
        <div className={`auto-campos${c.ativo ? "" : " desligado"}`}>
          <label>
            Atalho
            <input className="campo mono" style={{ width: 240 }} value={c.atalho} onChange={(e) => mudar({ captura: { ...c, atalho: e.target.value } })} />
          </label>
        </div>
        <p className="dica" style={{ marginTop: 6 }}>Formato do atalho: <code>CommandOrControl+Alt+Space</code>, <code>Ctrl+Shift+K</code>…</p>
      </div>

      <div className="auto-bloco">
        <div className="auto-cabeca">
          <PanelBottomClose size={16} />
          <strong>Fechar vai para a bandeja</strong>
          <Interruptor ligado={c.bandeja} aoMudar={(v) => mudar({ captura: { ...c, bandeja: v } })} />
        </div>
        <p className="dica">
          O × da janela esconde o atelier no ícone da bandeja (perto do relógio), com os terminais rodando. Para sair de
          verdade: botão direito no ícone → Sair. Clique no ícone traz a janela de volta.
        </p>
      </div>

      <div className="auto-bloco">
        <div className="auto-cabeca">
          <Trash2 size={16} />
          <strong>Esvaziar a lixeira sozinha</strong>
          <Interruptor ligado={l.ativo} aoMudar={(v) => mudar({ lixeira: { ...l, ativo: v } })} />
        </div>
        <p className="dica">Apaga de vez o que está na lixeira há muito tempo. As pastas no disco nunca são apagadas.</p>
        <div className={`auto-campos${l.ativo ? "" : " desligado"}`}>
          <label>Depois de <input type="number" min={1} value={l.dias} onChange={(e) => mudar({ lixeira: { ...l, dias: Math.max(1, Number(e.target.value) || 1) } })} /> dias na lixeira</label>
        </div>
      </div>
    </>
  );
}

export function Interruptor({ ligado, aoMudar }: { ligado: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <button className={`interruptor${ligado ? " ligado" : ""}`} role="switch" aria-checked={ligado} onClick={() => aoMudar(!ligado)} title={ligado ? "Ligado" : "Desligado"}>
      <span />
    </button>
  );
}
