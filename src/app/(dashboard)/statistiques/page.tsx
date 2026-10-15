"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { SearchInput } from "@/components/ui/SearchInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { ProgressTable } from "@/components/dashboard/ProgressTable";
import { DonutChart } from "@/components/dashboard/DonutChart";
import {
  TableLengthControl,
  TablePaginationFooter,
  useTablePagination,
} from "@/components/common/TablePagination";
import { PermissionGate } from "@/components/common/PermissionGate";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/stores/auth.store";
import { dashboardApi, DoctorStat } from "@/lib/api/dashboard";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { formatCFA, nomComplet } from "@/lib/utils";
import { CHART_STATUS } from "@/lib/ui/chartColors";

/**
 * Carte de la page — `.hyper-card` du système.
 */
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`hyper-card ${className}`}>{children}</div>;
}

const ACRONYMS = new Set(["CA", "TVA", "CR", "HT", "TTC"]);

function sentenceCase(label: string): string {
  return label
    .toLocaleLowerCase("fr")
    .split(" ")
    .map((word, i) => {
      const upper = word.toLocaleUpperCase("fr");
      if (ACRONYMS.has(upper)) return upper;
      return i === 0 ? upper.charAt(0) + word.slice(1) : word;
    })
    .join(" ");
}

function CardHeader({ title }: { title: string }) {
  return (
    <div className="border-b border-gray-100 px-6 py-4">
      <h2 className="hyper-card-heading !mb-0">{sentenceCase(title)}</h2>
    </div>
  );
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, j) => (
        <td key={j} className="px-3 py-2">
          <Skeleton className={`h-3 ${j % 3 === 2 ? "w-1/2" : "w-4/5"}`} />
        </td>
      ))}
    </tr>
  );
}

/**
 * Statistiques — analyses sorties du tableau de bord.
 *
 * Le tableau de bord répond à « qu'est-ce qui m'attend aujourd'hui ? » ; ces
 * répartitions répondent à « comment se comporte l'activité ? ». Deux questions,
 * deux rythmes de consultation : la première quotidienne, la seconde
 * hebdomadaire ou mensuelle. Les mêler encombrait l'écran le plus regardé de
 * blocs qu'on n'y lit presque jamais.
 *
 * Les libellés et la structure des tableaux restent ceux du Blade.
 */
export default function StatistiquesPage() {
  const { can } = usePermissions();
  const user = useAuthStore((s) => s.user);
  // Les routes `/dashboard/**` exigent aussi `view-dashboard` côté API.
  const isAdmin = can(PERMISSIONS.VIEW_DASHBOARD) && can(PERMISSIONS.VIEW_ADMIN_DASHBOARD);

  const { data: topExamens = [], isLoading: topExamensLoading } = useQuery({
    queryKey: ["dashboard", "top-examens"],
    queryFn: () => dashboardApi.getTopExamens().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  const { data: monthlyStats, isLoading: monthlyLoading } = useQuery({
    queryKey: ["dashboard", "monthly-stats"],
    queryFn: () => dashboardApi.getMonthlyStats().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: () => dashboardApi.getStats().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  const { data: doctorStats = [], isLoading: doctorStatsLoading } = useQuery({
    queryKey: ["dashboard", "doctor-stats"],
    queryFn: () => dashboardApi.getDoctorStats().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    enabled: isAdmin,
  });

  const { data: connectedUsers = [], isLoading: connectedLoading } = useQuery({
    queryKey: ["dashboard", "connected-users"],
    queryFn: () => dashboardApi.getConnectedUsers().then((r) => r.data),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    enabled: isAdmin,
  });

  // Donut « Statut d'examens » — reprend `AdminStats`, où `finishTest` compte
  // les comptes rendus validés ou remis et `noFinishTest` ceux encore en
  // rédaction. Couleurs d'état, jamais la palette catégorielle : ces deux parts
  // disent « ça va » / « ça ne va pas ».
  const adminPieData = [
    { name: "Terminé", value: stats?.finishTest ?? 0, color: CHART_STATUS.good },
    { name: "En attente", value: stats?.noFinishTest ?? 0, color: CHART_STATUS.critical },
  ];

  // « Rechercher: » du tableau « Statistique par docteurs ». C'est le seul
  // tableau de ces statistiques réellement initialisé en DataTable côté Laravel
  // (viewjs/home.js sur #datatable1, et jQuery ne prend que la première des
  // trois tables portant cet id) : il est donc le seul à avoir un champ de
  // recherche. Laravel exclut la colonne « Docteurs » de la recherche
  // (columnDefs searchable:false sur la colonne 0), ce qui ne laisse chercher
  // que sur les compteurs ; on cherche ici sur les trois colonnes, ce que
  // l'utilisateur attend d'un champ posé au-dessus d'une liste de docteurs.
  const [doctorStatsSearch, setDoctorStatsSearch] = useState("");
  const doctorStatsFiltered = useMemo(() => {
    const q = doctorStatsSearch.trim().toLowerCase();
    if (!q) return doctorStats;
    return doctorStats.filter((ds: DoctorStat) =>
      [ds.doctor, ds.assigne, ds.traite].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [doctorStats, doctorStatsSearch]);

  const doctorStatsPagination = useTablePagination(doctorStatsFiltered);
  const connectedUsersPagination = useTablePagination(connectedUsers);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Statistiques"
        breadcrumbs={[{ label: "Accueil", href: "/home" }, { label: "Statistiques" }]}
      />

      <PermissionGate permission={[PERMISSIONS.VIEW_DASHBOARD, PERMISSIONS.VIEW_ADMIN_DASHBOARD]} mode="all">
        <div className="space-y-6">
      {/* LIGNE 2 : EXAMENS LES PLUS DEMANDÉS + STATUT D'EXAMENS */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Gauche 50% : EXAMENS LES PLUS DEMANDÉS */}
        <div className="flex-1">
          <Card>
            <CardHeader title="EXAMENS LES PLUS DEMANDÉS" />
            <div className="overflow-x-auto px-3">
              {/* Comme dans Laravel (dashboardPlus.blade.php) : le tableau des
                  examens les plus demandés n'a pas de ligne d'en-tête. */}
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {topExamensLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <SkeletonRow key={i} cols={3} />
                      ))
                    : topExamens.slice(0, 7).map((ex, idx) => (
                        <tr
                          key={idx}
                          className="transition-colors duration-[var(--duration-instant)] ease-emphasized hover:bg-blue-50/40"
                        >
                          <td className="py-2 px-3 text-gray-500 text-sm w-10">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 text-gray-700">
                            {ex.testName}
                          </td>
                          <td className="py-2 px-3 text-gray-700">
                            {ex.totalDemandes}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Droite 50% : STATUT D'EXAMENS */}
        <div className="flex-1">
          <Card>
            <CardHeader title="STATUT D'EXAMENS" />
            <div className="p-5">
              <DonutChart segments={adminPieData} />
              <div className="flex justify-around mt-3">
                <div className="text-center">
                  <p className="text-green-600 font-semibold text-lg">
                    ↑ {stats?.finishTest ?? 0}
                  </p>
                  <p className="text-xs text-gray-500">Terminé</p>
                </div>
                <div className="text-center">
                  <p className="text-red-600 font-semibold text-lg">
                    ↓ {stats?.noFinishTest ?? 0}
                  </p>
                  <p className="text-xs text-gray-500">En attente</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* LIGNE 3 : STATISTIQUE MENSUELLE (full width) */}
      <Card>
        <CardHeader title="STATISTIQUE MENSUELLE" />
        <div className="p-5 space-y-6">
          {/* Carte imbriquée EXAMENS DEMANDES */}
          <div className="rounded-[var(--radius-control)] border border-gray-100 p-4">
            <p className="mb-3 text-[.875rem] font-semibold text-gray-800">
              Examens demandés
            </p>
            {monthlyLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-16 animate-pulse rounded bg-gray-200"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-[var(--radius-control)] bg-gray-50 p-4 text-center">
                  <p className="text-[.8125rem] font-medium text-gray-500">
                    Total d&apos;examens
                  </p>
                  <p className="text-3xl font-semibold mt-3 mb-3 text-gray-900">
                    {monthlyStats?.nombreTests ?? 0}
                  </p>
                </div>
                <div className="rounded-[var(--radius-control)] bg-gray-50 p-4 text-center">
                  <p className="text-[.8125rem] font-medium text-gray-500">
                    Chiffre d&apos;affaire
                  </p>
                  <p className="text-3xl font-semibold mt-3 mb-3 text-gray-900">
                    {formatCFA(monthlyStats?.caTests ?? 0)}
                  </p>
                </div>
                <div className="rounded-[var(--radius-control)] bg-gray-50 p-4 text-center">
                  <p className="text-[.8125rem] font-medium text-gray-500">
                    Patients
                  </p>
                  <p className="text-3xl font-semibold mt-3 mb-3 text-gray-900">
                    {monthlyStats?.totalPatientTest ?? 0}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Carte imbriquée STATISTIQUE PATIENTS */}
          <div className="rounded-[var(--radius-control)] border border-gray-100 p-4">
            <p className="mb-3 text-[.875rem] font-semibold text-gray-800">
              Statistique patients
            </p>
            {monthlyLoading ? (
              <div className="h-20 animate-pulse rounded bg-gray-200" />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Hôpitaux */}
                <div>
                  <ProgressTable
                    headers={["Hôpital", "Patients"]}
                    data={(monthlyStats?.byHopital ?? []).map((h) => ({
                      label: h.nom,
                      value: h.totalPatients,
                    }))}
                    color="bg-blue-500"
                  />
                </div>
                {/* Médecin traitant */}
                <div>
                  <ProgressTable
                    headers={["Médécin", "Patients"]}
                    data={(monthlyStats?.byMedecin ?? []).map((h) => ({
                      label: h.nom,
                      value: h.totalPatients,
                    }))}
                    color="bg-blue-500"
                  />
                </div>
                {/* Type de demande */}
                <div>
                  <ProgressTable
                    headers={["Type", "Patients"]}
                    data={(monthlyStats?.byType ?? []).map((h) => ({
                      label: h.nom,
                      value: h.totalPatients,
                    }))}
                    color="bg-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* LIGNE 5 : Statistique par docteurs + Utilisateurs connectés */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Gauche 50% : Statistique par docteurs */}
        <div className="flex-1">
          <Card>
            <CardHeader title="Statistique par docteurs" />
            <TableLengthControl pagination={doctorStatsPagination} className="px-6">
              <SearchInput
                className="sm:w-56"
                value={doctorStatsSearch}
                onChange={(e) => setDoctorStatsSearch(e.target.value)}
              />
            </TableLengthControl>
            <div className="overflow-x-auto px-3">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Docteurs
                    </th>
                    <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Demandes Affectées
                    </th>
                    <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Demandes Traitées
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {doctorStatsLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <SkeletonRow key={i} cols={3} />
                    ))
                  ) : doctorStatsPagination.total === 0 ? (
                    // Une recherche infructueuse laissait un corps de tableau
                    // vide entre l'en-tête et le paginateur : l'écran passait
                    // pour cassé au lieu de dire qu'il n'y a rien à montrer.
                    <tr>
                      <td colSpan={3} className="p-0">
                        <EmptyState
                          compact
                          icon={SearchX}
                          title="Aucun résultat"
                          description={
                            doctorStatsSearch.trim()
                              ? `Aucun docteur ne correspond à « ${doctorStatsSearch.trim()} ».`
                              : "Aucune statistique par docteur pour l'instant."
                          }
                        />
                      </td>
                    </tr>
                  ) : (
                    doctorStatsPagination.pageRows.map((ds: DoctorStat, i) => (
                        <tr
                          key={i}
                          className="transition-colors duration-[var(--duration-instant)] ease-emphasized hover:bg-blue-50/40"
                        >
                          <td className="py-2 px-3 text-gray-700">
                            {ds.doctor}
                          </td>
                          <td className="py-2 px-3 text-gray-700">
                            {ds.assigne}
                          </td>
                          <td className="py-2 px-3 text-gray-700">
                            {ds.traite}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
            <TablePaginationFooter pagination={doctorStatsPagination} className="px-6 pb-5" />
          </Card>
        </div>

        {/* Droite 50% : Utilisateurs connectés */}
        <div className="flex-1">
          <Card>
            <CardHeader title="Utilisateurs connectés" />
            <TableLengthControl pagination={connectedUsersPagination} className="px-6" />
            <div className="overflow-x-auto px-3">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500 w-8">
                      #
                    </th>
                    <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Nom
                    </th>
                    <th className="py-2 px-3 text-left text-[.7rem] font-semibold uppercase tracking-[0.06em] text-gray-500">
                      Email
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {connectedLoading
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <SkeletonRow key={i} cols={3} />
                      ))
                    : connectedUsersPagination.pageRows.map((u, idx) => (
                        <tr
                          key={u.id}
                          className="transition-colors duration-[var(--duration-instant)] ease-emphasized hover:bg-blue-50/40"
                        >
                          <td className="py-2 px-3 text-gray-400 text-xs">
                            {idx + 1}
                          </td>
                          <td className="py-2 px-3 text-gray-700">
                            {nomComplet(u.lastname, u.firstname)}
                            {u.id === user?.id && (
                              <span className="ml-1 text-xs text-gray-400">
                                (Vous)
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-gray-600">
                            {u.email}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
            <TablePaginationFooter pagination={connectedUsersPagination} className="px-6 pb-5" />
          </Card>
        </div>
      </div>
        </div>
      </PermissionGate>
    </div>
  );
}
