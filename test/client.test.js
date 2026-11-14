import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

/**
 * Load client.js the way the host module loader would: give it a `window` whose
 * `__ModuleLoader__.load` captures the module spec, and a React stand-in that is
 * enough to build element trees without a DOM.
 * @returns {Promise<{ spec: object, module: object, registrations: object[] }>} the captured module and its registrations.
 */
async function loadClient() {
  let spec = null
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: initial => [initial, () => {}],
    useEffect: () => {},
    useCallback: fn => fn,
    Component: class Component {
      constructor(props) {
        this.props = props
        this.state = {}
      }
      setState(next) {
        this.state = { ...this.state, ...next }
      }
    },
  }
  const document = {
    head: { appendChild() {} },
    createElement: () => ({ remove() {} }),
  }
  const window = { __ModuleLoader__: { load: loaded => { spec = loaded } } }
  const source = await readFile(new URL('../learning-center/client.js', import.meta.url), 'utf8')
  // eslint-disable-next-line no-new-func -- the module is plain browser JavaScript.
  new Function('window', 'document', source)(window, document)
  const require = name => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  }
  return { spec, module: spec.factory(require), registrations: [] }
}

/**
 * Model the host's restricted client context: reading a service the module did
 * not declare in `inject` throws, which is what killed the first real render.
 * @param {object[]} registrations - collected slot registrations.
 * @param {{ services?: object, inject?: string[] }} options - available services and declared injections.
 * @returns {object} the fake context.
 */
function fakeCtx(registrations, { services = {}, inject = ['slots'] } = {}) {
  const target = {
    effect: callback => {
      callback()
      return () => {}
    },
    get(name) {
      return services[name]
    },
    slots: {
      inject: (_key, callback) => {
        callback()
        return () => {}
      },
      register: (options, component) => {
        registrations.push({ options, component })
        return () => {}
      },
    },
  }
  return new Proxy(target, {
    get(source, property) {
      if (property in source) return source[property]
      if (inject.includes(property)) return services[property]
      throw new Error(`cannot get property "${String(property)}" without inject`)
    },
  })
}

test('client 模块暴露 loader id、slots 注入与 apply', async () => {
  const { spec, module } = await loadClient()
  assert.equal(spec.id, '@local/learning-center')
  assert.deepEqual(module.inject, ['slots'])
  assert.equal(typeof module.apply, 'function')
})

test('apply 只读声明过的服务，不会因为 layout/locale 未 inject 而崩', async () => {
  const { module, registrations } = await loadClient()
  // fakeCtx 只暴露 slots；layout 与 locale 只能通过 ctx.get 拿到
  const ctx = fakeCtx(registrations, {
    services: {
      layout: { selectPanel() {} },
      locale: { register() {}, bind: () => key => `T:${key}` },
    },
  })
  assert.doesNotThrow(() => module.apply(ctx))
  assert.equal(registrations.length, 2)
})

test('apply 同时注册侧栏图标与主面板', async () => {
  const { module, registrations } = await loadClient()
  module.apply(fakeCtx(registrations, { services: {} }))
  const ids = registrations.map(entry => entry.options.id ?? entry.options.key)
  assert.deepEqual(ids.sort(), ['learning', 'learning'])
  const main = registrations.find(entry => entry.options.key === 'learning')
  assert.equal(main.options.name, 'main')
})

test('首次打开渲染空状态而不是白屏', async () => {
  const { module, registrations } = await loadClient()
  module.apply(fakeCtx(registrations, { services: {} }))
  const main = registrations.find(entry => entry.options.key === 'learning')
  const element = main.component({ useSessionStatus: () => undefined })
  assert.ok(element, 'the slot must render something')
  const tree = element.type(element.props)
  assert.ok(tree, 'the panel must render something without a session')
  assert.equal(tree.type, 'div')
})

test('locale 绑定抛错时面板仍然渲染，不会白屏', async () => {
  const { module, registrations } = await loadClient()
  const ctx = fakeCtx(registrations, {
    services: {
      locale: {
        register() {},
        bind() {
          return () => {
            throw new Error('locale exploded')
          }
        },
      },
    },
  })
  module.apply(ctx)
  const main = registrations.find(entry => entry.options.key === 'learning')
  const wrapper = main.component({})
  const tree = wrapper.type(wrapper.props)
  assert.equal(tree.type, 'div')
})

test('主面板组件是 Panel，并接受标准 props', async () => {
  const { module, registrations } = await loadClient()
  module.apply(fakeCtx(registrations, { services: {} }))
  const main = registrations.find(entry => entry.options.key === 'learning')
  const wrapper = main.component({})
  assert.equal(wrapper.type.name, 'Panel')
})
