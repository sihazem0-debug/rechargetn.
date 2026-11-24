// Admin : stats, validation des comptes, gestion des soldes, commandes,
// forfaits, codes promo, paramètres.
const express = require('express');
const { getDb } = require('../db');
const { requireAuth, requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

// --- Tableau de bord ---
router.get('/stats', (req, res) => {
  const db = getDb();
  const today = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM orders WHERE date(created_at) = date('now') AND status != 'Cancelled'`).get();
  const total = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(total),0) s FROM orders WHERE status != 'Cancelled'`).get();
  const pendingUsers = db.prepare(`SELECT COUNT(*) c FROM users WHERE role='client' AND status='pending'`).get().c;
  const clients = db.prepare(`SELECT COUNT(*) c FROM users WHERE role='client' AND status='approved'`).get().c;
  const totalBalance = db.prepare(`SELECT COALESCE(SUM(balance),0) s FROM users WHERE role='client'`).get().s;
  const pendingOrders = db.prepare(`SELECT COUNT(*) c FROM orders WHERE status IN ('Pending','Scheduled')`).get().c;
  const pendingTopups = db.prepare(`SELECT COUNT(*) c FROM wallet_tx WHERE kind='top_up' AND status='Pending'`).get().c;
  const byOperator = db.prepare(`SELECT p.operator, COUNT(*) c, COALESCE(SUM(o.total),0) s
    FROM orders o JOIN plans p ON p.id=o.plan_id WHERE o.status != 'Cancelled' GROUP BY p.operator`).all();
  const byStatus = db.prepare(`SELECT status, COUNT(*) c FROM orders GROUP BY status`).all();
  res.json({ today, total, pendingUsers, clients, totalBalance, pendingOrders, pendingTopups, byOperator, byStatus });
});

// --- Comptes clients en attente / gestion ---
router.get('/users', (req, res) => {
  const { status } = req.query;
  const db = getDb();
  let sql = `SELECT id,name,phone,email,role,status,balance,created_at FROM users WHERE role='client'`;
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  res.json({ users: db.prepare(sql).all(...params) });
});

router.post('/users/:id/approve', (req, res) => {
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'client');
  if (!u) return res.status(404).json({ error: 'Client introuvable.' });
  if (u.status === 'approved') return res.status(400).json({ error: 'Compte déjà approuvé.' });
  db.prepare("UPDATE users SET status='approved' WHERE id=?").run(u.id);
  res.json({ message: `${u.name} approuvé. Il peut maintenant se connecter.` });
});

router.post('/users/:id/reject', (req, res) => {
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'client');
  if (!u) return res.status(404).json({ error: 'Client introuvable.' });
  db.prepare("UPDATE users SET status='rejected' WHERE id=?").run(u.id);
  res.json({ message: `${u.name} refusé.` });
});

// --- Soldes : créditer / débiter un client (avec motif + historique) ---
router.post('/users/:id/balance', (req, res) => {
  const { amount, reason } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt === 0) return res.status(400).json({ error: 'Montant invalide (positif pour créditer, négatif pour débiter).' });
  if (!String(reason || '').trim()) return res.status(400).json({ error: 'Motif obligatoire (traçabilité).' });
  const db = getDb();
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'client');
  if (!u) return res.status(404).json({ error: 'Client introuvable.' });
  if (amt < 0 && u.balance + amt < 0) return res.status(400).json({ error: `Solde insuffisant : ${u.balance} DT.` });
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amt, u.id);
    db.prepare(`INSERT INTO wallet_tx (user_id,amount,kind,reason,admin_id,status) VALUES (?,?,?,?,?,?)`)
      .run(u.id, amt, amt > 0 ? 'credit' : 'debit', String(reason).trim(), req.user.id, 'Completed');
    db.exec('COMMIT');
  } catch { db.exec('ROLLBACK'); return res.status(500).json({ error: 'Erreur.' }); }
  const fresh = db.prepare('SELECT balance FROM users WHERE id = ?').get(u.id);
  res.json({ message: `Solde ${amt > 0 ? 'crédité' : 'débité'} de ${Math.abs(amt)} DT. Nouveau solde : ${fresh.balance} DT.`, balance: fresh.balance });
});

// Demandes de recharge de solde en attente + confirmation / refus
router.get('/topups', (req, res) => {
  const rows = getDb().prepare(`SELECT w.*, u.name AS user_name, u.email, u.phone FROM wallet_tx w
    JOIN users u ON u.id = w.user_id WHERE w.kind='top_up' AND w.status='Pending' ORDER BY w.created_at DESC`).all();
  res.json({ topups: rows });
});
router.post('/topups/:id/confirm', (req, res) => {
  const db = getDb();
  const tx = db.prepare("SELECT * FROM wallet_tx WHERE id = ? AND kind='top_up' AND status='Pending'").get(req.params.id);
  if (!tx) return res.status(404).json({ error: 'Demande introuvable ou déjà traitée.' });
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(tx.amount, tx.user_id);
    db.prepare("UPDATE wallet_tx SET status='Completed', admin_id=? WHERE id=?").run(req.user.id, tx.id);
    db.exec('COMMIT');
  } catch { db.exec('ROLLBACK'); return res.status(500).json({ error: 'Erreur.' }); }
  res.json({ message: `Solde crédité de ${tx.amount} DT.` });
});
router.post('/topups/:id/reject', (req, res) => {
  getDb().prepare("UPDATE wallet_tx SET status='Cancelled', admin_id=? WHERE id=? AND kind='top_up' AND status='Pending'")
    .run(req.user.id, req.params.id);
  res.json({ message: 'Demande de recharge refusée.' });
});

// Historique solde d'un client
router.get('/users/:id/wallet', (req, res) => {
  const db = getDb();
  const u = db.prepare('SELECT id,name,balance FROM users WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'Client introuvable.' });
  const tx = db.prepare(`SELECT w.*, a.name AS admin_name FROM wallet_tx w LEFT JOIN users a ON a.id=w.admin_id
    WHERE w.user_id = ? ORDER BY w.created_at DESC LIMIT 100`).all(u.id);
  res.json({ user: u, transactions: tx });
});

// --- Commandes ---
router.get('/orders', (req, res) => {
  const { status, q } = req.query;
  const db = getDb();
  let sql = `SELECT o.*, p.name_fr AS plan_name, p.operator, u.name AS user_name, u.email
    FROM orders o JOIN plans p ON p.id=o.plan_id LEFT JOIN users u ON u.id=o.user_id WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  if (q) { sql += ' AND (o.code LIKE ? OR o.phone LIKE ? OR u.name LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  sql += ' ORDER BY o.created_at DESC LIMIT 200';
  res.json({ orders: db.prepare(sql).all(...params) });
});
router.post('/orders/:id/status', (req, res) => {
  const { status, note } = req.body || {};
  const STATUSES = ['Pending', 'Processing', 'Completed', 'Cancelled', 'Scheduled'];
  if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Statut invalide.' });
  const db = getDb();
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'Commande introuvable.' });
  // Remboursement automatique si annulation d'une commande payée par solde
  if (status === 'Cancelled' && o.status !== 'Cancelled' && o.payment_method === 'wallet' && o.user_id) {
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(o.total, o.user_id);
      db.prepare(`INSERT INTO wallet_tx (user_id,amount,kind,reason,order_id,admin_id,status) VALUES (?,?,?,?,?,?,?)`)
        .run(o.user_id, o.total, 'credit', `Remboursement commande annulée ${o.code}`, o.id, req.user.id, 'Completed');
      db.prepare("UPDATE orders SET status=?, note=?, updated_at=datetime('now') WHERE id=?").run(status, String(note || o.note || ''), o.id);
      db.exec('COMMIT');
    } catch { db.exec('ROLLBACK'); return res.status(500).json({ error: 'Erreur.' }); }
    return res.json({ message: `Commande annulée — ${o.total} DT remboursés sur le solde du client.` });
  }
  db.prepare("UPDATE orders SET status=?, note=?, updated_at=datetime('now') WHERE id=?").run(status, String(note || o.note || ''), o.id);
  res.json({ message: `Commande ${o.code} -> ${status}.` });
});

// --- Forfaits (CRUD admin) ---
router.get('/plans', (req, res) => {
  res.json({ plans: getDb().prepare('SELECT * FROM plans ORDER BY sort_order ASC').all() });
});
router.post('/plans', (req, res) => {
  const { operator, type, name_fr, name_ar, data_label, data_mb, validity_days, validity_label, bonus, price, old_price, badge, image, featured } = req.body || {};
  if (!['tt', 'ooredoo', 'orange'].includes(operator)) return res.status(400).json({ error: 'Opérateur invalide.' });
  if (!name_fr || price === undefined || Number(price) < 0) return res.status(400).json({ error: 'Nom et prix obligatoires.' });
  const db = getDb();
  const maxSort = db.prepare('SELECT COALESCE(MAX(sort_order),0) m FROM plans').get().m;
  const r = db.prepare(`INSERT INTO plans (operator,type,name_fr,name_ar,data_label,data_mb,validity_days,validity_label,bonus,price,old_price,badge,image,featured,sort_order)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(operator, type || 'Internet', name_fr, name_ar || name_fr, data_label || '', Number(data_mb) || 0,
    Number(validity_days) || 0, validity_label || '', bonus || '', Number(price), old_price ? Number(old_price) : null, badge || '', image || `/images/${operator}.svg`, featured ? 1 : 0, maxSort + 1);
  res.status(201).json({ message: 'Forfait ajouté.', id: r.lastInsertRowid });
});
router.put('/plans/:id', (req, res) => {
  const { operator, type, name_fr, name_ar, data_label, data_mb, validity_days, validity_label, bonus, price, old_price, badge, image, featured, active } = req.body || {};
  const db = getDb();
  const p = db.prepare('SELECT id FROM plans WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Forfait introuvable.' });
  db.prepare(`UPDATE plans SET operator=?,type=?,name_fr=?,name_ar=?,data_label=?,data_mb=?,validity_days=?,validity_label=?,bonus=?,price=?,old_price=?,badge=?,image=?,featured=?,active=? WHERE id=?`)
    .run(operator, type, name_fr, name_ar, data_label, Number(data_mb) || 0, Number(validity_days) || 0, validity_label || '', bonus || '', Number(price),
      old_price ? Number(old_price) : null, badge || '', image || '', featured ? 1 : 0, active ? 1 : 0, req.params.id);
  res.json({ message: 'Forfait mis à jour.' });
});
router.delete('/plans/:id', (req, res) => {
  // Désactivation plutôt que suppression (les anciennes commandes référencent le forfait)
  getDb().prepare('UPDATE plans SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Forfait désactivé (conservé pour l\'historique des commandes).' });
});

// --- Codes promo ---
router.get('/promos', (req, res) => {
  res.json({ promos: getDb().prepare('SELECT * FROM promos ORDER BY code').all() });
});
router.post('/promos', (req, res) => {
  const { code, percent, max_discount, description_fr, expires_at } = req.body || {};
  if (!code || percent === undefined) return res.status(400).json({ error: 'Code et pourcentage obligatoires.' });
  try {
    getDb().prepare('INSERT INTO promos (code,percent,max_discount,description_fr,active,expires_at) VALUES (?,?,?,?,1,?)')
      .run(String(code).trim().toUpperCase(), Number(percent), Number(max_discount) || 0, description_fr || '', expires_at || null);
  } catch { return res.status(409).json({ error: 'Ce code existe déjà.' }); }
  res.status(201).json({ message: 'Code promo créé.' });
});
router.post('/promos/:id/toggle', (req, res) => {
  getDb().prepare('UPDATE promos SET active = 1 - active WHERE id = ?').run(req.params.id);
  res.json({ message: 'Code promo activé / désactivé.' });
});

// --- Paramètres (WhatsApp, D17, Flouci, annonce) ---
router.get('/settings', (req, res) => {
  const rows = getDb().prepare('SELECT key,value FROM settings').all();
  res.json({ settings: Object.fromEntries(rows.map(r => [r.key, r.value])) });
});
router.put('/settings', (req, res) => {
  const db = getDb();
  const allowed = ['whatsapp_number', 'd17_number', 'flouci_number', 'site_name', 'min_topup', 'announcement_fr', 'announcement_ar'];
  const up = db.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
  Object.entries(req.body || {}).forEach(([k, v]) => { if (allowed.includes(k)) up.run(k, String(v)); });
  res.json({ message: 'Paramètres enregistrés.' });
});

module.exports = router;
