"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, PhoneMissed } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { dashboardApi } from "@/lib/api/dashboard";
import { A_RAPPELER, ISSUES_RAPPEL } from "@/lib/rappel";
import { cn } from "@/lib/utils";

/**
 * Section « Rappels des patients » du tableau de bord : issue du dernier appel
 * automatique de chaque compte rendu sur les 7 derniers jours (période par
 * défaut de l'API, le tableau de bord n'en ayant pas), et patients à rappeler
 * — ce dernier chiffre toutes dates confondues, comme le bandeau.
 */
export function RappelsPatients() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "rappels"],
    queryFn: () => dashboardApi.getRappels().then((r) => r.data),
    staleTime: 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
  });

  if (isError) return null;

  const aRappeler = data?.aRappeler ?? 0;

  return (
    <div className="hyper-card overflow-hidden">
      <div className="flex items-baseline justify-between border-b border-gray-100 px-5 py-3">
        <h2 className="text-sm font-semibold text-gray-800">Rappels des patients</h2>
        <span className="text-xs font-medium text-gray-500">7 derniers jours</span>
      </div>
      <div className="grid grid-cols-1 gap-px bg-gray-100 lg:grid-cols-[16rem_1fr]">
        <Link
          href={`/reports/suivi?rappel=${A_RAPPELER}`}
          className="group bg-white p-5 transition-colors hover:bg-blue-50/40"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[.8125rem] font-medium text-gray-500">À rappeler</p>
            <span
              className={cn(
                "flex-shrink-0 rounded-[var(--radius-control)] p-2",
                aRappeler > 0 ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600",
              )}
            >
              <PhoneMissed className="h-5 w-5" />
            </span>
          </div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-1/2" />
          ) : (
            <p
              className={cn(
                "mt-2 text-[1.75rem] font-semibold leading-none tracking-[-0.02em]",
                aRappeler > 0 ? "text-red-600" : "text-gray-900",
              )}
            >
              {aRappeler.toLocaleString("fr-FR")}
            </p>
          )}
          <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600">
            Voir la liste
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </p>
        </Link>
        <div className="grid grid-cols-2 gap-px bg-gray-100 sm:grid-cols-4 xl:grid-cols-7">
          {ISSUES_RAPPEL.map((issue) => (
            <div key={issue.value} className="bg-white p-4">
              <Badge variant={issue.variant}>{issue.label}</Badge>
              {isLoading ? (
                <Skeleton className="mt-2 h-5 w-1/3" />
              ) : (
                <p className="mt-2 text-[1.0625rem] font-semibold text-gray-700">
                  {(data?.parIssue?.[issue.value] ?? 0).toLocaleString("fr-FR")}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
