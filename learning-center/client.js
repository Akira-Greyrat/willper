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
    const { useCallback, useEffect, useRef, useState } = React

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
      'level.beginner': '入门',
      'level.elementary': '初级',
      'level.intermediate': '中级',
      'level.advanced': '高级',
      saveTarget: '保存目标',
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
      allSeen: '这个知识点的题都读过了。',
      revisit: '复习已读',
      prev: '上一题',
      save: '保存',
      cancel: '取消',
      refresh: '刷新',
      importHint: '在对话里用 /learn import <材料文件> 导入题库。',
      emptyChecklist: '没有待核对的题。',
      noDefinition: '（还没有释义）',
      seenCount: '已读 %s / %s',
      flag: {
        missing_answer: '缺答案',
        truncated: '题干被截断',
        node_unknown: '知识点不存在',
        anchor_missing: '原文找不到锚点',
        anchor_unverified: '没有抽取文本，未核对',
        image_hint_missing: '提到图但未标记',
        empty_stem: '题干为空',
        duplicate: '重复',
        orphaned: '材料里已找不到',
      },
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
      'level.beginner': 'Beginner',
      'level.elementary': 'Elementary',
      'level.intermediate': 'Intermediate',
      'level.advanced': 'Advanced',
      saveTarget: 'Save target',
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
      allSeen: 'You have read every question under this topic.',
      revisit: 'Review read questions',
      prev: 'Previous',
      needsReview: 'Needs review',
      accept: 'Accept',
      reject: 'Reject',
      edit: 'Edit',
      editPrompt: 'New stem (empty cancels):',
      emptyBank: 'The bank is empty. Ask the AI to import one.',
      emptyChecklist: 'No flagged questions.',
      noDefinition: '(no definition yet)',
      save: 'Save',
      cancel: 'Cancel',
      refresh: 'Refresh',
      importHint: 'In the chat, run /learn import <material file> to load a bank.',
      seenCount: 'Read %s / %s',
      flag: {
        missing_answer: 'Missing answer',
        truncated: 'Stem truncated',
        node_unknown: 'Unknown topic',
        anchor_missing: 'Anchor not in the material',
        anchor_unverified: 'Not verified (no extracted text)',
        image_hint_missing: 'Mentions an image',
        empty_stem: 'Empty stem',
        duplicate: 'Duplicate',
        orphaned: 'Gone from the material',
      },
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
      .lc-node[data-active="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); font-weight: 600; }
      .lc-node { border: 1px solid transparent; }
      .lc-tab[data-active="true"] { border-bottom: 2px solid var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); font-weight: 600; border-radius: 0; }
      .lc-node:hover { background: var(--dsw-alias-bg-layer-2); }
      .lc-node-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .lc-main { flex: 1 1 auto; min-width: 0; overflow: auto; padding: 20px 24px; }
      .lc-card { border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); padding: 18px 20px; max-width: 760px; }
      .lc-stem { white-space: pre-wrap; line-height: 1.7; font-size: 15px; margin: 0 0 14px; }
      .lc-term { border: 0; background: transparent; padding: 0; font: inherit; color: var(--dsw-alias-brand-primary); border-bottom: 1px dashed var(--dsw-alias-brand-primary); cursor: pointer; }
      .lc-pop { position: fixed; z-index: 60; margin: 0; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-overlay); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18); white-space: pre-wrap; line-height: 1.6; font-size: 13px; }
      .lc-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .lc-btn { border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); border-radius: 6px; padding: 6px 12px; cursor: pointer; font: inherit; }
      .lc-btn:hover { border-color: var(--dsw-alias-brand-primary); }
      .lc-btn[disabled] { opacity: 0.5; cursor: default; }
      .lc-btn[data-active="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); font-weight: 600; }
      .lc-btn-primary { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); font-weight: 600; background: transparent; }
      .lc-btn-primary:hover { background: var(--dsw-alias-bg-layer-2); }
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
      .lc-stack { white-space: pre-wrap; font-size: 12px; color: var(--dsw-alias-label-secondary); }
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

    /**
     * The sidebar glyph: same 24-unit grid, 1.5 stroke and currentColor outline
     * as the host's own panel icons (plugins, schedules), so it sits in that row
     * at the same optical weight.
     * @param {{size?: number}} props - the sidebar's requested edge.
     * @returns {object} the icon element.
     */
    function Icon({ size = 24 } = {}) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('path', { d: 'M12 6.75C10.4 5.6 8.4 5.25 6 5.25v12.25c2.4 0 4.4.35 6 1.5 1.6-1.15 3.6-1.5 6-1.5V5.25c-2.4 0-4.4.35-6 1.5Z' }),
      h('path', { d: 'M12 6.75v12.25' }))
    }

    /** Widest the term popover may get, in pixels. */
    const POPOVER_WIDTH = 320

    /** The term being explained is highlighted in this accent, by request. */
    const TERM_ACCENT = '#e0218a'

    /**
     * Whether a pointer-down target lies outside the popover. A click on another
     * term is not "outside": that term's own handler swaps the card.
     * @param {*} target - event target.
     * @param {*} card - the popover element, if mounted.
     * @returns {boolean} whether the popover should close.
     */
    function isOutsidePopover(target, card) {
      if (!target) return true
      if (card && typeof card.contains === 'function' && card.contains(target)) return false
      if (typeof target.closest === 'function' && target.closest('.lc-term')) return false
      return true
    }

    /**
     * Place the term popover next to its term, inside the viewport: to the right
     * edge it slides left, near the bottom it flips above.
     * @param {{top: number, bottom: number, left: number, right: number}} rect - the term's box.
     * @param {{width: number, height: number}} viewport - window size.
     * @returns {object} inline style for the fixed-position card.
     */
    function popoverStyle(rect, viewport) {
      const left = Math.max(8, Math.min(rect.left, viewport.width - POPOVER_WIDTH - 8))
      const style = { left: `${left}px`, width: `${POPOVER_WIDTH}px` }
      if (viewport.height - rect.bottom < 200) {
        style.bottom = `${Math.max(8, viewport.height - rect.top + 6)}px`
      } else {
        style.top = `${rect.bottom + 6}px`
      }
      return style
    }

    /**
     * The floating definition card for one term.
     * @param {{term: object|null, style: object, onClose: Function, t: Function}} props - component props.
     * @returns {object} React node.
     */
    function TermPopover({ term, style, onClose, t }) {
      const holder = useRef(null)
      useEffect(() => {
        const onKey = event => {
          if (event.key === 'Escape') onClose()
        }
        const onScroll = () => onClose()
        const onPointerDown = event => {
          if (isOutsidePopover(event.target, holder.current)) onClose()
        }
        window.addEventListener('keydown', onKey)
        window.addEventListener('scroll', onScroll, true)
        document.addEventListener('mousedown', onPointerDown, true)
        return () => {
          window.removeEventListener('keydown', onKey)
          window.removeEventListener('scroll', onScroll, true)
          document.removeEventListener('mousedown', onPointerDown, true)
        }
      }, [onClose])
      return h('div', {
        className: 'lc-pop',
        style,
        ref: holder,
      },
      h('strong', { style: { color: TERM_ACCENT } }, term && term.text),
      h('div', null, (term && term.definition) || t('noDefinition')))
    }

    /**
     * Render a stem with clickable glossary terms.
     * @param {{stem: string, termHits: object[], terms: object, onPick: Function, picked: object|null}} props - card data.
     * @returns {object} React nodes.
     */
    function StemView({ stem, termHits, onPick, picked }) {
      const parts = []
      let cursor = 0
      termHits.forEach((hit, index) => {
        if (hit.start > cursor) parts.push(stem.slice(cursor, hit.start))
        parts.push(h('button', {
          key: `t${index}`,
          type: 'button',
          className: 'lc-term',
          onClick: event => {
            const rect = event.currentTarget.getBoundingClientRect()
            onPick(picked && picked.index === index ? null : { index, rect })
          },
        }, hit.text))
        cursor = hit.end
      })
      if (cursor < stem.length) parts.push(stem.slice(cursor))
      return h('p', { className: 'lc-stem' }, parts)
    }

    /**
     * Review list for questions the import could not finish.
     * @param {object} props - component props.
     * @returns {object} React node.
     */
    /**
     * @param {Function} t - copy lookup.
     * @param {string} flag - a stored flag id.
     * @returns {string} human wording for a flag.
     */
    function flagLabel(t, flag) {
      const name = String(flag)
      const table = typeof t('flag') === 'object' && t('flag') ? t('flag') : ZH.flag
      if (name.startsWith('duplicate_of:')) return table.duplicate
      return table[name] ?? name
    }

    function ReviewList({ items, onStatus, onEdit, t }) {
      const [editing, setEditing] = useState(null)
      const [draft, setDraft] = useState('')
      const [problem, setProblem] = useState(null)
      if (items.length === 0) return h('p', { className: 'lc-node-sub' }, t('emptyChecklist'))
      return h('div', null, items.map(item => h('div', { className: 'lc-row', key: item.id },
        h('div', { style: { minWidth: 0, flex: '1 1 auto' } },
          editing === item.id
            ? h('textarea', {
              className: 'lc-input',
              rows: 3,
              value: draft,
              onChange: event => setDraft(event.target.value),
            })
            : h('div', { className: 'lc-stem', style: { margin: 0 } }, item.stem),
          editing === item.id && problem ? h('div', { className: 'lc-flags' }, problem) : null,
          h('div', { className: 'lc-flags' }, item.flags.map(flag => flagLabel(t, flag)).join(' · ')),
          h('div', { className: 'lc-flag-list' },
            item.source && item.source.file ? `${item.source.file}${item.source.page ? ` · ${t('page').replace('%s', item.source.page)}` : ''}` : '')),
        h('div', { className: 'lc-actions' },
          editing === item.id
            ? [
              h('button', {
                key: 'save',
                type: 'button',
                className: 'lc-btn lc-btn-primary',
                onClick: () => {
                  const next = draft.trim()
                  if (next.length === 0) {
                    setProblem('题干不能为空')
                    return
                  }
                  setEditing(null)
                  setProblem(null)
                  if (next !== item.stem) onEdit(item, next)
                },
              }, t('save')),
              h('button', {
                key: 'cancel',
                type: 'button',
                className: 'lc-btn',
                onClick: () => {
                  setEditing(null)
                  setProblem(null)
                },
              }, t('cancel')),
            ]
            : [
              h('button', { key: 'accept', type: 'button', className: 'lc-btn', onClick: () => onStatus(item.id, 'ok') }, t('accept')),
              h('button', {
                key: 'edit',
                type: 'button',
                className: 'lc-btn',
                onClick: () => {
                  setDraft(item.stem)
                  setProblem(null)
                  setEditing(item.id)
                },
              }, t('edit')),
              h('button', { key: 'reject', type: 'button', className: 'lc-btn', onClick: () => onStatus(item.id, 'rejected') }, t('reject')),
            ]))))
    }

    /**
     * One question card: the stem with glossary terms, the reference answer, and
     * the three actions a card owns.
     * @param {object} props - component props.
     * @returns {object} React node.
     */
    function QuestionCard({ card, t, shownSeen, shownTotal, answerOpen, openTerm, onToggleAnswer, onPickTerm, onNext, onPrev, canPrev, onFavorite, onRevisit, revisit }) {
      return h('div', { className: 'lc-card' },
        h(StemView, { stem: card.stem, termHits: card.termHits, onPick: onPickTerm, picked: openTerm }),
        h('div', { className: 'lc-actions' },
          h('button', { type: 'button', className: 'lc-btn', onClick: onToggleAnswer }, answerOpen ? t('hide') : t('reveal')),
          h('button', { type: 'button', className: 'lc-btn', onClick: onFavorite }, card.favorite ? '★' : '☆'),
          h('button', { type: 'button', className: 'lc-btn', onClick: onPrev, disabled: !canPrev }, t('prev')),
          h('button', { type: 'button', className: 'lc-btn lc-btn-primary', onClick: onNext }, t('next')),
          h('button', { type: 'button', className: 'lc-btn', 'data-active': String(revisit), onClick: onRevisit }, t('revisit'))),
        answerOpen && card.reference
          ? h('div', { className: 'lc-answer' },
            card.reference.answer || '',
            card.reference.points && card.reference.points.length > 0
              ? h('ul', { className: 'lc-points' }, card.reference.points.map((point, index) => h('li', { key: index }, point)))
              : null)
          : null,
        h('div', { className: 'lc-meta' },
          h('span', null, t('seenCount').replace('%s', String(shownSeen)).replace('%s', String(shownTotal))),
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
      const [page, setPage] = useState({ items: [], total: 0, offset: 0 })
      const [cursor, setCursor] = useState(0)
      const [checklist, setChecklist] = useState({ items: [] })
      const [favorites, setFavorites] = useState({ items: [] })
      const [answerOpen, setAnswerOpen] = useState(false)
      const [openTerm, setOpenTerm] = useState(null)
      const [toast, setToast] = useState(null)
      const [error, setError] = useState(null)
      const [busy, setBusy] = useState(false)
      const [sessionsList, setSessionsList] = useState([])
      const [loaded, setLoaded] = useState(false)
      const [history, setHistory] = useState([])
      const [revisit, setRevisit] = useState(false)

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

      /** Show one question by id. */
      const showCard = useCallback(async id => {
        const detail = await request('question', { id }, sessionId)
        setCard(detail.question)
        setAnswerOpen(false)
        setOpenTerm(null)
      }, [sessionId])

      /** Load one page of the practice queue and show its first card. */
      const loadQueue = useCallback(async (id, node, revisitMode) => {
        const next = await request('queue', { nodeId: node ?? undefined, offset: 0, limit: 50, revisit: revisitMode === true }, id)
        setPage(next)
        setCursor(0)
        if (next.items.length === 0) {
          setCard(null)
          return
        }
        const detail = await request('question', { id: next.items[0].id }, id)
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
            const list = sessions.sessions ?? []
            setSessionsList(list)
            setLoaded(true)
            const first = list[0]
            setSessionId(first ? first.id : null)
            if (!first) return
            await loadBasics(first.id)
            await loadQueue(first.id, null, false)
          } catch (err) {
            if (alive) {
              setLoaded(true)
              fail(err)
            }
          }
        })()
        return () => { alive = false }
      }, [loadBasics, loadQueue, fail])

      useEffect(() => {
        if (!toast) return undefined
        const timer = setTimeout(() => setToast(null), 8000)
        return () => clearTimeout(timer)
      }, [toast])

      const reload = useCallback(async () => {
        if (!sessionId) return
        setBusy(true)
        try {
          await loadBasics(sessionId)
          if (tab === 'bank') setChecklist(await request('checklist', {}, sessionId))
          if (tab === 'favorite') setFavorites(await request('favorites', {}, sessionId))
          if (tab === 'study') await loadQueue(sessionId, nodeId, revisit)
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

      /** Refresh only the topic tree counts, without disturbing the open card. */
      const refreshTree = useCallback(async () => {
        if (!sessionId) return
        try {
          const next = await request('tree', {}, sessionId)
          setTree(next.nodes)
        } catch (err) {
          fail(err)
        }
      }, [sessionId, fail])

      const nextQuestion = useCallback(async () => {
        if (!sessionId || !card) return
        try {
          await request('seen', { id: card.id }, sessionId)
          setHistory([...history, card.id])
          await refreshTree()
          const following = page.items[cursor + 1]
          if (following) {
            setCursor(cursor + 1)
            await showCard(following.id)
            return
          }
          await loadQueue(sessionId, nodeId, revisit)
        } catch (err) {
          fail(err)
        }
      }, [sessionId, card, nodeId, revisit, history, cursor, page, loadQueue, showCard, refreshTree, fail])

      const prevQuestion = useCallback(async () => {
        if (!sessionId) return
        try {
          if (cursor > 0) {
            setCursor(cursor - 1)
            await showCard(page.items[cursor - 1].id)
            return
          }
          if (history.length === 0) return
          const id = history[history.length - 1]
          setHistory(history.slice(0, -1))
          await showCard(id)
        } catch (err) {
          fail(err)
        }
      }, [sessionId, cursor, page, history, showCard, fail])

      const toggleRevisit = useCallback(async () => {
        const next = !revisit
        setRevisit(next)
        if (!sessionId) return
        try {
          await loadQueue(sessionId, nodeId, next)
        } catch (err) {
          fail(err)
        }
      }, [revisit, sessionId, nodeId, loadQueue, fail])

      const pickNode = useCallback(async id => {
        setNodeId(id)
        setHistory([])
        if (!sessionId) return
        setBusy(true)
        try {
          await loadQueue(sessionId, id, revisit)
          setError(null)
        } catch (err) {
          fail(err)
        } finally {
          setBusy(false)
        }
      }, [sessionId, revisit, loadQueue, fail])

      const toggleFavorite = useCallback(async () => {
        if (!sessionId || !card) return
        try {
          await request('favorite', { id: card.id, on: !card.favorite }, sessionId)
          const detail = await request('question', { id: card.id }, sessionId)
          setCard(detail.question)
          setOpenTerm(null)
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
          await refreshTree()
        } catch (err) {
          fail(err)
        }
      }, [sessionId, refreshTree, fail])

      const editQuestion = useCallback(async (item, stem) => {
        try {
          await request('updateQuestion', { id: item.id, patch: { stem } }, sessionId)
          setChecklist(await request('checklist', {}, sessionId))
          await refreshTree()
          setError(null)
        } catch (err) {
          fail(err)
        }
      }, [sessionId, refreshTree, fail])

      if (!sessionId) {
        return h('div', { className: 'lc-root' },
          h('div', { className: 'lc-head' }, h('h1', { className: 'lc-title' }, t('title'))),
          error ? h('div', { className: 'lc-toast lc-error' }, t('error'), error) : null,
          h('div', { className: 'lc-main' },
            h('p', { className: 'lc-node-sub' }, loaded ? t('sessionMissing') : t('loading'))))
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
        }, t(name)))),
        sessionsList.length > 1
          ? h('select', {
            className: 'lc-input',
            style: { width: 220 },
            value: sessionId,
            onChange: async event => {
              const nextId = event.target.value
              setSessionId(nextId)
              setHistory([])
              try {
                await loadBasics(nextId)
                await loadQueue(nextId, null, false)
                setError(null)
              } catch (err) {
                fail(err)
              }
            },
          }, sessionsList.map(session => h('option', { key: session.id, value: session.id }, session.title)))
          : null,
        h('button', {
          type: 'button',
          className: 'lc-btn',
          style: { marginLeft: 'auto' },
          disabled: busy,
          onClick: reload,
        }, t('refresh')))

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

      const activeNode = nodeId ? tree.find(node => node.id === nodeId) : null
      const nodeHasQuestions = activeNode ? activeNode.total > 0 : tree.some(node => node.total > 0)
      const shownSeen = activeNode ? activeNode.seen : tree.reduce((sum, node) => sum + node.seen, 0)
      const shownTotal = activeNode ? activeNode.total : tree.reduce((sum, node) => sum + node.total, 0)

      const pickedHit = card && openTerm ? card.termHits[openTerm.index] : null
      const viewport = typeof window !== 'undefined' && window.innerWidth
        ? { width: window.innerWidth, height: window.innerHeight }
        : { width: 1200, height: 800 }
      const popover = pickedHit
        ? h(TermPopover, {
          term: {
            text: pickedHit.text,
            definition: terms[pickedHit.text] && terms[pickedHit.text].definition,
          },
          style: popoverStyle(openTerm.rect, viewport),
          onClose: () => setOpenTerm(null),
          t,
        })
        : null

      const studyPane = hasTarget && hasTree && tab === 'study'
        ? (card
          ? h('div', null,
            h(QuestionCard, {
              card,
              t,
              shownSeen,
              shownTotal,
              answerOpen,
              openTerm,
              revisit,
              canPrev: history.length > 0 || cursor > 0,
              onToggleAnswer: () => setAnswerOpen(!answerOpen),
              onPickTerm: setOpenTerm,
              onNext: nextQuestion,
              onPrev: prevQuestion,
              onRevisit: toggleRevisit,
              onFavorite: toggleFavorite,
            }),
            popover)
          : h('div', null,
            h('p', { className: 'lc-node-sub' }, nodeHasQuestions ? t('allSeen') : t('noQuestions')),
            h('p', { className: 'lc-node-sub' }, t('importHint')),
            nodeHasQuestions || revisit
              ? null
              : h('button', { type: 'button', className: 'lc-btn', onClick: toggleRevisit }, t('revisit'))))
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
                try {
                  await showCard(item.id)
                  setTab('study')
                  setError(null)
                } catch (err) {
                  fail(err)
                }
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
     * Catches a render crash inside the panel and shows the message. A slot entry
     * that throws is blanked by the host, which is indistinguishable from "the
     * plugin never loaded" — this keeps one failure visible and reportable.
     */
    class PanelBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { error: null }
      }

      static getDerivedStateFromError(error) {
        return { error }
      }

      componentDidCatch(error) {
        console.error('[learning-center] panel crashed', error)
      }

      render() {
        if (this.state.error) {
          const message = this.state.error && this.state.error.message ? this.state.error.message : String(this.state.error)
          return h('div', { className: 'lc-root' },
            h('div', { className: 'lc-main' },
              h('p', { className: 'lc-error' }, '学习中心渲染失败'),
              h('pre', { className: 'lc-stack' }, message)))
        }
        return this.props.children
      }
    }

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
          }, t('saveTarget')))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        // Optional services are read through ctx.get: the restricted client
        // context throws on a property access the module did not `inject`, so
        // `ctx.layout` here would crash every render with "cannot get property
        // layout without inject".
        const layout = typeof ctx.get === 'function' ? ctx.get('layout') : undefined
        const locale = typeof ctx.get === 'function' ? ctx.get('locale') : undefined
        let t = key => ZH[key] ?? key
        try {
          if (locale && typeof locale.register === 'function') {
            locale.register('learning-center', 'zh', ZH)
            locale.register('learning-center', 'en', EN)
            const bound = typeof locale.bind === 'function' ? locale.bind('learning-center') : null
            if (typeof bound === 'function') {
              t = key => {
                try {
                  const value = bound(key)
                  return typeof value === 'string' ? value : (ZH[key] ?? key)
                } catch {
                  return ZH[key] ?? key
                }
              }
            }
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
        }, props => h(PanelBoundary, { t }, h(Panel, { ...props, layout, t }))))
      },
      /** Rendered-only internals, exposed so the node harness can exercise them. */
      __test: { PanelBoundary, popoverStyle, Icon, TermPopover, isOutsidePopover, TERM_ACCENT },
    }
  },
})
