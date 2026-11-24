// Commandes : recharge rapide (invité ou connecté), paiement solde / D17 / Flouci /
// manuel, code promo, recharge programmée, favoris, suivi par code, reçu.
const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireApproved, normalizeTnPhone } = require('../auth');

const router = express.Router();
const PAYMENTS = ['wallet', 'd17', 'flouci', 'manual'];
const STATUSES = ['Pending', 'Processing', 'Completed', 'Cancelled', 'Scheduled'];

function orderCode() {
  return 'TR-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function applyPromo(db, code, price) {
  if (!code) return { discount: 0, code: '' };
  const promo = db.prepare('SELECT * FROM promos WHERE code = ? AND active = 1').get(String(code).trim().toUpperCase());
  if (!promo) return { error: 'Code promo invalide ou expiré.' };
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) return { error: 'Code promo expiré.' };
  const discount = Math.min(price * (promo.percent / 100), promo.max_discount || Infinity);
  return { discount: Math.round(discount * 1000) / 1000, code: promo.code };
}

// Vérifier un code promo sans commander
router.post('/promo-check', (req, res) => {
  const { code, price } = req.body || {};
  const db = getDb();
  const r = applyPromo(db, code, Number(price) || 0);
  if (r.error) return res.status(400).json({ error: r.error });
  res.json({ code: r.code, discount: r.discount, total: Math.max(0, (Number(price) || 0) - r.discount) });
});

// Créer une commande (invité autorisé, sauf paiement par solde = connecté + approuvé)
router.post('/', (req, res) => {
  const { plan_id, phone, payment_method, payment_ref, promo_code, scheduled_for, note } = req.body || {};
  const db = getDb();
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND active = 1').get(plan_id);
  if (!plan) return res.status(404).json({ error: 'Forfait introuvable ou indisponible.' });
  const cleanPhone = normalizeTnPhone(phone);
  if (!cleanPhone) return res.status(400).json({ error: 'Numéro tunisien invalide (8 chiffres, commence par 2, 5 ou 9).' });
  if (!PAYMENTS.includes(payment_method)) return res.status(400).json({ error: 'Moyen de paiement invalide.' });

  // Utilisateur connecté ? (token optionnel)
  let user = null;
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const payload = jwt.verify(h.slice(7), process.env.JWT_SECRET || 'rechargetn-dev-secret-change-me');
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id) || null;
    } catch { /* invité */ }
  }
  if (payment_method === 'wallet') {
    if (!user) return res.status(401).json({ error: 'Connectez-vous pour payer avec votre solde.' });
    if (user.status !== 'approved') return res.status(403).json({ error: 'Votre compte doit être approuvé par l\'administrateur pour utiliser le solde.' });
  }
  if ((payment_method === 'd17' || payment_method === 'flouci') && !String(payment_ref || '').trim()) {
    return res.status(400).json({ error: 'Référence de paiement obligatoire (numéro de transaction D17 / Flouci).' });
  }

  const promo = applyPromo(db, promo_code, plan.price);
  if (promo.error) return res.status(400).json({ error: promo.error });
  const total = Math.round((plan.price - promo.discount) * 1000) / 1000;

  let scheduled = null;
  if (scheduled_for) {
    const d = new Date(scheduled_for);
    if (isNaN(d) || d <= new Date()) return res.status(400).json({ error: 'Date de recharge programmée invalide (doit être dans le futur).' });
    scheduled = d.toISOString();
  }

  const code = orderCode();
  const status = scheduled ? 'Scheduled' : (payment_method === 'wallet' ? 'Processing' : 'Pending');

  try {
    db.exec('BEGIN');
    if (payment_method === 'wallet') {
      const fresh = db.prepare('SELECT balance FROM users WHERE id = ?').get(user.id);
      if (fresh.balance < total) { db.exec('ROLLBACK'); return res.status(400).json({ error: `Solde insuffisant (${fresh.balance} DT). Rechargez votre solde ou choisissez D17 / Flouci.` }); }
      db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(total, user.id);
    }
    const r = db.prepare(`INSERT INTO orders (code,user_id,plan_id,phone,payment_method,payment_ref,promo_code,discount,total,status,scheduled_for,note)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(code, user ? user.id : null, plan.id, cleanPhone, payment_method, String(payment_ref || '').trim(), promo.code, promo.discount, total, status, scheduled, String(note || '').slice(0, 200));
    if (payment_method === 'wallet') {
      db.prepare(`INSERT INTO wallet_tx (user_id,amount,kind,reason,order_id,status) VALUES (?,?,?,?,?,?)`)
        .run(user.id, -total, 'purchase', `Achat ${plan.name_fr} — ${cleanPhone}`, r.lastInsertRowid, 'Completed');
    }
    db.exec('COMMIT');
  } catch (e) { try { db.exec('ROLLBACK'); } catch {} return res.status(500).json({ error: 'Erreur lors de la création de la commande.' }); }

  const order = db.prepare(`SELECT o.*, p.name_fr AS plan_name, p.operator, p.data_label, p.type
    FROM orders o JOIN plans p ON p.id = o.plan_id WHERE o.code = ?`).get(code);
  const wa = db.prepare("SELECT value FROM settings WHERE key = 'whatsapp_number'").get();
  res.status(201).json({ message: scheduled ? 'Recharge programmée.' : 'Commande créée.', order, whatsapp_number: wa?.value || '' });
});

// Suivi public par code de commande
router.get('/track/:code', (req, res) => {
  const o = getDb().prepare(`SELECT o.*, p.name_fr AS plan_name, p.operator, p.data_label, p.type, p.image
    FROM orders o JOIN plans p ON p.id = o.plan_id WHERE o.code = ?`).get(req.params.code.toUpperCase());
  if (!o) return res.status(404).json({ error: 'Commande introuvable. Vérifiez le code (ex. TR-XXXXXX).' });
  res.json({ order: o });
});

// Mes commandes (connecté)
router.get('/mine', requireAuth, (req, res) => {
  const rows = getDb().prepare(`SELECT o.*, p.name_fr AS plan_name, p.operator, p.data_label, p.type, p.image
    FROM orders o JOIN plans p ON p.id = o.plan_id WHERE o.user_id = ? ORDER BY o.created_at DESC LIMIT 100`).all(req.user.id);
  res.json({ orders: rows });
});

// Répéter une commande
router.post('/:id/repeat', requireAuth, requireApproved, (req, res) => {
  const db = getDb();
  const old = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!old) return res.status(404).json({ error: 'Commande introuvable.' });
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND active = 1').get(old.plan_id);
  if (!plan) return res.status(400).json({ error: 'Ce forfait n\'est plus disponible.' });
  const code = orderCode();
  db.prepare(`INSERT INTO orders (code,user_id,plan_id,phone,payment_method,payment_ref,total,status)
    VALUES (?,?,?,?,?,?,?,?)`).run(code, req.user.id, plan.id, old.phone, 'manual', '', plan.price, 'Pending');
  res.status(201).json({ message: 'Commande répétée. Choisissez le paiement pour la valider.', code });
});

// Favoris
router.get('/favorites', requireAuth, (req, res) => {
  const rows = getDb().prepare(`SELECT f.*, p.name_fr AS plan_name, p.operator, p.data_label, p.type, p.price, p.image
    FROM favorites f JOIN plans p ON p.id = f.plan_id WHERE f.user_id = ? ORDER BY f.created_at DESC`).all(req.user.id);
  res.json({ favorites: rows });
});
router.post('/favorites', requireAuth, (req, res) => {
  const { plan_id, phone } = req.body || {};
  const db = getDb();
  const plan = db.prepare('SELECT id FROM plans WHERE id = ? AND active = 1').get(plan_id);
  if (!plan) return res.status(404).json({ error: 'Forfait introuvable.' });
  const cleanPhone = phone ? normalizeTnPhone(phone) : '';
  if (phone && !cleanPhone) return res.status(400).json({ error: 'Numéro tunisien invalide.' });
  try {
    db.prepare('INSERT INTO favorites (user_id,plan_id,phone) VALUES (?,?,?)').run(req.user.id, plan.id, cleanPhone || '');
  } catch { return res.status(409).json({ error: 'Déjà dans vos favoris.' }); }
  res.status(201).json({ message: 'Ajouté aux favoris.' });
});
router.delete('/favorites/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM favorites WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ message: 'Favori supprimé.' });
});

module.exports = router;
