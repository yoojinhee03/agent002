FROM python:3.12-slim

# ──────────────────────────────────────────────────────────────
# AgentStudio per-thread sandbox 이미지
#
# 사용자 채팅 첨부 파일(PDF/DOCX/XLSX/HWP/이미지/CSV 등)을 LLM 이
# 즉시 분석할 수 있도록 자주 쓰는 파이썬 라이브러리를 사전 설치한다.
# 새 thread 마다 매번 pip install 하는 비용을 제거한다.
#
# 빌드: docker build -t agentstudio-sandbox:0.1 .
#       또는 `pnpm sandbox:build` (root)
# ──────────────────────────────────────────────────────────────

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 시스템 의존성 — pymupdf(libmupdf 정적링크라 별도 불필요), pyhwp(charset-normalizer 정도만),
# matplotlib(headless 기본 백엔드 Agg 라 X11 불필요), pandas(blas 불필요).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      gnupg \
      libmagic1 \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

RUN pip install "uv>=0.5.0,<1.0.0"

# 자주 쓰는 파일 분석 라이브러리.
# 버전은 안정 마이너 기준으로 핀(중간 patch 만 유동) — 재현성과 보안 균형.
RUN pip install \
    "pypdf>=5.0.0,<6.0.0" \
    "pymupdf>=1.24.0,<2.0.0" \
    "python-docx>=1.1.0,<2.0.0" \
    "openpyxl>=3.1.0,<4.0.0" \
    "xlrd>=2.0.0,<3.0.0" \
    "pandas>=2.2.0,<3.0.0" \
    "numpy>=1.26.0,<3.0.0" \
    "matplotlib>=3.9.0,<4.0.0" \
    "pillow>=10.0.0,<12.0.0" \
    "chardet>=5.0.0,<6.0.0" \
    "python-magic>=0.4.27,<0.5.0" \
    "requests>=2.32.0,<3.0.0" \
    "beautifulsoup4>=4.12.0,<5.0.0" \
    "lxml>=5.0.0,<6.0.0"

# HWP (한글) — pyhwp 는 오랜 패키지지만 wheel 이 안 풀릴 수 있어 best-effort 로 시도.
# 실패해도 다른 형식엔 영향 없도록 `|| true`.
RUN pip install --pre "pyhwp" || \
    echo "WARN: pyhwp install failed — HWP 지원 제한"

WORKDIR /workspace

# matplotlib 의 첫 호출 폰트 캐시 빌드를 미리 수행 → 첫 차트 그릴 때 지연 제거.
RUN python -c "import matplotlib.pyplot as plt; plt.figure(); plt.close()" || true

# 컨테이너는 SandboxManager 가 `sleep infinity` 명령으로 띄움. ENTRYPOINT 미설정.
CMD ["python", "--version"]
