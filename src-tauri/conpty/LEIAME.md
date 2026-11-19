# ConPTY novo da Microsoft (só Windows)

`conpty.dll` e `OpenConsole.exe` (x64) do pacote NuGet oficial
[`Microsoft.Windows.Console.ConPTY` 1.25.261109001](https://www.nuget.org/packages/Microsoft.Windows.Console.ConPTY/1.25.261109001),
licença MIT, assinados pela Microsoft. O instalador do Windows os põe ao lado do `atelier.exe` (`tauri.windows.conf.json`)
e o `portable-pty` carrega a `conpty.dll` da pasta do exe no lugar do ConPTY do sistema.

Por quê: o ConPTY do Windows redesenha a tela pela conta de largura dele (cada codepoint numa coluna, até o U+FE0F) e
embaralha texto com emoji; o novo repassa a saída do programa sem redesenhar e conta por grapheme, como o xterm do
atelier (`src/larguras.ts`). A bateria que mostrou isso está em `scripts/terminal/`.

Para atualizar: baixar o .nupkg novo, copiar `runtimes/win-x64/native/conpty.dll` e
`build/native/runtimes/x64/OpenConsole.exe`, rodar a bateria de novo.
