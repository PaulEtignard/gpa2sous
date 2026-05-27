# Gpadesous

SaaS d'analyse de budget personnel à partir d'imports CSV bancaires.

## Stack

- **Next.js 16** (App Router, server components, server actions)
- **Supabase** (Postgres, Row Level Security, Auth)
- **TypeScript**, **Tailwind v4**, primitives **shadcn**-style
- **Recharts** pour les dashboards
- **PapaParse** + parser maison pour ingérer n'importe quel CSV bancaire

## Démarrage

Voir [SETUP.md](./SETUP.md) pour les étapes complètes (création du projet Supabase, application du schéma, config auth).

Une fois `.env.local` configuré :

```bash
npm run dev
```

## Architecture

```
src/
├── app/
│   ├── (auth)/              # /login, /signup
│   ├── (app)/               # routes protégées (middleware redirige si pas connecté)
│   │   ├── dashboard/
│   │   ├── transactions/
│   │   ├── import/          # le cœur du produit
│   │   ├── accounts/
│   │   ├── categories/      # catégories + règles de classification
│   │   └── budgets/
│   ├── auth/                # callback + signout
│   └── page.tsx             # landing
├── components/
│   ├── ui/                  # primitives (button, input, card, table…)
│   ├── app-shell/           # sidebar
│   ├── dashboard/           # charts recharts
│   └── import/              # flow d'import multi-étapes
├── lib/
│   ├── supabase/            # clients browser/server/middleware
│   ├── csv/                 # parser générique (voir détails ci-dessous)
│   ├── categorize.ts        # moteur de règles
│   └── utils.ts
├── middleware.ts            # auth gate
└── types/database.ts
```

## Le parser CSV — détails

`src/lib/csv/` détecte automatiquement :

| Aspect | Détection |
|---|---|
| **Encodage** | UTF-8 vs Windows-1252 (essai strict UTF-8, fallback sur bytes invalides). Gère BOM. |
| **Lignes meta** | Skip les lignes d'en-tête de fichier (info compte, période) en cherchant la première ligne dont le nombre de séparateurs correspond au mode du fichier. |
| **Séparateur** | `,`, `;`, tab, `\|` — picked by best consistency score across 20 first lines. |
| **Header** | Première ligne sans aucun chiffre/date → header. |
| **Format date** | 7 formats testés (`DD/MM/YYYY`, `YYYY-MM-DD`, etc.). Désambiguïse `DD/MM` vs `MM/DD` selon les jours > 12. |
| **Séparateur décimal** | `,` vs `.` selon ce qui précède un groupe de 2 chiffres en fin de nombre. |
| **Colonne date** | Match par header (`date`, `date opération`…) puis par contenu. |
| **Colonne description** | Match par header (`libellé`, `description`…) ou colonne avec le texte le plus long. |
| **Colonnes montant** | Soit colonne signée unique, soit débit/crédit séparés — détection par header (`débit`, `montant`…) et fallback contenu. |

L'UI d'import affiche la détection et permet d'**ajuster manuellement chaque mapping** avant validation — utile quand une banque exotique a un format qu'on n'a pas vu.

## Sécurité

- Toutes les tables ont **Row Level Security** activée avec policy `auth.uid() = user_id`.
- Le middleware redirige les routes non publiques vers `/login` si pas de session.
- Les inserts/updates passent par des **server actions** qui ré-vérifient l'auth côté serveur.

## Évolutions prévues

- [ ] Multi-tenant : passer de `user_id` à `org_id` quand le SaaS prend de l'ampleur
- [ ] Stripe : abonnements (Free / Pro / Family)
- [ ] Intégration Bridge ou Powens pour la sync auto des comptes FR
- [ ] Export PDF du rapport mensuel
- [ ] Détection des paiements récurrents (abonnements oubliés)
- [ ] Partage de comptes (couple, colocataires)
