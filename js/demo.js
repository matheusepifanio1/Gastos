// Gera arquivos no mesmo formato que o Nubank exporta, para testar o app sem dados reais.
import { parseCSV, addMonths } from './parsers.js';

function rng(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

export function demoTransactions(today = new Date().toISOString().slice(0, 10)) {
  const r = rng(42);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const money = (min, max) => (min + r() * (max - min)).toFixed(2);
  const cardFiles = [];
  let card;
  const account = ['Data,Valor,Identificador,Descrição'];
  const start = addMonths(today, -6).slice(0, 7);

  for (let mi = 0; mi <= 6; mi++) {
    const month = addMonths(`${start}-01`, mi).slice(0, 7);
    const days = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
    const lastDay = days;
    const d = (n) => `${month}-${String(Math.min(n, days)).padStart(2, '0')}`; // datas futuras são filtradas no final
    const br = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    let id = 0;
    card = ['date,title,amount'];
    cardFiles.push([`Nubank_${addMonths(`${month}-10`, 1)}.csv`, card]);
    const acc = (date, val, desc) => account.push(`${br(date)},${val},${month}-${++id},"${desc}"`);

    // Assinaturas
    card.push(`${d(5)},Netflix.Com,55.90`, `${d(8)},Spotify,21.90`, `${d(12)},Smart Fit,119.90`);
    if (mi >= 2) card.push(`${d(15)},Amazon Prime Canais,19.90`);

    // Gasto que cresce ao longo dos meses (delivery)
    const nDelivery = 5 + mi * 2;
    for (let i = 0; i < nDelivery; i++) {
      const day = 1 + Math.floor(r() * lastDay);
      card.push(`${d(day)},${pick(['Ifd*Ifood', 'Ifd*Restaurante Sabor', 'Rappi Brasil', 'Ze Delivery'])},${money(28, 95)}`);
    }
    for (let i = 0; i < 12; i++) card.push(`${d(1 + Math.floor(r() * lastDay))},${pick(['Uber *Trip', '99app *99app', 'Uber *Trip'])},${money(9, 42)}`);
    for (let i = 0; i < 4; i++) card.push(`${d(1 + Math.floor(r() * lastDay))},${pick(['Carrefour Hiper', 'Pao de Acucar', 'Assai Atacadista'])},${money(80, 420)}`);
    for (let i = 0; i < 10; i++) card.push(`${d(1 + Math.floor(r() * lastDay))},${pick(['Padaria Real', 'Starbucks', 'Cafe do Ponto', 'Lanchonete Central'])},${money(8, 29)}`);
    for (let i = 0; i < 3; i++) card.push(`${d(1 + Math.floor(r() * lastDay))},${pick(['Restaurante Madero', 'Outback', 'Coco Bambu', 'Bar do Ze'])},${money(90, 260)}`);
    card.push(`${d(18)},Drogasil,${money(30, 140)}`);
    if (r() > 0.4) card.push(`${d(20)},${pick(['Shopee', 'Mercadolivre*Loja', 'Amazon Marketplace'])},${money(40, 300)}`);
    if (mi === 3) card.push(`${d(10)},Posto Shell,${money(180, 250)}`, `${d(24)},Cinemark,64.00`);

    // Parcelado: notebook em 10x comprado no 2º mês (fatura traz a data da compra original)
    if (mi >= 1) card.push(`${addMonths(`${start}-07`, 1)},Kabum - Parcela ${mi}/10,389.90`);
    if (mi >= 4) card.push(`${d(11)},Renner - Parcela ${mi - 3}/4,99.75`);
    if (mi > 0) card.push(`${d(3)},Pagamento recebido,-${money(1800, 2600)}`);

    // Conta: salário, Pix, fatura
    acc(d(5), '5200.00', 'Transferência recebida pelo Pix - EMPRESA EXEMPLO LTDA - 12.345.678/0001-90 - ITAÚ UNIBANCO S.A. (0341) Agência: 1 Conta: 1-1');
    acc(d(10), '-1500.00', 'Transferência enviada pelo Pix - JOAO PROPRIETARIO - •••.456.789-•• - CAIXA ECONOMICA FEDERAL (0104) Agência: 1 Conta: 2-2');
    acc(d(10), '-2150.00', 'Pagamento de fatura');
    acc(d(15), '-189.90', 'Pagamento de boleto efetuado - ENEL DISTRIBUICAO SP');
    acc(d(16), '-300.00', 'Aplicação RDB');
    for (let i = 0; i < 3 + (mi % 3); i++) {
      acc(d(1 + Math.floor(r() * lastDay)), `-${money(20, 180)}`, `Transferência enviada pelo Pix - ${pick(['MARIA SILVA', 'PEDRO SOUZA', 'ANA COSTA', 'FEIRA DO BAIRRO'])} - •••.111.222-•• - NU PAGAMENTOS - IP (0260) Agência: 1 Conta: 3-3`);
    }
    acc(d(22), `-${money(15, 60)}`, `Compra no débito - ${pick(['Padaria Real', 'Hortifruti', 'Barbearia Vip'])}`);
  }
  return [...cardFiles.flatMap(([name, lines]) => parseCSV(lines.join('\n'), name)), ...parseCSV(account.join('\n'), 'NU_demo.csv')]
    .filter((t) => t.date <= today);
}
