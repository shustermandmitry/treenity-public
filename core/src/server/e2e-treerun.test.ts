// E2E test for the treerun (create-treenity) experience.
// Tests: factory boot → seed → tRPC → persistence across restart
// Covers both templates: minimal and agent-runtime.
// Run: npm run test:e2e

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import type { Server } from 'node:http'
import type { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import type { Tree } from '#tree'
import { createClient } from './client'
import { treenity } from './factory'

// -- Seeds matching create-treenity templates --

async function minimalSeed(_tree: Tree) {
  // _base template: empty seed
}

async function agentRuntimeSeed(tree: Tree) {
  if (await tree.get('/agents')) return

  await tree.set({ $path: '/agents', $type: 'ai.pool', maxConcurrent: 2, active: [], queue: [] })
  await tree.set({
    $path: '/agents/guardian', $type: 'dir',
    policy: {
      $type: 'ai.policy',
      allow: ['mcp__treenity__get_node', 'mcp__treenity__list_children'],
      deny: ['mcp__treenity__remove_node'],
      escalate: ['mcp__treenity__set_node'],
    },
  })
  await tree.set({ $path: '/agents/approvals', $type: 'ai.approvals' })
  await tree.set({
    $path: '/agents/qa', $type: 'ai.agent',
    role: 'qa', status: 'idle', currentTask: '', taskRef: '',
    lastRunAt: 0, totalTokens: 0,
  })
  await tree.set({ $path: '/agents/qa/tasks', $type: 'dir' })
  await tree.set({
    $path: '/agents/dev', $type: 'ai.agent',
    role: 'dev', status: 'idle', currentTask: '', taskRef: '',
    lastRunAt: 0, totalTokens: 0,
  })
  await tree.set({ $path: '/agents/dev/tasks', $type: 'dir' })
  await tree.set({ $path: '/board', $type: 'board.kanban' })
  await tree.set({ $path: '/board/backlog', $type: 'board.column', title: 'Backlog', order: 0 })
  await tree.set({ $path: '/board/data', $type: 'dir' })
  await tree.set({
    $path: '/board/data/hello-world', $type: 'board.task',
    title: 'Hello World', status: 'todo', priority: 'normal', createdAt: Date.now(),
  })
}

// -- Test infra --

type App = Awaited<ReturnType<typeof treenity>>

type Ctx = {
  app: App
  server: Server
  url: string
  tmpDir: string
  sockets: Set<Socket>
}

async function boot(seed: (tree: Tree) => Promise<void>, tmpDir?: string): Promise<Ctx> {
  const dir = tmpDir ?? mkdtempSync(join(tmpdir(), 'treerun-e2e-'))
  const app = await treenity({ dataDir: dir, modsDir: false, seed, autostart: false })
  const server = await app.listen(0, { allowedOrigins: ['*'] })
  const sockets = new Set<Socket>()
  server.on('connection', (s: Socket) => {
    sockets.add(s)
    s.on('close', () => sockets.delete(s))
  })
  const port = (server.address() as { port: number }).port
  return { app, server, url: `http://127.0.0.1:${port}/`, tmpDir: dir, sockets }
}

async function shutdown(ctx: Ctx) {
  for (const s of ctx.sockets) s.destroy()
  ctx.sockets.clear()
  await ctx.app.stop()
  await new Promise<void>(r => ctx.server.close(() => r()))
}

// -- Minimal template --

describe('e2e: treerun minimal', () => {
  let ctx: Ctx

  before(async () => { ctx = await boot(minimalSeed) })
  after(async () => {
    await shutdown(ctx)
    rmSync(ctx.tmpDir, { recursive: true, force: true })
  })

  it('root node exists', async () => {
    const c = createClient(ctx.url)
    const root = await c.get.query({ path: '/' })
    assert.ok(root)
    assert.equal(root.$type, 'root')
  })

  it('CRUD set → get → remove', async () => {
    const c = createClient(ctx.url)
    await c.set.mutate({ node: { $path: '/test', $type: 'doc', title: 'hello' } })

    const node = await c.get.query({ path: '/test' })
    assert.equal(node?.$type, 'doc')
    assert.equal((node as Record<string, unknown>).title, 'hello')

    await c.remove.mutate({ path: '/test' })
    assert.equal(await c.get.query({ path: '/test' }), undefined)
  })

  it('getChildren with pagination', async () => {
    const c = createClient(ctx.url)
    await c.set.mutate({ node: { $path: '/parent', $type: 'dir' } })
    await c.set.mutate({ node: { $path: '/parent/a', $type: 'doc' } })
    await c.set.mutate({ node: { $path: '/parent/b', $type: 'doc' } })
    await c.set.mutate({ node: { $path: '/parent/c', $type: 'doc' } })

    const page = await c.getChildren.query({ path: '/parent', limit: 2 })
    assert.equal(page.items.length, 2)
    assert.equal(page.total, 3)
  })

  it('auth: register → login → me', async () => {
    const c = createClient(ctx.url)
    const reg = await c.register.mutate({ userId: 'tester', password: 'pass' })
    assert.ok(reg.token)

    const login = await c.login.mutate({ userId: 'tester', password: 'pass' })
    assert.ok(login.token)

    const me = await createClient(ctx.url, login.token).me.query()
    assert.equal(me?.userId, 'tester')
  })

  it('NOT_FOUND on missing node', async () => {
    const c = createClient(ctx.url)
    await assert.rejects(
      () => c.execute.mutate({ path: '/ghost', action: 'nope' }),
      (e: any) => e.data?.code === 'NOT_FOUND',
    )
  })
})

// -- Agent-runtime template --

describe('e2e: treerun agent-runtime', () => {
  let ctx: Ctx

  before(async () => { ctx = await boot(agentRuntimeSeed) })
  after(async () => {
    await shutdown(ctx)
    rmSync(ctx.tmpDir, { recursive: true, force: true })
  })

  it('root exists', async () => {
    const c = createClient(ctx.url)
    const root = await c.get.query({ path: '/' })
    assert.ok(root)
    assert.equal(root.$type, 'root')
  })

  it('seed: agent pool', async () => {
    const c = createClient(ctx.url)
    const pool = await c.get.query({ path: '/agents' })
    assert.ok(pool)
    assert.equal(pool.$type, 'ai.pool')
    assert.equal((pool as Record<string, unknown>).maxConcurrent, 2)
  })

  it('seed: guardian with policy', async () => {
    const c = createClient(ctx.url)
    const guardian = await c.get.query({ path: '/agents/guardian' })
    assert.ok(guardian)
    const policy = (guardian as Record<string, any>).policy
    assert.ok(policy)
    assert.ok(Array.isArray(policy.allow))
    assert.ok(Array.isArray(policy.deny))
    assert.ok(Array.isArray(policy.escalate))
  })

  it('seed: QA + Dev agents', async () => {
    const c = createClient(ctx.url)
    for (const name of ['qa', 'dev']) {
      const agent = await c.get.query({ path: `/agents/${name}` })
      assert.ok(agent, `${name} agent should exist`)
      assert.equal(agent.$type, 'ai.agent')
      assert.equal((agent as Record<string, unknown>).role, name)
    }
  })

  it('seed: agent task dirs', async () => {
    const c = createClient(ctx.url)
    for (const name of ['qa', 'dev']) {
      const tasks = await c.get.query({ path: `/agents/${name}/tasks` })
      assert.ok(tasks, `${name}/tasks should exist`)
      assert.equal(tasks.$type, 'dir')
    }
  })

  it('seed: board + column + sample task', async () => {
    const c = createClient(ctx.url)

    const board = await c.get.query({ path: '/board' })
    assert.equal(board?.$type, 'board.kanban')

    const backlog = await c.get.query({ path: '/board/backlog' })
    assert.equal(backlog?.$type, 'board.column')

    const tasks = await c.getChildren.query({ path: '/board/data' })
    assert.ok(tasks.items.length >= 1)
    assert.equal(tasks.items[0].$type, 'board.task')
  })

  it('agents tree: all children present', async () => {
    const c = createClient(ctx.url)
    const children = await c.getChildren.query({ path: '/agents' })
    const paths = children.items.map(n => n.$path)
    assert.ok(paths.includes('/agents/guardian'))
    assert.ok(paths.includes('/agents/approvals'))
    assert.ok(paths.includes('/agents/qa'))
    assert.ok(paths.includes('/agents/dev'))
  })

  it('CRUD works alongside seed data', async () => {
    const c = createClient(ctx.url)
    await c.set.mutate({
      node: { $path: '/board/data/e2e-task', $type: 'board.task', title: 'E2E', status: 'todo' },
    })

    const tasks = await c.getChildren.query({ path: '/board/data' })
    assert.ok(tasks.items.length >= 2)
    assert.ok(tasks.items.some(n => n.$path === '/board/data/e2e-task'))
  })
})

// -- Persistence: data survives server restart --

describe('e2e: treerun persistence', () => {
  let tmpDir: string

  before(() => { tmpDir = mkdtempSync(join(tmpdir(), 'treerun-persist-')) })
  after(() => { rmSync(tmpDir, { recursive: true, force: true }) })

  it('data survives restart, seed is idempotent', async () => {
    // Boot 1: seed + write extra data
    const ctx1 = await boot(agentRuntimeSeed, tmpDir)
    const c1 = createClient(ctx1.url)
    await c1.set.mutate({ node: { $path: '/persist-check', $type: 'doc', survived: true } })

    const before = await c1.get.query({ path: '/persist-check' })
    assert.ok(before)
    await shutdown(ctx1)

    // Boot 2: same dataDir — seed checks /agents and skips (idempotent)
    const ctx2 = await boot(agentRuntimeSeed, tmpDir)
    const c2 = createClient(ctx2.url)

    // Seed data survived
    const agents = await c2.get.query({ path: '/agents' })
    assert.ok(agents, 'Seed data should persist across restart')
    assert.equal(agents.$type, 'ai.pool')

    // Custom data survived
    const persisted = await c2.get.query({ path: '/persist-check' })
    assert.ok(persisted, 'Custom data should persist across restart')
    assert.equal((persisted as Record<string, unknown>).survived, true)

    await shutdown(ctx2)
  })
})
