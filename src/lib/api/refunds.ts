import apiClient from "./client";

export interface RefundReason {
  id: string;
  label: string;
  branchId?: string;
}

export interface RefundRequestLog {
  id?: string;
  userId?: string;
  userFullName?: string;
  operation: string;
  createdAt?: string;
}

export interface RefundRequest {
  id: string;
  invoiceId: string;
  /** Code lisible de la facture de référence. */
  invoiceCode?: string;
  refundReasonId?: string;
  /** Libellé de la raison — colonne « Objet ». */
  refundReasonLabel?: string;
  montant: number;
  note?: string;
  attachment?: string;
  /** Identifiant du fichier pour `GET /files/{id}` (cf. src/lib/fichiers.ts). */
  fileId?: string;
  code?: string;
  status: string;
  logs?: RefundRequestLog[];
  branchId?: string;
  createdAt: string;
  /** Colonne « Dernière actualisation ». */
  updatedAt?: string;
}

export interface RefundCreateRequest {
  invoiceId: string;
  refundReasonId: string;
  montant: number;
  note?: string;
}

export interface RefundUpdateRequest {
  invoiceId: string;
  refundReasonId: string;
  montant: number;
  note?: string;
}

export interface RefundReasonRequest {
  label: string;
}

export const refundReasonsApi = {
  findAll: () => apiClient.get<RefundReason[]>("/refund-reasons"),

  create: (data: RefundReasonRequest) =>
    apiClient.post<RefundReason>("/refund-reasons", data),

  update: (id: string, data: RefundReasonRequest) =>
    apiClient.put<RefundReason>(`/refund-reasons/${id}`, data),

  delete: (id: string) => apiClient.delete(`/refund-reasons/${id}`),
};

export const refundsApi = {
  findAll: (params?: Record<string, unknown>) =>
    apiClient.get<{ content: RefundRequest[]; totalElements: number; totalPages: number }>(
      "/refund-requests",
      { params }
    ),

  /** Badge du menu « Remboursements » : demandes en attente. */
  countPending: () =>
    apiClient.get<{ count: number }>("/refund-requests/count-pending"),

  findById: (id: string) =>
    apiClient.get<RefundRequest>(`/refund-requests/${id}`),

  create: (data: RefundCreateRequest) =>
    apiClient.post<RefundRequest>("/refund-requests", data),

  /**
   * Édite une demande + remplace éventuellement la pièce jointe PDF.
   * Endpoint multipart : partie `data` (JSON) + partie `file` optionnelle.
   */
  update: (id: string, data: RefundUpdateRequest, file?: File | null) => {
    const form = new FormData();
    form.append(
      "data",
      new Blob([JSON.stringify(data)], { type: "application/json" })
    );
    if (file) form.append("file", file);
    return apiClient.put<RefundRequest>(`/refund-requests/${id}`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  updateStatus: (id: string, status: string) =>
    apiClient.patch<{ id: string | null; status: string }>(
      `/refund-requests/${id}/status`,
      { status }
    ),

  // UN seul 'p' dans "Aprouvé" — typo héritée du Laravel, maintenue intentionnellement
  approve: (id: string) =>
    apiClient.patch(`/refund-requests/${id}/status`, { status: "Aprouvé" }),

  reject: (id: string) =>
    apiClient.patch(`/refund-requests/${id}/status`, { status: "Rejeté" }),

  delete: (id: string) =>
    apiClient.delete(`/refund-requests/${id}`),
};
