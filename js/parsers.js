// Leitura dos arquivos exportados pelo Nubank (CSV da fatura, CSV do extrato e OFX).
// Todas as transações são normalizadas para o formato:
// { id, date: 'YYYY-MM-DD', description, merchant, amount, source, kind, installment, nativeCategory }
//   amount  > 0 = dinheiro saindo (gasto), < 0 = estorno/crédito
//   source  = 'cartao' | 'pix' | 'debito' | 'boleto' | 'outros'
//   kind    = 'expense' | 'income' | 'ignore'

export function parseFile(fileName, text) {
  text = text.replace(/^﻿/, '');
  if (/<OFX>|OFXHEADER/i.test(text)) return parseOFX(text, fileName);
  return parseCSV(text, fileName);
}

// ---------- CSV ----------

export function splitCSVLine(line, sep) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function parseCSV(text, fileName = '') {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const header = splitCSVLine(lines[0], sep).map(norm);
  const rows = lines.slice(1).map((l) => splitCSVLine(l, sep));
  const col = (...names) => header.findIndex((h) => names.includes(h));

  // Fatura do cartão: date,title,amount  (formato antigo: date,category,title,amount)
  if (col('date') >= 0 && col('amount') >= 0 && col('title') >= 0) {
    const iDate = col('date'), iTitle = col('title'), iAmount = col('amount'), iCat = col('category');
    const limit = billLimit(fileName, rows.map((r) => [r[iDate], r[iTitle]]));
    return finalize(rows.map((r) => cardTx(r[iDate], r[iTitle], parseAmount(r[iAmount]), iCat >= 0 ? r[iCat] : '', limit)));
  }

  // Extrato da conta: Data,Valor,Identificador,Descrição
  if (col('data') >= 0 && col('valor') >= 0 && col('descricao') >= 0) {
    const iDate = col('data'), iVal = col('valor'), iDesc = col('descricao'), iId = col('identificador');
    return finalize(rows.map((r) => accountTx(r[iDate], r[iDesc], parseAmount(r[iVal]), iId >= 0 ? r[iId] : '')));
  }

  throw new Error(`Formato de CSV não reconhecido em "${fileName}". Cabeçalho: ${lines[0]}`);
}

export function parseAmount(s) {
  if (s == null) return NaN;
  s = String(s).replace(/R\$|\s/g, '');
  // 1.234,56 -> 1234.56 ; 1234.56 fica igual
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s);
}

export function parseDate(s) {
  s = (s || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})/); // OFX
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function dateFromFileName(name) {
  const m = (name || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// Data máxima que uma parcela pode ter nesta fatura: o vencimento (nome do arquivo
// Nubank_AAAA-MM-DD.csv) ou, sem ele, 10 dias após a última compra não parcelada.
function billLimit(fileName, dateTitlePairs) {
  const due = dateFromFileName(fileName);
  if (due) return due;
  const dates = dateTitlePairs.filter(([, t]) => !INSTALLMENT_RE.test(t || '')).map(([d]) => parseDate(d)).filter(Boolean).sort();
  const last = dates[dates.length - 1];
  if (!last) return new Date().toISOString().slice(0, 10);
  const d = new Date(`${last}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 10);
  return d.toISOString().slice(0, 10);
}

export function addMonths(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const INSTALLMENT_RE = /\s*-?\s*parcela\s+(\d+)\s*\/\s*(\d+)\s*$/i;

function cardTx(rawDate, title, amount, nativeCategory, limit) {
  title = (title || '').trim();
  let date = parseDate(rawDate);
  let installment = null;
  const m = title.match(INSTALLMENT_RE);
  if (m) {
    installment = { n: +m[1], total: +m[2] };
    // Em algumas faturas a data da parcela é a data da compra original.
    // Desloca para o mês em que a parcela realmente foi cobrada, sem passar do vencimento.
    if (date && installment.n > 1) {
      const shifted = addMonths(date, installment.n - 1);
      if (shifted <= limit) date = shifted;
    }
  }
  const base = title.replace(INSTALLMENT_RE, '');
  let kind = 'expense';
  if (/pagamento recebido|pagamento em|^pagamento$/i.test(title)) kind = 'ignore';
  return {
    date, description: title, merchant: cleanMerchant(base), amount,
    source: 'cartao', kind, installment, nativeCategory: nativeCategory || '',
  };
}

function accountTx(rawDate, desc, value, externalId) {
  desc = (desc || '').trim();
  const date = parseDate(rawDate);
  const parts = desc.split(' - ').map((s) => s.trim());
  let source = 'outros';
  let merchant = parts[1] || parts[0];
  if (/pix/i.test(desc)) source = 'pix';
  else if (/d[eé]bito/i.test(desc)) source = 'debito';
  else if (/boleto/i.test(desc)) source = 'boleto';

  let kind = value < 0 ? 'expense' : 'income';
  if (/pagamento de fatura|pagamento da fatura/i.test(desc)) kind = 'ignore'; // já contado no cartão
  if (/rdb|dinheiro guardado|dinheiro resgatado|caixinha|aplica[cç][aã]o|resgate/i.test(desc)) kind = 'ignore';
  if (/estorno|devolu[cç][aã]o|reembolso/i.test(desc) && value > 0) kind = 'expense';

  return {
    date, description: desc, merchant: cleanMerchant(merchant), amount: -value,
    source, kind, installment: null, nativeCategory: '', externalId: externalId || '',
  };
}

// ---------- OFX ----------

export function parseOFX(text, fileName = '') {
  const isCard = /<CREDITCARDMSGSRSV1>|<CCSTMTRS>/i.test(text);
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const tag = (b, t) => {
    const m = b.match(new RegExp(`<${t}>([^<\\r\\n]*)`, 'i'));
    return m ? m[1].trim() : '';
  };
  const limit = billLimit(fileName, blocks.map((b) => [tag(b, 'DTPOSTED'), tag(b, 'MEMO') || tag(b, 'NAME')]));
  return finalize(blocks.map((b) => {
    const amount = parseAmount(tag(b, 'TRNAMT'));
    const memo = tag(b, 'MEMO') || tag(b, 'NAME');
    const date = tag(b, 'DTPOSTED');
    if (isCard) return cardTx(date, memo, -amount, '', limit);
    return accountTx(date, memo, amount, tag(b, 'FITID'));
  }));
}

// ---------- utilidades ----------

export function cleanMerchant(s) {
  return (s || '')
    .replace(/[•*]+/g, ' ')
    .replace(/\b(ltda|me|eireli|s\/?a)\b\.?/gi, '')
    .replace(/\s+\d{2,}$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b(\S+)( \1\b)+/g, '$1') // "99app 99app" -> "99app"
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export function merchantKey(m) {
  return norm(m || '').replace(/[^a-z0-9]/g, '');
}

function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Gera ids estáveis (o mesmo arquivo importado duas vezes não duplica transações)
function finalize(list) {
  const seen = new Map();
  return list
    .filter((t) => t.date && Number.isFinite(t.amount))
    .map((t) => {
      const base = t.externalId || `${t.source}|${t.date}|${t.description}|${t.amount.toFixed(2)}`;
      const n = (seen.get(base) || 0) + 1;
      seen.set(base, n);
      return { ...t, id: hash(`${base}#${n}`) };
    });
}
