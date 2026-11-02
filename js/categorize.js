import { merchantKey } from './parsers.js';

export const CATEGORIES = {
  'Delivery': { color: '#e8590c', icon: '🛵' },
  'Restaurantes': { color: '#f08c00', icon: '🍽️' },
  'Mercado': { color: '#2f9e44', icon: '🛒' },
  'Transporte': { color: '#1971c2', icon: '🚗' },
  'Combustível': { color: '#1864ab', icon: '⛽' },
  'Assinaturas': { color: '#9c36b5', icon: '📺' },
  'Compras online': { color: '#c2255c', icon: '📦' },
  'Vestuário': { color: '#d6336c', icon: '👕' },
  'Saúde': { color: '#0c8599', icon: '💊' },
  'Lazer': { color: '#7048e8', icon: '🎉' },
  'Educação': { color: '#3b5bdb', icon: '📚' },
  'Casa e contas': { color: '#5c940d', icon: '🏠' },
  'Viagem': { color: '#0b7285', icon: '✈️' },
  'Beleza': { color: '#e64980', icon: '💅' },
  'Pets': { color: '#a0522d', icon: '🐾' },
  'Pix p/ pessoas': { color: '#12b886', icon: '💸' },
  'Saques e tarifas': { color: '#868e96', icon: '🏧' },
  'Outros': { color: '#adb5bd', icon: '❔' },
};

// Regras por palavra-chave (testadas em ordem; a primeira que casar vence)
const RULES = [
  ['Delivery', /ifood|ifd\b|rappi|ze delivery|z[eé] delivery|aiqfome|james delivery|loggi|uber ?eats|delivery/i],
  ['Transporte', /uber|\b99 ?(app|pop|tecnologia|taxi)|^99$|cabify|indriver|metr[oô]|bilhete|sptrans|riocard|top ?sp|recarga.*transp|estacionamento|estapar|sem parar|conectcar|veloe|ped[aá]gio|taxi/i],
  ['Combustível', /posto|shell|ipiranga|petrobras|\bbr mania|ale combust|combust[ií]vel|gasolina/i],
  ['Assinaturas', /netflix|spotify|amazon ?prime|prime video|disney|hbo|max\.com|globoplay|youtube|google ?(one|storage|play)|apple\.com|icloud|deezer|paramount|crunchyroll|chatgpt|openai|claude|anthropic|microsoft|xbox|playstation|psn|steam|nintendo|twitch|smart ?fit|bluefit|academia|gympass|wellhub|tim |vivo|claro|oi fibra|nubank vida|seguro/i],
  ['Mercado', /mercado(?! ?livre| ?pago)|supermerc|atacad|assa[ií]|carrefour|p[aã]o de a[cç][uú]car|extra |\bdia (brasil|supermerc)|hortifruti|sacol[aã]o|oba hort|st marche|zaffari|guanabara|prezunic|bh supermerc|sams club|makro|tenda|savegnago|condor|angeloni|a[cç]ougue|padaria|panific/i],
  ['Restaurantes', /restaur|lanchon|burger|mc ?donald|bk |habib|subway|outback|pizza|sushi|bar |boteco|cafe|caf[eé]|starbucks|coco bambu|madero|giraffas|spoleto|china in box|churrasc|sorvet|a[cç]a[ií]|doceria|confeit|pastel|espeto|grill|bistr|cervej/i],
  ['Saúde', /farm|drogas|droga ?raia|drogasil|pague menos|panvel|pacheco|venancio|hospital|cl[ií]nica|laborat|m[eé]dic|odonto|dentist|unimed|amil|hapvida|sulamerica|bradesco sa[uú]de|psic|fisioter|exame/i],
  ['Compras online', /mercado ?livre|mercadolivre|mercado ?pago|amazon|amzn|shopee|aliexpress|shein|magalu|magazine|americanas|submarino|casas bahia|kabum|temu|netshoes|centauro|pichau|terabyte/i],
  ['Vestuário', /renner|riachuelo|c&a|cea |zara|hering|marisa|youcom|nike|adidas|puma|arezzo|centauro|decathlon|cal[cç]ados|moda|roupa|vestu/i],
  ['Lazer', /cinema|cinemark|kinoplex|ingresso|sympla|eventim|ticket|show|teatro|parque|bilheteria|\bgames?\b|jogo|\bbet\b|aposta|blaze|pixbet|bet365|betano|clube/i],
  ['Educação', /escola|col[eé]gio|faculdade|universidade|curso|udemy|alura|coursera|duolingo|livraria|saraiva|amazon kindle|kindle|estuda|ingl[eê]s|idioma/i],
  ['Casa e contas', /enel|light|cemig|copel|celesc|coelba|eletropaulo|energia|sabesp|cedae|copasa|[aá]gua|\bg[aá]s\b|comg[aá]s|condom[ií]nio|aluguel|leroy|telhanorte|c&c|tok ?stok|etna|camicado|ikea|casa|iptu|internet|net virtua/i],
  ['Viagem', /hotel|pousada|airbnb|booking|decolar|123 ?milhas|latam|gol linhas|voegol|azul linhas|voeazul|hurb|cvc|rodovi[aá]ria|clickbus|buser/i],
  ['Beleza', /sal[aã]o|barbearia|barber|cabelo|est[eé]tica|manicure|botic[aá]rio|natura|sephora|o boticario|avon|eudora|perfum/i],
  ['Pets', /pet|petz|cobasi|petlove|veterin|ra[cç][aã]o/i],
  ['Saques e tarifas', /saque|tarifa|juros|iof|anuidade|multa|encargo/i],
];

const NATIVE = {
  restaurante: 'Restaurantes', transporte: 'Transporte', supermercado: 'Mercado', servicos: 'Assinaturas',
  lazer: 'Lazer', saude: 'Saúde', educacao: 'Educação', casa: 'Casa e contas', vestuario: 'Vestuário',
  viagem: 'Viagem', eletronicos: 'Compras online', outros: 'Outros',
};

export function guessCategory(tx) {
  // No extrato a descrição traz nome do banco ("NU PAGAMENTOS", "ITAÚ"...), então só o destinatário conta
  const text = tx.source === 'cartao' ? `${tx.merchant} ${tx.description}` : tx.merchant;
  // Pix/transferência sem palavra-chave conhecida = pagamento a pessoa
  for (const [cat, re] of RULES) if (re.test(text)) return cat;
  if (tx.source === 'pix' || /transfer[eê]ncia/i.test(tx.description)) return 'Pix p/ pessoas';
  const nat = (tx.nativeCategory || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (NATIVE[nat]) return NATIVE[nat];
  return 'Outros';
}

// Motivos automáticos para não contar uma transação como gasto
const BILL_RE = /fatura|pagamento de cart[aã]o|pagamento cart[aã]o/i;
const NUBANK_RE = /^(nu ?pagamentos|nubank|nu financeira|nu invest)/i;
const SAVINGS_RE = /\brdb\b|dinheiro guardado|dinheiro resgatado|caixinha|aplica[cç][aã]o|resgate|porquinho/i;

export function autoIgnoreReason(t) {
  if (t.source === 'cartao') {
    if (t.amount < 0 && /^pagamento|pagamento recebido/i.test(t.description)) return 'Pagamento da fatura';
    return null;
  }
  if (t.amount > 0 && (BILL_RE.test(t.description) || NUBANK_RE.test(t.merchant || ''))) return 'Pagamento da fatura';
  if (SAVINGS_RE.test(t.description)) return 'Caixinha / investimento';
  return null;
}

// Pix/boleto/débito com o mesmo valor de um "Pagamento recebido" da fatura (até 5 dias de diferença)
function billPaymentIds(txs) {
  const payments = txs.filter((t) => t.source === 'cartao' && t.amount < 0 && /pagamento/i.test(t.description));
  const ids = new Set();
  const day = (d) => Date.parse(`${d}T00:00:00Z`) / 864e5;
  for (const p of payments) {
    const match = txs.find((t) => t.source !== 'cartao' && !ids.has(t.id) && Math.abs(t.amount + p.amount) < 0.01 &&
      Math.abs(day(t.date) - day(p.date)) <= 5);
    if (match) ids.add(match.id);
  }
  return ids;
}

// overrides: {
//   byId: {id: cat}, byMerchant: {merchantKey: cat},
//   ignored: {id: true|false}  (false = forçar contar como gasto),
//   ignoredMerchants: {merchantKey: true}
// }
export function applyCategories(txs, overrides = {}) {
  const byId = overrides.byId || {};
  const byMerchant = overrides.byMerchant || {};
  const ignored = overrides.ignored || {};
  const ignoredMerchants = overrides.ignoredMerchants || {};
  const bills = billPaymentIds(txs);
  return txs.map((t) => {
    const key = merchantKey(t.merchant);
    const category = byId[t.id] || byMerchant[key] || guessCategory(t);
    let kind = t.kind === 'income' ? 'income' : 'expense';
    let ignoreReason = null;
    if (kind !== 'income') {
      ignoreReason = autoIgnoreReason(t) || (bills.has(t.id) ? 'Pagamento da fatura' : null);
      if (!ignoreReason && t.kind === 'ignore') ignoreReason = 'Ignorada';
    }
    if (ignoredMerchants[key]) ignoreReason = 'Ignorada por você';
    if (ignored[t.id] === true) ignoreReason = 'Ignorada por você';
    if (ignored[t.id] === false) ignoreReason = null;
    if (ignoreReason) kind = 'ignore';
    else if (kind === 'ignore') kind = 'expense';
    return { ...t, category, kind, ignoreReason, merchantKey: key };
  });
}
