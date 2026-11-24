// Auth : inscription (statut pending — l'admin doit approuver), connexion, /me
// Comme l'original (artefact recharge-mobile-tunisie) : les clients
// s'inscrivent et se connectent UNIQUEMENT par numéro de téléphone
// (8 chiffres) + mot de passe (6 caractères minimum). AUCUN email.
// L'email n'est accepté en connexion que pour l'administrateur
// (admin@rechargetn.tn) et les anciens comptes qui en ont un.
const express = require('express');
const { getDb } = require('../db');
const { signToken, hashPassword, checkPassword, publicUser, requireAuth, normalizeTnPhone } = require('../auth');

const router = express.Router();

// Inscription client -> statut "pending". AUCUN accès tant que l'admin n'approuve pas.
router.post('/register', (req, res) => {
  const { name, phone, password } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Le nom est obligatoire.' });
  const cleanPhone = normalizeTnPhone(phone);
  if (!cleanPhone) return res.status(400).json({ error: 'Numéro tunisien invalide (8 chiffres, commence par 2, 5 ou 9).' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Mot de passe : 6 caractères minimum.' });
  const db = getDb();
  const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(cleanPhone);
  if (exists) return res.status(409).json({ error: 'Un compte existe déjà avec ce numéro de téléphone.' });
  const r = db.prepare('INSERT INTO users (name,phone,email,password_hash,role,status) VALUES (?,?,NULL,?,?,?)')
    .run(name.trim(), cleanPhone, hashPassword(password), 'client', 'pending');
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json({
    message: 'Inscription reçue. Votre compte est en attente de validation par l\'administrateur. Vous pourrez vous connecter après approbation.',
    user: publicUser(user),
  });
});

// Connexion : bloquée si pending / rejected.
// Identifiant = numéro de téléphone (clients) ou email (admin / anciens comptes).
router.post('/login', (req, res) => {
  const { phone, email, identifier, password } = req.body || {};
  const idRaw = String(identifier || phone || email || '').trim();
  if (!idRaw || !password) return res.status(400).json({ error: 'Numéro de téléphone et mot de passe requis.' });
  const db = getDb();
  let user = null;
  if (idRaw.includes('@')) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(idRaw.toLowerCase());
  } else {
    const cleanPhone = normalizeTnPhone(idRaw);
    if (!cleanPhone) return res.status(400).json({ error: 'Numéro tunisien invalide (8 chiffres, commence par 2, 5 ou 9).' });
    user = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);
  }
  if (!user || !checkPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Numéro de téléphone ou mot de passe incorrect.' });
  }
  if (user.status === 'pending') {
    return res.status(403).json({ error: 'Compte en attente de validation. L\'administrateur doit approuver votre inscription avant votre première connexion.', status: 'pending' });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({ error: 'Votre inscription a été refusée. Contactez-nous sur WhatsApp pour plus d\'informations.', status: 'rejected' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
