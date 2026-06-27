/**
 * M2 verification: RLS multi-user isolation.
 *
 * 流程:
 *   1. admin 建 2 个测试用户 (A, B) + email_confirm
 *   2. 用密码签入, 拿 2 个 anon client (各持一个 user session)
 *   3. 互验:
 *      - A 插 1 个 document + chunk (用真实 embedding)
 *      - B SELECT documents → 0 行
 *      - B INSERT chunk for A 的 document → 失败 (RLS)
 *      - A SELECT chunks → 1 行
 *      - A 调 match_chunks (用真实 embedding) → 拿到 A 的 chunk
 *      - B 调 match_chunks (同样 query) → 0 行
 *   4. 清理: admin delete 2 个 user (cascade documents + chunks)
 *
 * 跑法: pnpm tsx scripts/test-rls.ts
 *
 * 需要的 .env.local 变量:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY, ARK_API_KEY,
 *   SUPABASE_TEST_USER_PASSWORD
 */

import './_env'
import assert from 'node:assert/strict'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../lib/supabase/admin'
import { embedQuery } from '../lib/embedding'

const PASSWORD = process.env.SUPABASE_TEST_USER_PASSWORD
if (!PASSWORD) {
  console.error('Set SUPABASE_TEST_USER_PASSWORD in .env.local')
  process.exit(1)
}
const TEST_PASSWORD: string = PASSWORD

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const USER_A_EMAIL = `rls-test-a-${Date.now()}@example.com`
const USER_B_EMAIL = `rls-test-b-${Date.now()}@example.com`
const TEST_DOC_TITLE = 'RLS isolation test doc'
const TEST_DOC_CONTENT = 'A unique sentence about React Server Components and RSC.'
const TEST_QUERY = 'React Server Components'

type TestUser = {
  id: string
  email: string
  client: SupabaseClient
}

async function createTestUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<TestUser> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser(${email}) failed: ${error?.message}`)

  const client = createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: signInErr } = await client.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  })
  if (signInErr) throw new Error(`signInWithPassword(${email}) failed: ${signInErr.message}`)

  return { id: data.user.id, email, client }
}

async function main() {
  const admin = createAdminClient()
  console.log('✓ Admin client created')

  // 1. Create 2 test users
  const userA = await createTestUser(admin, USER_A_EMAIL)
  const userB = await createTestUser(admin, USER_B_EMAIL)
  console.log(`✓ Created user A: ${userA.id}`)
  console.log(`✓ Created user B: ${userB.id}`)

  try {
    // 2. A inserts a document
    const { data: doc, error: docErr } = await userA.client
      .from('documents')
      .insert({ user_id: userA.id, title: TEST_DOC_TITLE })
      .select()
      .single()
    if (docErr || !doc) throw new Error(`A insert document failed: ${docErr?.message}`)
    console.log(`✓ A inserted document: ${doc.id}`)

    // A inserts chunk with real embedding (zero vector breaks pgvector cosine)
    const chunkEmbedding = await embedQuery(TEST_DOC_CONTENT)
    const { error: chunkErr } = await userA.client.from('chunks').insert({
      document_id: doc.id,
      content: TEST_DOC_CONTENT,
      embedding: JSON.stringify(chunkEmbedding),
      chunk_index: 0,
      token_count: 10,
    })
    if (chunkErr) throw new Error(`A insert chunk failed: ${chunkErr.message}`)
    console.log(`✓ A inserted chunk for A's document (real embedding, dim=${chunkEmbedding.length})`)

    // 3. B sees no documents
    const { data: bDocs, error: bSelErr } = await userB.client.from('documents').select('*')
    if (bSelErr) throw new Error(`B select documents failed: ${bSelErr?.message}`)
    assert.equal(bDocs.length, 0, 'B should not see A documents')
    console.log(`✓ B SELECT documents → 0 rows (isolated)`)

    // 4. B cannot insert chunk for A's document
    const { error: bInsertErr } = await userB.client.from('chunks').insert({
      document_id: doc.id,
      content: 'malicious',
      embedding: JSON.stringify(chunkEmbedding),
      chunk_index: 99,
      token_count: 1,
    })
    assert.ok(bInsertErr, 'B should be blocked from inserting chunk on A document')
    console.log(`✓ B INSERT chunk on A's document → blocked (${bInsertErr.code ?? 'no code'})`)

    // 5. A sees own chunk
    const { data: aChunks, error: aChunkSelErr } = await userA.client.from('chunks').select('*')
    if (aChunkSelErr) throw new Error(`A select chunks failed: ${aChunkSelErr.message}`)
    assert.equal(aChunks.length, 1, 'A should see own chunk')
    assert.equal(aChunks[0].document_id, doc.id)
    console.log(`✓ A SELECT chunks → 1 row (own chunk)`)

    // 6. match_chunks: A gets the chunk, B gets nothing
    const queryEmbedding = await embedQuery(TEST_QUERY)
    const { data: aMatches, error: aRpcErr } = await userA.client.rpc('match_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: 5,
    })
    if (aRpcErr) throw new Error(`A match_chunks failed: ${aRpcErr.message}`)
    assert.ok((aMatches ?? []).length >= 1, 'A should retrieve at least own chunk via RPC')
    console.log(`✓ A match_chunks → ${aMatches!.length} row(s)`)

    const { data: bMatches, error: bRpcErr } = await userB.client.rpc('match_chunks', {
      query_embedding: JSON.stringify(queryEmbedding),
      match_count: 5,
    })
    if (bRpcErr) throw new Error(`B match_chunks failed: ${bRpcErr.message}`)
    assert.equal((bMatches ?? []).length, 0, 'B should retrieve 0 rows via RPC')
    console.log(`✓ B match_chunks → 0 rows (isolated)`)

    console.log('\n🎉 M2 RLS isolation: all assertions passed')
  } finally {
    // Always delete test users (cascade nukes documents + chunks)
    await admin.auth.admin.deleteUser(userA.id)
    await admin.auth.admin.deleteUser(userB.id)
    console.log(`✓ Cleaned up test users`)
  }
}

main().catch((err) => {
  console.error('\n❌ M2 verification failed:', err)
  process.exit(1)
})
