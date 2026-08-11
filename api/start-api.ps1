$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$tempDirectory = Join-Path $PSScriptRoot '.java-tmp'
New-Item -ItemType Directory -Force -Path $tempDirectory | Out-Null
if (-not (Test-Path 'target/catalog-api-1.0.0.jar')) {
    mvn -B package
    if ($LASTEXITCODE -ne 0) { throw 'Java build failed.' }
}
java "-Djdk.net.unixdomain.tmpdir=$tempDirectory" -jar target/catalog-api-1.0.0.jar
