-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'pending');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('admin', 'editor', 'viewer');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('active', 'invited', 'declined', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "ProjectVisibility" AS ENUM ('private', 'public');

-- CreateEnum
CREATE TYPE "DeploymentStatus" AS ENUM ('active', 'inactive', 'deploying', 'failed', 'pending_approval');

-- CreateEnum
CREATE TYPE "TrafficPolicy" AS ENUM ('immediate', 'canary');

-- CreateEnum
CREATE TYPE "EndpointStatus" AS ENUM ('active', 'paused', 'inactive');

-- CreateEnum
CREATE TYPE "ApiKeyStatus" AS ENUM ('active', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "LogStatus" AS ENUM ('success', 'error');

-- CreateEnum
CREATE TYPE "DeploymentAction" AS ENUM ('deploy', 'promote', 'rollback', 'pause', 'resume', 'undeploy');

-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('invited', 'accepted', 'declined', 'expired', 'cancelled', 'resent', 'removed', 'role_changed');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('cloud', 'local');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('llm', 'tool', 'condition', 'loop', 'transform', 'human_input', 'start', 'end', 'agent');

-- CreateEnum
CREATE TYPE "KnowledgeType" AS ENUM ('file', 'crawler', 'database', 'manual');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('pending', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'chunked', 'embedded', 'failed');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled', 'waiting_input');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "ToolType" AS ENUM ('http', 'code', 'search', 'custom');

-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('project', 'workflow', 'run', 'agent', 'thread');

-- CreateEnum
CREATE TYPE "AgentType" AS ENUM ('single', 'supervisor', 'worker', 'swarm_member');

-- CreateEnum
CREATE TYPE "AgentArchitecture" AS ENUM ('react', 'plan_execute', 'tool_calling', 'custom_graph');

-- CreateEnum
CREATE TYPE "TeamTopology" AS ENUM ('supervisor', 'swarm', 'sequential', 'parallel');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('approval', 'input', 'choice', 'edit');

-- CreateEnum
CREATE TYPE "InteractionStatus" AS ENUM ('pending', 'approved', 'rejected', 'timed_out', 'cancelled');

-- CreateEnum
CREATE TYPE "ThreadStatus" AS ENUM ('active', 'paused', 'completed', 'failed', 'archived');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'pending',
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "visibility" "ProjectVisibility" NOT NULL DEFAULT 'private',
    "allow_all_models" BOOLEAN NOT NULL DEFAULT true,
    "allowed_model_ids" TEXT[],
    "default_model_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL DEFAULT 'viewer',
    "status" "MemberStatus" NOT NULL DEFAULT 'invited',
    "avatar_url" TEXT,
    "joined_at" TIMESTAMP(3),
    "invited_at" TIMESTAMP(3),
    "invited_by" TEXT,
    "expires_at" TIMESTAMP(3),
    "message" TEXT,
    "declined_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_activity_logs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "member_name" TEXT NOT NULL,
    "member_email" TEXT NOT NULL,
    "performed_by" TEXT NOT NULL,
    "role" "MemberRole",
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL DEFAULT 'cloud',
    "icon_url" TEXT,
    "api_key_configured" BOOLEAN NOT NULL DEFAULT false,
    "api_key_encrypted" TEXT,
    "endpoint" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "models" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "context_window" INTEGER NOT NULL,
    "input_price" DOUBLE PRECISION NOT NULL,
    "output_price" DOUBLE PRECISION NOT NULL,
    "capabilities" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "default_model_id" TEXT NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "model_id" TEXT,
    "hyperparameters" JSONB NOT NULL,
    "built_in" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "nodes" JSONB NOT NULL,
    "edges" JSONB NOT NULL,
    "variables" JSONB NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_versions" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT,
    "message" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "diff" JSONB,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workflow_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tools" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "ToolType" NOT NULL,
    "config" JSONB NOT NULL,
    "input_schema" JSONB NOT NULL,
    "output_schema" JSONB NOT NULL,
    "function_schema" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_environments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "approval_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployment_environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "workflow_name" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "DeploymentStatus" NOT NULL DEFAULT 'active',
    "endpoint_path" TEXT NOT NULL,
    "traffic_policy" "TrafficPolicy" NOT NULL DEFAULT 'immediate',
    "canary_percent" INTEGER,
    "deployed_by" TEXT NOT NULL,
    "deployed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deployment_logs" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "workflow_name" TEXT NOT NULL,
    "action" "DeploymentAction" NOT NULL,
    "from_version" INTEGER,
    "to_version" INTEGER,
    "environment" TEXT NOT NULL,
    "performed_by" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "deployment_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "endpoints" (
    "id" TEXT NOT NULL,
    "deployment_id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "workflow_name" TEXT NOT NULL,
    "project_slug" TEXT NOT NULL DEFAULT '',
    "workflow_slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'POST',
    "environment" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "version_id" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "description" TEXT,
    "status" "EndpointStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_suffix" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "endpoint_ids" TEXT[],
    "scopes" TEXT[],
    "valid_from" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "ApiKeyStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_runs" (
    "id" TEXT NOT NULL,
    "workflow_id" TEXT NOT NULL,
    "endpoint_id" TEXT,
    "api_key_id" TEXT,
    "environment" TEXT,
    "status" "RunStatus" NOT NULL DEFAULT 'pending',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error_message" TEXT,
    "total_cost" DOUBLE PRECISION,
    "total_tokens" INTEGER,
    "total_steps" INTEGER,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "step_traces" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "node_name" TEXT NOT NULL,
    "node_type" "NodeType" NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'pending',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "latency" INTEGER,
    "cost" DOUBLE PRECISION,
    "tokens" INTEGER,
    "retries" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "step_traces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_memory" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "scope" "MemoryScope" NOT NULL,
    "scope_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_metrics" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "project_id" TEXT,
    "workflow_id" TEXT,
    "endpoint_id" TEXT,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avg_latency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "type" "AgentType" NOT NULL DEFAULT 'single',
    "architecture" "AgentArchitecture" NOT NULL DEFAULT 'react',
    "system_prompt" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "tool_ids" TEXT[],
    "graph_definition" JSONB,
    "config" JSONB NOT NULL DEFAULT '{}',
    "hitl_policy" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "reasoning_config" JSONB,
    "memory_config" JSONB,
    "guardrails_config" JSONB,
    "planning_config" JSONB,
    "output_schema" JSONB,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_teams" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "topology" "TeamTopology" NOT NULL DEFAULT 'supervisor',
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_agents" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'worker',
    "routing_condition" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "team_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "threads" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "team_id" TEXT,
    "title" TEXT,
    "status" "ThreadStatus" NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "human_interactions" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "node_id" TEXT NOT NULL,
    "type" "InteractionType" NOT NULL,
    "status" "InteractionStatus" NOT NULL DEFAULT 'pending',
    "prompt" TEXT NOT NULL,
    "options" JSONB,
    "agent_context" JSONB,
    "response" JSONB,
    "responded_by" TEXT,
    "timeout_at" TIMESTAMP(3),
    "timeout_action" TEXT,
    "escalate_to" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),

    CONSTRAINT "human_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_versions" (
    "id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "few_shot_examples" JSONB NOT NULL DEFAULT '[]',
    "variables" TEXT[],
    "snapshot" TEXT NOT NULL,
    "diff" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "KnowledgeType" NOT NULL,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'pending',
    "config" JSONB NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_knowledge" (
    "agent_id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "top_k" INTEGER NOT NULL DEFAULT 5,
    "score_threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,

    CONSTRAINT "agent_knowledge_pkey" PRIMARY KEY ("agent_id","knowledge_base_id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT,
    "file_size" INTEGER,
    "metadata" JSONB,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chunks" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "metadata" JSONB,
    "token_count" INTEGER,
    "chunk_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_datasets" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eval_datasets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_test_cases" (
    "id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "expected" JSONB,
    "metadata" JSONB,
    "case_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_runs" (
    "id" TEXT NOT NULL,
    "dataset_id" TEXT NOT NULL,
    "agent_id" TEXT,
    "workflow_id" TEXT,
    "name" TEXT,
    "config" JSONB NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'pending',
    "summary" JSONB,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eval_results" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "test_case_id" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "scores" JSONB NOT NULL,
    "judge_output" JSONB,
    "status" "RunStatus" NOT NULL,
    "latency_ms" INTEGER,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cost_usd" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eval_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "project_members_email_idx" ON "project_members"("email");

-- CreateIndex
CREATE INDEX "project_members_project_id_status_idx" ON "project_members"("project_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_project_id_email_key" ON "project_members"("project_id", "email");

-- CreateIndex
CREATE INDEX "project_activity_logs_project_id_created_at_idx" ON "project_activity_logs"("project_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "providers_slug_key" ON "providers"("slug");

-- CreateIndex
CREATE INDEX "models_enabled_idx" ON "models"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "models_provider_id_model_id_key" ON "models"("provider_id", "model_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_templates_slug_key" ON "ai_templates"("slug");

-- CreateIndex
CREATE INDEX "workflows_project_id_idx" ON "workflows"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "workflows_project_id_slug_key" ON "workflows"("project_id", "slug");

-- CreateIndex
CREATE INDEX "workflow_versions_workflow_id_number_idx" ON "workflow_versions"("workflow_id", "number" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_versions_workflow_id_number_key" ON "workflow_versions"("workflow_id", "number");

-- CreateIndex
CREATE INDEX "tools_project_id_enabled_idx" ON "tools"("project_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "tools_project_id_slug_key" ON "tools"("project_id", "slug");

-- CreateIndex
CREATE INDEX "deployment_environments_project_id_order_idx" ON "deployment_environments"("project_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_environments_project_id_slug_key" ON "deployment_environments"("project_id", "slug");

-- CreateIndex
CREATE INDEX "deployments_project_id_idx" ON "deployments"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "deployments_workflow_id_environment_id_key" ON "deployments"("workflow_id", "environment_id");

-- CreateIndex
CREATE INDEX "deployment_logs_project_id_performed_at_idx" ON "deployment_logs"("project_id", "performed_at" DESC);

-- CreateIndex
CREATE INDEX "endpoints_status_idx" ON "endpoints"("status");

-- CreateIndex
CREATE UNIQUE INDEX "endpoints_project_slug_workflow_slug_environment_key" ON "endpoints"("project_slug", "workflow_slug", "environment");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_project_id_idx" ON "api_keys"("project_id");

-- CreateIndex
CREATE INDEX "api_keys_status_enabled_idx" ON "api_keys"("status", "enabled");

-- CreateIndex
CREATE INDEX "workflow_runs_workflow_id_started_at_idx" ON "workflow_runs"("workflow_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "workflow_runs_status_started_at_idx" ON "workflow_runs"("status", "started_at" DESC);

-- CreateIndex
CREATE INDEX "step_traces_run_id_started_at_idx" ON "step_traces"("run_id", "started_at");

-- CreateIndex
CREATE INDEX "agent_memory_project_id_scope_scope_id_idx" ON "agent_memory"("project_id", "scope", "scope_id");

-- CreateIndex
CREATE INDEX "agent_memory_agent_id_idx" ON "agent_memory"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_memory_project_id_scope_scope_id_key_key" ON "agent_memory"("project_id", "scope", "scope_id", "key");

-- CreateIndex
CREATE INDEX "daily_metrics_date_idx" ON "daily_metrics"("date" DESC);

-- CreateIndex
CREATE INDEX "daily_metrics_project_id_date_idx" ON "daily_metrics"("project_id", "date" DESC);

-- CreateIndex
CREATE INDEX "daily_metrics_workflow_id_date_idx" ON "daily_metrics"("workflow_id", "date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "daily_metrics_date_project_id_workflow_id_endpoint_id_key" ON "daily_metrics"("date", "project_id", "workflow_id", "endpoint_id");

-- CreateIndex
CREATE INDEX "agents_project_id_enabled_idx" ON "agents"("project_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "agents_project_id_slug_key" ON "agents"("project_id", "slug");

-- CreateIndex
CREATE INDEX "agent_teams_project_id_idx" ON "agent_teams"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_teams_project_id_slug_key" ON "agent_teams"("project_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "team_agents_team_id_agent_id_key" ON "team_agents"("team_id", "agent_id");

-- CreateIndex
CREATE INDEX "threads_project_id_status_idx" ON "threads"("project_id", "status");

-- CreateIndex
CREATE INDEX "threads_agent_id_idx" ON "threads"("agent_id");

-- CreateIndex
CREATE INDEX "threads_user_id_idx" ON "threads"("user_id");

-- CreateIndex
CREATE INDEX "human_interactions_thread_id_status_idx" ON "human_interactions"("thread_id", "status");

-- CreateIndex
CREATE INDEX "human_interactions_status_created_at_idx" ON "human_interactions"("status", "created_at");

-- CreateIndex
CREATE INDEX "prompt_versions_agent_id_version_idx" ON "prompt_versions"("agent_id", "version" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_versions_agent_id_version_key" ON "prompt_versions"("agent_id", "version");

-- CreateIndex
CREATE INDEX "knowledge_bases_project_id_status_idx" ON "knowledge_bases"("project_id", "status");

-- CreateIndex
CREATE INDEX "documents_knowledge_base_id_status_idx" ON "documents"("knowledge_base_id", "status");

-- CreateIndex
CREATE INDEX "chunks_document_id_chunk_index_idx" ON "chunks"("document_id", "chunk_index");

-- CreateIndex
CREATE INDEX "eval_datasets_project_id_idx" ON "eval_datasets"("project_id");

-- CreateIndex
CREATE INDEX "eval_test_cases_dataset_id_case_order_idx" ON "eval_test_cases"("dataset_id", "case_order");

-- CreateIndex
CREATE INDEX "eval_runs_dataset_id_created_at_idx" ON "eval_runs"("dataset_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "eval_runs_status_idx" ON "eval_runs"("status");

-- CreateIndex
CREATE INDEX "eval_results_run_id_idx" ON "eval_results"("run_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_email_fkey" FOREIGN KEY ("email") REFERENCES "users"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_activity_logs" ADD CONSTRAINT "project_activity_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "models" ADD CONSTRAINT "models_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_versions" ADD CONSTRAINT "workflow_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tools" ADD CONSTRAINT "tools_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployment_environments" ADD CONSTRAINT "deployment_environments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "deployment_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_deployed_by_fkey" FOREIGN KEY ("deployed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_deployment_id_fkey" FOREIGN KEY ("deployment_id") REFERENCES "deployments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "endpoints" ADD CONSTRAINT "endpoints_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "workflow_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_endpoint_id_fkey" FOREIGN KEY ("endpoint_id") REFERENCES "endpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "api_keys"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "step_traces" ADD CONSTRAINT "step_traces_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "workflow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_teams" ADD CONSTRAINT "agent_teams_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_agents" ADD CONSTRAINT "team_agents_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "agent_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_agents" ADD CONSTRAINT "team_agents_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "threads" ADD CONSTRAINT "threads_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "agent_teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "human_interactions" ADD CONSTRAINT "human_interactions_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_knowledge" ADD CONSTRAINT "agent_knowledge_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_knowledge" ADD CONSTRAINT "agent_knowledge_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_datasets" ADD CONSTRAINT "eval_datasets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_test_cases" ADD CONSTRAINT "eval_test_cases_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "eval_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_dataset_id_fkey" FOREIGN KEY ("dataset_id") REFERENCES "eval_datasets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "eval_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_test_case_id_fkey" FOREIGN KEY ("test_case_id") REFERENCES "eval_test_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
