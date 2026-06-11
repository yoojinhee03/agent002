"""threads_service._maybe_push_external_reply — 외부 채널(NAVER WORKS 등) 응답 push 검증"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from src.modules.threads.threads_service import (
    _maybe_push_external_reply,
    _parse_thread_metadata,
)


# ---------------------------------------------------------------------------
# _parse_thread_metadata
# ---------------------------------------------------------------------------

def test_parse_metadata_dict_passthrough() -> None:
    out = _parse_thread_metadata({"metadata": {"source": "naver_works", "x": 1}})
    assert out == {"source": "naver_works", "x": 1}


def test_parse_metadata_string_json() -> None:
    out = _parse_thread_metadata({"metadata": '{"source": "naver_works"}'})
    assert out == {"source": "naver_works"}


def test_parse_metadata_invalid_json_returns_empty() -> None:
    out = _parse_thread_metadata({"metadata": "not json"})
    assert out == {}


def test_parse_metadata_none_returns_empty() -> None:
    out = _parse_thread_metadata({"metadata": None})
    assert out == {}


def test_parse_metadata_missing_key_returns_empty() -> None:
    out = _parse_thread_metadata({})
    assert out == {}


# ---------------------------------------------------------------------------
# _maybe_push_external_reply
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_skips_when_reply_text_empty() -> None:
    # httpx 호출이 발생하지 않아야 함
    with patch("src.modules.threads.threads_service.httpx") as mock_httpx:
        await _maybe_push_external_reply({"metadata": {"source": "naver_works"}}, "   ")
    mock_httpx.AsyncClient.assert_not_called()


@pytest.mark.asyncio
async def test_skips_when_source_is_not_naver_works() -> None:
    with patch("src.modules.threads.threads_service.httpx") as mock_httpx:
        await _maybe_push_external_reply(
            {"metadata": {"source": "slack", "botId": "B1", "naverUserId": "U1"}}, "hi"
        )
    mock_httpx.AsyncClient.assert_not_called()


@pytest.mark.asyncio
async def test_skips_when_botid_missing() -> None:
    with patch("src.modules.threads.threads_service.httpx") as mock_httpx:
        await _maybe_push_external_reply(
            {"metadata": {"source": "naver_works", "naverUserId": "U1"}}, "hi"
        )
    mock_httpx.AsyncClient.assert_not_called()


@pytest.mark.asyncio
async def test_skips_when_naver_user_id_missing() -> None:
    with patch("src.modules.threads.threads_service.httpx") as mock_httpx:
        await _maybe_push_external_reply(
            {"metadata": {"source": "naver_works", "botId": "B1"}}, "hi"
        )
    mock_httpx.AsyncClient.assert_not_called()


@pytest.mark.asyncio
async def test_posts_to_reply_endpoint_with_runner_key() -> None:
    """metadata.source=naver_works + botId + naverUserId 모두 있으면
    settings.MANAGEMENT_API_URL/api/internal/naver-works/reply 로 POST."""
    mock_response = MagicMock()
    mock_response.status_code = 200

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    fake_settings = MagicMock()
    fake_settings.MANAGEMENT_API_URL = "http://api.example.com"
    fake_settings.INTERNAL_SERVICE_KEY = "secret-key"

    with (
        patch("src.modules.threads.threads_service.httpx.AsyncClient", return_value=mock_client),
        patch("src.modules.threads.threads_service.settings", fake_settings),
    ):
        await _maybe_push_external_reply(
            {
                "id": "thread-123",
                "metadata": {
                    "source": "naver_works",
                    "botId": "B-1",
                    "naverUserId": "U-1",
                },
            },
            "안녕하세요",
        )

    mock_client.post.assert_awaited_once()
    args, kwargs = mock_client.post.call_args
    assert args[0] == "http://api.example.com/api/internal/naver-works/reply"
    assert kwargs["json"] == {"botId": "B-1", "naverUserId": "U-1", "text": "안녕하세요"}
    assert kwargs["headers"]["X-Runner-Key"] == "secret-key"
    assert kwargs["headers"]["Content-Type"] == "application/json"


@pytest.mark.asyncio
async def test_http_error_does_not_raise() -> None:
    """push 실패는 best-effort — turn 자체에 영향 주지 않아야 함."""
    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_response.text = "server error"

    mock_client = AsyncMock()
    mock_client.post = AsyncMock(return_value=mock_response)
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.modules.threads.threads_service.httpx.AsyncClient", return_value=mock_client):
        # 예외가 새어 나오지 않아야 함
        await _maybe_push_external_reply(
            {
                "id": "t-1",
                "metadata": {"source": "naver_works", "botId": "B", "naverUserId": "U"},
            },
            "응답",
        )


@pytest.mark.asyncio
async def test_network_exception_does_not_raise() -> None:
    """httpx 네트워크 예외도 잡혀야 함."""
    mock_client = AsyncMock()
    mock_client.post = AsyncMock(side_effect=ConnectionError("network down"))
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)

    with patch("src.modules.threads.threads_service.httpx.AsyncClient", return_value=mock_client):
        await _maybe_push_external_reply(
            {
                "id": "t-2",
                "metadata": {"source": "naver_works", "botId": "B", "naverUserId": "U"},
            },
            "응답",
        )
