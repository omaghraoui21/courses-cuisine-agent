# État du produit — usage familial

Version 3, octobre 2026. Application privée de courses et cuisine ; le déploiement ne signifie pas que toutes les intégrations externes sont actives.

## Base de données
Cloudflare D1 hébergée, binding DB. Les données sont côté serveur et communes aux appareils connectés au même foyer. Les comptes restent distincts. Aucune dépendance Supabase ou serveur Grocy n'est imposée.

Les données personnelles de la version précédente restent dans leur scope ; rejoindre un foyer ne les fusionne ni ne les supprime. La famille active est résolue côté serveur, jamais choisie dans le payload d'une mutation.

## Fonctions implémentées
- Parcours Maison / Repas / Liste ; détails avancés dans Plus.
- Niveaux simples « bientôt fini » et « terminé », liste dédupliquée et annulation.
- Suggestions de besoins sur sept/trente jours ; estimations déclarées ou fondées sur les consommations explicitement enregistrées.
- Dix recettes quantifiées, portions ajustables, menus trois/sept dîners, ingrédients manquants agrégés et incertitudes signalées.
- Invitations de foyer à usage unique sous forme de hash, durée48h, six membres maximum, départ et retrait.
- CAS et reçu d'opération dans la même transaction D1 ; retry conserve son identifiant ; aucune relance automatique d'un paiement.
- Sauvegarde avant le premier changement du jour (si stock existant), avant effacement et avant restauration ; dix sauvegardes par foyer. Export JSON complet et restauration réservée au propriétaire.

Les sauvegardes applicatives sont dans la même base : elles protègent contre les erreurs de manipulation, pas contre la perte totale de la base. Conserver des exports indépendants ; la restauration d'infrastructure et son délai ne sont pas promis sans procédure vérifiée de l'hébergeur.

## Conseil courses et livraison
Le conseiller organise les besoins et montre des offres candidates issues des collecteurs existants. Une correspondance de nom n'est pas une garantie de produit équivalent. Le prix unitaire dépend du format explicitement lisible ; aucune économie ou disponibilité à l'adresse n'est inventée. Glovo et Yassir ont des configurations distinctes et le fournisseur reste attaché au brouillon.

## Validation
Tests sur SQLite réel des invitations, des accès, des conflits, de l'idempotence, du rollback et des sauvegardes/restaurations. Tests purs de recettes, unités, niveaux et import. Vérification TypeScript et compilation Worker.

Les tests automatisés ne remplacent pas un essai sur vos deux téléphones. La vérification visuelle et le parcours connecté à deux appareils restent à confirmer avec le propriétaire. Pas de simulation de reconnaissance ou de paiement présentée comme test réel.

## Intégrations non actives ou incomplètes
- Vision : endpoint et quota dix analyses/jour/utilisateur prêts ; clé AI Gateway et modèle multimodal non configurés, aucun essai réel effectué.
- Glovo et Yassir : adaptateurs et contrat de pont externe et approbation serveur seulement. Le navigateur persistant, sa connexion et les essais réels restent à développer/valider. Aucune commande payante automatique active. Choix du service, copie de liste et brouillons utilisables sans pont.
- Prix : MG a fourni des prix lors de l'essai ; quatre autres enseignes ont encore des limites d'accès/extraction. Pas de promesse de comparaison exhaustive.
- Collecte planifiée hors application fermée : pas activée. Actualisation au clic et cache temporaire.

## Mise en route à deux
1. Le propriétaire ouvre le Site et donne au conjoint l'accès depuis son menu Partager. Ce partage de l'application ne mélange pas les données automatiquement.
2. Dans Nesma → Plus → Notre foyer, créer un lien à usage unique et le transmettre soi-même.
3. Le conjoint ouvre le lien avec son propre compte et choisit Rejoindre ce foyer. Les deux appareils doivent alors montrer la même liste.
4. Tester un ajout et son annulation sur chaque téléphone. Créer une sauvegarde puis restaurer un petit changement de test.
5. Activer ensuite seulement les intégrations IA et commande par un canal de configuration sécurisé, avec limites de dépenses et essai supervisé.

## Qualification actuelle
Pilote familial renforcé, adapté à un essai accompagné. Ne pas annoncer « production ready » pour le périmètre complet tant que les parcours sur deux téléphones, la vision et la commande réelle n'ont pas été validés.
