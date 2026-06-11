import { LLMNode } from './llm-node'
import { ToolNode } from './tool-node'
import { ConditionNode } from './condition-node'
import { TransformNode } from './transform-node'
import { HumanInputNode } from './human-input-node'
import { StartNode } from './start-node'
import { EndNode } from './end-node'
import { AgentNode } from './agent-node'

export const nodeTypes = {
  llm: LLMNode,
  tool: ToolNode,
  condition: ConditionNode,
  transform: TransformNode,
  human_input: HumanInputNode,
  start: StartNode,
  end: EndNode,
  agent: AgentNode,
}
