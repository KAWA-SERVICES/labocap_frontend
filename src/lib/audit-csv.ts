import { ACTION_LABELS, ENTITY_TYPE_LABELS, type LigneAcces } from "./api/audit";

/** Date/heure lisible, au format français. */
export function formaterDate(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR");
}

// Un champ est encadré de guillemets dès qu'il contient le séparateur, un
// guillemet ou un saut de ligne ; le guillemet est doublé (RFC 4180).
function champ(valeur: string): string {
  return /[";\n\r]/.test(valeur) ? `"${valeur.replace(/"/g, '""')}"` : valeur;
}

/**
 * Convertit des lignes du journal en texte CSV : séparateur `;` (celui
 * qu'Excel attend en locale française), en-tête en français, CRLF.
 */
export function lignesEnCsv(lignes: LigneAcces[]): string {
  const entete = ["Date", "Utilisateur", "Action", "Type", "Identifiant", "Adresse IP"];
  const corps = lignes.map((l) =>
    [
      formaterDate(l.at),
      l.utilisateur,
      ACTION_LABELS[l.action] ?? l.action,
      ENTITY_TYPE_LABELS[l.entityType] ?? l.entityType,
      l.entityId,
      l.ip,
    ]
      .map(champ)
      .join(";"),
  );
  return [entete.join(";"), ...corps].join("\r\n");
}

/** Déclenche le téléchargement d'un CSV ; le BOM permet à Excel de lire l'UTF-8. */
export function telechargerCsv(nomFichier: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  URL.revokeObjectURL(url);
}
