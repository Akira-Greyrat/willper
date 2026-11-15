/**
 * Config defaults and tolerant reading of the loader row's `config`. The plugin
 * deliberately declares no Config schema: a bad value in the patch layer falls
 * back to the default here instead of failing activation.
 * @module @local/learning-center/src/config
 */

/** @type {{ storeDir: string, leavePromptRate: number, quizCooldownMinutes: number, autoAcceptDrafts: boolean, maxDraftBytes: number }} */
export const DEFAULTS = {
  storeDir: 'learning',
  leavePromptRate: 0.15,
  quizCooldownMinutes: 10,
  autoAcceptDrafts: false,
  maxDraftBytes: 8 * 1024 * 1024,
}

/**
 * @param {string} field - config field name.
 * @param {*} value - candidate value.
 * @returns {boolean} whether the value has the default's type.
 */
function sameTypeAsDefault(field, value) {
  return typeof value === typeof DEFAULTS[field]
}

/**
 * Read the row config with defaults for missing or mistyped fields.
 * @param {object|undefined} raw - loader row config.
 * @returns {typeof DEFAULTS} resolved config.
 */
export function readConfig(raw) {
  const config = { ...DEFAULTS }
  if (!raw || typeof raw !== 'object') return config
  for (const field of Object.keys(DEFAULTS)) {
    const value = raw[field]
    if (value === undefined || value === null) continue
    if (!sameTypeAsDefault(field, value)) continue
    config[field] = value
  }
  config.leavePromptRate = Math.min(1, Math.max(0, config.leavePromptRate))
  if (config.maxDraftBytes <= 0) config.maxDraftBytes = DEFAULTS.maxDraftBytes
  return config
}
