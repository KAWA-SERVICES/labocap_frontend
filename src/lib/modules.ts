/**
 * Modules optionnels de l'application (cf. docs/modules.md).
 *
 * Une même image Docker sert tous les laboratoires : les modules activés se
 * lisent donc AU RUNTIME dans la variable serveur `APP_MODULES` — liste séparée
 * par des virgules, ex. `APP_MODULES=biology,agenda`. Surtout pas de préfixe
 * `NEXT_PUBLIC_`, qui figerait la valeur à la compilation.
 *
 * Variable absente ou vide → aucun module : l'application se comporte
 * exactement comme avant l'introduction des modules.
 *
 * Tout est pur ici, sauf `getEnabledModules()` qui lit l'environnement et
 * n'a de sens que côté serveur (proxy, layouts). Le client reçoit la liste
 * par `ModulesProvider` / `useModules()`.
 */

export type AppModule = "biology" | "agenda";

export const APP_MODULES: readonly AppModule[] = ["biology", "agenda"];

/** Préfixes de routes propres à chaque module, bloqués quand il est désactivé. */
export const MODULE_ROUTE_PREFIXES: Record<AppModule, string[]> = {
  biology: ["/biologie"],
  agenda: ["/agenda"],
};

function isAppModule(value: string): value is AppModule {
  return (APP_MODULES as readonly string[]).includes(value);
}

/**
 * Lit une liste de modules (`"biology, Agenda"`) : espaces et casse ignorés,
 * valeurs inconnues écartées, doublons supprimés.
 */
export function parseModules(raw?: string): AppModule[] {
  if (!raw) return [];
  const modules = raw
    .split(",")
    .map((m) => m.trim().toLowerCase())
    .filter(isAppModule);
  return [...new Set(modules)];
}

/**
 * Module auquel appartient une route, ou `null`. Le préfixe doit s'arrêter sur
 * une frontière de segment : `/biologie` et `/biologie/x` relèvent du module,
 * `/biologiex` non.
 */
export function moduleForPath(pathname: string): AppModule | null {
  for (const appModule of APP_MODULES) {
    const matches = MODULE_ROUTE_PREFIXES[appModule].some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );
    if (matches) return appModule;
  }
  return null;
}

/**
 * Modules activés pour ce déploiement. Serveur uniquement : côté navigateur,
 * `process.env.APP_MODULES` n'existe pas (et ne doit pas exister).
 */
export function getEnabledModules(): AppModule[] {
  return parseModules(process.env.APP_MODULES);
}
