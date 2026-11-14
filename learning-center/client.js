// Placeholder Client half: Task 12 replaces this with the real panel.
// It exists so the bundle's `./client` export resolves and the sidebar/main
// registration can be verified before the UI is written.
window.__ModuleLoader__.load({
  id: '@local/learning-center',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    function Icon() {
      return h('svg', { viewBox: '0 0 64 64', width: 24, height: 24, 'aria-hidden': true },
        h('path', {
          d: 'M32 12 44 24 26 52 12 52 20 30z',
          fill: 'currentColor',
        }))
    }

    function Panel() {
      return h('div', { style: { padding: 32, fontFamily: 'inherit' } },
        h('h1', { style: { fontSize: 18, marginBottom: 8 } }, '学习中心'),
        h('p', { style: { opacity: 0.7 } }, '面板正在搭建（占位）。'))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'learning', order: 20,
        }, Icon))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'learning',
        }, Panel))
      },
    }
  },
})
