#!/usr/bin/env node
/**
 * Static package check for the learning-center bundle: manifest, exports, files,
 * locale parity, client dictionary parity, and "every op the panel calls exists
 * in the route". Run before installing or after editing copy/ops.
 */

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', 'learning-center')
const problems = []
const notes = []

/**
 * @param {string} message - failure to report.
 * @returns {void}
 */
function fail(message) {
  problems.push(message)
}

/**
 * Extract one top-level object literal assigned to `name` in a source file.
 * @param {string} source - file text.
 * @param {string} name - the identifier.
 * @returns {string|null} the literal text, braces included.
 */
function objectLiteral(source, name) {
  const start = source.indexOf(`const ${name} = {`)
  if (start === -1) return null
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1
    else if (source[i] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open, i + 1)
    }
  }
  return null
}

const manifestText = await readFile(join(root, 'package.json'), 'utf8')
const manifest = JSON.parse(manifestText)

for (const field of ['name', 'version', 'type', 'exports', 'files']) {
  if (!(field in manifest)) fail(`package.json 缺少 ${field}`)
}
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') fail('package.json dsh.bundle.patch 不是 ./cordis.patch.yml')
if (manifest.dsh?.client?.platform !== 'web') fail('package.json dsh.client.platform 不是 web')
if (!existsSync(join(root, 'cordis.patch.yml'))) fail('缺少 cordis.patch.yml')

const exports = manifest.exports ?? {}
for (const [key, value] of Object.entries(exports)) {
  if (key.includes('*')) continue
  if (!existsSync(join(root, value))) fail(`exports ${key} 指向的文件不存在：${value}`)
}
for (const entry of manifest.files ?? []) {
  if (entry.includes('*')) continue
  if (!existsSync(join(root, entry))) fail(`files 里列了不存在的路径：${entry}`)
}
for (const needed of ['index.js', 'client.js', 'src', 'docs/DETAIL.md', 'icon.svg', 'locale/zh.json', 'locale/en.json']) {
  if (!existsSync(join(root, needed))) fail(`缺少运行所需文件：${needed}`)
}

const icon = await readFile(join(root, 'icon.svg'), 'utf8')
if (!icon.trimStart().startsWith('<svg') || !icon.trimEnd().endsWith('</svg>')) fail('icon.svg 不是完整的 SVG')

/**
 * @param {unknown} value - parsed JSON.
 * @param {string} path - dotted path for diagnostics.
 * @param {string[]} out - collected keys.
 * @returns {void}
 */
function flattenKeys(value, path, out) {
  for (const [key, child] of Object.entries(value ?? {})) {
    const next = path ? `${path}.${key}` : key
    out.push(next)
    if (child && typeof child === 'object' && !Array.isArray(child)) flattenKeys(child, next, out)
  }
}

const locales = {}
for (const lang of ['zh', 'en']) {
  locales[lang] = JSON.parse(await readFile(join(root, `locale/${lang}.json`), 'utf8'))
}
const zhKeys = []
const enKeys = []
flattenKeys(locales.zh, '', zhKeys)
flattenKeys(locales.en, '', enKeys)
for (const key of zhKeys) if (!enKeys.includes(key)) fail(`locale/en.json 缺少键：${key}`)
for (const key of enKeys) if (!zhKeys.includes(key)) fail(`locale/zh.json 缺少键：${key}`)

const clientSource = await readFile(join(root, 'client.js'), 'utf8')
const zhLiteral = objectLiteral(clientSource, 'ZH')
const enLiteral = objectLiteral(clientSource, 'EN')
if (!zhLiteral || !enLiteral) {
  fail('client.js 里找不到 ZH / EN 词典')
} else {
  const zh = new Function(`return (${zhLiteral})`)()
  const en = new Function(`return (${enLiteral})`)()
  const zhClientKeys = []
  const enClientKeys = []
  flattenKeys(zh, '', zhClientKeys)
  flattenKeys(en, '', enClientKeys)
  for (const key of zhClientKeys) if (!enClientKeys.includes(key)) fail(`client.js EN 缺少键：${key}`)
  for (const key of enClientKeys) if (!zhClientKeys.includes(key)) fail(`client.js ZH 缺少键：${key}`)
  notes.push(`client 词条：${zhClientKeys.filter(key => !key.includes('.')).length} 条`)
}

const routeSource = await readFile(join(root, 'src/route.js'), 'utf8')
const routeOps = new Set([...routeSource.matchAll(/case '([a-zA-Z]+)':/g)].map(match => match[1]))
const clientOps = new Set([...clientSource.matchAll(/request\('([a-zA-Z]+)'/g)].map(match => match[1]))
for (const op of clientOps) if (!routeOps.has(op)) fail(`面板调用了路由没有的 op：${op}`)

const toolsSource = await readFile(join(root, 'src/tools.js'), 'utf8')
const toolNames = [...toolsSource.matchAll(/name: '(learning_[a-z]+)'/g)].map(match => match[1])
if (new Set(toolNames).size !== 5) fail(`工具数量不是 5：${toolNames.join(',')}`)

notes.push(`路由 op：${[...routeOps].sort().join(', ')}`)
notes.push(`工具：${toolNames.join(', ')}`)

for (const note of notes) console.log(`· ${note}`)
if (problems.length > 0) {
  for (const problem of problems) console.error(`✖ ${problem}`)
  process.exitCode = 1
} else {
  console.log('✔ 包检查通过')
}
