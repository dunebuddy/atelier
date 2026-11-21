#!/bin/sh
# Prepara a VM de teste do Fedora (rodar dentro dela, pelo SSH, uma vez):
#   scp -i C:\VMs\chave-vms scripts/vm/preparar-fedora.sh atelier@<ip>: e depois ssh ... sh preparar-fedora.sh
# Desktop GNOME mínimo (com o IBus, que monta os acentos da tecla morta, e o chaveiro do GNOME, onde o cofre guarda a
# chave), o que o Tauri precisa para compilar e Rust, Node e Bun. Teclado ABNT2, português.
set -eu

sudo dnf -y upgrade --refresh
# GNOME mínimo, sem os apps da Workstation
sudo dnf -y install --setopt=install_weak_deps=False \
  gdm gnome-shell gnome-session-wayland-session gnome-terminal nautilus gnome-control-center gnome-keyring \
  ibus ibus-gtk3 ibus-gtk4 xdg-user-dirs xdg-utils glibc-langpack-pt google-noto-sans-fonts google-noto-emoji-fonts \
  hyperv-daemons
sudo systemctl set-default graphical.target
sudo systemctl enable gdm
sudo localectl set-locale LANG=pt_BR.UTF-8
sudo localectl set-x11-keymap br

# compilar o atelier (Tauri 2)
sudo dnf -y install --setopt=install_weak_deps=False \
  git gcc gcc-c++ make pkgconf-pkg-config openssl-devel webkit2gtk4.1-devel libsoup3-devel \
  libappindicator-gtk3-devel librsvg2-devel libxdo-devel file nodejs fuse-libs
if ! command -v cargo >/dev/null 2>&1 && [ ! -x "$HOME/.cargo/bin/cargo" ]; then
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
if [ ! -x "$HOME/.bun/bin/bun" ]; then
  curl -fsSL https://bun.sh/install | bash
fi
echo "pronto: reinicie a VM (sudo reboot) para entrar no GNOME"
