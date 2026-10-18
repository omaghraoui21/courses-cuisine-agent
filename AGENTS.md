# Nesma — reprise du projet

## But produit
Réduire la charge mentale d'un foyer tunisien. L'écran principal doit rester utilisable sans vocabulaire informatique : Maison, Repas, Liste. Photo et boutons simples ; détails facultatifs. Ne pas imposer de comptage quotidien.

## Première lecture
1. `docs/production-readiness.md` : état réel et limites.
2. `docs/goal-v3.md` : lot courant et critères d'acceptation.
3. `docs/architecture.md` et `docs/delivery-bridge.md` : frontières techniques.
4. `README.md` : vérification et démarrage.

## Architecture
Vinext/React sur ChatGPT Sites, Cloudflare Worker, D1 `DB`, identité ChatGPT. Le `project_id` existant dans `.openai/hosting.json` est opaque : le préserver. Le projet est privé ; ne pas changer l'audience sans demande. Le compagnon `agent-runtime/` n'est pas déployé avec le site. Ne pas imposer Grocy ni ajouter une deuxième base.

## Données et erreurs
- Résoudre le foyer côté serveur via `resolveHousehold`. Le client envoie le foyer attendu pour refuser une écriture depuis un écran périmé.
- Mutations de stock : validation stricte, CAS et reçu permanent dans la même transaction. Réutiliser le requestId après un résultat incertain ; ne pas supprimer le registre permanent.
- Les photos de cadrage sont des exemples, jamais un inventaire à injecter.
- Une quantité/date/équivalence inconnue reste à confirmer. La consommation observée ne vient pas d'une simple photo ou d'un achat.
- Aucun secret dans Git, journaux ou conversation. Pas d'API IA active requise pour ce lot.

## Livraison
Glovo et Yassir sont deux fournisseurs distincts. Le panier stocke son fournisseur ; une approbation ne doit jamais le changer. Un prix d'enseigne n'est pas un devis livré. Le pont externe doit lire les frais/adresse/articles réels, persister l'idempotence avant soumission et revalider le devis approuvé. Après timeout de paiement : statut inconnu, vérification manuelle, jamais de relance aveugle. Le navigateur persistant n'est pas implémenté par le Worker.

## Validation
`node --test tests/*.mjs tests/*.test.ts`
`node node_modules/typescript/bin/tsc --noEmit --incremental false`
Build et publication avec le workflow Sites fourni par l'environnement. Ne pas lancer un navigateur de substitution si le contrôle navigateur pris en charge est indisponible. Ne pas annoncer un test réel de photo, commande ou deux téléphones sans l'avoir effectué.

L'utilisateur demande un contrôle indépendant à chaque grande étape : déléguer une revue ciblée avant livraison, corriger les bloquants, puis publier les changements autorisés.

## Prochain travail utile
Activer une IA choisie par le propriétaire via configuration sécurisée, évaluer les photos privées, améliorer les collecteurs à partir de sources autorisées, développer les ponts de livraison puis faire un essai supervisé. Tout cela reste inactif tant que les dépendances réelles ne sont pas présentes.
