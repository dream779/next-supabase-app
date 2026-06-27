import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeNext } from './next'

test('relative path passes through', () => {
  assert.equal(sanitizeNext('/documents'), '/documents')
})

test('relative path with query passes through', () => {
  assert.equal(sanitizeNext('/documents?foo=bar'), '/documents?foo=bar')
})

test('protocol-relative URL is rejected', () => {
  assert.equal(sanitizeNext('//evil.com/path'), '/')
})

test('absolute http URL is rejected', () => {
  assert.equal(sanitizeNext('https://evil.com'), '/')
})

test('empty string falls back to default', () => {
  assert.equal(sanitizeNext(''), '/')
})

test('null falls back to default', () => {
  assert.equal(sanitizeNext(null), '/')
})

test('undefined falls back to default', () => {
  assert.equal(sanitizeNext(undefined), '/')
})

test('path without leading slash is rejected', () => {
  assert.equal(sanitizeNext('documents'), '/')
})

test('default is configurable', () => {
  assert.equal(sanitizeNext(null, '/account'), '/account')
})

test('javascript: scheme is rejected', () => {
  assert.equal(sanitizeNext('javascript:alert(1)'), '/')
})