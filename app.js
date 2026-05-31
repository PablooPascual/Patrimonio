/* ══════════════════════════════════════════════════════════
   WealthTerm — app.js  v3
   • Precios en tiempo real: CoinGecko (cripto), Yahoo Finance
     vía allorigins proxy (acciones y fondos)
   • P&L y % ganancia/pérdida en cada activo
   • Toasts no bloqueantes
   • Modal de confirmación (showConfirmModal, sin shadow)
   • Export JSON + CSV
   • Edición inline
══════════════════════════════════════════════════════════ */

/* ── Clone seguro ─────────────────────────────────────── */
function deepClone(o) {
  return typeof structuredClone === 'function'
    ? structuredClone(o)
    : JSON.parse(JSON.stringify(o));
}

function normalizeFund(item) {
  const initial = item.initial != null
    ? Number(item.initial)
    : Number(item.qty || 0) * Number(item.price || 0);
  const pct = item.pct != null ? Number(item.pct) : 0;
  const gain = initial * (pct / 100);
  return {
    ...item,
    name: item.name || item.tick || 'Fondo',
    initial,
    pct,
    currentValue: initial + gain
  };
}

/* ══ ESTADO ══════════════════════════════════════════════ */
const STORAGE_KEY = 'wealthterm_v1';
const DEFAULT_STATE = { banco: [], inv: [], fond: [], cri: [], snaps: [] };

let S = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepClone(DEFAULT_STATE);
    const p = JSON.parse(raw);
    return {
      banco: Array.isArray(p.banco) ? p.banco : [],
      inv:   Array.isArray(p.inv)   ? p.inv   : [],
      fond:  Array.isArray(p.fond)  ? p.fond.map(normalizeFund) : [],
      cri:   Array.isArray(p.cri)   ? p.cri   : [],
      snaps: Array.isArray(p.snaps) ? p.snaps : []
    };
  } catch(e) { console.error(e); return deepClone(DEFAULT_STATE); }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); }
  catch(e) { console.error('LocalStorage error:', e); }
}

/* ══ FORMATO ═════════════════════════════════════════════ */
const NB = '\u202f';
const fmt    = v => '€' + NB + Number(v||0).toLocaleString('es-ES', { minimumFractionDigits:2, maximumFractionDigits:2 });
const fmtS   = v => { const n=Number(v||0); if(Math.abs(n)>=1e6) return '€'+NB+(n/1e6).toFixed(2)+'M'; if(Math.abs(n)>=1e3) return '€'+NB+(n/1e3).toFixed(1)+'K'; return '€'+NB+n.toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:0}); };
const fmtPct = (v, showSign=true) => { const n=Number(v||0); return (showSign&&n>0?'+':'') + n.toFixed(2) + '%'; };
const fmtQty = (v,d) => Number(v||0).toLocaleString('es-ES',{minimumFractionDigits:0,maximumFractionDigits:d});
const esc    = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

/* ══ TOASTS ══════════════════════════════════════════════ */
function toast(msg, type='info', duration=3500) {
  const ct = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = 'toast toast-' + type;
  el.textContent = msg;
  ct.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast-show'));
  setTimeout(() => {
    el.classList.remove('toast-show');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/* ══ MODAL CONFIRMACIÓN ══════════════════════════════════ */
let _confirmCb = null;

function showConfirmModal(msg, cb) {
  _confirmCb = cb;
  document.getElementById('modal-msg').textContent = msg;
  document.getElementById('modal-confirm').style.display = 'flex';
  document.getElementById('modal-ok').focus();
}

document.getElementById('modal-ok').addEventListener('click', () => {
  document.getElementById('modal-confirm').style.display = 'none';
  if (typeof _confirmCb === 'function') _confirmCb();
  _confirmCb = null;
});
document.getElementById('modal-cancel').addEventListener('click', () => {
  document.getElementById('modal-confirm').style.display = 'none';
  _confirmCb = null;
});
document.getElementById('modal-confirm').addEventListener('click', e => {
  if (e.target === e.currentTarget) { document.getElementById('modal-confirm').style.display = 'none'; _confirmCb = null; }
});

/* ══ TOTALES ═════════════════════════════════════════════ */
function tots() {
  // Para inv y fond: usa livePrice si existe, si no buyPrice
  const b = S.banco.reduce((a,x) => a + Number(x.bal||0), 0);
  const i = S.inv  .reduce((a,x) => a + Number(x.qty||0) * (x.livePrice ?? Number(x.price||0)), 0);
  const f = S.fond .reduce((a,x) => a + Number(x.initial ?? 0) * (1 + Number(x.pct || 0) / 100), 0);
  const c = S.cri  .reduce((a,x) => a + Number(x.qty||0) * (x.livePrice ?? Number(x.price||0)), 0);
  return { b, i, f, c, t: b+i+f+c };
}

// PnL de un activo individual
function pnl(item, type) {
  if (type === 'banco') return { gain: 0, pct: 0, hasLive: false };
  if (type === 'fond') {
    const initial = Number(item.initial ?? item.qty * item.price ?? 0);
    const pct = Number(item.pct || 0);
    const gain = initial * (pct / 100);
    return { gain, pct, hasLive: true, cost: initial, cur: initial + gain };
  }
  const qty      = Number(item.qty||0);
  const buyPrice = Number(item.price||0);
  const live     = item.livePrice;
  const hasLive  = live != null && Number.isFinite(live);
  const curPrice = hasLive ? live : buyPrice;
  const cost     = qty * buyPrice;
  const cur      = qty * curPrice;
  const gain     = cur - cost;
  const pct      = cost > 0 ? (gain / cost) * 100 : 0;
  return { gain, pct, hasLive, cost, cur };
}

/* ══ DASHBOARD ═══════════════════════════════════════════ */
function updateDash() {
  const t = tots();
  document.getElementById('net-value').textContent = fmt(t.t);
  ['b','i','f','c'].forEach(k => {
    document.getElementById('s-' + k).textContent = fmtS(t[k]);
  });
  const p = t.t > 0
    ? { b:t.b/t.t*100, i:t.i/t.t*100, f:t.f/t.t*100, c:t.c/t.t*100 }
    : { b:0, i:0, f:0, c:0 };
  ['b','i','f','c'].forEach(k => {
    document.getElementById('sp-'+k).textContent = t.t > 0 ? p[k].toFixed(1)+'% del total' : '—';
    document.getElementById('seg-'+k).style.width = p[k]+'%';
  });
  document.getElementById('al-b').textContent = 'Banco '  + p.b.toFixed(1)+'%';
  document.getElementById('al-i').textContent = 'Bolsa '  + p.i.toFixed(1)+'%';
  document.getElementById('al-f').textContent = 'Fondos ' + p.f.toFixed(1)+'%';
  document.getElementById('al-c').textContent = 'Cripto ' + p.c.toFixed(1)+'%';

  const el = document.getElementById('net-delta');
  el.className = 'net-delta';
  if (S.snaps.length >= 1) {
    const prev = S.snaps[S.snaps.length-1].total;
    const d = t.t - prev, pct = prev > 0 ? (d/prev)*100 : 0;
    el.textContent = (d>=0?'▲ +':'▼ ') + fmt(Math.abs(d)) + ' (' + Math.abs(pct).toFixed(2)+'%) vs última captura';
    el.classList.add(d >= 0 ? 'pos' : 'neg');
  } else {
    el.textContent = 'guarda una captura para ver evolución';
  }
  renderMiniChart();
}

function renderMiniChart() {
  const el  = document.getElementById('mini-bars');
  const cur = tots().t;
  const all = [...S.snaps.map(s => s.total), cur];
  if (all.length < 2) { el.innerHTML = '<span style="font-size:9px;color:var(--text3)">—</span>'; return; }
  const sl = all.slice(-12), mx = Math.max(...sl), mn = Math.min(...sl), rng = mx-mn||1;
  el.innerHTML = sl.map((v,i) => {
    const h = Math.round(6 + ((v-mn)/rng)*30), last = i === sl.length-1;
    return `<div class="mbar${last?' hi':''}" style="height:${h}px" aria-hidden="true"></div>`;
  }).join('');
}

/* ══ PRECIOS EN TIEMPO REAL ══════════════════════════════ */

// Mapa ticker cripto → ID CoinGecko
const CRYPTO_IDS = {
  BTC:'bitcoin', ETH:'ethereum', SOL:'solana', ADA:'cardano', DOT:'polkadot',
  XRP:'ripple', BNB:'binancecoin', DOGE:'dogecoin', AVAX:'avalanche-2',
  LINK:'chainlink', LTC:'litecoin', MATIC:'matic-network', UNI:'uniswap',
  ATOM:'cosmos', ALGO:'algorand', NEAR:'near', FTM:'fantom', SAND:'the-sandbox',
  MANA:'decentraland', CRO:'crypto-com-chain', SHIB:'shiba-inu', TRX:'tron'
};

let fetchingCri = false, fetchingInv = false, fetchingFond = false;

// Estado de actualización por tipo
const priceState = { cri: null, inv: null, fond: null };

function setPriceStatus(type, html) {
  const el = document.getElementById(type + '-price-status');
  if (el) el.innerHTML = html;
}

/* Cripto — CoinGecko (gratis, sin API key) */
async function fetchCriptoPrices() {
  if (fetchingCri || !S.cri.length) return;
  const tickers = [...new Set(S.cri.map(x => x.tick.toUpperCase()))];
  const ids = tickers.map(t => CRYPTO_IDS[t]).filter(Boolean);
  if (!ids.length) {
    setPriceStatus('cri', '<span class="ps-warn">Tickers no reconocidos. Soportados: BTC, ETH, SOL, ADA…</span>');
    return;
  }
  fetchingCri = true;
  setPriceStatus('cri', '<span class="ps-loading">⟳ actualizando precios cripto…</span>');
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=eur&include_24hr_change=true`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const now  = Date.now();
    S.cri = S.cri.map(x => {
      const id = CRYPTO_IDS[x.tick.toUpperCase()];
      if (!id || !data[id]) return x;
      return { ...x, livePrice: data[id].eur, change24h: data[id].eur_24h_change, updatedAt: now };
    });
    save();
    renderCri();
    updateDash();
    maybeRefreshCharts();
    const ts = new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
    setPriceStatus('cri', `<span class="ps-live">● precios en vivo · actualizado ${ts}</span>`);
    priceState.cri = now;
  } catch(e) {
    console.warn('CoinGecko error:', e);
    setPriceStatus('cri', '<span class="ps-error">✕ error al obtener precios (CoinGecko)</span>');
  } finally { fetchingCri = false; }
}

/* Acciones/Fondos — Yahoo Finance vía allorigins proxy */
async function fetchYahooPrices(type) {
  const arr = type === 'inv' ? S.inv : S.fond;
  if (!arr.length) return;
  const flag = type === 'inv' ? 'fetchingInv' : 'fetchingFond';
  if (type === 'inv' && fetchingInv)   return;
  if (type === 'fond' && fetchingFond) return;
  if (type === 'inv')  fetchingInv  = true;
  if (type === 'fond') fetchingFond = true;

  const tickers = [...new Set(arr.map(x => (x.tick||x.symbol||'').toUpperCase()).filter(Boolean))];
  if (!tickers.length) {
    setPriceStatus(type, '<span class="ps-warn">Sin tickers definidos.</span>');
    if (type==='inv') fetchingInv=false; else fetchingFond=false;
    return;
  }
  setPriceStatus(type, '<span class="ps-loading">⟳ actualizando precios…</span>');
  try {
    const yahoo = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(tickers.join(','))}`;
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(yahoo)}`;
    const res   = await fetch(proxy);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data  = await res.json();
    const quotes = Array.isArray(data?.quoteResponse?.result) ? data.quoteResponse.result : [];
    const byTick = {};
    quotes.forEach(q => { byTick[q.symbol.toUpperCase()] = q; });

    const now = Date.now();
    if (type === 'inv') {
      S.inv = S.inv.map(x => {
        const q = byTick[(x.tick||'').toUpperCase()];
        if (!q) return x;
        return { ...x, livePrice: q.regularMarketPrice, change24h: q.regularMarketChangePercent, currency: q.currency, updatedAt: now };
      });
    } else {
      S.fond = S.fond.map(x => {
        const q = byTick[(x.tick||'').toUpperCase()];
        if (!q) return x;
        return { ...x, livePrice: q.regularMarketPrice, change24h: q.regularMarketChangePercent, currency: q.currency, updatedAt: now };
      });
    }
    save();
    if (type==='inv')  renderInv();
    else               renderFond();
    updateDash();
    maybeRefreshCharts();
    const resolved = tickers.filter(t => byTick[t]).length;
    const ts = new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
    const warn = resolved < tickers.length
      ? `<span class="ps-warn"> · ${tickers.length-resolved} ticker(s) no encontrado(s)</span>`
      : '';
    setPriceStatus(type, `<span class="ps-live">● precios en vivo · ${resolved}/${tickers.length} · ${ts}</span>${warn}`);
    priceState[type] = now;
  } catch(e) {
    console.warn('Yahoo Finance error:', e);
    setPriceStatus(type, '<span class="ps-error">✕ error al obtener precios (Yahoo Finance)</span>');
  } finally {
    if (type==='inv') fetchingInv=false; else fetchingFond=false;
  }
}

// Refresco automático cada 60s cuando la pestaña está visible
let priceInterval = null;
function startPriceRefresh() {
  if (priceInterval) clearInterval(priceInterval);
  priceInterval = setInterval(() => {
    const tab = document.querySelector('.tab.active')?.dataset?.tab;
    if (tab === 'cri')  fetchCriptoPrices();
    if (tab === 'inv')  fetchYahooPrices('inv');
  }, 60000);
}

/* ══ TABS ════════════════════════════════════════════════ */
const TAB_IDS = ['overview','banco','inv','fond','cri','hist'];

function setTab(name) {
  TAB_IDS.forEach(id => {
    document.getElementById('pane-'+id).classList.toggle('active', id===name);
    const btn = document.querySelector(`.tab[data-tab="${id}"]`);
    if (btn) { btn.classList.toggle('active', id===name); btn.setAttribute('aria-selected', String(id===name)); }
  });
  if (name==='overview') setTimeout(initCharts, 60);
  if (name==='hist')     renderHist();
  if (name==='cri')      fetchCriptoPrices();
  if (name==='inv')      fetchYahooPrices('inv');
}

document.getElementById('tabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (btn?.dataset?.tab) setTab(btn.dataset.tab);
});

/* ══ GRÁFICAS ════════════════════════════════════════════ */
let evoChart = null, pieChart = null;

function initCharts() {
  try {
    const cur = tots();
    const pts  = [...S.snaps, { label:'HOY', total:cur.t, b:cur.b, i:cur.i, f:cur.f, c:cur.c }];
    const fix  = v => +Number(v||0).toFixed(2);
    const grid = '#0a1828', border = '#0d2235';
    const tick = { color:'#2a4a6a', font:{family:'JetBrains Mono',size:9} };
    const ttip = { backgroundColor:'#0a1828', titleColor:'#3b82f6', bodyColor:'#a8c4e0', borderColor:'#0d2235', borderWidth:1, titleFont:{family:'JetBrains Mono',size:10}, bodyFont:{family:'JetBrains Mono',size:10} };

    if (evoChart) { evoChart.destroy(); evoChart=null; }
    evoChart = new Chart(document.getElementById('ch-evo').getContext('2d'), {
      type:'line',
      data:{ labels:pts.map(s=>s.label), datasets:[
        { label:'total',  data:pts.map(s=>fix(s.total)), borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,0.07)', borderWidth:2, pointRadius:3, pointBackgroundColor:'#3b82f6', tension:0.35, fill:true },
        { label:'bolsa',  data:pts.map(s=>fix(s.i)),     borderColor:'#8b5cf6', backgroundColor:'transparent', borderWidth:1.5, pointRadius:2, pointBackgroundColor:'#8b5cf6', tension:0.35, borderDash:[5,3] },
        { label:'fondos', data:pts.map(s=>fix(s.f)),     borderColor:'#10b981', backgroundColor:'transparent', borderWidth:1.5, pointRadius:2, pointBackgroundColor:'#10b981', tension:0.35, borderDash:[2,3] },
        { label:'cripto', data:pts.map(s=>fix(s.c)),     borderColor:'#f59e0b', backgroundColor:'transparent', borderWidth:1.5, pointRadius:2, pointBackgroundColor:'#f59e0b', tension:0.35, borderDash:[7,3] }
      ]},
      options:{ responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{...ttip, callbacks:{label:ctx=>' '+ctx.dataset.label+': '+fmt(ctx.parsed.y)}} },
        scales:{ x:{ticks:{...tick,maxRotation:30},grid:{color:grid},border:{color:border}}, y:{ticks:{...tick,callback:v=>fmtS(v)},grid:{color:grid},border:{color:border}} }
      }
    });

    if (pieChart) { pieChart.destroy(); pieChart=null; }
    const hasData = cur.t > 0;
    pieChart = new Chart(document.getElementById('ch-pie').getContext('2d'), {
      type:'doughnut',
      data:{ labels:['banco','bolsa','fondos','cripto'], datasets:[{ data:hasData?[cur.b,cur.i,cur.f,cur.c]:[1,1,1,1], backgroundColor:['#3b82f6','#8b5cf6','#10b981','#f59e0b'], borderColor:'#070f1e', borderWidth:3 }] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'68%',
        plugins:{ legend:{display:false}, tooltip:{enabled:hasData, ...ttip, callbacks:{label:ctx=>{ const pct=cur.t>0?(ctx.raw/cur.t*100).toFixed(1):'0'; return ctx.label+': '+fmt(ctx.raw)+' ('+pct+'%)'; }}} }
      }
    });

    const cats=[['banco','#3b82f6',cur.b],['bolsa','#8b5cf6',cur.i],['fondos','#10b981',cur.f],['cripto','#f59e0b',cur.c]];
    document.getElementById('pie-legend').innerHTML = cats.map(([k,color,v])=>`
      <div class="pie-row-item">
        <span class="pie-cat"><span class="leg-dot" style="background:${color}"></span>${k}</span>
        <span><span class="pie-val">${fmtS(v)}</span><span class="pie-pct">${cur.t>0?(v/cur.t*100).toFixed(1):'0'}%</span></span>
      </div>`).join('');
  } catch(e) { console.error('Chart error:', e); }
}

function maybeRefreshCharts() {
  if (document.getElementById('pane-overview').classList.contains('active')) setTimeout(initCharts, 60);
}

/* ══ HELPERS PARA PnL BADGE ══════════════════════════════ */
function pnlBadge(item, type) {
  if (type === 'banco') return '';
  const p = pnl(item, type);
  const sign = p.gain >= 0 ? '+' : '';
  const cls  = p.gain >= 0 ? 'pnl-pos' : 'pnl-neg';
  const live = p.hasLive ? '' : ' <span class="pnl-stale" title="precio manual">*</span>';
  return `<div class="pnl-badge ${cls}">${sign}${fmt(p.gain)} · ${sign}${p.pct.toFixed(2)}%${live}</div>`;
}

function livePriceBadge(item) {
  if (item.livePrice == null) return '';
  const sign = (item.change24h||0) >= 0 ? '+' : '';
  const cls  = (item.change24h||0) >= 0 ? 'pos' : 'neg';
  return `<span class="live-price ${cls}">${fmt(item.livePrice)} <small>${sign}${Number(item.change24h||0).toFixed(2)}%</small></span>`;
}

/* ══ RENDER LISTAS ═══════════════════════════════════════ */

function renderBanco() {
  const el = document.getElementById('list-banco');
  if (!S.banco.length) { el.innerHTML='<div class="empty-state">// sin cuentas registradas</div>'; return; }
  el.innerHTML = '<div class="asset-list">'+S.banco.map((x,i)=>`
    <div class="asset-wrap">
      <div class="asset asset-4col">
        <div>
          <div class="a-tick" style="color:var(--blue)">${esc(x.name)}</div>
          <div class="a-sub">cuenta bancaria</div>
        </div>
        <div></div>
        <div class="a-right"><div class="a-val">${fmt(x.bal)}</div></div>
        <div class="a-actions">
          <button class="btn-icon" data-action="edit-banco" data-idx="${i}" aria-label="Editar ${esc(x.name)}">✎</button>
          <button class="btn-icon btn-icon-del" data-action="del-banco" data-idx="${i}" aria-label="Eliminar ${esc(x.name)}">✕</button>
        </div>
      </div>
      <div class="edit-panel" id="ep-banco-${i}" style="display:none">
        <div class="form-row fr2">
          <div class="field"><label class="field-label" for="eb-name-${i}">nombre</label><input class="inp" id="eb-name-${i}" value="${esc(x.name)}"></div>
          <div class="field"><label class="field-label" for="eb-bal-${i}">saldo (€)</label><input class="inp" type="number" id="eb-bal-${i}" value="${x.bal}" step="0.01"></div>
        </div>
        <div class="edit-btns">
          <button class="btn btn-save" data-action="save-banco" data-idx="${i}">guardar</button>
          <button class="btn btn-ghost" data-action="cancel-edit" data-target="ep-banco-${i}">cancelar</button>
        </div>
      </div>
    </div>`).join('')+'</div>';
}

function renderInv() {
  const el = document.getElementById('list-inv');
  if (!S.inv.length) { el.innerHTML='<div class="empty-state">// sin posiciones registradas</div>'; return; }
  el.innerHTML = '<div class="asset-list">'+S.inv.map((x,i)=>{
    const p   = pnl(x,'inv');
    const val = p.cur ?? Number(x.qty||0)*Number(x.price||0);
    return `
    <div class="asset-wrap">
      <div class="asset asset-4col">
        <div>
          <div class="a-tick" style="color:var(--purple)">${esc(x.tick||x.name||'—')}</div>
          <div class="a-sub">${fmtQty(x.qty,4)} acc · pmedio ${fmt(x.price)}</div>
          ${livePriceBadge(x)}
        </div>
        <div>${pnlBadge(x,'inv')}</div>
        <div class="a-right"><div class="a-val">${fmt(val)}</div></div>
        <div class="a-actions">
          <button class="btn-icon" data-action="edit-inv" data-idx="${i}" aria-label="Editar ${esc(x.tick)}">✎</button>
          <button class="btn-icon btn-icon-del" data-action="del-inv" data-idx="${i}" aria-label="Eliminar ${esc(x.tick)}">✕</button>
        </div>
      </div>
      <div class="edit-panel" id="ep-inv-${i}" style="display:none">
        <div class="form-row fr3">
          <div class="field"><label class="field-label" for="ei-tick-${i}">ticker</label><input class="inp" id="ei-tick-${i}" value="${esc(x.tick||'')}"></div>
          <div class="field"><label class="field-label" for="ei-qty-${i}">cantidad</label><input class="inp" type="number" id="ei-qty-${i}" value="${x.qty}" step="0.0001"></div>
          <div class="field"><label class="field-label" for="ei-price-${i}">precio medio (€)</label><input class="inp" type="number" id="ei-price-${i}" value="${x.price}" step="0.01"></div>
        </div>
        <div class="edit-btns">
          <button class="btn btn-save" data-action="save-inv" data-idx="${i}">guardar</button>
          <button class="btn btn-ghost" data-action="cancel-edit" data-target="ep-inv-${i}">cancelar</button>
        </div>
      </div>
    </div>`;
  }).join('')+'</div>';
}

function renderFond() {
  const el = document.getElementById('list-fond');
  if (!S.fond.length) { el.innerHTML='<div class="empty-state">// sin fondos registrados</div>'; return; }
  el.innerHTML = '<div class="asset-list">'+S.fond.map((x,i)=>{
    const item = normalizeFund(x);
    S.fond[i] = item;
    const p   = pnl(item,'fond');
    const val = p.cur;
    return `
    <div class="asset-wrap">
      <div class="asset asset-4col">
        <div>
          <div class="a-tick" style="color:var(--green)">${esc(item.name)}</div>
          <div class="a-sub">inversión inicial ${fmt(item.initial)} · ${item.pct >= 0 ? '+' : ''}${Number(item.pct).toFixed(2)}%</div>
        </div>
        <div>${pnlBadge(item,'fond')}</div>
        <div class="a-right"><div class="a-val">${fmt(val)}</div></div>
        <div class="a-actions">
          <button class="btn-icon" data-action="edit-fond" data-idx="${i}" aria-label="Editar ${esc(item.name)}">✎</button>
          <button class="btn-icon btn-icon-del" data-action="del-fond" data-idx="${i}" aria-label="Eliminar ${esc(item.name)}">✕</button>
        </div>
      </div>
      <div class="edit-panel" id="ep-fond-${i}" style="display:none">
        <div class="form-row fr2">
          <div class="field"><label class="field-label" for="ef-name-${i}">nombre</label><input class="inp" id="ef-name-${i}" value="${esc(item.name)}"></div>
          <div class="field"><label class="field-label" for="ef-init-${i}">inversión inicial (€)</label><input class="inp" type="number" id="ef-init-${i}" value="${item.initial}" step="0.01"></div>
        </div>
        <div class="form-row fr2">
          <div class="field"><label class="field-label" for="ef-pct-${i}">ganancia / pérdida (%)</label><input class="inp" type="number" id="ef-pct-${i}" value="${item.pct}" step="0.01"></div>
        </div>
        <div class="edit-btns">
          <button class="btn btn-save" data-action="save-fond" data-idx="${i}">guardar</button>
          <button class="btn btn-ghost" data-action="cancel-edit" data-target="ep-fond-${i}">cancelar</button>
        </div>
      </div>
    </div>`;
  }).join('')+'</div>';
}

function renderCri() {
  const el = document.getElementById('list-cri');
  if (!S.cri.length) { el.innerHTML='<div class="empty-state">// sin cripto registrada</div>'; return; }
  el.innerHTML = '<div class="asset-list">'+S.cri.map((x,i)=>{
    const p   = pnl(x,'cri');
    const val = p.cur ?? Number(x.qty||0)*Number(x.price||0);
    return `
    <div class="asset-wrap">
      <div class="asset asset-4col">
        <div>
          <div class="a-tick" style="color:var(--amber)">${esc(x.tick)}</div>
          <div class="a-sub">${fmtQty(x.qty,8)} · pmedio ${fmt(x.price)}</div>
          ${livePriceBadge(x)}
        </div>
        <div>${pnlBadge(x,'cri')}</div>
        <div class="a-right"><div class="a-val">${fmt(val)}</div></div>
        <div class="a-actions">
          <button class="btn-icon" data-action="edit-cri" data-idx="${i}" aria-label="Editar ${esc(x.tick)}">✎</button>
          <button class="btn-icon btn-icon-del" data-action="del-cri" data-idx="${i}" aria-label="Eliminar ${esc(x.tick)}">✕</button>
        </div>
      </div>
      <div class="edit-panel" id="ep-cri-${i}" style="display:none">
        <div class="form-row fr3">
          <div class="field"><label class="field-label" for="ec-tick-${i}">ticker</label><input class="inp" id="ec-tick-${i}" value="${esc(x.tick)}"></div>
          <div class="field"><label class="field-label" for="ec-qty-${i}">cantidad</label><input class="inp" type="number" id="ec-qty-${i}" value="${x.qty}" step="0.00000001"></div>
          <div class="field"><label class="field-label" for="ec-price-${i}">precio medio (€)</label><input class="inp" type="number" id="ec-price-${i}" value="${x.price}" step="0.01"></div>
        </div>
        <div class="edit-btns">
          <button class="btn btn-save" data-action="save-cri" data-idx="${i}">guardar</button>
          <button class="btn btn-ghost" data-action="cancel-edit" data-target="ep-cri-${i}">cancelar</button>
        </div>
      </div>
    </div>`;
  }).join('')+'</div>';
}

/* ══ DELEGACIÓN DE EVENTOS ═══════════════════════════════ */
document.getElementById('app').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const idx    = parseInt(btn.dataset.idx, 10);

  // Abrir/cerrar panel edición
  if (action.startsWith('edit-')) {
    const type = action.replace('edit-','');
    const panelId = `ep-${type}-${idx}`;
    const panel   = document.getElementById(panelId);
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    document.querySelectorAll(`.edit-panel[id^="ep-${type}-"]`).forEach(p => p.style.display='none');
    panel.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) panel.querySelector('.inp')?.focus();
    return;
  }

  if (action === 'cancel-edit') {
    const t = document.getElementById(btn.dataset.target);
    if (t) t.style.display = 'none';
    return;
  }

  // Guardar
  if (action === 'save-banco') {
    const name = document.getElementById(`eb-name-${idx}`).value.trim();
    const bal  = parseFloat(document.getElementById(`eb-bal-${idx}`).value);
    if (!name || isNaN(bal)||bal<0) { toast('Nombre y saldo válidos.','error'); return; }
    S.banco[idx].name = name; S.banco[idx].bal = bal;
    save(); renderBanco(); updateDash(); maybeRefreshCharts();
    toast('Cuenta actualizada', 'success'); return;
  }
  if (action === 'save-inv') {
    const tick  = document.getElementById(`ei-tick-${idx}`).value.trim().toUpperCase();
    const qty   = parseFloat(document.getElementById(`ei-qty-${idx}`).value);
    const price = parseFloat(document.getElementById(`ei-price-${idx}`).value);
    if (!tick||isNaN(qty)||qty<=0||isNaN(price)||price<=0) { toast('Todos los campos son obligatorios.','error'); return; }
    S.inv[idx] = { ...S.inv[idx], tick, qty, price, livePrice: undefined, change24h: undefined };
    save(); renderInv(); updateDash(); maybeRefreshCharts();
    toast('Posición actualizada', 'success');
    fetchYahooPrices('inv'); return;
  }
  if (action === 'save-fond') {
    const name  = document.getElementById(`ef-name-${idx}`).value.trim();
    const initial = parseFloat(document.getElementById(`ef-init-${idx}`).value);
    const pct = parseFloat(document.getElementById(`ef-pct-${idx}`).value);
    if (!name || isNaN(initial) || initial < 0 || isNaN(pct)) { toast('Nombre, inversión inicial y porcentaje válidos.','error'); return; }
    S.fond[idx] = normalizeFund({ ...S.fond[idx], name, initial, pct });
    save(); renderFond(); updateDash(); maybeRefreshCharts();
    toast('Fondo actualizado', 'success');
    return;
  }
  if (action === 'save-cri') {
    const tick  = document.getElementById(`ec-tick-${idx}`).value.trim().toUpperCase();
    const qty   = parseFloat(document.getElementById(`ec-qty-${idx}`).value);
    const price = parseFloat(document.getElementById(`ec-price-${idx}`).value);
    if (!tick||isNaN(qty)||qty<=0||isNaN(price)||price<=0) { toast('Todos los campos son obligatorios.','error'); return; }
    S.cri[idx] = { ...S.cri[idx], tick, qty, price, livePrice:undefined, change24h:undefined };
    save(); renderCri(); updateDash(); maybeRefreshCharts();
    toast('Cripto actualizada', 'success');
    fetchCriptoPrices(); return;
  }

  // Eliminar
  const delMap = { 'del-banco':'banco','del-inv':'inv','del-fond':'fond','del-cri':'cri' };
  if (delMap[action]) {
    const type = delMap[action];
    const labels = { banco:'esta cuenta', inv:'esta posición', fond:'este fondo', cri:'esta cripto' };
    showConfirmModal('¿Eliminar ' + labels[type] + '?', () => {
      S[type].splice(idx, 1);
      save();
      if (type==='banco') renderBanco();
      if (type==='inv')   renderInv();
      if (type==='fond')  renderFond();
      if (type==='cri')   renderCri();
      updateDash(); maybeRefreshCharts();
      toast('Eliminado', 'info');
    });
  }
  // (fondos ya no usan ticker ni apertura externa)
});

/* ══ FORMULARIOS AÑADIR ══════════════════════════════════ */
function clearInputs(ids) { ids.forEach(id => { const el=document.getElementById(id); if(el) el.value=''; }); }

function flashError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('inp-error');
  const orig = el.placeholder;
  el.placeholder = msg;
  el.focus();
  setTimeout(() => { el.classList.remove('inp-error'); el.placeholder = orig; }, 2500);
}

function addBanco() {
  const name = document.getElementById('b-name').value.trim();
  const bal  = parseFloat(document.getElementById('b-bal').value);
  if (!name)               { flashError('b-name','Introduce el nombre.'); return; }
  if (isNaN(bal)||bal<0)   { flashError('b-bal','Saldo no válido.'); return; }
  S.banco.push({ name, bal });
  clearInputs(['b-name','b-bal']);
  save(); renderBanco(); updateDash(); maybeRefreshCharts();
  toast('Cuenta añadida', 'success');
}

function addInv() {
  const tick  = document.getElementById('i-tick').value.trim().toUpperCase();
  const qty   = parseFloat(document.getElementById('i-qty').value);
  const price = parseFloat(document.getElementById('i-price').value);
  if (!tick)                  { flashError('i-tick','Introduce el ticker.'); return; }
  if (isNaN(qty)||qty<=0)     { flashError('i-qty','Cantidad no válida.'); return; }
  if (isNaN(price)||price<=0) { flashError('i-price','Precio no válido.'); return; }
  const ex = S.inv.find(x => x.tick === tick);
  if (ex) { const nt=ex.qty+qty; ex.price=(ex.qty*ex.price+qty*price)/nt; ex.qty=nt; ex.livePrice=undefined; }
  else S.inv.push({ tick, qty, price });
  clearInputs(['i-tick','i-qty','i-price']);
  save(); renderInv(); updateDash(); maybeRefreshCharts();
  toast('Posición añadida', 'success');
  fetchYahooPrices('inv');
}

function addFond() {
  const name  = document.getElementById('f-name').value.trim();
  const initial = parseFloat(document.getElementById('f-init').value);
  const pct = parseFloat(document.getElementById('f-pct').value);
  if (!name)                  { flashError('f-name','Introduce el nombre.'); return; }
  if (isNaN(initial)||initial<0) { flashError('f-init','Inversión inicial no válida.'); return; }
  if (isNaN(pct))               { flashError('f-pct','Porcentaje no válido.'); return; }
  S.fond.push(normalizeFund({ name, initial, pct }));
  clearInputs(['f-name','f-init','f-pct']);
  save(); renderFond(); updateDash(); maybeRefreshCharts();
  toast('Fondo añadido', 'success');
}

function addCri() {
  const tick  = document.getElementById('c-tick').value.trim().toUpperCase();
  const qty   = parseFloat(document.getElementById('c-qty').value);
  const price = parseFloat(document.getElementById('c-price').value);
  if (!tick)                  { flashError('c-tick','Introduce el ticker.'); return; }
  if (isNaN(qty)||qty<=0)     { flashError('c-qty','Cantidad no válida.'); return; }
  if (isNaN(price)||price<=0) { flashError('c-price','Precio no válido.'); return; }
  if (!CRYPTO_IDS[tick]) {
    toast(`Ticker "${tick}" no reconocido. Soportados: BTC, ETH, SOL, ADA, XRP, BNB…`, 'error', 5000);
  }
  const ex = S.cri.find(x => x.tick === tick);
  if (ex) { const nt=ex.qty+qty; ex.price=(ex.qty*ex.price+qty*price)/nt; ex.qty=nt; ex.livePrice=undefined; }
  else S.cri.push({ tick, qty, price });
  clearInputs(['c-tick','c-qty','c-price']);
  save(); renderCri(); updateDash(); maybeRefreshCharts();
  toast('Cripto añadida', 'success');
  fetchCriptoPrices();
}

// Listeners
document.getElementById('btn-add-banco').addEventListener('click', addBanco);
document.getElementById('btn-add-inv')  .addEventListener('click', addInv);
document.getElementById('btn-add-fond') .addEventListener('click', addFond);
document.getElementById('btn-add-cri')  .addEventListener('click', addCri);

['b-name','b-bal'].forEach(id => document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') addBanco(); }));
['i-tick','i-qty','i-price'].forEach(id => document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') addInv(); }));
['f-name','f-init','f-pct'].forEach(id => document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') addFond(); }));
['c-tick','c-qty','c-price'].forEach(id => document.getElementById(id).addEventListener('keydown', e => { if(e.key==='Enter') addCri(); }));

/* ══ HISTORIAL ═══════════════════════════════════════════ */
function saveSnap() {
  const t=tots(), now=new Date();
  S.snaps.push({ ts:now.toISOString(), label:now.toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'2-digit'}), total:t.t, b:t.b, i:t.i, f:t.f, c:t.c });
  if (S.snaps.length > 48) S.snaps.shift();
  save(); renderHist(); updateDash(); maybeRefreshCharts();
  toast('Captura guardada: ' + fmt(t.t), 'success');
}

function renderHist() {
  const hc=document.getElementById('hist-card'), hl=document.getElementById('hist-list');
  if (!S.snaps.length) { hc.style.display='none'; return; }
  hc.style.display='block';
  document.getElementById('snap-count').textContent = S.snaps.length+' capturas';
  const rev=[...S.snaps].reverse();
  hl.innerHTML = rev.map((s,i)=>{
    const origIdx=S.snaps.length-1-i, prev=rev[i+1];
    let d='<span class="hist-delta neu">primera captura</span>';
    if (prev) {
      const diff=s.total-prev.total, pct=prev.total>0?(diff/prev.total)*100:0;
      d=`<span class="hist-delta ${diff>=0?'pos':'neg'}">${diff>=0?'▲ +':'▼ '}${fmt(Math.abs(diff))} (${Math.abs(pct).toFixed(1)}%)</span>`;
    }
    return `<div class="hist-row"><span class="hist-date">${s.label}</span><span class="hist-total">${fmt(s.total)}</span>${d}<button class="btn-sm" data-snap-del="${origIdx}" aria-label="Eliminar captura">✕</button></div>`;
  }).join('');
}

document.getElementById('hist-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-snap-del]');
  if (!btn) return;
  const i = parseInt(btn.dataset.snapDel, 10);
  showConfirmModal('¿Eliminar esta captura?', () => {
    S.snaps.splice(i,1); save(); renderHist(); updateDash(); maybeRefreshCharts();
    toast('Captura eliminada','info');
  });
});

document.getElementById('btn-snap').addEventListener('click', saveSnap);

/* ══ EXPORT / IMPORT ═════════════════════════════════════ */
document.getElementById('btn-export').addEventListener('click', () => {
  const payload = { ...S, appVersion:'3.0', exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='wealthterm-'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(a.href);
  toast('JSON exportado','success');
});

document.getElementById('btn-export-csv').addEventListener('click', () => {
  const rows = [['fecha','total','banco','bolsa','fondos','cripto']];
  S.snaps.forEach(s => rows.push([s.label, s.total.toFixed(2), (s.b||0).toFixed(2), (s.i||0).toFixed(2), (s.f||0).toFixed(2), (s.c||0).toFixed(2)]));
  const cur=tots();
  rows.push(['HOY',cur.t.toFixed(2),cur.b.toFixed(2),cur.i.toFixed(2),cur.f.toFixed(2),cur.c.toFixed(2)]);
  const csv=rows.map(r=>r.join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='wealthterm-'+new Date().toISOString().slice(0,10)+'.csv';
  a.click(); URL.revokeObjectURL(a.href);
  toast('CSV exportado','success');
});

document.getElementById('import-file').addEventListener('change', e => {
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try {
      const data=JSON.parse(ev.target.result);
      if (!data||typeof data!=='object') throw new Error('JSON no válido');
      S={ banco:Array.isArray(data.banco)?data.banco:[], inv:Array.isArray(data.inv)?data.inv:[], fond:Array.isArray(data.fond)?data.fond:[], cri:Array.isArray(data.cri)?data.cri:[], snaps:Array.isArray(data.snaps)?data.snaps:[] };
      save(); renderBanco(); renderInv(); renderFond(); renderCri(); updateDash(); renderHist(); maybeRefreshCharts();
      toast('Datos importados correctamente','success');
    } catch(err) { toast('Error al importar: '+err.message,'error',5000); }
  };
  reader.readAsText(file); e.target.value='';
});

/* ══ RELOJ ═══════════════════════════════════════════════ */
function updateClock() {
  const n=new Date();
  document.getElementById('clock').innerHTML =
    n.toLocaleDateString('es-ES',{weekday:'short',day:'2-digit',month:'short'})+'&nbsp;&nbsp;'+
    n.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
}
setInterval(updateClock, 1000);
updateClock();

/* ══ ARRANQUE ════════════════════════════════════════════ */
renderBanco(); renderInv(); renderFond(); renderCri();
updateDash();
setTimeout(initCharts, 200);
startPriceRefresh();
