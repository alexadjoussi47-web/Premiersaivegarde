# Boutique Digitale Togo

Boutique en français pour vendre des ebooks et formations numériques au Togo.
Les prix sont en FCFA, le paiement mobile passe par FedaPay sandbox et les
fichiers de vente restent dans le stockage privé Replit.

## Stack

- Frontend : React, Vite, TypeScript, responsive mobile-first.
- API : Node.js, Express, TypeScript.
- Données : PostgreSQL avec Drizzle ORM.
- Paiements : FedaPay sandbox, isolé dans `artifacts/api-server/src/payments/`.
- E-mails : intégration Replit Resend (aucune clé Resend à mettre dans le code).
- Fichiers : Replit App Storage, dans le répertoire privé.

## Configuration Replit

1. Provisionner PostgreSQL et App Storage depuis les outils Replit.
2. Dans **Secrets**, configurer :
   - `ADMIN_PASSWORD` — mot de passe administrateur d’au moins 12 caractères.
   - `SESSION_SECRET` — secret aléatoire long pour signer les sessions.
   - `FEDAPAY_SECRET_KEY` — clé API **sandbox** FedaPay.
   - `FEDAPAY_WEBHOOK_SECRET` — secret de signature du webhook sandbox.
3. `EMAIL_FROM` est une variable d’environnement non secrète. Utiliser une
   adresse d’un domaine vérifié dans Resend. `onboarding@resend.dev` convient
   uniquement aux essais autorisés par le compte Resend; pour envoyer aux clients,
   vérifier un domaine et remplacer cette adresse.
4. L’intégration Resend doit rester connectée au projet. La connexion Replit
   remplace `EMAIL_API_KEY`.
5. App Storage crée et fournit `DEFAULT_OBJECT_STORAGE_BUCKET_ID`,
   `PRIVATE_OBJECT_DIR` et `PUBLIC_OBJECT_SEARCH_PATHS`. Les fichiers vendus
   vont dans le répertoire privé; ne les déplacez pas vers un chemin public.
6. En production, définir `PUBLIC_APP_URL` sur l’URL HTTPS canonique de la
   boutique publiée. Le serveur l’utilise pour les retours de paiement et les
   liens de téléchargement.

Les services Replit existants sont :

- `artifacts/boutique-digitale-togo: web`
- `artifacts/api-server: API Server`

## Base de données et développement

Le schéma SQL est défini dans `lib/db/src/schema/`. Après avoir provisionné la
base, appliquer le schéma :

```sh
pnpm --filter @workspace/db run push
```

Les workflows Replit démarrent le frontend et l’API. Pour vérifier les types et
construire les deux services :

```sh
pnpm -w run typecheck
pnpm --filter @workspace/api-server run build
PORT=5173 BASE_PATH=/boutique-digitale-togo/ pnpm --filter @workspace/boutique-digitale-togo run build
```

## Configurer FedaPay sandbox

Dans le tableau de bord FedaPay en mode sandbox :

1. Ajouter le webhook `https://<URL-publique-de-la-boutique>/api/webhooks/fedapay`.
2. Activer les événements `transaction.approved`, `transaction.declined` et
   `transaction.canceled`.
3. Copier le secret de signature du webhook sandbox dans
   `FEDAPAY_WEBHOOK_SECRET`, puis redémarrer le workflow API.
4. Utiliser une clé API sandbox dans `FEDAPAY_SECRET_KEY`.

Le retour navigateur sert uniquement à afficher le suivi de commande. Seul le
webhook dont la signature FedaPay a été vérifiée peut changer une commande en
« payée ». Le serveur vérifie aussi le statut, le montant et la devise de la
transaction auprès de FedaPay.

Le choix `Mixx by Yas` est transmis à FedaPay comme `togocel`; `Flooz` comme
`moov_tg`. La classe de fournisseur dans `payments/` permet de remplacer
FedaPay plus tard sans déplacer la logique de commande.

## Tester un achat complet en sandbox

1. Vérifier que le workflow API démarre sans erreur et que PostgreSQL contient
   les tables après `pnpm --filter @workspace/db run push`.
2. Ouvrir `/admin`, se connecter avec le mot de passe configuré dans
   `ADMIN_PASSWORD`, puis ajouter un produit et téléverser un petit PDF ou EPUB.
3. Dans une fenêtre privée, ouvrir le catalogue, choisir ce produit, puis passer
   une commande avec un e-mail auquel vous avez accès et un numéro de téléphone
   de test accepté par l’environnement sandbox FedaPay.
4. Choisir Mixx by Yas ou Flooz et poursuivre vers la page de paiement sandbox.
   Utiliser le scénario/compte de test indiqué par le tableau de bord FedaPay;
   ne saisissez pas de coordonnées de paiement réelles.
5. Vérifier que la page de retour ne marque pas la commande comme payée à elle
   seule. Après la notification signée, le statut devient « payée » et le serveur
   envoie le lien de téléchargement.
6. Ouvrir ce lien : il doit télécharger le fichier. Le lien expire après 24 h et
   autorise trois téléchargements; le quatrième doit être refusé.
7. Pour vérifier la signature, envoyer au webhook un JSON modifié ou une
   signature incorrecte : la réponse doit être `400` et la commande doit rester
   en attente.

FedaPay doit pouvoir joindre l’URL du webhook depuis Internet; utilisez une URL
HTTPS publique accessible. Consultez aussi le [guide officiel des paiements de
test FedaPay](https://docs-v1.fedapay.com/paiements/test). La liste publique de
numéros de test affichée par ce guide concerne MTN et MOOV au Bénin; pour
Mixx/Flooz au Togo, demandez à FedaPay les numéros ou scénarios sandbox actuels.
N’utilisez pas de paiement réel.

Avec `onboarding@resend.dev`, Resend peut restreindre les destinataires à
l’adresse propriétaire du compte. Pour tester la livraison à un autre acheteur,
utilisez un domaine vérifié et configurez `EMAIL_FROM`.

## Sécurité et données privées

- Les requêtes sont validées avec les schémas OpenAPI/Zod; les accès SQL passent
  par Drizzle et ses paramètres liés.
- Le mot de passe admin est dérivé avec scrypt et stocké sous forme de hash avec
  sel. Les sessions sont sauvegardées dans PostgreSQL, avec cookie `HttpOnly`,
  `SameSite=Strict` et `Secure` en production.
- Les tentatives de connexion et de commande sont limitées.
- Un fichier produit n’a pas d’URL de lecture publique. Après paiement, un jeton
  aléatoire à usage limité est stocké sous forme de hash; le téléchargement est
  diffusé uniquement par l’API.
- Ne jamais commiter `.env` ni placer les fichiers de vente dans le dépôt. Le
  `.gitignore` exclut les fichiers d’environnement et les dossiers locaux
  réservés aux fichiers privés.
