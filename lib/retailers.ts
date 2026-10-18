/** Public retailer sources only. No supplied URL is ever fetched. */
export type RetailerStatus = 'ok' | 'catalog_only' | 'blocked' | 'unavailable';
export type Offer = { name: string; priceMillimes: number; unit?: string; url: string; validUntil?: string };
export type RetailerResult = { id: string; name: string; url: string; status: RetailerStatus; lastChecked: string; message: string; catalogs: { title: string; url: string }[]; offers: Offer[] };
type Source = { id: string; name: string; url: string; hosts: string[]; seeds: string[] };
export const SOURCES: Source[] = [
  { id: 'mg', name: 'MG', url: 'https://mg.tn/', hosts: ['mg.tn', 'www.mg.tn', 'mgcatalogue.tn', 'www.mgcatalogue.tn'], seeds: ['https://mg.tn/'] },
  { id: 'monoprix', name: 'Monoprix', url: 'https://www.monoprix.tn/', hosts: ['monoprix.tn', 'www.monoprix.tn', 'courses.monoprix.tn'], seeds: ['https://www.monoprix.tn/', 'https://courses.monoprix.tn/'] },
  { id: 'carrefour', name: 'Carrefour', url: 'https://www.carrefour.tn/', hosts: ['carrefour.tn', 'www.carrefour.tn'], seeds: ['https://www.carrefour.tn/'] },
  { id: 'geant', name: 'Géant', url: 'https://geant.tn/', hosts: ['geant.tn', 'www.geant.tn'], seeds: ['https://geant.tn/'] },
  { id: 'aziza', name: 'Aziza', url: 'https://www.aziza.tn/', hosts: ['aziza.tn', 'www.aziza.tn'], seeds: ['https://www.aziza.tn/'] },
];
export function safeSourceUrl(value: string, base: string, hosts: string[]): string | null {
  try { const url = new URL(value, base); if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !hosts.includes(url.hostname)) return null; return url.href; } catch { return null; }
}
function clean(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/&#(\d+);/g, (_, n) => Number(n) < 0x110000 ? String.fromCodePoint(Number(n)) : '').replace(/&#x([\da-f]+);/gi, (_, n) => parseInt(n, 16) < 0x110000 ? String.fromCodePoint(parseInt(n, 16)) : '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;|&#039;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
export function toMillimes(price: unknown): number | null {
  if (typeof price !== 'string' && typeof price !== 'number') return null;
  const raw = String(price).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,3})?$/.test(raw)) return null;
  const n = Math.round(Number(raw) * 1000); return n > 0 && n < 100000000 ? n : null;
}
export function parseRetailerHtml(id: string, html: string, pageUrl: string): { catalogs: RetailerResult['catalogs']; offers: Offer[] } {
  const source = SOURCES.find(s => s.id === id); if (!source) throw new Error('Unknown retailer');
  const offers: Offer[] = []; const catalogs: RetailerResult['catalogs'] = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = safeSourceUrl(clean(match[1]), pageUrl, source.hosts);
    if (url && /catalog|prospectus|\.pdf(?:[?#]|$)/i.test(url + ' ' + clean(match[2]))) catalogs.push({ title: clean(match[2]).slice(0, 150) || `Catalogue ${source.name}`, url });
  }
  // MG's actual PrestaShop product cards: price's machine-readable content belongs to the same article as the title.
  if (id === 'mg') for (const card of html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)) {
    const title = card[0].match(/<h[1-6]\b[^>]*class=["'][^"']*\bproduct-title\b[^"']*["'][^>]*>[\s\S]*?<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const priceTag = card[0].match(/<span\b[^>]*class=["'][^"']*\bproduct-price\b[^"']*["'][^>]*>/i)?.[0];
    const price = toMillimes(priceTag?.match(/\bcontent=["']([^"']+)["']/i)?.[1]);
    const url = title && safeSourceUrl(clean(title[1]), pageUrl, source.hosts);
    if (title && url && price !== null) offers.push({ name: clean(title[2]).slice(0, 200), priceMillimes: price, url });
  }
  // Structured product offers only. Never associate arbitrary nearby numbers with a product.
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const visit = (node: unknown, depth = 0): void => {
        if (depth > 12 || node === null || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.slice(0, 500).forEach(x => visit(x, depth + 1)); return; }
        const obj = node as Record<string, unknown>;
        if ((obj['@type'] === 'Product' || (Array.isArray(obj['@type']) && obj['@type'].includes('Product'))) && typeof obj.name === 'string') {
          for (const offer of (Array.isArray(obj.offers) ? obj.offers : [obj.offers])) {
            if (!offer || typeof offer !== 'object') continue;
            const o = offer as Record<string, unknown>; if (o.priceCurrency !== 'TND') continue;
            const price = toMillimes(o.price); const url = safeSourceUrl(String(o.url || obj.url || pageUrl), pageUrl, source.hosts);
            if (price !== null && url) {
              const until = typeof o.priceValidUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.priceValidUntil) ? o.priceValidUntil : undefined;
              if (until && until < new Date().toISOString().slice(0, 10)) continue;
              offers.push({ name: clean(obj.name).slice(0, 200), priceMillimes: price, url, ...(until ? { validUntil: until } : {}) });
            }
          }
        }
        Object.values(obj).forEach(x => visit(x, depth + 1));
      }; visit(JSON.parse(script[1]));
    } catch { /* invalid JSON-LD is not a valid offer */ }
  }
  return { catalogs: [...new Map(catalogs.map(c => [c.url, c])).values()].slice(0, 15), offers: [...new Map(offers.filter(o => o.name).map(o => [o.url + ':' + o.priceMillimes, o])).values()].slice(0, 100) };
}
class FetchError extends Error { blocked: boolean; constructor(message: string, blocked = false) { super(message); this.blocked = blocked; } }
async function fetchHtml(source: Source, start: string): Promise<{ html: string; url: string }> {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 9000);
  try {
    let url = start;
    for (let hop = 0; hop < 4; hop++) {
      if (!safeSourceUrl(url, start, source.hosts)) throw new FetchError('Redirection externe refusée.');
      const response = await fetch(url, { redirect: 'manual', signal: controller.signal, headers: { 'User-Agent': 'CoursesCuisine/0.1 (+personal household price comparison)', Accept: 'text/html' } });
      if (response.status >= 300 && response.status < 400) {
        const next = safeSourceUrl(response.headers.get('location') || '', url, source.hosts); await response.body?.cancel();
        if (!next) throw new FetchError('Redirection externe refusée.'); url = next; continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw new FetchError(`Source HTTP ${response.status}.`, [401, 403, 429].includes(response.status)); }
      if (!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); throw new FetchError('Source non HTML : importer le catalogue séparément.'); }
      const reader = response.body?.getReader(); if (!reader) throw new FetchError('Source vide.');
      const decoder = new TextDecoder(); let html = ''; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2000000) { await reader.cancel(); throw new FetchError('Source trop volumineuse.'); } html += decoder.decode(value, { stream: true }); }
      html += decoder.decode(); return { html, url };
    }
    throw new FetchError('Trop de redirections.');
  } finally { clearTimeout(timer); }
}
const cache = new Map<string, { expires: number; result: RetailerResult }>();
const running = new Map<string, Promise<RetailerResult>>();
export async function collectRetailer(id: string, refresh = false): Promise<RetailerResult> {
  const source = SOURCES.find(s => s.id === id); if (!source) throw new Error('Unknown retailer');
  const existing = cache.get(id); if (existing && existing.expires > Date.now() && (!refresh || Date.now() - Date.parse(existing.result.lastChecked) < 60000)) return existing.result;
  const pending = running.get(id); if (pending) return pending;
  const task = (async () => {
    const results = await Promise.allSettled(source.seeds.map(seed => fetchHtml(source, seed)));
    let blocked = false; let accessible = false; let catalogs: RetailerResult['catalogs'] = []; let offers: Offer[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') { accessible = true; const parsed = parseRetailerHtml(id, result.value.html, result.value.url); catalogs.push(...parsed.catalogs); offers.push(...parsed.offers); if (/captcha|access denied|just a moment|enable javascript|JavaScript est désactivé/i.test(result.value.html) && !parsed.offers.length && !parsed.catalogs.length) blocked = true; }
      else if (result.reason instanceof FetchError && result.reason.blocked) blocked = true;
    }
    catalogs = [...new Map(catalogs.map(c => [c.url, c])).values()]; offers = [...new Map(offers.map(o => [o.url, o])).values()];
    const status: RetailerStatus = offers.length ? 'ok' : catalogs.length ? 'catalog_only' : blocked || accessible ? 'blocked' : 'unavailable';
    const message = offers.length ? `${offers.length} prix publics extraits. Disponibilité, validité et prix en magasin à vérifier ; ces prix ne sont pas ceux de Glovo.` : catalogs.length ? 'Catalogues repérés. Prix non extraits : importer les pages pour lecture et validation.' : status === 'blocked' ? 'Aucun prix exploitable en accès serveur : site JavaScript ou accès limité. Import de catalogue disponible.' : 'Source inaccessible lors de cette vérification. Aucun prix estimé ou inventé.';
    const result: RetailerResult = { id, name: source.name, url: source.url, status, lastChecked: new Date().toISOString(), message, catalogs, offers };
    cache.set(id, { result, expires: Date.now() + 15 * 60 * 1000 }); return result;
  })();
  running.set(id, task); try { return await task; } finally { running.delete(id); }
}
export async function collectAllRetailers(): Promise<RetailerResult[]> { return Promise.all(SOURCES.map(s => collectRetailer(s.id))); }
