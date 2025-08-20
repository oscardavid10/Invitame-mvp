// routes/checkout.js
import 'dotenv/config'
import { Router } from 'express'
import Stripe from 'stripe'

const router = Router()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Inicia checkout usando lo guardado en req.session.pref (wizard)
router.get('/start', async (req, res) => {
  try {
    if (!req.session.uid) return res.redirect('/auth/login?next=/checkout/start')

    const pref = req.session.pref
    const planCode = pref.plan_code || req.query.plan 
    if (!planCode) return res.redirect('/planes')

    const [[p]] = await req.db.query('SELECT * FROM plans WHERE code=? LIMIT 1', [planCode])
    if (!p) return res.redirect('/planes')

    // Asegura que tenemos un price válido
    let priceId = p.stripe_price_id
    if (priceId?.startsWith('prod_')) {
      const price = await stripe.prices.create({
        currency: 'mxn',
        unit_amount: p.price_mxn * 100,
        product: priceId
      })
      priceId = price.id
      await req.db.query('UPDATE plans SET stripe_price_id=? WHERE id=?', [priceId, p.id])
    }
    if (!priceId?.startsWith('price_')) return res.status(400).send('Plan sin price válido')

    // Crea orden
    const [o] = await req.db.query('INSERT INTO orders (user_id, plan_id) VALUES (?,?)', [req.session.uid, p.id])

    // Crea sesión de Stripe
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: String(o.insertId),
      metadata: {
        user_id: String(req.session.uid),
        plan_code: p.code,
        template_key: pref.template_key || 'default',
        title: pref.title || 'Mi Evento',
        date_iso: pref.date_iso || new Date().toISOString(),
        venue: pref.venue || 'Por definir',
        address: pref.address || 'Por definir',
        show_map: String(!!pref.show_map),
        dress_code: pref.dress_code || '',
        message: pref.message || '',
        palette: pref.palette || '{}',
        registry: pref.registry || '',
        music_url: pref.music_url || '',
        music_autoplay: String(!!pref.music_autoplay)
      },
      success_url: `${process.env.BASE_URL}/site/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/site/crear?plan=${p.code}`
    })

    await req.db.query('UPDATE orders SET stripe_session_id=? WHERE id=?', [session.id, o.insertId])
    res.redirect(session.url)
  } catch (e) {
    console.error('checkout/start error:', e)
    res.status(500).send('Error iniciando pago')
  }
})

// (Opcional) checkout por id de orden ya creada
router.get('/:orderId', async (req, res) => {
  try {
    if (!req.session.uid) return res.redirect('/auth/login')
    const orderId = req.params.orderId

    const [[order]] = await req.db.query(
      'SELECT o.*, p.code, p.name, p.price_mxn, p.stripe_price_id, p.id AS plan_id FROM orders o JOIN plans p ON o.plan_id=p.id WHERE o.id=? AND o.user_id=?',
      [orderId, req.session.uid]
    )
    if (!order) return res.status(404).send('Orden no encontrada')

    let priceId = order.stripe_price_id
    if (priceId?.startsWith('prod_')) {
      const price = await stripe.prices.create({
        currency: 'mxn',
        unit_amount: order.price_mxn * 100,
        product: priceId
      })
      priceId = price.id
      await req.db.query('UPDATE plans SET stripe_price_id=? WHERE id=?', [priceId, order.plan_id])
    }
    if (!priceId?.startsWith('price_')) return res.status(400).send('Plan sin price válido')

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: String(order.id),
      metadata: { user_id: String(req.session.uid), plan_code: order.code },
      success_url: `${process.env.BASE_URL}/site/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/planes`
    })

    await req.db.query('UPDATE orders SET stripe_session_id=? WHERE id=?', [session.id, order.id])
    res.redirect(session.url)
  } catch (e) {
    console.error('checkout/:orderId error:', e)
    res.status(500).send('Error iniciando pago')
  }
})

export default router
