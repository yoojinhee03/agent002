from typing import Optional

# 스레드별 가상 파일 시스템 (메모리 내)
_vfs: dict[str, dict[str, str]] = {}


def _get_fs(thread_id: str) -> dict[str, str]:
    if thread_id not in _vfs:
        _vfs[thread_id] = {}
    return _vfs[thread_id]


def ls(thread_id: str, path: str = "/") -> str:
    fs = _get_fs(thread_id)
    prefix = path.rstrip("/") + "/"
    items = [k for k in fs if k.startswith(prefix) or path == "/"]
    return "\n".join(items) if items else "(empty)"


def read_file(thread_id: str, path: str) -> str:
    fs = _get_fs(thread_id)
    return fs.get(path, f"File not found: {path}")


def write_file(thread_id: str, path: str, content: str) -> str:
    fs = _get_fs(thread_id)
    fs[path] = content
    return f"Written: {path}"


def grep(thread_id: str, pattern: str, path: Optional[str] = None) -> str:
    import re
    fs = _get_fs(thread_id)
    results = []
    for file_path, content in fs.items():
        if path and not file_path.startswith(path):
            continue
        for i, line in enumerate(content.splitlines(), 1):
            if re.search(pattern, line):
                results.append(f"{file_path}:{i}: {line}")
    return "\n".join(results) if results else "No matches"
