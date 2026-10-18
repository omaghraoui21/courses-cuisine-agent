# Nesma — Courses & Cuisine

Application familiale de courses et cuisine pour la Tunisie. Interface mobile française, inventaire durable D1, liste de courses, idées de recettes et suivi des sources marchandes.

## Fonctions disponibles dans le code

- Stock vide au départ ; ajout manuel, consommation, dernière réserve, historique et annulation.
- Séparation inventaire/achats, import à confirmer et protection par empreinte contre les doublons.
- Liste de courses persistante, prix connus/inconnus distincts et export JSON.
- Recettes modèles simples ; disponibilité indicative, ingrédients manquants visibles.
- Prévisions déclarées, puis observations après au moins trois consommations sur quatorze jours ; projections mensuelles/annuelles provisoires.
- Collecteur MG testé sur source réelle ; autres enseignes affichent leur état d'accès.
- Analyse photo via Vercel AI Gateway une fois les secrets configurés ; quota de dix analyses par jour.
- Brouillons et approbations de commande ; exécution désactivée tant qu'un vrai pont Glovo ou Yassir n'est pas connecté.

Aucune photo ou donnée personnelle de la conversation n'est injectée dans l'application ou committée.

## Développement

Node 24 recommandé. Depuis la racine : `npm run install:ci`, puis `npm run dev` dans un environnement de prévisualisation pris en charge par Sites. Stock D1 local : appliquer les migrations selon la configuration de l'hébergeur avant usage. Le site utilise l'identité ChatGPT ; aucun bypass de production n'est prévu.

Vérification : `node --test tests/*.mjs tests/*.test.ts` puis `node node_modules/typescript/bin/tsc --noEmit --incremental false` et `npm run build`.

## Déploiement

La version principale utilise Sites (Vinext/Cloudflare Worker), D1 binding DB et authentification ChatGPT. Le fichier `.openai/hosting.json` conserve l'identité du site. Les migrations Drizzle sont appliquées par le déploiement Sites. Les secrets sont définis via l'hébergeur, jamais dans Git. Voir `.env.example` pour les noms uniquement.

Le compagnon `agent-runtime/` est un projet eve séparé non déployé par le build du site. Grocy n'est pas requis : son hébergement PHP serait indépendant. Voir docs/architecture.md.

## Limites connues

- Accès Site privé ; foyer partagé par invitation à usage unique. Le conjoint doit aussi recevoir l’accès au Site dans Partager.
- Pas d'accès IA actif sans clé et modèle ; saisie manuelle toujours disponible.
- Pas de pont Glovo ou Yassir opérationnel ni de paiement automatique actif.
- Pas de collecte quotidienne planifiée ; actualisation au clic et cache temporaire.
- Quatre enseignes ne fournissent pas encore de prix automatiquement exploitables.
- Dix recettes et menus trois/sept jours ; seuls les filtres reconnus sont appliqués, les emballages restent à vérifier.

Voir docs/retailer-feasibility.md et docs/delivery-bridge.md. Les états indisponibles restent explicites ; aucun succès simulé.

## Usage simple et état production
Maison / Repas / Liste, niveaux sans comptage quotidien, liste semaine/mois, sauvegardes et restauration. Voir [production-readiness](docs/production-readiness.md) pour les fonctions vérifiées et les intégrations encore inactives.

## Courses et livraison V3
Conseiller de besoins, offres candidates sourcées et formats explicites, choix Glovo/Yassir, copie de liste et brouillons par fournisseur. Les prix des enseignes ne sont pas des devis de livraison. Voir [objectif V3](docs/goal-v3.md) et [reprise agent](AGENTS.md).
