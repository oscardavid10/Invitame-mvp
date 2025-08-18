import fs from 'fs/promises'
import path from 'path'
import readline from 'readline'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
rl.question('Nombre de la nueva plantilla: ', async (name) => {
  rl.close()
  const trimmed = String(name || '').trim()
  if (!trimmed) {
    console.error('Nombre inválido')
    process.exit(1)
  }
  const src = path.resolve('views', 'templates', 'default')
  const dest = path.resolve('views', 'templates', trimmed)
  try {
    await fs.cp(src, dest, { recursive: true })
    console.log(`Plantilla creada en ${dest}`)
  } catch (e) {
    console.error('Error al copiar plantilla:', e.message)
    process.exit(1)
  }
})