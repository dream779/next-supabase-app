import { embed, embedMany } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { Chunk } from './chunking'

const dashscope = createOpenAICompatible({
  name: 'dashscope',
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.DASHSCOPE_API_KEY!,
})

const MODEL = dashscope.textEmbeddingModel('text-embedding-v3')

const PROVIDER_OPTIONS = {
  dashscope: { dimensions: 1024 },
}

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

export async function embedQuery(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: MODEL,
    value: text,
    providerOptions: PROVIDER_OPTIONS,
  })
  return embedding
}

export async function embedChunks(
  chunks: Chunk[]
): Promise<Array<Chunk & { embedding: number[] }>> {
  if (chunks.length === 0) return []

  const values = chunks.map((c) => c.content)

  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const { embeddings } = await embedMany({
        model: MODEL,
        values,
        providerOptions: PROVIDER_OPTIONS,
      })
      return chunks.map((c, i) => ({ ...c, embedding: embeddings[i] }))
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * 2 ** attempt
        console.warn(
          `[embedChunks] attempt ${attempt + 1} failed, retrying in ${delay}ms`
        )
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw new Error(
    `embedChunks failed after ${MAX_RETRIES} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  )
}