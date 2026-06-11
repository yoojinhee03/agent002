"""입출력 가드레일 + PII 감지 — deepagent-sdk guardrails에서 이관"""
import json
import re
from dataclasses import dataclass
from typing import Optional

from src.modules.deep.models import GuardrailsConfig


# ---------------------------------------------------------------------------
# PII 감지
# ---------------------------------------------------------------------------

@dataclass
class PiiMatch:
    type: str
    value: str
    start: int
    end: int


_PII_PATTERNS: dict[str, re.Pattern] = {
    "email": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"),
    "phone_kr": re.compile(r"\b0\d{1,2}-\d{3,4}-\d{4}\b"),
    "phone_us": re.compile(r"\b\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b"),
    "ssn_us": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "rrn_kr": re.compile(r"\b\d{6}-[1-4]\d{6}\b"),
    "credit_card": re.compile(r"\b(?:\d[ -]?){13,16}\b"),
    "ip_address": re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b"),
}


def detect_pii(text: str) -> list[PiiMatch]:
    matches: list[PiiMatch] = []
    for pii_type, pattern in _PII_PATTERNS.items():
        for m in pattern.finditer(text):
            matches.append(PiiMatch(type=pii_type, value=m.group(), start=m.start(), end=m.end()))
    return sorted(matches, key=lambda x: x.start)


def redact_pii(text: str, replacement: str = "[REDACTED]") -> str:
    matches = detect_pii(text)
    if not matches:
        return text
    result = []
    last_end = 0
    for m in matches:
        result.append(text[last_end:m.start])
        result.append(replacement)
        last_end = m.end
    result.append(text[last_end:])
    return "".join(result)


# ---------------------------------------------------------------------------
# 입출력 가드레일
# ---------------------------------------------------------------------------

class InputGuardrail:
    def __init__(self, config: GuardrailsConfig):
        self._config = config

    def check(self, message: str) -> tuple[bool, Optional[str]]:
        """
        Returns:
            (is_allowed, rejection_reason)
        """
        lower = message.lower()
        for topic in self._config.blocked_topics:
            if topic.lower() in lower:
                return (False, f"Message contains blocked topic: '{topic}'")
        return (True, None)


class OutputGuardrail:
    def __init__(self, config: GuardrailsConfig):
        self._config = config
        self._patterns = [re.compile(p) for p in config.output_filters]

    def filter(self, response: str) -> str:
        """정규식 패턴과 매칭되는 내용을 [FILTERED]로 교체."""
        result = response
        for pattern in self._patterns:
            result = pattern.sub("[FILTERED]", result)
        if self._config.pii_detection:
            result = redact_pii(result)
        return result

    def validate_schema(self, response: str) -> tuple[bool, Optional[str]]:
        """JSON Schema 검증 (json_schema_validation=True이고 output_schema가 있을 때)."""
        if not self._config.json_schema_validation or not self._config.output_schema:
            return (True, None)

        try:
            data = json.loads(response)
        except json.JSONDecodeError as e:
            return (False, f"Response is not valid JSON: {e}")

        try:
            import jsonschema
            jsonschema.validate(data, self._config.output_schema)
            return (True, None)
        except jsonschema.ValidationError as e:
            return (False, f"Schema validation failed: {e.message}")
        except ImportError:
            return (True, None)
