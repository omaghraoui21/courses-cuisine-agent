# Plan d’implémentation et contrôles

1. Dépôt et architecture : inspection indépendante, D1 natif retenu pour déploiement immédiat.
2. Stock : validation serveur, CAS, idempotence, inventaire/achat, annulation, empreintes photo. Contrôle indépendant puis corrections.
3. Interface : trois parcours principaux plus sources/réglages ; état vide et responsive. Contrôle des contrats API, quantités inconnues, recettes et devis.
4. Intégrations : MG prix réels, états des autres enseignes ; vision préparée avec secret et quota ; Glovo contrat de pont distinct et désactivé sans connexion. Contrôle indépendant.
5. Livraison : tests, TypeScript, build Worker, migrations, GitHub et publication privée.

## Reste à activer avec le propriétaire
Clé/modèle vision via secrets sécurisés ; pont navigateur Glovo avec session réelle et test supervisé ; accès alternatif autorisé pour enseignes bloquées ; essai réel du partage sur deux téléphones. Ces besoins ne sont pas masqués par des données de démonstration.

## Version 2 livrée
Parcours simplifié, invitations privées à usage unique, recettes quantifiées et menus, besoins sept/trente jours, sauvegardes/restauration et contrôles SQLite. Voir [état de préparation](production-readiness.md) pour les limites et la mise en route.
