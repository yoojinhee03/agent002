from abc import ABC, abstractmethod
from typing import Any, AsyncIterable


class ProviderAdapter(ABC):
    @abstractmethod
    async def complete(self, request: dict[str, Any]) -> dict[str, Any]:
        ...

    @abstractmethod
    async def stream(self, request: dict[str, Any]) -> AsyncIterable[dict[str, Any]]:
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        ...
