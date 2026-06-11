"""deepagent_bridge._requester_header — 외부 채널(NAVER WORKS 등) 요청자 컨텍스트 주입 검증"""
import pytest

from src.modules.agents.deepagent_bridge import _requester_header


def test_returns_empty_when_metadata_is_none() -> None:
    assert _requester_header(None) == ""


def test_returns_empty_when_metadata_empty() -> None:
    assert _requester_header({}) == ""


def test_returns_empty_when_no_requester_key() -> None:
    assert _requester_header({"source": "naver_works"}) == ""


def test_returns_empty_when_requester_has_no_identity_fields() -> None:
    # requester 안에 의미있는 식별자가 하나도 없으면 헤더 추가 안 함
    assert _requester_header({"requester": {}}) == ""


def test_returns_full_header_when_all_fields_present() -> None:
    md = {
        "source": "naver_works",
        "requester": {
            "name": "홍길동",
            "email": "hong@example.com",
            "naverUserId": "U-12345",
        },
    }
    out = _requester_header(md)
    assert out.startswith("## 요청자 정보")
    assert "- 이름: 홍길동" in out
    assert "- 이메일: hong@example.com" in out
    assert "- NAVER WORKS userId: U-12345" in out
    assert "이 사용자의 ID로 실행" in out
    assert out.endswith("\n\n")


def test_only_naver_user_id_fallback_from_top_level_metadata() -> None:
    # requester 가 비어 있어도 top-level metadata.naverUserId 가 있으면 헤더 추가
    md = {"requester": {}, "naverUserId": "U-9999"}
    out = _requester_header(md)
    assert "- NAVER WORKS userId: U-9999" in out


def test_partial_identity_uses_only_provided_fields() -> None:
    md = {"requester": {"name": "Alice"}}
    out = _requester_header(md)
    assert "- 이름: Alice" in out
    assert "- 이메일" not in out
    assert "- NAVER WORKS userId" not in out


def test_non_dict_requester_is_ignored() -> None:
    assert _requester_header({"requester": "Alice"}) == ""


def test_non_dict_metadata_is_ignored() -> None:
    # type-hint 상 dict 만 받지만, 런타임에서 잘못된 값 들어와도 빈 문자열 반환해야 함
    assert _requester_header("not a dict") == ""  # type: ignore[arg-type]
