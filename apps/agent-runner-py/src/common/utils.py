import re

def sanitize_tool_name(name: str) -> str:
    """
    OpenAI 도구 이름 규칙 (^[a-zA-Z0-9_-]+$)을 준수하도록 이름을 정제합니다.
    공백이나 특수문자는 언더바(_)로 대체합니다.
    """
    # 알파벳, 숫자, _, - 가 아닌 모든 문자를 _로 대체
    sanitized = re.sub(r'[^a-zA-Z0-9_-]', '_', name)
    # 혹시 비어있거나 _로만 시작하는 경우 등을 대비 (OpenAI는 최소 1자 이상 필요)
    if not sanitized or not re.match(r'^[a-zA-Z0-9_-]+$', sanitized):
        return f"tool_{hash(name) % 10000}"
    return sanitized
