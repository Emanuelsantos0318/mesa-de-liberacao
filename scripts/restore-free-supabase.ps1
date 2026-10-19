param(
  [Parameter(Mandatory = $true)]
  [string]$BackupDirectory
)

$ErrorActionPreference = "Stop"
$productionRef = "aglxvhsznwbmzithcvbb"

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_RESTORE_DB_URL)) {
  throw "Defina SUPABASE_RESTORE_DB_URL com a connection string do projeto Free de homologação."
}
if ($env:SUPABASE_RESTORE_DB_URL -match [regex]::Escape($productionRef)) {
  throw "Restauração bloqueada: a URL de destino parece ser o projeto de produção."
}
if ($env:RESTORE_CONFIRMATION -ne "RESTORE_FREE_SUPABASE") {
  throw "Defina RESTORE_CONFIRMATION=RESTORE_FREE_SUPABASE para confirmar o destino isolado."
}

$psql = Get-Command psql -ErrorAction SilentlyContinue
if ($null -eq $psql) {
  throw "psql não encontrado. Instale o cliente PostgreSQL na máquina de homologação."
}

$root = Resolve-Path $BackupDirectory
foreach ($file in @("roles.sql", "schema.sql", "data.sql")) {
  if (-not (Test-Path (Join-Path $root $file))) {
    throw "Arquivo obrigatório ausente: $file"
  }
}

function Invoke-Restore([string]$File) {
  & $psql.Source $env:SUPABASE_RESTORE_DB_URL --set=ON_ERROR_STOP=1 --file (Join-Path $root $File)
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao restaurar $File (exit code $LASTEXITCODE)."
  }
}

Invoke-Restore "roles.sql"
Invoke-Restore "schema.sql"
Invoke-Restore "data.sql"
Write-Output "Restauração concluída no destino isolado. Execute o inventário RLS antes da homologação."
