from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class AgentRunnerException(Exception):
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


async def agent_runner_exception_handler(request: Request, exc: AgentRunnerException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.message, "statusCode": exc.status_code},
    )


async def http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"message": exc.detail, "statusCode": exc.status_code},
    )
