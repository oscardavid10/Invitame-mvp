// routes/webhooks.js
import 'dotenv/config'
import express, { Router } from 'express'
import Stripe from 'stripe'

const router = Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// util: base theme por defecto
function baseTheme() {
  return {
    colors:{ bg:'#0e0e1a', text:'#f5f4f7', accent:'#4c3b33', muted:'#b5b1aa', ring:'#cdcbc9' },
    media:{ video:'/public/video/sample.mp4', poster:'/public/img/placeholder.jpg', gallery:[] },
    copy:{ intro:'Reserva la fecha y acompáñanos.' },
    meta:{}
  }
}

// ⚠️ este endpoint debe montarse antes de cualquier body-parser global
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']
  let event
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature verification failed.', err.message)
    return res.sendStatus(400)
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object
    const orderId = Number(s.client_reference_id)

    try {
      // marca pagado
      await req.db.query('UPDATE orders SET status="paid", paid_at=NOW() WHERE id=?', [orderId])

      // datos de la orden/usuario
      const [[order]] = await req.db.query(
           'SELECT o.*, u.email, p.code, p.allow_registry, p.allow_music FROM orders o JOIN users u ON u.id=o.user_id JOIN plans p ON p.id=o.plan_id WHERE o.id=?',
        [orderId]
      )

      // evita duplicados
      const [[exists]] = await req.db.query('SELECT id FROM invitations WHERE order_id=?', [orderId])
      if (!exists) {
        // metadata del checkout (del wizard)
        const template_key = s.metadata?.template_key || 'default'
        const title = s.metadata?.title || 'Mi Evento'
        const date_iso = s.metadata?.date_iso || new Date().toISOString()
        const venue = s.metadata?.venue || 'Por definir'
        const address = s.metadata?.address || 'Por definir'
        const palette = s.metadata?.palette || '{}'
        const show_map = s.metadata?.show_map === 'true'
        const dress_code = s.metadata?.dress_code || ''
        const message = s.metadata?.message || ''
                const registry = s.metadata?.registry || ''
        const music_url = s.metadata?.music_url || ''
        const music_autoplay = s.metadata?.music_autoplay === 'true'

        // plantilla de BD
        const [[tpl]] = await req.db.query('SELECT * FROM templates WHERE key_name=? LIMIT 1', [template_key])

        // arma theme final
        const base = tpl?.demo_theme_json ? JSON.parse(tpl.demo_theme_json) : baseTheme()
        let pal = {}; try { pal = JSON.parse(palette) } catch {}
        const theme = {
          ...base,
          colors: { ...base.colors, ...pal },
          copy:   { ...base.copy, intro: message || base.copy.intro },
          meta:   { ...base.meta, show_map, dress_code, registry, music_url, music_autoplay }
        }
        const themeJson = JSON.stringify(theme)
                const secArr = ["hero","detalles","mensaje","galeria","ubicacion"]
        if (order.allow_registry && registry.trim()) secArr.push("registry")
        if (order.allow_music && music_url.trim()) secArr.push("music")
        secArr.push("rsvp","footer")
        const sectionOrder = JSON.stringify(secArr)

        // inserta invitación
        await req.db.query(
          'INSERT INTO invitations (user_id, order_id, template_key, slug, title, date_iso, venue, address, theme_json, section_order, status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [order.user_id, order.id, template_key, `evento-${order.user_id}-${order.id}`, title, date_iso, venue, address, themeJson, sectionOrder, 'active']
        )
      }
    } catch (e) {
      console.error('webhook create invitation error:', e)
    }
  }

  res.json({ received: true })
})

export default router
