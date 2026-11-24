/* RechargeTN — front-end (vanilla JS, aucune dépendance).
   Réplique de l'interface originale : boutique groupée par opérateur,
   cartes avec data en grand, badge opérateur, prix / Go, bonus vert,
   prix couleur opérateur et bouton Recharger. */
const API = '';
let config = { whatsapp_number: '', d17_number: '', flouci_number: '' };
let plans = [], operators = {};
let selectedPlan = null, selectedPay = 'd17';
let promo = { code: '', discount: 0 };
let user = null, token = localStorage.getItem('rtn_token') || '';
let lang = localStorage.getItem('rtn_lang') || 'fr';
let compareIds = JSON.parse(localStorage.getItem('rtn_compare') || '[]');
let filterOpValue = '';

const OP_NAMES = { tt: 'Tunisie Télécom', ooredoo: 'Ooredoo', orange: 'Orange' };
const OP_SHORT = { tt: 'TT', ooredoo: 'OO', orange: 'OR' };
const OP_COLORS = { tt: '#2563EB', ooredoo: '#E30613', orange: '#FF7900' };
const OP_ORDER = ['tt', 'ooredoo', 'orange'];

function toast(msg, isErr) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(el._t); el._t = setTimeout(() => el.className = '', 4000);
}
function fmt(n) { return (Math.round(n * 1000) / 1000).toString().replace('.', ',') + ' DT'; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function authHeaders() { return token ? { Authorization: 'Bearer ' + token } : {}; }
async function api(path, opts = {}) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(opts.headers || {}) }, ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}
function waLink(msg) {
  const num = (config.whatsapp_number || '').replace(/\D/g, '');
  return num ? `https://wa.me/${num}?text=${encodeURIComponent(msg)}` : '#';
}
function validityLabel(p) {
  if (p.validity_label) return p.validity_label;
  if (!p.validity_days) return 'Crédit immédiat';
  return p.validity_days === 1 ? '1 jour' : `${p.validity_days} jours`;
}
function toggleLang() {
  lang = lang === 'fr' ? 'ar' : 'fr';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('lang-btn').textContent = lang === 'ar' ? 'Français' : 'عربي';
  localStorage.setItem('rtn_lang', lang);
  renderPlans();
}

// ---------------- Vues : Boutique / Mon compte / Admin ----------------
function showView(v) {
  document.getElementById('view-boutique').classList.toggle('hidden', v !== 'boutique');
  document.getElementById('view-account').classList.toggle('hidden', v !== 'account');
  document.getElementById('view-admin').classList.toggle('hidden', v !== 'admin');
  document.getElementById('nav-boutique').classList.toggle('active', v === 'boutique');
  document.getElementById('nav-account').classList.toggle('active', v === 'account');
  if (v === 'account') renderAccount();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
// Page Mon compte : formulaire si déconnecté, espace client si connecté.
function showAccount() {
  if (user && user.role === 'admin') return goAdmin();
  showView('account');
}
function renderAccount() {
  const logged = !!user && user.role !== 'admin';
  document.getElementById('account-auth').classList.toggle('hidden', logged);
  document.getElementById('account-dash').classList.toggle('hidden', !logged);
  if (logged) loadDash('orders');
}
function goSolde() { showAccount(); }
function goAdmin() {
  if (!user) return openAdminAuth();
  if (user.role !== 'admin') return toast('Accès administrateur requis.', true);
  showView('admin'); loadAdminStats(); adminTab('pending', document.querySelector('#admin-tabs .tab'));
}

// ---------------- Config + plans ----------------
async function loadConfig() {
  try { config = await api('/api/config'); } catch {}
  const wa = document.getElementById('wa-float');
  if (config.whatsapp_number && config.whatsapp_number !== '216XXXXXXXX') {
    wa.href = waLink("Bonjour RechargeTN, j'ai besoin d'aide."); wa.classList.remove('hidden');
    document.getElementById('footer-wa').href = wa.href;
  }
  updatePayInfo();
}

async function loadPlans() {
  const q = document.getElementById('search-input').value.trim();
  const sort = document.getElementById('sort-select').value || 'price_asc';
  const params = new URLSearchParams();
  if (filterOpValue) params.set('operator', filterOpValue);
  if (q) params.set('q', q);
  params.set('sort', sort);
  try {
    const data = await api('/api/plans?' + params);
    operators = data.operators; plans = data.plans;
    renderPlans();
  } catch (e) { document.getElementById('plans-wrap').innerHTML = '<p class="muted">Impossible de charger les forfaits.</p>'; }
}

function planName(p) { return lang === 'ar' ? (p.name_ar || p.name_fr) : p.name_fr; }
function perGo(p) {
  if (!p.data_mb) return '';
  const v = p.price / (p.data_mb / 1000); // data_mb en Mo décimaux : 1250 Mo = 1.25 Go
  // Capture originale : « 0.500 DT / Go », « 2.500 DT / Go », « 4 DT / Go »
  return (Number.isInteger(v) ? String(v) : v.toFixed(3)) + ' DT / Go';
}
function priceFmt(p) { return fmt(p.price).replace(' DT', ''); }

function planCard(p) {
  const op = p.operator;
  return `
  <article class="plan">
    ${p.badge ? `<span class="pop">${esc(p.badge)}</span>` : ''}
    <div class="plan-top">
      <div>
        <div class="data">${esc(p.data_label)}</div>
        <div class="plan-name">${esc(planName(p))}</div>
      </div>
      <span class="op-badge bg-${op}">${esc(OP_SHORT[op] || '')}</span>
    </div>
    <div class="chips"><span>${esc(validityLabel(p))}</span>${p.data_mb ? `<span>${perGo(p)}</span>` : ''}</div>
    <div class="bonus">${esc(p.bonus || '')}</div>
    <hr>
    <div class="plan-foot">
      <div class="price c-${op}">${esc(priceFmt(p))} DT</div>
      <button class="btn-recharge ${op}" onclick="openOrder(${p.id})">Recharger</button>
    </div>
    <div class="plan-sub">
      <button class="${compareIds.includes(p.id) ? 'on' : ''}" onclick="toggleCompare(${p.id})">⚖️ Comparer</button>
      <button onclick="addFavorite(${p.id})">⭐ Favori</button>
    </div>
  </article>`;
}

function renderPlans() {
  const wrap = document.getElementById('plans-wrap');
  if (!plans.length) { wrap.innerHTML = '<p class="muted">Aucun forfait ne correspond à votre recherche.</p>'; return; }
  const ops = filterOpValue ? [filterOpValue] : OP_ORDER;
  wrap.innerHTML = ops.map(op => {
    const list = plans.filter(p => p.operator === op);
    if (!list.length) return '';
    return `<section class="op-section">
      <div class="op-head"><span class="op-badge bg-${op}">${esc(OP_SHORT[op])}</span>
      <h2 class="c-${op}">${esc(OP_NAMES[op])}</h2><span class="count">${list.length} forfaits</span></div>
      <div class="grid">${list.map(planCard).join('')}</div>
    </section>`;
  }).join('');
  document.getElementById('compare-count').textContent = compareIds.length;
}

function filterOp(op) {
  filterOpValue = op;
  document.querySelectorAll('#op-pills .pill').forEach(b => b.classList.toggle('active', b.dataset.op === op));
  loadPlans();
}

// ---------------- Commande (modale Recharger) ----------------
function openOrder(id) {
  const p = plans.find(x => x.id === id);
  if (!p) return;
  selectedPlan = p; promo = { code: '', discount: 0 };
  document.getElementById('promo-input').value = '';
  document.getElementById('promo-msg').textContent = '';
  document.getElementById('ref-input').value = '';
  document.getElementById('schedule-input').value = '';
  document.getElementById('order-title').textContent = 'Recharger — ' + planName(p);
  document.getElementById('order-summary').textContent = `${OP_NAMES[p.operator]} • ${esc(p.data_label)} • ${validityLabel(p)}${p.data_mb ? ' • ' + perGo(p) : ''}`;
  document.getElementById('order-modal').classList.add('open');
  updateOrderSummary(); updatePayInfo();
}
function closeOrder(e) { if (e) e.preventDefault(); document.getElementById('order-modal').classList.remove('open'); }
function updateOrderSummary() {
  if (!selectedPlan) return;
  const total = Math.max(0, selectedPlan.price - promo.discount);
  document.getElementById('old-price').textContent = promo.discount ? fmt(selectedPlan.price) : '';
  document.getElementById('total-price').textContent = fmt(total);
}
function selectPay(m) {
  selectedPay = m;
  document.querySelectorAll('#pay-methods .pay').forEach(b => b.classList.toggle('active', b.dataset.pay === m));
  document.getElementById('ref-wrap').style.display = (m === 'd17' || m === 'flouci') ? '' : 'none';
  updatePayInfo();
}
function updatePayInfo() {
  const el = document.getElementById('pay-info');
  if (!el) return;
  const total = selectedPlan ? Math.max(0, selectedPlan.price - promo.discount) : 0;
  if (selectedPay === 'd17') el.innerHTML = `💳 <b>D17 (La Poste)</b> — envoyez <b>${fmt(total)}</b> au numéro <b>${esc(config.d17_number || '—')}</b>, puis indiquez la référence de transaction ci-dessous.`;
  else if (selectedPay === 'flouci') el.innerHTML = `💳 <b>Flouci</b> — payez <b>${fmt(total)}</b> au numéro <b>${esc(config.flouci_number || '—')}</b>, puis indiquez la référence de transaction ci-dessous.`;
  else if (selectedPay === 'wallet') el.innerHTML = user
    ? `👛 <b>Paiement par solde</b> — votre solde : <b>${fmt(user.balance)}</b>. Le montant sera débité immédiatement et la recharge traitée en priorité.`
    : `👛 <b>Paiement par solde</b> — connectez-vous à votre compte client (validé par l'admin) pour utiliser votre solde.`;
  else el.innerHTML = `🤝 <b>Paiement manuel</b> — commandez maintenant, puis finalisez avec nous sur <a href="${waLink('Bonjour, je veux payer ma recharge manuellement.')}" target="_blank">WhatsApp</a>.`;
}
async function applyPromo() {
  const code = document.getElementById('promo-input').value.trim();
  const msg = document.getElementById('promo-msg');
  if (!code || !selectedPlan) { msg.textContent = ''; promo = { code: '', discount: 0 }; updateOrderSummary(); return; }
  try {
    const r = await api('/api/orders/promo-check', { method: 'POST', body: JSON.stringify({ code, price: selectedPlan.price }) });
    promo = { code: r.code, discount: r.discount };
    msg.textContent = `✅ Code ${r.code} appliqué : -${fmt(r.discount)}`; msg.style.color = 'green';
  } catch (e) { promo = { code: '', discount: 0 }; msg.textContent = '❌ ' + e.message; msg.style.color = 'red'; }
  updateOrderSummary(); updatePayInfo();
}
async function submitOrder() {
  if (!selectedPlan) return toast('Choisissez un forfait.', true);
  const phone = document.getElementById('phone-input').value.trim();
  if (!/^[259]\d{7}$/.test(phone.replace(/[\s+]/g, '').replace(/^216/, ''))) return toast('Numéro tunisien invalide (8 chiffres, commence par 2, 5 ou 9).', true);
  const scheduled = document.getElementById('schedule-input').value;
  try {
    const r = await api('/api/orders', { method: 'POST', body: JSON.stringify({
      plan_id: selectedPlan.id, phone, payment_method: selectedPay,
      payment_ref: document.getElementById('ref-input').value.trim(),
      promo_code: promo.code, scheduled_for: scheduled || undefined,
    }) });
    closeOrder(); showReceipt(r.order, r.whatsapp_number);
    promo = { code: '', discount: 0 }; document.getElementById('promo-input').value = '';
    document.getElementById('ref-input').value = '';
    if (user) { await refreshMe(); }
    toast('Commande créée : ' + r.order.code);
  } catch (e) { toast(e.message, true); }
}
function showReceipt(o, wa) {
  const waUrl = wa ? `https://wa.me/${wa.replace(/\D/g, '')}?text=${encodeURIComponent('Bonjour, ma commande ' + o.code + ' — ' + o.plan_name + ' pour le ' + o.phone + '.')}` : '#';
  openGeneric('🧾 Reçu — ' + o.code, `
    <div class="receipt">
      <div><span>Forfait</span><b>${esc(o.plan_name)} (${esc(o.data_label)})</b></div>
      <div><span>Opérateur</span><b>${esc(OP_NAMES[o.operator] || o.operator)}</b></div>
      <div><span>Numéro rechargé</span><b>${esc(o.phone)}</b></div>
      <div><span>Paiement</span><b>${esc(o.payment_method.toUpperCase())}${o.payment_ref ? ' — réf ' + esc(o.payment_ref) : ''}</b></div>
      ${o.discount ? `<div><span>Remise promo</span><b>-${fmt(o.discount)}</b></div>` : ''}
      <div><span>Total</span><b>${fmt(o.total)}</b></div>
      <div><span>Statut</span><b><span class="status ${o.status}">${o.status}</span></b></div>
      ${o.scheduled_for ? `<div><span>Programmée le</span><b>${esc(new Date(o.scheduled_for).toLocaleString('fr-FR'))}</b></div>` : ''}
    </div>
    <p class="small muted" style="margin-top:10px">Gardez ce code : <b>${o.code}</b> — suivez votre commande dans « Suivre ma commande ».</p>
    <p><a class="btn" href="${waUrl}" target="_blank">💬 Confirmer sur WhatsApp</a></p>`);
}

// ---------------- Suivi ----------------
async function trackOrder() {
  const code = document.getElementById('track-code').value.trim().toUpperCase();
  const box = document.getElementById('track-result');
  if (!code) return;
  try {
    const { order: o } = await api('/api/orders/track/' + encodeURIComponent(code));
    box.innerHTML = `<div class="receipt">
      <div><span>Code</span><b>${esc(o.code)}</b></div>
      <div><span>Forfait</span><b>${esc(o.plan_name)} — ${esc(o.data_label)}</b></div>
      <div><span>Numéro</span><b>${esc(o.phone)}</b></div>
      <div><span>Total</span><b>${fmt(o.total)}</b></div>
      <div><span>Statut</span><b><span class="status ${o.status}">${o.status}</span></b></div>
      <div><span>Créée le</span><b>${esc(new Date(o.created_at).toLocaleString('fr-FR'))}</b></div>
    </div>`;
  } catch (e) { box.innerHTML = `<p style="color:red">${esc(e.message)}</p>`; }
}

// ---------------- Comparateur ----------------
function toggleCompare(id) {
  compareIds = compareIds.includes(id) ? compareIds.filter(x => x !== id) : [...compareIds, id].slice(0, 4);
  localStorage.setItem('rtn_compare', JSON.stringify(compareIds));
  renderPlans();
}
async function openCompare() {
  if (!compareIds.length) return toast('Sélectionnez au moins un forfait avec ⚖️ Comparer.', true);
  try {
    const { plans: list } = await api('/api/plans/compare?ids=' + compareIds.join(','));
    const rows = [
      ['Opérateur', p => OP_NAMES[p.operator]], ['Forfait', p => planName(p)], ['Type', p => p.type],
      ['Data', p => p.data_label], ['Validité', p => validityLabel(p)],
      ['Prix / Go', p => p.data_mb ? perGo(p) : '—'], ['Prix', p => fmt(p.price)],
    ];
    openGeneric('⚖️ Comparateur de forfaits', `<div class="table-wrap"><table><tr><td></td>${list.map(p => `<td><b>${esc(planName(p))}</b></td>`).join('')}</tr>
      ${rows.map(([label, fn]) => `<tr><td>${label}</td>${list.map(p => `<td>${esc(fn(p))}</td>`).join('')}</tr>`).join('')}
      <tr><td></td>${list.map(p => `<td><button class="btn small" onclick="closeGeneric();openOrder(${p.id})">Recharger</button></td>`).join('')}</tr></table></div>`);
  } catch (e) { toast(e.message, true); }
}

// ---------------- Auth : téléphone uniquement (comme l'original) ----------------
let authTab = 'login';
function setAuthTab(tab) {
  authTab = tab;
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').classList.toggle('hidden', tab !== 'login');
  document.getElementById('form-register').classList.toggle('hidden', tab !== 'register');
}
async function submitLogin() {
  const msg = document.getElementById('login-msg');
  const phone = document.getElementById('login-phone').value.trim();
  const password = document.getElementById('login-pass').value;
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) });
    token = r.token; user = r.user; localStorage.setItem('rtn_token', token);
    msg.textContent = '';
    syncAuthUI();
    if (user.role === 'admin') goAdmin(); else renderAccount();
    toast('Bienvenue, ' + user.name + ' !');
  } catch (e) { msg.style.color = 'red'; msg.textContent = '❌ ' + e.message; }
}
async function submitRegister() {
  const msg = document.getElementById('register-msg');
  try {
    const r = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({
      name: document.getElementById('reg-name').value.trim(),
      phone: document.getElementById('reg-phone').value.trim(),
      password: document.getElementById('reg-pass').value }) });
    msg.style.color = 'green'; msg.textContent = '✅ ' + r.message;
    toast('Inscription envoyée — en attente de validation admin.');
  } catch (e) { msg.style.color = 'red'; msg.textContent = '❌ ' + e.message; }
}
// Connexion admin : par email (l'admin n'a pas de numéro client).
function openAdminAuth() { document.getElementById('admin-auth-modal').classList.add('open'); }
function closeAdminAuth(e) { if (e) e.preventDefault(); document.getElementById('admin-auth-modal').classList.remove('open'); }
async function submitAdminLogin() {
  const msg = document.getElementById('admin-auth-msg');
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({
      email: document.getElementById('admin-email').value.trim(),
      password: document.getElementById('admin-pass').value }) });
    if (r.user.role !== 'admin') throw new Error('Ce compte n\'est pas administrateur.');
    token = r.token; user = r.user; localStorage.setItem('rtn_token', token);
    closeAdminAuth(); syncAuthUI(); goAdmin();
    toast('Bienvenue, administrateur !');
  } catch (e) { msg.style.color = 'red'; msg.textContent = '❌ ' + e.message; }
}
async function refreshMe() {
  try { const r = await api('/api/auth/me'); user = r.user; syncAuthUI(); } catch { user = null; token = ''; localStorage.removeItem('rtn_token'); syncAuthUI(); }
}
function logout() {
  token = ''; user = null; localStorage.removeItem('rtn_token');
  syncAuthUI(); showView('boutique');
  toast('Déconnecté.');
}
function syncAuthUI() {
  document.getElementById('logout-btn').classList.toggle('hidden', !user);
  if (user) document.getElementById('wallet-hint').textContent = fmt(user.balance);
  updatePayInfo();
}

// ---------------- Espace client ----------------
async function showDashboard() { goSolde(); }
async function loadDash(tab) {
  const box = document.getElementById('dash-content');
  try {
    if (tab === 'orders') {
      const { orders } = await api('/api/orders/mine');
      const { balance } = await api('/api/wallet');
      document.getElementById('dash-balance').textContent = fmt(balance);
      document.getElementById('dash-user').textContent = user.name + ' • ' + user.phone;
      box.innerHTML = orders.length ? `<table><tr><th>Code</th><th>Forfait</th><th>Numéro</th><th>Total</th><th>Statut</th><th>Date</th><th></th></tr>
        ${orders.map(o => `<tr><td><b>${esc(o.code)}</b></td><td>${esc(o.plan_name)}<br><span class="muted small">${esc(o.data_label)}</span></td><td>${esc(o.phone)}</td><td>${fmt(o.total)}</td><td><span class="status ${o.status}">${o.status}</span></td><td class="small">${esc(new Date(o.created_at).toLocaleDateString('fr-FR'))}</td><td><button class="btn small soft" onclick="repeatOrder(${o.id})">↻ Répéter</button></td></tr>`).join('')}</table>`
        : '<p class="muted">Aucune recharge pour le moment.</p>';
    } else if (tab === 'wallet') {
      const { balance, transactions } = await api('/api/wallet');
      document.getElementById('dash-balance').textContent = fmt(balance);
      box.innerHTML = transactions.length ? `<table><tr><th>Date</th><th>Type</th><th>Motif</th><th>Montant</th><th>Statut</th></tr>
        ${transactions.map(w => `<tr><td class="small">${esc(new Date(w.created_at).toLocaleString('fr-FR'))}</td><td>${esc(w.kind)}</td><td>${esc(w.reason)}</td><td style="color:${w.amount >= 0 ? 'green' : 'red'};font-weight:700">${w.amount >= 0 ? '+' : ''}${fmt(w.amount)}</td><td>${esc(w.status)}</td></tr>`).join('')}</table>`
        : '<p class="muted">Aucun mouvement de solde.</p>';
    } else if (tab === 'favs') {
      const { favorites } = await api('/api/orders/favorites');
      box.innerHTML = favorites.length ? `<table><tr><th>Forfait</th><th>Numéro</th><th>Prix</th><th></th></tr>
        ${favorites.map(f => `<tr><td>${esc(f.plan_name)} — ${esc(f.data_label)}</td><td>${esc(f.phone || '—')}</td><td>${fmt(f.price)}</td><td><button class="btn small" onclick="openOrder(${f.plan_id})">Recharger</button> <button class="btn small soft" onclick="delFav(${f.id})">✕</button></td></tr>`).join('')}</table>`
        : '<p class="muted">Aucun favori. Cliquez sur ⭐ Favori sur un forfait pour l\'enregistrer.</p>';
    } else if (tab === 'notifs') {
      const { notifications } = await api('/api/wallet/notifications');
      box.innerHTML = notifications.length ? notifications.map(n => `<p>🔔 <b>${esc(n.kind === 'order' ? 'Commande ' + n.ref : 'Solde')}</b> — ${esc(n.status)} ${n.total !== undefined ? '• ' + fmt(n.total) : ''} ${n.amount !== undefined ? '• ' + fmt(n.amount) : ''} <span class="muted small">${esc(new Date(n.updated_at || n.created_at).toLocaleString('fr-FR'))}</span></p>`).join('')
        : '<p class="muted">Aucune notification.</p>';
    }
  } catch (e) { box.innerHTML = `<p style="color:red">${esc(e.message)}</p>`; }
}
function dashTab(tab, btn) {
  document.querySelectorAll('#account-dash .tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); loadDash(tab);
}
async function repeatOrder(id) {
  try { const r = await api('/api/orders/' + id + '/repeat', { method: 'POST' }); toast(r.message + ' Code : ' + r.code); loadDash('orders'); }
  catch (e) { toast(e.message, true); }
}
async function addFavorite(planId) {
  if (!user) return showAccount();
  try { await api('/api/orders/favorites', { method: 'POST', body: JSON.stringify({ plan_id: planId }) }); toast('⭐ Ajouté aux favoris.'); }
  catch (e) { toast(e.message, true); }
}
async function delFav(id) { try { await api('/api/orders/favorites/' + id, { method: 'DELETE' }); loadDash('favs'); } catch (e) { toast(e.message, true); } }

// Recharge de solde
function openTopup() {
  document.getElementById('topup-info').innerHTML = `💳 D17 : <b>${esc(config.d17_number || '—')}</b> • Flouci : <b>${esc(config.flouci_number || '—')}</b>`;
  document.getElementById('topup-modal').classList.add('open');
}
function closeTopup(e) { if (e) e.preventDefault(); document.getElementById('topup-modal').classList.remove('open'); }
async function submitTopup() {
  const msg = document.getElementById('topup-msg');
  try {
    const r = await api('/api/wallet/topup-request', { method: 'POST', body: JSON.stringify({
      amount: Number(document.getElementById('topup-amount').value),
      payment_method: document.getElementById('topup-pay').value,
      payment_ref: document.getElementById('topup-ref').value.trim() }) });
    msg.style.color = 'green'; msg.textContent = '✅ ' + r.message;
    setTimeout(() => { closeTopup(); loadDash('wallet'); }, 1200);
  } catch (e) { msg.style.color = 'red'; msg.textContent = '❌ ' + e.message; }
}

// ---------------- Admin ----------------
async function showAdmin() { goAdmin(); }
async function loadAdminStats() {
  try {
    const s = await api('/api/admin/stats');
    document.getElementById('admin-stats').innerHTML = `
      <div class="stat"><b>${fmt(s.today.s)}</b><span>Ventes aujourd'hui (${s.today.c} commandes)</span></div>
      <div class="stat"><b>${fmt(s.total.s)}</b><span>Ventes totales (${s.total.c} commandes)</span></div>
      <div class="stat"><b>${s.pendingUsers}</b><span>Comptes en attente ⏳</span></div>
      <div class="stat"><b>${s.clients}</b><span>Clients approuvés</span></div>
      <div class="stat"><b>${fmt(s.totalBalance)}</b><span>Solde total clients</span></div>
      <div class="stat"><b>${s.pendingOrders}</b><span>Commandes en attente</span></div>
      <div class="stat"><b>${s.pendingTopups}</b><span>Recharges solde à valider</span></div>`;
  } catch (e) { document.getElementById('admin-stats').innerHTML = `<p style="color:red">${esc(e.message)}</p>`; }
}
function adminTab(tab, btn) {
  document.querySelectorAll('#admin-tabs .tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  loadAdmin(tab);
}
async function loadAdmin(tab) {
  const box = document.getElementById('admin-content');
  box.innerHTML = 'Chargement…';
  try {
    if (tab === 'pending') {
      const { users } = await api('/api/admin/users?status=pending');
      box.innerHTML = users.length ? `<table><tr><th>Nom</th><th>Téléphone</th><th>Inscription</th><th>Actions</th></tr>
        ${users.map(u => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.phone)}</td><td class="small">${esc(new Date(u.created_at).toLocaleString('fr-FR'))}</td>
        <td><button class="btn small green" onclick="approveUser(${u.id})">✅ Approuver</button> <button class="btn small danger" onclick="rejectUser(${u.id})">✕ Refuser</button></td></tr>`).join('')}</table>`
        : '<p class="muted">✅ Aucun compte en attente.</p>';
    } else if (tab === 'topups') {
      const { topups } = await api('/api/admin/topups');
      box.innerHTML = topups.length ? `<table><tr><th>Client</th><th>Montant</th><th>Motif / référence</th><th>Date</th><th>Actions</th></tr>
        ${topups.map(w => `<tr><td><b>${esc(w.user_name)}</b><br><span class="muted small">${esc(w.phone)}</span></td><td><b>${fmt(w.amount)}</b></td><td>${esc(w.reason)}</td><td class="small">${esc(new Date(w.created_at).toLocaleString('fr-FR'))}</td>
        <td><button class="btn small green" onclick="confirmTopup(${w.id})">✅ Créditer</button> <button class="btn small danger" onclick="rejectTopup(${w.id})">✕ Refuser</button></td></tr>`).join('')}</table>`
        : '<p class="muted">Aucune demande de recharge de solde en attente.</p>';
    } else if (tab === 'orders') {
      const { orders } = await api('/api/admin/orders');
      box.innerHTML = orders.length ? `<table><tr><th>Code</th><th>Client / N°</th><th>Forfait</th><th>Paiement</th><th>Total</th><th>Statut</th><th>Action</th></tr>
        ${orders.map(o => `<tr><td><b>${esc(o.code)}</b><br><span class="muted small">${esc(new Date(o.created_at).toLocaleString('fr-FR'))}</span></td>
        <td>${esc(o.user_name || 'Invité')}<br><b>${esc(o.phone)}</b></td><td>${esc(o.plan_name)}<br><span class="muted small">${esc(o.operator)}</span></td>
        <td>${esc(o.payment_method)}${o.payment_ref ? '<br><span class="muted small">réf ' + esc(o.payment_ref) + '</span>' : ''}</td>
        <td>${fmt(o.total)}</td><td><span class="status ${o.status}">${o.status}</span></td>
        <td><select onchange="setOrderStatus(${o.id},this.value)"><option value="">Changer…</option>${['Pending', 'Processing', 'Completed', 'Cancelled'].map(s => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td></tr>`).join('')}</table>`
        : '<p class="muted">Aucune commande.</p>';
    } else if (tab === 'clients') {
      const { users } = await api('/api/admin/users');
      box.innerHTML = users.length ? `<table><tr><th>Client</th><th>Téléphone</th><th>Statut</th><th>Solde</th><th>Créditer / Débiter</th></tr>
        ${users.map(u => `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.phone)}</td><td><span class="status ${u.status}">${u.status}</span></td><td><b>${fmt(u.balance)}</b></td>
        <td><input id="bal-${u.id}" type="number" step="0.5" placeholder="+/- montant" style="width:110px"> <input id="why-${u.id}" placeholder="Motif" style="width:130px"> <button class="btn small" onclick="adjustBalance(${u.id})">Valider</button> <button class="btn small soft" onclick="viewWallet(${u.id},'${esc(u.name)}')">Historique</button></td></tr>`).join('')}</table>`
        : '<p class="muted">Aucun client.</p>';
    } else if (tab === 'plans') {
      const { plans: all } = await api('/api/admin/plans');
      box.innerHTML = `<p><button class="btn small" onclick="planForm()">＋ Nouveau forfait</button></p>
        <div id="plan-form"></div>
        <table><tr><th>Opérateur</th><th>Forfait</th><th>Data</th><th>Validité</th><th>Prix</th><th>Badge</th><th>Actif</th><th></th></tr>
        ${all.map(p => `<tr><td>${esc(OP_NAMES[p.operator])}</td><td><b>${esc(p.name_fr)}</b><br><span class="muted small">${esc(p.type)}${p.bonus ? ' • ' + esc(p.bonus) : ''}</span></td><td>${esc(p.data_label)}</td><td>${esc(p.validity_label || (p.validity_days + ' j'))}</td>
        <td><input id="price-${p.id}" type="number" step="0.1" value="${p.price}" style="width:90px"> DT</td><td>${esc(p.badge || '—')}</td><td>${p.active ? '✅' : '❌'}</td>
        <td><button class="btn small" onclick="savePrice(${p.id})">💾 Prix</button> <button class="btn small soft" onclick="planForm(${p.id})">✏️</button> <button class="btn small danger" onclick="disablePlan(${p.id})">Désactiver</button></td></tr>`).join('')}</table>`;
    } else if (tab === 'promos') {
      const { promos } = await api('/api/admin/promos');
      box.innerHTML = `<p><input id="promo-code" placeholder="CODE" style="width:140px"> <input id="promo-pct" type="number" placeholder="% remise" style="width:110px"> <input id="promo-max" type="number" placeholder="Max DT" style="width:100px"> <button class="btn small" onclick="createPromo()">＋ Créer</button></p>
        <table><tr><th>Code</th><th>Remise</th><th>Max</th><th>Description</th><th>Actif</th><th></th></tr>
        ${promos.map(p => `<tr><td><b>${esc(p.code)}</b></td><td>${p.percent}%</td><td>${fmt(p.max_discount)}</td><td>${esc(p.description_fr)}</td><td>${p.active ? '✅' : '❌'}</td><td><button class="btn small soft" onclick="togglePromo(${p.id})">Activer / Désactiver</button></td></tr>`).join('')}</table>`;
    } else if (tab === 'settings') {
      const { settings } = await api('/api/admin/settings');
      box.innerHTML = `<label>Numéro WhatsApp (format international, ex. 21655123456)</label><input id="set-wa" value="${esc(settings.whatsapp_number || '')}">
        <label>Numéro D17</label><input id="set-d17" value="${esc(settings.d17_number || '')}">
        <label>Numéro Flouci</label><input id="set-flouci" value="${esc(settings.flouci_number || '')}">
        <label>Montant minimum de recharge de solde (DT)</label><input id="set-min" type="number" value="${esc(settings.min_topup || '5')}">
        <label>Annonce (français)</label><input id="set-ann-fr" value="${esc(settings.announcement_fr || '')}">
        <label>Annonce (arabe)</label><input id="set-ann-ar" value="${esc(settings.announcement_ar || '')}">
        <button class="btn" style="margin-top:12px" onclick="saveSettings()">💾 Enregistrer les paramètres</button>`;
    }
  } catch (e) { box.innerHTML = `<p style="color:red">${esc(e.message)}</p>`; }
}
async function approveUser(id) { try { const r = await api('/api/admin/users/' + id + '/approve', { method: 'POST' }); toast(r.message); loadAdminStats(); loadAdmin('pending'); } catch (e) { toast(e.message, true); } }
async function rejectUser(id) { if (!confirm('Refuser ce compte ?')) return; try { const r = await api('/api/admin/users/' + id + '/reject', { method: 'POST' }); toast(r.message); loadAdminStats(); loadAdmin('pending'); } catch (e) { toast(e.message, true); } }
async function confirmTopup(id) { try { const r = await api('/api/admin/topups/' + id + '/confirm', { method: 'POST' }); toast(r.message); loadAdminStats(); loadAdmin('topups'); } catch (e) { toast(e.message, true); } }
async function rejectTopup(id) { if (!confirm('Refuser cette demande de recharge ?')) return; try { const r = await api('/api/admin/topups/' + id + '/reject', { method: 'POST' }); toast(r.message); loadAdmin('topups'); } catch (e) { toast(e.message, true); } }
async function adjustBalance(id) {
  const amount = Number(document.getElementById('bal-' + id).value);
  const reason = document.getElementById('why-' + id).value.trim();
  try { const r = await api('/api/admin/users/' + id + '/balance', { method: 'POST', body: JSON.stringify({ amount, reason }) }); toast(r.message); loadAdminStats(); loadAdmin('clients'); }
  catch (e) { toast(e.message, true); }
}
async function viewWallet(id, name) {
  try {
    const { user: u, transactions } = await api('/api/admin/users/' + id + '/wallet');
    openGeneric('👛 Solde — ' + name + ' : ' + fmt(u.balance), transactions.length
      ? `<table><tr><th>Date</th><th>Type</th><th>Motif</th><th>Montant</th><th>Admin</th></tr>${transactions.map(w => `<tr><td class="small">${esc(new Date(w.created_at).toLocaleString('fr-FR'))}</td><td>${esc(w.kind)}</td><td>${esc(w.reason)}</td><td style="color:${w.amount >= 0 ? 'green' : 'red'};font-weight:700">${w.amount >= 0 ? '+' : ''}${fmt(w.amount)}</td><td>${esc(w.admin_name || '—')}</td></tr>`).join('')}</table>`
      : '<p class="muted">Aucun mouvement.</p>');
  } catch (e) { toast(e.message, true); }
}
async function setOrderStatus(id, status) {
  if (!status) return;
  try { const r = await api('/api/admin/orders/' + id + '/status', { method: 'POST', body: JSON.stringify({ status }) }); toast(r.message); loadAdminStats(); loadAdmin('orders'); }
  catch (e) { toast(e.message, true); }
}
async function savePrice(id) {
  const price = Number(document.getElementById('price-' + id).value);
  try {
    const all = await api('/api/admin/plans');
    const p = all.plans.find(x => x.id === id);
    await api('/api/admin/plans/' + id, { method: 'PUT', body: JSON.stringify({ ...p, price }) });
    toast('Prix mis à jour : ' + fmt(price)); loadPlans();
  } catch (e) { toast(e.message, true); }
}
async function disablePlan(id) { if (!confirm('Désactiver ce forfait ?')) return; try { await api('/api/admin/plans/' + id, { method: 'DELETE' }); toast('Forfait désactivé.'); loadAdmin('plans'); loadPlans(); } catch (e) { toast(e.message, true); } }
function planForm(id) {
  const box = document.getElementById('plan-form');
  box.innerHTML = `<div style="background:var(--surface-muted);border-radius:12px;padding:14px;margin-bottom:12px">
    <b>${id ? 'Modifier le forfait #' + id : 'Nouveau forfait'}</b>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
      <select id="pf-op"><option value="tt">Tunisie Télécom</option><option value="ooredoo">Ooredoo</option><option value="orange">Orange</option></select>
      <select id="pf-type"><option>Internet</option><option>Crédit</option><option>Mixte</option></select>
      <input id="pf-name" placeholder="Nom (FR)"><input id="pf-name-ar" placeholder="Nom (AR)">
      <input id="pf-data" placeholder="Data (ex. 25 Go)"><input id="pf-mb" type="number" placeholder="Data en Mo (ex. 25000)">
      <input id="pf-valid" type="number" step="0.1" placeholder="Validité (jours)"><input id="pf-valid-label" placeholder="Validité affichée (ex. 30 jours)">
      <input id="pf-price" type="number" step="0.1" placeholder="Prix DT"><input id="pf-bonus" placeholder="Bonus vert (ex. Idéal clé / box mobile)">
      <input id="pf-badge" placeholder="Badge (ex. Populaire)"><input id="pf-old" type="number" step="0.1" placeholder="Ancien prix (promo)">
    </div>
    <button class="btn small" style="margin-top:10px" onclick="savePlan(${id || 0})">💾 Enregistrer</button></div>`;
}
async function savePlan(id) {
  const body = {
    operator: document.getElementById('pf-op').value, type: document.getElementById('pf-type').value,
    name_fr: document.getElementById('pf-name').value.trim(), name_ar: document.getElementById('pf-name-ar').value.trim(),
    data_label: document.getElementById('pf-data').value.trim(), data_mb: Number(document.getElementById('pf-mb').value) || 0,
    validity_days: Number(document.getElementById('pf-valid').value) || 0, validity_label: document.getElementById('pf-valid-label').value.trim(),
    bonus: document.getElementById('pf-bonus').value.trim(), price: Number(document.getElementById('pf-price').value),
    badge: document.getElementById('pf-badge').value.trim(), old_price: Number(document.getElementById('pf-old').value) || null,
    image: '/images/' + document.getElementById('pf-op').value + '.svg', featured: 0, active: 1,
  };
  try {
    if (id) await api('/api/admin/plans/' + id, { method: 'PUT', body: JSON.stringify(body) });
    else await api('/api/admin/plans', { method: 'POST', body: JSON.stringify(body) });
    toast('Forfait enregistré.'); loadAdmin('plans'); loadPlans();
  } catch (e) { toast(e.message, true); }
}
async function createPromo() {
  try {
    await api('/api/admin/promos', { method: 'POST', body: JSON.stringify({
      code: document.getElementById('promo-code').value.trim(),
      percent: Number(document.getElementById('promo-pct').value),
      max_discount: Number(document.getElementById('promo-max').value) || 0 }) });
    toast('Code promo créé.'); loadAdmin('promos');
  } catch (e) { toast(e.message, true); }
}
async function togglePromo(id) { try { await api('/api/admin/promos/' + id + '/toggle', { method: 'POST' }); loadAdmin('promos'); } catch (e) { toast(e.message, true); } }
async function saveSettings() {
  try {
    await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({
      whatsapp_number: document.getElementById('set-wa').value.trim(),
      d17_number: document.getElementById('set-d17').value.trim(),
      flouci_number: document.getElementById('set-flouci').value.trim(),
      min_topup: document.getElementById('set-min').value,
      announcement_fr: document.getElementById('set-ann-fr').value.trim(),
      announcement_ar: document.getElementById('set-ann-ar').value.trim() }) });
    toast('Paramètres enregistrés.'); loadConfig();
  } catch (e) { toast(e.message, true); }
}

// ---------------- Modales génériques ----------------
function openGeneric(title, html) {
  document.getElementById('generic-title').textContent = title;
  document.getElementById('generic-body').innerHTML = html;
  document.getElementById('generic-modal').classList.add('open');
}
function closeGeneric(e) { if (e) e.preventDefault(); document.getElementById('generic-modal').classList.remove('open'); }

// ---------------- Init ----------------
document.addEventListener('DOMContentLoaded', async () => {
  if (lang === 'ar') { document.documentElement.lang = 'ar'; document.documentElement.dir = 'rtl'; document.getElementById('lang-btn').textContent = 'Français'; }
  await loadConfig();
  await loadPlans();
  if (token) { await refreshMe(); }
  syncAuthUI();
  document.querySelectorAll('.modal-back').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); }));
});
