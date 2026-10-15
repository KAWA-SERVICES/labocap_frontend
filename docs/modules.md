# Modules optionnels

Certaines fonctions ne concernent qu'une partie des laboratoires (biologie
médicale, agenda). Plutôt que de maintenir une image par client, une même image
les embarque toutes et chaque déploiement choisit celles qu'il active.

| Module | Valeur | Routes gardées |
|---|---|---|
| Biologie médicale | `biology` | `/biologie`, `/biologie/…` |
| Agenda | `agenda` | `/agenda`, `/agenda/…` |

## Activation

Variable d'environnement **serveur** `APP_MODULES`, lue **au runtime** :

```bash
# .env du déploiement (docker-compose.yml la transmet au conteneur)
APP_MODULES=biology,agenda
```

- liste séparée par des virgules ; espaces et casse ignorés, valeurs inconnues
  écartées ;
- absente ou vide → **aucun module** : l'application se comporte exactement
  comme avant l'introduction des modules ;
- surtout pas de préfixe `NEXT_PUBLIC_` : la valeur serait figée à la
  compilation, et il faudrait une image par laboratoire ;
- un `docker compose up -d` suffit à la changer, sans reconstruire l'image.

Côté API, le module biologie a son propre interrupteur (`MODULE_BIOLOGY`). Les
deux se règlent dans le même `.env` et doivent rester cohérents.

## Fonctionnement

| Fichier | Rôle |
|---|---|
| [`src/lib/modules.ts`](../src/lib/modules.ts) | Liste des modules, préfixes de routes, lecture de `APP_MODULES` — source unique |
| [`src/proxy.ts`](../src/proxy.ts) | Redirige vers `/home` toute route d'un module désactivé (après la garde d'authentification, en-têtes CSP conservés) |
| [`src/app/(dashboard)/layout.tsx`](../src/app/(dashboard)/layout.tsx) | Lit les modules au runtime (`await connection()`) et les transmet au client |
| [`src/components/providers/ModulesProvider.tsx`](../src/components/providers/ModulesProvider.tsx) | Contexte client alimenté par le layout |
| [`src/hooks/useModules.ts`](../src/hooks/useModules.ts) | `const { modules, has } = useModules()` dans un composant client |
| [`src/components/layout/nav-config.tsx`](../src/components/layout/nav-config.tsx) | Une entrée de menu déclare `gate: { module: "biology" }` pour n'apparaître qu'avec son module |

Le masquage dans l'interface (`useModules`, menu) est un confort ; la garde des
routes est le proxy. Ajouter un module : l'ajouter à `AppModule`, `APP_MODULES`
et `MODULE_ROUTE_PREFIXES` dans `src/lib/modules.ts`, puis à ce tableau.
