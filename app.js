(() => {
'use strict';

/* ---------- config ---------- */
const SB_URL = 'https://derfmcoyspwtgdixcdtw.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRlcmZtY295c3B3dGdkaXhjZHR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NDc2MDksImV4cCI6MjEwOTAyMzYwOX0.bVfi2HUKc99AE6rAVM6b1CSMsxODQdPrNnIQFJwJr-U';
const sb = window.supabase.createClient(SB_URL, SB_KEY, {
  auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const CATS = ['Bags & Accessories', 'Footwear', 'Mats & Floor Coverings', 'Home & Decor', 'Other'];
const FULFIL = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const ORDER_ST = ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const CH_ST = ['researching', 'not_started', 'applied', 'approved', 'listed', 'blocked', 'rejected'];
const CH_TYPES = [['marketplace', 'Marketplace'], ['retail', 'Retail partner'], ['b2b', 'B2B platform'], ['regional', 'Regional marketplace']];
const ROLE_LABEL = { maker: 'Maker', producer: 'Material producer', buyer: 'Buyer', admin: 'Administrator' };

const state = { user: null, profile: null };
let token = 0;
const $ = s => document.querySelector(s);

/* ---------- html helpers (auto-escaping) ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const part = v => v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : (v === null || v === undefined || v === false) ? '' : esc(v);
const html = (st, ...v) => new Safe(st.reduce((o, s, i) => o + part(v[i - 1]) + s));
const raw = s => new Safe(s);

const naira = n => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
const dt = x => x ? new Date(x).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const label = s => String(s || '').replace(/_/g, ' ');
const badge = s => html`<span class="badge b-${s}">${label(s)}</span>`;
const nameOf = p => p ? (p.business_name || p.full_name || 'Member') : '';
const safeImg = u => String(u || '').startsWith('https://') ? u : '';
const one = x => Array.isArray(x) ? x[0] : x;

const fld = (lbl, control, hint) => html`<label class="field"><span>${lbl}</span>${control}${hint ? html`<small>${hint}</small>` : ''}</label>`;
const inp = (name, o = {}) => html`<input name="${name}" type="${o.type || 'text'}" value="${o.value ?? ''}" ${o.required ? 'required' : ''} ${o.min != null ? html`min="${o.min}"` : ''} ${o.max != null ? html`max="${o.max}"` : ''} ${o.step ? html`step="${o.step}"` : ''} ${o.maxlength ? html`maxlength="${o.maxlength}"` : ''} ${o.minlength ? html`minlength="${o.minlength}"` : ''} ${o.placeholder ? html`placeholder="${o.placeholder}"` : ''} autocomplete="${o.ac || 'off'}">`;
const area = (name, v, o = {}) => html`<textarea name="${name}" ${o.required ? 'required' : ''} maxlength="${o.maxlength || 2000}" ${o.placeholder ? html`placeholder="${o.placeholder}"` : ''}>${v ?? ''}</textarea>`;
const sel = (name, list, selected, o = {}) => html`<select name="${name}" ${o.required ? 'required' : ''} ${o.attrs ? raw(o.attrs) : ''}>${list.map(i => { const [v, l] = Array.isArray(i) ? i : [i, label(i)]; return html`<option value="${v}" ${String(v) === String(selected) ? 'selected' : ''}>${l}</option>`; })}</select>`;
const note = (msg, kind = '') => html`<div class="notice ${kind}" role="${kind === 'err' ? 'alert' : 'status'}">${msg}</div>`;
const empty = (title, text, cta) => html`<div class="empty"><h3>${title}</h3><p>${text}</p>${cta ? html`<p style="margin-top:16px">${cta}</p>` : ''}</div>`;
const loadingHTML = html`<div class="loading" role="status">Loading…</div>`;

function toast(msg, err) {
  const old = $('.toast'); if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.setAttribute('role', err ? 'alert' : 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), err ? 6000 : 3500);
}
function friendly(err) {
  const m = (err && err.message) || String(err);
  if (/row-level security/i.test(m)) return 'You do not have permission to do that. If your account is still waiting for approval, this will open up once the team approves it.';
  if (/duplicate key/i.test(m)) return 'That already exists.';
  if (/Invalid login/i.test(m)) return 'Email or password is not correct.';
  if (/Email not confirmed/i.test(m)) return 'Please confirm your email first. Check your inbox for the link.';
  if (/Not enough stock|not available|Only an administrator/i.test(m)) return m;
  if (/rate limit/i.test(m)) return 'Too many attempts. Please wait a minute and try again.';
  return m;
}
const q = async p => { const { data, error } = await p; if (error) throw error; return data; };
async function count(table, f) {
  let b = sb.from(table).select('id', { count: 'exact', head: true });
  if (f) b = f(b);
  const { count: c, error } = await b; if (error) throw error; return c || 0;
}

/* ---------- cart ---------- */
let memCart = [];
const cartGet = () => { try { const v = JSON.parse(localStorage.getItem('recraft_cart') || '[]'); return Array.isArray(v) ? v.filter(i => i && typeof i.id === 'string' && Number.isInteger(i.qty) && i.qty > 0) : []; } catch (e) { return memCart; } };
const cartSet = c => { memCart = c; try { localStorage.setItem('recraft_cart', JSON.stringify(c)); } catch (e) { /* storage unavailable */ } renderHeader(); };
const cartCount = () => cartGet().reduce((a, i) => a + i.qty, 0);

/* ---------- layout ---------- */
function renderHeader() {
  const u = state.user, n = cartCount();
  $('#hdr').innerHTML = html`<div class="wrap">
    <a class="brand" href="#/">Benin <b>Re</b>Craft</a>
    <button class="btn alt sm burger" data-act="burger" aria-expanded="false" aria-controls="nav">Menu</button>
    <nav class="nav" id="nav" aria-label="Main">
      <a href="#/shop">Shop</a><a href="#/directory">Directory</a><a href="#/about">About</a><a href="#/join">Contact</a>
      <a href="#/cart">Cart${n ? ` (${n})` : ''}</a>
      ${u ? html`<a href="#/app">Dashboard</a><button class="btn alt sm" data-act="logout">Sign out</button>` : html`<a href="#/login">Sign in</a><a class="btn sm" href="#/signup">Join</a>`}
    </nav></div>`.toString();
  markNav();
}
function markNav() {
  const first = location.hash.replace(/^#[/]?/, '').split(/[/?]/)[0];
  document.querySelectorAll('#nav a[href^="#/"]').forEach(a => {
    const k = a.getAttribute('href').split('/')[1];
    a.classList.toggle('on', k === first && k !== '');
  });
}
function renderFooter() {
  $('#ftr').innerHTML = html`<div class="wrap"><div class="cols">
    <div><h4 class="serif">Benin ReCraft</h4><p>Recycled craft from Benin City to the world. A market-linkage project connecting makers, material suppliers and buyers.</p><p>Benin City, Edo State, Nigeria</p></div>
    <div><h4 class="serif">Explore</h4><a href="#/shop">Shop</a><a href="#/directory">Directory</a><a href="#/about">About the project</a></div>
    <div><h4 class="serif">Get involved</h4><a href="#/signup">Create an account</a><a href="#/join?kind=wholesale">Wholesale and corporate orders</a><a href="#/join">Contact us</a></div>
  </div></div>`.toString();
}
function setMain(c, t = token) {
  if (t !== token) return false;
  $('#main').innerHTML = String(c);
  return true;
}
function setTitle(t) { document.title = t ? `${t} | Benin ReCraft` : 'Benin ReCraft | Recycled craft from Benin City'; }

/* ---------- decorative weave ---------- */
function weave() {
  const n = 10, s = 40; let r = '';
  const h = ['#1F3864', '#0E7C7B'], v = ['#B08D57', '#1F3864', '#0E7C7B'];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if ((x + y) % 2 === 0) r += `<rect x="${x * s}" y="${y * s + 6}" width="${s}" height="${s - 12}" fill="${h[y % 2]}"/>`;
    else r += `<rect x="${x * s + 6}" y="${y * s}" width="${s - 12}" height="${s}" fill="${v[x % 3]}"/>`;
  }
  return raw(`<svg class="weave" viewBox="0 0 400 400" aria-hidden="true" focusable="false"><rect width="400" height="400" fill="#F4F6F9"/>${r}</svg>`);
}

/* ---------- auth/session ---------- */
async function loadSession() {
  const { data: { session } } = await sb.auth.getSession();
  state.user = session ? session.user : null;
  state.profile = null;
  if (state.user) {
    const { data } = await sb.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
    state.profile = data;
  }
  renderHeader();
}

/* ---------- router ---------- */
const parse = () => {
  const h = location.hash.replace(/^#[/]?/, ''); const [p, qs] = h.split('?');
  return { seg: p.split('/').filter(Boolean), q: new URLSearchParams(qs || '') };
};
async function router(keepScroll) {
  const t = ++token; const { seg, q: qs } = parse();
  if (!keepScroll) window.scrollTo(0, 0);
  markNav();
  const nav = $('#nav'); if (nav) nav.classList.remove('open');
  try {
    switch (seg[0]) {
      case undefined: return await home();
      case 'shop': return await shop(qs);
      case 'product': return await product(seg[1]);
      case 'directory': return await directory(qs);
      case 'about': return about();
      case 'join': return join(qs);
      case 'contact': return join(new URLSearchParams('kind=contact'));
      case 'cart': return await cart();
      case 'checkout': return await checkout();
      case 'login': return login(qs);
      case 'signup': return signup(qs);
      case 'reset': return resetPage();
      case 'app': return await dash(seg.slice(1));
      default: return setMain(empty('Page not found', 'That page does not exist.', html`<a class="btn" href="#/">Go to the home page</a>`), t);
    }
  } catch (e) {
    console.error(e);
    setMain(html`<div class="wrap sec">${note('Something went wrong: ' + friendly(e), 'err')}<a class="btn alt" href="#/">Back to home</a></div>`, t);
  }
}

/* ---------- public pages ---------- */
const prodCard = p => html`<a class="prod" href="#/product/${p.id}">
  <div class="ph">${safeImg(p.image_url) ? html`<img src="${safeImg(p.image_url)}" alt="${p.name}" loading="lazy">` : 'No photo yet'}</div>
  <div class="in"><h4>${p.name}</h4><div class="muted small">${nameOf(p.profiles)}</div><div class="price">${naira(p.price)}</div></div></a>`;

function swatch(k) {
const o = (body, bg) => raw(`<svg viewBox="0 0 200 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="200" height="160" fill="${bg}"/>${body}</svg>`);
let r = '';
if (k === 'rubber') { for (let y = 0; y < 9; y++) r += `<polyline points="-4,${y * 20 + 14} 100,${y * 20 - 6} 204,${y * 20 + 14}" fill="none" stroke="#3b4354" stroke-width="7"/>`; return o(r, '#1B1F27'); }
if (k === 'textile') { const c = ['#B08D57', '#0E7C7B', '#C23B2A', '#F4F6F9', '#1F3864']; for (let i = 0; i < 5; i++) r += `<rect x="${i * 40}" width="40" height="160" fill="${c[i]}"/>`; r += '<line x1="0" y1="80" x2="200" y2="80" stroke="#fff" stroke-width="2" stroke-dasharray="6 7"/>'; return o(r, '#fff'); }
if (k === 'woven') { for (let y = 0; y < 7; y++) for (let x = 0; x < 9; x++) { r += (x + y) % 2 === 0 ? `<rect x="${x * 24 + 1}" y="${y * 24 + 6}" width="24" height="12" fill="${y % 2 ? '#0E7C7B' : '#1F3864'}"/>` : `<rect x="${x * 24 + 6}" y="${y * 24 + 1}" width="12" height="24" fill="${x % 3 ? '#B08D57' : '#C23B2A'}"/>`; } return o(r, '#F4F6F9'); }
if (k === 'caps') { const c = ['#C23B2A', '#B08D57', '#F4F6F9']; for (let y = 0; y < 5; y++) for (let x = 0; x < 6; x++) { const cx = x * 38 + (y % 2 ? 38 : 19), cy = y * 34 + 14, f = c[(x + y) % 3]; r += `<circle cx="${cx}" cy="${cy}" r="16" fill="${f}"/><circle cx="${cx}" cy="${cy}" r="9" fill="none" stroke="#0A5E5D" stroke-width="2"/>`; } return o(r, '#0E7C7B'); }
if (k === 'twine') { for (let y = 0; y < 9; y++) r += `<path d="M-10 ${y * 20 + 10} Q 15 ${y * 20 - 4} 40 ${y * 20 + 10} T 90 ${y * 20 + 10} T 140 ${y * 20 + 10} T 190 ${y * 20 + 10} T 240 ${y * 20 + 10}" fill="none" stroke="#8A6A3A" stroke-width="6"/>`; return o(r, '#DCC9A4'); }
for (let i = 0; i < 22; i++) r += `<line x1="${i * 14 - 160}" y1="160" x2="${i * 14}" y2="0" stroke="#4A6EA8" stroke-width="2.5"/>`;
return o(r, '#2C4A7C');
}
function edge(fg) {
let r = '';
for (let i = 0; i < 60; i++) r += `<rect x="${i * 24 + 4}" y="4" width="16" height="16" transform="rotate(45 ${i * 24 + 12} 12)" fill="${fg}"/>`;
return raw(`<svg class="trim" viewBox="0 0 1440 24" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${r}</svg>`);
}
async function home() {
const t = token; setTitle('');
setMain(html`<div class="wrap">${loadingHTML}</div>`, t);
const [prods, mk, pr, pc] = await Promise.all([
q(sb.from('products').select('id,name,price,image_url,profiles(full_name,business_name)').eq('status', 'published').order('created_at', { ascending: false }).limit(4)),
count('profiles', b => b.eq('role', 'maker').eq('status', 'approved')),
count('profiles', b => b.eq('role', 'producer').eq('status', 'approved')),
count('products', b => b.eq('status', 'published'))
]);
const mats = [['rubber', 'Tyre rubber'], ['textile', 'Textile offcuts'], ['woven', 'Woven sacks'], ['caps', 'Bottle caps'], ['twine', 'Twine and rope'], ['denim', 'Old denim']];
const turns = [['rubber', 'Tyre rubber', 'Sandals and slides'], ['textile', 'Textile offcuts', 'Bags and pouches'], ['woven', 'Woven sacks', 'Floor mats and rugs'], ['caps', 'Bottle caps and twine', 'Home decor']];
setMain(html`
<section class="h2"><div class="wrap h2g">
<div class="h2t">
<h1>Tyres become sandals. Offcuts become bags.</h1>
<p class="lede">Benin ReCraft links the makers who work with recycled materials to the people who supply them, then carries the finished goods from Benin City to buyers around the world.</p>
<div class="row" style="margin-top:32px"><a class="btn gold" href="#/shop">Shop products</a><a class="btn ghost" href="#/signup">Join as a maker or supplier</a></div>
</div>
<div class="sw" role="list" aria-label="Recycled materials the makers work with">${mats.map(([k, n]) => html`<figure role="listitem">${swatch(k)}<figcaption>${n}</figcaption></figure>`)}</div>
</div>${edge('#B08D57')}</section>
<section class="sec"><div class="wrap">
<h2>What the materials become</h2>
<ul class="tf">${turns.map(([k, a, b]) => html`<li><span class="chip2">${swatch(k)}</span><p>${a}<span>becomes</span>${b}</p></li>`)}</ul>
</div></section>
<section class="sec chalk"><div class="wrap">
<div class="pagehead"><h2 style="margin:0">New in the shop</h2><a href="#/shop">See all products</a></div>
${prods.length ? html`<div class="grid g4">${prods.map(prodCard)}</div>` : empty('The first collections are on their way', 'Makers are preparing their first products. Join now to be among the first to list or buy.', html`<a class="btn" href="#/signup">Create an account</a>`)}
${(mk + pr + pc) > 0 ? html`<p class="muted" style="margin-top:24px">${mk} maker${mk === 1 ? '' : 's'}, ${pr} material supplier${pr === 1 ? '' : 's'} and ${pc} product${pc === 1 ? '' : 's'} on the platform so far.</p>` : ''}
</div></section>
<section class="her">${edge('#B08D57')}<div class="wrap"><p>Benin City has been known for its craft for centuries. ReCraft adds a new material to that story: what everyone else throws away.</p></div>${edge('#B08D57')}</section>
<section class="sec"><div class="wrap"><h2>From material to market</h2>
<ol class="steps">
<li><b>Map</b><span>Find makers and material suppliers across Benin City.</span></li>
<li><b>Match</b><span>Link suppliers to the makers who need their materials.</span></li>
<li><b>Make</b><span>Makers create products that carry Benin art and culture.</span></li>
<li><b>List</b><span>Products go on this shop and on partner marketplaces.</span></li>
<li><b>Ship</b><span>Orders are packed and sent locally and abroad.</span></li>
<li><b>Scale</b><span>Sales feedback shapes new products and brings in more makers.</span></li>
</ol></div></section>
<section class="aud">
<div class="p-teal"><h3>Makers</h3><p>List your bags, shoes, mats and other goods, ask suppliers for recycled materials, and receive orders in one place.</p><a class="btn" href="#/signup?role=maker">Join as a maker</a></div>
<div class="p-navy"><h3>Material suppliers</h3><p>Show what recycled materials you produce, how much, and at what price, and get matched with makers who need them.</p><a class="btn" href="#/signup?role=producer">Join as a supplier</a></div>
<div class="p-coral"><h3>Buyers</h3><p>Buy distinctive, sustainably made products from Benin City, or ask about wholesale and corporate gifting.</p><a class="btn" href="#/join?kind=wholesale">Ask about wholesale</a></div>
</section>`, t);
}
async function shop(qs) {
  const t = token; setTitle('Shop');
  const cat = qs.get('cat') || '', s = (qs.get('s') || '').trim().toLowerCase();
  setMain(html`<div class="wrap sec tight">${loadingHTML}</div>`, t);
  let b = sb.from('products').select('id,name,price,image_url,category,description,profiles(full_name,business_name)').eq('status', 'published').order('created_at', { ascending: false }).limit(200);
  if (cat) b = b.eq('category', cat);
  let list = await q(b);
  if (s) list = list.filter(p => (p.name + ' ' + (p.description || '')).toLowerCase().includes(s));
  setMain(html`<div class="wrap sec tight">
    <div class="pagehead"><h1>Shop</h1></div>
    <form class="filters" data-form="shopfilter">
      ${fld('Category', sel('cat', [['', 'All categories'], ...CATS.map(c => [c, c])], cat))}
      ${fld('Search', inp('s', { value: qs.get('s') || '', placeholder: 'Bag, mat, sandals…' }))}
      <button class="btn" type="submit">Apply</button>
    </form>
    ${list.length ? html`<div class="grid g4">${list.map(prodCard)}</div>` : empty('No products found', cat || s ? 'Try a different category or search.' : 'No products have been published yet. Please check back soon.')}
  </div>`, t);
}

async function product(id) {
  const t = token;
  setMain(html`<div class="wrap sec tight">${loadingHTML}</div>`, t);
  const p = await q(sb.from('products').select('*,profiles(full_name,business_name,location,bio)').eq('id', id).maybeSingle());
  if (!p) { setMain(html`<div class="wrap sec">${empty('Product not found', 'It may have been removed or is not published yet.', html`<a class="btn" href="#/shop">Back to the shop</a>`)}</div>`, t); return; }
  setTitle(p.name);
  const inCart = (cartGet().find(i => i.id === p.id) || {}).qty || 0;
  setMain(html`<div class="wrap sec tight">
    <p class="small"><a href="#/shop">← All products</a></p>
    <div class="pdp">
      <div class="big">${safeImg(p.image_url) ? html`<img src="${safeImg(p.image_url)}" alt="${p.name}">` : 'No photo yet'}</div>
      <div>
        ${p.status !== 'published' ? note(html`This product is ${badge(p.status)} and only visible to you and the team.`) : ''}
        <h1 style="font-size:var(--t-2xl)">${p.name}</h1>
        <p class="muted">${p.category} · by ${nameOf(p.profiles)}${p.profiles && p.profiles.location ? ', ' + p.profiles.location : ''}</p>
        <p class="price" style="font-size:var(--t-xl)">${naira(p.price)}</p>
        ${p.description ? html`<p>${p.description}</p>` : ''}
        <dl class="kv">
          ${p.materials_used ? html`<dt>Made from</dt><dd>${p.materials_used}</dd>` : ''}
          <dt>In stock</dt><dd>${p.stock > 0 ? p.stock + ' available' : 'Out of stock'}</dd>
        </dl>
        ${p.status === 'published' && p.stock > 0 ? html`<div class="row">
          <label class="field" style="width:110px"><span>Quantity</span><input id="qty" type="number" min="1" max="${p.stock}" value="1"></label>
          <button class="btn" data-act="addCart" data-id="${p.id}" data-stock="${p.stock}" style="align-self:flex-end">Add to cart</button>
        </div>${inCart ? html`<p class="small muted">You already have ${inCart} in your cart. <a href="#/cart">View cart</a></p>` : ''}` : ''}
        ${p.culture_story ? html`<h3 style="margin-top:32px">The story behind it</h3><p>${p.culture_story}</p>` : ''}
        ${p.profiles && p.profiles.bio ? html`<h3 style="margin-top:24px">About the maker</h3><p>${p.profiles.bio}</p>` : ''}
      </div>
    </div></div>`, t);
}

async function directory(qs) {
  const t = token; setTitle('Directory');
  const tab = qs.get('tab') === 'materials' ? 'materials' : 'makers';
  setMain(html`<div class="wrap sec tight">${loadingHTML}</div>`, t);
  const tabs = html`<div class="tabs" role="tablist"><button class="${tab === 'makers' ? 'on' : ''}" data-act="go" data-to="#/directory">Makers</button><button class="${tab === 'materials' ? 'on' : ''}" data-act="go" data-to="#/directory?tab=materials">Recycled materials</button></div>`;
  let body;
  if (tab === 'makers') {
    const list = await q(sb.from('profiles').select('id,full_name,business_name,location,bio,specialties').eq('role', 'maker').eq('status', 'approved').order('created_at', { ascending: false }).limit(200));
    body = list.length ? html`<div class="grid g3">${list.map(m => html`<div class="card"><h3>${nameOf(m)}</h3><p class="muted small">${m.location || 'Benin City'}</p>${m.bio ? html`<p>${m.bio}</p>` : ''}<div class="chips">${(m.specialties || []).map(s => html`<span class="chip">${s}</span>`)}</div></div>`)}</div>`
      : empty('No makers listed yet', 'Approved makers appear here. If you make bags, shoes, mats or other goods, join the platform.', html`<a class="btn" href="#/signup?role=maker">Join as a maker</a>`);
  } else {
    const list = await q(sb.from('materials').select('*,profiles(full_name,business_name,location)').eq('status', 'active').order('created_at', { ascending: false }).limit(200));
    const canRequest = state.profile && state.profile.role === 'maker' && state.profile.status === 'approved';
    body = list.length ? html`<div class="grid g3">${list.map(m => html`<div class="card"><h3>${m.name}</h3><p class="muted small">${m.material_type} · ${nameOf(m.profiles)}${m.location ? ', ' + m.location : ''}</p>${m.description ? html`<p>${m.description}</p>` : ''}
      <dl class="kv"><dt>Available</dt><dd>${Number(m.quantity).toLocaleString()} ${m.unit}</dd><dt>Price</dt><dd>${m.price_per_unit != null ? naira(m.price_per_unit) + ' per ' + m.unit : 'Ask the supplier'}</dd></dl>
      ${canRequest ? html`<details class="more"><summary>Request this material</summary>
        <form class="form wide" data-form="request" data-id="${m.id}" style="margin-top:12px">
          ${fld('Quantity (' + m.unit + ')', inp('quantity', { type: 'number', min: 0.01, step: 'any', required: true }))}
          ${fld('Message to the supplier', area('message', '', { maxlength: 1000, placeholder: 'What will you make, and when do you need it?' }))}
          <button class="btn sm" type="submit">Send request</button></form></details>`
        : (!state.user ? html`<p class="small muted"><a href="#/login?next=${encodeURIComponent('directory?tab=materials')}">Sign in</a> as an approved maker to request materials.</p>` : '')}
    </div>`)}</div>`
      : empty('No materials listed yet', 'Suppliers of recycled materials appear here once approved.', html`<a class="btn" href="#/signup?role=producer">Join as a supplier</a>`);
  }
  setMain(html`<div class="wrap sec tight"><div class="pagehead"><h1>Directory</h1></div>${tabs}${body}</div>`, t);
}

function about() {
  setTitle('About'); const t = token;
  setMain(html`<div class="wrap sec"><div class="stack" style="max-width:760px">
    <h1>About Benin ReCraft</h1><hr class="rule">
    <p class="lede">The makers, the materials and the marketplaces already exist. What is missing is the link between them.</p>
    <p>Benin ReCraft connects craftspeople in Benin City who make bags, shoes, mats and other goods with the producers of recycled materials. It then connects both to e-commerce and retail partners, so that finished products reach buyers far beyond Benin City.</p>
    <h2 style="margin-top:32px">What we want to achieve</h2>
    <p>We want to push products made in Benin City to the rest of the world: boosting cultural heritage, earning revenue for makers and suppliers, and introducing Benin art and culture to new audiences through everyday products.</p>
    <h2 style="margin-top:32px">How the platform helps</h2>
    <ul>
      <li>Makers list products, request recycled materials and manage orders.</li>
      <li>Material suppliers list what they have, with quantities and prices, and respond to maker requests.</li>
      <li>Buyers shop retail or ask about wholesale and corporate orders.</li>
      <li>The project team approves members and products, tracks orders, and builds sales routes with online marketplaces and retail partners.</li>
    </ul>
    <p><a class="btn" href="#/signup">Join the platform</a> <a class="btn alt" href="#/join">Contact the team</a></p>
  </div></div>`, t);
}

function join(qs) {
  const t = token; setTitle('Contact');
  const kinds = [['contact', 'General question'], ['maker_interest', 'I am a maker'], ['producer_interest', 'I supply recycled materials'], ['buyer_interest', 'I want to buy'], ['wholesale', 'Wholesale or corporate order']];
  const k = kinds.some(x => x[0] === qs.get('kind')) ? qs.get('kind') : 'contact';
  setMain(html`<div class="wrap sec"><div style="max-width:640px">
    <h1>Contact us</h1><hr class="rule">
    <p>Send us a message and the project team will reply by email.</p>
    <form class="form" data-form="inquiry">
      ${fld('What is this about?', sel('kind', kinds, k))}
      ${fld('Your name', inp('name', { required: true, maxlength: 120, ac: 'name' }))}
      <div class="two">${fld('Email', inp('email', { type: 'email', required: true, maxlength: 200, ac: 'email' }))}${fld('Phone (optional)', inp('phone', { type: 'tel', maxlength: 40, ac: 'tel' }))}</div>
      ${fld('Message', area('message', '', { required: true, maxlength: 2000 }))}
      <div><button class="btn" type="submit">Send message</button></div>
    </form></div></div>`, t);
}

/* ---------- cart & checkout ---------- */
async function cart() {
  const t = token; setTitle('Cart');
  setMain(html`<div class="wrap sec tight">${loadingHTML}</div>`, t);
  let items = cartGet(); let rows = [];
  if (items.length) {
    const ps = await q(sb.from('products').select('id,name,price,stock,image_url,status').in('id', items.map(i => i.id)));
    const map = Object.fromEntries(ps.map(p => [p.id, p]));
    rows = items.map(i => ({ ...i, p: map[i.id] })).filter(r => r.p && r.p.status === 'published');
    if (rows.length !== items.length) cartSet(rows.map(r => ({ id: r.id, qty: r.qty })));
  }
  const total = rows.reduce((a, r) => a + r.qty * Number(r.p.price), 0);
  setMain(html`<div class="wrap sec tight"><div class="pagehead"><h1>Your cart</h1></div>
    ${rows.length ? html`<div>${rows.map(r => html`<div class="cartrow">
      ${safeImg(r.p.image_url) ? html`<img class="thumb" style="width:64px;height:64px" src="${safeImg(r.p.image_url)}" alt="">` : html`<div class="thumb" style="width:64px;height:64px"></div>`}
      <div><a href="#/product/${r.p.id}"><strong>${r.p.name}</strong></a><div class="muted small">${naira(r.p.price)} each · ${r.p.stock} in stock</div>
        <div class="row" style="margin-top:8px"><span class="qty"><button data-act="cartDec" data-id="${r.id}" aria-label="Decrease quantity">−</button><span>${r.qty}</span><button data-act="cartInc" data-id="${r.id}" data-stock="${r.p.stock}" aria-label="Increase quantity">+</button></span>
        <button class="btn alt sm" data-act="cartRemove" data-id="${r.id}">Remove</button></div></div>
      <div class="price">${naira(r.qty * Number(r.p.price))}</div></div>`)}
      <div class="row between" style="margin-top:24px"><span class="serif" style="font-size:var(--t-lg)">Total: <strong>${naira(total)}</strong></span><a class="btn" href="#/checkout">Go to checkout</a></div></div>`
      : empty('Your cart is empty', 'Browse the shop to find something you like.', html`<a class="btn" href="#/shop">Shop products</a>`)}
  </div>`, t);
}

async function checkout() {
  const t = token; setTitle('Checkout');
  if (!state.user) { location.hash = '#/login?next=checkout'; return; }
  const items = cartGet();
  if (!items.length) { location.hash = '#/cart'; return; }
  const p = state.profile;
  if (!p || p.status !== 'approved') { setMain(html`<div class="wrap sec">${note('Your account must be approved before you can place orders.', 'err')}</div>`, t); return; }
  setMain(html`<div class="wrap sec tight"><div class="pagehead"><h1>Checkout</h1></div>
    ${note('No payment is taken on this page. After you place the order, the team confirms stock and contacts you by email with payment and delivery details.')}
    <form class="form" data-form="checkout">
      ${fld('Order type', sel('order_type', [['retail', 'Retail'], ['wholesale', 'Wholesale or corporate']], 'retail'))}
      ${fld('Full name', inp('shipping_name', { required: true, value: p.full_name, maxlength: 120, ac: 'name' }))}
      ${fld('Phone', inp('shipping_phone', { type: 'tel', maxlength: 40, ac: 'tel' }))}
      ${fld('Delivery address', area('shipping_address', '', { required: true, maxlength: 500 }))}
      ${fld('Country', inp('country', { required: true, value: 'Nigeria', maxlength: 80, ac: 'country-name' }))}
      ${fld('Note (optional)', area('note', '', { maxlength: 1000 }))}
      <div class="row"><button class="btn" type="submit">Place order</button><a class="btn alt" href="#/cart">Back to cart</a></div>
    </form></div>`, t);
}

/* ---------- auth pages ---------- */
function login(qs) {
  const t = token; setTitle('Sign in');
  const err = location.hash.includes('error_description') ? note('That email link is invalid or has expired. Please sign in, or request a new link.', 'err') : '';
  setMain(html`<div class="wrap sec"><div style="max-width:440px">
    <h1>Sign in</h1><hr class="rule">${err}
    <form class="form" data-form="login" data-next="${qs.get('next') || ''}">
      ${fld('Email', inp('email', { type: 'email', required: true, ac: 'email' }))}
      ${fld('Password', inp('password', { type: 'password', required: true, ac: 'current-password' }))}
      <div class="row"><button class="btn" type="submit">Sign in</button><a href="#/signup">Create an account</a></div>
    </form>
    <details class="more" style="margin-top:24px"><summary>Forgot your password?</summary>
      <form class="form" data-form="forgot" style="margin-top:12px">${fld('Email', inp('email', { type: 'email', required: true, ac: 'email' }))}<div><button class="btn alt" type="submit">Send reset link</button></div></form></details>
  </div></div>`, t);
}
function signup(qs) {
  const t = token; setTitle('Create account');
  const r = ['maker', 'producer', 'buyer'].includes(qs.get('role')) ? qs.get('role') : 'maker';
  const pick = (v, title, desc) => html`<label><input type="radio" name="role" value="${v}" ${v === r ? 'checked' : ''}><strong>${title}</strong><small>${desc}</small></label>`;
  setMain(html`<div class="wrap sec"><div style="max-width:640px">
    <h1>Create your account</h1><hr class="rule">
    <form class="form" data-form="signup">
      <fieldset style="border:0;padding:0;margin:0"><legend class="serif" style="color:var(--navy);font-weight:700;margin-bottom:8px">I am joining as</legend>
        <div class="rolepick">${pick('maker', 'A maker', 'I make bags, shoes, mats or other goods')}${pick('producer', 'A material supplier', 'I produce recycled materials')}${pick('buyer', 'A buyer', 'I want to buy products')}</div></fieldset>
      ${fld('Full name', inp('full_name', { required: true, maxlength: 120, ac: 'name' }))}
      ${fld('Business or workshop name (optional)', inp('business_name', { maxlength: 120, ac: 'organization' }))}
      <div class="two">${fld('Location', inp('location', { maxlength: 120, placeholder: 'Benin City', ac: 'address-level2' }))}${fld('Phone', inp('phone', { type: 'tel', maxlength: 40, ac: 'tel' }))}</div>
      ${fld('Email', inp('email', { type: 'email', required: true, ac: 'email' }))}
      ${fld('Password', inp('password', { type: 'password', required: true, minlength: 8, ac: 'new-password' }), 'At least 8 characters.')}
      <p class="small muted">Makers and suppliers are reviewed by the team before they can list products or materials. Buyers can order straight away.</p>
      <div class="row"><button class="btn" type="submit">Create account</button><a href="#/login">I already have an account</a></div>
    </form></div></div>`, t);
}
function resetPage() {
  const t = token; setTitle('Reset password');
  setMain(html`<div class="wrap sec"><div style="max-width:440px"><h1>Choose a new password</h1><hr class="rule">
    <form class="form" data-form="reset">${fld('New password', inp('password', { type: 'password', required: true, minlength: 8, ac: 'new-password' }), 'At least 8 characters.')}<div><button class="btn" type="submit">Save password</button></div></form></div></div>`, t);
}

/* ---------- dashboard ---------- */
function navItems() {
  const r = state.profile.role; const items = [['', 'Overview']];
  if (r === 'maker') items.push(['products', 'My products'], ['requests', 'Material requests'], ['fulfil', 'Orders to fulfil']);
  if (r === 'producer') items.push(['materials', 'My materials'], ['requests', 'Requests from makers']);
  if (r === 'admin') items.push(['admin/approvals', 'Approvals'], ['admin/products', 'Product review'], ['admin/orders', 'All orders'], ['admin/matches', 'Material matches'], ['admin/partners', 'Partner channels'], ['admin/inquiries', 'Inquiries']);
  if (r !== 'admin') items.push(['orders', 'My orders']);
  items.push(['profile', 'Profile']);
  return items;
}
async function dash(seg) {
  const t = token; setTitle('Dashboard');
  if (!state.user) { location.hash = '#/login?next=app'; return; }
  if (!state.profile) { setMain(html`<div class="wrap sec">${note('We could not load your profile. Try signing out and back in.', 'err')}</div>`, t); return; }
  const p = state.profile; const key = seg[0] === 'admin' ? 'admin/' + (seg[1] || 'approvals') : (seg[0] || '');
  const pending = p.status === 'pending' ? note('Your account is waiting for approval. You can complete your profile now. Listing opens once the team approves you.') : p.status === 'suspended' ? note('Your account is suspended. Please contact the team.', 'err') : '';
  setMain(html`<div class="wrap"><div class="shell">
    <nav class="side" aria-label="Dashboard"><div class="who"><strong>${nameOf(p)}</strong><div class="small muted">${ROLE_LABEL[p.role]} ${badge(p.status)}</div></div>
      ${navItems().map(([k, l]) => html`<a href="#/app${k ? '/' + k : ''}" class="${k === key ? 'on' : ''}">${l}</a>`)}</nav>
    <div><div id="dash-body">${loadingHTML}</div></div></div></div>`, t);
  const wrapPending = body => html`${pending}${body}`;
  let out;
  const r = p.role, a = seg[0];
  if (a === undefined) out = await pOverview();
  else if (a === 'profile') out = await pProfile();
  else if (a === 'orders') out = await pOrders();
  else if (a === 'products' && r === 'maker') out = seg[1] ? await pProductForm(seg[1]) : await pProducts();
  else if (a === 'fulfil' && r === 'maker') out = await pFulfil();
  else if (a === 'materials' && r === 'producer') out = seg[1] ? await pMaterialForm(seg[1]) : await pMaterials();
  else if (a === 'requests' && (r === 'maker' || r === 'producer')) out = await pRequests();
  else if (a === 'admin' && r === 'admin') {
    const b = seg[1] || 'approvals';
    out = b === 'approvals' ? await aApprovals() : b === 'products' ? await aProducts() : b === 'orders' ? await aOrders() : b === 'matches' ? await aMatches() : b === 'partners' ? await aPartners() : b === 'inquiries' ? await aInquiries() : empty('Not found', '');
  } else out = empty('Page not available', 'This page is not available for your account.', html`<a class="btn" href="#/app">Back to overview</a>`);
  if (t !== token) return;
  const el = $('#dash-body'); if (el) el.innerHTML = String(wrapPending(out));
}
const head = (title, action) => html`<div class="pagehead"><h1>${title}</h1>${action || ''}</div>`;

async function pOverview() {
  const p = state.profile, uid = p.id, r = p.role; let k = [], tips = '';
  if (r === 'maker') {
    const [d, pu, f, rq] = await Promise.all([
      count('products', b => b.eq('maker_id', uid).in('status', ['draft', 'pending', 'rejected'])),
      count('products', b => b.eq('maker_id', uid).eq('status', 'published')),
      count('order_items', b => b.eq('maker_id', uid).in('fulfilment_status', ['pending', 'confirmed'])),
      count('material_requests', b => b.eq('maker_id', uid).eq('status', 'requested'))]);
    k = [['Published products', pu], ['Drafts and in review', d], ['Orders to fulfil', f], ['Open material requests', rq]];
    tips = html`<p>Add products, then submit them for review. Browse <a href="#/directory?tab=materials">recycled materials</a> to request supplies.</p>`;
  } else if (r === 'producer') {
    const [m, rq] = await Promise.all([count('materials', b => b.eq('producer_id', uid).eq('status', 'active')), count('material_requests', b => b.eq('status', 'requested'))]);
    k = [['Active materials', m], ['Requests waiting for you', rq]];
    tips = html`<p>Keep your quantities and prices up to date so makers can find you in the <a href="#/directory?tab=materials">directory</a>.</p>`;
  } else if (r === 'buyer') {
    const o = await count('orders', b => b.eq('buyer_id', uid));
    k = [['Your orders', o]]; tips = html`<p>Browse the <a href="#/shop">shop</a>, or <a href="#/join?kind=wholesale">ask about wholesale</a>.</p>`;
  } else {
    const [pa, pp, po, iq, ch, ls] = await Promise.all([
      count('profiles', b => b.eq('status', 'pending')), count('products', b => b.eq('status', 'pending')),
      count('orders', b => b.eq('status', 'placed')), count('inquiries', b => b.eq('handled', false)),
      count('partner_channels'), count('partner_channels', b => b.eq('status', 'listed'))]);
    k = [['Members to approve', pa], ['Products to review', pp], ['New orders', po], ['Unhandled inquiries', iq], ['Partner channels', ch], ['Channels listed', ls]];
    tips = html`<p>Start with <a href="#/app/admin/approvals">approvals</a> and <a href="#/app/admin/products">product review</a>.</p>`;
  }
  return html`${head('Welcome, ' + (p.full_name || 'there'))}<div class="grid g4" style="margin-bottom:24px">${k.map(([l, n]) => html`<div class="kpi"><b>${n}</b><span>${l}</span></div>`)}</div>${tips}`;
}

async function pProfile() {
  const p = state.profile; const pr = one(await q(sb.from('profile_private').select('phone,email').eq('id', p.id).maybeSingle())) || {};
  return html`${head('Profile')}<form class="form" data-form="profile">
    ${fld('Full name', inp('full_name', { value: p.full_name, required: true, maxlength: 120 }))}
    ${fld('Business or workshop name', inp('business_name', { value: p.business_name, maxlength: 120 }))}
    <div class="two">${fld('Location', inp('location', { value: p.location, maxlength: 120 }))}${fld('Phone', inp('phone', { value: pr.phone, type: 'tel', maxlength: 40 }), 'Only shared with people you are matched with.')}</div>
    ${fld('About you', area('bio', p.bio, { maxlength: 1500 }), 'Shown on your public directory listing.')}
    ${p.role === 'maker' ? fld('What you make', inp('specialties', { value: (p.specialties || []).join(', ') }), 'Separate with commas, e.g. bags, sandals, mats.') : ''}
    <p class="small muted">Signed in as ${pr.email || state.user.email}</p>
    <div><button class="btn" type="submit">Save profile</button></div></form>`;
}

async function pOrders() {
  const list = await q(sb.from('orders').select('*,order_items(product_name,quantity,unit_price,fulfilment_status)').eq('buyer_id', state.profile.id).order('created_at', { ascending: false }));
  return html`${head('My orders')}${list.length ? list.map(o => html`<div class="card" style="margin-bottom:16px"><div class="row between"><strong>Order from ${dt(o.created_at)}</strong>${badge(o.status)}</div>
    <p class="muted small">${label(o.order_type)} · ${o.country}</p>
    <div class="scroll"><table class="tbl"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Status</th></tr></thead><tbody>${(o.order_items || []).map(i => html`<tr><td>${i.product_name}</td><td>${i.quantity}</td><td>${naira(i.unit_price)}</td><td>${badge(i.fulfilment_status)}</td></tr>`)}</tbody></table></div>
    <p style="margin-top:12px"><strong>Total ${naira(o.total)}</strong></p></div>`) : empty('No orders yet', 'When you place an order it will show up here.', html`<a class="btn" href="#/shop">Shop products</a>`)}`;
}

/* maker: products */
async function pProducts() {
  const list = await q(sb.from('products').select('*').eq('maker_id', state.profile.id).order('created_at', { ascending: false }));
  return html`${head('My products', html`<a class="btn" href="#/app/products/new">Add a product</a>`)}
  ${list.length ? html`<div class="scroll"><table class="tbl"><thead><tr><th></th><th>Product</th><th>Price</th><th>Stock</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${list.map(p => html`<tr><td>${safeImg(p.image_url) ? html`<img class="thumb" src="${safeImg(p.image_url)}" alt="">` : html`<div class="thumb"></div>`}</td>
      <td><strong>${p.name}</strong><div class="small muted">${p.category}</div></td><td>${naira(p.price)}</td><td>${p.stock}</td><td>${badge(p.status)}</td>
      <td><div class="actions"><a class="btn alt sm" href="#/app/products/${p.id}">Edit</a>
        ${p.status === 'draft' || p.status === 'rejected' ? html`<button class="btn sm" data-act="submitProduct" data-id="${p.id}">Submit for review</button>` : ''}
        <button class="btn alt sm" data-act="deleteProduct" data-id="${p.id}">Delete</button></div></td></tr>`)}</tbody></table></div>`
    : empty('No products yet', 'Add your first product, then submit it for review. Approved products appear in the shop.', html`<a class="btn" href="#/app/products/new">Add a product</a>`)}`;
}
async function pProductForm(id) {
  let p = {};
  if (id !== 'new') { p = await q(sb.from('products').select('*').eq('id', id).eq('maker_id', state.profile.id).maybeSingle()); if (!p) return empty('Product not found', '', html`<a class="btn" href="#/app/products">Back</a>`); }
  return html`${head(id === 'new' ? 'Add a product' : 'Edit product')}
  ${p.status === 'rejected' ? note('This product was not approved. Update it and submit it again.', 'err') : ''}
  <form class="form" data-form="product" data-id="${id === 'new' ? '' : id}" data-image="${p.image_url || ''}" data-status="${p.status || ''}">
    ${fld('Product name', inp('name', { value: p.name, required: true, maxlength: 120 }))}
    <div class="two">${fld('Category', sel('category', CATS.map(c => [c, c]), p.category || CATS[0]))}${fld('Made from', inp('materials_used', { value: p.materials_used, maxlength: 500, placeholder: 'e.g. recycled rubber, textile offcuts' }))}</div>
    <div class="two">${fld('Price (₦)', inp('price', { type: 'number', min: 0, step: '0.01', value: p.price, required: true }))}${fld('Stock', inp('stock', { type: 'number', min: 0, step: '1', value: p.stock ?? 1, required: true }))}</div>
    ${fld('Description', area('description', p.description, { maxlength: 3000 }))}
    ${fld('The story behind it', area('culture_story', p.culture_story, { maxlength: 3000, placeholder: 'Who made it, what inspired it, and what Benin art or culture it draws on.' }), 'Buyers love this. It sets your work apart.')}
    ${fld('Photo', raw('<input type="file" name="image" accept="image/jpeg,image/png,image/webp">'), (p.image_url ? 'A photo is already saved. Choose a file to replace it. ' : '') + 'JPG, PNG or WebP, up to 5 MB.')}
    <div class="row"><button class="btn alt" type="submit" name="intent" value="draft">Save as draft</button>
      ${p.status === 'published' ? '' : html`<button class="btn" type="submit" name="intent" value="pending">Submit for review</button>`}
      <a href="#/app/products">Cancel</a></div></form>`;
}
async function pFulfil() {
  const list = await q(sb.from('order_items').select('*,orders(created_at,shipping_name,shipping_phone,shipping_address,country,status)').eq('maker_id', state.profile.id).order('id', { ascending: false }).limit(200));
  return html`${head('Orders to fulfil')}${list.length ? html`<div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th>Item</th><th>Ship to</th><th>Status</th></tr></thead><tbody>
    ${list.map(i => { const o = i.orders || {}; return html`<tr><td>${dt(o.created_at)}</td><td><strong>${i.product_name}</strong><div class="small muted">Qty ${i.quantity} · ${naira(i.unit_price)} each</div></td>
      <td>${o.shipping_name}<div class="small muted">${o.shipping_address}, ${o.country}${o.shipping_phone ? ' · ' + o.shipping_phone : ''}</div></td>
      <td>${sel('s', FULFIL, i.fulfilment_status, { attrs: `data-change="itemStatus" data-id="${esc(i.id)}" aria-label="Fulfilment status"` })}</td></tr>`; })}</tbody></table></div>` : empty('No orders yet', 'When a buyer orders one of your products it appears here with the delivery details.')}`;
}

/* producer: materials */
async function pMaterials() {
  const list = await q(sb.from('materials').select('*').eq('producer_id', state.profile.id).order('created_at', { ascending: false }));
  return html`${head('My materials', html`<a class="btn" href="#/app/materials/new">Add a material</a>`)}
  ${list.length ? html`<div class="scroll"><table class="tbl"><thead><tr><th>Material</th><th>Available</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${list.map(m => html`<tr><td><strong>${m.name}</strong><div class="small muted">${m.material_type}</div></td><td>${Number(m.quantity).toLocaleString()} ${m.unit}</td><td>${m.price_per_unit != null ? naira(m.price_per_unit) + '/' + m.unit : '—'}</td><td>${badge(m.status)}</td>
      <td><div class="actions"><a class="btn alt sm" href="#/app/materials/${m.id}">Edit</a><button class="btn alt sm" data-act="toggleMaterial" data-id="${m.id}" data-status="${m.status}">${m.status === 'active' ? 'Pause' : 'Resume'}</button><button class="btn alt sm" data-act="deleteMaterial" data-id="${m.id}">Delete</button></div></td></tr>`)}</tbody></table></div>`
    : empty('No materials listed', 'List the recycled materials you produce so makers can find and request them.', html`<a class="btn" href="#/app/materials/new">Add a material</a>`)}`;
}
async function pMaterialForm(id) {
  let m = {};
  if (id !== 'new') { m = await q(sb.from('materials').select('*').eq('id', id).eq('producer_id', state.profile.id).maybeSingle()); if (!m) return empty('Material not found', '', html`<a class="btn" href="#/app/materials">Back</a>`); }
  return html`${head(id === 'new' ? 'Add a material' : 'Edit material')}<form class="form" data-form="material" data-id="${id === 'new' ? '' : id}">
    ${fld('Name', inp('name', { value: m.name, required: true, maxlength: 120, placeholder: 'e.g. Cleaned rubber offcuts' }))}
    <div class="two">${fld('Type', inp('material_type', { value: m.material_type, required: true, maxlength: 60, placeholder: 'Rubber, textile, plastic, paper…' }))}${fld('Location', inp('location', { value: m.location, maxlength: 120 }))}</div>
    <div class="two">${fld('Quantity available', inp('quantity', { type: 'number', min: 0, step: 'any', value: m.quantity ?? 0, required: true }))}${fld('Unit', inp('unit', { value: m.unit || 'kg', required: true, maxlength: 20 }))}</div>
    ${fld('Price per unit (₦)', inp('price_per_unit', { type: 'number', min: 0, step: '0.01', value: m.price_per_unit }), 'Leave blank to say "ask the supplier".')}
    ${fld('Description', area('description', m.description, { maxlength: 2000, placeholder: 'Condition, colours, how it is cleaned and sorted.' }))}
    <div class="row"><button class="btn" type="submit">Save material</button><a href="#/app/materials">Cancel</a></div></form>`;
}

/* requests (maker + producer) */
async function pRequests() {
  const r = state.profile.role;
  const list = await q(sb.from('material_requests').select('*,materials(name,unit,producer_id,profiles(full_name,business_name,location)),profiles(full_name,business_name,location)').order('created_at', { ascending: false }).limit(200));
  const pp = await q(sb.from('profile_private').select('id,email,phone')); const contact = Object.fromEntries(pp.map(x => [x.id, x]));
  const rows = list.filter(x => r === 'maker' ? x.maker_id === state.profile.id : (x.materials && x.materials.producer_id === state.profile.id));
  return html`${head(r === 'maker' ? 'Material requests' : 'Requests from makers')}
  ${rows.length ? rows.map(x => { const other = r === 'maker' ? x.materials && x.materials.profiles : x.profiles; const oid = r === 'maker' ? x.materials && x.materials.producer_id : x.maker_id; const c = contact[oid];
    return html`<div class="card" style="margin-bottom:16px"><div class="row between"><strong>${x.materials ? x.materials.name : 'Material'}: ${Number(x.quantity).toLocaleString()} ${x.materials ? x.materials.unit : ''}</strong>${badge(x.status)}</div>
    <p class="muted small">${r === 'maker' ? 'Supplier' : 'Maker'}: ${nameOf(other)} · ${dt(x.created_at)}</p>${x.message ? html`<p>${x.message}</p>` : ''}
    ${(x.status === 'accepted' || x.status === 'fulfilled') && c ? html`<p class="small"><strong>Contact:</strong> ${c.email || ''}${c.phone ? ' · ' + c.phone : ''}</p>` : ''}
    <div class="actions">${r === 'producer' && x.status === 'requested' ? html`<button class="btn sm" data-act="respondRequest" data-id="${x.id}" data-to="accepted">Accept</button><button class="btn alt sm" data-act="respondRequest" data-id="${x.id}" data-to="declined">Decline</button>` : ''}
      ${r === 'producer' && x.status === 'accepted' ? html`<button class="btn sm" data-act="respondRequest" data-id="${x.id}" data-to="fulfilled">Mark as fulfilled</button>` : ''}
      ${r === 'maker' && x.status === 'requested' ? html`<button class="btn alt sm" data-act="cancelRequest" data-id="${x.id}">Cancel request</button>` : ''}</div></div>`; })
    : empty('No requests yet', r === 'maker' ? 'Browse recycled materials and send a request to a supplier.' : 'When makers request your materials they appear here.', r === 'maker' ? html`<a class="btn" href="#/directory?tab=materials">Browse materials</a>` : '')}`;
}

/* ---------- admin ---------- */
async function aApprovals() {
  const list = await q(sb.from('profiles').select('*,profile_private(email,phone)').order('created_at', { ascending: false }).limit(300));
  const pend = list.filter(p => p.status === 'pending');
  const row = p => { const c = one(p.profile_private) || {}; return html`<tr><td><strong>${nameOf(p)}</strong><div class="small muted">${p.full_name}</div></td><td>${ROLE_LABEL[p.role]}</td><td>${p.location || ''}</td><td class="small">${c.email || ''}<br>${c.phone || ''}</td><td>${badge(p.status)}</td>
    <td><div class="actions">${p.status !== 'approved' ? html`<button class="btn sm" data-act="setProfileStatus" data-id="${p.id}" data-to="approved">Approve</button>` : ''}${p.status !== 'suspended' && p.role !== 'admin' ? html`<button class="btn alt sm" data-act="setProfileStatus" data-id="${p.id}" data-to="suspended">Suspend</button>` : ''}</div></td></tr>`; };
  const table = rows => html`<div class="scroll"><table class="tbl"><thead><tr><th>Member</th><th>Role</th><th>Location</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(row)}</tbody></table></div>`;
  return html`${head('Approvals')}<h2 style="font-size:var(--t-lg)">Waiting for approval (${pend.length})</h2>${pend.length ? table(pend) : empty('Nothing waiting', 'New makers and suppliers appear here for review.')}
    <h2 style="font-size:var(--t-lg);margin-top:32px">All members (${list.length})</h2>${table(list)}`;
}
async function aProducts() {
  const list = await q(sb.from('products').select('*,profiles(full_name,business_name)').order('created_at', { ascending: false }).limit(300));
  const order = { pending: 0, draft: 1, published: 2, rejected: 3 }; list.sort((a, b) => order[a.status] - order[b.status]);
  return html`${head('Product review')}${list.length ? html`<div class="scroll"><table class="tbl"><thead><tr><th></th><th>Product</th><th>Maker</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${list.map(p => html`<tr><td>${safeImg(p.image_url) ? html`<img class="thumb" src="${safeImg(p.image_url)}" alt="">` : html`<div class="thumb"></div>`}</td><td><a href="#/product/${p.id}"><strong>${p.name}</strong></a><div class="small muted">${p.category}</div></td><td>${nameOf(p.profiles)}</td><td>${naira(p.price)}</td><td>${badge(p.status)}</td>
    <td><div class="actions">${p.status !== 'published' ? html`<button class="btn sm" data-act="setProductStatus" data-id="${p.id}" data-to="published">Publish</button>` : html`<button class="btn alt sm" data-act="setProductStatus" data-id="${p.id}" data-to="draft">Unpublish</button>`}${p.status !== 'rejected' ? html`<button class="btn alt sm" data-act="setProductStatus" data-id="${p.id}" data-to="rejected">Reject</button>` : ''}</div></td></tr>`)}</tbody></table></div>` : empty('No products yet', 'Products submitted by makers appear here.')}`;
}
async function aOrders() {
  const list = await q(sb.from('orders').select('*,profiles(full_name,business_name),order_items(product_name,quantity,unit_price,fulfilment_status)').order('created_at', { ascending: false }).limit(200));
  return html`${head('All orders')}${list.length ? list.map(o => html`<div class="card" style="margin-bottom:16px"><div class="row between"><div><strong>${nameOf(o.profiles)}</strong> <span class="muted small">· ${dt(o.created_at)} · ${label(o.order_type)}</span></div>
    ${sel('s', ORDER_ST, o.status, { attrs: `data-change="orderStatus" data-id="${esc(o.id)}" aria-label="Order status" style="width:auto"` })}</div>
    <p class="small muted">${o.shipping_name}, ${o.shipping_address}, ${o.country}${o.shipping_phone ? ' · ' + o.shipping_phone : ''}</p>${o.note ? html`<p class="small">Note: ${o.note}</p>` : ''}
    <ul>${(o.order_items || []).map(i => html`<li>${i.quantity} × ${i.product_name} (${naira(i.unit_price)}) ${badge(i.fulfilment_status)}</li>`)}</ul><p><strong>Total ${naira(o.total)}</strong></p></div>`) : empty('No orders yet', 'Orders placed in the shop appear here.')}`;
}
async function aMatches() {
  const list = await q(sb.from('material_requests').select('*,materials(name,unit,profiles(full_name,business_name)),profiles(full_name,business_name)').order('created_at', { ascending: false }).limit(300));
  return html`${head('Material matches')}${list.length ? html`<div class="scroll"><table class="tbl"><thead><tr><th>Date</th><th>Maker</th><th>Supplier</th><th>Material</th><th>Quantity</th><th>Status</th></tr></thead><tbody>
    ${list.map(x => html`<tr><td>${dt(x.created_at)}</td><td>${nameOf(x.profiles)}</td><td>${nameOf(x.materials && x.materials.profiles)}</td><td>${x.materials ? x.materials.name : ''}</td><td>${Number(x.quantity).toLocaleString()} ${x.materials ? x.materials.unit : ''}</td><td>${badge(x.status)}</td></tr>`)}</tbody></table></div>` : empty('No requests yet', 'Maker requests for materials appear here.')}`;
}
async function aPartners() {
  const [chs, tasks] = await Promise.all([q(sb.from('partner_channels').select('*').order('priority').order('name')), q(sb.from('partner_tasks').select('*').order('created_at'))]);
  const by = {}; tasks.forEach(t => (by[t.channel_id] = by[t.channel_id] || []).push(t));
  const kv = (l, v) => v ? html`<dt>${l}</dt><dd>${v}</dd>` : '';
  return html`${head('Partner channels')}
  <p class="muted">Eligibility and fees come from public sources and can change. Check each platform before applying. Priority 1 is first to approach.</p>
  <details class="card" style="margin-bottom:24px"><summary class="serif" style="cursor:pointer;font-weight:700;color:var(--navy)">Add a channel</summary>
    <form class="form" data-form="addChannel" style="margin-top:16px">${fld('Name', inp('name', { required: true, maxlength: 120 }))}<div class="two">${fld('Type', sel('channel_type', CH_TYPES, 'marketplace'))}${fld('Website', inp('website', { type: 'url' }))}</div>
      ${fld('How to partner', area('how_to_partner', '', { maxlength: 2000 }))}<div><button class="btn" type="submit">Add channel</button></div></form></details>
  ${chs.map(c => html`<div class="card" style="margin-bottom:16px"><div class="row between"><div><h3 style="margin:0">${c.name}</h3><span class="muted small">${(CH_TYPES.find(x => x[0] === c.channel_type) || [0, c.channel_type])[1]}</span></div>
    <div class="row">${sel('s', CH_ST, c.status, { attrs: `data-change="chStatus" data-id="${esc(c.id)}" aria-label="Status for ${esc(c.name)}" style="width:auto"` })}${sel('p', [1, 2, 3, 4, 5].map(n => [n, 'Priority ' + n]), c.priority, { attrs: `data-change="chPriority" data-id="${esc(c.id)}" aria-label="Priority for ${esc(c.name)}" style="width:auto"` })}</div></div>
    <dl class="kv" style="margin-top:16px">${kv('Nigeria eligibility', c.nigeria_eligibility)}${kv('How to partner', c.how_to_partner)}${kv('Fees', c.fees)}${kv('Documents', c.documents)}
      ${c.website || c.apply_url ? html`<dt>Links</dt><dd>${String(c.website || '').startsWith('https://') ? html`<a href="${c.website}" target="_blank" rel="noopener noreferrer">Website</a> ` : ''}${String(c.apply_url || '').startsWith('https://') ? html`<a href="${c.apply_url}" target="_blank" rel="noopener noreferrer">Apply or learn more</a>` : ''}</dd>` : ''}</dl>
    <label class="field"><span>Notes</span><textarea id="notes-${c.id}" maxlength="3000">${c.notes || ''}</textarea></label><div style="margin:8px 0 16px"><button class="btn alt sm" data-act="saveNotes" data-id="${c.id}">Save notes</button></div>
    <h4>To-do</h4>${(by[c.id] || []).map(t => html`<div class="task ${t.done ? 'done' : ''}"><input type="checkbox" data-change="taskDone" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Done"><span>${t.title}${t.due_date ? ' (due ' + dt(t.due_date) + ')' : ''}</span></div>`)}
    <form class="row" data-form="addTask" data-id="${c.id}" style="margin-top:12px"><input name="title" required maxlength="200" placeholder="Add a task" aria-label="New task" style="flex:1;min-width:200px"><input name="due" type="date" aria-label="Due date" style="width:auto"><button class="btn sm" type="submit">Add</button></form></div>`)}`;
}
async function aInquiries() {
  const list = await q(sb.from('inquiries').select('*').order('created_at', { ascending: false }).limit(300));
  return html`${head('Inquiries')}${list.length ? list.map(i => html`<div class="card" style="margin-bottom:16px"><div class="row between"><div><strong>${i.name}</strong> <span class="muted small">· ${label(i.kind)} · ${dt(i.created_at)}</span></div>${i.handled ? badge('fulfilled') : badge('pending')}</div>
    <p>${i.message}</p><p class="small muted">${i.email}${i.phone ? ' · ' + i.phone : ''}</p><button class="btn alt sm" data-act="handleInquiry" data-id="${i.id}" data-to="${i.handled ? 'false' : 'true'}">${i.handled ? 'Mark as not handled' : 'Mark as handled'}</button></div>`) : empty('No inquiries yet', 'Messages from the contact form appear here.')}`;
}

/* ---------- actions ---------- */
const refresh = () => router(true);
const actions = {
  burger(el) { const n = $('#nav'); const o = n.classList.toggle('open'); el.setAttribute('aria-expanded', String(o)); },
  go(el) { location.hash = el.dataset.to; },
  async logout() { await sb.auth.signOut(); state.user = null; state.profile = null; renderHeader(); location.hash = '#/'; toast('Signed out.'); },
  addCart(el) {
    const qty = Math.max(1, parseInt(($('#qty') || {}).value, 10) || 1), stock = parseInt(el.dataset.stock, 10);
    const c = cartGet(); const ex = c.find(i => i.id === el.dataset.id);
    const next = Math.min(stock, (ex ? ex.qty : 0) + qty);
    if (ex) ex.qty = next; else c.push({ id: el.dataset.id, qty: next });
    cartSet(c); toast('Added to your cart.'); refresh();
  },
  cartInc(el) { const c = cartGet(); const i = c.find(x => x.id === el.dataset.id); if (i && i.qty < parseInt(el.dataset.stock, 10)) i.qty++; cartSet(c); refresh(); },
  cartDec(el) { let c = cartGet(); const i = c.find(x => x.id === el.dataset.id); if (i) i.qty--; c = c.filter(x => x.qty > 0); cartSet(c); refresh(); },
  cartRemove(el) { cartSet(cartGet().filter(x => x.id !== el.dataset.id)); refresh(); },
  async deleteProduct(el) { if (!confirm('Delete this product? This cannot be undone.')) return; try { await q(sb.from('products').delete().eq('id', el.dataset.id)); toast('Product deleted.'); } catch (e) { toast(/foreign key|violates/i.test(e.message) ? 'This product has orders, so it cannot be deleted. Unpublish it instead by editing it to a draft.' : friendly(e), true); } refresh(); },
  async submitProduct(el) { await q(sb.from('products').update({ status: 'pending' }).eq('id', el.dataset.id)); toast('Submitted for review.'); refresh(); },
  async deleteMaterial(el) { if (!confirm('Delete this material?')) return; await q(sb.from('materials').delete().eq('id', el.dataset.id)); toast('Material deleted.'); refresh(); },
  async toggleMaterial(el) { await q(sb.from('materials').update({ status: el.dataset.status === 'active' ? 'paused' : 'active' }).eq('id', el.dataset.id)); refresh(); },
  async respondRequest(el) { await q(sb.from('material_requests').update({ status: el.dataset.to }).eq('id', el.dataset.id)); toast('Request ' + el.dataset.to + '.'); refresh(); },
  async cancelRequest(el) { await q(sb.from('material_requests').delete().eq('id', el.dataset.id)); toast('Request cancelled.'); refresh(); },
  async setProfileStatus(el) { await q(sb.from('profiles').update({ status: el.dataset.to }).eq('id', el.dataset.id)); toast('Member ' + el.dataset.to + '.'); refresh(); },
  async setProductStatus(el) { await q(sb.from('products').update({ status: el.dataset.to }).eq('id', el.dataset.id)); toast('Product ' + (el.dataset.to === 'published' ? 'published' : el.dataset.to) + '.'); refresh(); },
  async saveNotes(el) { const v = ($('#notes-' + el.dataset.id) || {}).value || ''; await q(sb.from('partner_channels').update({ notes: v, updated_at: new Date().toISOString() }).eq('id', el.dataset.id)); toast('Notes saved.'); },
  async handleInquiry(el) { await q(sb.from('inquiries').update({ handled: el.dataset.to === 'true' }).eq('id', el.dataset.id)); refresh(); }
};
const changes = {
  async itemStatus(el) { await q(sb.from('order_items').update({ fulfilment_status: el.value }).eq('id', el.dataset.id)); toast('Status updated.'); },
  async orderStatus(el) { await q(sb.from('orders').update({ status: el.value }).eq('id', el.dataset.id)); toast('Order status updated.'); },
  async chStatus(el) { await q(sb.from('partner_channels').update({ status: el.value, updated_at: new Date().toISOString() }).eq('id', el.dataset.id)); toast('Channel status updated.'); },
  async chPriority(el) { await q(sb.from('partner_channels').update({ priority: parseInt(el.value, 10), updated_at: new Date().toISOString() }).eq('id', el.dataset.id)); toast('Priority updated.'); },
  async taskDone(el) { await q(sb.from('partner_tasks').update({ done: el.checked }).eq('id', el.dataset.id)); refresh(); }
};
const trim = (fd, k) => String(fd.get(k) || '').trim();
const forms = {
  shopfilter(fd) { const p = new URLSearchParams(); if (fd.get('cat')) p.set('cat', fd.get('cat')); if (trim(fd, 's')) p.set('s', trim(fd, 's')); location.hash = '#/shop' + (p.toString() ? '?' + p : ''); },
  async inquiry(fd, f) {
    await q(sb.from('inquiries').insert({ kind: fd.get('kind'), name: trim(fd, 'name'), email: trim(fd, 'email'), phone: trim(fd, 'phone') || null, message: trim(fd, 'message') }));
    f.innerHTML = String(note('Thank you. Your message has been sent and the team will reply by email.', 'ok'));
  },
  async login(fd, f) {
    const { error } = await sb.auth.signInWithPassword({ email: trim(fd, 'email'), password: fd.get('password') }); if (error) throw error;
    await loadSession(); const nx = f.dataset.next; location.hash = '#/' + (nx || 'app'); toast('Signed in.');
  },
  async signup(fd, f) {
    const { data, error } = await sb.auth.signUp({ email: trim(fd, 'email'), password: fd.get('password'), options: { emailRedirectTo: location.origin + location.pathname, data: { role: fd.get('role'), full_name: trim(fd, 'full_name'), business_name: trim(fd, 'business_name'), location: trim(fd, 'location'), phone: trim(fd, 'phone') } } });
    if (error) throw error;
    if (data.session) { await loadSession(); location.hash = '#/app'; toast('Welcome to Benin ReCraft.'); return; }
    f.innerHTML = String(note('Almost there. We sent a confirmation link to your email. Open it, then sign in. Makers and suppliers are reviewed by the team before they can list.', 'ok'));
  },
  async forgot(fd, f) {
    const { error } = await sb.auth.resetPasswordForEmail(trim(fd, 'email'), { redirectTo: location.origin + location.pathname + '#/reset' }); if (error) throw error;
    f.innerHTML = String(note('If that email has an account, a reset link is on its way.', 'ok'));
  },
  async reset(fd) { const { error } = await sb.auth.updateUser({ password: fd.get('password') }); if (error) throw error; toast('Password updated.'); location.hash = '#/app'; },
  async request(fd, f) {
    await q(sb.from('material_requests').insert({ maker_id: state.user.id, material_id: f.dataset.id, quantity: Number(fd.get('quantity')), message: trim(fd, 'message') || null }));
    toast('Request sent. Track it in your dashboard.'); location.hash = '#/app/requests';
  },
  async checkout(fd) {
    const items = cartGet(); if (!items.length) throw new Error('Your cart is empty.');
    const o = await q(sb.from('orders').insert({ buyer_id: state.user.id, order_type: fd.get('order_type'), status: 'placed', total: 0, shipping_name: trim(fd, 'shipping_name'), shipping_phone: trim(fd, 'shipping_phone') || null, shipping_address: trim(fd, 'shipping_address'), country: trim(fd, 'country'), note: trim(fd, 'note') || null }).select('id').single());
    const { error } = await sb.from('order_items').insert(items.map(i => ({ order_id: o.id, product_id: i.id, quantity: i.qty })));
    if (error) { await sb.from('orders').delete().eq('id', o.id); throw error; }
    cartSet([]); toast('Order placed. The team will contact you with payment details.'); location.hash = '#/app/orders';
  },
  async profile(fd) {
    const id = state.profile.id;
    const upd = { full_name: trim(fd, 'full_name'), business_name: trim(fd, 'business_name') || null, location: trim(fd, 'location') || null, bio: trim(fd, 'bio') || null };
    if (fd.has('specialties')) upd.specialties = trim(fd, 'specialties').split(',').map(s => s.trim()).filter(Boolean).slice(0, 12);
    await q(sb.from('profiles').update(upd).eq('id', id));
    await q(sb.from('profile_private').update({ phone: trim(fd, 'phone') || null }).eq('id', id));
    await loadSession(); toast('Profile saved.'); refresh();
  },
  async product(fd, f, sub) {
    let image_url = f.dataset.image || null; const file = fd.get('image');
    if (file && file.size) {
      if (!/^image[/](jpeg|png|webp)$/.test(file.type)) throw new Error('Photo must be a JPG, PNG or WebP image.');
      if (file.size > 5 * 1024 * 1024) throw new Error('Photo must be 5 MB or smaller.');
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${state.user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from('product-images').upload(path, file, { contentType: file.type, upsert: false }); if (error) throw error;
      image_url = sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    }
    const price = Number(fd.get('price')), stock = parseInt(fd.get('stock'), 10);
    if (!(price >= 0) || !(stock >= 0)) throw new Error('Price and stock must be zero or more.');
    const rec = { name: trim(fd, 'name'), category: fd.get('category'), materials_used: trim(fd, 'materials_used') || null, description: trim(fd, 'description') || null, culture_story: trim(fd, 'culture_story') || null, price, stock, image_url };
    const want = sub && sub.value === 'pending' ? 'pending' : 'draft'; const id = f.dataset.id;
    if (id) { rec.status = f.dataset.status === 'published' ? 'published' : want; await q(sb.from('products').update(rec).eq('id', id)); }
    else { rec.maker_id = state.user.id; rec.status = want; await q(sb.from('products').insert(rec)); }
    toast(want === 'pending' && f.dataset.status !== 'published' ? 'Submitted for review.' : 'Product saved.'); location.hash = '#/app/products';
  },
  async material(fd, f) {
    const rec = { name: trim(fd, 'name'), material_type: trim(fd, 'material_type'), location: trim(fd, 'location') || null, quantity: Number(fd.get('quantity')), unit: trim(fd, 'unit'), price_per_unit: fd.get('price_per_unit') === '' ? null : Number(fd.get('price_per_unit')), description: trim(fd, 'description') || null };
    if (f.dataset.id) await q(sb.from('materials').update(rec).eq('id', f.dataset.id));
    else { rec.producer_id = state.user.id; await q(sb.from('materials').insert(rec)); }
    toast('Material saved.'); location.hash = '#/app/materials';
  },
  async addChannel(fd) { await q(sb.from('partner_channels').insert({ name: trim(fd, 'name'), channel_type: fd.get('channel_type'), website: trim(fd, 'website') || null, how_to_partner: trim(fd, 'how_to_partner') || null, status: 'researching', priority: 3 })); toast('Channel added.'); refresh(); },
  async addTask(fd, f) { await q(sb.from('partner_tasks').insert({ channel_id: f.dataset.id, title: trim(fd, 'title'), due_date: fd.get('due') || null })); refresh(); }
};

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = actions[el.dataset.act]; if (!fn) return;
  e.preventDefault();
  Promise.resolve().then(() => fn(el, e)).catch(err => toast(friendly(err), true));
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]'); if (!el) return;
  const fn = changes[el.dataset.change]; if (!fn) return;
  Promise.resolve().then(() => fn(el)).catch(err => { toast(friendly(err), true); refresh(); });
});
document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if (!f) return;
  e.preventDefault();
  const fn = forms[f.dataset.form]; if (!fn) return;
  const btns = f.querySelectorAll('button[type=submit]'); btns.forEach(b => b.disabled = true);
  const sub = e.submitter;
  Promise.resolve().then(() => fn(new FormData(f), f, sub)).catch(err => toast(friendly(err), true)).finally(() => btns.forEach(b => b.disabled = false));
});
window.addEventListener('hashchange', () => router());

/* ---------- start ---------- */
(async function init() {
  renderFooter(); renderHeader();
  try { await loadSession(); } catch (e) { console.error(e); }
  await router();
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'SIGNED_OUT') setTimeout(async () => { state.user = null; state.profile = null; renderHeader(); if (location.hash.startsWith('#/app')) location.hash = '#/'; }, 0);
    else if (ev === 'SIGNED_IN') setTimeout(async () => { const had = state.user && state.user.id; await loadSession(); if (!had) router(true); }, 0);
    else if (ev === 'PASSWORD_RECOVERY') setTimeout(() => { location.hash = '#/reset'; }, 0);
  });
})();
})();
