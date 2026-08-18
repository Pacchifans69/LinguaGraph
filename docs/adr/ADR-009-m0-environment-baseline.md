# ADR-009: M0 environment baseline

## Status  
Accepted

> Execution note: this ADR fixes the baseline; the actual `git init` and baseline commit are deferred until M0.1 implementation begins. The current errata closure does not initialize Git.

## Context  
The frozen baseline for M0 specifies Python 3.13.x, Node 24 LTS, `uv` as the Python package manager, and PostgreSQL 18.  
Initial repository reconnaissance revealed some mismatches between the baseline and the immediate development environment (e.g., Python 3.12.3 present, Node 22 on `PATH` before Node 24, `uv` missing, Docker/PostgreSQL unavailable).  
These are environment provisioning issues, not architectural blockers, and must be resolved with clear, reproducible decisions.

## Decision  
All M0 development, testing, and CI environments will adhere to the following baseline. No deviations are permitted; any environment that does not satisfy the baseline must be provisioned accordingly.

| Component | Version / Tool | Provisioning / Notes |
|-----------|---------------|----------------------|
| **Python** | 3.13.x | `uv python install 3.13` and `uv python pin 3.13` to enforce the version. The presence of Python 3.12 on a system does not change the baseline. |
| **Python manager** | `uv` | Installed via the official installer (`curl -LsSf https://astral.sh/uv/install.sh | sh`) or via package managers. Used for all virtual environment and dependency management. |
| **Node.js** | 24 LTS (e.g., 24.19.0) | The system must provide Node 24; if multiple versions exist, adjust `PATH` or use `nvm`/`fnm` to ensure Node 24 is used. Node 22 is not acceptable. |
| **PostgreSQL** | 18 | Local development: **prefer** Docker Compose to run a PostgreSQL 18 container. If Docker is unavailable, install native PostgreSQL 18 and configure `DATABASE_URL` accordingly. |
| **CI database** | PostgreSQL 18 | GitHub Actions runners will use a PostgreSQL service container (official Docker image) for integration tests. No external database required. |
| **Git** | Initialized | The repository must be a Git repository from the start. Initialize with `git init` and commit the initial baseline. |
| **Remote** | GitHub | A remote repository on GitHub must be established and linked. All collaboration and CI will be based on this remote. |

All setup commands and environment checks must be documented in the project README (or a dedicated `DEVELOPMENT.md`) so that every contributor can reproduce the environment exactly. The decision to keep Python 3.13 as the baseline is reinforced by `uv`'s ability to download and manage multiple Python versions; no system‑wide upgrade is required, only a local `uv`‑managed installation.

## Alternatives Considered  
- **Accept Python 3.12.3 as a documented deviation**: Rejected. `uv` easily provides Python 3.13, and silently lowering the baseline introduces unnecessary fragmentation across team members and CI.  
- **Use Node 22.22.3 because it is earlier on `PATH`**: Rejected. Node 24 LTS is the project baseline; the PATH issue is trivial to fix (adjust PATH or use a version manager).  
- **Skip PostgreSQL integration tests in CI**: Rejected. The specification explicitly requires real PostgreSQL for integration tests; the GitHub Actions service container approach is standard and well‑supported.  
- **Avoid Docker and rely solely on native PostgreSQL**: Rejected for local development. Docker Compose offers faster setup, isolation, and easier version switching; native PostgreSQL remains a fallback for environments where Docker is not feasible.

## Consequences  
- Every developer must ensure their environment meets the baseline before running the project. Automated checks (e.g., a `make check-env` or `./scripts/verify_env.sh`) should be added to validate tool versions early.  
- The README must clearly describe how to install `uv`, set up Python 3.13, switch to Node 24, and start PostgreSQL via Docker Compose (or native).  
- CI will be reliable and repeatable because it uses the same PostgreSQL version and service container approach as local Docker setups.  
- The Git and GitHub decisions are foundational; the repository must be version‑controlled and linked to a remote from day one to enable collaboration and automated workflows.  
- No further environment debates are required for M0; these decisions are frozen and will only be revisited for future milestones.
