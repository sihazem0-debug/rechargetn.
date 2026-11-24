// RechargeTN — SQLite (node:sqlite, natif Node >= 22, aucune compilation native)
// Réplique exportable du site RechargeTN original (artefact recharge-mobile-tunisie v1).
// Catalogue EXACT de l'original, lu via son action listforfaits le 24 nov. 2026 :
// 33 forfaits Internet, prix en DT TTC, aucun forfait Crédit dans l'original.
// Validités : TT 100 Mo = Jusqu'à minuit ; Ooredoo 50 Mo = 2 heures, 500 Go = 5 mois,
// 1000 Go = 12 mois ; Orange 500 Go = 365 jours.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'rechargetn.db');
let db;

// data_mb en Mo. validity_days en jours (0.1 = 2 heures). price en DT.
// bonus = texte vert sous le forfait. validity_label = libellé affiché.
// badge 'Populaire' = forfait featured de l'original (les 3 forfaits 25 Go).
const PLANS = [
  // ---- Tunisie Télécom — 9 forfaits ----
  { operator: 'tt', type: 'Internet', name_fr: 'Pass 100 Mo', name_ar: 'باقة 100 ميغا', data_label: '100 Mo', data_mb: 100, validity_days: 1, validity_label: "Jusqu'à minuit", price: 0.45, bonus: '', badge: '', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Pass 650 Mo', name_ar: 'باقة 650 ميغا', data_label: '650 Mo', data_mb: 650, validity_days: 7, validity_label: '7 jours', price: 3, bonus: '', badge: '', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Pass 1.5 Go', name_ar: 'باقة 1.5 جيغا', data_label: '1.5 Go', data_mb: 1500, validity_days: 30, validity_label: '30 jours', price: 6, bonus: '', badge: '', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Pass 4 Go', name_ar: 'باقة 4 جيغا', data_label: '4 Go', data_mb: 4000, validity_days: 30, validity_label: '30 jours', price: 10, bonus: '', badge: '', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Pass 25 Go', name_ar: 'باقة 25 جيغا', data_label: '25 Go', data_mb: 25000, validity_days: 30, validity_label: '30 jours', price: 30, bonus: '', badge: 'Populaire', image: '/images/tt.svg', featured: 1 },
  { operator: 'tt', type: 'Internet', name_fr: 'Pass 45 Go', name_ar: 'باقة 45 جيغا', data_label: '45 Go', data_mb: 45000, validity_days: 30, validity_label: '30 jours', price: 50, bonus: '', badge: '', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Pass 60 Go', name_ar: 'باقة 60 جيغا', data_label: '60 Go', data_mb: 60000, validity_days: 30, validity_label: '30 jours', price: 60, bonus: '', badge: '', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Pass 110 Go', name_ar: 'باقة 110 جيغا', data_label: '110 Go', data_mb: 110000, validity_days: 60, validity_label: '60 jours', price: 80, bonus: '', badge: '', image: '/images/tt.svg', featured: 0 },
  { operator: 'tt', type: 'Internet', name_fr: 'Pass 200 Go', name_ar: 'باقة 200 جيغا', data_label: '200 Go', data_mb: 200000, validity_days: 60, validity_label: '60 jours', price: 100, bonus: '', badge: '', image: '/images/tt.svg', featured: 0 },

  // ---- Ooredoo — Flexi / Flexi+ — 15 forfaits ----
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi Micro 50 Mo', name_ar: 'فليكسي 50 ميغا', data_label: '50 Mo', data_mb: 50, validity_days: 0.1, validity_label: '2 heures', price: 0.25, bonus: '', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 1j Mini 100 Mo', name_ar: 'فليكسي 100 ميغا', data_label: '100 Mo', data_mb: 100, validity_days: 1, validity_label: "Jusqu'à minuit", price: 0.5, bonus: 'Renouvelable automatiquement chaque jour', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 1j 220 Mo', name_ar: 'فليكسي 220 ميغا', data_label: '220 Mo', data_mb: 220, validity_days: 1, validity_label: "Jusqu'à minuit", price: 1, bonus: '', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 2j 440 Mo', name_ar: 'فليكسي 440 ميغا', data_label: '440 Mo', data_mb: 440, validity_days: 2, validity_label: '2 jours', price: 2, bonus: '', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 1.25 Go', name_ar: 'فليكسي 1.25 جيغا', data_label: '1.25 Go', data_mb: 1250, validity_days: 30, validity_label: '30 jours', price: 5, bonus: '', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 30j 2.8 Go', name_ar: 'فليكسي 2.8 جيغا', data_label: '2.8 Go', data_mb: 2800, validity_days: 30, validity_label: '30 jours', price: 10, bonus: '', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'BIG Flexi 6 Go', name_ar: 'فليكسي 6 جيغا', data_label: '6 Go', data_mb: 6000, validity_days: 30, validity_label: '30 jours', price: 15, bonus: '', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi+ 25 Go', name_ar: 'فليكسي+ 25 جيغا', data_label: '25 Go', data_mb: 25000, validity_days: 30, validity_label: '30 jours', price: 25, bonus: '', badge: 'Populaire', image: '/images/ooredoo.svg', featured: 1 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Xtra Flexi 35 Go', name_ar: 'فليكسي 35 جيغا', data_label: '35 Go', data_mb: 35000, validity_days: 30, validity_label: '30 jours', price: 40, bonus: "120 min d'appels + Starzplay inclus", badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi+ 55 Go', name_ar: 'فليكسي+ 55 جيغا', data_label: '55 Go', data_mb: 55000, validity_days: 30, validity_label: '30 jours', price: 50, bonus: '', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi+ 75 Go', name_ar: 'فليكسي+ 75 جيغا', data_label: '75 Go', data_mb: 75000, validity_days: 60, validity_label: '60 jours', price: 60, bonus: '', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi+ 100 Go', name_ar: 'فليكسي+ 100 جيغا', data_label: '100 Go', data_mb: 100000, validity_days: 60, validity_label: '60 jours', price: 72, bonus: '', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 200 Go', name_ar: 'فليكسي 200 جيغا', data_label: '200 Go', data_mb: 200000, validity_days: 60, validity_label: '60 jours', price: 100, bonus: 'Idéal clé / box mobile', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 500 Go', name_ar: 'فليكسي 500 جيغا', data_label: '500 Go', data_mb: 500000, validity_days: 150, validity_label: '5 mois', price: 250, bonus: 'Idéal clé / box mobile', badge: '', image: '/images/ooredoo.svg', featured: 0 },
  { operator: 'ooredoo', type: 'Internet', name_fr: 'Flexi 1000 Go', name_ar: 'فليكسي 1000 جيغا', data_label: '1000 Go', data_mb: 1000000, validity_days: 365, validity_label: '12 mois', price: 500, bonus: 'Idéal clé / box mobile', badge: '', image: '/images/ooredoo.svg', featured: 0 },

  // ---- Orange — 9 forfaits ----
  { operator: 'orange', type: 'Internet', name_fr: 'Option 1.25 Go', name_ar: 'باقة 1.25 جيغا', data_label: '1.25 Go', data_mb: 1250, validity_days: 30, validity_label: '30 jours', price: 5, bonus: '', badge: '', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Option 4 Go', name_ar: 'باقة 4 جيغا', data_label: '4 Go', data_mb: 4000, validity_days: 30, validity_label: '30 jours', price: 10, bonus: '', badge: '', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Option 6 Go', name_ar: 'باقة 6 جيغا', data_label: '6 Go', data_mb: 6000, validity_days: 30, validity_label: '30 jours', price: 15, bonus: '', badge: '', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Option 25 Go', name_ar: 'باقة 25 جيغا', data_label: '25 Go', data_mb: 25000, validity_days: 30, validity_label: '30 jours', price: 30, bonus: '', badge: 'Populaire', image: '/images/orange.svg', featured: 1 },
  { operator: 'orange', type: 'Internet', name_fr: 'Option 42 Go', name_ar: 'باقة 42 جيغا', data_label: '42 Go', data_mb: 42000, validity_days: 30, validity_label: '30 jours', price: 46.2, bonus: '', badge: '', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Option 60 Go', name_ar: 'باقة 60 جيغا', data_label: '60 Go', data_mb: 60000, validity_days: 60, validity_label: '60 jours', price: 60, bonus: '', badge: '', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Option 100 Go', name_ar: 'باقة 100 جيغا', data_label: '100 Go', data_mb: 100000, validity_days: 60, validity_label: '60 jours', price: 72, bonus: '', badge: '', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Option 200 Go', name_ar: 'باقة 200 جيغا', data_label: '200 Go', data_mb: 200000, validity_days: 60, validity_label: '60 jours', price: 100, bonus: '', badge: '', image: '/images/orange.svg', featured: 0 },
  { operator: 'orange', type: 'Internet', name_fr: 'Option 500 Go', name_ar: 'باقة 500 جيغا', data_label: '500 Go', data_mb: 500000, validity_days: 365, validity_label: '365 jours', price: 250, bonus: '', badge: '', image: '/images/orange.svg', featured: 0 },
];

const PROMOS = [
  { code: 'BIENVENUE10', percent: 10, max_discount: 5, description_fr: '10% de remise, max 5 DT — première commande', active: 1 },
  { code: 'RECHARGETN5', percent: 5, max_discount: 3, description_fr: '5% de remise, max 3 DT', active: 1 },
];

function initDb() {
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'client',
      status TEXT NOT NULL DEFAULT 'pending',
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operator TEXT NOT NULL, type TEXT NOT NULL,
      name_fr TEXT NOT NULL, name_ar TEXT NOT NULL,
      data_label TEXT NOT NULL, data_mb INTEGER NOT NULL DEFAULT 0,
      validity_days REAL NOT NULL DEFAULT 0,
      validity_label TEXT NOT NULL DEFAULT '',
      bonus TEXT NOT NULL DEFAULT '',
      price REAL NOT NULL, old_price REAL,
      badge TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1, featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      user_id INTEGER REFERENCES users(id),
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      phone TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      payment_ref TEXT NOT NULL DEFAULT '',
      promo_code TEXT NOT NULL DEFAULT '',
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      scheduled_for TEXT,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS wallet_tx (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      amount REAL NOT NULL,
      kind TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      order_id INTEGER REFERENCES orders(id),
      admin_id INTEGER REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'Completed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS promos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE, percent REAL NOT NULL,
      max_discount REAL NOT NULL DEFAULT 0,
      description_fr TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT
    );
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      plan_id INTEGER NOT NULL REFERENCES plans(id),
      phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, plan_id, phone)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT ''
    );
  `);

  // Migration v1.1 : l'original n'utilise QUE le téléphone (pas d'email).
  // Les bases déjà créées ont email NOT NULL : on la rend nullable en
  // recréant la table (les comptes existants gardent leur email).
  const cols = db.prepare('PRAGMA table_info(users)').all();
  const emailCol = cols.find(c => c.name === 'email');
  if (emailCol && emailCol.notnull === 1) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec(`CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT UNIQUE,
      password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'client',
      status TEXT NOT NULL DEFAULT 'pending',
      balance REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec(`INSERT INTO users_new (id,name,phone,email,password_hash,role,status,balance,created_at)
      SELECT id,name,phone,email,password_hash,role,status,balance,created_at FROM users`);
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');
    db.exec('PRAGMA foreign_keys = ON');
  }

  // Seed plans (une seule fois)
  const planCount = db.prepare('SELECT COUNT(*) c FROM plans').get().c;
  if (planCount === 0) {
    const ins = db.prepare(`INSERT INTO plans (operator,type,name_fr,name_ar,data_label,data_mb,validity_days,validity_label,bonus,price,badge,image,featured,sort_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    PLANS.forEach((p, i) => ins.run(p.operator, p.type, p.name_fr, p.name_ar, p.data_label, p.data_mb, p.validity_days, p.validity_label, p.bonus, p.price, p.badge, p.image, p.featured, i));
  }
  // Seed promos
  const promoCount = db.prepare('SELECT COUNT(*) c FROM promos').get().c;
  if (promoCount === 0) {
    const ins = db.prepare('INSERT INTO promos (code,percent,max_discount,description_fr,active) VALUES (?,?,?,?,?)');
    PROMOS.forEach(p => ins.run(p.code, p.percent, p.max_discount, p.description_fr, p.active));
  }
  // Seed settings
  const defaults = {
    whatsapp_number: process.env.WHATSAPP_NUMBER || '216XXXXXXXX',
    d17_number: process.env.D17_NUMBER || '216XXXXXXXX',
    flouci_number: process.env.FLOUCI_NUMBER || '216XXXXXXXX',
    site_name: 'RechargeTN',
    min_topup: '5',
    announcement_fr: 'Recharge instantanée — Tunisie Télécom, Ooredoo et Orange. Paiement D17, Flouci ou par solde.',
    announcement_ar: 'تعبئة فورية — تونس تيليكوم، أوريدو وأورانج. الدفع عبر D17 أو Flouci أو بالرصيد.',
  };
  const setIns = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  Object.entries(defaults).forEach(([k, v]) => setIns.run(k, v));

  // Seed admin (approuvé d'office). Mot de passe à changer immédiatement.
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@rechargetn.tn';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    const hash = bcrypt.hashSync(adminPass, 10);
    db.prepare(`INSERT INTO users (name,phone,email,password_hash,role,status,balance)
      VALUES (?,?,?,?, 'admin','approved',0)`)
      .run('Administrateur', '00000000', adminEmail, hash);
  }
  return db;
}

function getDb() { if (!db) return initDb(); return db; }

module.exports = { initDb, getDb, PLANS };
