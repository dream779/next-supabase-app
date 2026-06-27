export type Chunk = {
  content: string
  chunk_index: number
  token_count: number
}

type Options = {
  chunkSize?: number
  overlap?: number
}

const SEPARATORS = ['\n\n', '\n', '。', ' ', '']

export function recursiveCharSplit(text: string, options: Options = {}): Chunk[] {
  const chunkSize = options.chunkSize ?? 500
  const overlap = options.overlap ?? 50

  if (!text.trim()) return []

  const pieces = splitBySeparator(text, chunkSize)
  const merged = mergeSmallPieces(pieces, chunkSize)
  const chunks = applyOverlap(merged, overlap)

  return chunks.map((content, i) => ({
    content: content.trim(),
    chunk_index: i,
    token_count: Math.ceil(content.length / 4),
  }))
}

function splitBySeparator(text: string, chunkSize: number): string[] {
  return splitRecursive(text, chunkSize, 0)
}

function splitRecursive(text: string, chunkSize: number, depth: number): string[] {
  if (text.length <= chunkSize || depth >= SEPARATORS.length) {
    return text.length > 0 ? [text] : []
  }

  const sep = SEPARATORS[depth]
  const parts = sep === '' ? [...text] : text.split(sep)

  const result: string[] = []
  for (const part of parts) {
    if (part.length <= chunkSize) {
      if (part.length > 0) result.push(part)
    } else {
      result.push(...splitRecursive(part, chunkSize, depth + 1))
    }
  }
  return result
}

function mergeSmallPieces(pieces: string[], chunkSize: number): string[] {
  const result: string[] = []
  let buffer = ''

  for (const piece of pieces) {
    if (buffer.length + piece.length + 1 <= chunkSize) {
      buffer = buffer ? `${buffer} ${piece}` : piece
    } else {
      if (buffer) result.push(buffer)
      buffer = piece
    }
  }
  if (buffer) result.push(buffer)
  return result
}

function applyOverlap(chunks: string[], overlap: number): string[] {
  if (chunks.length <= 1 || overlap <= 0) return chunks

  const result: string[] = [chunks[0]]
  for (let i = 1; i < chunks.length; i++) {
    const prev = chunks[i - 1]
    const tail = prev.slice(-overlap)
    result.push(`${tail}${chunks[i]}`)
  }
  return result
}