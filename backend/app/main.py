"""FastAPI application factory + health endpoint."""

from __future__ import annotations

import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config, db
from .errors import register_error_handlers
from .routers import alerts, analytics, auth, keys, models, quota, rbac, settings, traffic, users

STARTED_AT = time.time()


def create_app(db_path: str | Path | None = None) -> FastAPI:
    app = FastAPI(
        title="LLM 推理 Token 流量管理系统",
        description="Token 流量治理：鉴权、配额、限流、计量、分析与告警",
        version=config.app_version(),
    )
    app.state.db_path = str(db_path or config.db_path())
    app.state.started_at = STARTED_AT

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[
            "X-Request-Id",
            "X-RateLimit-Limit",
            "X-RateLimit-Remaining",
            "X-RateLimit-Reset",
            "X-Quota-Limit",
            "X-Quota-Remaining",
            "Retry-After",
        ],
    )
    register_error_handlers(app)

    db.init_db(app.state.db_path)

    @app.get("/health", tags=["system"])
    def health(request: Request) -> dict:
        conn = db.connect(request.app.state.db_path)
        try:
            conn.execute("SELECT 1").fetchone()
            db_status = "ok"
        except Exception:  # pragma: no cover - defensive
            db_status = "error"
        finally:
            conn.close()
        return {
            "status": "ok" if db_status == "ok" else "degraded",
            "database": db_status,
            "version": config.app_version(),
            "uptimeSeconds": int(time.time() - request.app.state.started_at),
            "startedAt": time.strftime(
                "%Y-%m-%d %H:%M:%S", time.localtime(request.app.state.started_at)
            ),
        }

    app.include_router(auth.router, prefix="/api")
    app.include_router(users.router, prefix="/api")
    app.include_router(rbac.router, prefix="/api")
    app.include_router(models.router, prefix="/api")
    app.include_router(keys.router, prefix="/api")
    app.include_router(quota.router, prefix="/api")
    app.include_router(settings.router, prefix="/api")
    app.include_router(traffic.router, prefix="/api")
    app.include_router(traffic.gateway_router)
    app.include_router(analytics.router, prefix="/api")
    app.include_router(alerts.router, prefix="/api")

    _mount_frontend(app)
    return app


def _mount_frontend(app: FastAPI) -> None:
    """Serve the built console (dist/) when it exists, so one process can host
    the whole system in production. Vite dev server is used during dev."""
    dist = config.BACKEND_DIR.parent / "dist"
    if not dist.is_dir():
        return
    assets = dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")

    @app.get("/", include_in_schema=False)
    def _index() -> FileResponse:
        return FileResponse(dist / "index.html")

    @app.get("/users.html", include_in_schema=False)
    def _legacy_users() -> FileResponse:
        return FileResponse(dist / "index.html")


app = create_app()
