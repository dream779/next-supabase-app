import type { Chunk } from './chunking'

const ARK_API_KEY = process.env.ARK_API_KEY
const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'
const ARK_MODEL = process.env.ARK_EMBEDDING_MODEL ?? 'doubao-embedding-vision-250615'
const ARK_DIMENSIONS = Number(process.env.ARK_DIMENSIONS ?? 1024)

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000

type TextInput = { type: 'text'; text: string }

type ArkEmbeddingData = { embedding: number[]; object?: string }

type ArkEmbeddingResponse = {
  created?: number
  data: ArkEmbeddingData | ArkEmbeddingData[]
  model?: string
  usage?: { prompt_tokens?: number; total_tokens?: number }
}

function extractEmbeddings(json: ArkEmbeddingResponse): number[][] {
  // ARK multimodal 单 input 时回对象, 多 input 理论上回数组
  if (Array.isArray(json.data)) {
    return json.data.map((d) => d.embedding)
  }
  return [json.data.embedding]
}

async function callArkEmbedding(inputs: TextInput[]): Promise<number[][]> {
  const res = await fetch(`${ARK_BASE_URL}/embeddings/multimodal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: ARK_MODEL,
      input: inputs,
      encoding_format: 'float',
      dimensions: ARK_DIMENSIONS,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ARK embedding ${res.status}: ${text}`)
  }

  const raw = await res.text()
  let json: ArkEmbeddingResponse
  try {
    json = JSON.parse(raw) as ArkEmbeddingResponse
  } catch {
    throw new Error(`ARK embedding: response is not JSON. body=${raw.slice(0, 500)}`)
  }
  if (!Array.isArray(json.data) && typeof json.data?.embedding !== 'object') {
    throw new Error(
      `ARK embedding: response.data has no .embedding. body=${raw.slice(0, 500)}`,
    )
  }
  return extractEmbeddings(json)
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * 2 ** attempt
        console.warn(
          `[ARK embedding] attempt ${attempt + 1} failed, retrying in ${delay}ms`,
        )
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  throw new Error(
    `ARK embedding failed after ${MAX_RETRIES} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  )
}

export async function embedQuery(text: string): Promise<number[]> {
  return withRetry(async () => {
    const [vec] = await callArkEmbedding([{ type: 'text', text }])
    return vec
  })
}

export async function embedChunks(
  chunks: Chunk[],
): Promise<Array<Chunk & { embedding: number[] }>> {
  if (chunks.length === 0) return []
  // ARK multimodal 的 batch input 行为不可靠 (实测只回 1 个 embedding),
  // 改用逐条 + Promise.all 并发, 每条都走单 input 路径
  const results = await Promise.all(
    chunks.map((chunk) => embedQuery(chunk.content).then((embedding) => ({ ...chunk, embedding }))),
  )
  return results
}
