import { Router } from 'express'
const router = Router()

// List templates
router.get('/', async (req, res) => {
  const [templates] = await req.db.query('SELECT * FROM templates ORDER BY id')
  res.render('panel/templates', { templates })
})

// Create template
router.post('/', async (req, res) => {
  const { key_name, name, preview_img, demo_theme_json } = req.body
  await req.db.query(
    'INSERT INTO templates (key_name, name, preview_img, demo_theme_json) VALUES (?,?,?,?)',
    [key_name, name, preview_img, demo_theme_json]
  )
  res.redirect('/panel/templates')
})

// Update template
router.post('/:id', async (req, res) => {
  const { name, preview_img, demo_theme_json } = req.body
  await req.db.query(
    'UPDATE templates SET name=?, preview_img=?, demo_theme_json=? WHERE id=?',
    [name, preview_img, demo_theme_json, req.params.id]
  )
  res.redirect('/panel/templates')
})

// Delete template
router.post('/:id/delete', async (req, res) => {
  await req.db.query('DELETE FROM templates WHERE id=?', [req.params.id])
  res.redirect('/panel/templates')
})

export default router