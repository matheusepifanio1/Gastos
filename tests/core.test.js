import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFile, parseAmount, addMonths } from '../js/parsers.js';
import { applyCategories } from '../js/categorize.js';
import * as A from '../js/analysis.js';
import { demoTransactions } from '../js/demo.js';
import { mergeTransactions } from '../js/storage.js';

const fx = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('fatura do cartão (CSV)', () => {
  const t = parseFile('Nubank_2026-10-10.csv', fx('Nubank_2026-10-10.csv'));
  assert.equal(t.length, 6);
  const parcela = t.find((x) => x.installment);
  assert.deepEqual(parcela.installment, { n: 3, total: 10 });
  assert.equal(parcela.date, '2026-09-05', 'parcela 3/10 deslocada 2 meses');
  assert.equal(parcela.merchant, 'Kabum');
  assert.equal(t.find((x) => /Pagamento/.test(x.description)).kind, 'ignore');
  const estorno = t.find((x) => /Estorno/.test(x.description));
  assert.equal(estorno.kind, 'expense');
  assert.equal(estorno.amount, -30);
  assert.ok(t.every((x) => x.source === 'cartao'));
});

test('parcela já com data da fatura não é deslocada de novo', () => {
  const t = parseFile('Nubank_2026-10-10.csv', 'date,title,amount\n2026-09-05,Kabum - Parcela 3/10,389.90\n');
  assert.equal(t[0].date, '2026-09-05');
});

test('extrato da conta (CSV)', () => {
  const t = parseFile('NU.csv', fx('NU_extrato.csv'));
  const by = (re) => t.find((x) => re.test(x.description));
  assert.equal(by(/recebida/).kind, 'income');
  assert.equal(by(/MARIA/).source, 'pix');
  assert.equal(by(/MARIA/).amount, 150);
  assert.equal(by(/MARIA/).merchant, 'Maria Silva');
  assert.equal(by(/fatura/).kind, 'ignore');
  assert.equal(by(/RDB/).kind, 'ignore');
  assert.equal(by(/Drogasil/).source, 'debito');
  const cats = applyCategories(t);
  assert.equal(cats.find((x) => /MARIA/.test(x.description)).category, 'Pix p/ pessoas');
  assert.equal(cats.find((x) => /Drogasil/.test(x.description)).category, 'Saúde');
});

test('OFX', () => {
  const t = parseFile('extrato.ofx', fx('extrato.ofx'));
  assert.equal(t.length, 2);
  assert.equal(t[0].date, '2026-10-05');
  assert.equal(t[0].amount, 80);
  assert.equal(t[0].source, 'pix');
  assert.equal(t[1].kind, 'income');
});

test('importar o mesmo arquivo duas vezes não duplica', () => {
  const a = parseFile('NU.csv', fx('NU_extrato.csv'));
  const r1 = mergeTransactions([], a);
  const r2 = mergeTransactions(r1.list, parseFile('NU.csv', fx('NU_extrato.csv')));
  assert.equal(r2.added, 0);
});

test('utilidades', () => {
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('-50.00'), -50);
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
});

test('categorias', () => {
  const mk = (merchant, source = 'cartao') => applyCategories([{ id: '1', merchant, description: merchant, source, kind: 'expense' }])[0].category;
  assert.equal(mk('Ifd*Ifood'), 'Delivery');
  assert.equal(mk('Uber Trip'), 'Transporte');
  assert.equal(mk('Netflix.com'), 'Assinaturas');
  assert.equal(mk('Mercadolivre Loja'), 'Compras online');
  assert.equal(mk('Carrefour Hiper'), 'Mercado');
  assert.equal(mk('Loja Qualquer'), 'Outros');
  const o = applyCategories([{ id: '1', merchant: 'Loja Qualquer', description: '', source: 'cartao', kind: 'expense' }], { byMerchant: { lojaqualquer: 'Pets' } });
  assert.equal(o[0].category, 'Pets');
});

test('análise com dados de demonstração', () => {
  const today = '2026-11-02';
  const txs = applyCategories(demoTransactions(today));
  const ms = A.months(A.expenses(txs));
  assert.equal(ms.length, 7);
  const oct = A.summarize(txs, '2026-10');
  assert.ok(oct.total > 1000);
  assert.ok(oct.byCategory.some((c) => c.key === 'Delivery'));
  // Pagamento de fatura e RDB não entram como gasto
  assert.ok(!oct.list.some((t) => /fatura|RDB/.test(t.description)));
  // Parcela do Kabum deslocada para cada mês
  const kabum = A.expenses(txs).filter((t) => t.merchant === 'Kabum').map((t) => A.monthOf(t.date));
  assert.deepEqual(kabum.sort(), ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);

  const subs = A.detectSubscriptions(txs, '2026-10').map((s) => s.merchant);
  for (const s of ['Netflix.com', 'Spotify', 'Smart Fit']) assert.ok(subs.includes(s), `${s} em ${subs}`);
  assert.ok(!subs.includes('Kabum'));

  const fut = A.futureInstallments(txs, '2026-11');
  assert.equal(fut.months[0].month, '2026-11');
  assert.ok(fut.items.some((i) => i.merchant === 'Kabum' && i.remaining === 5));

  const ins = A.insights(txs, '2026-10', { today });
  assert.ok(ins.length >= 5);
  assert.ok(ins.some((i) => /delivery/i.test(i.title)));
  const cur = A.insights(txs, '2026-11', { today: '2026-11-15', goal: 3000 });
  assert.ok(cur.some((i) => /Projeção/.test(i.title)));
  assert.ok(/meta/i.test(cur[0].title));
  const proj = +cur.find((i) => /Projeção/.test(i.title)).title.replace(/[^\d,]/g, '').replace(',', '.');
  assert.ok(proj > 3000 && proj < 9000, `projeção razoável: ${proj}`);
  const cum = A.cumulativeByDay(txs, '2026-10');
  assert.equal(cum.length, 31);
  assert.ok(Math.abs(cum[30] - oct.total) < 0.01);
});
