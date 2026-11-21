#!/bin/sh
# Instala (ou atualiza) o atelier no Linux, sem root:
#   curl -fsSL https://raw.githubusercontent.com/dunebuddy/atelier/master/install.sh | sh
# Desinstalar (os seus dados em ~/atelier ficam):
#   curl -fsSL https://raw.githubusercontent.com/dunebuddy/atelier/master/install.sh | sh -s -- --desinstalar
#
# Baixa o AppImage da última release para ~/.local/share/atelier, põe o comando `atelier` em ~/.local/bin e cria a
# entrada no menu de aplicativos (com o ícone e os links atelier://). Rodar de novo atualiza. Depois de instalado, o
# próprio app avisa e se atualiza quando sai versão nova.
set -eu

REPO="dunebuddy/atelier"
DADOS="${XDG_DATA_HOME:-$HOME/.local/share}"
PASTA="$DADOS/atelier"
APP="$PASTA/atelier.AppImage"
BIN="$HOME/.local/bin"
DESKTOP="$DADOS/applications/atelier.desktop"
ICONES="$DADOS/icons/hicolor"

diz() { printf '%s\n' "$*"; }
falha() { printf 'atelier: %s\n' "$*" >&2; exit 1; }

atualizar_menu() {
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q "$DADOS/applications" 2>/dev/null || true
  command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q -t "$ICONES" 2>/dev/null || true
}

desinstalar() {
  rm -f "$APP" "$PASTA/versao" "$BIN/atelier" "$DESKTOP" \
    "$ICONES/128x128/apps/atelier.png" "$ICONES/256x256/apps/atelier.png"
  rmdir "$PASTA" 2>/dev/null || true
  atualizar_menu
  diz "atelier desinstalado. Os seus dados (~/atelier) continuam onde estavam."
}

tem_libfuse2() {
  for f in /usr/lib64/libfuse.so.2 /usr/lib/libfuse.so.2 /usr/lib/x86_64-linux-gnu/libfuse.so.2 \
           /lib/x86_64-linux-gnu/libfuse.so.2; do
    [ -e "$f" ] && return 0
  done
  { ldconfig -p 2>/dev/null || /sbin/ldconfig -p 2>/dev/null; } | grep -q 'libfuse\.so\.2'
}

instalar() {
  [ "$(uname -s)" = "Linux" ] || falha "este script é para Linux. No Windows, use o instalador da release."
  [ "$(uname -m)" = "x86_64" ] || falha "só há versão para x86_64 por enquanto (esta máquina é $(uname -m))."
  command -v curl >/dev/null 2>&1 || falha "precisa do curl."

  versao=$(curl -fsSL "https://github.com/$REPO/releases/latest/download/latest.json" \
    | sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)
  [ -n "$versao" ] || falha "não consegui descobrir a última versão no GitHub."

  if [ -f "$APP" ] && [ "$(cat "$PASTA/versao" 2>/dev/null)" = "$versao" ]; then
    diz "O atelier $versao já está instalado; só refazendo o menu."
  else
    diz "Baixando o atelier $versao..."
    mkdir -p "$PASTA"
    # baixa ao lado e troca no fim: um atelier aberto continua rodando com o arquivo antigo
    curl -fL --progress-bar -o "$APP.novo" \
      "https://github.com/$REPO/releases/download/v$versao/atelier_${versao}_amd64.AppImage" \
      || { rm -f "$APP.novo"; falha "o download falhou."; }
    chmod +x "$APP.novo"
    mv -f "$APP.novo" "$APP"
    printf '%s\n' "$versao" > "$PASTA/versao"
  fi

  mkdir -p "$BIN"
  ln -sf "$APP" "$BIN/atelier"

  for t in 128x128 256x256; do
    arq=128x128.png; [ "$t" = 256x256 ] && arq=128x128@2x.png
    mkdir -p "$ICONES/$t/apps"
    curl -fsSL -o "$ICONES/$t/apps/atelier.png" \
      "https://raw.githubusercontent.com/$REPO/master/src-tauri/icons/$arq" || true
  done

  mkdir -p "$(dirname "$DESKTOP")"
  cat > "$DESKTOP" <<EOF
[Desktop Entry]
Type=Application
Name=atelier
Comment=Gestão pessoal com MCP para agentes
Exec="$APP" %u
Icon=atelier
Terminal=false
Categories=Office;Utility;
MimeType=x-scheme-handler/atelier;
StartupWMClass=atelier
EOF
  command -v xdg-mime >/dev/null 2>&1 && xdg-mime default atelier.desktop x-scheme-handler/atelier 2>/dev/null || true
  atualizar_menu

  diz ""
  diz "Pronto: o atelier $versao está no menu de aplicativos (procure por \"atelier\")."
  case ":$PATH:" in
    *":$BIN:"*) diz "No terminal: atelier" ;;
    *) diz "No terminal: $BIN/atelier (ou ponha ~/.local/bin no PATH)" ;;
  esac

  if ! tem_libfuse2; then
    diz ""
    diz "Atenção: falta a libfuse2, que o AppImage usa para abrir. Instale com:"
    if command -v dnf >/dev/null 2>&1; then diz "  sudo dnf install fuse-libs"
    elif command -v apt-get >/dev/null 2>&1; then diz "  sudo apt install libfuse2   (no Ubuntu 24.04: libfuse2t64)"
    elif command -v pacman >/dev/null 2>&1; then diz "  sudo pacman -S fuse2"
    else diz "  (o pacote libfuse2 / fuse2 da sua distribuição)"
    fi
  fi

  if ls "$HOME/AppImages" 2>/dev/null | grep -qi atelier; then
    diz ""
    diz "Você também tem um atelier em ~/AppImages (do Gear Lever): remova por lá para não ficar dois no menu."
  fi
}

case "${1:-}" in
  --desinstalar|--uninstall) desinstalar ;;
  "") instalar ;;
  *) falha "opção desconhecida: $1 (use --desinstalar, ou nada para instalar)" ;;
esac
