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

function Invoke-Native {
    # HRA-F02: native-command execution boundary for Windows PowerShell 5.1.
    #
    # Contract:
    #   - FilePath / ArgumentList: the executable (resolved via PATH, checked
    #     to exist) and its argument list (no shell quoting needed).
    #   - stdout: flows to the caller — ASSIGN the call result to capture
    #     stdout (parseable, never contaminated by stderr), or let it stream
    #     to the console for user-facing commands.
    #   - stderr: NEVER treated as failure on its own. With
    #     -RedirectStandardErrorToNull stderr is discarded (parsed-stdout
    #     probes); with -MergeStandardError stderr is merged into the visible
    #     output (user-facing commands ONLY — never for parsed stdout); with
    #     neither, stderr streams to the console.
    #   - exit code: the native process EXIT CODE is the authoritative
    #     success/failure signal and is returned via $LASTEXITCODE.
    #   - $ErrorActionPreference: the global value ('Stop') is KEPT; it is
    #     lowered ONLY for the duration of this native invocation and its
    #     exact prior value is restored in finally, so PowerShell/.NET
    #     errors elsewhere remain governed by $ErrorActionPreference='Stop'.
    #
    # Why: Windows PowerShell 5.1 converts native stderr into error records;
    # with $ErrorActionPreference='Stop' even a SUCCESSFUL command that
    # writes stderr (e.g. `docker compose up` pull progress, npm warnings)
    # aborts the script with a terminating NativeCommandError. stderr output
    # is NOT failure; the exit code is.
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [switch]$RedirectStandardErrorToNull,
        [switch]$MergeStandardError
    )
    if ($RedirectStandardErrorToNull -and $MergeStandardError) {
        throw 'Invoke-Native: -RedirectStandardErrorToNull and -MergeStandardError are mutually exclusive'
    }
    # Resolve the executable up front: a missing executable must fail
    # loudly (never be judged by a stale $LASTEXITCODE).
    # -First 1: PATH may list the same executable more than once; the
    # native call below needs ONE resolved path.
    $resolved = Get-Command -Name $FilePath -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($RedirectStandardErrorToNull) {
            & $resolved.Source @ArgumentList 2>$null
        } elseif ($MergeStandardError) {
            # HRA-F03: normalize every merged record to PLAIN TEXT. Windows
            # PowerShell 5.1 renders native stderr as ErrorRecord objects;
            # when they reach the host they display as NativeCommandError
            # diagnostics (CategoryInfo / FullyQualifiedErrorId blocks) even
            # though the command succeeded. .ToString() yields the raw line,
            # so successful stderr (e.g. 'npm warn deprecated ...', alembic
            # INFO) displays as an ordinary text line while the exit code
            # stays the authoritative success signal. Genuine diagnostics
            # remain visible — nothing is suppressed. Parsed-stdout mode
            # (-RedirectStandardErrorToNull) is deliberately NOT affected.
            & $resolved.Source @ArgumentList 2>&1 |
                ForEach-Object { $_.ToString() }
        } else {
            & $resolved.Source @ArgumentList
        }
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
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
        # HRA-F02: every verification command runs through the native
        # boundary — stderr from a successful command (npm warnings, pytest
        # notices, npx output) never aborts verification; the EXIT CODE is
        # the authoritative signal checked below. stdout/stderr stream to
        # the console (user-facing verification output).
        Invoke-Native $Arguments[0] @($Arguments | Select-Object -Skip 1) -MergeStandardError
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
        # HRA-F02: through the native boundary — transient inspect stderr
        # must never abort the poll; stdout is the only parsed signal.
        $status = (Invoke-Native 'docker' @('inspect', '--format', '{{.State.Health.Status}}', $PgContainer) -RedirectStandardErrorToNull)
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
    # error (thrown, never returned as 'absent'): the probe runs through
    # the HRA-F02 Invoke-Native boundary (stderr discarded, stdout parsed,
    # exit code authoritative) and the $LASTEXITCODE check below is the
    # fail-closed guard.
    param([string]$Name)
    $filter = "name=^/$Name`$"
    $found = @(Invoke-Native 'docker' @('ps', '--filter', $filter, '--format', '{{.Names}}') -RedirectStandardErrorToNull)
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
# HRA-F02: all native invocations go through Invoke-Native — the native
# exit code is authoritative; stderr from a successful command (e.g. docker
# config warnings) never aborts the script.
Invoke-Native 'docker' @('info', '--format', '{{.ServerVersion}}') -RedirectStandardErrorToNull | Out-Null
if ($LASTEXITCODE -ne 0) {
    Fail 'The Docker engine is not running. Start Docker Desktop and wait until the engine is ready, then re-run.'
}
if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Fail 'uv is not installed or not on PATH (see https://docs.astral.sh/uv/).'
}
# stdout-only capture through the boundary: stderr never contaminates the
# parsed node version.
# HRA-F06: parse with an explicit [regex]::Match object — the automatic
# regex match-state variable is NOT guaranteed to be populated after a
# comparison expression under Set-StrictMode -Version Latest in a fresh
# Windows PowerShell 5.1 process (VariableIsUndefined), which aborted the
# script on the valid-version path.
$nodeVersion = (Invoke-Native 'node' @('--version') -RedirectStandardErrorToNull)
$nodeVersionMatch = [regex]::Match([string]$nodeVersion, '^v(\d+)\.')
if (-not $nodeVersionMatch.Success) {
    Fail 'Node.js is not installed or not on PATH.'
}
$nodeMajorVersion = [int]$nodeVersionMatch.Groups[1].Value
if ($nodeMajorVersion -ne 24) {
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
    # HRA-F02: compose up progress (image pulls) is written to stderr and is
    # user-facing — merged into the visible output; the exit code is the
    # authoritative success signal.
    Invoke-Native 'docker' @('compose', '-f', $ComposeFile, 'up', '-d', 'postgres') -MergeStandardError
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
