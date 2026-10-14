'use strict';

/* =========================================================
   Controle de Cobranças — protótipo sem backend
   - Tudo é salvo no LocalStorage deste navegador.
   - Valores em dinheiro são guardados em CENTAVOS (inteiros),
     para evitar erros de arredondamento.
   ========================================================= */

const STORAGE_KEY = 'controle_cobrancas_v1';

/* ---------------------------------------------------------
   Utilidades
   --------------------------------------------------------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));
const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const onlyDigits = s => String(s ?? '').replace(/\D/g, '');
const byName = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');

const brl = cents => (cents / 100)
  .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  .replace(/\u00a0/g, ' ');

const centsToInput = cents => (cents / 100).toFixed(2).replace('.', ',');

function parseMoney(value) {
  let v = String(value ?? '').trim().replace(/[^\d.,]/g, '');
  if (!v) return NaN;
  if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

function normalizePhone(value) {
  const d = onlyDigits(value);
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return d;
  if (d.length === 10 || d.length === 11) return '55' + d;
  return null;
}

function formatPhone(value) {
  let d = onlyDigits(value);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

function maskPhoneInput(el) {
  let d = onlyDigits(el.value);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
  d = d.slice(0, 11);
  let out = d;
  if (d.length > 10) out = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  else if (d.length > 6) out = `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  else if (d.length > 2) out = `(${d.slice(0, 2)}) ${d.slice(2)}`;
  else if (d.length > 0) out = `(${d}`;
  el.value = out;
}

const initials = name => {
  const p = String(name).trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
};

const fmtDateTime = iso => new Date(iso).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
});
const fmtDate = iso => new Date(iso).toLocaleDateString('pt-BR');

/* Meses */
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
  'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = key => { const [y, m] = key.split('-'); return `${MESES[+m - 1].toUpperCase()} ${y}`; };
const monthLabelSoft = key => { const [y, m] = key.split('-'); return `${MESES[+m - 1]} de ${y}`; };
const shiftMonth = (key, delta) => {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y, m - 1 + delta, 1));
};

/* Ícones (SVG inline, sem dependências externas) */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  wallet: '<rect x="2.5" y="6" width="19" height="13" rx="2.5"/><path d="M2.5 10h19"/><circle cx="17" cy="14.5" r="1.2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6"/><path d="M18.5 14.8c1.7.8 2.7 2.6 3 5.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  message: '<path d="M4 5.5h16a1 1 0 0 1 1 1V16a1 1 0 0 1-1 1H10l-5 4v-4H4a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1z"/>',
  table: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 10h17M3.5 15h17M9.5 4.5v15"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5v4h4"/><path d="M12 7.5V12l3 2"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  edit: '<path d="M4 20h4.2L19.5 8.7a2.1 2.1 0 0 0-3-3L5.2 17z"/><path d="m14.5 7.7 3 3"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 19.5h15"/>',
  hanger: '<path d="M12 8.2a2.2 2.2 0 1 0-2.2-2.2"/><path d="M12 8.2v2L3.5 16.2a1.3 1.3 0 0 0 .8 2.3h15.4a1.3 1.3 0 0 0 .8-2.3L12 10.2"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  chevL: '<path d="m14.5 6-6 6 6 6"/>',
  chevR: '<path d="m9.5 6 6 6-6 6"/>',
  printer: '<path d="M7 9V4.5h10V9"/><rect x="4" y="9" width="16" height="8" rx="2"/><path d="M7 14h10v5.5H7z"/>',
  alert: '<path d="M12 4 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.2v.1"/>'
};
const icon = (name, size = 20) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

/* ---------------------------------------------------------
   Estado e persistência
   --------------------------------------------------------- */
const DEFAULT_TEMPLATE =
`Olá, {nome}! 😊

Passando para lembrar da sua compra de roupas ({mes}).

{detalhes}

Chave Pix: {pix}

Qualquer dúvida é só me chamar. Obrigada! 🙏`;

function defaults() {
  return {
    clients: [],
    payments: [],
    history: [],
    selection: {},   // { '2026-10': { clientId: true } }
    charged: {},     // { '2026-10': { clientId: isoDate } }
    settings: { pix: '', alertAfter: 2, template: DEFAULT_TEMPLATE }
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults();
    return mergeData(JSON.parse(raw));
  } catch (err) {
    console.error('Falha ao ler os dados salvos:', err);
    return defaults();
  }
}

function mergeData(data) {
  const base = defaults();
  const d = Object.assign(base, data || {});
  d.settings = Object.assign(defaults().settings, (data && data.settings) || {});
  ['clients', 'payments', 'history'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
  ['selection', 'charged'].forEach(k => { if (!d[k] || typeof d[k] !== 'object') d[k] = {}; });
  return d;
}

let state = load();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error(err);
    toast('Não foi possível salvar os dados neste navegador.', 'error');
    return false;
  }
}

/* Estado da interface (não persiste) */
let viewMonth = monthKey();
let draft = null;
const ui = {
  page: 'dashboard',
  filterCob: 'mes', searchCob: '',
  filterCli: 'todos', searchCli: '',
  histFilter: 'todos', histSearch: '',
  msgClient: null
};

/* ---------------------------------------------------------
   Regras de negócio
   --------------------------------------------------------- */
const getClient = id => state.clients.find(c => c.id === id);
const isPaid = c => c.pagas >= c.parcelas;
const restante = c => c.total - c.pago;
const isCharged = (id, month = viewMonth) => !!(state.charged[month] || {})[id];

/* Valor da parcela n (1..parcelas). A última absorve a diferença de centavos. */
function installmentValue(c, n) {
  const base = Math.floor(c.total / c.parcelas);
  return n === c.parcelas ? c.total - base * (c.parcelas - 1) : base;
}
const currentInstallment = c => Math.min(c.pagas + 1, c.parcelas);
const currentValue = c => (isPaid(c) ? 0 : installmentValue(c, c.pagas + 1));

function statusOf(c) {
  if (isPaid(c)) return 'pago';
  if (c.semPagamento >= state.settings.alertAfter) return 'atencao';
  return c.pagas > 0 ? 'andamento' : 'pendente';
}
const STATUS_LABEL = { pago: 'Pago', pendente: 'Pendente', andamento: 'Em andamento', atencao: 'Atenção' };
const statusBadge = c => { const s = statusOf(c); return `<span class="badge badge-${s}">${STATUS_LABEL[s]}</span>`; };

const monthSel = (month = viewMonth) => state.selection[month] || {};
const monthList = (month = viewMonth) => state.clients.filter(c => monthSel(month)[c.id]).sort(byName);
const eligibleClients = (month = viewMonth) =>
  state.clients.filter(c => !isPaid(c) || monthSel(month)[c.id]).sort(byName);

function log(tipo, texto, clientId = null) {
  state.history.unshift({ id: uid(), data: new Date().toISOString(), tipo, texto, clientId });
  if (state.history.length > 1500) state.history.length = 1500;
}

function describePlan(c) {
  return c.tipo === 'avista'
    ? `à vista, ${brl(c.total)}`
    : `${c.parcelas}x de ${brl(installmentValue(c, 1))}`;
}

/* Registra um pagamento (sem salvar nem redesenhar) */
function applyPayment(c) {
  const n = c.pagas + 1;
  const valor = installmentValue(c, n);
  c.pagas = n;
  c.pago += valor;
  c.semPagamento = 0;
  state.payments.unshift({
    id: uid(), clientId: c.id, nome: c.nome, valor,
    parcela: n, parcelas: c.parcelas, tipo: c.tipo,
    mes: monthKey(), data: new Date().toISOString()
  });
  log('pagamento', c.tipo === 'avista'
    ? `Pagamento de ${brl(valor)} recebido de ${c.nome}`
    : `Parcela ${n}/${c.parcelas} (${brl(valor)}) recebida de ${c.nome}`, c.id);
  if (isPaid(c)) log('pagamento', `${c.nome} quitou a compra`, c.id);
  return valor;
}

function setCharged(id, value) {
  const c = getClient(id);
  if (!c) return;
  const m = viewMonth;
  state.charged[m] = state.charged[m] || {};
  const was = !!state.charged[m][id];
  if (value === was) return;
  if (value) {
    state.charged[m][id] = new Date().toISOString();
    c.semPagamento = (c.semPagamento || 0) + 1;
    // quem foi cobrado no mês entra na lista de cobranças do mês
    state.selection[m] = state.selection[m] || {};
    state.selection[m][id] = true;
    if (draft && draft.month === m) draft.map[id] = true;
    log('cobranca', `Cobrança de ${monthLabelSoft(m)} registrada para ${c.nome}`, id);
    toast(`Cobrança de ${c.nome} registrada.`);
  } else {
    delete state.charged[m][id];
    c.semPagamento = Math.max(0, (c.semPagamento || 0) - 1);
    log('cobranca', `Cobrança de ${monthLabelSoft(m)} desmarcada para ${c.nome}`, id);
    toast('Cobrança desmarcada.', 'info');
  }
  save();
  render();
}

/* Mensagem de cobrança */
const SAMPLE = { id: '_sample', nome: 'Maria Silva', whatsapp: '', total: 30000, tipo: 'parcelado', parcelas: 3, pagas: 0, pago: 0, semPagamento: 0 };

function buildMessage(c, month = viewMonth, tplOverride) {
  let tpl = tplOverride ?? state.settings.template;
  const pix = (state.settings.pix || '').trim();
  if (!pix) tpl = tpl.split('\n').filter(l => !l.includes('{pix}')).join('\n');

  let detalhes;
  if (isPaid(c)) detalhes = '✅ Compra quitada';
  else if (c.tipo === 'avista') detalhes = `💰 Valor: ${brl(restante(c))}`;
  else detalhes = `💰 Valor da parcela: ${brl(currentValue(c))}\n📦 Parcela: ${currentInstallment(c)}/${c.parcelas}`;

  const map = {
    nome: c.nome.trim().split(/\s+/)[0],
    nome_completo: c.nome.trim(),
    valor: brl(isPaid(c) ? 0 : (c.tipo === 'avista' ? restante(c) : currentValue(c))),
    parcela: c.tipo === 'avista' ? '' : `${currentInstallment(c)}/${c.parcelas}`,
    restante: brl(restante(c)),
    total: brl(c.total),
    mes: monthLabelSoft(month),
    pix,
    detalhes
  };
  return tpl
    .replace(/\{(\w+)\}/g, (all, key) => (key in map ? map[key] : all))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const waUrl = (phone, text) => `https://wa.me/${onlyDigits(phone)}?text=${encodeURIComponent(text)}`;

/* ---------------------------------------------------------
   Toast, modal e confirmação
   --------------------------------------------------------- */
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(type === 'error' ? 'alert' : 'check', 18)}<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 3400);
}

let modalResolve = null;
let lastFocus = null;

function openModal({ title, body, footer = '', size = '' }) {
  closeModal(false, true);
  lastFocus = document.activeElement;
  $('#modal-root').innerHTML = `
    <div class="modal-backdrop">
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
        <header class="modal-head">
          <h2 id="modal-title">${esc(title)}</h2>
          <button class="icon-btn" data-act="close-modal" aria-label="Fechar">${icon('x')}</button>
        </header>
        <div class="modal-body">${body}</div>
        ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
      </div>
    </div>`;
  document.body.classList.add('modal-open');
  const first = $('#modal-root input:not([type=hidden]):not([disabled]):not([type=radio]), #modal-root textarea');
  setTimeout(() => (first || $('#modal-root .modal'))?.focus(), 30);
}

function closeModal(result = false, silent = false) {
  const root = $('#modal-root');
  if (!root.innerHTML && !modalResolve) return;
  root.innerHTML = '';
  document.body.classList.remove('modal-open');
  if (modalResolve) { const r = modalResolve; modalResolve = null; r(result); }
  if (!silent && lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) { /* ignora */ } }
}

function confirmDialog({ title, message, confirmText = 'Confirmar', danger = false }) {
  return new Promise(resolve => {
    openModal({
      title, size: 'sm',
      body: `<p class="confirm-text">${esc(message)}</p>`,
      footer: `<button class="btn btn-ghost" data-act="close-modal">Cancelar</button>
               <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="confirm-yes">${esc(confirmText)}</button>`
    });
    modalResolve = resolve;
  });
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* tenta o método antigo */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ---------------------------------------------------------
   Componentes de tela
   --------------------------------------------------------- */
const pageHead = (title, sub, actions = '') => `
  <header class="page-head">
    <div><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </header>`;

const emptyState = ({ ic = 'users', title, text, actions = '' }) => `
  <div class="empty">
    <div class="empty-ic">${icon(ic, 28)}</div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${actions ? `<div class="empty-actions">${actions}</div>` : ''}
  </div>`;

const chip = (label, act, val, active, count) =>
  `<button class="chip ${active ? 'is-active' : ''}" data-act="${act}" data-val="${val}" aria-pressed="${active}">${label}${count != null ? `<span class="chip-count">${count}</span>` : ''}</button>`;

const statCard = ({ label, value, note, tone = 'brand', ic, cls = '' }) => `
  <article class="stat ${cls}">
    <div class="stat-top"><span class="stat-ic tone-${tone}">${icon(ic, 18)}</span><span class="stat-label">${label}</span></div>
    <div class="stat-value">${value}</div>
    <div class="stat-note">${note}</div>
  </article>`;

function valueLine(c) {
  if (isPaid(c)) return 'Compra quitada';
  return c.tipo === 'avista'
    ? `Valor: ${brl(restante(c))}`
    : `Parcela ${currentInstallment(c)}/${c.parcelas} de ${brl(currentValue(c))}`;
}

/* Tabela de cobranças (vira cards no celular) */
function billingRow(c) {
  const paid = isPaid(c);
  const valor = paid
    ? '<span class="muted">Quitado</span>'
    : c.tipo === 'avista'
      ? `<strong>${brl(restante(c))}</strong>`
      : `<strong>${brl(currentValue(c))}</strong><span class="sub">de ${brl(c.total)}</span>`;
  const parcela = c.tipo === 'avista' ? '<span class="muted">—</span>'
    : `${paid ? c.parcelas : c.pagas + 1}/${c.parcelas}`;
  const cobrado = paid
    ? '<span class="muted">—</span>'
    : isCharged(c.id)
      ? `<button class="flag flag-yes" data-act="toggle-charged" data-id="${c.id}" title="Clique para desmarcar">${icon('check', 14)}Sim</button>`
      : `<button class="flag flag-no" data-act="toggle-charged" data-id="${c.id}" title="Clique para marcar como cobrado">Não</button>`;
  const acoes = paid
    ? `<button class="btn btn-ghost btn-sm" data-act="view-client" data-id="${c.id}">Ver detalhes</button>`
    : `<button class="btn btn-soft btn-sm" data-act="charge" data-id="${c.id}">💬 Cobrar</button>
       <button class="btn btn-ok btn-sm" data-act="mark-paid" data-id="${c.id}">✓ Marcar como pago</button>`;
  return `<tr>
    <td class="cell-name"><div class="who"><span class="avatar">${esc(initials(c.nome))}</span><div><strong>${esc(c.nome)}</strong></div></div></td>
    <td data-label="WhatsApp" class="num">${esc(formatPhone(c.whatsapp))}</td>
    <td data-label="Pagamento">${c.tipo === 'avista' ? 'À vista' : `Parcelado em ${c.parcelas}x`}</td>
    <td data-label="Valor" class="num">${valor}</td>
    <td data-label="Parcela" class="num">${parcela}</td>
    <td data-label="Status">${statusBadge(c)}</td>
    <td data-label="Cobrado?">${cobrado}</td>
    <td class="cell-actions" data-label="Ações">${acoes}</td>
  </tr>`;
}

const billingTable = list => `
  <div class="table-wrap card">
    <table class="rtable">
      <thead><tr><th>Nome</th><th>WhatsApp</th><th>Pagamento</th><th>Valor</th><th>Parcela</th><th>Status</th><th>Cobrado?</th><th>Ações</th></tr></thead>
      <tbody>${list.map(billingRow).join('')}</tbody>
    </table>
  </div>`;

/* ---------------------------------------------------------
   Página: Dashboard
   --------------------------------------------------------- */
function stats() {
  const clients = state.clients;
  const aReceber = clients.reduce((t, c) => t + (c.total - c.pago), 0);
  const recebido = state.payments.reduce((t, p) => t + p.valor, 0);
  const lista = monthList(viewMonth);
  return {
    aReceber, recebido,
    pendentes: clients.filter(c => !isPaid(c)).length,
    lista,
    doMes: lista.length,
    realizadas: lista.filter(c => isCharged(c.id)).length,
    pagamentos: state.paymen
