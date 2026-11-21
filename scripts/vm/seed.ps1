# Gera o disquinho de configuração (cloud-init NoCloud, um ISO com o rótulo "cidata") de uma VM de teste do atelier.
#   pwsh scripts/vm/seed.ps1 -Nome atelier-fedora
# Cria em C:\VMs\<Nome>\: seed.iso, senha.txt (a senha do usuário "atelier" no console da VM) e usa a chave SSH
# C:\VMs\chave-vms (criada na primeira vez). Nada disso vai para o git: são credenciais de VM de teste, locais.
# O ISO sai pelo gravador do próprio Windows (IMAPI2), sem ferramenta extra.
param(
  [Parameter(Mandatory)] [string] $Nome,
  [string] $Raiz = "C:\VMs",
  [string] $Teclado = "br"
)
$ErrorActionPreference = "Stop"
$pasta = Join-Path $Raiz $Nome
New-Item -ItemType Directory -Force $pasta | Out-Null

$chave = Join-Path $Raiz "chave-vms"
# -N '' (vazio): no PowerShell 7, '""' chega ao ssh-keygen como a senha literal "" e o ssh sem prompt não abre a chave
if (-not (Test-Path $chave)) { ssh-keygen -q -t ed25519 -N '' -C "vms-de-teste-do-atelier" -f $chave | Out-Null }
$publica = (Get-Content "$chave.pub" -Raw).Trim()

$arqSenha = Join-Path $pasta "senha.txt"
if (-not (Test-Path $arqSenha)) {
  $letras = "abcdefghjkmnpqrstuvwxyz23456789".ToCharArray()
  -join (1..12 | ForEach-Object { $letras | Get-Random }) | Set-Content -NoNewline $arqSenha
}
$senha = Get-Content $arqSenha -Raw

$userData = @"
#cloud-config
hostname: $Nome
users:
  - name: atelier
    gecos: atelier (VM de teste)
    groups: [wheel]
    sudo: "ALL=(ALL) NOPASSWD:ALL"
    shell: /bin/bash
    lock_passwd: false
    plain_text_passwd: "$senha"
    ssh_authorized_keys:
      - $publica
ssh_pwauth: false
keyboard:
  layout: $Teclado
timezone: America/Sao_Paulo
"@
$metaData = "instance-id: $Nome-1`nlocal-hostname: $Nome`n"

$tmp = Join-Path ([IO.Path]::GetTempPath()) "seed-$Nome"
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
New-Item -ItemType Directory $tmp | Out-Null
[IO.File]::WriteAllText((Join-Path $tmp "user-data"), $userData.Replace("`r`n", "`n"))
[IO.File]::WriteAllText((Join-Path $tmp "meta-data"), $metaData)

if (-not ("GravarIso" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices.ComTypes;
public static class GravarIso {
  public static void Gravar(object stream, string destino) {
    var s = (IStream)stream;
    using (var f = File.Create(destino)) {
      var buf = new byte[65536];
      var lidos = System.Runtime.InteropServices.Marshal.AllocHGlobal(sizeof(int));
      try {
        while (true) {
          s.Read(buf, buf.Length, lidos);
          int n = System.Runtime.InteropServices.Marshal.ReadInt32(lidos);
          if (n <= 0) break;
          f.Write(buf, 0, n);
        }
      } finally { System.Runtime.InteropServices.Marshal.FreeHGlobal(lidos); }
    }
  }
}
"@
}
$fs = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
$fs.FileSystemsToCreate = 3 # ISO9660 + Joliet
$fs.VolumeName = "cidata"
$fs.Root.AddTree($tmp, $false)
$iso = Join-Path $pasta "seed.iso"
[GravarIso]::Gravar($fs.CreateResultImage().ImageStream, $iso)
Remove-Item -Recurse -Force $tmp
"seed: $iso"
