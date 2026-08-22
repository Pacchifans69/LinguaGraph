# dev.ps1 — LinguaGraph safe one-command local launcher (M0.7 W7).
#
# From the repository root, start a usable local LinguaGraph instance:
#
#   PowerShell 7+ :  .\scripts\dev.ps1
#   Windows PS 5.1:  powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
#
# Preserved architecture (ADR-009 / M0.7 W7):
#
#   Docker Compose -> PostgreSQL 18 only
#   uv             -> FastAPI locally (apps/api)
#   Node/Vite      -> frontend locally (apps/web)
#
# The backend and frontend are NEVER Dockerized.
#
# Orchestration:
#
#   prerequisite checks
#     -> Docker available
#     -> Docker engine available
#     -> uv available
#     -> Node major version == 24 (ADR-009)
#   -> start the existing PostgreSQL Compose service (reuse if running)
#   -> wait for healthy PostgreSQL
#   -> initialize apps/api/.env ONLY IF it does not already exist
#      (copy of .env.example, never overwritten)
#   -> ensure backend dependencies are available WITHOUT rewriting lockfiles
#      (uv sync --frozen)
#   -> ensure frontend dependencies are available WITHOUT rewriting lockfiles
#      (npm ci only when node_modules is missing/stale)
#   -> safe forward `alembic upgrade head` (never a downgrade)
#   -> start the FastAPI development server (uvicorn, port 8000)
#   -> start the Vite development server (port 5173, --strictPort)
#   -> verify API health
#   -> print http://localhost:5173
#
# NON-DESTRUCTIVE HARD RULES (enforced, never relaxed):
#
#   - never runs: docker compose down -v / docker volume rm /
#     docker system prune / DROP DATABASE / destructive DB reset /
#     database downgrade / .env overwrite / PostgreSQL volume deletion;
#   - an existing apps/api/.env is left byte-for-byte untouched;
#   - if port 5432, 8000 or 5173 is occupied in a way the launcher cannot
#     safely identify/reuse, the script FAILS with actionable output and
#     never kills the unknown process;
#   - the launcher stops ONLY the FastAPI/Vite processes it started itself
#     (from the FIRST Start-Process onward every control-flow path — startup
#     failure, early process exit, health timeout, Ctrl+C — runs the same
#     finally cleanup of its own process trees; G2-F03);
#   - repeated invocation is safe and idempotent with respect to persisted
#     data (running the Compose service again is a no-op, migrations only
#     move forward, .env is never overwritten).
#
# Optional: `.\scripts\dev.ps1 -OpenBrowser` opens http://localhost:5173.

[CmdletBinding()]
param(
    [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $PSScriptRoot
$ApiRoot = Join-Path $Root 'apps\api'
$WebRoot = Join-Path $Root 'apps\web'
$ComposeFile = Join-Path $Root 'compose.yml'
$ApiEnvFile = Join-Path $ApiRoot '.env'
$ApiEnvExample = Join-Path $ApiRoot '.env.example'
$PgContainer = 'linguagraph-postgres'
$ApiHealthUrl = 'http://127.0.0.1:8000/api/v1/health'
$FrontendUrl = 'http://localhost:5173'

$apiProc = $null
$viteProc = $null

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Fail {
    param([string]$Message)
    Write-Host "ERROR: $Message" -ForegroundColor Red
    Write-Host "LinguaGraph was NOT started." -ForegroundColor Red
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

function Test-PortInUse {
    param([int]$Port)
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $listener)
}

function Get-PortOwnerDescription {
    param([int]$Port)
    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($null -eq $listener) {
        return 'unknown process'
    }
    try {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
        return "$($process.ProcessName) (PID $($process.Id))"
    } catch {
        return "PID $($listener.OwningProcess)"
    }
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

function Stop-ChildProcessTree {
    param([System.Diagnostics.Process]$Process)
    # G2-F03: stops ONLY a process tree this launcher created itself (via
    # Start-Process -PassThru). taskkill /T /F affects that process and its
    # descendants — never unknown/foreign processes, never port owners the
    # launcher did not start, never PostgreSQL containers/volumes/data.
    if ($null -eq $Process) {
        return
    }
    try {
        if ($Process.HasExited) {
            return
        }
        # HRA-F02: through the native boundary (stderr discarded — a
        # already-gone process legitimately writes stderr and must not
        # abort cleanup). The outer catch stays as belt-and-braces.
        Invoke-Native 'taskkill' @('/PID', "$($Process.Id)", '/T', '/F') -RedirectStandardErrorToNull | Out-Null
    } catch {
        # The process is already gone or no longer inspectable — nothing
        # to stop.
    }
}

# ---------------------------------------------------------------------------
# Prerequisite checks (ADR-009 baseline)
# ---------------------------------------------------------------------------

Write-Step 'Checking prerequisites (Docker, uv, Node 24)...'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fail 'Docker is not installed or not on PATH. Install Docker Desktop and re-run. (The launcher needs Docker only for the PostgreSQL 18 service.)'
}

# HRA-F02: all native invocations go through Invoke-Native — the native
# exit code is authoritative; stderr from a successful command (e.g. docker
# config warnings) never aborts the script.
Invoke-Native 'docker' @('info', '--format', '{{.ServerVersion}}') -RedirectStandardErrorToNull | Out-Null
if ($LASTEXITCODE -ne 0) {
    Fail 'The Docker engine is not running (or the Docker daemon is unreachable). Start Docker Desktop and wait until the engine is ready, then re-run.'
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Fail 'uv is not installed or not on PATH (see https://docs.astral.sh/uv/). ADR-009 requires uv for the Python environment.'
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
    Fail 'Node.js is not installed or not on PATH. ADR-009 requires Node 24 LTS.'
}
$nodeMajorVersion = [int]$nodeVersionMatch.Groups[1].Value
if ($nodeMajorVersion -ne 24) {
    Fail "Node 24 LTS is required (ADR-009) but 'node --version' reports $nodeVersion. Adjust PATH or use a version manager (nvm/fnm) so Node 24 is active, then re-run."
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
    Write-Step "Compose container '$PgContainer' is already running — reusing it (idempotent, no data touched)."
} elseif (Test-PortInUse 5432) {
    Fail "Port 5432 is already occupied by $(Get-PortOwnerDescription 5432). The launcher never kills processes it did not start. Stop the conflicting PostgreSQL/native server (or conflicting container), then re-run."
} else {
    # HRA-F02: compose up progress (image pulls) is written to stderr and is
    # user-facing — merged into the visible output; the exit code is the
    # authoritative success signal.
    Invoke-Native 'docker' @('compose', '-f', $ComposeFile, 'up', '-d', 'postgres') -MergeStandardError
    if ($LASTEXITCODE -ne 0) {
        Fail '`docker compose up -d postgres` failed. Check the compose configuration and Docker state (see output above), then re-run.'
    }
}

if (-not (Wait-PostgresHealthy)) {
    Fail "The PostgreSQL 18 container '$PgContainer' did not become healthy within 120 seconds. Inspect it with `docker inspect $PgContainer` (the launcher never deletes volumes or containers)."
}

# ---------------------------------------------------------------------------
# apps/api/.env — initialize ONLY if absent; existing .env stays untouched
# ---------------------------------------------------------------------------

if (-not (Test-Path $ApiEnvFile)) {
    Write-Step "No apps/api/.env yet — copying .env.example (non-destructive initial setup)."
    if (-not (Test-Path $ApiEnvExample)) {
        Fail 'apps/api/.env.example is missing — cannot initialize apps/api/.env.'
    }
    Copy-Item -Path $ApiEnvExample -Destination $ApiEnvFile -ErrorAction Stop
} else {
    Write-Step 'apps/api/.env already exists — leaving it byte-for-byte untouched.'
}

# ---------------------------------------------------------------------------
# Dependencies (never rewrite committed lockfiles)
# ---------------------------------------------------------------------------

Write-Step 'Synchronizing backend dependencies (uv sync --frozen, lockfile never rewritten)...'
Push-Location $ApiRoot
try {
    Invoke-Native 'uv' @('sync', '--frozen') -MergeStandardError
    if ($LASTEXITCODE -ne 0) {
        Fail '`uv sync --frozen` failed. Run it manually in apps/api to see the full error, then re-run the launcher.'
    }
} finally {
    Pop-Location
}

$needNpmCi = $true
$lockFile = Join-Path $WebRoot 'package-lock.json'
$modulesDir = Join-Path $WebRoot 'node_modules'
if ((Test-Path $modulesDir) -and (Test-Path $lockFile)) {
    $lockTime = (Get-Item $lockFile).LastWriteTime
    $modulesTime = (Get-Item $modulesDir).LastWriteTime
    if ($modulesTime -ge $lockTime) {
        $needNpmCi = $false
    }
}
if ($needNpmCi) {
    Write-Step 'Installing frontend dependencies (npm ci from the committed lockfile, which is never rewritten)...'
    Push-Location $WebRoot
    try {
        Invoke-Native 'npm' @('ci') -MergeStandardError
        if ($LASTEXITCODE -ne 0) {
            Fail '`npm ci` failed. Run it manually in apps/web to see the full error, then re-run the launcher.'
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Step 'Frontend dependencies already present (node_modules is newer than package-lock.json) — skipping npm ci.'
}

# ---------------------------------------------------------------------------
# Safe forward migration (never a downgrade)
# ---------------------------------------------------------------------------

Write-Step 'Applying forward migrations (alembic upgrade head — forward only, never destructive)...'
Push-Location $ApiRoot
try {
    Invoke-Native 'uv' @('run', 'alembic', 'upgrade', 'head') -MergeStandardError
    if ($LASTEXITCODE -ne 0) {
        Fail '`alembic upgrade head` failed. Inspect the migration state (the launcher never downgrades or resets the database), then re-run.'
    }
} finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# Port conflicts fail closed (never kill unknown processes)
# ---------------------------------------------------------------------------

foreach ($check in @(@{ Port = 8000; What = 'the FastAPI development server' }, @{ Port = 5173; What = 'the Vite development server' })) {
    if (Test-PortInUse $check.Port) {
        Fail "Port $($check.Port) is already occupied by $(Get-PortOwnerDescription $check.Port) — $($check.What) cannot start. An earlier LinguaGraph instance may still be running. Stop that process (the launcher never kills processes it did not start), then re-run."
    }
}

# ---------------------------------------------------------------------------
# Start FastAPI + Vite (the only processes this script may manage)
#
# G2-F03: from the FIRST Start-Process onward, ALL control flow lives
# inside the try below — startup failures (a failed Start-Process, an early
# process exit, a health-check timeout, an unexpected exception) and the
# normal Ctrl+C shutdown all run the finally cleanup, which stops only the
# processes this launcher started. On a startup failure the script exits
# non-zero AFTER cleanup (Fail -> exit 1; the finally runs first).
# ---------------------------------------------------------------------------

try {
    Write-Step 'Starting the FastAPI development server (uvicorn, port 8000)...'
    $apiLogOut = Join-Path $env:TEMP 'linguagraph-api.out.log'
    $apiLogErr = Join-Path $env:TEMP 'linguagraph-api.err.log'
    $apiProc = Start-Process -FilePath 'uv' `
        -ArgumentList @('run', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8000') `
        -WorkingDirectory $ApiRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $apiLogOut `
        -RedirectStandardError $apiLogErr `
        -PassThru

    Write-Step 'Starting the Vite development server (port 5173, --strictPort)...'
    $viteLogOut = Join-Path $env:TEMP 'linguagraph-web.out.log'
    $viteLogErr = Join-Path $env:TEMP 'linguagraph-web.err.log'
    $viteProc = Start-Process -FilePath 'npm.cmd' `
        -ArgumentList @('run', 'dev', '--', '--port', '5173', '--host', '127.0.0.1', '--strictPort') `
        -WorkingDirectory $WebRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput $viteLogOut `
        -RedirectStandardError $viteLogErr `
        -PassThru

    # ------------------------------------------------------------------
    # Verify API health
    # ------------------------------------------------------------------

    Write-Step 'Waiting for the API health endpoint...'
    $healthy = $false
    for ($i = 0; $i -lt 60; $i++) {
        if ($apiProc.HasExited) {
            Fail "The FastAPI process exited early (code $($apiProc.ExitCode)). See $apiLogErr"
        }
        if ($viteProc.HasExited) {
            Fail "The Vite process exited early (code $($viteProc.ExitCode)) — the port may be occupied or the build failed. See $viteLogErr"
        }
        try {
            $response = Invoke-WebRequest -Uri $ApiHealthUrl -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                $healthy = $true
                break
            }
        } catch {
            # not up yet — keep waiting
        }
        Start-Sleep -Seconds 1
    }

    if (-not $healthy) {
        Fail "The API did not become healthy at $ApiHealthUrl within 60 seconds. See $apiLogErr and $viteLogErr"
    }

    Write-Host ''
    Write-Host 'LinguaGraph is running:' -ForegroundColor Green
    Write-Host "  Frontend : $FrontendUrl" -ForegroundColor Green
    Write-Host "  API      : $ApiHealthUrl" -ForegroundColor Green
    Write-Host '  API docs : http://localhost:8000/docs' -ForegroundColor Green
    Write-Host '  Logs     : ' -NoNewline
    Write-Host "$apiLogErr / $viteLogErr" -ForegroundColor DarkGray

    if ($OpenBrowser) {
        Start-Process $FrontendUrl
    }

    Write-Host ''
    Write-Host 'Press Ctrl+C to stop LinguaGraph (stops only the FastAPI and Vite processes started by this launcher).' -ForegroundColor Yellow

    # Normal run: wait until Ctrl+C (the finally below then stops only the
    # self-started FastAPI/Vite process trees).
    while ($true) {
        Start-Sleep -Seconds 3600
    }
} catch {
    # Any unexpected startup/runtime failure: report and exit non-zero.
    # Cleanup of self-started children runs in the finally below BEFORE
    # the process exits. (Ctrl+C is not routed through catch; it is handled
    # by the finally alone, preserving normal shutdown semantics.)
    Fail "LinguaGraph startup failed: $($_.Exception.Message)"
} finally {
    # Stop ONLY the processes this launcher started (tree kill: the uv/npm
    # wrappers and their children). Persisted data is never touched.
    Stop-ChildProcessTree $viteProc
    Stop-ChildProcessTree $apiProc
    Write-Host ''
    Write-Host 'Launcher cleanup complete: stopped only the FastAPI/Vite processes started by this launcher. PostgreSQL container and all data are untouched.' -ForegroundColor Yellow
}
