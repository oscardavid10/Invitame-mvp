import { Router } from 'express'
import bcrypt from 'bcrypt'
const router = Router()

function setSessionAndGo(req, res, uid, nextUrl='/panel') {
  req.session.regenerate(err => {
    if (err) return res.status(500).send('Session error')
    req.session.uid = uid
    req.session.save(() => res.redirect(nextUrl))
  })
}

router.get('/login', (req,res)=> res.render('site/login', { next: req.query.next || '/panel' }))

router.post('/register', async (req,res)=>{
  const { email, password, next } = req.body
  try {
    const hash = await bcrypt.hash(password, 10)
    const [u] = await req.db.query('INSERT INTO users (email, password_hash) VALUES (?,?)', [email, hash])
    setSessionAndGo(req, res, u.insertId, next || '/panel')
  } catch(e){
    if (e.code === 'ER_DUP_ENTRY') return res.status(400).send('Email ya registrado')
    throw e
  }
})

router.post('/login', async (req,res)=>{
  const { email, password, next } = req.body
  const [rows] = await req.db.query('SELECT * FROM users WHERE email=?', [email])
  if(!rows.length) return res.status(401).send('Credenciales inválidas')
  const ok = await bcrypt.compare(password, rows[0].password_hash)
  if(!ok) return res.status(401).send('Credenciales inválidas')
  setSessionAndGo(req, res, rows[0].id, next || '/panel')
})

router.get('/logout', (req,res)=>{ req.session.destroy(()=>res.redirect('/')) })

export default router
