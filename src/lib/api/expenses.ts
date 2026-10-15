import apiClient from "./client";
import type { PageResponse } from "@/types/api";

// Méthodes de paiement acceptées par le backend
export type PaymentMethod = "ESPECES" | "CHEQUES" | "MOBILEMONEY" | "VIREMENT";

// Ligne d'article d'une dépense (table `expence_details`, typo héritée de Laravel).
export interface ExpenseDetail {
  id: string;
  articleName?: string;
  articleId?: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
}

export interface ExpenseDetailRequest {
  articleName: string;
  quantity: number;
  unitPrice: number;
}

export interface Expense {
  id: string;
  amount: number;
  description?: string;
  supplierId?: string;
  expenseCategorieId?: string;
  cashboxVoucherId?: string;
  paid: number; // 0 = non payé, 1 = payé, 2 = payé + stock maj
  date?: string;
  invoiceNumber?: string;
  payment?: PaymentMethod;
  receipt?: string;
  /** Identifiant du reçu pour `GET /files/{id}` (cf. src/lib/fichiers.ts). */
  fileId?: string;
  details?: ExpenseDetail[];
  branchId?: string;
  createdAt?: string;
}

// Création : comme dans Laravel, seuls la catégorie, le fournisseur et l'objet
// sont saisis. Le montant et la date se renseignent ensuite sur la page détail.
export interface ExpenseCreateRequest {
  expenseCategorieId: string;
  description?: string;
  supplierId?: string;
  supplierName?: string;
}

export interface ExpenseRequest {
  /**
   * Omis par la page détail : le montant est la somme des lignes d'articles,
   * recalculée par le backend à chaque ajout/retrait. Ne l'envoyer que pour
   * forcer une valeur.
   */
  amount?: number;
  expenseCategorieId: string;
  description?: string;
  supplierId?: string;
  invoiceNumber?: string;
  date?: string;
  payment?: PaymentMethod;
  receipt?: string;
}

export const expensesApi = {
  findAll: (params?: Record<string, unknown>) =>
    apiClient.get<PageResponse<Expense>>("/expenses", { params }),
  findById: (id: string) => apiClient.get<Expense>(`/expenses/${id}`),
  create: (data: ExpenseCreateRequest) => apiClient.post<Expense>("/expenses", data),
  update: (id: string, data: ExpenseRequest) =>
    apiClient.put<Expense>(`/expenses/${id}`, data),
  delete: (id: string) => apiClient.delete(`/expenses/${id}`),
  // Preuve d'achat (« receipt ») — équivalent du champ fichier de show.blade.php.
  uploadReceipt: (id: string, file: File) => {
    const fd = new FormData();
    fd.append("receipt", file);
    return apiClient.post<Expense>(`/expenses/${id}/receipt`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  // Passe la dépense à payée (paid = 1) et débite la caisse de dépense.
  pay: (id: string) => apiClient.patch<Expense>(`/expenses/${id}/pay`),
  // Passe la dépense à payée + livrée (paid = 2) : entrée en stock, et débit
  // de la caisse si la dépense n'était pas déjà payée.
  updateStock: (id: string) => apiClient.patch<Expense>(`/expenses/${id}/update-stock`),
  addDetail: (id: string, data: ExpenseDetailRequest) =>
    apiClient.post<Expense>(`/expenses/${id}/details`, data),
  removeDetail: (id: string, detailId: string) =>
    apiClient.delete(`/expenses/${id}/details/${detailId}`),
};

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
}

export interface ExpenseCategoryRequest {
  name: string;
  description?: string;
}

export const expenseCategoriesApi = {
  findAll: (params?: Record<string, unknown>) =>
    apiClient.get<PageResponse<ExpenseCategory>>("/expense-categories", { params }),
  create: (data: ExpenseCategoryRequest) =>
    apiClient.post<ExpenseCategory>("/expense-categories", data),
  update: (id: string, data: ExpenseCategoryRequest) =>
    apiClient.put<ExpenseCategory>(`/expense-categories/${id}`, data),
  delete: (id: string) => apiClient.delete(`/expense-categories/${id}`),
};
