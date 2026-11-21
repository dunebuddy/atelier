# Cria (ou recria) uma VM de teste do atelier no Hyper-V a partir de uma imagem de nuvem e do seed.iso (seed.ps1).
#   pwsh scripts/vm/criar.ps1 -Nome atelier-fedora -Imagem C:\VMs\atelier-fedora\fedora-45-azure.vhdfixed.xz
# VMzinha: disco dinâmico (só ocupa o que usa, até -DiscoGB), memória dinâmica até 4 GB, sem checkpoints
# automáticos, rede pelo "Default Switch" (NAT do Hyper-V). Precisa do usuário no grupo "Administradores do Hyper-V".
param(
  [Parameter(Mandatory)] [string] $Nome,
  [Parameter(Mandatory)] [string] $Imagem,
  [string] $Raiz = "C:\VMs",
  [int] $DiscoGB = 25,
  [int] $Geracao = 2
)
$ErrorActionPreference = "Stop"
$pasta = Join-Path $Raiz $Nome
$disco = Join-Path $pasta "disco.vhdx"
if (Get-VM -Name $Nome -ErrorAction SilentlyContinue) { throw "A VM $Nome já existe (apague antes com Remove-VM)." }

# .xz → .vhd (o Python lê xz sem ferramenta extra); .qcow2 → .vhd (qcow2-para-vhd.py); .vhd → .vhdx dinâmico
$vhd = $Imagem
if ($Imagem -like "*.xz" -or $Imagem -like "*.qcow2") {
  $vhd = Join-Path $pasta "imagem.vhd"
  if (-not (Test-Path $vhd)) {
    if ($Imagem -like "*.xz") {
      python -I -c "import lzma,shutil,sys; shutil.copyfileobj(lzma.open(sys.argv[1]), open(sys.argv[2],'wb'), 1<<20)" $Imagem $vhd
    } else {
      python -I (Join-Path $PSScriptRoot "qcow2-para-vhd.py") $Imagem $vhd
    }
    if ($LASTEXITCODE) { throw "não consegui converter $Imagem" }
  }
}
if (-not (Test-Path $disco)) {
  Convert-VHD -Path $vhd -DestinationPath $disco -VHDType Dynamic
  Resize-VHD -Path $disco -SizeBytes ([int64]$DiscoGB * 1GB)
}
if ($vhd -ne $Imagem) { Remove-Item $vhd }

$vm = New-VM -Name $Nome -Generation $Geracao -MemoryStartupBytes 2GB -VHDPath $disco -SwitchName "Default Switch" -Path $Raiz
Set-VMMemory -VM $vm -DynamicMemoryEnabled $true -MinimumBytes 1GB -MaximumBytes 4GB
Set-VMProcessor -VM $vm -Count 4
Set-VM -VM $vm -AutomaticCheckpointsEnabled $false -AutomaticStopAction ShutDown
if ($Geracao -eq 2) { Set-VMFirmware -VM $vm -EnableSecureBoot On -SecureBootTemplate MicrosoftUEFICertificateAuthority }
Add-VMDvdDrive -VM $vm -Path (Join-Path $pasta "seed.iso")
Start-VM -VM $vm

# o IP: pelo serviço KVP do Hyper-V (se a imagem tiver) ou pelo nome na rede do Default Switch (<nome>.mshome.net)
$ip = $null
for ($i = 0; $i -lt 60 -and -not $ip; $i++) {
  Start-Sleep 5
  $ip = (Get-VMNetworkAdapter -VM $vm).IPAddresses | Where-Object { $_ -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1
  if (-not $ip) {
    # sem o KVP: pela tabela de vizinhos (MAC da VM) e, por último, pelo nome no DNS do Default Switch
    $mac = ((Get-VMNetworkAdapter -VM $vm).MacAddress -replace '(..)(?!$)', '$1-')
    $ip = Get-NetNeighbor -AddressFamily IPv4 -LinkLayerAddress $mac -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress -First 1
  }
  if (-not $ip) {
    $ip = Resolve-DnsName "$Nome.mshome.net" -Type A -DnsOnly -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress -First 1
  }
}
if ($ip) { "VM $Nome no ar: ssh -i $Raiz\chave-vms atelier@$ip" } else { "VM $Nome ligada, mas o IP não apareceu em 5 min (veja o console no Gerenciador do Hyper-V)" }
