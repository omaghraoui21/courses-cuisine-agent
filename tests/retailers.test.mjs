import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRetailerHtml, safeSourceUrl, toMillimes } from '../lib/retailers.ts';
test('TND parser converts exact three-decimal currency and rejects malformed values', () => {
  assert.equal(toMillimes('2.89'), 2890); assert.equal(toMillimes('6,400'), 6400); assert.equal(toMillimes('259'), 259000);
  for (const n of [undefined, '', '2.8900', '2.99 DT', -1, 0, NaN]) assert.equal(toMillimes(n), null);
});
test('allows exact retailer domains only, HTTPS only, rejects credential/port/host tricks', () => {
  const base = 'https://mg.tn/'; const hosts = ['mg.tn', 'mgcatalogue.tn'];
  assert.equal(safeSourceUrl('/catalogue.pdf', base, hosts), base + 'catalogue.pdf');
  for (const url of ['http://mg.tn/a', 'https://mg.tn.evil.test', 'https://mg.tn@evil.test', 'https://127.0.0.1/', 'https://mg.tn:8443/', 'javascript:alert(1)']) assert.equal(safeSourceUrl(url, base, hosts), null);
});
test('real MG markup pairs title with machine readable price inside a single product article', () => {
  const html = `<a href="https://mgcatalogue.tn/Catalogue-18.php#page-1"><img alt="Catalogue mg"></a>
  <article class="product-miniature"><h2 class="h3 product-title"><a href="https://mg.tn/accueil/648-essuite-tout.html">Essuite tout 2 P 4Rouleaux BLC KOLL YOUM</a></h2><span class="product-price" content="5.49" aria-label="Prix">5 ,490 DT</span></article>
  <article><h2 class="product-title"><a href="/incomplete.html">No price</a></h2></article><span class="product-price" content="99"></span>`;
  const parsed = parseRetailerHtml('mg', html, 'https://mg.tn/');
  assert.equal(parsed.offers.length, 1); assert.equal(parsed.offers[0].priceMillimes, 5490); assert.equal(parsed.catalogs.length, 1);
});
test('JSON-LD only accepts actual TND Product offers, excludes expired offers and external links', () => {
  const html = `<script type="application/ld+json">${JSON.stringify([{ '@type': 'Product', name: 'Produit valide', offers: { priceCurrency: 'TND', price: '4.190', url: '/produit' } }, { '@type': 'Product', name: 'USD', offers: { priceCurrency: 'USD', price: 20 } }, { '@type': 'Product', name: 'Expired', offers: { priceCurrency: 'TND', price: 2, priceValidUntil: '2020-01-01' } }, { '@type': 'Product', name: 'External', offers: { priceCurrency: 'TND', price: 2, url: 'https://evil.test/' } }])}</script>`;
  const { offers } = parseRetailerHtml('carrefour', html, 'https://www.carrefour.tn/'); assert.equal(offers.length, 1); assert.equal(offers[0].priceMillimes, 4190);
});
test('empty JS shell reports no synthetic catalogues or prices', () => {
  assert.deepEqual(parseRetailerHtml('aziza', '<div id="app"></div>', 'https://www.aziza.tn/'), { catalogs: [], offers: [] });
});
test('collection refuses off-domain redirects before following and coalesces simultaneous refreshes', async () => {
  const { collectRetailer } = await import('../lib/retailers.ts');
  const original = globalThis.fetch; const calls = [];
  globalThis.fetch = async url => { calls.push(url); return new Response('', { status: 302, headers: { location: 'https://127.0.0.1/private' } }); };
  try {
    const results = await Promise.all([collectRetailer('geant', true), collectRetailer('geant', true)]);
    assert.equal(calls.length, 1); assert.equal(results[0].status, 'unavailable'); assert.equal(results[0].offers.length, 0);
    await assert.rejects(collectRetailer('https://evil.test'), /Unknown retailer/);
  } finally { globalThis.fetch = original; }
});
test('upstream forbidden response becomes blocked with no fabricated offers', async () => {
  const { collectRetailer } = await import('../lib/retailers.ts'); const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('Forbidden', { status: 403 });
  try { const result = await collectRetailer('aziza'); assert.equal(result.status, 'blocked'); assert.deepEqual(result.offers, []); }
  finally { globalThis.fetch = original; }
});
