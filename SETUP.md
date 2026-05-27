# Gpadesous — Setup

## 1. Créer le projet Supabase

1. Aller sur https://supabase.com/dashboard → **New project**
2. Choisir un nom (ex: `gpadesous`), un mot de passe DB, une région **Europe (eu-west-1 Ireland)** ou **eu-central-1 Frankfurt** pour la latence FR.
3. Attendre ~2 min que le projet soit provisionné.

## 2. Récupérer les clés

Dans **Project Settings → API** :
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `Publishable key` (commence par `sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

> Sur les projets plus anciens, la clé peut s'appeler `anon public key` (un JWT) — dans ce cas utilise plutôt la variable `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Les deux noms sont supportés.

Copie `.env.example` en `.env.local` et remplis ces deux valeurs.

> ⚠️ **Après chaque modification de `.env.local`, redémarre `npm run dev`** — Next.js ne recharge pas les variables d'env à chaud.

## 3. Appliquer le schéma SQL

Dans **SQL Editor → New query**, colle le contenu de `supabase/schema.sql` et exécute (`Run`).

Cela crée :
- 6 tables (`accounts`, `categories`, `transactions`, `rules`, `budgets`, `import_batches`)
- Les politiques **Row Level Security** (chaque utilisateur ne voit que ses données)
- Un trigger qui sème 15 catégories par défaut à chaque inscription

## 4. Configurer l'authentification

Dans **Authentication → Providers** :
- **Email** : activé par défaut. Si tu veux désactiver la confirmation par email pendant le dev, va dans **Authentication → Settings → Email Auth → Confirm email** et décoche.

Dans **Authentication → URL Configuration** :
- **Site URL** : `http://localhost:3000` (en dev) — remplace par ton domaine en prod.
- **Redirect URLs** : ajoute `http://localhost:3000/auth/callback`

## 5. (Optionnel mais recommandé) Configurer OpenRouter pour la catégorisation IA

L'app peut catégoriser automatiquement les transactions non-classées via un modèle d'IA, en se limitant aux catégories que tu as définies (jamais d'invention).

1. Crée un compte sur https://openrouter.ai (5€ offerts au début)
2. Génère une clé sur https://openrouter.ai/keys
3. Ajoute-la dans `.env.local` :
   ```
   OPENROUTER_API_KEY=sk-or-v1-...
   OPENROUTER_MODEL=anthropic/claude-3.5-haiku
   ```
4. Redémarre `npm run dev`

Le bouton « Catégoriser avec l'IA » apparaît sur la page **Transactions** dès que tu as des transactions sans catégorie. Coût indicatif : ~0,005€ pour 100 transactions avec Claude Haiku.

> Sans clé OpenRouter, la catégorisation reste fonctionnelle via les règles par mots-clés (Carrefour, SNCF, Netflix…). L'IA est un *complément* qui prend le relais sur les libellés ambigus.

## 6. Lancer l'app

```bash
npm run dev
```

Puis va sur http://localhost:3000.

## 7. Importer ton premier relevé

1. Inscris-toi sur `/signup`
2. Crée un compte bancaire (Settings → Comptes)
3. Va sur `/import`, dépose un fichier CSV depuis l'export de ta banque
4. Vérifie le mapping des colonnes et confirme

Le parser détecte automatiquement :
- l'encodage (UTF-8, ISO-8859-1 typique des banques FR)
- le séparateur (`,`, `;`, tab)
- le format des dates (`DD/MM/YYYY`, `YYYY-MM-DD`, etc.)
- le format des montants (`1 234,56` vs `1,234.56`)
- les colonnes débit/crédit séparées OU le montant signé sur une colonne
