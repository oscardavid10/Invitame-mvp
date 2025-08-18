import { Router } from 'express'
import bcrypt from 'bcrypt'
import { pool } from '../utils/db.js'
const router = Router()
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'david_010@live.com.mx'

function setSessionAndGo(req, res, uid, email, nextUrl='/panel', isAdmin=false) {
  req.session.regenerate(err => {
    if (err) return res.status(500).send('Session error')
    req.session.uid = uid
    req.session.email = email
    req.session.is_admin = isAdmin
    req.session.save(() => res.redirect(nextUrl))
  })
}

router.get('/login', (req,res)=> res.render('site/login', { next: req.query.next || '/panel' }))

router.get('/register', (req, res) => {
  res.render('site/register', { title: 'Crear cuenta' });
});

router.post('/register', async (req, res) => {
  try {
    const { name = '', email = '', password = '' } = req.body;
    if (!email || !password) return res.status(400).send('Faltan datos');

    const [[exists]] = await pool.query('SELECT id FROM users WHERE email=? LIMIT 1', [email]);
    if (exists) return res.status(409).send('Este correo ya está registrado');

    const hash = await bcrypt.hash(password, 10);
    const [ins] = await pool.query(
      'INSERT INTO users (name, email, password_hash, is_admin) VALUES (?,?,?,?)',
      [
        name.trim(),
        email.trim().toLowerCase(),
        hash,
        email.trim().toLowerCase() === ADMIN_EMAIL ? 1 : 0,
      ]
    );

    req.session.uid = ins.insertId;
    // trae el usuario para locals y flag de admin
    const [[u]] = await pool.query('SELECT id, email, name, is_admin FROM users WHERE id=?', [ins.insertId]);
    req.session.is_admin = !!u?.is_admin;
    return res.redirect(u.is_admin ? '/admin' : '/panel');
  } catch (e) {
    console.error('POST /auth/register', e);
    res.status(500).send('Error registrando usuario');
  }
});

router.post('/login', async (req,res)=>{
  const { email, password, next } = req.body
  const [rows] = await req.db.query('SELECT * FROM users WHERE email=?', [email])
  if(!rows.length) return res.status(401).send('Credenciales inválidas')
  const ok = await bcrypt.compare(password, rows[0].password_hash)
  if(!ok) return res.status(401).send('Credenciales inválidas')
  const isAdmin = rows[0].is_admin || rows[0].email === ADMIN_EMAIL
  const dest = isAdmin ? '/admin/templates' : (next || '/panel')
  setSessionAndGo(req, res, rows[0].id, rows[0].email, dest, !!isAdmin)
})

router.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('logout err:', err);
    // El nombre por defecto de la cookie de sesión es 'connect.sid'
    res.clearCookie(process.env.SESSION_NAME || 'connect.sid', { path: '/' });
    return res.redirect('/');
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) console.error('logout err:', err);
    res.clearCookie(process.env.SESSION_NAME || 'connect.sid', { path: '/' });
    return res.redirect('/');
  });
});

export default router
