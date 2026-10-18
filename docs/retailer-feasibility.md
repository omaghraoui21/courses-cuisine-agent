# Collecte enseignes — état réel au 18 octobre 2026

Les captures du foyer fournies dans la conversation sont des exemples : elles ne sont ni publiées ni chargées comme stock initial de production.

## Sources inspectées

| Source | Observation HTTP réelle | Collecteur livré |
|---|---|---|
| https://mg.tn/ | HTTP 200 ; HTML PrestaShop avec 10 articles nommés et prix `span.product-price[content]` | Extraction de ces prix depuis la même carte produit, et lien catalogue découvert |
| https://www.carrefour.tn/ | HTTP 200 ; shell d'application JavaScript, pas de fiches prix HTML | Détection JSON-LD si présent ; sinon état accès limité, aucun prix |
| https://www.monoprix.tn/ | HTTP 200 ; shell JavaScript | Détection JSON-LD et liens catalogue si présents ; pas d'offre synthétique |
| https://courses.monoprix.tn/ | HTTP 403 dans cette vérification | État accès limité, aucun contournement |
| https://geant.tn/ | HTTP 502 dans la vérification shell, timeout via moteur web | État indisponible en cas d'échec ; découverte de catalogues si le serveur répond |
| https://www.aziza.tn/ | HTTP 200 ; shell JavaScript, contenu utile non accessible en HTML | État accès limité ; aucune extraction Facebook automatisée |

Le lien MG `https://mgcatalogue.tn/Catalogue-18.php#page-1` a été découvert dans le HTML. Il est affiché, pas traité par OCR. Aucun chiffre ci-dessus n'est injecté dans l'application : les offres proviennent exclusivement de la réponse HTTP de chaque collecte.

Exemples de contrôle du parseur sur la réponse réelle MG : biscottes au son 280 g = 4 190 millimes ; essuie-tout 4 rouleaux = 5 490 millimes. Ce sont des prix observés, sans garantie de validité future ou de disponibilité. Quelques URL de produits MG ont des slugs historiques différents du titre affiché : le titre est celui de la carte, le lien reste la source originale.

## Contrat et sécurité

- `GET /api/retailers` : connexion ChatGPT requise, renvoie `{retailers: [...]}`. Toutes les sources sont essayées en parallèle, délai de 9 secondes par source.
- `POST /api/retailers` avec `{ "id": "mg" }` : connexion et Origin identique requis. Rafraîchit une enseigne ; délai minimal 60 secondes entre deux collectes d'une même enseigne dans le même processus.
- Cache public en mémoire 15 minutes, aucune donnée du foyer ; cache perdu lors d'un redémarrage. Il ne garantit pas un quota global entre plusieurs instances.
- Une allowlist exacte HTTPS est appliquée aux sources, redirections, offres et catalogues. Aucun URL fourni par l'utilisateur n'est téléchargé. Pas de protocole HTTP, credentials URL, port non standard, IP, ni domaine ressemblant.
- Redirections limitées, réponse HTML limitée à 2 Mo en lecture, annulation lors du dépassement ou timeout. Les 401/403/429 et challenges ne sont pas contournés.
- Prix stockés en millimes entiers. JSON-LD accepté uniquement pour des `Product` avec `offers.priceCurrency=TND`, pas des nombres arbitraires ou devises inconnues. Offres explicitement expirées exclues. Absence de date = validité inconnue.
- Aucun panier marchand ou paiement n'est déclenché par la collecte. Prix magasin et Glovo restent deux canaux distincts.

## Ce qui reste à intégrer

1. Lecture OCR/vision des PDF et images des catalogues avec source, page, dates et confirmation des ambiguïtés. Le collecteur fourni ne prétend pas le faire.
2. Examiner les pages rendues et accès officiels des enseignes sous réserve de leurs conditions et des règles de collecte ; pas de scraping universel garanti.
3. Magasins et adresse du foyer pour la comparaison réelle ; matching EAN/format/marque et comparaison par unité.
4. Cache persistant et quotas partagés avant une ouverture multiutilisateur, avec rafraîchissement périodique côté serveur.
5. Vérification en déploiement : les accès réseau du worker peuvent différer du poste de développement. Un succès shell n'implique pas un succès Cloudflare.

## Validation

`node --test tests/retailers.test.mjs` : tests de conversion TND, allowlist/SSRF, rapprochement titre-prix MG, devises et dates JSON-LD, absence d'offres inventées sur shell vide.
