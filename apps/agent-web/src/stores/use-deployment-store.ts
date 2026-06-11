import { create } from "zustand"
import { immer } from "zustand/middleware/immer"
import { mockApi } from "@/lib/api-client"
import type { DeploymentEnvironment, Deployment, DeploymentLog } from "@/types/deployment"
import type { Endpoint, ApiKey } from "@/types/endpoint"
import type { PromptSnapshot } from "@/types/version"

interface DeploymentState {
  environments: DeploymentEnvironment[]
  deployments: Deployment[]
  endpoints: Endpoint[]
  apiKeys: ApiKey[]
  deploymentLogs: DeploymentLog[]
  isLoading: boolean
  isDeploying: boolean

  // Actions
  loadAll: (projectId: string) => Promise<void>
  loadEnvironments: (projectId: string) => Promise<void>
  loadDeployments: (projectId: string) => Promise<void>
  loadEndpoints: (projectId: string) => Promise<void>
  loadApiKeys: (projectId: string) => Promise<void>
  loadLogs: (projectId: string) => Promise<void>

  addEnvironment: (data: Omit<DeploymentEnvironment, "id" | "createdAt">) => Promise<DeploymentEnvironment>
  updateEnvironment: (id: string, data: Partial<Pick<DeploymentEnvironment, "name" | "slug" | "color" | "order" | "approvalRequired">>) => Promise<DeploymentEnvironment>
  reorderEnvironments: (projectId: string, environmentIds: string[]) => Promise<boolean>
  deleteEnvironment: (id: string) => Promise<boolean>

  deploy: (data: {
    projectId: string
    promptId: string
    promptName: string
    environmentId: string
    environment: string
    versionId: string
    versionNumber: number
    snapshot: PromptSnapshot
    deployedBy: string
  }) => Promise<{ deployment: Deployment; endpoint: Endpoint }>

  undeploy: (deploymentId: string, projectId: string) => Promise<boolean>

  createApiKey: (data: Omit<ApiKey, "id" | "key" | "createdAt" | "lastUsedAt" | "status">) => Promise<ApiKey>
  revokeApiKey: (id: string, projectId: string) => Promise<boolean>
  toggleApiKey: (id: string, projectId: string) => Promise<boolean>

  // Helpers
  getDeployment: (promptId: string, environmentId: string) => Deployment | undefined
  getEndpointsByPrompt: (promptId: string) => Endpoint[]
}

export const useDeploymentStore = create<DeploymentState>()(
  immer((set, get) => ({
    environments: [],
    deployments: [],
    endpoints: [],
    apiKeys: [],
    deploymentLogs: [],
    isLoading: false,
    isDeploying: false,

    loadAll: async (projectId) => {
      set((s) => { s.isLoading = true })
      try {
        const [environments, deployments, endpoints, apiKeys, logs] = await Promise.all([
          mockApi.environments.list(projectId),
          mockApi.deployments.list(projectId),
          mockApi.endpoints.list(projectId),
          mockApi.endpoints.getApiKeys(projectId),
          mockApi.deployments.getLogs(projectId),
        ])
        set((s) => {
          s.environments = environments
          s.deployments = deployments
          s.endpoints = endpoints
          s.apiKeys = apiKeys
          s.deploymentLogs = logs
          s.isLoading = false
        })
      } catch {
        set((s) => { s.isLoading = false })
      }
    },

    loadEnvironments: async (projectId) => {
      const environments = await mockApi.environments.list(projectId)
      set((s) => { s.environments = environments })
    },

    loadDeployments: async (projectId) => {
      const deployments = await mockApi.deployments.list(projectId)
      set((s) => { s.deployments = deployments })
    },

    loadEndpoints: async (projectId) => {
      const endpoints = await mockApi.endpoints.list(projectId)
      set((s) => { s.endpoints = endpoints })
    },

    loadApiKeys: async (projectId) => {
      const apiKeys = await mockApi.endpoints.getApiKeys(projectId)
      set((s) => { s.apiKeys = apiKeys })
    },

    loadLogs: async (projectId) => {
      const logs = await mockApi.deployments.getLogs(projectId)
      set((s) => { s.deploymentLogs = logs })
    },

    addEnvironment: async (data) => {
      const env = await mockApi.environments.create(data)
      set((s) => {
        s.environments.push(env)
        s.environments.sort((a, b) => a.order - b.order)
      })
      return env
    },

    updateEnvironment: async (id, data) => {
      const env = await mockApi.environments.update(id, data)
      set((s) => {
        const idx = s.environments.findIndex((e) => e.id === id)
        if (idx !== -1) s.environments[idx] = env
        // If slug changed, reflect in endpoints
        if (data.slug) {
          s.endpoints = s.endpoints.map((ep) => {
            const dep = s.deployments.find((d) => d.id === ep.deploymentId)
            if (dep && dep.environmentId === id) {
              return { ...ep, environment: env.slug, path: ep.path.replace(/\/[^/]+\/run$/, `/${env.slug}/run`) }
            }
            return ep
          })
        }
      })
      return env
    },

    reorderEnvironments: async (projectId, environmentIds) => {
      const success = await mockApi.environments.reorder(projectId, environmentIds)
      if (success) {
        set((s) => {
          const newEnvs = [...s.environments]
          newEnvs.sort((a, b) => {
            const aIdx = environmentIds.indexOf(a.id)
            const bIdx = environmentIds.indexOf(b.id)
            return aIdx - bIdx
          })
          s.environments = newEnvs
        })
      }
      return success
    },

    deleteEnvironment: async (id) => {
      const result = await mockApi.environments.delete(id)
      if (result) {
        set((s) => {
          s.environments = s.environments.filter((e) => e.id !== id)
          s.deployments = s.deployments.filter((d) => d.environmentId !== id)
          s.endpoints = s.endpoints.filter((ep) => {
            const dep = get().deployments.find((d) => d.id === ep.deploymentId)
            return dep ? dep.environmentId !== id : true
          })
        })
      }
      return result
    },

    deploy: async (data) => {
      set((s) => { s.isDeploying = true })
      try {
        const result = await mockApi.deployments.deploy(data)
        // Reload all
        const [deployments, endpoints, logs] = await Promise.all([
          mockApi.deployments.list(data.projectId),
          mockApi.endpoints.list(data.projectId),
          mockApi.deployments.getLogs(data.projectId),
        ])
        set((s) => {
          s.deployments = deployments
          s.endpoints = endpoints
          s.deploymentLogs = logs
          s.isDeploying = false
        })
        return result
      } catch (e) {
        set((s) => { s.isDeploying = false })
        throw e
      }
    },

    undeploy: async (deploymentId, projectId) => {
      const result = await mockApi.deployments.undeploy(deploymentId)
      if (result) {
        const [deployments, endpoints, logs] = await Promise.all([
          mockApi.deployments.list(projectId),
          mockApi.endpoints.list(projectId),
          mockApi.deployments.getLogs(projectId),
        ])
        set((s) => {
          s.deployments = deployments
          s.endpoints = endpoints
          s.deploymentLogs = logs
        })
      }
      return result
    },

    createApiKey: async (data) => {
      const key = await mockApi.endpoints.createApiKey(data)
      set((s) => { s.apiKeys.push(key) })
      return key
    },

    revokeApiKey: async (id, projectId) => {
      const result = await mockApi.endpoints.revokeApiKey(id)
      if (result) {
        const keys = await mockApi.endpoints.getApiKeys(projectId)
        set((s) => { s.apiKeys = keys })
      }
      return result
    },

    toggleApiKey: async (id, projectId) => {
      const result = await mockApi.endpoints.toggleApiKey(id)
      if (result) {
        const keys = await mockApi.endpoints.getApiKeys(projectId)
        set((s) => { s.apiKeys = keys })
      }
      return !!result
    },

    getDeployment: (promptId, environmentId) => {
      return get().deployments.find(
        (d) => d.promptId === promptId && d.environmentId === environmentId
      )
    },

    getEndpointsByPrompt: (promptId) => {
      return get().endpoints.filter((e) => e.promptId === promptId)
    },
  }))
)
