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
    useRef: value => ({ current: value }),
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

test('题卡的关联网：有关联时出 chip，全空时出补漏按钮', async () => {
  const { module } = await loadClient()
  const Chips = module.__test && module.__test.RelatedChips
  assert.equal(typeof Chips, 'function')
  const noop = () => {}
  const filled = Chips({
    card: {
      related: { questions: ['q2'], deeper: ['为什么？'], broader: ['和谁有关？'] },
      relatedQuestions: [{ id: 'q2', stem: '另一道题的题干' }],
    },
    t: key => key,
    onOpenQuestion: noop,
    onAsk: noop,
    onFill: noop,
  })
  const filledText = JSON.stringify(filled)
  assert.ok(filledText.includes('另一道题的题干'))
  assert.ok(filledText.includes('为什么？'))
  assert.ok(filledText.includes('和谁有关？'))

  const empty = Chips({
    card: { related: { questions: [], deeper: [], broader: [] }, relatedQuestions: [] },
    t: key => key,
    onOpenQuestion: noop,
    onAsk: noop,
    onFill: noop,
  })
  assert.ok(JSON.stringify(empty).includes('relatedFill'))
})

test('关联网 chip 点击把对应内容交出去', async () => {
  const { module } = await loadClient()
  const Chips = module.__test && module.__test.RelatedChips
  const opened = []
  const asked = []
  const tree = Chips({
    card: {
      related: { questions: ['q2'], deeper: ['为什么？'], broader: [] },
      relatedQuestions: [{ id: 'q2', stem: '另一道题' }],
    },
    t: key => key,
    onOpenQuestion: id => opened.push(id),
    onAsk: text => asked.push(text),
    onFill: () => {},
  })
  const buttons = []
  const walk = node => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    if (!node || typeof node !== 'object') return
    if (node.type === 'button') buttons.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  assert.equal(buttons.length, 2)
  buttons[0].props.onClick()
  buttons[1].props.onClick()
  assert.deepEqual(opened, ['q2'])
  assert.deepEqual(asked, ['为什么？'])
})

test('点浮窗外部才关闭，点术语本身交给术语自己切换', async () => {
  const { module } = await loadClient()
  const isOutside = module.__test && module.__test.isOutsidePopover
  assert.equal(typeof isOutside, 'function')
  const card = { contains: node => node === 'inside-card' }
  assert.equal(isOutside('inside-card', card), false)
  assert.equal(isOutside('far-away', card), true)
  const termButton = { closest: selector => (selector === '.lc-term' ? {} : null) }
  assert.equal(isOutside(termButton, card), false, 'clicking another term keeps the popover open for the switch')
  assert.equal(isOutside(null, card), true)
})

test('释义卡片里的术语用强调色', async () => {
  const { module } = await loadClient()
  const Popover = module.__test && module.__test.TermPopover
  const accent = module.__test && module.__test.TERM_ACCENT
  assert.equal(typeof Popover, 'function')
  assert.match(accent, /^#[0-9a-f]{6}$/i)
  const tree = Popover({ term: { text: '闭包', definition: '函数与其词法环境' }, style: {}, onClose() {}, t: key => key })
  const heading = tree.children[0]
  assert.deepEqual(heading.children, ['闭包'])
  assert.equal(heading.props.style.color, accent)
})

test('侧栏图标用宿主同一套栅格与线宽', async () => {
  const { module } = await loadClient()
  const Icon = module.__test && module.__test.Icon
  assert.ok(Icon, 'should expose the sidebar icon for tests')
  const element = Icon({ size: 20, active: true })
  assert.equal(element.type, 'svg')
  assert.equal(element.props.width, 20)
  assert.equal(element.props.height, 20)
  assert.equal(element.props.viewBox, '0 0 16 16')
  assert.equal(element.props.fill, 'none')
  assert.equal(element.props.stroke, 'currentColor')
  assert.equal(element.props.strokeWidth, 1.5)
  assert.equal(element.props['aria-hidden'], true)
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

test('判分结果块：低分带优化答案，高分不带', async () => {
  const { module } = await loadClient()
  const Block = module.__test && module.__test.GradeBlock
  assert.equal(typeof Block, 'function')
  const low = Block({ attempt: { grade: { covered: ['a'], missed: ['b'], wrong: ['x'], feedback: '再补 b', suggestion: '更好：……', score: 0.5 } }, t: key => key })
  const text = JSON.stringify(low)
  assert.ok(text.includes('再补 b'))
  assert.ok(text.includes('更好：……'))
  const high = Block({ attempt: { grade: { covered: ['a'], missed: [], wrong: [], feedback: '好', suggestion: '', score: 1 } }, t: key => key })
  assert.ok(!JSON.stringify(high).includes('更好：……'))
})

test('没有要点的题不能提交', async () => {
  const { module } = await loadClient()
  const canSubmit = module.__test && module.__test.canSubmit
  assert.equal(typeof canSubmit, 'function')
  assert.equal(canSubmit({ reference: { answer: 'a', points: [] } }), false)
  assert.equal(canSubmit({ reference: { answer: 'a', points: ['p'] } }), true)
  assert.equal(canSubmit({ reference: { answer: 'a' } }), false)
})
test('抽查弹卡有答题框与三个动作', async () => {
  const { module } = await loadClient()
  const Modal = module.__test && module.__test.QuizModal
  assert.equal(typeof Modal, 'function')
  const tree = Modal({
    card: { id: 'q1', stem: '题干内容' },
    t: key => key,
    answer: '',
    onAnswer: () => {},
    grading: 'idle',
    gradeAttempt: null,
    onSubmit: () => {},
    onSkip: () => {},
    onMute: () => {},
  })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('题干内容'))
  const buttons = []
  const walk = node => {
    if (Array.isArray(node)) { for (const item of node) walk(item); return }
    if (!node || typeof node !== 'object') return
    if (node.type === 'button') buttons.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  assert.equal(buttons.length, 3)
})

test('错题本每行有再答一次与移出', async () => {
  const { module } = await loadClient()
  const List = module.__test && module.__test.WeakList
  assert.equal(typeof List, 'function')
  const tree = List({ items: [{ id: 'q1', stem: '题干', misses: 2, lastScore: 0.5 }], t: key => key, onOpen: () => {}, onDismiss: () => {} })
  const buttons = []
  const walk = node => {
    if (Array.isArray(node)) { for (const item of node) walk(item); return }
    if (!node || typeof node !== 'object') return
    if (node.type === 'button') buttons.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  assert.equal(buttons.length, 2)
})
test('打开未判完的题会回到等待态', async () => {
  const { module } = await loadClient()
  const stateOf = module.__test && module.__test.gradingStateFor
  assert.equal(typeof stateOf, 'function')
  assert.deepEqual(stateOf({ lastAttempt: { id: 'a1', grade: null } }), { grading: 'waiting', pendingAttemptId: 'a1' })
  assert.deepEqual(stateOf({ lastAttempt: { id: 'a1', grade: { score: 1 } } }), { grading: 'idle', pendingAttemptId: null })
  assert.deepEqual(stateOf(null), { grading: 'idle', pendingAttemptId: null })
})

test('轮询结果只作用于当前 attempt', async () => {
  const { module } = await loadClient()
  const still = module.__test && module.__test.stillPending
  assert.equal(typeof still, 'function')
  assert.equal(still({ attemptId: 'a1', questionId: 'q1' }, 'a1'), true)
  assert.equal(still({ attemptId: 'a1', questionId: 'q1' }, 'a2'), false)
  assert.equal(still(null, 'a1'), false)
})

test('补充答案在展开参考答案之后才出现', async () => {
  const { module } = await loadClient()
  const Card = module.__test && module.__test.QuestionCard
  assert.equal(typeof Card, 'function')
  const card = {
    id: 'q1', stem: '题干', termHits: [], favorite: false, source: {},
    reference: { answer: '标准', points: ['a'], supplement: '面试里我会这样讲' },
    related: { questions: [], deeper: [], broader: [] }, relatedQuestions: [],
  }
  const t = key => key
  const closed = JSON.stringify(Card({ card, t, shownSeen: 0, shownTotal: 1, answerOpen: false, onToggleAnswer() {}, onPickTerm() {}, onNext() {}, onPrev() {}, onFavorite() {}, onRevisit() {}, revisit: false }))
  const opened = JSON.stringify(Card({ card, t, shownSeen: 0, shownTotal: 1, answerOpen: true, onToggleAnswer() {}, onPickTerm() {}, onNext() {}, onPrev() {}, onFavorite() {}, onRevisit() {}, revisit: false }))
  assert.ok(!closed.includes('面试里我会这样讲'))
  assert.ok(opened.includes('面试里我会这样讲'))
})

test('没有要点的抽查卡不能提交', async () => {
  const { module } = await loadClient()
  const Modal = module.__test.QuizModal
  assert.equal(typeof Modal, 'function')
  const base = { card: { id: 'q1', stem: '题干' }, t: key => key, answer: '有内容', onAnswer() {}, grading: 'idle', gradeAttempt: null, onSubmit() {}, onSkip() {}, onMute() {} }
  const buttons = []
  const walk = node => {
    if (Array.isArray(node)) { for (const item of node) walk(item); return }
    if (!node || typeof node !== 'object') return
    if (node.type === 'button') buttons.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(Modal({ ...base, points: [] }))
  const submit = buttons.find(button => JSON.stringify(button).includes('submitGrade'))
  assert.equal(submit.props.disabled, true)
  buttons.length = 0
  walk(Modal({ ...base, points: ['a'] }))
  const enabled = buttons.find(button => JSON.stringify(button).includes('submitGrade'))
  assert.equal(enabled.props.disabled, false)
})
test('计划页显示阶段与状态按钮，空时为引导', async () => {
  const { module } = await loadClient()
  const List = module.__test && module.__test.PlanList
  assert.equal(typeof List, 'function')
  const tree = List({
    stages: [{ id: 'p_1', title: '第一阶段', status: 'doing', nodeTitles: ['基础'], checkpoints: ['能讲清'], project: { title: '写个计数器', deliverable: '一个脚本' }, reading: [{ file: 'materials/a.md', section: '第 3 节' }], prereqs: ['动态作用域'], perspectives: ['工程视角'] }],
    t: key => key,
    onStatus() {},
    onAsk() {},
  })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('第一阶段'))
  assert.ok(text.includes('基础'))
  assert.ok(text.includes('写个计数器'))
  assert.ok(text.includes('materials/a.md'))
  assert.ok(text.includes('动态作用域'))
  const buttons = []
  const walk = node => {
    if (Array.isArray(node)) { for (const item of node) walk(item); return }
    if (!node || typeof node !== 'object') return
    if (node.type === 'button') buttons.push(node)
    for (const child of node.children ?? []) walk(child)
  }
  walk(tree)
  assert.equal(buttons.length, 3)

  const empty = List({ stages: [], t: key => key, onStatus() {}, onAsk() {} })
  assert.ok(JSON.stringify(empty).includes('planEmpty'))
})

test('计划页兼容字符串形状的 reading 与 project', async () => {
  const { module } = await loadClient()
  const List = module.__test.PlanList
  const tree = List({ stages: [{ id: 'p_1', title: '一', status: 'todo', nodeTitles: [], checkpoints: [], reading: '第 3-5 节', project: '写个计数器', prereqs: [], perspectives: [] }], t: key => key, onStatus() {}, onAsk() {} })
  const text = JSON.stringify(tree)
  assert.ok(text.includes('第 3-5 节'))
  assert.ok(text.includes('写个计数器'))
})

test('体检页无报告时给按钮，有报告时显示正文', async () => {
  const { module } = await loadClient()
  const Pane = module.__test && module.__test.ReportPane
  assert.equal(typeof Pane, 'function')
  const empty = Pane({ report: null, t: key => key, onAsk() {} })
  assert.ok(JSON.stringify(empty).includes('reportEmpty'))
  const filled = Pane({ report: { at: '2026-11-16T00:00:00.000Z', markdown: '覆盖缺口 2 个' }, t: key => key, onAsk() {} })
  assert.ok(JSON.stringify(filled).includes('覆盖缺口 2 个'))
})