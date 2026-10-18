# Livraison Glovo et Yassir

Nesma prépare un panier pour le service choisi. **Aucun connecteur marchand opérationnel ni achat réel n'est livré avec cette version.** Sans passerelle configurée, le panier est un brouillon non vérifié : prix livré inconnu, approbation et exécution impossibles. Une configuration présente signifie « configuré », pas que la disponibilité du service ou un paiement ont été testés.

## Contrat de l'application

- `GET /api/orders` expose `providers` : `id`, `label`, `connected`, `status` (`configured` ou `inactive`). Le champ historique `connected` reste celui de Glovo.
- `POST /api/orders` avec `action: prepare`, `provider: glovo | yassir`, `items`, `budgetMillimes` et `expectedScopeId` prépare un brouillon. L'absence de provider signifie Glovo pour compatibilité. Le contexte du foyer envoyé par l'interface est contrôlé pour chaque action. Le foyer est enregistré avec le brouillon ; approbation et exécution sont refusées si le compte a changé de foyer. Un ancien brouillon sans contexte appartient au foyer personnel du compte.
- `approve` et `execute` prennent l'identifiant du brouillon. Le service enregistré dans le brouillon est immuable. Une tentative de sélectionner un autre service est refusée. Les anciens brouillons sans provider restent Glovo.
- Les commandes restent personnelles au compte qui les a créées, même dans un foyer partagé.

## Configuration ultérieure

Dans les secrets serveur uniquement, définir les paires `GLOVO_BRIDGE_URL` / `GLOVO_BRIDGE_TOKEN` et/ou `YASSIR_BRIDGE_URL` / `YASSIR_BRIDGE_TOKEN`. Ne jamais placer de jeton dans GitHub, le navigateur ou un message. L'URL doit utiliser HTTPS sans identifiants, query string ni fragment. Une URL mal formée désactive le service au lieu de casser l'écran.

Ces variables pointent vers **une passerelle à développer et autoriser**. Elles ne constituent pas une API officielle Glovo ou Yassir et ne prouvent pas l'existence d'un accès marchand. La disponibilité des magasins dépendra de l'adresse du foyer et du compte du service.

## Contrat attendu de la passerelle

Les requêtes utilisent `Authorization: Bearer <secret>`, JSON, aucun suivi de redirection et un délai de 20 secondes. Aucune requête financière n'est relancée automatiquement.

`POST /quote` reçoit `{id, items, budgetMillimes}`. Réponse nécessaire :

- `verified: true`, `quoteId`, `storeName`, `deliveryAddress`, `summary` ;
- `items` avec `productId`, `name`, `quantity`, `unit`, `priceMillimes` pour chaque référence réellement livrable ;
- `subtotalMillimes`, `deliveryMillimes`, `serviceMillimes`, `otherFeesMillimes`, `discountMillimes`, `totalMillimes` ;
- `expiresAt` en millisecondes, valide au maximum dix minutes.

La réponse de devis est filtrée par liste de champs autorisés : elle ne peut modifier ni identifiant de commande, ni statut, ni propriétaire, ni fournisseur, ni contexte du foyer. Les métadonnées des commandes affichées proviennent des colonnes serveur.

Les montants sont des entiers en millimes TND. Le total des lignes et frais doit correspondre exactement au total livré. Le panier exact et les substitutions doivent être revus par l'utilisateur avant approbation. Une substitution ou un changement de prix après approbation exige un nouveau devis et une nouvelle approbation.

`POST /execute` reçoit `{idempotencyKey, quoteId, approvedSnapshot, expiresAt}`. La passerelle doit vérifier de nouveau le devis, l'adresse, les références, les quantités et le total avant tout paiement, dédupliquer durablement par `idempotencyKey`, et refuser tout changement. Une réponse de succès est `{status: "confirmed", externalOrderId, approvedQuoteId, totalMillimes}` avec le devis et le montant approuvés.

En cas d'erreur après soumission, Nesma place la commande en `unknown` et exige une vérification dans le service avant toute autre tentative. Ne pas créer un nouveau panier pour contourner ce statut sans avoir vérifié l'absence d'achat.

## Vérification effectuée

Tests locaux avec une passerelle simulée uniquement : séparation Glovo/Yassir, sélection enregistrée non modifiable, ancien brouillon Glovo, configuration invalide, plafond réel des octets JSON, refus des paniers sans devis, approbation puis exécution unique. Aucun compte marchand, paiement, numéro de téléphone, adresse réelle ou secret réel n'a été utilisé. Une validation de bout en bout sur les services réels reste nécessaire avant activation.
