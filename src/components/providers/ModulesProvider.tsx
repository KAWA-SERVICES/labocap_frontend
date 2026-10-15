"use client";

import { createContext, useMemo } from "react";
import type { AppModule } from "@/lib/modules";

export interface ModulesContextValue {
  /** Modules activés pour ce déploiement (`APP_MODULES`). */
  modules: readonly AppModule[];
  has: (module: AppModule) => boolean;
}

/**
 * Par défaut : aucun module. Un composant rendu hors du provider se comporte
 * donc comme une installation sans module — jamais l'inverse.
 */
export const ModulesContext = createContext<ModulesContextValue>({
  modules: [],
  has: () => false,
});

/**
 * Transmet au client la liste des modules lue côté serveur par le layout du
 * dashboard (cf. src/lib/modules.ts). La liste arrive en prop sérialisée :
 * rendu serveur et hydratation voient la même valeur, sans décalage.
 */
export function ModulesProvider({
  modules,
  children,
}: {
  modules: AppModule[];
  children: React.ReactNode;
}) {
  const value = useMemo<ModulesContextValue>(
    () => ({ modules, has: (m) => modules.includes(m) }),
    [modules],
  );
  return (
    <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>
  );
}
