# Abre (reabre) o atelier instalado na sessão gráfica da VM, com as variáveis dadas, e fotografa a tela.
#   & scripts/vm/abrir-atelier.ps1 -Ip 172.27.13.42 -Variaveis "WEBKIT_DISABLE_DMABUF_RENDERER=1"
# O monitor da VM apaga sozinho às vezes: um Shift pelo teclado virtual acorda antes da foto.
param([string] $Nome = "atelier-fedora", [Parameter(Mandatory)] [string] $Ip, [string] $Variaveis = "", [int] $Espera = 10)
$ErrorActionPreference = "Stop"
$o = @("-i", "C:\VMs\chave-vms", "-o", "BatchMode=yes", "-o", "UserKnownHostsFile=C:\VMs\known_hosts")
$sessao = 'export XDG_RUNTIME_DIR=/run/user/1000 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus; export WAYLAND_DISPLAY=$(ls /run/user/1000 | grep -E "^wayland-[0-9]+$" | head -1)'
ssh @o "atelier@$Ip" "pkill -x atelier; sleep 2; $sessao; env $Variaveis nohup .local/bin/atelier > atelier-teste.log 2>&1 & sleep $Espera; echo aberto"
$ns = "root\virtualization\v2"
$vm = Get-CimInstance -Namespace $ns -ClassName Msvm_ComputerSystem -Filter "ElementName='$Nome'"
$kb = Get-CimAssociatedInstance -InputObject $vm -ResultClassName Msvm_Keyboard
Invoke-CimMethod -InputObject $kb -MethodName TypeKey -Arguments @{ keyCode = [uint32]0x10 } | Out-Null
Start-Sleep 2
& (Join-Path $PSScriptRoot "tela.ps1") -Nome $Nome
