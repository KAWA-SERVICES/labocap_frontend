import apiClient from "./client";
import type { PageResponse } from "@/types/api";

export interface Bank {
  id: string;
  name: string;
  accountNumber?: string;
  description?: string;
  branchId?: string;
  createdAt?: string;
}

export interface BankRequest {
  name: string;
  accountNumber?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Dépôts bancaires (sortie caisse de vente → banque)
// ---------------------------------------------------------------------------

export interface BankDepositRequest {
  bankId: string;
  amount: number;
  date: string; // ISO yyyy-MM-dd
  description?: string;
  attachement?: string;
}

export interface BankDeposit {
  id: string;
  bankId: string;
  bankName: string;
  cashboxId: string;
  amount: number;
  date: string;
  description?: string;
  attachement?: string;
  /** Identifiant de la pièce jointe pour `GET /files/{id}` (cf. src/lib/fichiers.ts). */
  fileId?: string;
  branchId?: string;
  createdAt?: string;
}

export const banksApi = {
  findAll: (params?: Record<string, unknown>) =>
    apiClient.get<PageResponse<Bank>>("/banks", { params }),
  create: (data: BankRequest) => apiClient.post<Bank>("/banks", data),
  update: (id: string, data: BankRequest) =>
    apiClient.put<Bank>(`/banks/${id}`, data),
  delete: (id: string) => apiClient.delete(`/banks/${id}`),

  // Dépôts bancaires
  listDeposits: (params?: Record<string, unknown>) =>
    apiClient.get<PageResponse<BankDeposit>>("/bank-deposits", { params }),
  /**
   * Enregistre un dépôt bancaire avec sa pièce jointe (scan du reçu, obligatoire).
   * Endpoint multipart : partie `data` (JSON) + partie `file`.
   */
  createDeposit: (data: BankDepositRequest, file?: File | null) => {
    const form = new FormData();
    form.append(
      "data",
      new Blob([JSON.stringify(data)], { type: "application/json" })
    );
    if (file) form.append("file", file);
    return apiClient.post<BankDeposit>("/bank-deposits", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};
