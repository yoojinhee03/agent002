// @ts-nocheck
import type { PromptSnapshot } from "@/types/version"
import type { PromptBlock, TextBlock, Variable } from "@/types/prompt"
import type {
  LineDiff,
  BlockDiffEntry,
  VariableDiffEntry,
  ModelDiffResult,
  StructuredOutputDiffResult,
  DetailedSnapshotDiff,
} from "@/types/version"

/* ─── Line-level diff (LCS-based) ─── */

export function computeLineDiff(prevText: string, currText: string): LineDiff[] {
  const prevLines = prevText.split("\n")
  const currLines = currText.split("\n")
  const n = prevLines.length
  const m = currLines.length

  // Build LCS DP table
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (prevLines[i - 1] === currLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to produce diff
  const result: LineDiff[] = []
  let i = n
  let j = m

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && prevLines[i - 1] === currLines[j - 1]) {
      result.push({ type: "unchanged", content: currLines[j - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: "added", content: currLines[j - 1] })
      j--
    } else {
      result.push({ type: "removed", content: prevLines[i - 1] })
      i--
    }
  }

  return result.reverse()
}

/* ─── Block-level diff ─── */

function getBlockContent(block: PromptBlock): string {
  if (block.type === "text") return (block as TextBlock).content
  return JSON.stringify(block)
}

export function computeDetailedDiff(
  prev: PromptSnapshot,
  curr: PromptSnapshot
): DetailedSnapshotDiff {
  // --- Block diff ---
  const prevMap = new Map(prev.blocks.map((b) => [b.id, b]))
  const currMap = new Map(curr.blocks.map((b) => [b.id, b]))
  const processedIds = new Set<string>()
  const blockEntries: BlockDiffEntry[] = []

  // Track prev block positions for removed block insertion
  const prevPositions = new Map<string, number>()
  prev.blocks.forEach((b, i) => prevPositions.set(b.id, i))

  // Walk curr blocks
  for (const currBlock of curr.blocks) {
    processedIds.add(currBlock.id)
    const prevBlock = prevMap.get(currBlock.id)

    if (!prevBlock) {
      blockEntries.push({
        status: "added",
        blockId: currBlock.id,
        blockType: currBlock.type,
        currBlock,
      })
    } else if (JSON.stringify(prevBlock) !== JSON.stringify(currBlock)) {
      const entry: BlockDiffEntry = {
        status: "modified",
        blockId: currBlock.id,
        blockType: currBlock.type,
        prevBlock,
        currBlock,
      }
      // Line-level diff for text blocks
      if (currBlock.type === "text" && prevBlock.type === "text") {
        entry.textDiff = computeLineDiff(
          (prevBlock as TextBlock).content,
          (currBlock as TextBlock).content
        )
      }
      blockEntries.push(entry)
    } else {
      blockEntries.push({
        status: "unchanged",
        blockId: currBlock.id,
        blockType: currBlock.type,
        prevBlock,
        currBlock,
      })
    }
  }

  // Insert removed blocks near their original neighbors
  const removedBlocks = prev.blocks.filter((b) => !processedIds.has(b.id))
  for (const removed of removedBlocks) {
    const prevIdx = prevPositions.get(removed.id) ?? 0
    // Find the best insertion point: after the last existing block
    // that was before this block in prev
    let insertAt = 0
    for (let k = 0; k < blockEntries.length; k++) {
      const entryPrevIdx = prevPositions.get(blockEntries[k].blockId)
      if (entryPrevIdx !== undefined && entryPrevIdx < prevIdx) {
        insertAt = k + 1
      }
    }
    blockEntries.splice(insertAt, 0, {
      status: "removed",
      blockId: removed.id,
      blockType: removed.type,
      prevBlock: removed,
    })
  }

  // Summary counts
  const summary = {
    added: blockEntries.filter((e) => e.status === "added").length,
    removed: blockEntries.filter((e) => e.status === "removed").length,
    modified: blockEntries.filter((e) => e.status === "modified").length,
    unchanged: blockEntries.filter((e) => e.status === "unchanged").length,
  }

  // --- Variable diff ---
  const prevVarMap = new Map(prev.variables.map((v) => [v.name, v]))
  const currVarMap = new Map(curr.variables.map((v) => [v.name, v]))
  const varEntries: VariableDiffEntry[] = []

  for (const [name, currVar] of currVarMap) {
    const prevVar = prevVarMap.get(name)
    if (!prevVar) {
      varEntries.push({ status: "added", name, currVariable: currVar })
    } else {
      const changes: string[] = []
      if (prevVar.type !== currVar.type) changes.push("type 변경")
      if (prevVar.defaultValue !== currVar.defaultValue) changes.push("기본값 변경")
      if (prevVar.required !== currVar.required) changes.push("필수 여부 변경")
      if (prevVar.description !== currVar.description) changes.push("설명 변경")
      if (changes.length > 0) {
        varEntries.push({
          status: "modified",
          name,
          prevVariable: prevVar,
          currVariable: currVar,
          changes,
        })
      }
    }
  }

  for (const [name, prevVar] of prevVarMap) {
    if (!currVarMap.has(name)) {
      varEntries.push({ status: "removed", name, prevVariable: prevVar })
    }
  }

  // --- Model diff ---
  const hyperparamKeys = [
    "temperature",
    "topP",
    "maxTokens",
    "frequencyPenalty",
    "presencePenalty",
  ] as const
  const hyperparamLabels: Record<string, string> = {
    temperature: "Temperature",
    topP: "Top-P",
    maxTokens: "Max Tokens",
    frequencyPenalty: "Freq Penalty",
    presencePenalty: "Pres Penalty",
  }

  const hyperparamChanges: ModelDiffResult["hyperparamChanges"] = []
  for (const key of hyperparamKeys) {
    const prevVal = prev.hyperparameters[key]
    const currVal = curr.hyperparameters[key]
    if (prevVal !== currVal) {
      hyperparamChanges.push({
        param: hyperparamLabels[key] || key,
        prev: prevVal,
        curr: currVal,
      })
    }
  }

  const model: ModelDiffResult = {
    modelChanged: prev.modelId !== curr.modelId,
    prevModelId: prev.modelId,
    currModelId: curr.modelId,
    hyperparamChanges,
  }

  // --- Structured Output diff ---
  const prevSO = prev.structuredOutput
  const currSO = curr.structuredOutput

  function normalizeSchema(schema?: string): string {
    if (!schema) return ""
    try { return JSON.stringify(JSON.parse(schema)) } catch { return schema }
  }

  const enabledChanged = (prevSO?.enabled ?? false) !== (currSO?.enabled ?? false)
  const schemaNameChanged = (prevSO?.schemaName ?? "") !== (currSO?.schemaName ?? "")
  const schemaChanged = normalizeSchema(prevSO?.schema) !== normalizeSchema(currSO?.schema)
  const formatChanged = (prevSO?.format ?? "") !== (currSO?.format ?? "")
  const strictChanged = (prevSO?.strict ?? true) !== (currSO?.strict ?? true)

  const soChanged =
    enabledChanged || schemaNameChanged || schemaChanged || formatChanged || strictChanged

  const structuredOutput: StructuredOutputDiffResult = {
    changed: soChanged,
    enabledChanged,
    prevEnabled: prevSO?.enabled,
    currEnabled: currSO?.enabled,
    schemaNameChanged,
    prevSchemaName: prevSO?.schemaName,
    currSchemaName: currSO?.schemaName,
    schemaChanged,
    formatChanged,
    prevFormat: prevSO?.format,
    currFormat: currSO?.format,
    strictChanged,
    prevStrict: prevSO?.strict,
    currStrict: currSO?.strict,
  }

  return { blocks: blockEntries, variables: varEntries, model, structuredOutput, summary }
}
