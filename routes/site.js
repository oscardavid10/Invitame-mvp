import 'dotenv/config'
import { Router } from 'express'
import Stripe from 'stripe'
import { pool } from '../utils/db.js'

const router = Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// --------- Helpers ----------
function toISO(date, time) {
  if (!date) return new Date().toISOString()
  const hhmm = time ? `${time}:00` : '00:00:00'
  return new Date(`${date}T${hhmm}`).toISOString()
}

function buildSteps(plan) {
  const canRegistry = !!plan.allow_registry;
  const canMusic    = !!plan.allow_music;

  return [
    { key:'title',   label:'Título' },
    { key:'date',    label:'Fecha' },
    { key:'time',    label:'Hora' },
    { key:'address', label:'Domicilio' },
    { key:'dress',   label:'Vestimenta' },
    { key:'message', label:'Mensaje' },
    ...(canRegistry ? [{ key:'registry', label:'Mesa de regalos' }] : []),
    ...(canMusic    ? [{ key:'music',    label:'Música' }] : []),
    { key:'template',label:'Plantilla' },
    { key:'preview', label:'Preview / Publicar' },
  ];
}


function buildThemeFrom(tplRow, paletteStr, message) {
  const base = tplRow?.demo_theme_json
    ? JSON.parse(tplRow.demo_theme_json)
    : {
        colors:{bg:'#0e0e1a',text:'#f5f4f7',accent:'#4c3b33',muted:'#b5b1aa',ring:'#cdcbc9'},
        media:{video:'/public/video/sample.mp4',poster:'/public/img/placeholder.jpg',bg:null,gallery:[]},
        copy:{intro:'Reserva la fecha y acompáñanos.'},
        hero:{mode:'video', overlay:'rgba(0,0,0,.45)'},
        layout:{}
      }
  let pal = {}
  try { pal = JSON.parse(paletteStr || '{}') } catch {}

  const out = {
    ...base,
    colors:{...base.colors, ...pal},
    copy:{...base.copy, ...(message ? { intro: message } : {})},
    hero:{...{mode:'video',overlay:'rgba(0,0,0,.45)'}, ...(base.hero||{})},
    layout:{...{}, ...(base.layout||{})}
  }
  return out
}

function dataFromPref(pref, theme) {
  const fallbackOrder = ["hero","detalles","mensaje","galeria","ubicacion","rsvp","footer"]
  const order = (theme?.layout?.section_order && Array.isArray(theme.layout.section_order))
    ? theme.layout.section_order : fallbackOrder

  return {
    template_key: pref.template_key || 'default',
    title:        pref.title || 'Mi Evento',
    date_iso:     pref.date ? toISO(pref.date, pref.time) : (pref.date_iso || new Date().toISOString()),
    venue:        pref.venue || 'Por definir',
    address:      pref.address || 'Por definir',
    section_order: JSON.stringify(order)
  }
}

// ----------------------------

// DB y session locals
router.use((req, res, next) => {
  if (!req.db) req.db = pool
  req.session.pref ||= {}
  res.locals.pref = req.session.pref   // para que las vistas siempre tengan pref
  next()
})

function authed(req, res, next) {
  if (req.session.uid) return next()
  const nextUrl = encodeURIComponent(req.originalUrl)
  res.redirect('/auth/login?next=' + nextUrl)
}

router.use('/site/crear', authed)


// Home (si la usas)
router.get('/', (req, res) => {
  res.render('site/home', { theme: {}, tpl: 'default' })
})

// Planes (landing de precios)
router.get('/planes', async (req, res) => {
  const [plans] = await req.db.query('SELECT * FROM plans WHERE active = 1 ORDER BY price_mxn')
  res.render('site/pricing', { plans, theme: {}, tpl: 'default' })
})

// ========== WIZARD ==========

// GET /site/crear  (paso inicial; usa ?plan=basic|pro|premium)
router.get('/site/crear', async (req, res) => {
  const planCode = req.query.plan || req.session.pref.plan_code || 'basic'
  const [[plan]] = await req.db.query('SELECT * FROM plans WHERE code=? LIMIT 1', [planCode])
  if (!plan) return res.redirect('/planes')

  // guarda plan en sesión para el flujo
  req.session.pref.plan_code = plan.code

const [templates] = await req.db.query(
  'SELECT key_name, name, category, preview_img FROM templates ORDER BY sort_order, id'
);
  const templatesAllowed = templates // (si filtras por plan, hazlo aquí)
  if (!req.session.pref.template_key) {
    req.session.pref.template_key = templatesAllowed[0]?.key_name || 'default'
  }
  const cats = [...new Set(templatesAllowed.map(t => t.category))]


  const steps = buildSteps(plan);

  res.render('site/crear', {
    plan,
    templates: templatesAllowed,
    cats,
    step: 1,
    steps,
    title: 'Crear invitación'
  })
})

// GET /site/crear/step/:n  (navegación del wizard)
router.get('/site/crear/step/:n', async (req, res) => {
const planCode = req.query.plan || req.session.pref.plan_code || 'basic';
const [[plan]] = await req.db.query('SELECT * FROM plans WHERE code=? LIMIT 1', [planCode]);
if (!plan) return res.redirect('/planes');
req.session.pref.plan_code = plan.code; // guarda el plan en sesión

const steps = buildSteps(plan) // <- tu helper dinámico
const n = Number(req.params.n) || 1
const step = Math.max(1, Math.min(steps.length, n)) // <- NADA de “8” fijo

// carga templates...
res.render('site/crear', { plan, templates: templatesAllowed, cats, step, steps, title: 'Crear invitación' })

});


// POST /site/crear/save  (guardar estado del wizard en sesión)
router.post('/site/crear/save', (req, res) => {
  const P = req.session.pref
  // guarda campos (usa date/time y también computa date_iso)
  P.plan_code    = req.body.plan_code || P.plan_code
  P.title        = (req.body.title ?? P.title) || P.title
  P.festejado    = req.body.festejado ?? P.festejado
  P.date         = req.body.date ?? P.date
  P.time         = req.body.time ?? P.time
  P.date_iso     = toISO(P.date, P.time)

  P.venue             = req.body.venue ?? P.venue;                 // recepción
  P.address           = req.body.address ?? P.address;
  P.show_map          = (typeof req.body.show_map !== 'undefined') ? 'on' : (P.show_map || '');

  P.ceremony_venue    = req.body.ceremony_venue ?? P.ceremony_venue;
  P.ceremony_address  = req.body.ceremony_address ?? P.ceremony_address;
  P.show_ceremony_map = (typeof req.body.show_ceremony_map !== 'undefined') ? 'on' : (P.show_ceremony_map || '');

  P.dress_code   = req.body.dress_code ?? P.dress_code
  P.message      = req.body.message ?? P.message
  P.template_key = req.body.template_key ?? P.template_key
  P.palette      = req.body.palette ?? P.palette

  P.registry       = req.body.registry ?? P.registry;            // links o texto
  P.music_url      = req.body.music_url ?? P.music_url;          // URL mp3/stream
  P.music_autoplay = (typeof req.body.music_autoplay !== 'undefined')
                    ? 'on' : (P.music_autoplay || '');          // checkbox

  req.session.save(() => {
    if (req.body.goPreview) return res.redirect('/site/crear/preview')
    const next = Number(req.body.next || 2)
    res.redirect('/site/crear/step/' + next)
  })
})


router.post('/site/crear/preview', async (req, res) => {
  res.set('Cache-Control', 'no-store');

  // Persistir body en sesión
  Object.assign(req.session.pref, req.body || {});
  const pref = req.session.pref;

  // Carga template y plan
  const [[tpl]]  = await req.db.query('SELECT * FROM templates WHERE key_name=? LIMIT 1', [pref.template_key || 'default']);
  const [[plan]] = await req.db.query('SELECT * FROM plans WHERE code=? LIMIT 1', [pref.plan_code || 'basic']);

  // Base theme del template
  const base = tpl?.demo_theme_json
    ? JSON.parse(tpl.demo_theme_json)
    : {
        colors:{bg:'#0e0e1a',text:'#f5f4f7',accent:'#4c3b33',muted:'#b5b1aa',ring:'#cdcbc9'},
        media:{video:'/public/video/sample.mp4',poster:'/public/img/placeholder.jpg',bg:null,gallery:[]},
        copy:{intro:'Reserva la fecha y acompáñanos.'},
        hero:{mode:'video', overlay:'rgba(0,0,0,.45)'},
        fonts:{}
      };

  // Mezcla palette + mensaje
  let pal = {};
  try { pal = JSON.parse(pref.palette || '{}') } catch {}
  const theme = {
    ...base,
    colors: { ...base.colors, ...pal },
    copy:   { ...base.copy,  intro: pref.message || base.copy.intro },
    meta:   {
      ...(base.meta || {}),
      registry:       pref.registry || '',
      music_url:      pref.music_url || '',
      music_autoplay: !!pref.music_autoplay
    }
  };

  // Construye order
  const order = ["hero","detalles","mensaje","galeria","ubicacion"];
  if (plan?.allow_registry && (pref.registry || '').trim()) order.push("registry");
  if (plan?.allow_music    && (pref.music_url || '').trim()) order.push("music");
  order.push("rsvp","footer");   // ← RSVP va al final, luego de registry/music

const data = {
  template_key: pref.template_key || 'default',
  title:        pref.title || 'Mi Evento',
  date_iso:     pref.date ? (new Date(`${pref.date}T${pref.time || '00:00'}:00`).toISOString()) : (pref.date_iso || new Date().toISOString()),
  // recepción (compatibilidad con tu UI anterior)
  venue:           pref.venue || 'Por definir',
  address:         pref.address || 'Por definir',
  ceremony_venue:  pref.ceremony_venue || '',
  ceremony_address:pref.ceremony_address || '',
  show_map:        pref.show_map === 'on',
  show_ceremony_map: pref.show_ceremony_map === 'on',
  section_order: JSON.stringify(order)
};


  // Selección de vista por key_name
  const known = new Set(['default','elegant','fairytale']);
  const view  = known.has(data.template_key) ? `templates/${data.template_key}` : 'templates/default';

  return res.render('public', { data, theme, view, tpl: data.template_key, title: 'Preview' });
});



// POST /site/crear/continuar  (guardar selección y seguir a checkout)
router.post('/site/crear/continuar', async (req, res) => {
  // persiste lo más importante para metadata de Stripe
  Object.assign(req.session.pref, {
    plan_code:   req.session.pref.plan_code,
    template_key:req.body.template_key?? req.session.pref.template_key,
    title:       req.body.title       ?? req.session.pref.title,
    festejado:   req.body.festejado   ?? req.session.pref.festejado,
    date:        req.body.date        ?? req.session.pref.date,
    time:        req.body.time        ?? req.session.pref.time,
    date_iso:    toISO(req.body.date ?? req.session.pref.date, req.body.time ?? req.session.pref.time),
    venue:       req.body.venue       ?? req.session.pref.venue,
    address:     req.body.address     ?? req.session.pref.address,
    show_map:   (typeof req.body.show_map !== 'undefined') ? !!req.body.show_map : !!req.session.pref.show_map,
    dress_code:  req.body.dress_code  ?? req.session.pref.dress_code,
    message:     req.body.message     ?? req.session.pref.message,
    palette:     req.body.palette     ?? req.session.pref.palette
  })

  return res.redirect('/checkout/start')
})

// Éxito post-Stripe (crea invitación si aún no existe)
router.get('/site/success', async (req, res) => {
  const { session_id } = req.query
  if (session_id) {
    try {
      const s = await stripe.checkout.sessions.retrieve(session_id)
      if (s.payment_status === 'paid') {
        const orderId = Number(s.client_reference_id)
        const [[ord]] = await req.db.query('SELECT status, user_id FROM orders WHERE id=?', [orderId])
        if (ord && ord.status !== 'paid') {
          await req.db.query('UPDATE orders SET status="paid", paid_at=NOW() WHERE id=?', [orderId])
        }
        const [[exists]] = await req.db.query('SELECT id FROM invitations WHERE order_id=?', [orderId])
        if (!exists) {
          const template_key = s.metadata?.template_key || 'default'
          const title        = s.metadata?.title || 'Mi Evento'
          const date_iso     = s.metadata?.date_iso || new Date().toISOString()
          const venue        = s.metadata?.venue || 'Por definir'
          const address      = s.metadata?.address || 'Por definir'
          const palette      = s.metadata?.palette || '{}'

          const [[tpl]] = await req.db.query('SELECT * FROM templates WHERE key_name=? LIMIT 1', [template_key])
          const base    = buildThemeFrom(tpl, palette, null)
          const themeJson = JSON.stringify(base)

          await req.db.query(
            'INSERT INTO invitations (user_id, order_id, template_key, slug, title, date_iso, venue, address, theme_json) VALUES (?,?,?,?,?,?,?,?,?)',
            [ord.user_id, orderId, template_key, `evento-${ord.user_id}-${orderId}`, title, date_iso, venue, address, themeJson]
          )
        }
      }
    } catch (e) { console.error('success verify err:', e.message) }
  }
  res.render('site/success', { title: 'Pago recibido' })
})

export default router
