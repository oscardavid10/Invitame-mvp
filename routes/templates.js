import { Router } from 'express'
const router = Router()

// List templates
router.get('/', async (req, res) => {
  const [templates] = await req.db.query('SELECT * FROM templates ORDER BY sort_order, id')
  res.render('panel/templates', { templates })
})

// Create template
router.post('/', async (req, res) => {
  const { key_name, name, preview_img, demo_theme_json, category, tier, is_active, sort_order } = req.body
  await req.db.query(
    'INSERT INTO templates (key_name, name, preview_img, demo_theme_json, category, tier, is_active, sort_order) VALUES (?,?,?,?,?,?,?,?)',
    [key_name, name, preview_img, demo_theme_json, category || 'general', tier || 'general', Number(is_active) ? 1 : 0, sort_order || 0]
  )
  res.redirect('/panel/templates')
})

// Update template
router.post('/:id', async (req, res) => {
  const { name, preview_img, demo_theme_json, category, tier, is_active, sort_order } = req.body
  await req.db.query(
    'UPDATE templates SET name=?, preview_img=?, demo_theme_json=?, category=?, tier=?, is_active=?, sort_order=? WHERE id=?',
    [name, preview_img, demo_theme_json, category, tier, Number(is_active) ? 1 : 0, sort_order, req.params.id]
  )
  res.redirect('/panel/templates')
})

// Delete template
router.post('/:id/delete', async (req, res) => {
  await req.db.query('DELETE FROM templates WHERE id=?', [req.params.id])
  res.redirect('/panel/templates')
})

export default router