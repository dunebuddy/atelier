# Digita no console de uma VM do Hyper-V, tecla por tecla (o TypeText do Hyper-V não chega no console do Linux;
# o TypeKey chega), com Enter no fim de cada linha. Mapa de teclado americano (o console antes do cloud-init).
#   & scripts/vm/digitar.ps1 -Nome atelier-fedora -Linhas @("atelier", "ls -la")
# Depois: scripts/vm/tela.ps1 para ver a tela.
param([Parameter(Mandatory)] [string] $Nome, [Parameter(Mandatory)] [AllowEmptyString()] [string[]] $Linhas, [int] $Pausa = 800)
$ErrorActionPreference = "Stop"
$ns = "root\virtualization\v2"
$vm = Get-CimInstance -Namespace $ns -ClassName Msvm_ComputerSystem -Filter "ElementName='$Nome'"
$kb = Get-CimAssociatedInstance -InputObject $vm -ResultClassName Msvm_Keyboard
$SHIFT = 0x10
# caractere → (tecla virtual, com Shift?)
$simbolos = @{
  ' ' = 0x20, $false; "`t" = 0x09, $false; '-' = 0xBD, $false; '_' = 0xBD, $true; '=' = 0xBB, $false; '+' = 0xBB, $true
  '.' = 0xBE, $false; '>' = 0xBE, $true; ',' = 0xBC, $false; '<' = 0xBC, $true; '/' = 0xBF, $false; '?' = 0xBF, $true
  ';' = 0xBA, $false; ':' = 0xBA, $true; "'" = 0xDE, $false; '"' = 0xDE, $true; '\' = 0xDC, $false; '|' = 0xDC, $true
  '[' = 0xDB, $false; '{' = 0xDB, $true; ']' = 0xDD, $false; '}' = 0xDD, $true; '`' = 0xC0, $false; '~' = 0xC0, $true
  '!' = 0x31, $true; '@' = 0x32, $true; '#' = 0x33, $true; '$' = 0x34, $true; '%' = 0x35, $true; '^' = 0x36, $true
  '&' = 0x37, $true; '*' = 0x38, $true; '(' = 0x39, $true; ')' = 0x30, $true
}
function Tecla([int] $vk, [bool] $shift) {
  if ($shift) { Invoke-CimMethod -InputObject $kb -MethodName PressKey -Arguments @{ keyCode = [uint32]$SHIFT } | Out-Null }
  Invoke-CimMethod -InputObject $kb -MethodName TypeKey -Arguments @{ keyCode = [uint32]$vk } | Out-Null
  if ($shift) { Invoke-CimMethod -InputObject $kb -MethodName ReleaseKey -Arguments @{ keyCode = [uint32]$SHIFT } | Out-Null }
}
foreach ($l in $Linhas) {
  foreach ($c in $l.ToCharArray()) {
    $s = [string]$c
    if ($s -cmatch '^[a-z]$') { Tecla ([int][char]$s.ToUpper()) $false }
    elseif ($s -cmatch '^[A-Z]$') { Tecla ([int][char]$s) $true }
    elseif ($s -match '^[0-9]$') { Tecla ([int][char]$s) $false }
    elseif ($simbolos.ContainsKey($s)) { Tecla $simbolos[$s][0] $simbolos[$s][1] }
    else { throw "não sei digitar '$s'" }
  }
  Tecla 0x0D $false
  Start-Sleep -Milliseconds $Pausa
}
