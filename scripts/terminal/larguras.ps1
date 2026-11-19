[Console]::OutputEncoding = [Text.Encoding]::UTF8
$casos = @(
  @('2699', '2699'), @('2699+FE0F', '2699 FE0F'), @('2705', '2705'), @('2714+FE0F', '2714 FE0F'),
  @('2139+FE0F', '2139 FE0F'), @('1F5A5', '1F5A5'), @('1F5A5+FE0F', '1F5A5 FE0F'), @('1F5C2+FE0F', '1F5C2 FE0F'),
  @('1F527', '1F527'), @('1F4CA', '1F4CA'), @('1F680', '1F680'), @('1F3AF', '1F3AF'), @('1F504', '1F504'),
  @('1F4C5', '1F4C5'), @('1F50D', '1F50D'), @('1F441+FE0F', '1F441 FE0F'), @('1F468+200D+1F4BB', '1F468 200D 1F4BB'),
  @('1F1E7+1F1F7', '1F1E7 1F1F7'), @('1F44D+1F3FD', '1F44D 1F3FD'), @('23F1+FE0F', '23F1 FE0F'), @('2728','2728'), @('26A1','26A1'), @('274C','274C'), @('23FA','23FA'), @('2192','2192'), @('2713','2713'), @('2714','2714'), @('2022','2022'), @('2500','2500'), @('2B50', '2B50')
)
$res = @()
foreach ($c in $casos) {
  $s = -join ($c[1].Split(' ') | ForEach-Object { [char]::ConvertFromUtf32([Convert]::ToInt32($_, 16)) })
  [Console]::Write("`r|" + $s)
  $res += "$($c[0])=$([Console]::CursorLeft - 1)"
  [Console]::Write("`r                    `r")
}
Write-Host ("RESULT " + ($res -join ' '))
