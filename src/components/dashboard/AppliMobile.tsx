"use client";

import { useQuery } from "@tanstack/react-query";
import { Copy, Download, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { formatDate } from "@/lib/utils";

/** Publiés par simple copie dans `/apps/` sur le serveur (nginx), hors du build. */
export const LIEN_APK = "/apps/labocap.apk";
const LIEN_VERSION = "/apps/labocap.json";

export interface VersionAppli {
  version: string;
  build: number;
  date: string;
}

async function lireLaVersion(): Promise<VersionAppli> {
  const r = await fetch(LIEN_VERSION, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/**
 * Carte « Application mobile LabSys » : la version publiée et son lien.
 *
 * Le lien est public — on l'envoie au téléphone par WhatsApp —, l'appli ne
 * donnant accès à rien sans enrôlement. Rien n'est affiché tant qu'aucune
 * version n'est publiée : une carte vide ne dirait rien d'utile.
 */
export function AppliMobile() {
  const { data } = useQuery({
    queryKey: ["appli-mobile", "version"],
    queryFn: lireLaVersion,
    staleTime: 10 * 60 * 1000,
    retry: false,
  });

  if (!data) return null;

  const lienAbsolu = () => `${window.location.origin}${LIEN_APK}`;

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(lienAbsolu());
      toast.success("Lien copié : envoyez-le au téléphone.");
    } catch {
      toast.error("Copie impossible. Lien : " + lienAbsolu());
    }
  };

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 text-gray-500" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-semibold text-gray-800">Application mobile LabSys</h2>
            <p className="mt-0.5 text-sm text-gray-600">
              Version {data.version} (build {data.build}) · mise à jour le {formatDate(data.date)}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Android uniquement. Ouvrez le lien sur le téléphone, puis autorisez l&apos;installation.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={LIEN_APK}
            download
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Télécharger l&apos;APK
          </a>
          <button
            type="button"
            onClick={copier}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copier le lien
          </button>
        </div>
      </div>
    </section>
  );
}
