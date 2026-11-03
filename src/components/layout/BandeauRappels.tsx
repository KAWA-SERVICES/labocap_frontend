"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PhoneMissed, Settings, X } from "lucide-react";

import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { dashboardApi } from "@/lib/api/dashboard";
import { A_RAPPELER, libelleReglagesManquants } from "@/lib/rappel";

/** Fermé pour la session de l'onglet ; stockage indisponible : simplement rouvert. */
function useFermePourLaSession(cle: string): [boolean, () => void] {
  const [ferme, setFerme] = useState(() => {
    try {
      return typeof window !== "undefined" && sessionStorage.getItem(cle) === "1";
    } catch {
      return false;
    }
  });
  const fermer = () => {
    setFerme(true);
    try {
      sessionStorage.setItem(cle, "1");
    } catch {
      // Navigation privée : le bandeau reste fermé jusqu'au rechargement.
    }
  };
  return [ferme, fermer];
}

/**
 * Bandeaux communs à toutes les pages, chacun fermable indépendamment :
 *  - patients dont le résultat est prêt mais que l'appel automatique n'a pas joints ;
 *  - réglages qui empêchent des appels de partir.
 * Silencieux à zéro et en cas d'erreur — un bandeau qui s'affiche pour rien cesse d'être lu.
 */
export function BandeauRappels() {
  const { can } = usePermissions();
  const autorise = can(PERMISSIONS.VIEW_DASHBOARD);
  const [rappelsFerme, fermerRappels] = useFermePourLaSession("bandeau-rappels-ferme");
  const [reglagesFerme, fermerReglages] = useFermePourLaSession("bandeau-reglages-rappel-ferme");

  const { data } = useQuery({
    // Même clé que la section du tableau de bord sur sa période par défaut : un
    // seul appel quand les deux sont à l'écran.
    queryKey: ["dashboard", "rappels"],
    queryFn: () => dashboardApi.getRappels().then((r) => r.data),
    enabled: autorise && !(rappelsFerme && reglagesFerme),
    staleTime: 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
    retry: false,
  });

  if (!autorise || !data) return null;

  const n = data.aRappeler ?? 0;
  const manquants = data.reglagesManquants ?? [];
  const audioManquant = manquants.some((c) => c !== "fluidchat_api");

  return (
    <>
      {!reglagesFerme && manquants.length > 0 && (
        <Bandeau icon={<Settings className="h-5 w-5 flex-shrink-0 text-amber-600" aria-hidden="true" />} onClose={fermerReglages}>
          <strong className="font-semibold">Rappel automatique incomplet</strong> :{" "}
          {libelleReglagesManquants(manquants)} — aucun appel ne part pour ces cas.{" "}
          {audioManquant && (
            <Link
              href="/settings?tab=rappel"
              className="font-semibold underline underline-offset-2 hover:text-amber-900"
            >
              Compléter dans Paramètres › Rappel des patients
            </Link>
          )}
        </Bandeau>
      )}
      {!rappelsFerme && n > 0 && (
        <Bandeau icon={<PhoneMissed className="h-5 w-5 flex-shrink-0 text-amber-600" aria-hidden="true" />} onClose={fermerRappels}>
          <strong className="font-semibold">
            {n.toLocaleString("fr-FR")} patient{n > 1 ? "s" : ""} à rappeler
          </strong>{" "}
          : résultat disponible, appel automatique sans succès.{" "}
          <Link
            href={`/reports/suivi?rappel=${A_RAPPELER}`}
            className="font-semibold underline underline-offset-2 hover:text-amber-900"
          >
            Voir la liste
          </Link>
        </Bandeau>
      )}
    </>
  );
}

function Bandeau({
  icon,
  onClose,
  children,
}: {
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-3 rounded-[var(--radius-control)] bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200 print:hidden"
    >
      {icon}
      <p className="flex-1">{children}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Masquer jusqu'à la fin de la session"
        className="rounded p-1 text-amber-600 transition-colors hover:bg-amber-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
