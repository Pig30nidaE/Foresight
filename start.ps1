#!/usr/bin/env pwsh
# Windows wrapper: starts Docker services and tails logs.

param(
    [switch]$NoBuild,
    [switch]$NoLogs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (-not (Test-Command -Name "docker")) {
    Write-Error "docker command not found. Please install Docker Desktop first."
}

# Validate Docker Compose V2 availability.
& docker compose version | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker compose is not available. Enable Compose V2 in Docker Desktop."
}

$upArgs = @("compose", "up", "-d")
if (-not $NoBuild) {
    $upArgs += "--build"
}

Write-Host "[INFO] Starting services..."
& docker @upArgs
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (-not $NoLogs) {
    Write-Host "[INFO] Attaching logs (Ctrl+C to detach)..."
    & docker compose logs -f
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}