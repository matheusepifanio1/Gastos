import { parseFile, merchantKey } from './parsers.js';
import { CATEGORIES, applyCategories } from './categorize.js';
import * as A from './analysis.js';
import * as store from './storage.js';
import { demoTransactions } from './demo.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SOURCE_LABEL = { cartao: 'Cartão', pix: 'Pix', debito: 'Débito', boleto: 'Boleto', outros: 'Outros' };
const SOURCE_COLOR = { cartao: '#820ad1', pix: '#12b886', debito: '#1971c2', boleto: '#f08c00', outros: '#868e96' };

let state = store.load();
let txs = [];
let month = null;
let view = 'resumo';
const charts = {};

// ---------- estado ----------

function recompute() {
  txs = applyCategories(state.transactions, state.overrides);
  const ms = A.months(A.expenses(txs));
  if (!ms.includes(month)) {
    month = ms[ms.length - 1] || null;
    // Nos primeiros dias do mês há poucos dados: abre no último mês fechado
    const today = new Date().toISOString().slice(0, 10);
    if (month === today.slice(0, 7) && +today.slice(8, 10) < 7 && ms.length > 1) month = ms[ms.length - 2];
  }
}

function persist() {
  if (!store.save(state)) toast('Não foi possível salvar (armazenamento cheio?)');
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), 3200);
}

// ---------- render ----------

function render() {
  recompute();
  const hasData = !!month;
  $('#empty').hidden = hasData;
  $('#tabbar').hidden = !hasData;
  $('#monthPicker').hidden = !hasData || view === 'dados';
  $$('.view').forEach((v) => { if (v.id.startsWith('view-')) v.hidden = !hasData || v.id !== `view-${view}`; });
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (!hasData) return;

  const ms = A.months(A.expenses(txs));
  $('#monthLabel').textContent = A.monthLabel(month);
  $('#prevMonth').disabled = month === ms[0];
  $('#nextMonth').disabled = month === ms[ms.length - 1];

  if (view === 'resumo') renderResumo();
  if (view === 'insights') renderInsights();
  if (view === 'transacoes') renderTransactions();
  if (view === 'dados') $('#goalInput').value = state.settings.goal || '';
}

function chartColors() {
  const cs = getComputedStyle(document.documentElement);
  return { text: cs.getPropertyValue('--muted').trim(), line: cs.getPropertyValue('--line').trim(), brand: cs.getPropertyValue('--brand').trim() };
}

function makeChart(id, config) {
  if (!window.Chart) return;
  const c = chartColors();
  Chart.defaults.color = c.text;
  Chart.defaults.borderColor = c.line;
  Chart.defaults.font.family = 'system-ui, -apple-system, sans-serif';
  if (charts[id]) charts[id].destroy();
  config.options = { responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, ...config.options };
  charts[id] = new Chart(document.getElementById(id), config);
}

const shortBRL = (v) => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace('.', ',')} mil` : `R$ ${Math.round(v)}`);
const moneyTooltip = { callbacks: { label: (ctx) => `${ctx.dataset.label ? ctx.dataset.label + ': ' : ''}${A.brl(ctx.parsed.y ?? ctx.parsed)}` } };

function renderResumo() {
  const s = A.summarize(txs, month);
  const prevMonth = A.shiftMonth(month, -1);
  const prev = A.summarize(txs, prevMonth);
  $('#totalMonth').textContent = A.brl(s.total);
  const delta = $('#totalDelta');
  if (prev.list.length) {
    const d = s.total - prev.total;
    const p = prev.total ? Math.round((d / prev.total) * 100) : 0;
    delta.className = `delta ${d > 0 ? 'up' : 'down'}`;
    delta.textContent = `${d > 0 ? '▲' : '▼'} ${A.brl(Math.abs(d))} (${d > 0 ? '+' : ''}${p}%) vs ${A.monthName(prevMonth)}`;
  } else delta.textContent = '';

  const goal = +state.settings.goal || 0;
  const goalBar = $('#goalBar');
  goalBar.hidden = !goal;
  if (goal) {
    const r = s.total / goal;
    const fill = goalBar.querySelector('.goal-fill');
    fill.style.width = `${Math.min(100, r * 100)}%`;
    fill.className = `goal-fill ${r > 1 ? 'over' : r > 0.85 ? 'warn' : ''}`;
    goalBar.querySelector('.goal-text').textContent = `${Math.round(r * 100)}% da meta de ${A.brl(goal)}`;
  }

  $('#sourceChips').innerHTML = s.bySource.filter((g) => g.total > 0)
    .map((g) => `<span class="chip">${SOURCE_LABEL[g.key] || g.key} <b>${A.brl(g.total)}</b></span>`).join('');
  $('#statCount').textContent = s.count;
  $('#statAvg').textContent = A.brl(s.avgTicket);

  // Evolução mensal empilhada por origem
  const series = A.monthlySeries(txs, 12);
  const sources = Object.keys(SOURCE_LABEL).filter((k) => series.some((m) => m.bySource[k]));
  makeChart('chartMonthly', {
    type: 'bar',
    data: {
      labels: series.map((m) => A.monthName(m.month).slice(0, 3)),
      datasets: sources.map((k) => ({
        label: SOURCE_LABEL[k], data: series.map((m) => m.bySource[k] || 0), backgroundColor: SOURCE_COLOR[k],
        borderRadius: 4, borderSkipped: false, borderWidth: { top: 2 }, borderColor: 'transparent',
      })),
    },
    options: {
      scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { callback: shortBRL } } },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } }, tooltip: moneyTooltip },
      onClick: (_, els) => { if (els[0]) { month = series[els[0].index].month; render(); } },
    },
  });

  // Categorias
  const cats = s.byCategory;
  makeChart('chartCategory', {
    type: 'doughnut',
    data: { labels: cats.map((c) => c.key), datasets: [{ data: cats.map((c) => c.total), backgroundColor: cats.map((c) => CATEGORIES[c.key]?.color || '#999'), borderWidth: 2, borderColor: getComputedStyle(document.documentElement).getPropertyValue('--card') }] },
    options: { cutout: '62%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${A.brl(ctx.parsed)}` } } } },
  });
  const prevByCat = Object.fromEntries(prev.byCategory.map((g) => [g.key, g.total]));
  const max = cats[0]?.total || 1;
  $('#categoryList').innerHTML = cats.map((c) => {
    const p = prevByCat[c.key] || 0;
    const diff = p ? Math.round(((c.total - p) / p) * 100) : null;
    return `<li data-cat="${esc(c.key)}">
      <span>${CATEGORIES[c.key]?.icon || ''} ${esc(c.key)} <span class="sub">· ${c.count}x · ${Math.round((c.total / s.total) * 100)}%${diff !== null ? ` · ${diff > 0 ? '+' : ''}${diff}% vs mês ant.` : ''}</span></span>
      <strong>${A.brl(c.total)}</strong>
      <div class="track"><div class="fill" style="width:${(c.total / max) * 100}%;background:${CATEGORIES[c.key]?.color || '#999'}"></div></div>
    </li>`;
  }).join('');

  // Acumulado: mês atual x anterior x média
  const days = Array.from({ length: A.daysInMonth(month) }, (_, i) => i + 1);
  const today = new Date().toISOString().slice(0, 10);
  let cur = A.cumulativeByDay(txs, month);
  if (month === today.slice(0, 7)) cur = cur.slice(0, +today.slice(8, 10));
  const datasets = [{ label: A.monthName(month), data: cur, borderColor: chartColors().brand, backgroundColor: chartColors().brand, borderWidth: 2.5, pointRadius: 0, tension: 0.25 }];
  if (prev.list.length) datasets.push({ label: A.monthName(prevMonth), data: A.cumulativeByDay(txs, prevMonth), borderColor: '#adb5bd', borderDash: [5, 4], borderWidth: 2, pointRadius: 0, tension: 0.25 });
  makeChart('chartCumulative', {
    type: 'line', data: { labels: days, datasets },
    options: { interaction: { mode: 'index', intersect: false }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { ticks: { callback: shortBRL } } }, plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } }, tooltip: { ...moneyTooltip, callbacks: { ...moneyTooltip.callbacks, title: (i) => `Dia ${i[0].label}` } } } },
  });

  // Gastos por dia e por dia da semana
  const daily = A.dailyTotals(txs, month);
  makeChart('chartDaily', {
    type: 'bar',
    data: { labels: days, datasets: [{ label: 'Gasto no dia', data: daily, backgroundColor: days.map((d) => { const w = A.weekday(`${month}-${String(d).padStart(2, '0')}`); return w === 0 || w === 6 ? '#e8590c' : chartColors().brand; }), borderRadius: 3 }] },
    options: { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }, y: { ticks: { callback: shortBRL, maxTicksLimit: 4 } } }, plugins: { legend: { display: false }, tooltip: { ...moneyTooltip, callbacks: { ...moneyTooltip.callbacks, title: (i) => `Dia ${i[0].label}` } } } },
  });
  const wd = A.byWeekday(txs, month);
  makeChart('chartWeekday', {
    type: 'bar',
    data: { labels: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], datasets: [{ label: 'Média por dia', data: wd.map((w) => w.avg), backgroundColor: wd.map((_, i) => (i === 0 || i === 6 ? '#e8590c' : chartColors().brand)), borderRadius: 4 }] },
    options: { scales: { x: { grid: { display: false } }, y: { ticks: { callback: shortBRL, maxTicksLimit: 4 } } }, plugins: { legend: { display: false }, title: { display: true, text: 'Média por dia da semana (laranja = fim de semana)', font: { size: 12, weight: 'normal' } }, tooltip: moneyTooltip } },
  });

  $('#topMerchants').innerHTML = A.topMerchants(txs, month, 10)
    .map((m) => `<li>${esc(m.key)} <small class="muted">(${m.count}x)</small><span>${A.brl(m.total)}</span></li>`).join('');
}

function renderInsights() {
  const list = A.insights(txs, month, { goal: +state.settings.goal || 0 });
  $('#insightList').innerHTML = list.length
    ? list.map((i) => `<div class="card insight ${i.tone}"><div class="ico">${i.icon}</div><div><h4>${esc(i.title)}</h4><p>${esc(i.text)}</p></div></div>`).join('')
    : '<div class="card muted">Sem dados suficientes neste mês.</div>';

  const subs = A.detectSubscriptions(txs, month);
  $('#subsList').innerHTML = subs.length
    ? subs.map((s) => `<li><span>${esc(s.merchant)} <small class="muted">· ${s.months} meses</small></span><strong>${A.brl(s.amount)}/mês</strong></li>`).join('') +
      `<li><span><strong>Total</strong></span><strong>${A.brl(A.sum(subs, (s) => s.amount))}/mês</strong></li>`
    : '<li class="muted">Nenhuma cobrança recorrente detectada (precisa de pelo menos 3 meses de dados).</li>';

  const fut = A.futureInstallments(txs, A.months(A.expenses(txs)).pop());
  $('#installmentList').innerHTML = fut.items.length
    ? fut.items.map((i) => `<li><span>${esc(i.merchant)} <small class="muted">· faltam ${i.remaining} de ${i.total}</small></span><strong>${A.brl(i.amount)}</strong></li>`).join('')
    : '<li class="muted">Nenhuma parcela pendente.</li>';
  makeChart('chartInstallments', {
    type: 'bar',
    data: { labels: fut.months.map((m) => A.monthName(m.month).slice(0, 3)), datasets: [{ label: 'Parcelas', data: fut.months.map((m) => m.total), backgroundColor: chartColors().brand, borderRadius: 4 }] },
    options: { scales: { x: { grid: { display: false } }, y: { ticks: { callback: shortBRL, maxTicksLimit: 4 } } }, plugins: { legend: { display: false }, tooltip: moneyTooltip } },
  });
  $('#chartInstallments').parentElement.hidden = !fut.months.length;
}

function renderTransactions() {
  const q = $('#search').value.trim().toLowerCase();
  const src = $('#filterSource').value;
  const cat = $('#filterCategory').value;
  const all = $('#showAllMonths').checked;
  const showIgnored = $('#showIgnored').checked;
  const list = txs.filter((t) =>
    (all || A.monthOf(t.date) === month) &&
    (showIgnored || t.kind === 'expense') &&
    (!src || t.source === src) &&
    (!cat || t.category === cat) &&
    (!q || `${t.description} ${t.merchant} ${t.category}`.toLowerCase().includes(q)),
  ).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const total = A.sum(list.filter((t) => t.kind === 'expense'), (t) => t.amount);
  $('#txSummary').textContent = `${list.length} transações · ${A.brl(total)} em gastos`;

  const groups = new Map();
  for (const t of list.slice(0, 600)) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  const fmtDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' });
  $('#txList').innerHTML = [...groups.entries()].map(([d, items]) => `
    <div class="day-group"><h5><span>${fmtDay(d)}</span><span>${A.brl(A.sum(items.filter((t) => t.kind === 'expense'), (t) => t.amount))}</span></h5>
    ${items.map((t) => {
      const c = CATEGORIES[t.category] || CATEGORIES.Outros;
      const label = t.kind === 'income' ? 'Entrada' : t.kind === 'ignore' ? 'Ignorada' : t.category;
      return `<div class="tx ${t.kind !== 'expense' ? 'ignored' : ''}" data-id="${t.id}">
        <div class="ico" style="background:${c.color}22">${t.kind === 'income' ? '⬇️' : c.icon}</div>
        <div class="info"><div class="name">${esc(t.merchant || t.description)}</div>
        <div class="meta">${SOURCE_LABEL[t.source]} · ${esc(label)}${t.installment ? ` · ${t.installment.n}/${t.installment.total}` : ''}</div></div>
        <div class="val ${t.amount < 0 ? 'neg' : ''}">${t.amount < 0 ? '+' : ''}${A.brl(Math.abs(t.amount))}</div>
      </div>`;
    }).join('')}</div>`).join('') || '<p class="muted center">Nenhuma transação encontrada.</p>';
}

// ---------- edição de transação ----------

let editing = null;
function openTx(id) {
  const t = txs.find((x) => x.id === id);
  if (!t) return;
  editing = t;
  $('#dlgTitle').textContent = t.merchant || t.description;
  $('#dlgMeta').textContent = `${new Date(`${t.date}T12:00:00`).toLocaleDateString('pt-BR')} · ${SOURCE_LABEL[t.source]} · ${t.description}`;
  $('#dlgAmount').textContent = A.brl(t.amount);
  $('#dlgCategory').value = t.category;
  $('#dlgMerchant').textContent = t.merchant;
  $('#dlgAll').checked = true;
  $('#dlgIgnore').checked = t.kind === 'ignore';
  $('#txDialog').showModal();
}

$('#txDialog').addEventListener('close', () => {
  if ($('#txDialog').returnValue !== 'save' || !editing) return;
  const t = editing;
  const cat = $('#dlgCategory').value;
  const o = state.overrides;
  if ($('#dlgAll').checked) {
    o.byMerchant[merchantKey(t.merchant)] = cat;
    // remove overrides individuais conflitantes do mesmo estabelecimento
    for (const x of txs) if (x.merchantKey === t.merchantKey) delete o.byId[x.id];
  } else o.byId[t.id] = cat;
  if ($('#dlgIgnore').checked && t.kind !== 'ignore') o.ignored[t.id] = true;
  if (!$('#dlgIgnore').checked) delete o.ignored[t.id];
  persist();
  render();
});

// ---------- importação ----------

async function importFiles(files) {
  const log = $('#importLog');
  log.innerHTML = '';
  const hadData = state.transactions.length > 0;
  let added = 0;
  for (const f of files) {
    try {
      const text = await readText(f);
      const parsed = parseFile(f.name, text);
      const r = store.mergeTransactions(state.transactions, parsed);
      state.transactions = r.list;
      added += r.added;
      state.imports.push({ name: f.name, at: new Date().toISOString(), count: parsed.length });
      log.insertAdjacentHTML('beforeend', `<div class="ok">✔ ${esc(f.name)}: ${parsed.length} lidas, ${r.added} novas</div>`);
    } catch (e) {
      log.insertAdjacentHTML('beforeend', `<div class="err">✖ ${esc(f.name)}: ${esc(e.message)}</div>`);
    }
  }
  persist();
  if (added) {
    month = null;
    if (!hadData) view = 'resumo';
  }
  toast(`${added} transações novas importadas`);
  render();
}

async function readText(file) {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  // arquivos OFX antigos costumam vir em latin1
  return utf8.includes('�') ? new TextDecoder('windows-1252').decode(buf) : utf8;
}

// ---------- eventos ----------

function init() {
  const howto = $('#howtoTpl').content;
  $$('.howto').forEach((el) => el.appendChild(howto.cloneNode(true)));
  const catOptions = Object.keys(CATEGORIES).map((c) => `<option value="${esc(c)}">${CATEGORIES[c].icon} ${esc(c)}</option>`).join('');
  $('#dlgCategory').innerHTML = catOptions;
  $('#filterCategory').insertAdjacentHTML('beforeend', catOptions);

  $$('.file-input').forEach((inp) => inp.addEventListener('change', (e) => { importFiles([...e.target.files]); e.target.value = ''; }));
  $$('[data-action=demo]').forEach((b) => b.addEventListener('click', () => {
    const r = store.mergeTransactions(state.transactions, demoTransactions());
    state.transactions = r.list;
    persist();
    month = null;
    view = 'resumo';
    toast('Dados de exemplo carregados');
    render();
  }));
  $$('.tabbar button').forEach((b) => b.addEventListener('click', () => { view = b.dataset.view; render(); window.scrollTo(0, 0); }));
  $('#prevMonth').addEventListener('click', () => { month = A.shiftMonth(month, -1); render(); });
  $('#nextMonth').addEventListener('click', () => { month = A.shiftMonth(month, 1); render(); });
  ['#search', '#filterSource', '#filterCategory', '#showAllMonths', '#showIgnored'].forEach((s) => $(s).addEventListener('input', renderTransactions));
  $('#txList').addEventListener('click', (e) => { const el = e.target.closest('.tx'); if (el) openTx(el.dataset.id); });
  $('#categoryList').addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li) return;
    $('#filterCategory').value = li.dataset.cat;
    view = 'transacoes';
    render();
  });

  $('#saveGoal').addEventListener('click', () => {
    state.settings.goal = Math.max(0, parseFloat($('#goalInput').value) || 0);
    persist();
    toast(state.settings.goal ? `Meta de ${A.brl(state.settings.goal)} salva` : 'Meta removida');
  });
  $('#exportBackup').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gastos-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#importBackup').addEventListener('change', async (e) => {
    try {
      const data = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(data.transactions)) throw new Error('arquivo inválido');
      state = { ...store.clear(), ...data };
      persist();
      month = null;
      toast('Backup restaurado');
      render();
    } catch (err) { toast(`Erro ao restaurar: ${err.message}`); }
    e.target.value = '';
  });
  $('#clearData').addEventListener('click', () => {
    if (!confirm('Apagar todas as transações e configurações deste aparelho?')) return;
    state = store.clear();
    month = null;
    view = 'resumo';
    render();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render);
  render();
  // Chart.js carrega com defer; re-renderiza quando estiver disponível
  if (!window.Chart) window.addEventListener('load', render, { once: true });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
