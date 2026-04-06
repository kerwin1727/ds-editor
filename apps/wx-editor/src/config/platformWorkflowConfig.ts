export interface PlatformWorkflowConfig {
  platformApiBaseUrl?: string
  reviewerId?: string
}

const STORAGE_KEY = `platformWorkflowConfig`

export function getPlatformWorkflowConfig(): PlatformWorkflowConfig {
  const configStr = localStorage.getItem(STORAGE_KEY)
  if (!configStr) {
    return {}
  }

  try {
    return JSON.parse(configStr) as PlatformWorkflowConfig
  }
  catch (error) {
    console.warn(`Failed to parse platform workflow config`, error)
    return {}
  }
}

export function updatePlatformWorkflowConfig(newConfig: Partial<PlatformWorkflowConfig>) {
  const current = getPlatformWorkflowConfig()
  const updated = {
    ...current,
    ...newConfig,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}

export function resetPlatformWorkflowConfig() {
  localStorage.removeItem(STORAGE_KEY)
}
