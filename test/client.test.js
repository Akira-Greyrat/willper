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

/**
 * Render the registered main slot through its boundary to the Panel tree.
 * @param {{ component: Function }} main - the registered main slot entry.
 * @param {object} [props] - slot props.
 * @returns {object} the Panel element tree.
 */
function renderPanel(main, props = {}) {
  const boundary = main.component(props)
  const panelElement = boundary.children[0]
  return panelElement.type(panelElement.props)
}

test('首次打开渲染空状态而不是白屏', async () => {
  const { module, registrations } = await loadClient()
  module.apply(fakeCtx(registrations, { services: {} }))
  const main = registrations.find(entry => entry.options.key === 'learning')
  const element = main.component({ useSessionStatus: () => undefined })
  assert.ok(element, 'the slot must render something')
  const tree = renderPanel(main, { useSessionStatus: () => undefined })
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
  const tree = renderPanel(main)
  assert.equal(tree.type, 'div')
})

test('渲染崩溃时显示错误信息而不是白屏', async () => {
  const { module } = await loadClient()
  const Boundary = module.__test && module.__test.PanelBoundary
  assert.ok(Boundary, 'should expose the boundary for tests')
  assert.equal(typeof Boundary.getDerivedStateFromError, 'function')
  const instance = new Boundary({ children: { type: 'div' } })
  instance.state = Boundary.getDerivedStateFromError(new Error('boom'))
  const tree = instance.render()
  assert.equal(tree.type, 'div')
  assert.ok(JSON.stringify(tree).includes('boom'), 'the message must be visible')
})

test('术语弹窗贴着术语定位，并夹在视口内', async () => {
  const { module } = await loadClient()
  const style = module.__test && module.__test.popoverStyle
  assert.equal(typeof style, 'function')
  const rect = { top: 100, bottom: 120, left: 200, right: 250 }
  const viewport = { width: 1200, height: 800 }
  const normal = style(rect, viewport)
  assert.equal(normal.top, '126px')
  assert.equal(normal.left, '200px')

  const nearRight = style({ top: 100, bottom: 120, left: 1100, right: 1150 }, viewport)
  assert.ok(Number.parseInt(nearRight.left, 10) + 320 <= 1200, 'must not overflow the right edge')

  const nearBottom = style({ top: 740, bottom: 760, left: 200, right: 250 }, viewport)
  assert.ok(nearBottom.bottom, 'flips above the term near the bottom edge')
  assert.equal(nearBottom.top, undefined)
})

test('mainPanel 组件是 Panel，外面套着错误边界', async () => {
  const { module, registrations } = await loadClient()
  module.apply(fakeCtx(registrations, { services: {} }))
  const main = registrations.find(entry => entry.options.key === 'learning')
  const element = main.component({})
  assert.equal(element.type.name, 'PanelBoundary')
  assert.equal(element.children[0].type.name, 'Panel')
})
