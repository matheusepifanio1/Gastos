import { addMonths } from './parsers.js';

export const monthOf = (date) => date.slice(0, 7);
export const shiftMonth = (month, n) => addMonths(`${month}-01`, n).slice(0, 7);
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + f(x), 0);

export const expenses = (txs) => txs.filter((t) => t.kind === 'expense');
export const inMonth = (txs, month) => txs.filter((t) => monthOf(t.date) === month);

export function daysInMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function weekday(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
}

export function months(txs) {
  return [...new Set(txs.map((t) => monthOf(t.date)))].sort();
}

function groupSum(list, keyFn) {
  const map = new Map();
  for (const t of list) {
    const k = keyFn(t);
    const g = map.get(k) || { key: k, total: 0, count: 0 };
    g.total += t.amount;
    g.count += 1;
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function summarize(txs, month) {
  const list = expenses(inMonth(txs, month));
  const income = sum(inMonth(txs, month).filter((t) => t.kind === 'income'), (t) => -t.amount);
  const total = sum(list, (t) => t.amount);
  const purchases = list.filter((t) => t.amount > 0);
  return {
    month,
    total,
    income,
    count: purchases.length,
    avgTicket: purchases.length ? sum(purchases, (t) => t.amount) / purchases.length : 0,
    bySource: groupSum(list, (t) => t.source),
    byCategory: groupSum(list, (t) => t.category).filter((g) => g.total > 0.005),
    list,
  };
}

export function monthlySeries(txs, lastN = 12) {
  const all = months(txs);
  const sel = all.slice(-lastN);
  return sel.map((m) => {
    const list = expenses(inMonth(txs, m));
    const bySource = {};
    for (const t of list) bySource[t.source] = (bySource[t.source] || 0) + t.amount;
    return { month: m, total: sum(list, (t) => t.amount), bySource };
  });
}

export function cumulativeByDay(txs, month) {
  const list = expenses(inMonth(txs, month));
  const n = daysInMonth(month);
  const perDay = new Array(n).fill(0);
  for (const t of list) perDay[+t.date.slice(8, 10) - 1] += t.amount;
  let acc = 0;
  return perDay.map((v) => (acc += v));
}

export function dailyTotals(txs, month) {
  const list = expenses(inMonth(txs, month));
  const n = daysInMonth(month);
  const perDay = new Array(n).fill(0);
  for (const t of list) perDay[+t.date.slice(8, 10) - 1] += t.amount;
  return perDay;
}

export function byWeekday(txs, month) {
  const list = expenses(inMonth(txs, month));
  const totals = new Array(7).fill(0);
  for (const t of list) totals[weekday(t.date)] += t.amount;
  // quantos de cada dia da semana existem no mês (para média por dia)
  const counts = new Array(7).fill(0);
  for (let d = 1; d <= daysInMonth(month); d++) counts[weekday(`${month}-${String(d).padStart(2, '0')}`)]++;
  return totals.map((t, i) => ({ total: t, avg: counts[i] ? t / counts[i] : 0 }));
}

export function topMerchants(txs, month, n = 8) {
  return groupSum(expenses(inMonth(txs, month)), (t) => t.merchant).slice(0, n);
}

// Cobranças recorrentes: mesmo estabelecimento, valor parecido, em meses diferentes, sem parcelamento
export function detectSubscriptions(txs, refMonth) {
  const list = expenses(txs).filter((t) => !t.installment && t.amount > 0);
  const byMerchant = new Map();
  for (const t of list) {
    if (!byMerchant.has(t.merchantKey)) byMerchant.set(t.merchantKey, []);
    byMerchant.get(t.merchantKey).push(t);
  }
  const out = [];
  const window = new Set([refMonth, shiftMonth(refMonth, -1), shiftMonth(refMonth, -2), shiftMonth(refMonth, -3)]);
  for (const items of byMerchant.values()) {
    const perMonth = new Map();
    for (const t of items) {
      const m = monthOf(t.date);
      if (!perMonth.has(m)) perMonth.set(m, []);
      perMonth.get(m).push(t);
    }
    if (perMonth.size < 3) continue;
    if ([...perMonth.values()].some((v) => v.length > 1)) continue; // compra frequente, não assinatura
    const amounts = items.map((t) => t.amount);
    const avg = sum(amounts) / amounts.length;
    if (amounts.some((a) => Math.abs(a - avg) / avg > 0.15)) continue;
    const recent = [...perMonth.keys()].filter((m) => window.has(m)).length;
    if (recent < 2) continue; // provavelmente já cancelada
    const last = items.reduce((a, b) => (a.date > b.date ? a : b));
    out.push({ key: last.merchantKey, merchant: last.merchant, category: last.category, amount: last.amount, months: perMonth.size, lastDate: last.date });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

// Parcelas que ainda vão cair nos próximos meses
export function futureInstallments(txs, refMonth) {
  const series = new Map();
  for (const t of expenses(txs)) {
    if (!t.installment) continue;
    const key = `${t.merchantKey}|${t.installment.total}|${t.amount.toFixed(2)}`;
    const cur = series.get(key);
    if (!cur || t.installment.n > cur.installment.n) series.set(key, t);
  }
  const projection = new Map();
  const items = [];
  for (const t of series.values()) {
    const remaining = t.installment.total - t.installment.n;
    if (remaining <= 0) continue;
    const lastMonth = monthOf(t.date);
    let counted = 0;
    for (let i = 1; i <= remaining; i++) {
      const m = shiftMonth(lastMonth, i);
      if (m < refMonth) continue; // mês passado: já deveria estar nos dados
      projection.set(m, (projection.get(m) || 0) + t.amount);
      counted++;
    }
    if (counted) items.push({ merchant: t.merchant, amount: t.amount, remaining: counted, total: t.installment.total, left: counted * t.amount });
  }
  const months = [...projection.entries()].sort().map(([month, total]) => ({ month, total }));
  return { months, items: items.sort((a, b) => b.left - a.left) };
}

const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const monthName = (m) => MONTH_NAMES[+m.slice(5, 7) - 1];
export const monthLabel = (m) => `${monthName(m)} ${m.slice(0, 4)}`;
export const weekdayName = (i) => WEEKDAYS[i];

export const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = (v) => `${Math.round(v * 100)}%`;

// Gera os insights do mês em linguagem natural
export function insights(txs, month, { today = new Date().toISOString().slice(0, 10), goal = 0 } = {}) {
  const out = [];
  const cur = summarize(txs, month);
  if (!cur.list.length) return out;
  const prevMonths = [1, 2, 3].map((i) => shiftMonth(month, -i)).filter((m) => expenses(inMonth(txs, m)).length);
  const prev = prevMonths.length ? summarize(txs, prevMonths[0]) : null;
  const avg3 = prevMonths.length ? sum(prevMonths.map((m) => summarize(txs, m).total)) / prevMonths.length : 0;

  // Ritmo do mês corrente
  const isCurrent = month === monthOf(today);
  const dim = daysInMonth(month);
  const day = +today.slice(8, 10);
  if (isCurrent && day >= 5) {
    // Gastos fixos (recorrentes e parcelas) não seguem o ritmo diário: entram pelo valor esperado
    const subs = detectSubscriptions(txs, month);
    const subKeys = new Set(subs.map((x) => x.key));
    const isFixed = (t) => t.installment || subKeys.has(t.merchantKey);
    const fixedPosted = sum(cur.list.filter(isFixed), (t) => t.amount);
    const variable = cur.total - fixedPosted;
    const pendingSubs = sum(subs.filter((x) => monthOf(x.lastDate) < month), (x) => x.amount);
    const pendingInst = futureInstallments(txs, month).months.find((m) => m.month === month)?.total || 0;
    const projection = (variable / day) * dim + fixedPosted + pendingSubs + pendingInst;
    out.push({
      icon: '📈', tone: avg3 && projection > avg3 * 1.1 ? 'bad' : 'neutral',
      title: `Projeção para o mês: ${brl(projection)}`,
      text: `Gastando ${brl(variable / day)} por dia no variável, mais ${brl(fixedPosted + pendingSubs + pendingInst)} de contas fixas e parcelas, você deve fechar ${monthName(month)} em ${brl(projection)}` +
        (avg3 ? `, ${projection > avg3 ? 'acima' : 'abaixo'} da sua média de ${brl(avg3)}.` : '.'),
    });
  }

  // Comparação com meses anteriores
  if (prev && !isCurrent) {
    const diff = cur.total - prev.total;
    out.push({
      icon: diff > 0 ? '🔺' : '🔻', tone: diff > 0 ? 'bad' : 'good',
      title: `${diff > 0 ? 'Gastou mais' : 'Gastou menos'} que em ${monthName(prev.month)}`,
      text: `${brl(Math.abs(diff))} ${diff > 0 ? 'a mais' : 'a menos'} (${diff > 0 ? '+' : '-'}${pct(Math.abs(diff) / (prev.total || 1))}). ` +
        (avg3 ? `Sua média dos últimos ${prevMonths.length} meses é ${brl(avg3)}.` : ''),
    });
  }

  // Categoria que mais cresceu
  if (prevMonths.length) {
    const avgByCat = {};
    for (const m of prevMonths) for (const g of summarize(txs, m).byCategory) avgByCat[g.key] = (avgByCat[g.key] || 0) + g.total / prevMonths.length;
    const growth = cur.byCategory.map((g) => ({ cat: g.key, now: g.total, before: avgByCat[g.key] || 0, diff: g.total - (avgByCat[g.key] || 0) }))
      .sort((a, b) => b.diff - a.diff);
    const top = growth[0];
    if (top && top.diff > 50) {
      out.push({
        icon: '🚨', tone: 'bad', title: `${top.cat} disparou`,
        text: `Você gastou ${brl(top.now)} em ${top.cat} — ${brl(top.diff)} acima da sua média (${brl(top.before)}). É a categoria que mais puxou seus gastos para cima.`,
      });
    }
    const drop = growth[growth.length - 1];
    const vanished = Object.entries(avgByCat).filter(([c]) => !cur.byCategory.some((g) => g.key === c)).sort((a, b) => b[1] - a[1])[0];
    const best = vanished && vanished[1] > (drop ? -drop.diff : 0) ? { cat: vanished[0], diff: -vanished[1] } : drop;
    if (best && best.diff < -50 && !isCurrent) {
      out.push({ icon: '👏', tone: 'good', title: `Economia em ${best.cat}`, text: `Você gastou ${brl(-best.diff)} a menos que a média em ${best.cat}.` });
    }
  }

  // Maior categoria
  const topCat = cur.byCategory[0];
  if (topCat) {
    out.push({ icon: '🏷️', tone: 'neutral', title: `Maior gasto: ${topCat.key}`, text: `${brl(topCat.total)} em ${topCat.count} transações — ${pct(topCat.total / cur.total)} de tudo que você gastou no mês.` });
  }

  // Efeito formiga
  const small = cur.list.filter((t) => t.amount > 0 && t.amount < 30);
  if (small.length >= 10) {
    const s = sum(small, (t) => t.amount);
    out.push({
      icon: '🐜', tone: s / cur.total > 0.1 ? 'bad' : 'neutral', title: 'Efeito formiga',
      text: `${small.length} compras pequenas (abaixo de R$ 30) somaram ${brl(s)} — ${pct(s / cur.total)} do mês. Individualmente parecem nada, juntas pesam.`,
    });
  }

  // Delivery
  const delivery = cur.byCategory.find((g) => g.key === 'Delivery');
  if (delivery && delivery.count >= 4) {
    out.push({
      icon: '🛵', tone: 'bad', title: `${delivery.count} pedidos de delivery`,
      text: `Total de ${brl(delivery.total)} (média de ${brl(delivery.total / delivery.count)} por pedido). Cortar metade dos pedidos economizaria cerca de ${brl(delivery.total / 2)} por mês, ou ${brl(delivery.total * 6)} por ano.`,
    });
  }

  // Fim de semana x dias úteis
  const wd = byWeekday(txs, month);
  const weekendAvg = (wd[0].avg + wd[6].avg) / 2;
  const weekdayAvg = sum([1, 2, 3, 4, 5].map((i) => wd[i].avg)) / 5;
  if (weekdayAvg > 0 && weekendAvg > weekdayAvg * 1.3) {
    out.push({ icon: '🎉', tone: 'bad', title: 'Fim de semana pesa', text: `Num sábado ou domingo você gasta em média ${brl(weekendAvg)}, contra ${brl(weekdayAvg)} num dia útil (${(weekendAvg / weekdayAvg).toFixed(1).replace('.', ',')}x mais).` });
  }
  const worstDow = wd.map((w, i) => ({ ...w, i })).sort((a, b) => b.avg - a.avg)[0];
  if (worstDow.total > 0) {
    out.push({ icon: '📅', tone: 'neutral', title: `${weekdayName(worstDow.i)[0].toUpperCase() + weekdayName(worstDow.i).slice(1)} é seu dia mais caro`, text: `Média de ${brl(worstDow.avg)} por ${weekdayName(worstDow.i)} neste mês.` });
  }

  // Dias de pico
  const daily = dailyTotals(txs, month);
  const peaks = daily.map((v, i) => ({ v, d: i + 1 })).sort((a, b) => b.v - a.v).slice(0, 3).filter((p) => p.v > 0);
  if (peaks.length) {
    const peakSum = sum(peaks, (p) => p.v);
    out.push({
      icon: '⚡', tone: peakSum / cur.total > 0.35 ? 'bad' : 'neutral', title: 'Dias de pico',
      text: `Os dias ${peaks.map((p) => p.d).join(', ')} concentraram ${brl(peakSum)} (${pct(peakSum / cur.total)} do mês). O maior foi dia ${peaks[0].d}, com ${brl(peaks[0].v)}.`,
    });
  }

  // Quinzenas
  const half = sum(daily.slice(0, 15));
  if (cur.total > 0 && !isCurrent) {
    const share = half / cur.total;
    if (share > 0.62 || share < 0.38) {
      out.push({ icon: '🗓️', tone: 'neutral', title: `Gastos concentrados na ${share > 0.5 ? 'primeira' : 'segunda'} quinzena`, text: `${pct(share > 0.5 ? share : 1 - share)} do valor saiu na ${share > 0.5 ? '1ª' : '2ª'} metade do mês${share > 0.5 ? ' — típico de quem gasta logo que o salário cai.' : '.'}` });
    }
  }

  // Pix para pessoas
  const pix = cur.byCategory.find((g) => g.key === 'Pix p/ pessoas');
  if (pix && pix.total > 0) {
    out.push({ icon: '💸', tone: 'neutral', title: `${brl(pix.total)} em Pix para pessoas`, text: `${pix.count} transferências. Confira em Transações se alguma é para você mesmo (outra conta) e marque como "ignorar" para não distorcer a análise.` });
  }

  // Cartão x Pix
  const card = cur.bySource.find((g) => g.key === 'cartao');
  if (card && card.total > 0 && cur.total > 0) {
    out.push({ icon: '💳', tone: 'neutral', title: `${pct(card.total / cur.total)} no cartão de crédito`, text: `Cartão: ${brl(card.total)}. Pix, débito e boletos: ${brl(cur.total - card.total)}.` });
  }

  // Gastos fixos e assinaturas
  const subs = detectSubscriptions(txs, month);
  if (subs.length) {
    const s = sum(subs, (x) => x.amount);
    const services = subs.filter((x) => x.category === 'Assinaturas');
    const sv = sum(services, (x) => x.amount);
    out.push({
      icon: '🔁', tone: 'neutral', title: `${brl(s)}/mês em gastos recorrentes`,
      text: `${subs.length} cobranças se repetem todo mês (${brl(s * 12)} por ano).` +
        (services.length ? ` Só de assinaturas são ${brl(sv)}/mês: ${services.map((x) => x.merchant).join(', ')}. Vale revisar se você usa todas.` : ''),
    });
  }

  // Parcelas futuras (a partir do último mês com dados)
  const lastMonth = months(expenses(txs)).pop();
  const fut = futureInstallments(txs, lastMonth);
  if (fut.months.length) {
    const next = fut.months[0];
    out.push({ icon: '⏳', tone: next.total > cur.total * 0.3 ? 'bad' : 'neutral', title: `${brl(next.total)} já comprometidos em ${monthName(next.month)}`, text: `São parcelas de compras feitas antes. No total, ainda faltam ${brl(sum(fut.months, (m) => m.total))} em parcelas a pagar.` });
  }

  // Renda x gastos
  if (cur.income > 0) {
    const rate = (cur.income - cur.total) / cur.income;
    out.push({ icon: rate >= 0 ? '💰' : '🔥', tone: rate >= 0.1 ? 'good' : 'bad', title: rate >= 0 ? `Sobrou ${pct(rate)} do que entrou` : 'Gastou mais do que entrou', text: `Entradas na conta: ${brl(cur.income)}. Gastos: ${brl(cur.total)}.` });
  }

  // Meta
  if (goal > 0) {
    const ratio = cur.total / goal;
    out.unshift({ icon: ratio > 1 ? '⛔' : '🎯', tone: ratio > 1 ? 'bad' : ratio > 0.85 ? 'neutral' : 'good', title: ratio > 1 ? `Meta estourada em ${brl(cur.total - goal)}` : `${pct(ratio)} da meta usada`, text: `Meta mensal: ${brl(goal)}. Gasto: ${brl(cur.total)}.` });
  }

  return out;
}
