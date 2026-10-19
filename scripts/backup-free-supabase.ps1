param(
  [string]$OutputRoot = "backups"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_DB_URL)) {
  throw "Defina SUPABASE_DB_URL somente na sessão atual antes de executar o backup."
}

$cliName = if ([string]::IsNullOrWhiteSpace($env:SUPABASE_CLI)) { "supabase" } else { $env:SUPABASE_CLI }
$cli = Get-Command $cliName -ErrorAction SilentlyContinue
if ($null -eq $cli) {
  throw "Supabase CLI não encontrado. Instale/prepare a CLI e o ambiente exigido pelo comando db dump."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
$target = Join-Path (Resolve-Path $OutputRoot) "supabase-$stamp"
New-Item -ItemType Directory -Path $target -Force | Out-Null

function Invoke-Dump([string[]]$Arguments, [string]$Label) {
  & $cli.Source @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao gerar $Label (exit code $LASTEXITCODE)."
  }
}

Invoke-Dump @("db", "dump", "--db-url", $env:SUPABASE_DB_URL, "--role-only", "-f", (Join-Path $target "roles.sql")) "roles.sql"
Invoke-Dump @("db", "dump", "--db-url", $env:SUPABASE_DB_URL, "-f", (Join-Path $target "schema.sql")) "schema.sql"
Invoke-Dump @("db", "dump", "--db-url", $env:SUPABASE_DB_URL, "--data-only", "-f", (Join-Path $target "data.sql")) "data.sql"

$checksums = [ordered]@{}
foreach ($file in @("roles.sql", "schema.sql", "data.sql")) {
  $checksums[$file] = (Get-FileHash (Join-Path $target $file) -Algorithm SHA256).Hash
}

$manifest = [ordered]@{
  schemaVersion = 1
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  source = "supabase-free-logical-dump"
  files = $checksums
}
$manifest | ConvertTo-Json | Set-Content -Path (Join-Path $target "manifest.json") -Encoding utf8

Write-Output "Backup lógico criado em: $target"
