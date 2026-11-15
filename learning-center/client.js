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
      relatedOpen: '关联',
      relatedDeeper: '往深',
      relatedBroader: '往宽',
      relatedFill: '让 AI 补这题的关联网',
      relatedGone: '这道关联题已经不在题库里了。',
      answerLabel: '写下你的答案（可先空着看参考答案）',
      submitGrade: '提交并批改',
      gradingWait: '批改中…',
      gradingTimeout: 'AI 还没批完，可以重试',
      retryGrade: '重试',
      coveredLabel: '命中',
      missedLabel: '漏了',
      wrongLabel: '说错',
      feedbackLabel: '反馈',
      suggestionLabel: '优化版本的答案',
      noPoints: '这题没有要点，无法按要点批改。',
      supplementTitle: '补充答案',
      supplementFill: '让 AI 补这段补充答案',
      gradeAgain: '再答一次',
      quizTitle: '先答一道再走',
      quizSkip: '跳过',
      quizMute: '本轮不再提醒',
      weak: '错题',
      weakTitle: '错题',
      weakEmpty: '还没有错题，先去过几道题。',
      weakMisses: '漏点',
      weakLastScore: '上次',
      weakDismiss: '移出',
      plan: '计划',
      planEmpty: '还没有阶段计划。让 AI 按你的目标排一版。',
      planAsk: '让 AI 写阶段计划',
      planAskPrompt: '请用 learning_plan set_plan 写一份阶段计划：3-5 个阶段，每阶段给 title、nodeIds（用树里的知识点 id）、reading（[{file, section}]）、prereqs、perspectives、project（{title, deliverable}）、checkpoints，status 统一 todo。',
      planNodes: '知识点',
      planReading: '该读',
      planPrereqs: '要补',
      planPerspectives: '新视角',
      planProject: '实践项目',
      'stage.todo': '未开始',
      'stage.doing': '进行中',
      'stage.done': '已完成',
      report: '体检',
      reportEmpty: '还没有体检报告。',
      reportAsk: '让 AI 体检题库',
      reportRetake: '重新体检',
      reportAt: '生成于',
      reportAskPrompt: '请体检这个题库：先学习 learning_audit brief 拿摘要与要求，按六类写一份 markdown 报告，再用 learning_audit write 存下来；不用改动题库。',
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
      relatedOpen: 'Related',
      relatedDeeper: 'Deeper',
      relatedBroader: 'Broader',
      relatedFill: 'Ask the AI to relate this question',
      relatedGone: 'That related question is no longer in the bank.',
      answerLabel: 'Write your answer (you can leave it blank and read the reference first)',
      submitGrade: 'Submit and grade',
      gradingWait: 'Grading…',
      gradingTimeout: 'The AI has not finished grading; retry when ready',
      retryGrade: 'Retry',
      coveredLabel: 'Hit',
      missedLabel: 'Missed',
      wrongLabel: 'Wrong',
      feedbackLabel: 'Feedback',
      suggestionLabel: 'A better answer',
      noPoints: 'This question has no key points, so there is nothing to grade against.',
      supplementTitle: 'Additional answer',
      supplementFill: 'Ask the AI to add one',
      gradeAgain: 'Answer again',
      quizTitle: 'Answer one before you go',
      quizSkip: 'Skip',
      quizMute: 'Stop asking this round',
      weak: 'Weak',
      weakTitle: 'Weak questions',
      weakEmpty: 'No weak questions yet — read a few first.',
      weakMisses: 'Missed',
      weakLastScore: 'Last',
      weakDismiss: 'Remove',
      plan: 'Plan',
      planEmpty: 'No staged plan yet. Ask the AI to lay one out for your target.',
      planAsk: 'Ask the AI for a plan',
      planAskPrompt: 'Use learning_plan set_plan to write a staged plan: 3-5 stages, each with title, nodeIds (from the topic tree), reading ([{file, section}]), prereqs, perspectives, project ({title, deliverable}) and checkpoints; status todo.',
      planNodes: 'Topics',
      planReading: 'Read',
      planPrereqs: 'Prerequisites',
      planPerspectives: 'Perspectives',
      planProject: 'Project',
      'stage.todo': 'To do',
      'stage.doing': 'Doing',
      'stage.done': 'Done',
      report: 'Audit',
      reportEmpty: 'No audit report yet.',
      reportAsk: 'Ask the AI to audit the bank',
      reportRetake: 'Audit again',
      reportAt: 'Generated',
      reportAskPrompt: 'Audit this question bank: call learning_audit brief for the digest and the rules, write a markdown report for the six categories, then store it with learning_audit write. Do not modify the bank.',
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
      .lc-root { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; }
      .lc-head { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid var(--dsw-alias-border-l1); flex: 0 0 auto; }
      .lc-title { font-size: 20px; font-weight: 500; line-height: 28px; margin: 0; }
      .lc-cardTitle { font-size: 15px; font-weight: 600; line-height: 22px; margin: 0; }
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
      .lc-stem { white-space: pre-wrap; line-height: 1.75; font-size: 14px; margin: 0 0 14px; }
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
      .lc-related { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
      .lc-answer-card { margin-top: 12px; }
      .lc-grade { margin-top: 12px; display: flex; flex-direction: column; gap: 4px; }
      .lc-grade-row { display: flex; gap: 6px; align-items: baseline; font-size: 13px; }
      .lc-suggestion { margin-top: 8px; padding: 8px 10px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 8px; white-space: pre-wrap; line-height: 1.6; }
      .lc-supplement { margin-top: 12px; display: flex; flex-direction: column; gap: 6px; }
      .lc-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); display: flex; align-items: center; justify-content: center; z-index: 80; }
      .lc-report { white-space: pre-wrap; line-height: 1.75; font-size: 13px; margin-top: 4px; }
      .lc-modal { width: 520px; max-width: calc(100vw - 48px); max-height: calc(100vh - 96px); overflow: auto; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; padding: 18px 20px; display: flex; flex-direction: column; gap: 10px; }
      .lc-related-row { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
      .lc-related-label { color: var(--dsw-alias-label-secondary); font-size: 12px; margin-right: 2px; }
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
     * The sidebar glyph. The sidebar asks for a 16px edge (18 in the rail), so the
     * art is drawn on a matching 16-unit grid with a 1.5 stroke: it then renders at
     * the same optical weight as the host's own panel icons instead of being a
     * larger drawing scaled down.
     * @param {{size?: number}} props - the sidebar's requested edge.
     * @returns {object} the icon element.
     */
    function Icon({ size = 16 } = {}) {
      return h('svg', {
        viewBox: '0 0 16 16',
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
      h('path', { d: 'M8 4.6C6.7 3.7 5 3.4 2.8 3.4v8.5c2.2 0 3.9.3 5.2 1.2 1.3-.9 3-1.2 5.2-1.2V3.4C11 3.4 9.3 3.7 8 4.6Z' }),
      h('path', { d: 'M8 4.6v8.5' }))
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
    function QuestionCard({ card, t, shownSeen, shownTotal, answerOpen, openTerm, onToggleAnswer, onPickTerm, onNext, onPrev, canPrev, onFavorite, onRevisit, revisit, onFillSupplement }) {
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
              : null,
            h(SupplementBlock, { reference: card.reference, t, onFill: onFillSupplement }))
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
      const [answer, setAnswer] = useState('')
      const [grading, setGrading] = useState('idle')
      const [gradedAttempt, setGradedAttempt] = useState(null)
      const [pendingAttemptId, setPendingAttemptId] = useState(null)
      const pendingRef = useRef(null)
      const [quiz, setQuiz] = useState(null)
      const [quizAnswer, setQuizAnswer] = useState('')
      const [quizGrading, setQuizGrading] = useState('idle')
      const [quizAttempt, setQuizAttempt] = useState(null)
      const [muted, setMuted] = useState(false)
      const [weak, setWeak] = useState({ items: [] })
      const [report, setReport] = useState(null)
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

      /** Ask the host whether a leave-quiz should appear now. */
      const maybeQuiz = useCallback(async () => {
        if (!sessionId || muted) return
        try {
          const sampled = await request('quiz', {}, sessionId)
          if (!sampled || !sampled.question) return
          setQuiz(sampled.question)
          setQuizAnswer('')
          setQuizGrading('idle')
          setQuizAttempt(null)
        } catch {
          // A failed sample is not worth interrupting the reader.
        }
      }, [sessionId, muted])


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
          if (tab === 'report') setReport((await request('report', {}, sessionId)).report ?? null)
          if (tab === 'study') {
            // Keep the reader where they were: refresh the open card, only fall
            // back to the queue head when no card is open.
            if (card) {
              const detail = await request('question', { id: card.id }, sessionId)
              if (detail.question) setCard(detail.question)
            } else {
              await loadQueue(sessionId, nodeId, revisit)
            }
          }
          setError(null)
        } catch (err) {
          fail(err)
        } finally {
          setBusy(false)
        }
      }, [sessionId, tab, nodeId, revisit, card, loadBasics, loadQueue, fail])

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
        maybeQuiz()
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
      }, [sessionId, card, nodeId, revisit, history, cursor, page, loadQueue, showCard, refreshTree, maybeQuiz, fail])

      const prevQuestion = useCallback(async () => {
        if (!sessionId) return
        maybeQuiz()
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
      }, [sessionId, cursor, page, history, showCard, maybeQuiz, fail])

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
        if (id !== nodeId) maybeQuiz()
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

      const openQuestion = useCallback(async id => {
        if (!sessionId) return
        try {
          const detail = await request('question', { id }, sessionId)
          if (!detail.question) {
            setError(t('relatedGone'))
            return
          }
          setCard(detail.question)
          setAnswerOpen(false)
          setOpenTerm(null)
          setError(null)
        } catch (err) {
          fail(err)
        }
      }, [sessionId, t, fail])

      const fillRelated = useCallback(() => {
        if (!card) return
        const text = `请用 learning_question update 给题号 ${card.id} 补 related：questions 写题库里另一道题的题干原文（最多 3 条），deeper 与 broader 各写 1-3 条你自己的问题，写完告诉我。`
        ask(text)
      }, [card, ask])

      /** Poll one attempt until it has a grade, then store it for its surface. */
      const pollAttempt = useCallback((attemptId, tries, mode) => {
        if (!stillPending(pendingRef.current, attemptId)) return
        if (tries >= 45) {
          if (mode === 'quiz') setQuizGrading('timeout')
          else setGrading('timeout')
          return
        }
        setTimeout(async () => {
          if (!sessionId) return
          if (!stillPending(pendingRef.current, attemptId)) return
          try {
            const got = await request('attempt', { action: 'get', attemptId }, sessionId)
            if (!stillPending(pendingRef.current, attemptId)) return
            if (got.attempt && got.attempt.grade) {
              if (mode === 'quiz') {
                setQuizAttempt(got.attempt)
                setQuizGrading('done')
              } else {
                setGradedAttempt(got.attempt)
                setGrading('done')
              }
              pendingRef.current = null
              return
            }
            pollAttempt(attemptId, tries + 1, mode)
          } catch {
            if (mode === 'quiz') setQuizGrading('timeout')
            else setGrading('timeout')
          }
        }, 2000)
      }, [sessionId])

      const submitAnswer = useCallback(async () => {
        if (!sessionId || !card || !canSubmit(card)) return
        const text = answer.trim()
        if (text.length === 0) return
        setGrading('waiting')
        try {
          const started = await request('attempt', { action: 'start', questionId: card.id, answer: text, kind: 'study' }, sessionId)
          setPendingAttemptId(started.attemptId)
          pendingRef.current = { attemptId: started.attemptId, questionId: card.id }
          await ask(`批改答题 ${started.attemptId}：先 learning_grade open 取题与答案，再 submit 写回 covered/missed/wrong/feedback/suggestion（命中率低于 0.6 时必给 suggestion）。`)
          pollAttempt(started.attemptId, 0, 'study')
        } catch (err) {
          setGrading('idle')
          fail(err)
        }
      }, [sessionId, card, answer, ask, pollAttempt, fail])

      const retryGrading = useCallback(() => {
        if (!pendingAttemptId) {
          setGrading('idle')
          return
        }
        setGrading('waiting')
        ask(`批改答题 ${pendingAttemptId}：用 learning_grade open 取题与答案，再用 submit 写回覆盖/漏点/说错/反馈/优化答案。`)
        pollAttempt(pendingAttemptId, 0, 'study')
      }, [pendingAttemptId, ask, pollAttempt])

      const submitQuiz = useCallback(async () => {
        if (!sessionId || !quiz) return
        if (!Array.isArray(quiz.points) || quiz.points.length === 0) return
        const text = quizAnswer.trim()
        if (text.length === 0) return
        setQuizGrading('waiting')
        try {
          const started = await request('attempt', { action: 'start', questionId: quiz.id, answer: text, kind: 'quiz' }, sessionId)
          pendingRef.current = { attemptId: started.attemptId, questionId: quiz.id }
          await ask(`批改答题 ${started.attemptId}：先 learning_grade open 取题与答案，再 submit 写回 covered/missed/wrong/feedback/suggestion（命中率低于 0.6 时必给 suggestion）。`)
          pollAttempt(started.attemptId, 0, 'quiz')
        } catch (err) {
          setQuizGrading('idle')
          fail(err)
        }
      }, [sessionId, quiz, quizAnswer, ask, pollAttempt, fail])

      const closeQuiz = useCallback(() => {
        pendingRef.current = null
        setQuiz(null)
        setQuizGrading('idle')
        setQuizAttempt(null)
      }, [])

      const retryQuiz = useCallback(() => {
        const pending = pendingRef.current
        if (!pending) {
          setQuizGrading('idle')
          return
        }
        setQuizGrading('waiting')
        ask(`批改答题 ${pending.attemptId}：用 learning_grade open 取题与答案，再用 submit 写回覆盖/漏点/说错/反馈/优化答案。`)
        pollAttempt(pending.attemptId, 0, 'quiz')
      }, [ask, pollAttempt])

      const loadWeak = useCallback(async () => {
        if (!sessionId) return
        try {
          setWeak(await request('weak', {}, sessionId))
        } catch (err) {
          fail(err)
        }
      }, [sessionId, fail])

      const loadReport = useCallback(async () => {
        if (!sessionId) return
        try {
          const result = await request('report', {}, sessionId)
          setReport(result.report ?? null)
        } catch (err) {
          fail(err)
        }
      }, [sessionId, fail])


      const dismissWeak = useCallback(async id => {
        try {
          await request('setDismissed', { questionId: id, on: true }, sessionId)
          await loadWeak()
        } catch (err) {
          fail(err)
        }
      }, [sessionId, loadWeak, fail])

      const openWeak = useCallback(async id => {
        setTab('study')
        setQuiz(null)
        await openQuestion(id)
      }, [openQuestion])

      const fillSupplement = useCallback(() => {
        if (!card) return
        ask(`用 learning_question update 给题号 ${card.id} 补 reference.supplement：写面试里被追问时你会怎么讲这道题，或这道题的陷阱与常见错误；写完告诉我。`)
      }, [card, ask])

      useEffect(() => {
        setAnswer('')
        setGradedAttempt(null)
        // A card whose newest attempt has no grade yet is still being graded
        // (the learner may have reloaded mid-wait): resume the poll there.
        const state = gradingStateFor(card)
        setGrading(state.grading)
        setPendingAttemptId(state.pendingAttemptId)
        pendingRef.current = state.pendingAttemptId && card
          ? { attemptId: state.pendingAttemptId, questionId: card.id }
          : null
        if (state.pendingAttemptId) pollAttempt(state.pendingAttemptId, 0, 'study')
        // Intentionally keyed on the card identity only: re-running on every
        // callback identity would restart the poll on unrelated renders.
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [card && card.id])

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
        if (tab === 'study' && name !== 'study') maybeQuiz()
        setTab(name)
        if (!sessionId) return
        try {
          if (name === 'bank') setChecklist(await request('checklist', {}, sessionId))
          if (name === 'favorite') setFavorites(await request('favorites', {}, sessionId))
          if (name === 'weak') await loadWeak()
          if (name === 'report') await loadReport()
          setError(null)
        } catch (err) {
          fail(err)
        }
      }, [tab, maybeQuiz, sessionId, loadWeak, loadReport, fail])

      const changeStageStatus = useCallback(async (stageId, status) => {
        try {
          await request('setStageStatus', { stageId, status }, sessionId)
          const nextMeta = await request('meta', {}, sessionId)
          setMeta(nextMeta)
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

      const tabs = ['study', 'bank', 'weak', 'favorite', 'plan', 'report']

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
              onFillSupplement: fillSupplement,
            }),
            h(AnswerCard, {
              card,
              t,
              answer,
              grading,
              onAnswer: setAnswer,
              onSubmit: submitAnswer,
              onRetry: retryGrading,
              onFillSupplement: fillSupplement,
              gradeAttempt: gradedAttempt && card && gradedAttempt.questionId === card.id
                ? gradedAttempt
                : (card && card.lastAttempt && card.lastAttempt.grade ? card.lastAttempt : null),
            }),
            h(RelatedChips, {
              card,
              t,
              onOpenQuestion: openQuestion,
              onAsk: ask,
              onFill: fillRelated,
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

      const weakPane = hasTarget && hasTree && tab === 'weak'
        ? h(WeakList, { items: weak.items, t, onOpen: openWeak, onDismiss: dismissWeak })
        : null

      const planPane = hasTarget && hasTree && tab === 'plan'
        ? h(PlanList, { stages: stagesFrom(meta), t, onStatus: changeStageStatus, onAsk: ask })
        : null

      const reportPane = hasTarget && hasTree && tab === 'report'
        ? h(ReportPane, { report, t, onAsk: ask })
        : null

      const mainPane = h('div', { className: 'lc-main' },
        hasTarget ? null : h(EmptyState, { t, busy, onSave: saveTarget }),
        hasTarget && !hasTree
          ? h('div', { className: 'lc-empty' },
            h('h2', { className: 'lc-cardTitle' }, meta.target.title),
            h('p', { className: 'lc-node-sub' }, meta.target.statement || ''),
            h('p', { className: 'lc-node-sub' }, t('noTree')),
            h('div', { className: 'lc-actions' },
              h('button', { type: 'button', className: 'lc-btn lc-btn-primary', onClick: () => ask(PLAN_PROMPT) }, t('planCta'))))
          : null,
        studyPane,
        bankPane,
        weakPane,
        favoritesPane,
        planPane,
        reportPane)

      return h('div', { className: 'lc-root' }, head, toastRow, errorRow,
        h('div', { className: 'lc-body' }, treePane, mainPane),
        quiz
          ? h(QuizModal, {
            card: quiz,
            t,
            points: quiz.points,
            answer: quizAnswer,
            onAnswer: setQuizAnswer,
            grading: quizGrading,
            gradeAttempt: quizAttempt,
            onSubmit: submitQuiz,
            onSkip: closeQuiz,
            onRetry: retryQuiz,
            onMute: () => {
              setMuted(true)
              closeQuiz()
            },
          })
          : null)
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
     * The related rows under a card: same-bank questions to jump to, deeper and
     * broader questions to ask the agent. An empty block offers one button that
     * asks the agent to fill it for this question.
     * @param {{card: object, t: Function, onOpenQuestion: Function, onAsk: Function, onFill: Function}} props - component props.
     * @returns {object} React node.
     */
    function RelatedChips({ card, t, onOpenQuestion, onAsk, onFill }) {
      const related = (card && card.related) || { questions: [], deeper: [], broader: [] }
      const questions = (card && card.relatedQuestions) || []
      const deeper = Array.isArray(related.deeper) ? related.deeper : []
      const broader = Array.isArray(related.broader) ? related.broader : []
      if (questions.length === 0 && deeper.length === 0 && broader.length === 0) {
        return h('div', { className: 'lc-related' },
          h('button', { type: 'button', className: 'lc-btn', onClick: onFill }, t('relatedFill')))
      }
      /**
       * @param {string} label - row label.
       * @param {object[]} chips - chip buttons.
       * @returns {object} one labelled row.
       */
      const row = (label, chips) => h('div', { className: 'lc-related-row' },
        h('span', { className: 'lc-related-label' }, label),
        chips)
      return h('div', { className: 'lc-related' },
        questions.length > 0
          ? row(t('relatedOpen'), questions.map(item => h('button', {
            key: item.id,
            type: 'button',
            className: 'lc-btn',
            onClick: () => onOpenQuestion(item.id),
          }, item.stem.length > 24 ? `${item.stem.slice(0, 24)}…` : item.stem)))
          : null,
        deeper.length > 0
          ? row(t('relatedDeeper'), deeper.map((text, index) => h('button', {
            key: `d${index}`,
            type: 'button',
            className: 'lc-btn',
            onClick: () => onAsk(text),
          }, text)))
          : null,
        broader.length > 0
          ? row(t('relatedBroader'), broader.map((text, index) => h('button', {
            key: `b${index}`,
            type: 'button',
            className: 'lc-btn',
            onClick: () => onAsk(text),
          }, text)))
          : null)
    }

    /**
     * What grading state a freshly opened card starts in: a newest attempt that
     * has not been graded yet means the reader should see "grading…" and the
     * poll should resume.
     * @param {object|null} card - question card.
     * @returns {{grading: string, pendingAttemptId: string|null}} initial state.
     */
    function gradingStateFor(card) {
      const last = card && card.lastAttempt
      if (last && !last.grade) return { grading: 'waiting', pendingAttemptId: last.id }
      return { grading: 'idle', pendingAttemptId: null }
    }

    /**
     * @param {{attemptId: string}|null} pending - the attempt the surface is waiting for.
     * @param {string} attemptId - the attempt a poll just resolved.
     * @returns {boolean} whether the result still belongs on screen.
     */
    function stillPending(pending, attemptId) {
      return Boolean(pending && pending.attemptId === attemptId)
    }

    /**
     * Whether a card can be graded: there must be key points to grade against.
     * @param {object} card - question card.
     * @returns {boolean} whether the submit control is allowed.
     */
    function canSubmit(card) {
      const points = card && card.reference && card.reference.points
      return Array.isArray(points) && points.length > 0
    }

    /**
     * One graded attempt: what hit, what was missed, what was wrong, and — when
     * the hit rate is low — a better answer to read.
     * @param {{attempt: object, t: Function}} props - component props.
     * @returns {object|null} React node, or null without a grade.
     */
    function GradeBlock({ attempt, t }) {
      const grade = attempt && attempt.grade
      if (!grade) return null
      const score = typeof grade.score === 'number' ? grade.score : null
      const showSuggestion = grade.suggestion && score !== null && score < 0.6
      const list = (label, items) => (Array.isArray(items) && items.length > 0
        ? h('div', { className: 'lc-grade-row' },
          h('span', { className: 'lc-related-label' }, label),
          h('span', null, items.join('；')))
        : null)
      return h('div', { className: 'lc-grade' },
        list(t('coveredLabel'), grade.covered),
        list(t('missedLabel'), grade.missed),
        list(t('wrongLabel'), grade.wrong),
        list(t('feedbackLabel'), grade.feedback ? [grade.feedback] : []),
        showSuggestion
          ? h('div', { className: 'lc-suggestion' },
            h('div', { className: 'lc-related-label' }, t('suggestionLabel')),
            h('div', null, grade.suggestion))
          : null)
    }

    /**
     * The reference answer's second block: an interview narrative or the
     * pitfalls of this question. Missing text becomes a fill button.
     * @param {{reference: object, t: Function, onFill: Function}} props - component props.
     * @returns {object} React node.
     */
    function SupplementBlock({ reference, t, onFill }) {
      const supplement = reference && typeof reference.supplement === 'string' ? reference.supplement : ''
      return h('div', { className: 'lc-supplement' },
        h('div', { className: 'lc-related-label' }, t('supplementTitle')),
        supplement.length > 0
          ? h('div', { className: 'lc-answer' }, supplement)
          : h('button', { type: 'button', className: 'lc-btn', onClick: onFill }, t('supplementFill')))
    }

    /**
     * The answer box under a card: type, submit for grading, read the grade.
     * @param {object} props - component props.
     * @returns {object} React node.
     */
    function AnswerCard({ card, t, answer, onAnswer, grading, gradeAttempt, onSubmit, onRetry, onFillSupplement }) {
      const points = card && card.reference && card.reference.points
      const hasPoints = Array.isArray(points) && points.length > 0
      return h('div', { className: 'lc-card lc-answer-card' },
        h('label', { className: 'lc-label' }, t('answerLabel')),
        h('textarea', {
          className: 'lc-input',
          rows: 4,
          value: answer,
          disabled: grading === 'waiting',
          onChange: event => onAnswer(event.target.value),
        }),
        h('div', { className: 'lc-actions' },
          h('button', {
            type: 'button',
            className: 'lc-btn lc-btn-primary',
            disabled: !hasPoints || answer.trim().length === 0 || grading === 'waiting',
            onClick: onSubmit,
          }, t('submitGrade')),
          grading === 'waiting' ? h('span', { className: 'lc-node-sub' }, t('gradingWait')) : null,
          grading === 'timeout'
            ? h('button', { type: 'button', className: 'lc-btn', onClick: onRetry }, t('retryGrade'))
            : null),
        hasPoints ? null : h('p', { className: 'lc-node-sub' }, t('noPoints')),
        grading === 'timeout' ? h('p', { className: 'lc-node-sub' }, t('gradingTimeout')) : null,
        gradeAttempt ? h(GradeBlock, { attempt: gradeAttempt, t }) : null)
    }

    /**
     * The leave-question quiz: one question, an answer box, submit, skip, mute.
     * @param {object} props - component props.
     * @returns {object} React node.
     */
    function QuizModal({ card, t, points, answer, onAnswer, grading, gradeAttempt, onSubmit, onSkip, onMute, onRetry }) {
      const hasPoints = Array.isArray(points) && points.length > 0
      return h('div', { className: 'lc-backdrop' },
        h('div', { className: 'lc-modal' },
          h('h2', { className: 'lc-cardTitle' }, t('quizTitle')),
          h('p', { className: 'lc-stem' }, card.stem),
          h('textarea', {
            className: 'lc-input',
            rows: 4,
            value: answer,
            disabled: grading === 'waiting',
            onChange: event => onAnswer(event.target.value),
          }),
          h('div', { className: 'lc-actions' },
            h('button', {
              type: 'button',
              className: 'lc-btn lc-btn-primary',
              disabled: !hasPoints || answer.trim().length === 0 || grading === 'waiting',
              onClick: onSubmit,
            }, t('submitGrade')),
            h('button', { type: 'button', className: 'lc-btn', onClick: onSkip }, t('quizSkip')),
            h('button', {
              type: 'button',
              className: 'lc-btn',
              onClick: () => {
                onMute()
              },
            }, t('quizMute'))),
          hasPoints ? null : h('p', { className: 'lc-node-sub' }, t('noPoints')),
          grading === 'waiting' ? h('p', { className: 'lc-node-sub' }, t('gradingWait')) : null,
          grading === 'timeout'
            ? h('div', { className: 'lc-actions' },
              h('span', { className: 'lc-node-sub' }, t('gradingTimeout')),
              h('button', { type: 'button', className: 'lc-btn', onClick: onRetry }, t('retryGrade')))
            : null,
          gradeAttempt ? h(GradeBlock, { attempt: gradeAttempt, t }) : null))
    }

    /**
     * The weak-question list: one row per question, reopen or dismiss.
     * @param {object} props - component props.
     * @returns {object} React node.
     */
    function WeakList({ items, t, onOpen, onDismiss }) {
      if (!Array.isArray(items) || items.length === 0) {
        return h('p', { className: 'lc-node-sub' }, t('weakEmpty'))
      }
      return h('div', null, items.map(item => h('div', { className: 'lc-row', key: item.id },
        h('div', { style: { minWidth: 0, flex: '1 1 auto' } },
          h('div', { className: 'lc-stem', style: { margin: 0 } }, item.stem),
          h('div', { className: 'lc-flag-list' }, `${t('weakMisses')} ${item.misses} · ${t('weakLastScore')} ${item.lastScore === null ? '—' : item.lastScore}`)),
        h('div', { className: 'lc-actions' },
          h('button', { type: 'button', className: 'lc-btn', onClick: () => onOpen(item.id) }, t('gradeAgain')),
          h('button', { type: 'button', className: 'lc-btn', onClick: () => onDismiss(item.id) }, t('weakDismiss'))))))
    }

    /**
     * Build the plan page's rows from `meta`: resolve node ids to titles and
     * tolerate the string-or-object shapes a model may write.
     * @param {object|null} meta - target, tree, plan.
     * @returns {object[]} stages for `PlanList`.
     */
    function stagesFrom(meta) {
      const tree = meta && Array.isArray(meta.tree) ? meta.tree : []
      const titles = new Map(tree.map(node => [node.id, node.title]))
      const plan = meta && Array.isArray(meta.plan) ? meta.plan : []
      return plan.map((stage, index) => ({
        // The host normalises ids on read; this is the last-resort fallback so a
        // stage never renders without one.
        id: typeof stage.id === 'string' && stage.id.length > 0 ? stage.id : `p_${index + 1}`,
        title: typeof stage.title === 'string' ? stage.title : '',
        status: ['todo', 'doing', 'done'].includes(stage.status) ? stage.status : 'todo',
        nodeTitles: Array.isArray(stage.nodeTitles) && stage.nodeTitles.length > 0
          ? stage.nodeTitles
          : (Array.isArray(stage.nodeIds) ? stage.nodeIds : []).map(id => titles.get(id)).filter(Boolean),
        reading: stage.reading ?? [],
        prereqs: Array.isArray(stage.prereqs) ? stage.prereqs : [],
        perspectives: Array.isArray(stage.perspectives) ? stage.perspectives : [],
        project: stage.project ?? null,
        checkpoints: Array.isArray(stage.checkpoints) ? stage.checkpoints : [],
      }))
    }

    /**
     * @param {*} reading - a string or a list of strings / `{ file, section, pages }`.
     * @returns {string[]} human lines for the plan page.
     */
    function readingLines(reading) {
      if (typeof reading === 'string') return reading.length > 0 ? [reading] : []
      if (!Array.isArray(reading)) return []
      return reading.map(item => {
        if (typeof item === 'string') return item
        if (!item || typeof item !== 'object') return ''
        const parts = [item.file, item.section].filter(part => typeof part === 'string' && part.length > 0)
        if (Array.isArray(item.pages) && item.pages.length === 2) parts.push(`p${item.pages[0]}-${item.pages[1]}`)
        return parts.join(' · ')
      }).filter(line => line.length > 0)
    }

    /**
     * @param {*} project - a string or `{ title, deliverable }`.
     * @returns {string} one line for the plan page.
     */
    function projectLine(project) {
      if (typeof project === 'string') return project
      if (!project || typeof project !== 'object') return ''
      const title = typeof project.title === 'string' ? project.title : ''
      const deliverable = typeof project.deliverable === 'string' ? project.deliverable : ''
      return [title, deliverable].filter(part => part.length > 0).join(' — ')
    }

    /**
     * @param {*} at - ISO timestamp or anything else.
     * @returns {string} the time in the reader's own zone, not UTC.
     */
    function formatWhen(at) {
      if (at === null || at === undefined) return ''
      const date = new Date(at)
      if (Number.isNaN(date.getTime())) return String(at)
      return date.toLocaleString()
    }

    /**
     * The plan page: one block per stage, three status buttons.
     * @param {object} props - component props.
     * @returns {object} React node.
     */
    function PlanList({ stages, t, onStatus, onAsk }) {
      if (!Array.isArray(stages) || stages.length === 0) {
        return h('div', { className: 'lc-empty' },
          h('p', { className: 'lc-node-sub' }, t('planEmpty')),
          h('div', { className: 'lc-actions' },
            h('button', { type: 'button', className: 'lc-btn lc-btn-primary', onClick: () => onAsk(t('planAskPrompt')) }, t('planAsk'))))
      }
      const statuses = ['todo', 'doing', 'done']
      return h('div', null, stages.map(stage => h('div', { className: 'lc-card', key: stage.id },
        h('div', { className: 'lc-actions' },
          h('h2', { className: 'lc-cardTitle', style: { marginRight: 8 } }, stage.title),
          statuses.map(status => h('button', {
            key: status,
            type: 'button',
            className: 'lc-btn',
            'data-active': String(stage.status === status),
            onClick: () => onStatus(stage.id, status),
          }, t(`stage.${status}`)))),
        stage.nodeTitles.length > 0 ? h('div', { className: 'lc-meta' }, h('span', null, `${t('planNodes')}: ${stage.nodeTitles.join(' · ')}`)) : null,
        readingLines(stage.reading).length > 0
          ? h('div', { className: 'lc-meta' }, h('span', null, `${t('planReading')}: ${readingLines(stage.reading).join('；')}`))
          : null,
        stage.prereqs.length > 0 ? h('div', { className: 'lc-meta' }, h('span', null, `${t('planPrereqs')}: ${stage.prereqs.join('；')}`)) : null,
        stage.perspectives.length > 0 ? h('div', { className: 'lc-meta' }, h('span', null, `${t('planPerspectives')}: ${stage.perspectives.join('；')}`)) : null,
        projectLine(stage.project).length > 0
          ? h('div', { className: 'lc-meta' }, h('span', null, `${t('planProject')}: ${projectLine(stage.project)}`))
          : null,
        stage.checkpoints.length > 0
          ? h('ul', { className: 'lc-points' }, stage.checkpoints.map((checkpoint, index) => h('li', { key: index }, checkpoint)))
          : null)))
    }

    /**
     * The audit page: the newest report, or an invitation to run one.
     * @param {object} props - component props.
     * @returns {object} React node.
     */
    function ReportPane({ report, t, onAsk }) {
      return h('div', null,
        h('div', { className: 'lc-actions' },
          h('button', {
            type: 'button',
            className: 'lc-btn lc-btn-primary',
            onClick: () => onAsk(t('reportAskPrompt')),
          }, report ? t('reportRetake') : t('reportAsk'))),
        report
          ? h('div', null,
            h('div', { className: 'lc-meta' }, h('span', null, `${t('reportAt')}: ${formatWhen(report.at)}`)),
            h('div', { className: 'lc-report' }, report.markdown))
          : h('p', { className: 'lc-node-sub' }, t('reportEmpty')))
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
      __test: { PanelBoundary, popoverStyle, Icon, TermPopover, isOutsidePopover, TERM_ACCENT, RelatedChips, GradeBlock, canSubmit, QuizModal, WeakList, QuestionCard, SupplementBlock, gradingStateFor, stillPending, PlanList, ReportPane, stagesFrom, formatWhen },
    }
  },
})
