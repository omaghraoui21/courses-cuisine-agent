# Architecture et limites de déploiement

## Décision
L'application principale utilise Vinext/React sur Sites (Worker) avec stockage D1 et identité ChatGPT. Le registre est natif pour éviter d'imposer un serveur PHP supplémentaire. Grocy reste un adaptateur externe futur ; aucun code Grocy n'a été copié ni forké. Les photos du cadrage sont des exemples et ne constituent pas le stock utilisateur.

Le projet `agent-runtime/` est un compagnon eve initialisé avec la CLI officielle. Ce runtime Node est séparé du Worker ; il n'est pas présenté comme déployé tant qu'il n'a pas son hébergement, ses secrets et ses tests. Les actions du site fonctionnent sans ce runtime.

## Stock et isolation
Les données sont isolées par foyer dans D1 ; les membres autorisés utilisent leurs comptes ChatGPT distincts. Sans adhésion, le scope personnel historique est conservé. Le serveur résout le foyer et refuse une mutation dont le foyer attendu diffère. Les reçus permanents et changements de stock sont transactionnels. Le site est publié privé. Les mutations exigent une identité et une origine identique. Le stock confirmé et les projections restent distincts. Aucune initialisation par les photos d'exemple ni donnée personnelle en Git.

## Vision
Le endpoint `/api/vision` est implémenté avec l'API Chat Completions de Vercel AI Gateway. Il exige AI_GATEWAY_API_KEY et AI_GATEWAY_MODEL dans les secrets du site. Sans configuration : erreur explicite 503 et saisie manuelle disponible. Les images passent en mémoire et ne sont pas conservées par l'application ; elles sont transmises au fournisseur choisi uniquement à la demande d'analyse. Les règles de conservation du fournisseur s'appliquent. Aucune promesse de reconnaissance avant essai réel.

## Collecte
Chaque source a un état distinct. Une page accessible sans prix n'est pas un scraper de prix complet. La collecte au clic est implémentée ; aucune collecte quotidienne n'est activée tant qu'un ordonnanceur n'est configuré et vérifié.

## Livraison
Un pont navigateur externe est nécessaire pour une session utilisateur persistante. Il n'est pas fourni par le Worker et n'est pas connecté par défaut. Le site implémente brouillon, devis vérifié, approbation expirante et soumission unique. L'exécution reste indisponible sans les secrets du pont Glovo ou Yassir, et sans pont correctement implémenté.
Le pont doit revalider le devis exact avant tout achat et imposer l'idempotence de bout en bout. Toute modification de frais, articles, format ou adresse exige un nouveau devis et une nouvelle approbation. En cas d'erreur après soumission, le statut devient inconnu et aucune relance aveugle n'est autorisée.

Les contrats de livraison courants sont dans [delivery-bridge.md](delivery-bridge.md). Le fournisseur et le foyer sont enregistrés avec chaque brouillon ; aucune IA ni navigation authentifiée n’est activée par ce lot.
