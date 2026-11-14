/**
 * Host half of the learning-center bundle. Task 11 fills `apply` in.
 * @module @local/learning-center
 */

export const name = 'learning-center'

export const inject = ['tools', 'commands', 'webServer', 'workingDirectory']

/**
 * Register the learning-center tools, the `/learn` command and the panel route.
 * @param {object} ctx - registrant context.
 * @param {object} [config] - loader row config; defaults come from src/config.js.
 */
export function apply(ctx, config) {
  // Filled in by Task 11.
}
