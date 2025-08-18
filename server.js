import 'dotenv/config'
import express from 'express'
import session from 'express-session'
import path from 'path'
import { fileURLToPath } from 'url'
import expressLayouts from 'express-ejs-layouts'
import Stripe from 'stripe'
import cron from 'node-cron'
import MySQLStoreFactory from 'express-mysql-session'
import { pool } from './utils/db.js'
// import webhooks from './routes/webhooks.js'  // ❌ quítalo si usas el inline

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3008

app.set('trust proxy', 1)
app.disable('x-powered-by')

// EJS + layout
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'))
app.use(expressLayouts)
app.set('layout', '_layout')

// Sesión (única)
const MySQLStore = MySQLStoreFactory(session)
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  createDatabaseTable: true
})
app.use(session({
  name: 'ivsid',
  secret: process.env.SESSION_SECRET || 'dev',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000*60*60*24*7 }
}))

// Webhook Stripe (inline) — va ANTES del json()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
app.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
    if (event.type === 'checkout.session.completed') {
      const s = event.data.object
      const orderId = Number(s.client_reference_id)

      await pool.query('UPDATE orders SET status="paid", paid_at=NOW() WHERE id=?', [orderId])
      const [[order]] = await pool.query(
        'SELECT o.*, u.email, p.code FROM orders o JOIN users u ON u.id=o.user_id JOIN plans p ON p.id=o.plan_id WHERE o.id=?',
        [orderId]
      )
      const [[exists]] = await pool.query('SELECT id FROM invitations WHERE order_id=?', [orderId])
      if (!exists) {
        const template_key = s.metadata?.template_key || 'default'
        const title = s.metadata?.title || 'Mi Evento'
        const date_iso = s.metadata?.date_iso || new Date().toISOString()
        const venue = s.metadata?.venue || 'Por definir'
        const address = s.metadata?.address || 'Por definir'
        const palette = s.metadata?.palette || '{}'

        const [[tpl]] = await pool.query('SELECT * FROM templates WHERE key_name=? LIMIT 1', [template_key])
        const base = tpl?.demo_theme_json ? JSON.parse(tpl.demo_theme_json) : {
          colors:{bg:'#0e0e1a',text:'#f5f4f7',accent:'#4c3b33',muted:'#b5b1aa',ring:'#cdcbc9'},
          media:{video:'/public/video/sample.mp4',poster:'/public/img/placeholder.jpg',gallery:[]},
          copy:{intro:'Reserva la fecha y acompáñanos.'},
          meta:{}
        }
        let pal = {}; try { pal = JSON.parse(palette) } catch {}
        const themeJson = JSON.stringify({ ...base, colors:{...base.colors, ...pal} })

        await pool.query(
          'INSERT INTO invitations (user_id, order_id, template_key, slug, title, date_iso, venue, address, theme_json) VALUES (?,?,?,?,?,?,?,?,?)',
          [order.user_id, order.id, template_key, `evento-${order.user_id}-${order.id}`, title, date_iso, venue, address, themeJson]
        )
      }
    }
    res.json({ received: true })
  } catch (err) {
    console.error('Webhook verification failed:', err.message)
    res.sendStatus(400)
  }
})

// ❌ si dejas el inline, NO montes el router duplicado
// app.use('/webhooks', webhooks)

// Parsers + estáticos
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use('/public', express.static(path.join(__dirname, 'public')))

// inyecta DB
// Inyecta DB + usuario en locals (después de session y antes de rutas)
app.use(async (req, res, next) => {
  // DB en la request
  req.db = pool;

  // Fallbacks para layout
  res.locals.theme   = res.locals.theme || {};
  res.locals.tpl     = res.locals.tpl   || 'default';
  res.locals.hideNav = false;

  // Usuario visible en las vistas
  res.locals.user  = null;
  res.locals.uid   = null;
  res.locals.email = null;

  try {
    if (req.session?.uid) {
      const [[u]] = await pool.query(
        'SELECT id, email, name, is_admin FROM users WHERE id=? LIMIT 1',
        [req.session.uid]
      );

      if (u) {
        res.locals.user       = u;            // { id, email, name, is_admin }
        res.locals.uid        = u.id;
        res.locals.email      = u.email;
        req.session.is_admin  = !!u.is_admin; // flag en sesión para /admin
      } else {
        // Sesión huérfana: limpia
        delete req.session.uid;
        delete req.session.is_admin;
      }
    } else {
      // No hay sesión: asegúrate de limpiar admin
      delete req.session?.is_admin;
    }
  } catch (e) {
    console.error('locals user err:', e.message);
    // no bloquees la petición si falla; seguimos sin user
  }

  next();
});



// Rutas
import site from './routes/site.js'
import auth from './routes/auth.js'
import panel from './routes/panel.js'
import checkout from './routes/checkout.js'
import admin from './routes/admin.js'
app.use('/', site)
app.use('/auth', auth)
app.use('/panel', panel)
app.use('/checkout', checkout)
app.use('/admin', admin)

// Pública por slug con fallbacks sólidos
// /u/:slug
app.get('/u/:slug', async (req,res) => {
  const [rows] = await req.db.query('SELECT * FROM invitations WHERE slug=?', [req.params.slug])
  if(!rows.length) return res.status(404).send('No encontrada')

  const data = rows[0]
  const base = {
    colors:{bg:'#0e0e1a',text:'#f5f4f7',accent:'#4c3b33',muted:'#b5b1aa',ring:'#cdcbc9'},
    media:{video:'/public/video/sample.mp4',poster:'/public/img/placeholder.jpg',gallery:[]},
    copy:{intro:'Reserva la fecha y acompáñanos.'},
    hero:{mode:'video', overlay:'rgba(0,0,0,.45)'},
    layout:{}
  }
  let theme = {}
  try { theme = JSON.parse(data.theme_json || '{}') } catch {}
  const merged = {
    ...base,
    ...theme,
    colors:{...base.colors, ...(theme.colors||{})},
    media:{...base.media,  ...(theme.media||{})},
    copy:{...base.copy,    ...(theme.copy||{})},
    hero:{...base.hero,    ...(theme.hero||{})},
    layout:{...base.layout, ...(theme.layout||{})}
  }

  // Si la plantilla define orden de secciones, úsalo
  if (merged.layout && Array.isArray(merged.layout.section_order)) {
    data.section_order = JSON.stringify(merged.layout.section_order)
  }

  const view = 'templates/default'
  res.render('public', { data, theme: merged, view, tpl: data.template_key })
})


// Cron de auto-archivo (03:15 diario)
cron.schedule('15 3 * * *', async ()=>{
  try {
    const [rows] = await pool.query(
      'SELECT id, date_iso, auto_archive_days FROM invitations WHERE status="active" AND date_iso IS NOT NULL'
    )
    const now = Date.now()
    const toArchive = rows
      .filter(r => {
        const d = new Date(r.date_iso).getTime()
        return isFinite(d) && now > d + (r.auto_archive_days||30)*86400000
      })
      .map(r => r.id)
    if (toArchive.length){
      await pool.query(
        `UPDATE invitations SET status="archived", archived_at=NOW() WHERE id IN (${toArchive.map(()=>'?').join(',')})`,
        toArchive
      )
      console.log('Archivadas:', toArchive.length)
    }
  } catch (e){ console.error('Cron archive err:', e.message) }
})

app.get('/healthz', (req,res)=>res.send('ok'))

app.listen(PORT, () => console.log(`Running on http://localhost:${PORT}`))
