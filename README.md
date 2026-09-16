# Lion Dynasty — Hub des Coloristes V4

La V4 remplace le stockage local communautaire de la V3 par une vraie architecture Supabase.

## Ce qui est réellement connecté dans le code

- Supabase Auth : inscription, connexion, déconnexion et session persistante
- PostgreSQL : profils, publications, likes, commentaires et tracker
- Supabase Storage : photos des coloriages
- Row Level Security (RLS) : chaque membre ne peut modifier/supprimer que ses propres données
- Realtime : rechargement automatique de la galerie quand la communauté publie, like ou commente
- Tracker multi-appareils
- Profil synchronisé
- Galerie commune
- Pixel Art Converter et générateur de nuanciers conservés

## 1. Préparer Supabase

Crée ou ouvre un projet Supabase.

Dans l'éditeur SQL du projet, copie tout le contenu de :

`supabase.sql`

et exécute-le une seule fois.

Le script crée :
- `lion_profiles`
- `lion_posts`
- `lion_likes`
- `lion_comments`
- `lion_tracker`
- le bucket public `lion_colorings`
- les politiques RLS
- le trigger qui crée automatiquement un profil après inscription
- les permissions Data API
- Realtime sur les tables communautaires

## 2. Renseigner config.js

Dans les réglages/API de ton projet, récupère :

- Project URL
- Publishable key (ou anon key sur un ancien projet)

Puis modifie :

```js
window.LION_DYNASTY_CONFIG = {
  supabaseUrl: "https://TON-PROJET.supabase.co",
  supabasePublishableKey: "TA_CLE_PUBLIQUE"
};
```

N'utilise JAMAIS de secret key / service_role dans `config.js` ou dans le navigateur.

## 3. Authentification e-mail

Par défaut, Supabase peut demander une confirmation e-mail lors de l'inscription.
Si elle est activée, l'utilisateur reçoit un lien avant sa première connexion.

Configure également les URL autorisées / Site URL dans Supabase Auth lorsque le domaine final est connu.

## 4. Tester localement

Évite d'ouvrir simplement `index.html` avec `file://`.

Dans le dossier V4, lance par exemple :

```bash
python -m http.server 8080
```

Puis ouvre :

`http://localhost:8080`

## 5. Déploiement

Le projet est statique : `index.html`, `styles.css`, `app.js`, `config.js`.

Il peut être déployé sur un hébergeur statique. Après déploiement :
- ajoute l'URL finale dans les Redirect URLs / Site URL de Supabase Auth,
- teste inscription, confirmation e-mail, connexion,
- teste upload, suppression, likes, commentaires et tracker depuis deux comptes différents.

## Sécurité

Le navigateur ne contient que la clé publique Supabase. La sécurité des écritures repose sur les politiques RLS de `supabase.sql`.

Les uploads sont limités aux membres authentifiés et rangés dans un dossier portant leur UUID.
Le bucket est public afin que la galerie puisse afficher les photos sans URL signée.

## Avant ouverture au grand public

À ajouter pour une production complète :
- CGU / politique de confidentialité
- consentement et règles de publication
- bouton de signalement
- tableau de bord de modération
- anti-spam / limites de publication
- suppression de compte et des contenus associés
- sauvegardes et monitoring
- éventuellement validation/modération des nouvelles images


## Note sur ce projet Supabase

Une table `public.profiles` existait déjà dans le projet. La V4 a donc été isolée avec le préfixe `lion_` afin de ne modifier ni casser les données d'une autre application.
