// RechargeTN — serveur Express (réplique exportable du site original)
try { require('dotenv').config(); } catch { /* dotenv optionnel */ }
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb, getDb } = require('./src/db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
initDb();

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'RechargeTN', version: '1.1.0' }));

// Config publique (numéros de paiement + WhatsApp, modifiables dans l'admin)
app.get('/api/config', (req, res) => {
  const rows = getDb().prepare("SELECT key,value FROM settings WHERE key IN ('whatsapp_number','d17_number','flouci_number','site_name','announcement_fr','announcement_ar')").all();
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  res.json({ ...cfg, currency: 'TND' });
});

app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/plans', require('./src/routes/plans'));
app.use('/api/orders', require('./src/routes/orders'));
app.use('/api/wallet', require('./src/routes/wallet'));
app.use('/api/admin', require('./src/routes/admin'));

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RechargeTN en ligne sur http://localhost:${PORT}`));
module.exports = app;
