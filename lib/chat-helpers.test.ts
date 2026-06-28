import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateTitle, latestUserText } from './chat-helpers'
import type { UIMessage } from 'ai'

test('truncateTitle: 短文本不动', () => {
  assert.equal(truncateTitle('hello'), 'hello')
})

test('truncateTitle: 空字符串', () => {
  assert.equal(truncateTitle(''), '')
})

test('truncateTitle: 正好 max 字符', () => {
  const s = 'a'.repeat(30)
  assert.equal(truncateTitle(s), s)
})

test('truncateTitle: 超长截取 + 省略号', () => {
  const s = 'a'.repeat(50)
  assert.equal(truncateTitle(s, 30), 'a'.repeat(30) + '…')
})

test('truncateTitle: 合并多空白 + trim', () => {
  assert.equal(truncateTitle('  hello\n\n  world  '), 'hello world')
})

test('truncateTitle: 截断后多空白合并', () => {
  const s = 'a'.repeat(15) + '   ' + 'b'.repeat(20)
  const result = truncateTitle(s, 30)
  assert.ok(!result.includes('  '))
  assert.ok(result.endsWith('…'))
})

test('latestUserText: 取最后一条 user 消息', () => {
  const messages: UIMessage[] = [
    { id: '1', role: 'user', parts: [{ type: 'text', text: 'first' }] },
    { id: '2', role: 'assistant', parts: [{ type: 'text', text: 'reply' }] },
    { id: '3', role: 'user', parts: [{ type: 'text', text: 'second' }] },
  ]
  assert.equal(latestUserText(messages), 'second')
})

test('latestUserText: 无 user 消息返回空串', () => {
  const messages: UIMessage[] = [
    { id: '1', role: 'assistant', parts: [{ type: 'text', text: 'hi' }] },
  ]
  assert.equal(latestUserText(messages), '')
})

test('latestUserText: 拼接多个 text parts', () => {
  const messages: UIMessage[] = [
    {
      id: '1',
      role: 'user',
      parts: [
        { type: 'text', text: 'hello ' },
        { type: 'text', text: 'world' },
      ],
    },
  ]
  assert.equal(latestUserText(messages), 'hello world')
})

test('latestUserText: 忽略非 text parts', () => {
  const messages: UIMessage[] = [
    {
      id: '1',
      role: 'user',
      parts: [
        { type: 'text', text: 'q:' },
        // @ts-expect-error - 测试故意混入未知 type
        { type: 'file', url: 'x' },
        { type: 'text', text: ' rest' },
      ],
    },
  ]
  assert.equal(latestUserText(messages), 'q: rest')
})