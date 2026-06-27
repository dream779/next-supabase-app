const DEFAULT_NEXT = '/'

export function sanitizeNext(value: unknown, fallback: string = DEFAULT_NEXT): string {
  if (typeof value !== 'string' || value.length === 0) return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//')) return fallback
  return value
}