import os
from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env into os.environ for LangChain/LangSmith to detect
load_dotenv()

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    PORT: int = 28003
    DATABASE_URL: str = "postgresql://agentstudio:agentstudio@localhost:28010/agentstudio"
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 28011
    REDIS_PASSWORD: str = "agentstudio"
    INTERNAL_SERVICE_KEY: str = "internal-service-key"

    MANAGEMENT_API_URL: str = "http://localhost:28001"

    # OAuth MCP 표준 콜백 URL — sandbox 컨테이너 안의 MCP 서버가 provider 에
    # redirect_uri 로 알릴 외부 URL. agent-runner-py FastAPI 의 `/oauth/callback`
    # 엔드포인트가 state 의 thread_id 로 해당 sandbox 매핑 포트로 프록시한다.
    PUBLIC_OAUTH_CALLBACK_URL: str = "http://localhost:28003/oauth/callback"

    # sandbox 컨테이너에 추가로 bind mount 할 호스트 경로 목록.
    # 형식: "<src>:<dst>[:<mode>],<src>:<dst>[:<mode>],..." (mode 기본 ro)
    # 예: "/Users/u/nworks:/opt/nworks:ro,/Users/u/other:/opt/other:ro"
    # src/dst 는 절대경로여야 하고, dst 가 중복되면 안 된다.
    SANDBOX_EXTRA_MOUNTS: str = ""

    # 첨부파일 저장 루트 (thread sandbox 로 sync 되기 전 영구 보관소)
    ATTACHMENT_STORAGE_DIR: str = "./data/attachments"
    # 단일 첨부 최대 크기 (바이트) — MVP 50MB
    ATTACHMENT_MAX_BYTES: int = 50 * 1024 * 1024

    # LangChain / LangSmith (Explicitly load to ensure availability)
    LANGCHAIN_TRACING_V2: str = "false"
    LANGCHAIN_ENDPOINT: str = "https://api.smith.langchain.com"
    LANGCHAIN_API_KEY: str = ""
    LANGCHAIN_PROJECT: str = "AgentStudio-py"

    @property
    def redis_url(self) -> str:
        if self.REDIS_PASSWORD:
            return f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}"
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}"


settings = Settings()
