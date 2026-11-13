"""FastAPI application entry point."""
from fastapi import FastAPI
from backend.app.api.health import router as health_router
from backend.app.api.tasks import router as tasks_router
from backend.app.api.memory import router as memory_router
from backend.app.config import get_settings

settings = get_settings()
app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="INFINITEGX.7 backend API foundation.",
)
app.include_router(health_router)
app.include_router(tasks_router)
app.include_router(memory_router)
