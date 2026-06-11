// ============================================================
// Knowledge (RAG)
// ============================================================

export type KnowledgeType = 'file' | 'crawler' | 'database' | 'manual'
export type KnowledgeStatus = 'pending' | 'processing' | 'ready' | 'failed'
export type DocumentStatus = 'pending' | 'chunked' | 'embedded' | 'failed'

export interface EmbeddingConfig {
  embeddingModel: string
  chunkSize: number
  chunkOverlap: number
  splitStrategy: 'recursive' | 'sentence' | 'paragraph' | 'fixed'
}

export interface KnowledgeBase {
  id: string
  projectId: string
  name: string
  description: string | null
  type: KnowledgeType
  status: KnowledgeStatus
  config: EmbeddingConfig
  metadata: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
  documents?: KnowledgeDocument[]
  _count?: { documents: number }
}

export interface AgentKnowledge {
  agentId: string
  knowledgeBaseId: string
  topK: number
  scoreThreshold: number
  knowledgeBase?: KnowledgeBase
}

export interface KnowledgeDocument {
  id: string
  knowledgeBaseId: string
  name: string
  type: string
  content: string | null
  fileSize: number | null
  metadata: Record<string, unknown> | null
  status: DocumentStatus
  createdAt: string
  updatedAt: string
  _count?: { chunks: number }
}

export interface KnowledgeChunk {
  id: string
  documentId: string
  content: string
  embedding: number[]
  metadata: Record<string, unknown> | null
  tokenCount: number | null
  chunkIndex: number
  createdAt: string
}

export interface SearchResult {
  chunk: KnowledgeChunk
  score: number
  document: Pick<KnowledgeDocument, 'id' | 'name' | 'type'>
}

export interface CreateKnowledgeRequest {
  name: string
  description?: string
  type: KnowledgeType
  config: EmbeddingConfig
}

export interface UpdateKnowledgeRequest {
  name?: string
  description?: string
  config?: Partial<EmbeddingConfig>
}
