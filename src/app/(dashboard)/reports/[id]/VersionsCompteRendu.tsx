"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/utils";
import { reportsApi } from "@/lib/api/reports";
import { versionsCoteACote } from "@/lib/report-version";

/**
 * Versions antérieures d'un compte rendu signé : la liste, puis la version
 * choisie face à la précédente, en texte brut. Un compte rendu ne prend une
 * version qu'à sa première retouche après signature ; la liste est donc vide
 * pour la plupart des dossiers.
 */
export function VersionsCompteRendu({ reportId }: { reportId: string }) {
  const [choisie, setChoisie] = useState<number | null>(null);

  const { data: versions, isLoading } = useQuery({
    queryKey: ["report-versions", reportId],
    queryFn: () => reportsApi.listVersions(reportId).then((r) => r.data),
  });

  // La version qui précède celle choisie, dans l'ordre de la liste (les numéros
  // ne sont pas forcément consécutifs).
  const index = versions?.findIndex((v) => v.version === choisie) ?? -1;
  const precedente = index > 0 ? versions![index - 1].version : null;

  const { data: apres } = useQuery({
    queryKey: ["report-version", reportId, choisie],
    queryFn: () => reportsApi.findVersion(reportId, choisie!).then((r) => r.data),
    enabled: choisie !== null,
  });
  const { data: avant } = useQuery({
    queryKey: ["report-version", reportId, precedente],
    queryFn: () => reportsApi.findVersion(reportId, precedente!).then((r) => r.data),
    enabled: precedente !== null,
  });

  if (isLoading) {
    return <div className="h-16 animate-pulse rounded bg-gray-100" />;
  }
  if (!versions || versions.length === 0) {
    return (
      <p className="text-sm italic text-gray-400">
        Aucune version antérieure : ce compte rendu n&apos;a pas été modifié après sa signature.
      </p>
    );
  }

  const lignes = apres && (precedente === null || avant) ? versionsCoteACote(avant, apres) : null;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="px-3 py-2 font-medium">Version</th>
              <th className="px-3 py-2 font-medium">Enregistrée le</th>
              <th className="px-3 py-2 font-medium">Par</th>
              <th className="px-3 py-2 font-medium">État</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {versions.map((v) => (
              <tr
                key={v.version}
                className={v.version === choisie ? "bg-blue-50 text-gray-900" : "text-gray-700"}
              >
                <td className="px-3 py-2">{v.version}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(v.savedAt)}</td>
                <td className="px-3 py-2">{v.savedBy}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={v.status} domain="report" />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setChoisie(v.version)}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    Voir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {choisie !== null && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <h3 className="text-sm font-semibold text-gray-700">
            {precedente === null ? "Aucune version précédente" : `Version ${precedente}`}
          </h3>
          <h3 className="text-sm font-semibold text-gray-700">Version {choisie}</h3>
          {lignes ? (
            lignes.map((l) => (
              // Un fragment par champ : les deux cellules restent sur la même rangée de la grille.
              <div key={l.label} className="contents">
                <div className="rounded border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{l.label}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{l.avant ?? "—"}</p>
                </div>
                <div className="rounded border border-gray-200 bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{l.label}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{l.apres}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="h-24 animate-pulse rounded bg-gray-100 md:col-span-2" />
          )}
        </div>
      )}
    </div>
  );
}
