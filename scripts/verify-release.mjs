import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
// Check every emitted file, not just rendered UI; students must never enter the bundle.
const localEnv = await readFile('.env.local', 'utf8').catch(() => '')
const privateEmail = localEnv.match(/^SITE_OWNER_EMAIL=(.+)$/m)?.[1].trim()
const forbidden = ['DEEPSEEK_API_KEY', 'AMAP_SECURITY_JS_CODE', ...(privateEmail ? [privateEmail] : [])]
async function walk(dir) {
  const files = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, e.name)
    files.push(...(e.isDirectory() ? await walk(p) : [p]))
  }
  return files
}
const files = await walk('dist')
const leaks = []
for (const path of files.filter((p) => /\.(js|css|html|txt|json)$/.test(p))) {
  const text = await readFile(path, 'utf8')
  for (const needle of forbidden) {
    if (text.includes(needle)) leaks.push(`${path}: private identifier or server secret name`)
  }
  if (/sb_secret_[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{24,}|student1\.txt\s*[:=]\s*[`'"]/.test(text))
    leaks.push(`${path}: possible private fixture or secret value`)
}
if (files.some((p) => /student\d*\.txt$|\.env/.test(p))) leaks.push('private source file in dist')
if (leaks.length) {
  console.error(leaks.join('\n'))
  process.exit(1)
}
console.log(
  `Release privacy scan passed: ${files.length} emitted files, no configured private identifiers or secret names.`,
)
