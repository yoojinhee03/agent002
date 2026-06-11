"""Deep 모듈 설정 모델 — deepagent-sdk models.py에서 이관"""
from typing import Any, Literal

from pydantic import BaseModel, Field


class MemoryConfig(BaseModel):
    strategy: Literal["raw_log", "summary", "hybrid"] = "hybrid"
    short_term_backend: Literal["redis", "in_memory"] = "redis"
    short_term_ttl_seconds: int = 3600
    long_term_backend: Literal["postgresql"] = "postgresql"
    long_term_max_entries: int = 1000
    summary_trigger_count: int = 20


class ReasoningConfig(BaseModel):
    thinking_depth: int = Field(default=3, ge=1, le=5)
    step_limit: int = Field(default=40, ge=1)
    cot_visible: bool = True
    react_max_iterations: int = Field(default=10, ge=1)
    planning_depth: int = Field(default=3, ge=1)
    parallel_tool_execution: bool = False


class GuardrailsConfig(BaseModel):
    blocked_topics: list[str] = Field(default_factory=list)
    output_filters: list[str] = Field(default_factory=list)
    json_schema_validation: bool = False
    output_schema: dict[str, Any] | None = None
    safety_level: Literal["low", "medium", "high"] = "medium"
    pii_detection: bool = False


class PlanningConfig(BaseModel):
    decomposition: bool = True
    orchestration_mode: Literal["sequential", "parallel", "conditional"] = "sequential"
    sub_agent_ids: list[str] = Field(default_factory=list)
    delegation_mode: Literal["always", "on_complexity", "on_keyword", "manual"] = "manual"
    max_delegation_depth: int = 3


class DeepAgentConfig(BaseModel):
    agent_id: str
    agent_name: str
    agent_description: str = ""
    architecture: Literal["react", "tool_calling", "plan_execute"] = "react"
    system_prompt: str = ""
    model_id: str = "gpt-4o"
    provider_slug: str = "openai"
    provider_api_key: str | None = None
    config: dict[str, Any] = Field(default_factory=dict)
    memory: MemoryConfig = Field(default_factory=MemoryConfig)
    reasoning: ReasoningConfig = Field(default_factory=ReasoningConfig)
    guardrails: GuardrailsConfig = Field(default_factory=GuardrailsConfig)
    planning: PlanningConfig = Field(default_factory=PlanningConfig)
    database_url: str | None = None
    redis_url: str | None = None
