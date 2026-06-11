"""LLM 모델별 단가 테이블 — input/output 토큰당 USD 가격 (per 1M tokens 기준).

deepagent_bridge 가 turn 종료 시 input/output 토큰 수에 단가를 곱해 비용을 산출.
가격이 알려지지 않은 모델은 0.0 을 반환해 대시보드에 0 으로 표시한다.
"""
from __future__ import annotations

# per 1M tokens (USD)
_PRICE_TABLE: dict[str, tuple[float, float]] = {
    # OpenAI
    "gpt-4o": (2.50, 10.00),
    "gpt-4o-2024-08-06": (2.50, 10.00),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o-mini-2024-07-18": (0.15, 0.60),
    "gpt-4.1": (2.00, 8.00),
    "gpt-4.1-mini": (0.40, 1.60),
    "gpt-4.1-nano": (0.10, 0.40),
    "gpt-5": (5.00, 15.00),
    "gpt-5-nano": (0.50, 2.00),
    "o1": (15.00, 60.00),
    "o1-mini": (3.00, 12.00),
    # Anthropic
    "claude-sonnet-4-5": (3.00, 15.00),
    "claude-sonnet-4-5-20250929": (3.00, 15.00),
    "claude-sonnet-4-6": (3.00, 15.00),
    "claude-opus-4-6": (15.00, 75.00),
    "claude-opus-4-7": (15.00, 75.00),
    "claude-haiku-4-5": (1.00, 5.00),
    "claude-haiku-4-5-20251001": (1.00, 5.00),
    # Google
    "gemini-2.0-flash": (0.10, 0.40),
    "gemini-2.5-pro": (1.25, 5.00),
    "gemini-2.5-flash": (0.30, 2.50),
}


def estimate_cost(model_id: str, input_tokens: int, output_tokens: int) -> float:
    """모델 ID + 토큰 수 → USD 비용 (소수점 포함). 알 수 없는 모델은 0.0.

    static 가격표 기반. DB에 등록된 사용자 정의 모델 가격을 함께 적용하려면
    `estimate_cost_db()` 비동기 버전을 사용한다.
    """
    if not model_id or (input_tokens <= 0 and output_tokens <= 0):
        return 0.0
    normalized = model_id.split(":", 1)[-1].strip()
    price = _PRICE_TABLE.get(normalized)
    if price is None:
        return 0.0
    in_price, out_price = price
    return round(
        (input_tokens / 1_000_000.0) * in_price
        + (output_tokens / 1_000_000.0) * out_price,
        6,
    )


async def estimate_cost_db(model_id: str, input_tokens: int, output_tokens: int) -> float:
    """DB `models` 테이블의 input_price/output_price (per 1M tokens) 우선 적용.

    DB 조회 실패 또는 가격 미등록(0) 시 static `_PRICE_TABLE` 로 fallback.
    """
    if not model_id or (input_tokens <= 0 and output_tokens <= 0):
        return 0.0
    normalized = model_id.split(":", 1)[-1].strip()

    from src.database.client import fetch_one

    try:
        row = await fetch_one(
            """
            SELECT input_price, output_price
            FROM models
            WHERE model_id = $1 OR id::text = $2
            LIMIT 1
            """,
            (normalized, normalized),
        )
    except Exception:  # noqa: BLE001
        row = None

    if row:
        in_price = float(row.get("input_price") or 0.0)
        out_price = float(row.get("output_price") or 0.0)
        if in_price > 0.0 or out_price > 0.0:
            return round(
                (input_tokens / 1_000_000.0) * in_price
                + (output_tokens / 1_000_000.0) * out_price,
                6,
            )

    return estimate_cost(normalized, input_tokens, output_tokens)
