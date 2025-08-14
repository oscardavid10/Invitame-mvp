import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

const upload = multer({ dest: 'uploads/' })
const router = Router()

// Auth mínima por sesión y .env
function ensureAuth(req, res, next){
  if (req.session?.authed) return next()
  res.redirect('/admin/login')
}

router.get('/login', (req,res)=>{
  res.send(`
    <link rel="stylesheet" href="https://cdn.tailwindcss.com/3.4.0">
    <div class="min-h-screen grid place-items-center bg-slate-950 text-slate-100">
      <form method="post" action="/admin/login" class="bg-white/5 p-8 rounded-2xl w-full max-w-sm">
        <h1 class="text-xl font-semibold mb-4">Acceso</h1>
        <input class="w-full mb-3 px-3 py-2 rounded bg-black/30" name="email" placeholder="Email" />
        <input class="w-full mb-4 px-3 py-2 rounded bg-black/30" type="password" name="password" placeholder="Password" />
        <button class="w-full px-4 py-2 rounded bg-emerald-600">Entrar</button>
      </form>
    </div>`)
})

router.post('/login', (req,res)=>{
  const ok = req.body.email === process.env.ADMIN_EMAIL && req.body.password === process.env.ADMIN_PASSWORD
  if (ok){ req.session.authed = true; return res.redirect('/admin') }
  res.status(401).send('Credenciales inválidas')
})

router.get('/', ensureAuth, (req,res)=>{
  req.db.all('SELECT id, slug, title, date_iso, template FROM invitations ORDER BY created_at DESC', [], (e, rows)=>{
    if (e) return res.status(500).send(e.message)
    const list = rows.map(r=>`<tr><td class="px-3 py-2">${r.title}</td><td>${r.slug}</td><td>${r.template}</td><td>${r.date_iso}</td><td><a class="text-emerald-400" href="/${r.slug}" target="_blank">ver</a></td></tr>`).join('')
    res.send(`
    <link rel="stylesheet" href="https://cdn.tailwindcss.com/3.4.0">
    <div class="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div class="max-w-4xl mx-auto">
        <div class="flex items-center justify-between mb-4">
          <h1 class="text-2xl font-semibold">Invitaciones</h1>
          <a href="/admin/new" class="px-4 py-2 rounded bg-emerald-600">Nueva invitación</a>
        </div>
        <table class="w-full text-sm">
          <thead><tr class="text-slate-400"><th class="text-left px-3 py-2">Título</th><th>Slug</th><th>Plantilla</th><th>Fecha</th><th></th></tr></thead>
          <tbody>${list}</tbody>
        </table>
      </div>
    </div>`)
  })
})

router.get('/new', ensureAuth, (req,res)=>{
  res.send(`
  <link rel="stylesheet" href="https://cdn.tailwindcss.com/3.4.0">
  <div class="min-h-screen bg-slate-950 text-slate-100 p-6 grid place-items-center">
    <form method="post" action="/admin/new" class="bg-white/5 p-6 rounded-2xl w-full max-w-2xl grid gap-3">
      <h2 class="text-xl font-semibold mb-2">Crear invitación</h2>
      <input name="title" class="px-3 py-2 rounded bg-black/30" placeholder="Título" required>
      <input name="slug" class="px-3 py-2 rounded bg-black/30" placeholder="slug-ejemplo" required>
      <input name="date_iso" class="px-3 py-2 rounded bg-black/30" placeholder="2026-01-15T18:00:00-06:00" required>
      <input name="venue" class="px-3 py-2 rounded bg-black/30" placeholder="Lugar" required>
      <input name="address" class="px-3 py-2 rounded bg-black/30" placeholder="Dirección" required>
      <input name="dresscode" class="px-3 py-2 rounded bg-black/30" placeholder="Dresscode" value="Elegante">
      <select name="template" class="px-3 py-2 rounded bg-black/30">
        <option value="default">Default</option>
        <option value="elegant">Elegant</option>
      </select>
      <textarea name="theme_json" class="px-3 py-2 rounded bg-black/30" rows="8" placeholder='{"colors":{"bg":"#0e0e1a","text":"#f5f4f7","accent":"#4c3b33","muted":"#b5b1aa","ring":"#cdcbc9"},"media":{"video":"/public/video/sample.mp4","poster":"/public/img/placeholder.jpg","gallery":["/public/img/placeholder.jpg"]},"copy":{"intro":"Texto intro"}}' required></textarea>
      <input name="whatsapp_phone" class="px-3 py-2 rounded bg-black/30" placeholder="+52XXXXXXXXXX">
      <button class="px-4 py-2 rounded bg-emerald-600">Guardar</button>
    </form>
  </div>`)
})

router.post('/new', ensureAuth, (req,res)=>{
  const { slug, title, date_iso, venue, address, dresscode, template, theme_json, whatsapp_phone } = req.body
  req.db.run(
    `INSERT INTO invitations (slug, title, date_iso, venue, address, dresscode, template, theme_json, whatsapp_phone)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [slug, title, date_iso, venue, address, dresscode, template, theme_json, whatsapp_phone],
    function (e){
      if (e) return res.status(500).send(e.message)
      res.redirect('/admin')
    }
  )
})

export default router