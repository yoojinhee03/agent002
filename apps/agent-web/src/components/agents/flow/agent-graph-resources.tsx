'use client'

import { createContext, useContext, type ReactNode } from 'react'

export interface AgentGraphResources {
  modelsById: Record<string, { name: string; providerSlug: string }>
  toolsById: Record<string, { name: string }>
  mcpServersById: Record<string, { name: string }>
  skillsById: Record<string, { name: string }>
  builtinDisplayNames: Record<string, string>
}

const EMPTY: AgentGraphResources = {
  modelsById: {},
  toolsById: {},
  mcpServersById: {},
  skillsById: {},
  builtinDisplayNames: {},
}

const Ctx = createContext<AgentGraphResources>(EMPTY)

export function AgentGraphResourcesProvider({
  value,
  children,
}: {
  value: AgentGraphResources
  children: ReactNode
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAgentGraphResources(): AgentGraphResources {
  return useContext(Ctx)
}
