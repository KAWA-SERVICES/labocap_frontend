import apiClient from "./client";
import type { PageResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Interfaces — Cashbox (caisse principale)
// ---------------------------------------------------------------------------

export interface CashboxResponseDto {
  id: string;
  name: string;
  type: string;
  balance: number;
  /** Statut de la caisse — source de vérité Laravel pour Ouvert/Fermée : 1 = Ouvert, 0 = Fermée. */
  statut: number;
  branchId: string;
  createdAt: string;
}

export interface CashboxCreateDto {
  name: string;
  type: string;
  branchId: string;
}

// ---------------------------------------------------------------------------
// Interfaces — CashboxDaily (session journalière)
// ---------------------------------------------------------------------------

export interface CashboxDailyResponseDto {
  id: string;
  cashboxId: string;
  openingBalance: number;
  closingBalance: number | null;
  date: string;
  status: number;
  code: string;
  cashCalculated: number | null;
  cashConfirmation: number | null;
  cashEcart: number | null;
  mobileMoneyCalculated: number | null;
  moneyMoneyConfirmation: number | null;
  mobileMoneyEcart: number | null;
  chequeCalculated: number | null;
  chequeConfirmation: number | null;
  chequeEcart: number | null;
  virementCalculated: number | null;
  virementConfirmation: number | null;
  virementEcart: number | null;
  totalCalculated: number | null;
  totalConfirmation: number | null;
  totalEcart: number | null;
  branchId: string;
  createdAt: string;
  /** Date de fermeture (updatedAt) — colonne « Date de fermeture » de Laravel. */
  updatedAt: string | null;
  /** Agent ayant ouvert/fermé la session — colonne « Utilisateur » de Laravel. */
  userName: string | null;
  /** Commentaire de clôture — « Commentaire » du récapitulatif / impression. */
  description: string | null;
}

export interface CashboxDailyOpenDto {
  soldeOuverture: number;
  /**
   * Facultatif, comme côté serveur : omis, le backend retient la caisse de
   * vente de la branche (`resolveCashbox`). L'écran d'ouverture ne le transmet
   * plus — laisser choisir la caisse a permis d'ouvrir une journée de vente sur
   * la caisse de dépense.
   */
  cashboxId?: string;
}

/** Sommes calculées par mode de paiement depuis la dernière ouverture (GET /cashbox-dailies/summary). */
export interface CashboxDailySummaryDto {
  totalEspeces: number;
  totalMobileMoney: number;
  totalCheques: number;
  totalVirement: number;
  total: number;
  /** Nombres de règlements, sur exactement les mêmes critères que les montants. */
  nombreEspeces: number;
  nombreMobileMoney: number;
  nombreCheques: number;
  nombreVirement: number;
  /** Début de la période comptée — l'ouverture de la session fermée. */
  depuis: string | null;
}

export interface CashboxDailyCloseDto {
  closingBalance: number;
  cashCalculated: number;
  cashConfirmation: number;
  cashEcart: number;
  mobileMoneyCalculated: number;
  moneyMoneyConfirmation: number;
  mobileMoneyEcart: number;
  chequeCalculated: number;
  chequeConfirmation: number;
  chequeEcart: number;
  virementCalculated: number;
  virementConfirmation: number;
  virementEcart: number;
  totalCalculated: number;
  totalConfirmation: number;
  totalEcart: number;
  /** Commentaire de clôture (obligatoire en cas d'écart). */
  description?: string;
}

// ---------------------------------------------------------------------------
// Interfaces — CashboxOperation
// ---------------------------------------------------------------------------

export interface CashboxOperationResponseDto {
  id: string;
  cashboxId: string;
  amount: number;
  type: string;
  description: string | null;
  operationDate: string;
  /** Code de la facture liée — colonne « Facture » de Laravel. */
  invoiceCode: string | null;
  /** Mode de paiement — colonne « Type de payement » de Laravel. */
  paymentType: string | null;
  /** Utilisateur ayant enregistré l'opération — colonne « Utilisateur ». */
  userName: string | null;
  branchId: string;
  createdAt: string;
}

export interface CashboxOperationCreateDto {
  cashboxId: string;
  amount: number;
  type: string;
  description?: string;
  operationDate: string;
  /** Banque associée (approvisionnement par chèque / virement). */
  bankId?: string;
  chequeNumber?: string;
}

export interface CashboxOperationParams {
  cashboxId?: string;
  type?: string;
  date?: string;
  page?: number;
  size?: number;
}

// ---------------------------------------------------------------------------
// Interfaces — CashboxVoucher (bon / ticket)
// ---------------------------------------------------------------------------

export interface CashboxVoucherDetail {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
}

export interface CashboxVoucherResponseDto {
  id: string;
  cashboxId: string;
  code: string;
  amount: number;
  description: string | null;
  status: string;
  supplierId: string | null;
  /** Nom du fournisseur — colonne « Fournisseur » de Laravel. */
  supplierName: string | null;
  expenseCategoryId: string | null;
  ticketFile: string | null;
  /** Identifiant de la pièce jointe pour `GET /files/{id}` (cf. src/lib/fichiers.ts). */
  fileId?: string;
  details: CashboxVoucherDetail[];
  branchId: string;
  createdAt: string;
}

export interface CashboxVoucherCreateDto {
  description?: string;
  supplierId?: string;
  expenseCategoryId?: string;
  cashboxId?: string;
  ticketFile?: string;
}

export interface CashboxVoucherDetailCreateDto {
  itemName: string;
  quantity: number;
  unitPrice: number;
}

/** Statuts acceptés par le backend (liste blanche, sans accents). */
export type CashboxVoucherStatus = "en attente" | "approuve" | "rejete";

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const cashboxApi = {
  // ---- Caisses ----
  getCashboxes: () =>
    apiClient.get<PageResponse<CashboxResponseDto>>("/cashboxes"),

  getCashbox: (id: string) =>
    apiClient.get<CashboxResponseDto>(`/cashboxes/${id}`),

  createCashbox: (data: CashboxCreateDto) =>
    apiClient.post<CashboxResponseDto>("/cashboxes", data),

  updateCashbox: (id: string, data: Partial<CashboxCreateDto>) =>
    apiClient.put<CashboxResponseDto>(`/cashboxes/${id}`, data),

  // ---- Sessions journalières (dailies) ----
  getDailies: (params?: Record<string, unknown>) =>
    apiClient.get<PageResponse<CashboxDailyResponseDto>>("/cashbox-dailies", {
      params,
    }),

  getDaily: (id: string) =>
    apiClient.get<CashboxDailyResponseDto>(`/cashbox-dailies/${id}`),

  /**
   * Encaissements à présenter à la fermeture.
   *
   * `sessionId` désigne la session que l'on ferme : le total part de son
   * ouverture. Sans lui, le serveur retombe sur la dernière session ouverte de
   * la branche — ce qui fausse le total dès qu'une session ancienne traîne,
   * la période couvrant alors plusieurs jours.
   */
  getDailiesSummary: (sessionId?: string) =>
    apiClient.get<CashboxDailySummaryDto>("/cashbox-dailies/summary", {
      params: sessionId ? { sessionId } : undefined,
    }),

  openDaily: (data: CashboxDailyOpenDto) =>
    apiClient.post<CashboxDailyResponseDto>("/cashbox-dailies", data),

  closeDaily: (id: string, data: CashboxDailyCloseDto) =>
    apiClient.put<CashboxDailyResponseDto>(`/cashbox-dailies/${id}`, data),

  deleteDaily: (id: string) =>
    apiClient.delete(`/cashbox-dailies/${id}`),

  /** Télécharge le PDF de clôture d'une journée de caisse (réplique Laravel cashbox-daily-print). */
  downloadDailyPdf: (id: string) =>
    apiClient.get(`/cashbox-dailies/${id}/pdf`, { responseType: "blob" }),

  // ---- Opérations ----
  getOperations: (params?: CashboxOperationParams) =>
    apiClient.get<PageResponse<CashboxOperationResponseDto>>(
      "/cashbox-operations",
      { params }
    ),

  addOperation: (data: CashboxOperationCreateDto) =>
    apiClient.post<CashboxOperationResponseDto>("/cashbox-operations", data),

  // ---- Bons / Vouchers ----
  getVouchers: (params?: Record<string, unknown>) =>
    apiClient.get<PageResponse<CashboxVoucherResponseDto>>(
      "/cashbox-tickets",
      { params }
    ),

  getVoucher: (id: string) =>
    apiClient.get<CashboxVoucherResponseDto>(`/cashbox-tickets/${id}`),

  /** Badge « Caisses » : bons de caisse encore en attente de traitement. */
  countPendingVouchers: () =>
    apiClient.get<{ count: number }>("/cashbox-tickets/count-pending"),

  addVoucher: (data: CashboxVoucherCreateDto) =>
    apiClient.post<CashboxVoucherResponseDto>("/cashbox-tickets", data),

  /**
   * Édite l'en-tête d'un bon + remplace éventuellement la pièce jointe.
   * Endpoint multipart : partie `data` (JSON) + partie `file` optionnelle.
   */
  updateVoucher: (id: string, data: CashboxVoucherCreateDto, file?: File | null) => {
    const form = new FormData();
    form.append(
      "data",
      new Blob([JSON.stringify(data)], { type: "application/json" })
    );
    if (file) form.append("file", file);
    return apiClient.put<CashboxVoucherResponseDto>(
      `/cashbox-tickets/${id}`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },

  deleteVoucher: (id: string) => apiClient.delete(`/cashbox-tickets/${id}`),

  addVoucherDetail: (voucherId: string, data: CashboxVoucherDetailCreateDto) =>
    apiClient.post<CashboxVoucherResponseDto>(
      `/cashbox-tickets/${voucherId}/details`,
      data
    ),

  deleteVoucherDetail: (voucherId: string, detailId: string) =>
    apiClient.delete(`/cashbox-tickets/${voucherId}/details/${detailId}`),

  updateVoucherStatus: (id: string, status: CashboxVoucherStatus) =>
    apiClient.patch<CashboxVoucherResponseDto>(
      `/cashbox-tickets/${id}/status`,
      { status }
    ),
};
