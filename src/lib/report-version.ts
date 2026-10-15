import { z } from "zod";
import type { ReportStatus, ReportVersion } from "./api/reports";

/** Longueur minimale du motif exigé pour retoucher un compte rendu livré (même seuil que l'API). */
export const MOTIF_MINIMUM = 20;

/**
 * Schéma du motif de modification selon l'état du compte rendu : obligatoire
 * et étoffé pour un compte rendu livré, libre sinon.
 */
export function motifDeModification(status: ReportStatus | undefined) {
  if (status !== "DELIVERED") return z.string().optional();
  return z
    .string()
    .trim()
    .min(
      MOTIF_MINIMUM,
      `Modifier un compte rendu livré exige un motif d'au moins ${MOTIF_MINIMUM} caractères.`,
    );
}

/** Texte brut d'un champ saisi dans l'éditeur riche : balises retirées, blancs repliés. */
export function texteBrut(html: string | undefined): string {
  return (html ?? "")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Les champs d'une version, dans l'ordre et sous les libellés de l'écran. */
export const CHAMPS_VERSION: { cle: keyof ReportVersion; label: string }[] = [
  { cle: "title", label: "Titre" },
  { cle: "signataires", label: "Signataires" },
  { cle: "content", label: "Récapitulatif macro" },
  { cle: "contentMicro", label: "Récapitulatif micro" },
  { cle: "comment", label: "Commentaire" },
  { cle: "commentSup", label: "Commentaire complémentaire" },
  { cle: "descriptionSupplementaire", label: "Description complémentaire macro" },
  { cle: "descriptionSupplementaireMicro", label: "Description complémentaire micro" },
];

/**
 * Met deux versions côte à côte : une ligne par champ, texte brut à gauche
 * (version précédente) et à droite (version choisie). `null` à gauche quand il
 * n'y a pas de version précédente.
 */
export function versionsCoteACote(
  precedente: ReportVersion | null | undefined,
  choisie: ReportVersion,
): { label: string; avant: string | null; apres: string }[] {
  return CHAMPS_VERSION.map(({ cle, label }) => ({
    label,
    avant: precedente ? texteBrut(String(precedente[cle] ?? "")) : null,
    apres: texteBrut(String(choisie[cle] ?? "")),
  }));
}
