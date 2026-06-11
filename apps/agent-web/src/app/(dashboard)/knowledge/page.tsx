export default function KnowledgePage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-4xl">📚</p>
      <p className="text-sm font-medium text-[var(--color-fg)]">Knowledge</p>
      <p className="text-xs text-[var(--color-fg-subtle)]">
        RAG 파이프라인 · 문서 업로드 · 벡터 검색
        <br />
        Track B 구현 예정
      </p>
    </div>
  )
}
