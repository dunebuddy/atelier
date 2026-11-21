# Foto do console de uma VM do Hyper-V (para ver boot, erro ou login sem abrir o Gerenciador).
#   pwsh scripts/vm/tela.ps1 -Nome atelier-fedora [-Saida C:\VMs\atelier-fedora\tela.png]
param([Parameter(Mandatory)] [string] $Nome, [string] $Saida, [int] $Largura = 1024, [int] $Altura = 768)
$ErrorActionPreference = "Stop"
if (-not $Saida) { $Saida = Join-Path "C:\VMs\$Nome" "tela.png" }
$ns = "root\virtualization\v2"
$vm = Get-CimInstance -Namespace $ns -ClassName Msvm_ComputerSystem -Filter "ElementName='$Nome'"
$cfg = Get-CimAssociatedInstance -InputObject $vm -ResultClassName Msvm_VirtualSystemSettingData |
  Where-Object VirtualSystemType -eq "Microsoft:Hyper-V:System:Realized"
$svc = Get-CimInstance -Namespace $ns -ClassName Msvm_VirtualSystemManagementService
$r = Invoke-CimMethod -InputObject $svc -MethodName GetVirtualSystemThumbnailImage -Arguments @{
  TargetSystem = $cfg; WidthPixels = [uint16]$Largura; HeightPixels = [uint16]$Altura }
if ($r.ReturnValue -ne 0 -or -not $r.ImageData) { throw "o Hyper-V não deu a imagem (código $($r.ReturnValue))" }
[byte[]]$px = $r.ImageData
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap $Largura, $Altura, ([System.Drawing.Imaging.PixelFormat]::Format16bppRgb565)
$dados = $bmp.LockBits((New-Object System.Drawing.Rectangle 0, 0, $Largura, $Altura), "WriteOnly", $bmp.PixelFormat)
# a imagem vem em RGB565, linha a linha (2 bytes por pixel); o bitmap pode ter linhas mais largas (stride)
$linha = $Largura * 2
for ($y = 0; $y -lt $Altura -and ($y + 1) * $linha -le $px.Length; $y++) {
  [System.Runtime.InteropServices.Marshal]::Copy($px, $y * $linha, [IntPtr]($dados.Scan0.ToInt64() + $y * $dados.Stride), $linha)
}
$bmp.UnlockBits($dados)
$bmp.Save($Saida, [System.Drawing.Imaging.ImageFormat]::Png)
$Saida
