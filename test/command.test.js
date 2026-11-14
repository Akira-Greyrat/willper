import test from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../learning-center/src/store.js'
import { registerCommand } from '../learning-center/src/command.js'
import { withTempStore } from './helpers.js'

const agent = { session: { id: 's_1' } }

const withCommand = (fn) => withTempStore(async (_paths, baseDir) => {
  const store = createStore(baseDir)
  const prompted = []
  let definition
  const ctx = {
    commands: {
      register(def) {
        definition = def
        return () => {}
      },
    },
  }
  registerCommand(ctx, {
    storeFor: async () => store,
    promptAgent: async (_agent, text) => {
      prompted.push(text)
      return true
    },
  })
  await fn({ definition, prompted, store })
})

test('/learn 注册时带名字、描述、输入提示与处理器', async () => {
  await withCommand(async ({ definition }) => {
    assert.equal(definition.name, 'learn')
    assert.ok(definition.description.length > 5)
    assert.ok(definition.input.hint.includes('plan'))
    assert.equal(typeof definition.handler, 'function')
    assert.ok(definition.definitionId)
  })
})

test('plan 子命令把含 learning_status 的说明发给会话', async () => {
  await withCommand(async ({ definition, prompted }) => {
    const r = definition.handler({ agent, rawInput: 'plan', attachments: [] })
    assert.equal(r.kind, 'success')
    assert.equal(prompted.length, 1)
    assert.ok(prompted[0].includes('learning_status'))
    assert.ok(prompted[0].includes('learning_plan'))
  })
})

test('import 子命令带上文件名', async () => {
  await withCommand(async ({ definition, prompted }) => {
    const r = definition.handler({ agent, rawInput: 'import materials/bank.md', attachments: [] })
    assert.equal(r.kind, 'success')
    assert.ok(prompted[0].includes('materials/bank.md'))
    assert.ok(prompted[0].includes('learning_import'))
  })
})

test('import 缺文件名时是 error 并给用法', async () => {
  await withCommand(async ({ definition, prompted }) => {
    const r = definition.handler({ agent, rawInput: 'import', attachments: [] })
    assert.equal(r.kind, 'error')
    assert.ok(r.text.includes('/learn import'))
    assert.equal(prompted.length, 0)
  })
})

test('ask 把问题发出去，空问题报错', async () => {
  await withCommand(async ({ definition, prompted }) => {
    const ok = definition.handler({ agent, rawInput: 'ask 为什么闭包能记住外层变量', attachments: [] })
    assert.equal(ok.kind, 'success')
    assert.ok(prompted[0].includes('为什么闭包能记住外层变量'))
    const bad = definition.handler({ agent, rawInput: 'ask   ', attachments: [] })
    assert.equal(bad.kind, 'error')
  })
})

test('没有子命令时给用法', async () => {
  await withCommand(async ({ definition }) => {
    const r = definition.handler({ agent, rawInput: '', attachments: [] })
    assert.equal(r.kind, 'success')
    assert.ok(r.text.includes('/learn'))
  })
})

test('未知子命令是 error', async () => {
  await withCommand(async ({ definition }) => {
    const r = definition.handler({ agent, rawInput: 'frobnicate', attachments: [] })
    assert.equal(r.kind, 'error')
    assert.ok(r.text.includes('/learn'))
  })
})
