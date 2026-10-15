"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import type { AxiosError } from "axios";
import apiClient from "@/lib/api/client";
import { urlFichier, type RefFichier } from "@/lib/fichiers";

/**
 * Vignette d'image récupérée de façon authentifiée (cookies via apiClient) et
 * exposée en `blob:` — le chemin backend n'apparaît jamais dans le DOM et le
 * endpoint /files/** protégé par JWT reçoit bien les cookies.
 *
 * Réplique la galerie « Pièces jointes » de la vue Laravel reports/show.
 */
export function AuthThumbnail({
  fichier,
  alt,
  onClick,
  className,
}: {
  fichier: RefFichier;
  alt?: string;
  onClick?: () => void;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  // Vignette de remplacement : 403 (entité non lisible) ou 404 (fichier
  // rattaché à rien) — l'image manquante ne doit pas casser la galerie.
  const [failed, setFailed] = useState<string | null>(null);
  const { fileId, path } = fichier;

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    apiClient
      .get(urlFichier({ fileId, path }), { responseType: "blob" })
      .then((res) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setSrc(objectUrl);
      })
      .catch((err: AxiosError) =>
        setFailed(err.response?.status === 403 ? "Non autorisé" : "Introuvable"),
      );
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, path]);

  if (failed) {
    return (
      <div
        className={`flex h-[75px] w-[75px] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] border border-gray-200 bg-gray-50 text-gray-400 ${className ?? ""}`}
        title={alt}
      >
        <ImageOff className="h-4 w-4" />
        <span className="text-[9px]">{failed}</span>
      </div>
    );
  }

  if (!src) {
    return (
      <div
        className={`h-[75px] w-[75px] animate-pulse rounded-[var(--radius-control)] border border-gray-200 bg-gray-100 ${className ?? ""}`}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onClick={onClick}
      className={`h-[75px] w-[75px] cursor-pointer rounded-[var(--radius-control)] border border-gray-200 object-cover p-1 transition-transform hover:scale-105 ${className ?? ""}`}
    />
  );
}
