from fastapi import Depends, Header, HTTPException
from src.modules.auth.api_key import verify_api_key


async def require_api_key(x_api_key: str | None = Header(default=None, alias="X-API-Key")):
    if x_api_key is None:
        raise HTTPException(status_code=401, detail="X-API-Key header is required")
    api_key = await verify_api_key(x_api_key)
    return api_key
