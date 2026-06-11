import socketio
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.common.exceptions import (
    AgentRunnerException,
    agent_runner_exception_handler,
    http_exception_handler,
)
from src.config import settings
from src.database.client import connect, disconnect
from src.modules.agent_assistant.assistant_router import router as agent_assistant_router
from src.modules.skill_assistant.assistant_router import router as skill_assistant_router
from src.modules.attachments.attachments_router import router as attachments_router
from src.modules.cache.cache_service import CacheService
from src.modules.deep.docker_sandbox import get_sandbox_manager
from src.modules.execution.execution_router import router as execution_router
from src.modules.hitl.hitl_gateway import sio
from src.modules.hitl.hitl_router import router as hitl_router
from src.modules.mcp.mcp_router import router as mcp_router
from src.modules.oauth.oauth_callback_router import router as oauth_callback_router
from src.modules.threads.threads_router import router as threads_router


def create_app() -> socketio.ASGIApp:
    app = FastAPI(
        title="AgentStudio Runner",
        description="에이전트 워크플로우 실행 엔진",
        version="1.0.0",
        docs_url="/api/v1/docs",
        openapi_url="/api/v1/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["*"],
    )

    app.add_exception_handler(AgentRunnerException, agent_runner_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore[arg-type]

    app.include_router(threads_router, prefix="/api/v1")
    app.include_router(hitl_router, prefix="/api/v1")
    app.include_router(execution_router, prefix="/api/v1")
    app.include_router(attachments_router, prefix="/api/v1")
    app.include_router(agent_assistant_router, prefix="/api/v1")
    app.include_router(skill_assistant_router, prefix="/api/v1")
    app.include_router(mcp_router, prefix="/api/v1")
    # OAuth MCP 표준 콜백 — 인증 면제(외부 provider 호출), prefix 없음.
    app.include_router(oauth_callback_router)

    @app.get("/", include_in_schema=False)
    async def root():
        return {"status": "ok", "service": "AgentStudio Runner", "version": "1.0.0"}

    @app.get("/health", include_in_schema=False)
    async def health():
        return {"status": "ok"}

    @app.on_event("startup")
    async def startup():
        await connect()
        await CacheService.initialize()
        await get_sandbox_manager().start()

    @app.on_event("shutdown")
    async def shutdown():
        await get_sandbox_manager().shutdown()
        await disconnect()
        await CacheService.close()

    # Socket.IO 앱을 FastAPI 위에 마운트
    return socketio.ASGIApp(sio, other_asgi_app=app)


app = create_app()

if __name__ == "__main__":
    import os

    import structlog
    logger = structlog.get_logger(__name__)

    tracing_enabled = os.environ.get("LANGCHAIN_TRACING_V2")
    project_name = os.environ.get("LANGCHAIN_PROJECT")
    logger.info("Starting AgentStudio Runner",
                port=settings.PORT,
                host="0.0.0.0",
                langsmith_tracing=tracing_enabled,
                langsmith_project=project_name)

    uvicorn.run(
        app, # 문자열 대신 객체 직접 전달
        host="0.0.0.0",
        port=settings.PORT,
        log_level="info",
        access_log=True,
    )
