"""LinguaGraph API application factory and module-level app instance."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.errors import register_exception_handlers
from app.api.routes.documents import router as documents_router
from app.api.routes.health import router as health_router
from app.api.routes.projects import router as projects_router
from app.api.routes.text_versions import router as text_versions_router
from app.api.routes.workspace import router as workspace_router
from app.core.config import Settings, get_settings

API_V1_PREFIX = "/api/v1"


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the FastAPI application.

    ``settings`` is injectable for tests; defaults to the cached environment
    settings.
    """
    settings = settings or get_settings()

    app = FastAPI(
        title="LinguaGraph API",
        description="Interactive multilingual contrastive linguistics workbench — backend API.",
        version="0.1.0",
    )

    # Development CORS: narrow allow-list configured via CORS_ORIGINS.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)

    app.include_router(health_router, prefix=API_V1_PREFIX)
    app.include_router(projects_router, prefix=API_V1_PREFIX)
    app.include_router(documents_router, prefix=API_V1_PREFIX)
    app.include_router(text_versions_router, prefix=API_V1_PREFIX)
    app.include_router(workspace_router, prefix=API_V1_PREFIX)

    # Last registration: unmatched paths/methods get the standard envelope
    # instead of Starlette's default {"detail": ...} body.
    @app.api_route(
        "/{full_path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        include_in_schema=False,
    )
    async def _not_found(full_path: str) -> None:
        from app.api.errors import DomainError

        raise DomainError(
            "NOT_FOUND", "route not found", {"path": f"/{full_path}"}
        )

    return app


app = create_app()
