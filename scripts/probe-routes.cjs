const fs = require('node:fs')
const base = 'D:\\Software\\DeepSeekHarness\\DSHwin\\resources\\app.asar\\dsh\\node_modules\\@deepseek-ai\\dsh-client-modules\\src'
const text = fs.readFileSync(base + '\\index.ts', 'utf8')
const lines = text.split('\n')
for (let i = 0; i < lines.length; i += 1) {
  if (/webServer\.register|kind: '|path:|routePath|\/plugins\/|\/assets\//.test(lines[i])) {
    console.log(String(i + 1).padStart(4), lines[i].trim().slice(0, 160))
  }
}
