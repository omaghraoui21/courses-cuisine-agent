# Contrat du pont Glovo externe

Extension Glovo/Yassir et contrat courant : voir [delivery-bridge.md](delivery-bridge.md).

Statut : contrat préparé ; aucun navigateur connecté, aucune commande réelle testée. Le pont n'est pas un service fourni par Glovo et son fonctionnement doit être validé avec un accès autorisé. Sans pont, le site enregistre une liste et n'exécute aucun achat.

## Déploiement nécessaire
Un processus distinct doit disposer d'un navigateur persistant connecté au compte de l'utilisateur, d'un hébergement HTTPS et d'un secret partagé GLOVO_BRIDGE_TOKEN. Le Worker appelle uniquement l'URL fixe GLOVO_BRIDGE_URL configurée par l'administrateur ; aucun proxy arbitraire n'est exposé. Le pont doit vérifier le bearer, limiter les requêtes et isoler les sessions. Les cookies et données de paiement ne doivent jamais être transmis au site ni au dépôt.

## POST /quote
Entrée : `{id,items,budgetMillimes}`.
Réponse exigée : `{verified:true,quoteId,storeName,deliveryAddress,summary,items:[{productId,name,quantity,unit,priceMillimes}],subtotalMillimes,deliveryMillimes,serviceMillimes,otherFeesMillimes,discountMillimes,totalMillimes,expiresAt}`.
Tous les montants sont des entiers en millimes. expiresAt est un timestamp millisecondes, futur et inférieur à dix minutes. Le pont doit lire les prix et frais actuels dans le panier réel, jamais reprendre des prix de catalogue comme devis livré. Summary décrit magasin, adresse, substitutions autorisées et frais. Les références et formats du devis doivent être ceux de la plateforme.

## POST /execute
Entrée : `{idempotencyKey,quoteId,approvedSnapshot,expiresAt}`.
Le pont vérifie l'approbation reçue du serveur autorisé, les prix/articles/adresse/frais inchangés, l'expiration, et l'absence de commande déjà passée pour la même clé. Il stocke durablement la clé AVANT soumission. Il s'arrête pour toute validation bancaire nécessaire. Il refuse une modification de devis et exige une nouvelle approbation. Une requête inconnue après un timeout ne doit jamais être resoumise à l'aveugle.
Réponse confirmée : `{status:'confirmed',externalOrderId,approvedQuoteId,totalMillimes}`. Le site refuse de présenter un succès si la réponse ne correspond pas au devis approuvé.

Ce protocole est une barrière serveur, pas une preuve que Glovo autorise ou supporte l'automatisation. Le développement du pont navigateur nécessite un essai supervisé de la session réelle, puis tests de non-duplication et de changement du panier.
