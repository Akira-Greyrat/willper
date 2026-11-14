// Probe 2: asar-aware fs + absolute requires from the running Electron runtime.
const fs = require('node:fs')
const path = require('node:path')
const base = 'D:\\Software\\DeepSeekHarness\\DSHwin\\resources\\app.asar\\dsh\\node_modules'
try {
  const names = fs.readdirSync(base).filter(name => /^react|^scheduler|^react-dom/.test(name))
  console.log('react-ish packages:', names.join(', ') || '(none)')
} catch (error) {
  console.log('readdir failed:', error.message)
}
for (const name of ['react', 'react-dom', 'scheduler']) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(base, name, 'package.json'), 'utf8'))
    console.log(name, 'version', pkg.version, 'main', pkg.main)
  } catch (error) {
    console.log(name, 'missing:', error.message)
  }
}
