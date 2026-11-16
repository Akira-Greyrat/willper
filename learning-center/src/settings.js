/**
 * Settings the panel may write: each field is clamped or dropped, so a bad
 * request can never corrupt `meta.settings`.
 * @module @local/learning-center/src/settings
 */

/**
 * @param {*} value - candidate number.
 * @returns {number|null} the number, or null when it is not finite.
 */
function finite(value) {
  const number = typeof value === 'string' ? Number(value) : value
  return typeof number === 'number' && Number.isFinite(number) ? number : null
}

/**
 * @param {object} patch - raw request from the panel.
 * @returns {object} only the valid, clamped keys.
 */
export function normalizeSettingsPatch(patch) {
  const source = patch && typeof patch === 'object' ? patch : {}
  const out = {}
  const rate = finite(source.leavePromptRate)
  if (rate !== null) out.leavePromptRate = Math.min(1, Math.max(0, rate))
  const cooldown = finite(source.quizCooldownMinutes)
  if (cooldown !== null) out.quizCooldownMinutes = Math.max(0, Math.round(cooldown))
  if (typeof source.autoAcceptDrafts === 'boolean') out.autoAcceptDrafts = source.autoAcceptDrafts
  return out
}
