# verify.ps1 — LinguaGraph verification wrapper (M0.7 W8).
#
# Semantics:
#
#   dev.ps1    = run / use LinguaGraph
#   verify.ps1 = prove the repository is green
#
# verify.ps1 is a THIN orchestration layer over the authoritative repository
# verification commands (the same commands documented in README.md and
# docs/testing/testing-strategy.md). It does NOT reimplement any test logic.
#
#   PowerShell 7+ :  .\scripts\verify.ps1
#   Windows PS 5.1:  powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
#
# What it runs, in order:
#
#   backend  : uv sync --frozen
#              uv run pytest            (unit + real-PostgreSQL integration;
#                                        migration cycles run on DISPOSABLE
#                                        databases only — the normal
#                                        development database is never a
#                                        destructive-test target)
#              uv run alembic current   (expects 0002 (head))
#              uv run alembic check     (no schema drift)
#   frontend : npm ci                    (ALWAYS runs — reproducible
#                                         verification means the exact
#                                         committed lockfile tree is
#                                         installed every run; never
#                                         skipped or recorded as a
#                                         shortcut)
#              npm run lint
#              npm run typecheck
#              npm run test
#              npm run build
#   e2e      : npx playwright install chromium (no-op when present)
#              npx playwright test e2e/golden-path.spec.ts e2e/unicode.spec.ts
#
# Development data is preserved: no downgrade, no reset, no volume
# deletion, no .env overwrite. Any destructive migration cycle relies on
# the existing disposable-database safety machinery (app/db/disposable.py),
# never on the development database.
#
# On the first failure the script STOPS, reports the failing command and
# its output, and exits with a non-zero status. A final summary lists every
# executed step with PASS/FAIL.

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$ApiRoot = Join-Path $Root 'apps\api'
$WebRoot = Join-Path $Root 'apps\web'
$ComposeFile = Join-Path $Root 'compose.yml'
$ApiEnvFile = Join-Path $ApiRoot '.env'
$ApiEnvExample = Join-Path $ApiRoot '.env.example'
$PgContainer = 'linguagraph-postgres'

$results = [System.Collections.Generic.List[object]]::new()
$failed = $false

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Fail {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Record-Step {
    param([string]$Name, [bool]$Ok)
    $results.Add([pscustomobject]@{ Step = $Name; Result = $(if ($Ok) { 'PASS' } else { 'FAIL' }) })
}

function Invoke-VerifyStep {
    param(
        [string]$Name,
        [string]$WorkingDirectory,
        [string[]]$Arguments
    )
    Write-Step $Name
    Push-Location $WorkingDirectory
    try {
        & $Arguments[0] @($Arguments[1..($Arguments.Count - 1)])
        $code = $LASTEXITCODE
        if ($code -ne 0) {
            Record-Step $Name $false
            Write-Host "ERROR: '$($Arguments -join ' ')' failed with exit code $code (working directory: $WorkingDirectory)." -ForegroundColor Red
            Write-Host 'Verification STOPPED. Fix the failing step and re-run .\scripts\verify.ps1' -ForegroundColor Red
            exit 1
        }
        Record-Step $Name $true
    } catch {
        Record-Step $Name $false
        Write-Host "ERROR: '$($Arguments -join ' ')' failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host 'Verification STOPPED. Fix the failing step and re-run .\scripts\verify.ps1' -ForegroundColor Red
        exit 1
    } finally {
        Pop-Location
    }
}

function Test-PortInUse {
    param([int]$Port)
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $listener)
}

function Wait-PostgresHealthy {
    for ($i = 0; $i -lt 120; $i++) {
        $status = (& docker inspect --format '{{.State.Health.Status}}' $PgContainer 2>$null)
        if ($status -eq 'healthy') {
            return $true
        }
        if ($status -eq 'unhealthy') {
            return $false
        }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Get-PostgresContainerState {
    # HRA-F01: Windows PowerShell 5.1 clean-first-run abort fix.
    #
    # Returns 'running' when the EXACT container name exists and is running,
    # and 'absent' when it does not exist (a NORMAL first-run state).
    #
    # Why: probing a missing container with
    #   docker inspect --format '{{.State.Running}}' <name>
    # emits Docker stderr, which Windows PowerShell 5.1 surfaces as a
    # TERMINATING NativeCommandError under $ErrorActionPreference='Stop' —
    # aborting the clean first run before `docker compose up -d postgres`.
    #
    # This probe instead ENUMERATES existing RUNNING containers with an
    # anchored exact-name filter (`^/<name>$`): a successful empty result
    # IS absence, so `docker inspect` is never called for a container that
    # is not known to exist. Similarly named containers (e.g.
    # `linguagraph-postgres-x`) never match the anchored filter.
    #
    # Genuine Docker/daemon/probe failures FAIL CLOSED with an actionable
    # error (thrown, never returned as 'absent'): the narrow try/catch
    # translates the PS 5.1 terminating error, and the $LASTEXITCODE check
    # covers non-throwing shells.
    param([string]$Name)
    $filter = "name=^/$Name`$"
    try {
        $found = @(& docker ps --filter $filter --format '{{.Names}}')
    } catch {
        throw "Failed to probe Docker for container '$Name' ($($_.Exception.Message)). The Docker engine may be unavailable — start Docker Desktop and re-run. (fail closed: never treated as 'container absent')"
    }
    if ($LASTEXITCODE -ne 0) {
        throw "docker ps failed (exit $LASTEXITCODE) while probing for container '$Name'. The Docker engine may be unavailable — start Docker Desktop and re-run. (fail closed: never treated as 'container absent')"
    }
    if ($found.Count -eq 0) {
        return 'absent'
    }
    return 'running'
}

Write-Host 'LinguaGraph verification (M0.7 W8) — proving the repository is green.' -ForegroundColor Green
Write-Host 'Development data is preserved: no downgrade, no reset, no volume deletion.' -ForegroundColor DarkGray
Write-Host ''

# ---------------------------------------------------------------------------
# Prerequisites (same ADR-009 baseline as dev.ps1)
# ---------------------------------------------------------------------------

Write-Step 'Checking prerequisites (Docker, uv, Node 24)...'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail 'Docker is not installed or not on PATH. The verification needs Docker for the PostgreSQL 18 Compose service.'
}
& docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) {
    Fail 'The Docker engine is not running. Start Docker Desktop and wait until the engine is ready, then re-run.'
}
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Fail 'uv is not installed or not on PATH (see https://docs.astral.sh/uv/).'
}
$nodeVersion = (& node --version 2>$null)
if ($nodeVersion -notmatch '^v(\d+)\.') {
    Fail 'Node.js is not installed or not on PATH.'
}
if ([int]$Matches[1] -ne 24) {
    Fail "Node 24 LTS is required (ADR-009) but 'node --version' reports $nodeVersion. Adjust PATH or use a version manager, then re-run."
}

# ---------------------------------------------------------------------------
# PostgreSQL 18 via Docker Compose (reuse an already-running service)
# ---------------------------------------------------------------------------

Write-Step 'Ensuring the PostgreSQL 18 Compose service is running...'

# HRA-F01: absence probe (enumeration with anchored exact-name filter) —
# never `docker inspect` on a possibly-missing container under
# $ErrorActionPreference='Stop' (PS 5.1 terminating NativeCommandError).
$pgState = Get-PostgresContainerState -Name $PgContainer
if ($pgState -eq 'running') {
    Write-Step "Compose container '$PgContainer' is already running — reusing it."
} elseif (Test-PortInUse 5432) {
    Fail 'Port 5432 is occupied by a process the verification cannot safely identify as the LinguaGraph Compose container. Stop the conflicting server and re-run (the wrapper never kills unknown processes).'
} else {
    & docker compose -f $ComposeFile up -d postgres *> $null
    if ($LASTEXITCODE -ne 0) {
        Fail '`docker compose up -d postgres` failed. Check the compose configuration and Docker state.'
    }
}
if (-not (Wait-PostgresHealthy)) {
    Fail "The PostgreSQL 18 container '$PgContainer' did not become healthy within 120 seconds."
}

# .env: initialize ONLY if absent (existing .env stays byte-for-byte untouched).
if (-not (Test-Path $ApiEnvFile)) {
    Write-Step 'No apps/api/.env yet — copying .env.example (non-destructive initial setup).'
    if (-not (Test-Path $ApiEnvExample)) {
        Fail 'apps/api/.env.example is missing — cannot initialize apps/api/.env.'
    }
    Copy-Item -Path $ApiEnvExample -Destination $ApiEnvFile -ErrorAction Stop
} else {
    Write-Step 'apps/api/.env already exists — leaving it untouched.'
}

# ---------------------------------------------------------------------------
# Backend verification
# ---------------------------------------------------------------------------

Invoke-VerifyStep 'backend: uv sync --frozen' $ApiRoot @('uv', 'sync', '--frozen')

# The full pytest suite: unit tests AND real-PostgreSQL integration tests.
# Migration cycles (empty -> head -> base -> head) run inside pytest on
# DISPOSABLE databases only — the normal development database is never a
# destructive-test target (app/db/disposable.py fails closed).
Invoke-VerifyStep 'backend: uv run pytest (unit + real PostgreSQL integration)' $ApiRoot @('uv', 'run', 'pytest', '-q')

Invoke-VerifyStep 'backend: uv run alembic current (expect 0002 (head))' $ApiRoot @('uv', 'run', 'alembic', 'current')
Invoke-VerifyStep 'backend: uv run alembic check (no schema drift)' $ApiRoot @('uv', 'run', 'alembic', 'check')

# ---------------------------------------------------------------------------
# Frontend verification
# ---------------------------------------------------------------------------

# G2-F01: `npm ci` ALWAYS runs. verify.ps1 is reproducible verification
# proof: the exact committed lockfile tree must be installed on every run.
# There is no node_modules-freshness shortcut here (that optimization
# belongs to dev.ps1, a startup convenience launcher — never to a
# verification command), and a skipped dependency-install step is never
# recorded as PASS.
Invoke-VerifyStep 'frontend: npm ci (from the committed lockfile)' $WebRoot @('npm', 'ci')

Invoke-VerifyStep 'frontend: npm run lint' $WebRoot @('npm', 'run', 'lint')
Invoke-VerifyStep 'frontend: npm run typecheck' $WebRoot @('npm', 'run', 'typecheck')
Invoke-VerifyStep 'frontend: npm run test (Vitest/RTL)' $WebRoot @('npm', 'run', 'test')
Invoke-VerifyStep 'frontend: npm run build (production build)' $WebRoot @('npm', 'run', 'build')

# ---------------------------------------------------------------------------
# E2E verification (isolated disposable E2E databases; never development DB)
# ---------------------------------------------------------------------------

Invoke-VerifyStep 'e2e: npx playwright install chromium (no-op when present)' $WebRoot @('npx', 'playwright', 'install', 'chromium')
Invoke-VerifyStep 'e2e: golden path + Unicode release blocker (npx playwright test)' $WebRoot @('npx', 'playwright', 'test', 'e2e/golden-path.spec.ts', 'e2e/unicode.spec.ts')

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

Write-Host ''
Write-Host 'Verification summary:' -ForegroundColor Cyan
$allPass = $true
foreach ($result in $results) {
    $color = if ($result.Result -eq 'PASS') { 'Green' } else { 'Red' }
    if ($result.Result -ne 'PASS') {
        $allPass = $false
    }
    Write-Host ("  [{0}] {1}" -f $result.Result, $result.Step) -ForegroundColor $color
}
Write-Host ''
if ($allPass) {
    Write-Host 'VERIFICATION GREEN — the repository satisfies the M0 release baseline.' -ForegroundColor Green
    exit 0
}
Write-Host 'VERIFICATION FAILED — see the failing step above.' -ForegroundColor Red
exit 1
