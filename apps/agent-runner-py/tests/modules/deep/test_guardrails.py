"""deep/guardrails.py 단위 테스트"""
import pytest

from src.modules.deep.guardrails import (
    InputGuardrail,
    OutputGuardrail,
    detect_pii,
    redact_pii,
)
from src.modules.deep.models import GuardrailsConfig


class TestInputGuardrail:
    def test_blocks_banned_topic(self):
        config = GuardrailsConfig(blocked_topics=["violence", "hacking"])
        guard = InputGuardrail(config)
        allowed, reason = guard.check("How to do hacking into systems?")
        assert allowed is False
        assert "hacking" in reason

    def test_allows_clean_message(self):
        config = GuardrailsConfig(blocked_topics=["violence"])
        guard = InputGuardrail(config)
        allowed, reason = guard.check("Tell me about Python programming.")
        assert allowed is True
        assert reason is None

    def test_case_insensitive_topic_check(self):
        config = GuardrailsConfig(blocked_topics=["Violence"])
        guard = InputGuardrail(config)
        allowed, _ = guard.check("This message contains violence.")
        assert allowed is False

    def test_empty_blocked_topics_allows_all(self):
        config = GuardrailsConfig(blocked_topics=[])
        guard = InputGuardrail(config)
        allowed, reason = guard.check("Anything goes here")
        assert allowed is True


class TestOutputGuardrail:
    def test_filters_regex_pattern(self):
        config = GuardrailsConfig(output_filters=[r"\b\d{4}-\d{4}-\d{4}-\d{4}\b"])
        guard = OutputGuardrail(config)
        result = guard.filter("Card number: 1234-5678-9012-3456 is invalid")
        assert "1234-5678-9012-3456" not in result
        assert "[FILTERED]" in result

    def test_no_filter_when_no_patterns(self):
        config = GuardrailsConfig(output_filters=[])
        guard = OutputGuardrail(config)
        original = "This text should remain unchanged."
        assert guard.filter(original) == original

    def test_pii_redaction_in_output(self):
        config = GuardrailsConfig(pii_detection=True)
        guard = OutputGuardrail(config)
        result = guard.filter("Contact: user@example.com for details")
        assert "user@example.com" not in result
        assert "[REDACTED]" in result

    def test_schema_validation_skipped_when_disabled(self):
        config = GuardrailsConfig(json_schema_validation=False)
        guard = OutputGuardrail(config)
        valid, reason = guard.validate_schema("not json at all")
        assert valid is True
        assert reason is None


class TestPiiDetection:
    def test_detects_email(self):
        matches = detect_pii("Send mail to admin@example.com please")
        assert any(m.type == "email" for m in matches)

    def test_detects_korean_phone(self):
        matches = detect_pii("전화번호: 010-1234-5678")
        assert any(m.type == "phone_kr" for m in matches)

    def test_detects_korean_rrn(self):
        matches = detect_pii("주민번호: 900101-1234567")
        assert any(m.type == "rrn_kr" for m in matches)

    def test_redact_replaces_pii(self):
        result = redact_pii("Email: test@test.com and phone: 010-0000-0000")
        assert "test@test.com" not in result
        assert "010-0000-0000" not in result
        assert result.count("[REDACTED]") == 2

    def test_no_pii_returns_original(self):
        text = "Hello, this is a clean message."
        assert redact_pii(text) == text
