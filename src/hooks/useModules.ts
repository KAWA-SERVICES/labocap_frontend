"use client";

import { useContext } from "react";
import {
  ModulesContext,
  type ModulesContextValue,
} from "@/components/providers/ModulesProvider";

/**
 * Modules activés (`APP_MODULES`, cf. docs/modules.md).
 *
 * `has("biology")` sert à masquer une entrée de menu ou un bloc d'écran ; la
 * garde réelle des routes reste le proxy.
 */
export function useModules(): ModulesContextValue {
  return useContext(ModulesContext);
}
