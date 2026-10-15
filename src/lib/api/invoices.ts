import apiClient from "./client";
import type { PageResponse } from "@/types/api";

export type InvoicePayment =
  | "ESPECES"
  | "MOBILEMONEY"
  | "MOBILEMONEY-MTN"
  | "MOBILEMONEY-MOOV"
  | "CARTEBANCAIRE"
  | "CHEQUES"
  | "VIREMENT"
  | "CREDIT"
  | "AUTRE";

export interface InvoiceDetail {
  id: string;
  labTestId: string;
  testName: string;

  /**
   * Libellé choisi à la main, s'il y en a un.
   *
   * Rendu à côté de `testName` et non à sa place : l'écran doit pouvoir montrer
   * ce qui a été substitué, sinon on ne saurait plus quel acte a été rendu.
   */
  customTestName?: string | null;
  price: number;
  discount: number;
  quantity: number;
  unitPrice: number;
  total: number;
}

/** Remboursement rattaché à une facture d'avoir (statusInvoice = 1). */
/** Une ligne de l'historique des actualisations du nom/adresse client d'une facture. */
export interface InvoiceClientInfoHistory {
  id: string;
  userId?: string;
  userFullName?: string;
  oldClientName?: string;
  newClientName?: string;
  oldClientAddress?: string;
  newClientAddress?: string;
  createdAt: string;
}

export interface InvoiceRefund {
  code?: string;
  reasonDescription?: string;
  montant: number;
  invoiceCode?: string;
}

export interface Invoice {
  id: string;
  code: string;
  testOrderId?: string;
  testOrderCode?: string;
  patientId: string;
  patientName?: string;
  patientCode?: string;
  patientAddress?: string;
  contratId?: string;
  contratName?: string;
  clientName?: string;
  clientAddress?: string;
  /** IFU de l'acheteur, tel qu'il part à la DGI. Vide pour un patient. */
  clientIfu?: string | null;
  /** L'identité de facturation a été saisie à la main et ne sera plus réécrite. */
  facturationFigee?: boolean;
  /** « Contact client » du reçu : téléphone(s) du patient lié, sinon vide. */
  clientContact?: string;
  /** Date saisie à la création. Distincte de createdAt : c'est elle qu'affiche Laravel. */
  date?: string;
  subtotal?: number;
  total: number;
  paid: boolean;
  statusInvoice: number; // 0=vente, 1=avoir
  payment?: InvoicePayment;
  /** Code renvoyé par la DGI après normalisation. */
  codeMecef?: string;
  /** Code normalisé saisi par le caissier (24 caractères). Distinct de codeMecef. */
  codeNormalise?: string;
  /**
   * Lien FluidInvoice vers le document de la facture normalisée.
   *
   * Sa présence vaut preuve de normalisation : c'est elle qui fait basculer la
   * page de « Normaliser la facture » à « Voir la facture normalisée ».
   */
  normalizedUrl?: string;
  qrcode?: string;
  /** Code de la facture de vente d'origine, pour un avoir. */
  referenceCode?: string;
  refund?: InvoiceRefund;
  dueDate?: string;
  branchId: string;
  createdAt: string;
  details?: InvoiceDetail[];
}

export interface InvoiceRequest {
  testOrderId: string;
  patientId?: string;
  date?: string;
  dueDate?: string;
  details?: Array<{ labTestId: string; quantity?: number; unitPrice?: number }>;
}

export interface MarkPaidRequest {
  payment: InvoicePayment;
  /** Code de la facture normalisée (24 caractères) saisi par le caissier. */
  code?: string;
}

export interface FinanceStats {
  totalToday?: number;
  totalMonth?: number;
  totalLastMonth?: number;
}

export interface InvoiceSearchResult {
  ca: number;
  avoir: number;
  facture: number;
  encaissement: number;
}

export interface InvoiceMonthlyStats {
  month: number;
  year: number;
  monthName: string;
  facturated: number;
  credits: number;
  turnover: number;
  collections: number;
}

export interface InvoiceSearchParams {
  startDate?: string;
  endDate?: string;
  [key: string]: unknown;
}

/** Une ligne du rapport : un mois civil de la période. */
export interface InvoiceReportMonth {
  year: number;
  month: number;
  /** Libellé prêt à afficher, calculé par l'API — ex. « Mars 2026 ». */
  label: string;
  sales: number;
  credits: number;
  turnover: number;
  collections: number;
}

export interface InvoiceReport {
  period: string;
  totalSales: number;
  totalCredits: number;
  turnover: number;
  collections: number;
  byContracts: { contractName: string; total: number }[];
  /**
   * Ventilation mensuelle. Vide sur un rapport mono-mois (appel `year`/`month`),
   * une ligne par mois civil sur une période — mois sans activité compris, que
   * l'API rend à zéro plutôt que d'omettre.
   */
  months: InvoiceReportMonth[];
}

export interface InvoiceFindAllParams {
  page?: number;
  size?: number;
  search?: string;
  paid?: string | boolean;
  statusInvoice?: number;
  startDate?: string;
  endDate?: string;
  patient?: string;
  [key: string]: unknown;
}

export const invoicesApi = {
  findAll: (params?: InvoiceFindAllParams) =>
    apiClient.get<PageResponse<Invoice>>("/invoices", { params }),

  findById: (id: string) => apiClient.get<Invoice>(`/invoices/${id}`),

  create: (data: InvoiceRequest) => apiClient.post<Invoice>("/invoices", data),

  update: (id: string, data: Partial<InvoiceRequest>) =>
    apiClient.put<Invoice>(`/invoices/${id}`, data),

  delete: (id: string) => apiClient.delete(`/invoices/${id}`),

  markAsPaid: (id: string, data: MarkPaidRequest) =>
    apiClient.patch<Invoice>(`/invoices/${id}/status`, data),

  /**
   * Vérifie qu'un code normalisé n'est pas déjà utilisé, avant encaissement.
   * Réplique la route Laravel `invoices/checkCode` appelée par updateStatus().
   */
  checkCode: (code: string) =>
    apiClient.get<{ exists: boolean }>("/invoices/check-code", {
      params: { code },
    }),

  /**
   * Normalise la facture auprès de la DGI via FluidInvoice.
   *
   * Renvoie la facture enrichie de son code MECeF et de `normalizedUrl`, le lien
   * du document que la page ouvre dans un nouvel onglet.
   */
  /**
   * Change le libellé d'une ligne, sans toucher au nom du catalogue.
   *
   * Une chaîne vide défait la personnalisation. Le serveur refuse sur une
   * facture déjà normalisée : le papier et la déclaration à la DGI portent le
   * même mot, et les faire diverger après coup ne se rattrape que par un avoir.
   */
  changerLibelleDeLigne: (
    invoiceId: string,
    detailId: string,
    customTestName: string,
  ) =>
    apiClient.put<Invoice>(
      `/invoices/${invoiceId}/details/${detailId}/libelle`,
      { customTestName },
    ),

  /**
   * Déclare la facture à la DGI, en l'encaissant d'abord si elle ne l'est pas.
   *
   * Le mode de paiement part avec la déclaration : le serveur le lit sur la
   * facture, et sans lui la DGI recevrait un document annoncé non réglé.
   * Inutile sur un avoir — il contrepasse, il n'encaisse rien.
   */
  /**
   * Normalise la facture auprès de la DGI.
   *
   * `destinataire` adresse la facture à quelqu'un d'autre que ce qu'elle porte
   * — une clinique qui règle pour son patient. Il fige alors l'identité : une
   * revalidation du bon d'examen ne la ramènera pas au patient.
   */
  normalize: (
    id: string,
    payment?: InvoicePayment,
    destinataire?: { nom: string; adresse?: string; ifu?: string },
  ) =>
    apiClient.post<Invoice>(`/invoices/${id}/normalize`, {
      ...(payment ? { payment } : {}),
      ...(destinataire ? { destinataire } : {}),
    }),

  /**
   * Télécharge le document de la facture normalisée.
   *
   * Passe par le backend et non par `normalizedUrl` : l'adresse du document
   * chez FluidInvoice est authentifiée par la clé API, que le navigateur ne
   * doit pas connaître.
   */
  downloadNormalizedDocument: (id: string) =>
    apiClient.get(`/invoices/${id}/normalized-document`, { responseType: "blob" }),

  /** Crée la facture d'avoir contrepassant cette facture de vente. */
  createCreditNote: (id: string) =>
    apiClient.post<Invoice>(`/invoices/${id}/credit-note`),

  /**
   * Réécrit le nom/adresse client de la facture avec les informations
   * courantes du patient rattaché. Action volontaire et tracée : la facture
   * ne se met jamais à jour toute seule.
   */
  refreshClientInfo: (id: string) =>
    apiClient.post<Invoice>(`/invoices/${id}/refresh-client-info`),

  /** Historique des actualisations du nom/adresse client de cette facture. */
  getClientInfoHistory: (id: string) =>
    apiClient.get<InvoiceClientInfoHistory[]>(`/invoices/${id}/client-info-history`),

  confirmMecef: (id: string, uid: string) =>
    apiClient.post<Invoice>(`/invoices/${id}/confirm-mecef`, { uid }),

  cancelMecef: (id: string, uid: string) =>
    apiClient.post<Invoice>(`/invoices/${id}/cancel-mecef`, { uid }),

  /** Télécharge le PDF imprimable de la facture (réplique Laravel invoices/print). */
  downloadPdf: (id: string) =>
    apiClient.get(`/invoices/${id}/pdf`, { responseType: "blob" }),

  getFinanceStats: () => apiClient.get<FinanceStats>("/invoices/business"),

  getMonthlyStats: (year?: number) =>
    apiClient.get<InvoiceMonthlyStats[]>("/invoices/monthly-stats", {
      params: year != null ? { year } : undefined,
    }),

  search: (params: InvoiceSearchParams) =>
    apiClient.get<InvoiceSearchResult>("/invoices/search", { params }),

  getTodayStats: () =>
    apiClient.get<{ totalToday: number }>("/invoices/stats/today"),

  getCounts: () =>
    apiClient.get<{ sales: number; credits: number }>("/invoices/counts"),

  /** Badge « Factures » : factures non encore réglées. */
  countUnpaid: () => apiClient.get<{ count: number }>("/invoices/count-unpaid"),

  /**
   * Rapport des factures sur une période.
   *
   * L'API accepte encore le couple `year`/`month` historique, mais l'écran
   * n'appelle plus que cette forme : une période d'un mois se demande par ses
   * deux bornes, et l'API l'annonce d'elle-même « Août 2026 » plutôt que
   * « 1 août – 31 août 2026 ».
   *
   * @param startDate premier jour, inclus, au format `AAAA-MM-JJ`
   * @param endDate   dernier jour, inclus
   */
  getReports: (startDate: string, endDate: string) =>
    apiClient.get<InvoiceReport>("/invoices/reports", {
      params: { startDate, endDate },
    }),
};
