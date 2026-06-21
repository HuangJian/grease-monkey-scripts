export type OpenRouterFreeModel = {
  id: string
  name: string
  contextLength: number
  totalTokens3Days: number | null
  parameterSize: string
  provider: string
  rank: number | null
}

export type OpenRouterData = {
  models: OpenRouterFreeModel[]
  fetchedAt: string
}
