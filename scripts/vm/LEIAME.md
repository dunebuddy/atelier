# VMs de teste do Linux

O atelier roda no Linux e o Paulo usa no Fedora; muita gente usa Ubuntu e Arch. O WSL não serve para o que importa
(teclado com IBus, chaveiro do GNOME, menu de aplicativos), então os testes de Linux são em VMzinhas no Hyper-V
desta máquina: uma por distribuição, uma ligada por vez.

- Tudo fica em `C:\VMs\` (fora do git): `<nome>\disco.vhdx`, `<nome>\seed.iso`, `<nome>\senha.txt` (a senha do
  usuário `atelier` no console) e a chave SSH `chave-vms`.
- Disco dinâmico até 25 GB, memória dinâmica até 4 GB, sem checkpoints automáticos.
- Precisa do usuário no grupo "Administradores do Hyper-V" (`Add-LocalGroupMember -SID S-1-5-32-578 ...`, como
  administrador, e entrar de novo no Windows).

## Criar

```powershell
pwsh scripts/vm/seed.ps1 -Nome atelier-fedora
pwsh scripts/vm/criar.ps1 -Nome atelier-fedora -Imagem C:\VMs\atelier-fedora\fedora-45-azure.vhdfixed.xz
scp -i C:\VMs\chave-vms scripts/vm/preparar-fedora.sh atelier@<ip>:
ssh -i C:\VMs\chave-vms atelier@<ip> sh preparar-fedora.sh
```

A imagem do Fedora é a Cloud Base para Azure (feita para Hyper-V, já com os serviços do Hyper-V), de
fedoraproject.org, conferida pelo SHA256 do arquivo CHECKSUM oficial.

## Usar

- Ligar/desligar: `Start-VM atelier-fedora` / `Stop-VM atelier-fedora`.
- IP: `(Get-VMNetworkAdapter atelier-fedora).IPAddresses`.
- Tela (para testar teclado e menu): Gerenciador do Hyper-V → Conectar, entrar como `atelier`.
- Diminuir o disco depois de muita coisa: dentro da VM `sudo fstrim -av`, desligar, `Optimize-VHD -Mode Full`.

## Cuidado

Nunca usar `$HOME` (ou outra variável) num comando passado ao `wsl.exe` ou ao `ssh` sem aspas simples: o shell do
outro lado expande antes. Foi assim que um `rm -rf $HOME` de teste apagou a home do Ubuntu do WSL em 2026-11-21.
