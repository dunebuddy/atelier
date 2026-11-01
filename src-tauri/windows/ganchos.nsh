; Ganchos do instalador (bundle.windows.nsis.installerHooks no tauri.conf.json).

; O atelier-mcp.exe é aberto pelo Claude Code (e outros agentes) em cada sessão com o MCP ligado, não pelo atelier.
; Em uso, o Windows não deixa sobrescrever o arquivo, mas deixa renomear: o antigo vira atelier-mcp.antigo-N.exe e
; segue rodando até a sessão do agente reiniciar; o novo entra no lugar. Os antigos que ninguém usa mais são apagados
; aqui, ao abrir o app e ao desinstalar.
!macro NSIS_HOOK_PREINSTALL
  Delete "$INSTDIR\atelier-mcp.antigo-*.exe"
  IfFileExists "$INSTDIR\atelier-mcp.exe" 0 atelier_mcp_fim
    Push $R9
    StrCpy $R9 0
    atelier_mcp_nome:
      IntOp $R9 $R9 + 1
      IfFileExists "$INSTDIR\atelier-mcp.antigo-$R9.exe" atelier_mcp_nome
    Rename "$INSTDIR\atelier-mcp.exe" "$INSTDIR\atelier-mcp.antigo-$R9.exe"
    Pop $R9
  atelier_mcp_fim:
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\atelier-mcp.antigo-*.exe"
!macroend
