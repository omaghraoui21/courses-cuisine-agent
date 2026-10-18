export const DELIVERY_PROVIDERS = ['glovo', 'yassir'] as const;
export type DeliveryProvider = typeof DELIVERY_PROVIDERS[number];
export const deliveryLabel = (provider: DeliveryProvider) => provider === 'glovo' ? 'Glovo' : 'Yassir';
export function deliveryProvider(value: unknown): DeliveryProvider {
  if (value === undefined) return 'glovo'; // Older saved drafts used Glovo only.
  if (value === 'glovo' || value === 'yassir') return value;
  throw new Error('Service de livraison inconnu.');
}
export function deliveryConfig(provider: DeliveryProvider, settings: Record<string, string | undefined>) {
  const prefix = provider.toUpperCase();
  const address = settings[prefix + '_BRIDGE_URL'];
  const token = settings[prefix + '_BRIDGE_TOKEN'];
  if (!address || !token?.trim()) return null;
  try {
    const url = new URL(address);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return {url: url.href.replace(/\/$/, ''), token};
  } catch { return null; }
}
export function deliveryStatuses(settings: Record<string, string | undefined>) {
  return DELIVERY_PROVIDERS.map(id => ({id, label: deliveryLabel(id), connected: !!deliveryConfig(id, settings), status: deliveryConfig(id, settings) ? 'configured' : 'inactive'}));
}
export async function boundedJson(source: Request | Response, limit = 50000): Promise<Record<string, unknown>> {
  if (Number(source.headers.get('content-length') || 0) > limit) throw new Error('Panier trop volumineux.');
  const reader = source.body?.getReader();
  if (!reader) throw new Error('JSON requis.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('Panier trop volumineux.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Objet JSON requis.');
  return result as Record<string, unknown>;
}
export async function callDeliveryBridge(provider: DeliveryProvider, settings: Record<string, string | undefined>, path: '/quote' | '/execute', body: unknown, fetcher: typeof fetch = fetch) {
  const config = deliveryConfig(provider, settings);
  if (!config) throw new Error(deliveryLabel(provider) + ' non connecté.');
  const response = await fetcher(config.url + path, {
    method: 'POST', redirect: 'error', headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + config.token},
    body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Le service de commande ne répond pas.');
  return boundedJson(response, 100000);
}
