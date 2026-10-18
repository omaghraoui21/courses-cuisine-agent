# Courses & Cuisine — PRD et plan de démarrage

Version 0.2 — 18 octobre 2026 — Implémentation en cours

Décision d’architecture actualisée : stock natif D1, Grocy optionnel externe. Le compagnon eve reste distinct du site. Voir architecture.md pour les capacités déployées et les intégrations à activer. Les photos fournies étaient seulement des exemples, aucun inventaire initial n’en est déduit.

## 1. Décision produit

Créer un assistant domestique partagé entre deux adultes, utilisable sur téléphone, qui transforme une photo de courses ou de ticket en proposition de stock, suggère des repas et prépare les prochains achats. L’utilisateur confirme les observations incertaines et approuve chaque commande payante.

Promesse : « Je photographie mes courses, je sais approximativement ce qu’il reste, je cuisine avec ce que j’ai ; l’agent collecte les offres tunisiennes et passe la commande après mon approbation. »

Priorité confirmée par Omar : le scraping des cinq enseignes et l’exécution automatique des commandes après approbation sont des fonctions centrales du produit. Les tests de faisabilité commencent au lot 0 ; leur activation progresse selon les résultats techniques, sans les réduire à une simple liste exportée.

Le stock réel peut différer du stock enregistré. L’interface distingue toujours les quantités confirmées, les estimations et les informations inconnues.

Nom de travail : Courses & Cuisine. Dépôt proposé : courses-cuisine-agent. Nom et identité visuelle modifiables.

## 2. Objectifs et limites

Objectifs : réduire les oublis, doublons et pertes ; préparer des repas avec les achats ; prévoir les consommables ; comparer les achats utiles en Tunisie ; limiter l’entretien de l’inventaire.

Contrainte principale : aucune obligation de scanner chaque produit ni d’enregistrer chaque utilisation. Une courte vérification avant commande doit suffire pour corriger les estimations.

Périmètre domestique : alimentation, boissons, hygiène et entretien. Préférences, allergies déclarées et substitutions acceptées sont enregistrées explicitement.

Hors première version : paiement automatique, cinq scrapers complets, reconnaissance parfaite d’un placard fermé, prédiction certaine des dates limites, modèle IA entraîné sur mesure, gestion comptable et application native.

## 3. Interface minimale

Trois entrées principales :

1. **Ajouter mes courses** : photo, ticket, import d’une commande ou saisie courte.
2. **Que cuisiner ?** : suggestions selon les ingrédients disponibles ou à vérifier.
3. **Préparer mes courses** : besoins et liste partagée, puis panier proposé.

Une vue secondaire « Maison » donne les réserves, les produits à utiliser d’abord et l’historique. Les statistiques annuelles ne doivent pas encombrer le parcours courant.

Français au lancement. Reconnaissance de libellés français et arabes à évaluer sur des exemples tunisiens. Devise TND, fuseau Africa/Tunis. Montants stockés en millimes entiers.

## 4. Parcours photo et ticket

1. L’utilisateur choisit « achat reçu », « inventaire existant » ou « prix repéré ». Ce contexte empêche de transformer une photo de rayon en achat.
2. L’utilisateur prend une ou plusieurs photos ; l’application demande une nouvelle photo seulement pour les éléments importants illisibles.
3. L’agent propose des lignes : produit, marque, format, quantité visible, emplacement et champs incertains.
4. Les quantités cachées, marques ambiguës, formats et dates non lisibles restent inconnus. Aucun prix n’est déduit d’une photo de produit seule.
5. L’utilisateur corrige et confirme le lot en une fois. Il peut ignorer une ligne ou fusionner deux vues du même produit.
6. Les achats confirmés créent des mouvements ; les inventaires créent des ajustements explicites, pas de nouvelles entrées d’achat.
7. Une action « Annuler cet import » crée des mouvements inverses sans effacer l’historique.

Photo et ticket du même achat doivent être rapprochés. Détecter les fichiers identiques par empreinte, puis signaler les achats similaires ; deux achats légitimes identiques restent possibles après confirmation.

Une ligne de ticket abrégée n’est associée à un produit connu qu’avec une correspondance suffisante ou une correction utilisateur. Un lot de six unités ne doit pas être compté comme six lots.

## 5. Gestion du stock légère

Modes par produit :

| Mode | Utilisation | Interaction |
| --- | --- | --- |
| Quantité | Produits emballés faciles à compter | Achat, terminé, correction |
| Dernière réserve | Shampooing, lessive, huile | « J’ouvre la dernière réserve » |
| Niveau | Fruits, légumes, produits en vrac | Suffisant / bientôt fini / épuisé |

Stock initial : inventaire approximatif des produits suivis, sans obligation de saisir toute la maison. Distinguer les achats de démarrage des réserves préexistantes.

Emplacements : placard, réfrigérateur, congélateur, salle de bain et entretien. Les dates sont facultatives et explicites ; ne pas inventer une date limite. Pour un produit alimentaire ouvert, conserver la date d’ouverture si déclarée et suivre les instructions connues de l’emballage.

Le stock confirmé repose sur des mouvements validés. Une projection de consommation est calculée séparément : elle ne soustrait pas silencieusement des quantités du registre confirmé. Un repas « prévu » ne consomme rien ; un repas « préparé » propose une sortie à confirmer.

## 6. Recettes et cuisine

Proposer trois à cinq recettes adaptées au nombre de personnes, au temps disponible, aux préférences et aux allergies déclarées. Favoriser les ingrédients à utiliser d’abord, dont les dates sont connues.

Chaque recette indique : portions, durée estimée, ingrédients disponibles, ingrédients à vérifier, achats supplémentaires et étapes. Conserver l’URL pour une recette importée ; distinguer une recette générée d’une recette sourcée.

Ne pas présenter comme disponible un ingrédient absent du registre. Les substitutions doivent respecter les exclusions enregistrées ; l’agent ne déduit pas la présence ou l’absence d’allergènes d’une photo ambiguë. Un produit dépassant une date limite de consommation connue n’est pas proposé comme utilisable.

## 7. Apprentissage et prévisions

Apprendre les correspondances de libellés, formats habituels, préférences de marque, refus de substitutions et durées observées de consommation. Conserver la provenance de chaque préférence : déclarée ou déduite, avec possibilité de corriger et supprimer.

Pas de réentraînement d’un modèle au MVP : mémoire structurée et calculs sur l’historique.

Sur une période avec deux inventaires fiables :

**Consommation = stock initial + achats reçus − stock final − pertes − dons/sorties hors consommation.**

Normaliser en ml, g, rouleaux ou pièces selon le produit. Ne pas confondre achats et consommation ; une constitution de réserve doit être exclue de l’apprentissage naïf.

Une date « terminé » donne une durée exploitable surtout lorsque le début d’usage et la quantité sont connus. Si plusieurs flacons sont ouverts ou utilisés simultanément, demander une confirmation ou réduire la confiance.

Début : estimation déclarative facultative. Puis calcul à partir des périodes fiables, avec nombre d’observations et date de dernière vérification visibles. Moins de trois périodes fiables : afficher « provisoire ». Annualiser la moyenne comme scénario, sans prétendre connaître la saisonnalité avec peu de données.

Besoin proposé = maximum de zéro et de (demande sur l’horizon + réserve − stock utilisable estimé − livraisons attendues). Arrondir aux conditionnements achetables et limiter par budget et capacité de stockage. Considérer les dates connues lors de l’estimation du stock utilisable.

Le budget annuel est une projection aux prix de référence datés ; les prix inconnus ne valent jamais zéro.

## 8. Enseignes tunisiennes et prix

Cibles : Géant, Monoprix, Aziza, MG et Carrefour. Les enseignes sont des connecteurs indépendants activés progressivement selon la faisabilité réelle.

Collecte automatique en priorité : découverte des catalogues et fiches produits, téléchargement des nouvelles versions, extraction du texte PDF, OCR des pages images et lecture des pages dynamiques par navigateur si autorisée. Détecter les changements par empreinte et retraiter uniquement les nouvelles sources. L’import manuel est un secours. Respecter les conditions et limites d’accès ; pas de contournement de blocages.

Pour chaque enseigne, documenter au lot 0 : URL source réelle, type de contenu, magasin concerné, fréquence supportable, règles d’accès, échantillon obtenu et champs effectivement extractibles. Un connecteur vide ne compte pas comme une intégration livrée. Une erreur d’accès ne transforme jamais un ancien prix en prix actuel.

Cadence cible configurable : une vérification quotidienne des nouvelles sources publiques, avec cache, temporisation et arrêt en cas de refus ; les prix du panier sont revérifiés au moment de commander. Cette cadence est une exigence du futur logiciel, pas une automatisation déjà activée dans ChatGPT.

Chaque offre conserve : source, URL, enseigne, magasin/zone, produit, format, prix, conditions, période de validité, date de collecte et état de validation. Conserver séparément magasin physique et plateforme de livraison.

Comparer les mêmes références ou des substituts explicitement acceptés, en DT/kg, DT/litre, DT/pièce ou coût d’usage quand les données le permettent. Une offre expirée est exclue. Un catalogue n’atteste pas la disponibilité du produit.

Comparer des paniers complets en tenant compte des formats, livraison, frais de service, minimum de commande et remises conditionnelles vérifiées. Un panier aux prix incomplets est marqué incomplet et ne peut être déclaré le moins cher sans réserve.

## 9. Glovo : progression et approbation

La faisabilité d’une API client autorisée et du parcours navigateur reste à vérifier. Aucun transfert automatique de panier n’est annoncé comme acquis.

Objectif de livraison : l’agent ouvre la boutique disponible pour l’adresse choisie, recherche les références, remplit le panier, calcule le total et demande une seule approbation explicite du récapitulatif final ; après approbation, il exécute la soumission jusqu’à confirmation, sous réserve des validations d’identité ou bancaires du service. Le lien vers la boutique reste un mode dégradé si l’exécution n’est pas disponible.

Utiliser une API client autorisée si elle existe, sinon un navigateur contrôlé avec session utilisateur sécurisée. Un CLI peut lancer et superviser ces opérations ; il ne remplace pas un accès réellement fonctionnel au service. Ne pas confondre une API destinée aux commerçants ou à la livraison avec une API de commande client.

Le récapitulatif comprend articles, formats, quantités, prix, remises, frais, total, magasin, adresse de livraison et règles de substitution. Les secrets et données de paiement restent dans les mécanismes sécurisés du service.

L’approbation est liée à un instantané du panier et à une durée de validité. Tout changement matériel d’articles, adresse, frais ou total déclenche une nouvelle approbation, sauf tolérance explicitement approuvée au préalable. L’expiration de l’approbation impose une nouvelle validation.

États : brouillon → panier vérifié → attente d’approbation → approuvé → soumission → confirmé / échec / statut inconnu. En cas de timeout après soumission, vérifier la commande existante avant toute nouvelle tentative. Aucun achat ne doit être déclenché deux fois.

L’agent s’arrête pour une authentification ou validation bancaire nécessitant l’utilisateur. Une annulation après paiement suit les possibilités du service ; ne pas promettre sa réversibilité.

Les commandes en cours n’augmentent pas le stock reçu. À réception, rapprocher les articles réellement livrés, substitutions et manquants, puis confirmer les entrées.

## 10. Architecture proposée

### Réutilisation de Grocy

Grocy gère le registre des produits, unités, lieux et mouvements confirmés via son API. Notre application gère les brouillons de reconnaissance, photos, préférences, projections et approbations.

Une couche d’adaptation masque les particularités de Grocy. Notre interface reste limitée aux parcours utiles ; l’interface complète Grocy sert à l’administration si nécessaire.

Pas de fork au départ : dépendance déployée séparément et version figée après essai. Un fork ne sera créé que pour un correctif amont indispensable. Ne pas copier les sources de Mealie ou KitchenOwl dans le projet.

Référence identifiée le 18/10/2026 via l’API GitHub : Grocy v4.7.1. Vérifier la compatibilité du déploiement et les endpoints de cette version, plutôt que d’utiliser les prérequis de la branche master. Licence MIT ; conserver les mentions requises si du code est copié.

### Notre application

- Interface web mobile installable, avec capture photo et liste partagée.
- Runtime agent : eve, à initialiser selon sa documentation livrée, avec outils limités et validations côté serveur.
- Fournisseur vision interchangeable ; choix et coût à mesurer avant activation. Aucun appel IA nécessaire pour consulter ou corriger le stock.
- Stockage durable des brouillons, préférences et approbations ; base simple au départ, adaptée à l’hébergement retenu. Éviter d’ajouter une plateforme de données sans besoin démontré.
- Photos dans un stockage privé avec durée de conservation configurable ; suppression possible après extraction confirmée.
- Un processus persistant adapté pour Grocy ; ne pas supposer qu’un hébergement de fonctions seul suffit à son stockage et à son exécution.
- Secrets Grocy/IA uniquement côté serveur. Authentification et isolation des données par foyer avant accès distant partagé.

Les écritures Grocy passent par une file d’opérations avec identifiant stable et état de synchronisation. Écrire chaque ligne une seule fois ; en cas d’échec partiel, afficher les lignes en attente. Vérifier les capacités d’idempotence réelles de l’API et prévoir rapprochement, sans promettre une transaction distribuée.

## 11. Modèle de données minimal

| Entité | Données essentielles |
| --- | --- |
| Foyer et membre | Identité, accès, préférences |
| Produit | ID Grocy, alias, marque, format, unité, mode de suivi |
| Session d’import | Source, empreinte, statut, achat/inventaire/prix |
| Ligne observée | Champs extraits, incertitudes, correction, confirmation |
| Opération de stock | Identifiant stable, type, quantité, synchronisation, annulation |
| Observation de consommation | Période, inventaires, pertes, qualité de l’estimation |
| Recette et repas | Portions, ingrédients, exclusions, prévu/préparé |
| Offre | Enseigne, canal, magasin, prix, validité, provenance |
| Panier et approbation | Instantané, frais, plafond, expiration, état externe |

Conserver la version de l’extraction et du modèle pour comprendre les erreurs. Une « confiance IA » brute n’est pas une probabilité garantie : la décision de validation combine lisibilité, cohérence et historique.

## 12. Critères de réussite et tests

Cibles produit proposées, à mesurer sur des données réelles : un achat courant confirmé en moins d’une minute ; moins de cinq minutes d’entretien par semaine ; majorité des lignes récurrentes correctement proposées après corrections initiales. Ces cibles ne sont pas des performances déjà obtenues.

Scénarios obligatoires avant usage réel :

- Photo de rayon : aucune entrée en stock sans confirmation d’achat.
- Même photo ou photo + ticket : pas de double entrée silencieuse.
- Date ou format illisible : champ inconnu et question ciblée.
- Lot de six et unités individuelles : conversion cohérente.
- Reprise d’un import interrompu : aucune ligne dupliquée.
- Deux membres modifient le même produit : historique cohérent et conflit traité.
- Stock estimé insuffisant : question avant un achat important.
- Recette prévue : pas de consommation automatique.
- Offre expirée ou prix manquant : pas de faux meilleur panier.
- Panier modifié après approbation : soumission bloquée jusqu’à nouvelle approbation.
- Timeout de paiement : vérification du statut, pas de nouvelle commande aveugle.
- Restauration d’une sauvegarde : stock et historique récupérables.

Évaluer l’OCR/vision sur un petit jeu de photos et tickets autorisés, anonymisés avant commit. Mesurer séparément reconnaissance des produits, formats, quantités et prix. Ne jamais publier les tickets personnels dans GitHub.

## 13. Lots de réalisation

| Lot | Livraison | Condition de passage |
| --- | --- | --- |
| 0 — Faisabilité prioritaire | Dépôt, PRD, essai Grocy API, inspection des cinq sources, essai Glovo jusqu’au panier sans paiement | Rapport de faisabilité concret et premier échantillon de prix |
| 1 — Stock utile | Interface mobile, stock partagé, saisie, imports simulés, annulation | Parcours de stock fonctionnel sans IA |
| 2 — Photo | Vision/OCR, brouillons, corrections, doublons, synchronisation | Achat réel confirmé sans double comptage |
| 3 — Cuisine | Recettes, préférences, repas et ingrédients manquants | Trois propositions cohérentes avec le stock |
| 4 — Habitudes | Dernière réserve, observations, prévisions mois/année | Estimations explicables et corrigeables |
| 5 — Prix | Collecteurs des cinq enseignes, import de secours, comparaison | Prix traçables, fraîcheur et état de chaque connecteur visibles |
| 6 — Livraison | Exécution Glovo après approbation et rapprochement à réception | Test supervisé de bout en bout, sans doublon |

Pas de délai garanti avant les essais Grocy, vision et Glovo. Ne pas ajouter Mealie, KitchenOwl, une orchestration multi-agent ou cinq collecteurs au premier lot.

## 14. Étapes manuelles pour Omar — version déployée

Le dépôt existe et le stockage est natif D1 ; aucun serveur Grocy n'est requis. Les décisions ci-dessus restent le cadrage initial. L'état courant et les limites font foi dans [production-readiness.md](production-readiness.md).

1. Ouvrir Nesma et donner accès au conjoint avec le menu Partager du Site.
2. Dans Plus → Notre foyer, créer un lien puis le transmettre ; le conjoint le rejoint avec son propre compte.
3. Vérifier à deux un ajout, son annulation et la liste commune ; tester une sauvegarde/restauration.
4. Renseigner les habitudes et exclusions du foyer. Le budget est choisi pour chaque panier.
5. Configurer ensuite la vision via les secrets sécurisés et évaluer quelques photos privées.
6. Développer et connecter le pont Glovo avant un essai supervisé ; chaque panier réel exige une approbation explicite.


## 15. Travail de développement après réception du dépôt

Vérifier l’accès au dépôt, créer une branche de travail, ajouter ce PRD et les décisions d’architecture. Préparer une application stock utilisable avec données de démonstration, puis connecter une instance Grocy de test. Initialiser eve d’après la documentation installée, sans inventer ses API. Ouvrir une PR avec validation et limites connues.

Arborescence cible à ajuster après initialisation :

```text
docs/PRD.md
docs/architecture.md
docs/setup.md
app/                       # interface selon le scaffold retenu
agent/                     # outils et instructions selon eve
integrations/grocy/        # adaptateur du registre confirmé
integrations/retailers/     # imports et futurs collecteurs
tests/                     # scénarios de cohérence et approbation
.env.example               # noms de variables, aucune valeur secrète
```

Le présent livrable est un document de conception. Aucun dépôt, fork, déploiement, appel vision ou commande Glovo n’a été créé par sa rédaction.

## 16. Sources techniques

- Grocy : https://github.com/grocy/grocy
- Licence Grocy : https://github.com/grocy/grocy/blob/master/LICENSE.md
- Version repérée : https://github.com/grocy/grocy/releases/tag/v4.7.1
- Spécification API à vérifier sur la version retenue : https://github.com/grocy/grocy/blob/v4.7.1/grocy.openapi.json
- Documentation eve : https://eve.dev/docs ; la documentation livrée avec la version installée sera la référence d’implémentation.
- MG : https://mg.tn/
- Carrefour : https://www.carrefour.tn/
- Géant : https://www.geant.tn/
- Monoprix : https://courses.monoprix.tn/
- Aziza : https://www.aziza.tn/
- Glovo : https://glovoapp.com/

Les sites des enseignes sont des pistes de connecteurs, pas des intégrations déjà validées. La disponibilité des boutiques et services doit être vérifiée pour l’adresse choisie.
