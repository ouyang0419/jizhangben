import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const www = join(root, 'www')
const files = ['index.html', 'styles.css', 'app.js', 'icon.svg', 'manifest.webmanifest', 'sw.js']

rmSync(www, { recursive: true, force: true })
mkdirSync(www, { recursive: true })
for (const file of files) cpSync(join(root, file), join(www, file))
