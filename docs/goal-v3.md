# Objectif V3 — courses utiles et livraison au choix

## Objectif
À partir des réserves et de la liste commune, préparer les achats de la semaine ou du mois, examiner les prix réellement collectés et choisir Glovo ou Yassir pour continuer. Fonctionnement de base sans clé IA.

## Critères d'acceptation
- Besoins dédupliqués issus de la liste, des niveaux et de la consommation explicitement déclarée.
- Offres datées et sourcées ; prix par kg/litre uniquement si le format est lisible. Pas d'économie inventée ni d'équivalence déduite d'une similarité vague.
- Formats, validité et prix livrés restent à vérifier. Absence de correspondance clairement indiquée.
- Choix Glovo/Yassir, budget par panier, brouillon conservé et fournisseur immuable après préparation.
- Copier la liste et ouvrir le service fonctionnent sans connexion automatique ; aucun transfert de panier promis.
- Commande automatique seulement avec pont réel, devis complet, approbation explicite et exécution idempotente. Aucun pont réel n'est livré dans ce lot.
- Autre agent capable de reprendre avec AGENTS.md, contrats, tests et statut actuel.

## Décisions
Ne pas demander une clé IA pour les fonctions déterministes. Ne pas introduire une infrastructure d'orchestration supplémentaire. Les catalogues d'enseigne et les catalogues de livraison restent des sources différentes. Un seul service par brouillon, pas de fractionnement automatique du panier.

## Étapes réalisées par le lot
Conseiller courses et unités ; sélecteur de livraison et aide manuelle ; adaptateurs de ponts ; contrôles indépendants et tests ; synchronisation GitHub et publication privée.

## Essai utilisateur après publication
Ajouter deux produits, signaler une réserve vide, ouvrir Liste et vérifier la proposition. Consulter les offres ; vérifier que les sources indisponibles sont explicites. Choisir chaque service, copier la liste et vérifier le budget. Préparer un brouillon : sans pont, aucune approbation/commande ne doit être possible.

## Hors lot
Choix et activation d'une API IA, navigation d'un navigateur authentifié, paiement réel, garantie du meilleur prix sur l'ensemble du marché, collecte quotidienne et publication publique. Ces fonctions restent des objectifs suivants et ne sont pas présentées comme actives.
