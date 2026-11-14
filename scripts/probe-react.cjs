// Probe: can we require React from the running Electron runtime and read the app's modules?
const path = require('node:path')
console.log('execPath', process.execPath)
try {
  const react = require('react')
  console.log('react', react.version)
} catch (error) {
  console.log('react failed:', error.message)
}
try {
  const server = require('react-dom/server')
  console.log('react-dom/server renderToString:', typeof server.renderToString)
} catch (error) {
  console.log('react-dom failed:', error.message)
}
try {
  const resolved = require.resolve('@deepseek-ai/dsh-client-ui-primitives/package.json')
  console.log('primitives', resolved)
} catch (error) {
  console.log('primitives resolve failed:', error.message)
}
