import { Router } from 'express'
import templatesRouter from './templates.js'
const router = Router()

function authed(req,res,next){ if(req.session.uid) return next(); res.redirect('/auth/login') }

function ensureAdmin(req,res,next){
  if(req.session.email === 'david_010@live.com.mx') return next()
  res.status(403).send('Acceso restringido')
}

// Sub-ruta para gestionar plantillas

router.use('/templates', authed, ensureAdmin, templatesRouter)

router.get('/', authed, async (req,res)=>{
  if (req.session.is_admin) return res.redirect('/admin'); // admins al dashboard de admin

  const [invitations] = await req.db.query(
    `SELECT i.*, p.name AS plan_name, p.code AS plan_code, p.price_mxn AS plan_price_mxn
     FROM invitations i
     JOIN orders o ON o.id=i.order_id
     JOIN plans p ON p.id=o.plan_id
     WHERE i.user_id=? AND i.status='active' ORDER BY i.created_at DESC`,
    [req.session.uid]
  )

  if (invitations.length) {
    return res.render('panel/index', { invitations })
  }

  const [[{ total }]] = await req.db.query(
    'SELECT COUNT(*) AS total FROM invitations WHERE user_id=?',
    [req.session.uid]
  )

  const msg = total ? 'Aún no tienes invitaciones activas.' : 'Compra un plan para continuar.'
  res.render('panel/locked', { msg })
})

router.get('/wizard/:id?', authed, async (req,res)=>{
   let inv
  if (req.params.id) {
    ;[[inv]] = await req.db.query(
      'SELECT * FROM invitations WHERE id=? AND user_id=?',
      [req.params.id, req.session.uid]
    )
  } else {
    ;[[inv]] = await req.db.query(
      'SELECT * FROM invitations WHERE user_id=? AND status="active" ORDER BY created_at DESC LIMIT 1',
      [req.session.uid]
    )
  }
  if (!inv) return res.redirect('/panel')
  const [[plan]] = await req.db.query(
    'SELECT p.* FROM orders o JOIN plans p ON p.id=o.plan_id WHERE o.id=? AND o.user_id=?',
    [inv.order_id, req.session.uid]
  )
  const tier = plan?.template_scope || 'general'
  const [templates] = await req.db.query(
    tier === 'general'
      ? 'SELECT * FROM templates WHERE tier IN ("general") ORDER BY category,id'
      : tier === 'all'
      ? 'SELECT * FROM templates WHERE tier IN ("general","all") ORDER BY category,id'
      : 'SELECT * FROM templates ORDER BY category,id'
  )
  const cats = [...new Set(templates.map(t=>t.category))]
const theme = (()=>{ try { return JSON.parse(inv?.theme_json||'{}') } catch { return {} } })()
  res.render('panel/wizard', { templates, cats, inv, plan, theme })
})




router.post('/wizard/sections', authed, async (req,res)=>{
  const { invitation_id, order } = req.body  // order: "hero,detalles,galeria,ubicacion,rsvp,footer"
  const arr = Array.isArray(order) ? order : String(order||'').split(',').map(s=>s.trim()).filter(Boolean)
  if (!arr.length) return res.status(400).send('Orden inválido')
  await req.db.query('UPDATE invitations SET section_order=? WHERE id=? AND user_id=?', [JSON.stringify(arr), invitation_id, req.session.uid])
  res.redirect('/panel/wizard')
})


router.post('/wizard/template', authed, async (req,res)=>{
  const { invitation_id, template_key } = req.body
  await req.db.query('UPDATE invitations SET template_key=? WHERE id=? AND user_id=?', [template_key, invitation_id, req.session.uid])
  res.redirect('/panel/wizard')
})

router.post('/wizard/date', authed, async (req,res)=>{
  const { invitation_id, date_iso } = req.body
  const [[inv]] = await req.db.query('SELECT date_locked FROM invitations WHERE id=? AND user_id=?', [invitation_id, req.session.uid])
  if(!inv) return res.status(404).send('Invitación no encontrada')
  if(inv.date_locked) return res.status(400).send('La fecha ya está bloqueada y no puede cambiarse')
  await req.db.query('UPDATE invitations SET date_iso=?, date_locked=1, slug_locked=1 WHERE id=? AND user_id=?', [date_iso, invitation_id, req.session.uid])
  res.redirect('/panel')
})

router.post('/wizard/slug', authed, async (req,res)=>{
  const { invitation_id, slug } = req.body
  const [[inv]] = await req.db.query('SELECT slug_locked FROM invitations WHERE id=? AND user_id=?', [invitation_id, req.session.uid])
  if(!inv) return res.status(404).send('Invitación no encontrada')
  if(inv.slug_locked) return res.status(400).send('El slug/URL ya está bloqueado')
  try {
    await req.db.query('UPDATE invitations SET slug=? WHERE id=? AND user_id=?', [slug, invitation_id, req.session.uid])
    res.redirect('/panel/wizard')
  } catch (e){
    if(e.code==='ER_DUP_ENTRY') return res.status(400).send('Ese slug ya existe')
    throw e
  }
})

router.post('/wizard/theme', authed, async (req,res)=>{
  const { invitation_id, theme_json } = req.body
  let incoming = {}
  try { incoming = JSON.parse(theme_json) } catch {}
  const [[inv]] = await req.db.query('SELECT theme_json FROM invitations WHERE id=? AND user_id=?', [invitation_id, req.session.uid])
  const current = (()=>{ try { return JSON.parse(inv.theme_json||'{}') } catch { return {} } })()
  const merged = {
    ...current,
    ...incoming,
    colors: {...(current.colors||{}), ...(incoming.colors||{})},
    fonts:  {...(current.fonts||{}),  ...(incoming.fonts||{})},
    media:  {...(current.media||{}),  ...(incoming.media||{})},
     copy:   {...(current.copy||{}),   ...(incoming.copy||{})},
    animations: {...(current.animations||{}), ...(incoming.animations||{})}
  }
  await req.db.query('UPDATE invitations SET theme_json=? WHERE id=? AND user_id=?', [JSON.stringify(merged), invitation_id, req.session.uid])
  res.redirect('/panel')
})


router.post('/publish', authed, async (req,res)=>{
  const { invitation_id } = req.body
  await req.db.query('UPDATE invitations SET status="active", published_at=NOW() WHERE id=? AND user_id=?', [invitation_id, req.session.uid])
  res.redirect('/panel')
})

router.get('/preview/:id', authed, async (req,res)=>{
  const [[inv]] = await req.db.query('SELECT * FROM invitations WHERE id=? AND user_id=?', [req.params.id, req.session.uid])
  if(!inv) return res.status(404).send('Invitación no encontrada')
  const theme = JSON.parse(inv.theme_json)
  const view = inv.template_key === 'elegant' ? 'templates/elegant' : 'templates/default'
  res.render(view, { data: inv, theme, hideNav: true })
})

export default router