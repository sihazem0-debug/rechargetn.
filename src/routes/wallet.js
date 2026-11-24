// Solde / wallet : consultation, historique, demande de recharge de solde
// (le client paie D17/Flouci puis l'admin confirme et crédite le solde).
const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireApproved } = require('../auth');

const router = express.Router();

// Solde + historique (client connecté)
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT balance FROM users WHERE id = ?').get(req.user.id);
  const tx = db.prepare(`SELECT w.*, u.name AS admin_name FROM wallet_tx w
    LEFT JOIN users u ON u.id = w.admin_id WHERE w.user_id = ? ORDER BY w.created_at DESC LIMIT 100`).all(req.user.id);
  res.json({ balance: user.balance, transactions: tx });
});

// Demande de recharge de solde : le client déclare son paiement D17/Flouci,
// l'admin le confirme dans le dashboard -> solde crédité.
router.post('/topup-request', requireAuth, requireApproved, (req, res) => {
  const { amount, payment_method, payment_ref } = req.body || {};
  const amt = Number(amount);
  const db = getDb();
  const min = Number(db.prepare("SELECT value FROM settings WHERE key='min_topup'").get()?.value || 5);
  if (!amt || amt < min) return res.status(400).json({ error: `Montant minimum de recharge de solde : ${min} DT.` });
  if (!['d17', 'flouci', 'manual'].includes(payment_method)) return res.status(400).json({ error: 'Moyen de paiement invalide.' });
  if (!String(payment_ref || '').trim()) return res.status(400).json({ error: 'Référence de paiement obligatoire.' });
  db.prepare(`INSERT INTO wallet_tx (user_id,amount,kind,reason,admin_id,status)
    VALUES (?,?,?,?,NULL,?)`).run(req.user.id, amt, 'top_up',
    `Demande de recharge solde via ${payment_method.toUpperCase()} — réf: ${String(payment_ref).trim()}`, 'Pending');
  res.status(201).json({ message: 'Demande envoyée. Votre solde sera crédité après confirmation de l\'administrateur.' });
});

// Notifications : derniers événements (commandes + mouvements de solde)
router.get('/notifications', requireAuth, (req, res) => {
  const db = getDb();
  const orders = db.prepare(`SELECT 'order' AS kind, code AS ref, status, total, created_at, updated_at
    FROM orders WHERE user_id = ? ORDER BY updated_at DESC LIMIT 10`).all(req.user.id);
  const tx = db.prepare(`SELECT 'wallet' AS kind, kind AS status, amount, reason, created_at
    FROM wallet_tx WHERE user_id = ? ORDER BY created_at DESC LIMIT 10`).all(req.user.id);
  res.json({ notifications: [...orders, ...tx].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)).slice(0, 15) });
});

module.exports = router;
