// Forfaits : liste publique (recherche, filtres, tri), détail, comparateur
const express = require('express');
const { getDb } = require('../db');

const router = express.Router();
const OPERATORS = {
  tt: { name: 'Tunisie Télécom', short: 'TT', color: '#2563EB' },
  ooredoo: { name: 'Ooredoo', short: 'OO', color: '#E30613' },
  orange: { name: 'Orange', short: 'OR', color: '#FF7900' },
};

function planRow(p) {
  return { ...p, operator_name: OPERATORS[p.operator]?.name || p.operator, operator_short: OPERATORS[p.operator]?.short || '', operator_color: OPERATORS[p.operator]?.color || '#1D4ED8' };
}

// GET /api/plans?operator=tt&ooredoo&type=Internet&q=25&min=5&max=50&sort=price_asc|price_desc|data_desc|popular
router.get('/', (req, res) => {
  const { operator, type, q, min, max, sort, featured } = req.query;
  const db = getDb();
  let sql = 'SELECT * FROM plans WHERE active = 1';
  const params = [];
  if (operator) {
    const ops = String(operator).split(',').map(s => s.trim()).filter(s => OPERATORS[s]);
    if (ops.length) { sql += ` AND operator IN (${ops.map(() => '?').join(',')})`; params.push(...ops); }
  }
  if (type && ['Internet', 'Crédit', 'Mixte'].includes(type)) { sql += ' AND type = ?'; params.push(type); }
  if (q) { sql += ' AND (name_fr LIKE ? OR name_ar LIKE ? OR data_label LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (min !== undefined && min !== '') { sql += ' AND price >= ?'; params.push(Number(min)); }
  if (max !== undefined && max !== '') { sql += ' AND price <= ?'; params.push(Number(max)); }
  if (featured === '1') sql += ' AND featured = 1';
  const sorts = { price_asc: 'price ASC', price_desc: 'price DESC', data_desc: 'data_mb DESC', popular: 'featured DESC, price ASC' };
  sql += ' ORDER BY ' + (sorts[sort] || 'sort_order ASC');
  res.json({ operators: OPERATORS, plans: db.prepare(sql).all(...params).map(planRow) });
});

// Comparateur : GET /api/plans/compare?ids=1,2,3 (max 4)
router.get('/compare', (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 4);
  if (!ids.length) return res.status(400).json({ error: 'Aucun forfait à comparer.' });
  const rows = getDb().prepare(`SELECT * FROM plans WHERE id IN (${ids.map(() => '?').join(',')}) AND active = 1`).all(...ids);
  const byId = new Map(rows.map(r => [r.id, planRow(r)]));
  res.json({ plans: ids.map(id => byId.get(id)).filter(Boolean) });
});

router.get('/:id', (req, res) => {
  const p = getDb().prepare('SELECT * FROM plans WHERE id = ? AND active = 1').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Forfait introuvable.' });
  res.json({ plan: planRow(p) });
});

module.exports = router;
