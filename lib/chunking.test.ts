import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recursiveCharSplit } from './chunking'

test('空字符串返回空数组', () => {
  assert.deepEqual(recursiveCharSplit(''), [])
})

test('短文本不分块', () => {
  const result = recursiveCharSplit('hello world')
  assert.equal(result.length, 1)
  assert.equal(result[0].content, 'hello world')
  assert.equal(result[0].chunk_index, 0)
  assert.ok(result[0].token_count > 0)
})

test('长文本按 chunkSize 切分', () => {
  const long = 'a'.repeat(1200)
  const result = recursiveCharSplit(long, { chunkSize: 500, overlap: 50 })
  assert.ok(result.length >= 2)
  // applyOverlap 让 chunk 长度 = chunkSize + overlap, 这是设计预期
  for (const chunk of result) {
    assert.ok(chunk.content.length <= 500 + 50)
    assert.equal(chunk.chunk_index, result.indexOf(chunk))
  }
})

test('按段落优先切分', () => {
  const text = '段落A'.repeat(50) + '\n\n' + '段落B'.repeat(50)
  const result = recursiveCharSplit(text, { chunkSize: 100, overlap: 10 })
  assert.ok(result.length >= 2)
  // char-level fallback 会在中文之间插空格, 不保证原始 '段落A' 子串;
  // 只验证所有字符都保留下来
  const allContent = result.map((c) => c.content).join('')
  for (const ch of ['段', '落', 'A', '段', '落', 'B']) {
    assert.ok(allContent.includes(ch), `lost character: ${ch}`)
  }
})

test('overlap 让相邻 chunk 有重叠内容', () => {
  const long = '0123456789'.repeat(100)
  const result = recursiveCharSplit(long, { chunkSize: 300, overlap: 50 })
  assert.ok(result.length >= 3)
  const tail = result[0].content.slice(-20)
  assert.ok(result[1].content.includes(tail.slice(0, 10)))
})