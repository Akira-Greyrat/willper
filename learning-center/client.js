/**
 * Client half of the learning-center bundle: one main panel plus one sidebar
 * icon, both keyed `learning`. Everything it shows comes from
 * `POST /api/learning`; it never reads the session log and never calls a model.
 * @module @local/learning-center/client
 */

window.__ModuleLoader__.load({
  id: '@local/learning-center',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useState } = React

    const API = '/api/learning'

    /** Interface copy; the locale service takes over when it is available. */
    const ZH = {
      title: '学习中心',
      study: '学习',
      bank: '题库',
      favorite: '收藏',
      emptyTitle: '还没有学习目标',
      emptyHint: '写一句目标和当前水平，剩下的交给会话里的 AI。',
      goalTitle: '目标（例如：某某认证 / 某门课）',
      goalStatement: '一句话目标（例如：六周内能独立解释并动手实现……）',
      goalLevel: '当前水平',
      level: { beginner: '入门', elementary: '初级', intermediate: '中级', advanced: '高级' },
      save: '保存目标',
      planCta: '让 AI 拆知识点与阶段',
      goToChat: '去看',
      sent: '已发到对话',
      next: '下一题',
      reveal: '看参考答案',
      hide: '收起答案',
      points: '要点',
      source: '来源',
      page: '第 %s 页',
      noQuestions: '这个知识点还没有可练的题。',
      needsReview: '待核对',
      accept: '接受',
      reject: '驳回',
      edit: '改',
      editPrompt: '把题干改成（留空取消）：',
      emptyBank: '题库还是空的。先让 AI 导入。',
      emptyFavorites: '还没有收藏。',
      noTree: '还没有知识点骨架。',
      loading: '加载中…',
      sessionMissing: '先选中一个会话。',
      error: '出错了：',
      allNodes: '全部知识点',
      seen: '本知识点可练 %s 题',
    }

    const EN = {
      title: 'Learning center',
      study: 'Study',
      bank: 'Bank',
      favorite: 'Favourites',
      emptyTitle: 'No learning target yet',
      emptyHint: 'Write your goal and current level; the session AI does the rest.',
      goalTitle: 'Target (a certification, a course)',
      goalStatement: 'One-sentence goal',
      goalLevel: 'Current level',
      level: { beginner: 'Beginner', elementary: 'Elementary', intermediate: 'Intermediate', advanced: 'Advanced' },
      save: 'Save target',
      planCta: 'Ask the AI for the topic tree',
      goToChat: 'Open chat',
      sent: 'Sent to the conversation',
      next: 'Next',
      reveal: 'Show reference answer',
      hide: 'Hide answer',
      points: 'Key points',
      source: 'Source',
      page: 'page %s',
      noQuestions: 'No practiceable question under this topic yet.',
      needsReview: 'Needs review',
      accept: 'Accept',
      reject: 'Reject',
      edit: 'Edit',
      editPrompt: 'New stem (empty cancels):',
      emptyBank: 'The bank is empty. Ask the AI to import one.',
      emptyFavorites: 'Nothing favourited yet.',
      noTree: 'No topic tree yet.',
      loading: 'Loading…',
      sessionMissing: 'Select a session first.',
      error: 'Error: ',
      allNodes: 'All topics',
      seen: '%s questions under this topic',
    }

    const CSS = `
      .lc-root { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 14px; }
      .lc-head { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--dsw-alias-border-l1); flex: 0 0 auto; }
      .lc-title { font-size: 15px; font-weight: 600; margin: 0; }
      .lc-tabs { display: flex; gap: 4px; margin-left: 8px; }
      .lc-tab { border: 0; background: transparent; color: var(--dsw-alias-label-secondary); padding: 6px 10px; border-radius: 6px; cursor: pointer; font: inherit; }
      .lc-tab[data-active="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .lc-body { display: flex; flex: 1 1 auto; min-height: 0; }
      .lc-tree { width: 236px; flex: 0 0 236px; border-right: 1px solid var(--dsw-alias-border-l1); overflow: auto; padding: 10px; }
      .lc-node { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; width: 100%; text-align: left; border: 0; background: transparent; color: inherit; font: inherit; padding: 6px 8px; border-radius: 6px; cursor: pointer; }
      .lc-node:hover { background: var(--dsw-alias-bg-layer-2); }
      .lc-node[data-active="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
      .lc-node-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .lc-main { flex: 1 1 auto; min-width: 0; overflow: auto; padding: 20px 24px; }
      .lc-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 18px 20px; max-width: 760px; }
      .lc-stem { white-space: pre-wrap; line-height: 1.7; font-size: 15px; margin: 0 0 14px; }
      .lc-term { border: 0; background: transparent; padding: 0; font: inherit; color: var(--dsw-alias-brand-primary); border-bottom: 1px dashed var(--dsw-alias-brand-primary); cursor: pointer; }
      .lc-pop { margin: 8px 0 0; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-overlay); white-space: pre-wrap; line-height: 1.6; }
      .lc-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .lc-btn { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 6px 12px; cursor: pointer; font: inherit; }
      .lc-btn:hover { border-color: var(--dsw-alias-brand-primary); }
      .lc-btn[disabled] { opacity: 0.5; cursor: default; }
      .lc-btn-primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
      .lc-answer { margin-top: 14px; border-top: 1px dashed var(--dsw-alias-border-l1); padding-top: 12px; white-space: pre-wrap; line-height: 1.7; }
      .lc-points { margin: 8px 0 0; padding-left: 18px; color: var(--dsw-alias-label-secondary); }
      .lc-meta { color: var(--dsw-alias-label-secondary); font-size: 12px; display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
      .lc-empty { max-width: 520px; }
      .lc-field { display: block; margin: 12px 0; }
      .lc-label { display: block; color: var(--dsw-alias-label-secondary); margin-bottom: 6px; font-size: 12px; }
      .lc-input { width: 100%; box-sizing: border-box; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); padding: 8px 10px; font: inherit; }
      .lc-toast { display: flex; align-items: center; gap: 8px; margin: 0 20px 8px; padding: 8px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 8px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
      .lc-error { color: var(--dsw-alias-state-error-primary); }
      .lc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .lc-row:last-child { border-bottom: 0; }
      .lc-flags { color: var(--dsw-alias-state-warn-primary); font-size: 12px; }
      .lc-flag-list { color: var(--dsw-alias-label-secondary); font-size: 12px; }
    `

    /**
     * @param {string} op - route operation.
     * @param {object} params - operation parameters.
     * @param {string|null} sessionId - calling session.
     * @returns {Promise<object>} the JSON payload.
     */
    async function request(op, params, sessionId) {
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op, params: params ?? {}, sessionId: sessionId ?? undefined }),
      })
      let payload = null
      try {
        payload = await response.json()
      } catch {
        payload = null
      }
      if (!response.ok) throw new Error((payload && payload.error) || `HTTP ${response.status}`)
      return payload
    }

    /** @returns {object} the sidebar icon. */
    function Icon() {
      return h('svg', { viewBox: '0 0 64 64', width: 24, height: 24, 'aria-hidden': true, style: { display: 'block' } },
        h('path', { d: 'M8 16h18a6 6 0 0 1 6 6v26a5 5 0 0 0-5-5H8z', fill: 'none', stroke: 'currentColor', strokeWidth: 4, strokeLinejoin: 'round' }),
        h('path', { d: 'M56 16H38a6 6 0 0 0-6 6v26a5 5 0 0 1 5-5h19z', fill: 'none', stroke: 'currentColor', strokeWidth: 4, strokeLinejoin: 'round' }),
        h('path', { d: 'M34 44l6 6 12-14', fill: 'none', stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' }))
    }

    /**
     * Render a stem with clickable glossary terms.
     * @param {{stem: string, termHits: object[]}} props - card data.
     * @returns {object} React nodes.
     */
    function StemView({ stem, termHits, terms, onPick, activeTerm }) {
      const parts = []
      let cursor = 0
      termHits.forEach((hit, index) => {
        if (hit.start > cursor) parts.push(stem.slice(cursor, hit.start))
        parts.push(h('button', {
          key: `t${index}`,
          type: 'button',
          className: 'lc-term',
          onClick: () => onPick(activeTerm === index ? null : index),
        }, hit.text))
        cursor = hit.end
      })
      if (cursor < stem.length) parts.push(stem.slice(cursor))
      const open = activeTerm !== null && termHits[activeTerm] ? termHits[activeTerm] : null
      return h('div', null,
        h('p', { className: 'lc-stem' }, parts),
        open
          ? h('div', { className: 'lc-pop' },
            h('strong', null, open.text),
            h('div', null, (terms[open.text] && terms[open.text].definition) || '（还没有释义）'))
          : null)
    }

    /**
     * Review list for questions the import could not finish.
     * @param {object} props - component props.
     * @returns {object} React node.
     */
    function ReviewList({ items, onStatus, onEdit, t }) {
      if (items.length === 0) return h('p', { className: 'lc-node-sub' }, t('emptyBank'))
      return h('div', null, items.map(item => h('div', { className: 'lc-row', key: item.id },
        h('div', { style: { minWidth: 0 } },
          h('div', { className: 'lc-stem', style: { margin: 0 } }, item.stem),
          h('div', { className: 'lc-flags' }, item.flags.join(' · ')),
          h('div', { className: 'lc-flag-list' },
            item.source && item.source.file ? `${item.source.file}${item.source.page ? ` · ${t('page').replace('%s', item.source.page)}` : ''}` : '')),
        h('div', { className: 'lc-actions' },
          h('button', { type: 'button', className: 'lc-btn', onClick: () => onStatus(item.id, 'ok') }, t('accept')),
          h('button', { type: 'button', className: 'lc-btn', onClick: () => onEdit(item) }, t('edit')),
          h('button', { type: 'button', className: 'lc-btn', onClick: () => onStatus(item.id, 'rejected') }, t('reject'))))))
    }

    /**
     * One question card: the stem with glossary terms, the reference answer, and
     * the three actions a card owns.
     * @param {object} props - component props.
     * @returns {object} React node.
     */
    function QuestionCard({ card, terms, t, total, answerOpen, openTerm, onToggleAnswer, onPickTerm, onNext, onFavorite }) {
      return h('div', { className: 'lc-card' },
        h(StemView, { stem: card.stem, termHits: card.termHits, terms, onPick: onPickTerm, activeTerm: openTerm }),
        h('div', { className: 'lc-actions' },
          h('button', { type: 'button', className: 'lc-btn', onClick: onToggleAnswer }, answerOpen ? t('hide') : t('reveal')),
          h('button', { type: 'button', className: 'lc-btn', onClick: onFavorite }, card.favorite ? '★' : '☆'),
          h('button', { type: 'button', className: 'lc-btn lc-btn-primary', onClick: onNext }, t('next'))),
        answerOpen && card.reference
          ? h('div', { className: 'lc-answer' },
            card.reference.answer || '',
            card.reference.points && card.reference.points.length > 0
              ? h('ul', { className: 'lc-points' }, card.reference.points.map((point, index) => h('li', { key: index }, point)))
              : null)
          : null,
        h('div', { className: 'lc-meta' },
          h('span', null, t('seen').replace('%s', String(total))),
          card.source && card.source.file
            ? h('span', null, `${t('source')}: ${card.source.file}${card.source.page ? ` · ${t('page').replace('%s', card.source.page)}` : ''}`)
            : null))
    }

    /**
     * The whole panel.
     * @param {{layout: object, t: Function}} props - host props plus copy lookup.
     * @returns {object} React node.
     */
    function Panel({ layout, t }) {
      const [sessionId, setSessionId] = useState(null)
      const [meta, setMeta] = useState(null)
      const [tree, setTree] = useState([])
      const [terms, setTerms] = useState({})
      const [tab, setTab] = useState('study')
      const [nodeId, setNodeId] = useState(null)
      const [card, setCard] = useState(null)
      const [queue, setQueue] = useState({ items: [], total: 0, offset: 0 })
      const [checklist, setChecklist] = useState({ items: [] })
      const [favorites, setFavorites] = useState({ items: [] })
      const [answerOpen, setAnswerOpen] = useState(false)
      const [openTerm, setOpenTerm] = useState(null)
      const [toast, setToast] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)

      const fail = useCallback(err => setError((err && err.message) || String(err)), [])

      /**
       * @param {string} text - what to ask the agent.
       * @returns {Promise<void>} resolves after the request.
       */
      const ask = useCallback(async text => {
        try {
          await request('prompt', { text }, sessionId)
          setToast({ text: t('sent'), chat: true })
          setError(null)
        } catch (err) {
          fail(err)
        }
      }, [sessionId, t, fail])

      /** Refresh meta, tree and glossary. */
      const loadBasics = useCallback(async id => {
        const nextMeta = await request('meta', {}, id)
        setMeta(nextMeta)
        const nextTree = await request('tree', {}, id)
        setTree(nextTree.nodes)
        const nextTerms = await request('terms', {}, id)
        setTerms(Object.fromEntries((nextTerms.terms || []).map(term => [term.term, term])))
      }, [])

      /** Load one page of the practice queue. */
      const loadQueue = useCallback(async (id, node) => {
        const page = await request('queue', { nodeId: node ?? undefined, offset: 0, limit: 50 }, id)
        setQueue(page)
        if (page.items.length === 0) {
          setCard(null)
          return
        }
        const detail = await request('question', { id: page.items[0].id }, id)
        setCard(detail.question)
        setAnswerOpen(false)
        setOpenTerm(null)
      }, [])

      useEffect(() => {
        let alive = true
        ;(async () => {
          try {
            const sessions = await request('sessions')
            if (!alive) return
            const first = sessions.sessions && sessions.sessions[0]
            setSessionId(first ? first.id : null)
            if (!first) return
            await loadBasics(first.id)
            await loadQueue(first.id, null)
          } catch (err) {
            if (alive) fail(err)
          }
        })()
        return () => { alive = false }
      }, [loadBasics, loadQueue, fail])

      const reload = useCallback(async () => {
        if (!sessionId) return
        setBusy(true)
        try {
          await loadBasics(sessionId)
          if (tab === 'bank') setChecklist(await request('checklist', {}, sessionId))
          if (tab === 'favorite') setFavorites(await request('favorites', {}, sessionId))
          if (tab === 'study') await loadQueue(sessionId, nodeId)
          setError(null)
        } catch (err) {
          fail(err)
        } finally {
          setBusy(false)
        }
      }, [sessionId, tab, nodeId, loadBasics, loadQueue, fail])

      const saveTarget = useCallback(async form => {
        if (!sessionId) return
        setBusy(true)
        try {
          await request('setTarget', form, sessionId)
          await reload()
        } catch (err) {
          fail(err)
        } finally {
          setBusy(false)
        }
      }, [sessionId, reload, fail])

      const nextQuestion = useCallback(async () => {
        if (!sessionId || !card) return
        try {
          await request('seen', { id: card.id }, sessionId)
          await loadQueue(sessionId, nodeId)
        } catch (err) {
          fail(err)
        }
      }, [sessionId, card, nodeId, loadQueue, fail])

      const pickNode = useCallback(async id => {
        setNodeId(id)
        if (!sessionId) return
        setBusy(true)
        try {
          await loadQueue(sessionId, id)
          setError(null)
        } catch (err) {
          fail(err)
        } finally {
          setBusy(false)
        }
      }, [sessionId, loadQueue, fail])

      const toggleFavorite = useCallback(async () => {
        if (!sessionId || !card) return
        try {
          await request('favorite', { id: card.id, on: !card.favorite }, sessionId)
          const detail = await request('question', { id: card.id }, sessionId)
          setCard(detail.question)
        } catch (err) {
          fail(err)
        }
      }, [sessionId, card, fail])

      const switchTab = useCallback(async name => {
        setTab(name)
        if (!sessionId) return
        try {
          if (name === 'bank') setChecklist(await request('checklist', {}, sessionId))
          if (name === 'favorite') setFavorites(await request('favorites', {}, sessionId))
          setError(null)
        } catch (err) {
          fail(err)
        }
      }, [sessionId, fail])

      const setStatus = useCallback(async (id, status) => {
        try {
          await request('setStatus', { id, status }, sessionId)
          setChecklist(await request('checklist', {}, sessionId))
        } catch (err) {
          fail(err)
        }
      }, [sessionId, fail])

      const editQuestion = useCallback(async item => {
        const stem = window.prompt(t('editPrompt'), item.stem)
        if (stem === null || stem.trim().length === 0) return
        try {
          await request('updateQuestion', { id: item.id, patch: { stem } }, sessionId)
          setChecklist(await request('checklist', {}, sessionId))
        } catch (err) {
          fail(err)
        }
      }, [sessionId, t, fail])

      if (!sessionId) {
        return h('div', { className: 'lc-root' },
          h('div', { className: 'lc-head' }, h('h1', { className: 'lc-title' }, t('title'))),
          h('div', { className: 'lc-main' }, h('p', { className: 'lc-node-sub' }, t('sessionMissing'))))
      }

      const tabs = ['study', 'bank', 'favorite']

      const hasTarget = Boolean(meta && meta.target)
      const hasTree = tree.length > 0
      const head = h('div', { className: 'lc-head' },
        h('h1', { className: 'lc-title' }, t('title')),
        h('div', { className: 'lc-tabs' }, tabs.map(name => h('button', {
          key: name,
          type: 'button',
          className: 'lc-tab',
          'data-active': String(tab === name),
          onClick: () => switchTab(name),
        }, t(name)))))

      const toastRow = toast
        ? h('div', { className: 'lc-toast' },
          toast.text,
          toast.chat && layout && typeof layout.selectPanel === 'function'
            ? h('button', { type: 'button', className: 'lc-btn', onClick: () => layout.selectPanel('conversation') }, t('goToChat'))
            : null)
        : null

      const errorRow = error ? h('div', { className: 'lc-toast lc-error' }, t('error'), error) : null

      const treePane = h('div', { className: 'lc-tree' },
        h('button', {
          type: 'button',
          className: 'lc-node',
          'data-active': String(nodeId === null),
          onClick: () => pickNode(null),
        }, h('span', null, t('allNodes'))),
        tree.map(node => h('button', {
          key: node.id,
          type: 'button',
          className: 'lc-node',
          'data-active': String(nodeId === node.id),
          style: { paddingLeft: `${8 + (node.parentId ? 14 : 0)}px` },
          onClick: () => pickNode(node.id),
        }, h('span', null, node.title), h('span', { className: 'lc-node-sub' }, `${node.seen}/${node.total}`))))

      const studyPane = hasTarget && hasTree && tab === 'study'
        ? (card
          ? h(QuestionCard, {
            card,
            terms,
            t,
            total: queue.total,
            answerOpen,
            openTerm,
            onToggleAnswer: () => setAnswerOpen(!answerOpen),
            onPickTerm: setOpenTerm,
            onNext: nextQuestion,
            onFavorite: toggleFavorite,
          })
          : h('p', { className: 'lc-node-sub' }, t('noQuestions')))
        : null

      const bankPane = hasTarget && hasTree && tab === 'bank'
        ? h(ReviewList, { items: checklist.items, onStatus: setStatus, onEdit: editQuestion, t })
        : null

      const favoritesPane = hasTarget && hasTree && tab === 'favorite'
        ? (favorites.items.length === 0
          ? h('p', { className: 'lc-node-sub' }, t('emptyFavorites'))
          : h('div', null, favorites.items.map(item => h('div', { className: 'lc-row', key: item.id },
            h('div', null, item.stem),
            h('button', {
              type: 'button',
              className: 'lc-btn',
              onClick: async () => {
                const detail = await request('question', { id: item.id }, sessionId)
                setCard(detail.question)
                setTab('study')
                setAnswerOpen(false)
              },
            }, t('study'))))))
        : null

      const mainPane = h('div', { className: 'lc-main' },
        hasTarget ? null : h(EmptyState, { t, busy, onSave: saveTarget }),
        hasTarget && !hasTree
          ? h('div', { className: 'lc-empty' },
            h('h2', { className: 'lc-title' }, meta.target.title),
            h('p', { className: 'lc-node-sub' }, meta.target.statement || ''),
            h('p', { className: 'lc-node-sub' }, t('noTree')),
            h('div', { className: 'lc-actions' },
              h('button', { type: 'button', className: 'lc-btn lc-btn-primary', onClick: () => ask(PLAN_PROMPT) }, t('planCta'))))
          : null,
        studyPane,
        bankPane,
        favoritesPane)

      return h('div', { className: 'lc-root' }, head, toastRow, errorRow,
        h('div', { className: 'lc-body' }, treePane, mainPane))
    }

    /** Prompt the panel sends when the user asks for the topic tree. */
    const PLAN_PROMPT = [
      '请用工具为这个学习中心做规划：',
      '1) 先调用 learning_status；',
      '2) 用 learning_plan set_target 记录目标与当前水平；',
      '3) 用 learning_plan upsert_tree 写出 10-30 个知识点（id 用 n_1、n_1.1 这类稳定编号）；',
      '4) 用 learning_plan set_plan 写 3-5 个阶段，每阶段含该读哪几节、要补的前置知识、一个实践项目、自查标准。',
      '完成后用一两句话告诉我先学哪一块。',
    ].join('\n')

    /**
     * First-run form: a target is the one thing the panel cannot invent.
     * @param {{t: Function, busy: boolean, onSave: Function}} props - component props.
     * @returns {object} React node.
     */
    function EmptyState({ t, busy, onSave }) {
      const [title, setTitle] = useState('')
      const [statement, setStatement] = useState('')
      const [level, setLevel] = useState('beginner')
      return h('div', { className: 'lc-empty' },
        h('h2', { className: 'lc-title' }, t('emptyTitle')),
        h('p', { className: 'lc-node-sub' }, t('emptyHint')),
        h('label', { className: 'lc-field' },
          h('span', { className: 'lc-label' }, t('goalTitle')),
          h('input', { className: 'lc-input', value: title, onChange: event => setTitle(event.target.value) })),
        h('label', { className: 'lc-field' },
          h('span', { className: 'lc-label' }, t('goalStatement')),
          h('input', { className: 'lc-input', value: statement, onChange: event => setStatement(event.target.value) })),
        h('label', { className: 'lc-field' },
          h('span', { className: 'lc-label' }, t('goalLevel')),
          h('select', { className: 'lc-input', value: level, onChange: event => setLevel(event.target.value) },
            ['beginner', 'elementary', 'intermediate', 'advanced'].map(key => h('option', { key, value: key }, t(`level.${key}`)))))),
        h('div', { className: 'lc-actions' },
          h('button', {
            type: 'button',
            className: 'lc-btn lc-btn-primary',
            disabled: busy || title.trim().length === 0,
            onClick: () => onSave({ title: title.trim(), statement: statement.trim(), level }),
          }, t('save')))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        let t = key => ZH[key] ?? key
        try {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            ctx.locale.register('learning-center', 'zh', ZH)
            ctx.locale.register('learning-center', 'en', EN)
            const bound = ctx.locale.bind('learning-center')
            if (typeof bound === 'function') t = key => bound(key)
          }
        } catch {
          // The locale service is optional; the Chinese copy above is the fallback.
        }
        ctx.effect(() => {
          const style = document.createElement('style')
          style.textContent = CSS
          document.head.appendChild(style)
          return () => { style.remove() }
        }, 'learning-center/styles')
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'learning', order: 20, label: t('title'),
        }, Icon))
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'learning',
        }, props => h(Panel, { ...props, layout: ctx.layout, t })))
      },
    }
  },
})
