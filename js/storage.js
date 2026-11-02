// Tudo fica no próprio aparelho (localStorage). Nada é enviado para servidor algum.
const KEY = 'gastos-nubank-v1';

const empty = () => ({ transactions: [], overrides: { byId: {}, byMerchant: {}, ignored: {} }, settings: { goal: 0 }, imports: [] });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw);
    const base = empty();
    return { ...base, ...data, overrides: { ...base.overrides, ...data.overrides }, settings: { ...base.settings, ...data.settings } };
  } catch {
    return empty();
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return empty();
}

// Mescla sem duplicar (ids estáveis gerados pelo parser)
export function mergeTransactions(existing, incoming) {
  const ids = new Set(existing.map((t) => t.id));
  const added = incoming.filter((t) => !ids.has(t.id));
  return { list: [...existing, ...added].sort((a, b) => (a.date < b.date ? 1 : -1)), added: added.length };
}
