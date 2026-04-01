# Lacet

Application mobile iOS & Android pour trouver des compagnons de randonnée. On matche sur un itinéraire, pas sur un profil.

## Concept

- Les **acteurs** publient des itinéraires (date, distance, niveau, voiturage, nombre de places)
- Les **volontaires** swipent le feed et rejoignent un groupe en swipant à droite
- Un chat de groupe s'ouvre dès le premier match
- Après la rando, notation mutuelle simultanée (révélation après que tout le monde a noté ou après 48h)

## Stack technique

| Composant | Solution |
|---|---|
| Mobile | React Native 0.83 + Expo SDK 55 (TypeScript) |
| Navigation | Expo Router (file-based routing) |
| Backend | Supabase (Postgres, Auth, Realtime, Storage, Edge Functions) |
| Cartes | Mapbox GL JS via @rnmapbox/maps |
| Géolocalisation | expo-location + PostGIS |
| Auth | Supabase Auth OTP SMS (Twilio) |
| Notifications | Expo Notifications + Expo Push Service |
| Stockage sécurisé | expo-secure-store (JWT) |

## Prérequis

- Node.js >= 18 (installé via [nvm](https://github.com/nvm-sh/nvm))
- npm
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npx expo`)
- CocoaPods (`brew install cocoapods`) — requis pour iOS
- Watchman (`brew install watchman`) — requis par Metro bundler
- Un projet [Supabase](https://supabase.com) avec :
  - Auth SMS (Twilio) activé
  - Extension PostGIS activée
  - Les migrations appliquées (voir ci-dessous)
- Un token [Mapbox](https://www.mapbox.com/) (pour les cartes)
- Pour iOS : Xcode + simulateur iOS
- Pour Android : Android Studio + émulateur
n
## Installation

```bash
# Installer nvm puis Node.js LTS
brew install nvm
nvm install --lts

# Installer les dépendances du projet
npm install
```

## Configuration

Créer un fichier `.env` à la racine du projet :

```env
EXPO_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=votre-anon-key
EXPO_PUBLIC_MAPBOX_TOKEN=votre-mapbox-token
```

Un fichier `.env.example` est fourni comme modèle.

## Base de données

Les migrations SQL sont dans `supabase/migrations/`. Pour les appliquer :

```bash
# Installer la CLI Supabase si nécessaire
brew install supabase/tap/supabase

# Se connecter et lier le projet
supabase login
supabase link --project-ref votre-project-ref

# Appliquer les migrations
supabase db push
```

### Migrations disponibles

| Fichier | Contenu |
|---|---|
| `001_initial_schema.sql` | Extension PostGIS, 5 types ENUM, 5 tables (user, hike, participation, group_message, rating), index GiST, triggers, politiques RLS, Realtime |
| `002_storage.sql` | Buckets Storage : `gpx-files` (privé), `profile-photos` (public), policies d'accès |
| `003_feed_rpc.sql` | Fonction RPC `get_nearby_hikes()` — requête géographique ST_DWithin avec filtres (rayon, date, niveau) |
| `004_push_notifications.sql` | Extensions pg_net + pg_cron, helpers push, 3 triggers (match, message, groupe complet), 2 jobs cron (rappel J-1, notation J+1) |

### Schéma des tables

- **user** — profil utilisateur (téléphone, nom, niveau, langues, note moyenne, push token)
- **hike** — randonnée publiée (itinéraire, localisation PostGIS, distance, niveau, date, statut)
- **participation** — relation user/hike avec rôle (acteur/volontaire) et statut
- **group_message** — messages du chat de groupe par rando
- **rating** — notations post-rando avec révélation différée

### Triggers automatiques

- `trg_hike_status_on_count` — passe la rando en `full` quand `current_count >= max_participants`, retour à `open` si des places se libèrent
- `trg_check_max_active_participations` — empêche un volontaire de rejoindre plus de 3 randos simultanément
- `trg_update_hike_count` — incrémente/décrémente `current_count` automatiquement sur les changements de participation

## Démarrer l'application

Ce projet utilise des modules natifs (`@rnmapbox/maps`, `expo-secure-store`…) qui ne fonctionnent pas avec Expo Go. Il faut builder le projet natif.

### Première fois (génère le dossier `ios/` ou `android/`)

```bash
npx expo prebuild --platform ios
npx expo prebuild --platform android
```

> À relancer si tu modifies `app.json`, les plugins Expo, ou les dépendances natives.

### Lancer sur simulateur iOS

```bash
npx expo run:ios
```

### Lancer sur simulateur Android

```bash
npx expo run:android
```

### Lancer uniquement le serveur Metro (app déjà installée)

```bash
npx expo start
```

> `expo start --ios` ne fonctionne pas pour ce projet car il tente de lancer via Expo Go, qui ne supporte pas les modules natifs.

## Structure du projet

```
lacet/
├── app/                              # Expo Router — navigation par fichiers
│   ├── _layout.tsx                   # Layout racine + logique de redirection auth
│   ├── (auth)/                       # Groupe auth (non authentifié)
│   │   ├── _layout.tsx               # Stack navigation auth
│   │   ├── phone.tsx                 # Saisie numéro de téléphone (+33)
│   │   ├── verify.tsx                # Code OTP 6 chiffres + timer renvoi 60s
│   │   └── onboarding.tsx            # Création profil (prénom, naissance, niveau, langues, photo)
│   ├── (tabs)/                       # Navigation principale par onglets
│   │   ├── _layout.tsx               # Config des 4 onglets
│   │   ├── index.tsx                 # Explorer — feed de swipe
│   │   ├── groups.tsx                # Mes Groupes — liste des randos avec accès chat
│   │   ├── create.tsx                # Créer une rando
│   │   └── profile.tsx               # Mon Profil + déconnexion
│   ├── hike/[id].tsx                 # Détail d'une rando (route dynamique)
│   ├── chat/[hikeId].tsx             # Chat de groupe temps réel
│   └── profile/                      # Écrans profil
│       ├── edit.tsx                  # Modification profil (prénom, niveau, langues, photo)
│       └── [userId].tsx             # Profil public d'un autre utilisateur (lecture seule)
├── components/                       # Composants réutilisables
│   ├── HikeCard.tsx                  # Carte swipeable (mini-carte, stats, tags, organisateur)
│   ├── MapView.tsx                   # Carte Mapbox (tracé GPX + mode dessin)
│   ├── FilterModal.tsx               # Modal de filtres (rayon, date, niveau)
│   ├── MatchOverlay.tsx              # Overlay de confirmation "Tu rejoins la rando !"
│   ├── MessageBubble.tsx             # Bulle de message (theirs/mine/system/RDV)
│   └── RdvModal.tsx                  # Modal carte de rendez-vous (acteur only)
├── hooks/                            # Custom hooks React
│   ├── useSession.ts                 # Hook session : session, profile, loading, signOut, refreshProfile
│   └── SessionContext.tsx            # Provider React pour partager la session
├── lib/                              # Librairies et configuration
│   ├── supabase.ts                   # Client Supabase + sendOTP() + verifyOTP()
│   ├── chat.ts                       # Helpers chat (avatars, formatage, RDV cards)
│   └── notifications.ts             # Push token registration + notification tap routing
├── types/                            # Types TypeScript partagés
│   └── index.ts                      # User, Hike, HikeWithCreator, Participation, Message, Rating, FeedFilters
├── supabase/                         # Backend Supabase
│   ├── migrations/                   # Migrations SQL
│   │   ├── 001_initial_schema.sql    # Schéma complet (tables, RLS, triggers)
│   │   └── 002_storage.sql           # Buckets Storage
│   └── functions/                    # Edge Functions (Deno)
│       ├── parse-gpx/index.ts        # Parse GPX : distance, dénivelé, durée, coordonnées
│       ├── reveal-ratings/           # Révélation des notes (à implémenter)
│       └── send-push/index.ts        # Envoi push via Expo Push API (chunked, multi-token)
├── assets/                           # Images et ressources statiques
├── app.json                          # Configuration Expo (permissions, plugins)
├── tsconfig.json                     # Configuration TypeScript
└── package.json                      # Dépendances npm
```

## Flux d'authentification

```
Lancement app
     │
     ▼
Session existante ? ──non──▶ Écran phone.tsx
     │                           │
    oui                    Envoie OTP SMS
     │                           │
     ▼                           ▼
Profil en base ? ──non──▶ Écran verify.tsx
     │                           │
    oui                    Vérifie le code
     │                           │
     ▼                           ▼
  (tabs)/              Profil existe ? ──non──▶ onboarding.tsx
                            │                        │
                           oui                  Crée le profil
                            │                        │
                            ▼                        ▼
                         (tabs)/                  (tabs)/
```

- Le JWT est stocké dans `expo-secure-store` (jamais AsyncStorage)
- L'onboarding ne s'affiche qu'une seule fois (vérification de l'existence du profil en table `user`)
- La session persiste entre les lancements de l'app
- Déconnexion disponible depuis l'onglet Profil

## Création d'itinéraire

L'onglet "Créer" permet de publier une randonnée via deux modes :

### Mode GPX (upload)
1. L'utilisateur sélectionne un fichier `.gpx` depuis son téléphone
2. Le fichier est envoyé à l'Edge Function `parse-gpx` qui extrait :
   - Distance (km, arrondi 1 décimale) via formule de Haversine
   - Dénivelé positif cumulé (m)
   - Durée estimée (distance / 3.5 km/h)
   - Coordonnées [lng, lat] pour le tracé
3. Le tracé s'affiche sur la carte Mapbox (LineString)
4. Le fichier GPX brut est uploadé dans le bucket `gpx-files`

### Mode dessin
1. L'utilisateur tape sur la carte pour poser des waypoints
2. Une ligne se trace entre les points
3. Distance et durée estimée sont calculées en temps réel
4. Bouton "Annuler le dernier point" pour corriger

### Formulaire
- Titre (obligatoire), description (optionnel)
- Date fixe ou flexible (toggle)
- Niveau : Facile / Intermédiaire / Difficile / Expert
- Nombre de participants : 2 à 12 (sélecteur +/-)
- Voiturage : toggle "Je peux emmener des gens"

### Publication
- **Publier** → `status = 'open'`, insertion automatique dans `participation` (rôle `actor`, statut `confirmed`)
- **Brouillon** → `status = 'draft'`, pas de participation créée
- Point de départ = premier point du GPX ou position GPS actuelle

### Edge Function parse-gpx

Déployée sur Supabase Edge Functions (Deno). Accepte du GPX en `text/xml` ou `multipart/form-data`.

```bash
# Déployer la fonction
supabase functions deploy parse-gpx
```

Validation : vérifie la présence de la balise `<gpx>`, au moins 2 points de coordonnées, coordonnées dans les bornes valides. Retourne une erreur 400 claire si le fichier est invalide.

## Feed de swipe (Explorer)

L'onglet "Explorer" est l'écran principal de découverte des randonnées.

### Géolocalisation
- Demande de permission au premier lancement
- Recherche géographique via `ST_DWithin` (geography, rayon en mètres)
- Fallback sur Paris si permission refusée

### Carte HikeCard
Chaque carte affiche :
- Mini-carte Mapbox avec le point de départ
- Titre et localisation
- 4 stats : distance, durée, dénivelé, places restantes
- Tags : date (ou "Flexible"), niveau (coloré), voiturage
- Profil organisateur : initiales colorées, âge, note, nombre de randos

### Swipe
- **Droite** (ou bouton vert) → Rejoindre la rando
- **Gauche** (ou bouton rouge) → Passer
- **Bouton loupe** → Voir le détail
- Indicateurs visuels "Rejoindre" (vert) / "Passer" (rouge) pendant le drag
- Animation de rotation pendant le swipe

### Logique de match
- Vérifie la limite de 3 participations actives avant d'insérer
- Insère dans `participation` (role=volunteer, status=confirmed)
- `current_count` incrémenté automatiquement par le trigger
- Overlay de confirmation "Tu rejoins la rando !" avec lien vers le chat

### Filtres
- Rayon : 10 / 25 / 50 / 100 km
- Période : Cette semaine / Ce mois / Flexible / Tout
- Niveau : Tous / Facile / Intermédiaire / Difficile / Expert

### Feed vide
- Message d'encouragement avec icône montagne
- Suggestion d'élargir les filtres
- Bouton recharger

### Requête RPC (migration 003)
```sql
get_nearby_hikes(user_lng, user_lat, radius_meters, filter_level, filter_date_range, current_user_id)
```
- Utilise `geography` (pas geometry) pour le rayon en mètres réels
- Exclut les randos où l'utilisateur est déjà participant
- Joint les infos du créateur
- Limite 30 résultats, triés par date

## Chat de groupe temps réel

Le chat s'ouvre après un match ou depuis l'onglet Groupes.

### Architecture Realtime
- Abonnement au channel `group-chat:{hikeId}` via Supabase Realtime
- Écoute des `INSERT` sur `group_message` filtré par `hike_id`
- Désabonnement automatique dans le cleanup du `useEffect`
- Optimistic updates : le message s'affiche immédiatement, puis l'ID temporaire est remplacé par l'ID réel

### Composants du chat
- **Bannière itinéraire** — distance, dénivelé, niveau. Cliquable vers le détail de la rando
- **Rangée des membres** — avatars colorés (couleur déterministe basée sur le `user_id`), nombre de participants, statut "Groupe complet" ou places restantes
- **Bulles de message** :
  - Messages des autres → fond gris, aligné gauche avec avatar initiales
  - Mes messages → fond vert `#1D9E75`, aligné droite
  - Messages système → centré, fond gris, pill arrondie
- **Carte RDV** — message enrichi (JSON dans `content`) avec lieu + date/heure, design distinct avec fond vert clair et icône 📍. Seul l'acteur peut l'envoyer (bouton +)
- **Séparateurs de date** — "Aujourd'hui", "Hier", ou date formatée

### Écran Groupes
- Liste de toutes les randos rejointes (acteur ou volontaire)
- Affiche titre, date, participants, rôle
- Tap → ouvre le chat correspondant
- État vide avec message d'encouragement

### Sécurité
- RLS sur `group_message` : seuls les membres `confirmed` peuvent lire et écrire
- Vérification côté client de la participation avant affichage

## État d'avancement

- [x] Phase 1a — Squelette projet (Expo, navigation, types, Supabase client)
- [x] Phase 1b — Schéma BDD (tables, RLS, triggers, PostGIS, Storage)
- [x] Phase 1c — Authentification OTP téléphone + onboarding
- [x] Phase 2a — Création d'itinéraire (GPX upload + dessin + publication)
- [x] Phase 2b — Feed de swipe + géolocalisation + match
- [x] Phase 3a — Chat de groupe temps réel + écran Groupes
- [x] Phase 3b — Notifications push (5 événements)
- [x] Phase 3c — Écran profil et historique
- [ ] Phase 4 — Finalisation (notation, filtres avancés, modération)

## Profil utilisateur

### Mon profil (`(tabs)/profile.tsx`)
- Avatar avec initiales colorées (déterministe par user_id)
- Nom, âge, tags niveau/langues, note moyenne avec étoiles
- 3 stats calculées : nombre de randos, km parcourus, randos organisées
- Historique des 10 dernières randos avec badges colorés :
  - **Effectuée** (vert) — rando passée en tant que volontaire
  - **Organisée** (violet) — rando passée en tant qu'acteur
  - **Prévue** (ambre) — rando future
- 5 derniers avis reçus (uniquement les notes révélées)
- Boutons : modifier profil, se déconnecter

### Modifier mon profil (`profile/edit.tsx`)
- Modification du prénom, niveau d'expérience, langues parlées
- Upload de photo de profil (via `expo-document-picker` → bucket `profile-photos`)
- `refreshProfile()` après sauvegarde pour mettre à jour le contexte global

### Profil public (`profile/[userId].tsx`)
- Vue en lecture seule du profil d'un autre utilisateur
- Mêmes infos : avatar, nom, âge, niveau, langues, note, stats, avis
- Pas de bouton modifier ni déconnexion
- Accessible depuis les avatars du chat (membres cliquables)

## Notifications push

5 types de notifications implémentés via Expo Push Service + pg_net + pg_cron.

### Côté client (`lib/notifications.ts`)
- `registerForPushNotifications(userId)` : demande la permission, récupère l'ExpoPushToken, le sauvegarde dans `user.expo_push_token`
- `setupNotificationListeners()` : écoute les taps sur les notifications et navigue vers le bon écran
- Appelé automatiquement au login (dans `_layout.tsx`)

### Edge Function `send-push`
- Accepte `to` (token ou tableau), `title`, `body`, `data`
- Filtre les tokens invalides
- Envoie par chunks de 100 (limite Expo)
- Déployer : `supabase functions deploy send-push`

### Triggers Postgres (via pg_net)

| Événement | Trigger | Destinataire |
|---|---|---|
| Nouveau match (volunteer join) | `trg_notify_new_match` | Créateur de la rando |
| Nouveau message chat | `trg_notify_new_message` | Tous les membres sauf l'expéditeur |
| Groupe complet (status → full) | `trg_notify_group_full` | Créateur de la rando |

### Jobs pg_cron

| Job | Horaire | Action |
|---|---|---|
| `daily-hike-reminder` | Chaque jour 18h UTC | Notifie les participants des randos du lendemain |
| `daily-rating-open` | Chaque jour 10h UTC | Passe les randos d'hier en `completed` + notifie pour la notation |

### Navigation depuis les notifications

| Type | Destination |
|---|---|
| `new_match` | Chat du groupe |
| `new_message` | Chat du groupe |
| `group_full` | Chat du groupe |
| `reminder` | Détail de la rando |
| `rating` | Détail de la rando |

### Configuration Supabase requise
Les triggers pg_net nécessitent les settings Postgres :
```sql
ALTER DATABASE postgres SET app.settings.supabase_url = 'https://votre-projet.supabase.co';
ALTER DATABASE postgres SET app.settings.service_role_key = 'votre-service-role-key';
```
