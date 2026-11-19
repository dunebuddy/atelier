# Mede no ConPTY a largura de cada codepoint (sozinho, +FE0F e +FE0E) e grava em tabela.json
param([string]$saida = "$PSScriptRoot\tabela.json")
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$faixas = @(@(0x00A0, 0x33FF), @(0xA000, 0xABFF), @(0xAC00, 0xAC10), @(0xF900, 0xFFFD), @(0x1F000, 0x1FBFF), @(0x20000, 0x20010), @(0xE0000, 0xE007F))
$um = @{}; $vs16 = @{}; $vs15 = @{}
function Medir([string]$s) { [Console]::Write("`r" + $s); $x = [Console]::CursorLeft; [Console]::Write("`r      `r"); return $x }
foreach ($f in $faixas) {
  for ($cp = $f[0]; $cp -le $f[1]; $cp++) {
    if ($cp -ge 0xD800 -and $cp -le 0xDFFF) { continue }
    $c = [char]::ConvertFromUtf32($cp)
    $w = Medir $c
    $um[$cp] = $w
    if (($cp -ge 0x2000 -and $cp -le 0x2BFF) -or ($cp -ge 0x1F000 -and $cp -le 0x1FBFF) -or $cp -eq 0xA9 -or $cp -eq 0xAE -or ($cp -ge 0x3000 -and $cp -le 0x33FF)) {
      $vs16[$cp] = Medir ($c + [char]0xFE0F)
      $vs15[$cp] = Medir ($c + [char]0xFE0E)
    }
  }
}
foreach ($cp in 0x23, 0x2A, 0x30, 0x31, 0x39) { $vs16[$cp] = Medir ([char]::ConvertFromUtf32($cp) + [char]0xFE0F + [char]0x20E3) }
$extra = @{
  zwj = (Medir ("a" + [char]0x200D))
  familia = (Medir ([char]::ConvertFromUtf32(0x1F468) + [char]0x200D + [char]::ConvertFromUtf32(0x1F4BB)))
  bandeira = (Medir ([char]::ConvertFromUtf32(0x1F1E7) + [char]::ConvertFromUtf32(0x1F1F7)))
  pele = (Medir ([char]::ConvertFromUtf32(0x1F44D) + [char]::ConvertFromUtf32(0x1F3FD)))
  acento = (Medir ("e" + [char]0x0301))
  hangul = (Medir ([char]0x1100 + [char]0x1161))
}
$o = [ordered]@{ um = $um; vs16 = $vs16; vs15 = $vs15; extra = $extra }
# chaves numéricas viram texto no JSON
$j = @{}; foreach ($k in $o.Keys) { $h = @{}; foreach ($e in $o[$k].GetEnumerator()) { $h["$($e.Key)"] = $e.Value }; $j[$k] = $h }
$j | ConvertTo-Json -Compress -Depth 4 | Set-Content -Encoding utf8 $saida
Write-Host "TABELA PRONTA"
