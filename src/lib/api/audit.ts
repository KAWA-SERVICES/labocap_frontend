import apiClient from "./client";
import type { PageResponse } from "@/types/api";

export type AuditEntityType = "PATIENT" | "TEST_ORDER" | "REPORT" | "FILE" | "INVOICE";
export type AuditAction = "READ" | "DOWNLOAD" | "PRINT" | "EXPORT";

/** Une ligne du journal : qui a consulté quoi, quand, depuis où. */
export interface LigneAcces {
  id: string;
  /** Horodatage ISO. */
  at: string;
  userId: string;
  /** Nom complet de l'utilisateur. */
  utilisateur: string;
  branchId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  /** UUID, ou chemin pour un fichier. */
  entityId: string;
  ip: string;
}

export interface AuditParams {
  entityType?: AuditEntityType;
  entityId?: string;
  userId?: string;
  /** ISO date-time, ex. `2026-10-01T00:00:00`. */
  from?: string;
  to?: string;
  page?: number;
  /** Max 500 côté serveur. */
  size?: number;
}

export const ACTION_LABELS: Record<AuditAction, string> = {
  READ: "Lecture",
  DOWNLOAD: "Téléchargement",
  PRINT: "Impression",
  EXPORT: "Export",
};

export const ENTITY_TYPE_LABELS: Record<AuditEntityType, string> = {
  PATIENT: "Patient",
  TEST_ORDER: "Demande",
  REPORT: "Compte rendu",
  FILE: "Fichier",
  INVOICE: "Facture",
};

export const auditApi = {
  /** Journal des consultations, du plus récent au plus ancien (permission `view-audit`). */
  findAcces: (params?: AuditParams) =>
    apiClient.get<PageResponse<LigneAcces>>("/audit/acces", { params }),
};
