# Profil pipeline — labsys_front (front web du laboratoire LabSys)

## Contexte et risques majeurs
Next.js **16.3.8** (App Router, `output: "standalone"`), React 19.2.4, TypeScript, Tailwind v4, TanStack
Query v5 / Table v8, react-hook-form + zod v4, axios, zustand (`package.json`). Client de `labsys_api`
(Spring Boot). L'`AGENTS.md` impose de lire `node_modules/next/dist/docs/` avant tout code de routage, params,
cache ou Server Actions : Next 16 diffère de la mémoire d'entraînement.

Le plus coûteux :
- **Coder contre un contrat d'API périmé** — `labsys_api/openapi.yaml` n'a pas bougé depuis le 2026-05-18
  (`git log -- openapi.yaml`) ; seul le code des contrôleurs fait foi (cf. « Contrat d'API »).
- **Casser le durcissement sécurité** — CSP à nonce en blocage par défaut (`src/lib/security/csp.ts`,
  `src/proxy.ts`, `docs/csp.md`), HTML/SVG de l'API nettoyé avant injection (`src/lib/sanitize.ts`), auth par
  cookies HttpOnly sans token côté navigateur, en-têtes posés dans `next.config.ts`.
- **Fuite entre branches (sites du labo) ou permission oubliée** — `X-Branch-Id` posé par
  `src/lib/api/client.ts`, toute action sensible derrière `PermissionGate` / `usePermissions()`.
- **Données de santé** (patients, comptes rendus d'anatomopathologie).

## Déclencheurs propres
Nouveau domaine branché dans `src/lib/api/`, nouvel écran sous `src/app/(dashboard)/`, toute modification de
`src/proxy.ts`, `src/lib/security/`, `src/lib/api/client.ts`, `src/lib/modules.ts`, des stores
(`src/stores/`) ou des tokens de `src/app/globals.css`.

## Mots-clés de leçons
`csp`, `branche`, `permission`, `compte rendu`, `facture`, `caisse`, `biologie`, `2fa`, `modules`.

## Inventaire (étape 0.5)
- `src/lib/api/` (un module par domaine, ~40), `src/lib/` (utilitaires testés : `fichiers.ts`,
  `report-version.ts`, `audit-csv.ts`, `sanitize.ts`…), `src/hooks/`, `src/stores/`.
- Kit UI : `src/components/ui/` et `src/components/common/` (`DataTable`, `CrudModal`, `ConfirmModal`,
  `PermissionGate`, `RowActions`…) — catalogue dans `.claude/skills/senior-frontend/references/ui-kit.md`.
- Permissions : `src/lib/constants/permissions.ts`. Modules optionnels : `src/lib/modules.ts`, `docs/modules.md`.
- Projets frères : `../labsys_api` (contrôleurs `src/main/java/com/labo/anapath/<domaine>/`) ;
  `../labo-anapath` (Laravel d'origine, `resources/views/`) = référence **fonctionnelle** des écrans.
- Branches distantes non mergées qui peuvent déjà porter le travail (ex. `feat/biologie-*-front`, `feat/agenda`) :
  `git branch -r` avant de recommencer un écran.

## Contrat d'API
Source : le code de `../labsys_api` (branche `develop` sur `KAWA-SERVICES/backend_api_labocap`). `openapi.yaml`
à la racine de l'API est figé depuis mai 2026 : ne pas s'y fier seul. Pour un domaine touché, lire le
contrôleur et ses DTO, ou la spec générée par SpringDoc en local (`/v3/api-docs`, désactivée en prod :
`application-prod.yml`). Enveloppe `{ success, message, data, timestamp }` déballée par l'intercepteur ; `428`
= branche non sélectionnée, `401` = refresh automatique (`references/data-and-permissions.md` du skill).
Un manque côté API → story dans `labsys_api`, jamais de contournement ici. Interrupteur biologie côté API
(`MODULE_BIOLOGY`) à garder cohérent avec `APP_MODULES` (`docs/modules.md`).

## Wireframe (étape 1)
Charte « Ardoise & Azur » : `src/app/globals.css` (tokens `@theme`) et
`.claude/skills/senior-frontend/references/design-system.md` (azur `#2e4bd8`, encre `#475569`, fond `#f5f7fa`,
police Nunito). Structure, colonnes et libellés : Blade de `../labo-anapath/resources/views/` ; couleurs et
formes : la charte, jamais `app.min.css`. États limites : vide, chargement, erreur réseau, permission absente,
branche non sélectionnée, module désactivé.

## Architecte (étape 2)
Étape sautée (pas d'agent dédié, pas de `.claude/agents/`). `Plan` avec `AGENTS.md` et le `SKILL.md` de
`senior-frontend` en préambule seulement pour un changement structurant : client axios, proxy/CSP, stores,
modules, couche de tokens.

## Checklist (étape 3)
Rôles : dynamiques (rôles et permissions servis par l'API) ; raisonner en permissions de
`src/lib/constants/permissions.ts` et en branche active. Garde-fous : toute action sensible derrière une
permission ; aucun HTML/SVG de l'API injecté sans `sanitize` ; aucune ressource tierce ni `unsafe-inline`
(corriger le code, jamais élargir la CSP — `docs/csp.md`) ; pas de `NEXT_PUBLIC_*` pour une valeur à
régler par déploiement ; appel non authentifié hors `apiClient` (cf. `lib/api/branding.ts`). Obligations :
`docs/csp.md` / `docs/modules.md` à jour si touchés ; `npm run csp:hashes` si un bloc inline change.

## Implémentation (étape 4)
Tests : vitest + jsdom + Testing Library, fichiers `src/**/*.test.{ts,tsx}` à côté du module
(`vitest.config.mts`) ; aujourd'hui 6 tests, tous sur `src/lib/`. Logique non triviale → extraite dans
`src/lib/` et testée là.

| Le changement touche… | À vérifier |
|---|---|
| un écran / composant | kit UI, tokens, `PermissionGate` ; audit `senior-frontend` sur le dossier |
| `src/lib/api/` | contrôleur + DTO de `labsys_api`, enveloppe, `X-Branch-Id` |
| HTML ou SVG venant de l'API | `sanitize.ts` + test |
| `proxy.ts`, `security/`, script inline | `docs/csp.md`, `npm run csp:hashes` |
| routes d'un module | `src/lib/modules.ts`, `docs/modules.md` |
| graphique | `src/lib/ui/chartColors.ts` |

Skill de domaine : `senior-frontend` (`.claude/skills/`), à charger avant tout écran. Fin d'étape (ordre de la
CI) : `npm run lint`, `npm test`, `npm run build` verts ; `npx tsc --noEmit` ;
`python3 .claude/skills/senior-frontend/scripts/audit_ui_conformity.py <dossier touché>` sans nouvelle
violation `high` (le dépôt en compte déjà 73 au 2026-10-11, sortie 1 sur `src`).

## Revue (étape 5)
`security-review` : auth / 2FA / mot de passe, permissions, `proxy.ts` / CSP / en-têtes, `sanitize`, cookies,
données patient ou compte rendu (loi n°2017-20), finance (caisse, factures, remboursements), dépendances
(`npm audit --audit-level=high --omit=dev`, bloquant en CI). `qa` actif (`npm run dev`, port 3001, API locale
sur `http://localhost:8080/api/v1`). `/ponytail-review` : ne jamais retirer un test, un nettoyage `sanitize`
ni une règle CSP.

## Suivi
Pas de phases pour l'instant (aucun `stories/` dans le dépôt).

## Ship (étape 7)
Flux commun ; `develop` existe sur origin (`KAWA-SERVICES/labocap_frontend`). CI `.github/workflows/ci.yml` + conventions `kawa.yml` ; `ci.yml` :
audit, lint, tests, build sur chaque PR vers `develop` ou `main`. Au 2026-10-11, `origin/develop` a 20 commits
d'avance sur `main` : vérifier `git log origin/main..origin/develop` avant toute PR de release.
Livrée = mergée sur `develop`, CI verte (pas d'environnement de dev déployé dans le dépôt). Déploiement :
push sur `main` → `.github/workflows/deploy.yml` (SSH, `git reset --hard origin/main`, `docker compose build
--no-cache`) = **production**, sur oui explicite uniquement.

## Hors pipeline
Production (`deploy.yml`) et réglages par laboratoire (`APP_MODULES`, `CSP_ENFORCE`, `NEXT_PUBLIC_API_URL`
dans le `.env` du serveur). `feedback.txt` (idées produit en vrac) n'est pas un backlog validé.

Dépôt public : `conventions.yml` est une **copie** de kawa-standards (un dépôt public ne peut pas appeler un
workflow privé). Quand kawa-standards change ses conventions, recopier le fichier ici.
