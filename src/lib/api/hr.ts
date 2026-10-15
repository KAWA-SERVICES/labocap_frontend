import { toast } from "sonner";

import apiClient from "./client";
import { getApiErrorMessageFromBlob } from "./errorMessages";
import type { PageResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Types — alignés sur les DTOs Spring Boot
// ---------------------------------------------------------------------------

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  position?: string;
  salary?: number;
  hireDate?: string;
  phone?: string;
  email?: string;
  userId?: string;
  branchId?: string;
  createdAt?: string;
  // Champs profil du calque Laravel (désormais stockés côté backend, cf. V56).
  address?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  cnssNumber?: string;
  photoUrl?: string;
  /** Identifiant de la photo pour `GET /files/{id}` (cf. src/lib/fichiers.ts). */
  fileId?: string;
  gender?: string;
  nationality?: string;
  city?: string;
}

export interface EmployeeRequest {
  firstName: string;
  lastName: string;
  position?: string;
  salary?: number;
  hireDate?: string;
  phone?: string;
  email?: string;
  address?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  cnssNumber?: string;
  photoUrl?: string;
  gender?: string;
  nationality?: string;
  city?: string;
  userId?: string;
}

export type TimeoffStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface TimeOff {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: TimeoffStatus;
  createdAt?: string;
}

export interface TimeOffRequest {
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface TimeoffStatusUpdate {
  status: TimeoffStatus;
}

export interface Payroll {
  id: string;
  employeeId: string;
  month: number;
  year: number;
  grossSalary: number;
  deductions: number;
  netSalary: number;
  paidAt?: string;
  createdAt?: string;
}

export interface PayrollRequest {
  month: number;
  year: number;
  grossSalary: number;
  deductions?: number;
  paidAt?: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Employee Contrats
// ---------------------------------------------------------------------------

export interface EmployeeContrat {
  id: string;
  employeeId: string;
  type?: string;
  startDate: string;
  endDate?: string;
  salary?: number;
  // Onglet « Contrat »
  probationEndDate?: string;
  weeklyWorkHours?: number;
  workingDaysPerWeek?: number;
  terminationReason?: string;
  // Onglet « Paie »
  hourlyGrossRate?: number;
  transportAllowance?: number;
  iban?: string;
  bic?: string;
  createdAt?: string;
}

export interface EmployeeContratRequest {
  startDate: string;
  endDate?: string;
  type?: string;
  salary: number;
  probationEndDate?: string;
  weeklyWorkHours?: number;
  workingDaysPerWeek?: number;
  terminationReason?: string;
  hourlyGrossRate?: number;
  transportAllowance?: number;
  iban?: string;
  bic?: string;
}

// ---------------------------------------------------------------------------
// Employee Documents
// ---------------------------------------------------------------------------

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  name: string;
  type?: string;
  fileSize?: number;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export const hrApi = {
  // Employés — /api/v1/employees
  findAll: (params?: Record<string, unknown>) =>
    apiClient.get<PageResponse<Employee>>("/employees", { params }),
  findById: (id: string) => apiClient.get<Employee>(`/employees/${id}`),
  create: (data: EmployeeRequest) =>
    apiClient.post<Employee>("/employees", data),
  update: (id: string, data: EmployeeRequest) =>
    apiClient.put<Employee>(`/employees/${id}`, data),
  delete: (id: string) => apiClient.delete(`/employees/${id}`),
  uploadPhoto: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return apiClient.post<Employee>(`/employees/${id}/photo`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },

  // Congés — /api/v1/employees/{employeeId}/timeoffs
  getTimeOffs: (employeeId: string, params?: Record<string, unknown>) =>
    apiClient.get<PageResponse<TimeOff>>(
      `/employees/${employeeId}/timeoffs`,
      { params }
    ),
  createTimeOff: (employeeId: string, data: TimeOffRequest) =>
    apiClient.post<TimeOff>(`/employees/${employeeId}/timeoffs`, data),
  /** Corrige dates et motif d'une demande — route Laravel `employee-timeoff-update`. */
  updateTimeOff: (employeeId: string, timeoffId: string, data: TimeOffRequest) =>
    apiClient.put<TimeOff>(
      `/employees/${employeeId}/timeoffs/${timeoffId}`,
      data
    ),
  updateTimeoffStatus: (employeeId: string, timeoffId: string, data: TimeoffStatusUpdate) =>
    apiClient.put<TimeOff>(
      `/employees/${employeeId}/timeoffs/${timeoffId}/status`,
      data
    ),
  deleteTimeOff: (employeeId: string, timeoffId: string) =>
    apiClient.delete(`/employees/${employeeId}/timeoffs/${timeoffId}`),

  // Paie — /api/v1/employees/{employeeId}/payrolls
  getPayrolls: (employeeId: string, params?: Record<string, unknown>) =>
    apiClient.get<PageResponse<Payroll>>(
      `/employees/${employeeId}/payrolls`,
      { params }
    ),
  createPayroll: (employeeId: string, data: PayrollRequest) =>
    apiClient.post<Payroll>(`/employees/${employeeId}/payrolls`, data),
  /** Corrige une fiche de paie — route Laravel `employee.payroll.update`. */
  updatePayroll: (employeeId: string, id: string, data: PayrollRequest) =>
    apiClient.put<Payroll>(`/employees/${employeeId}/payrolls/${id}`, data),
  /** Supprime une fiche de paie — route Laravel `employee.payroll.delete`. */
  deletePayroll: (employeeId: string, id: string) =>
    apiClient.delete(`/employees/${employeeId}/payrolls/${id}`),
  downloadPayrollPdf: (employeeId: string, id: string) =>
    apiClient.get(`/employees/${employeeId}/payrolls/${id}/pdf`, {
      responseType: "blob",
    }),

  // Contrats — /api/v1/employees/{employeeId}/contrats
  getContrats: (employeeId: string, params?: Record<string, unknown>) =>
    apiClient.get<PageResponse<EmployeeContrat>>(
      `/employees/${employeeId}/contrats`,
      { params }
    ),
  createContrat: (employeeId: string, data: EmployeeContratRequest) =>
    apiClient.post<EmployeeContrat>(`/employees/${employeeId}/contrats`, data),
  updateContrat: (employeeId: string, id: string, data: EmployeeContratRequest) =>
    apiClient.put<EmployeeContrat>(`/employees/${employeeId}/contrats/${id}`, data),
  deleteContrat: (employeeId: string, id: string) =>
    apiClient.delete(`/employees/${employeeId}/contrats/${id}`),

  // Documents — /api/v1/employee-documents
  getDocuments: (employeeId: string, params?: Record<string, unknown>) =>
    apiClient.get<PageResponse<EmployeeDocument>>("/employee-documents", {
      params: { employeeId, ...params },
    }),
  uploadDocument: (employeeId: string, name: string, type: string | undefined, file?: File) => {
    const form = new FormData();
    form.append("employeeId", employeeId);
    form.append("name", name);
    if (type) form.append("type", type);
    if (file) form.append("file", file);
    return apiClient.post<EmployeeDocument>("/employee-documents", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
  updateDocument: (id: string, data: { name: string; type?: string }) =>
    apiClient.put<EmployeeDocument>(`/employee-documents/${id}`, data),
  deleteDocument: (id: string) =>
    apiClient.delete(`/employee-documents/${id}`),

  /** Télécharge le fichier d'un document employé (endpoint authentifié → blob). */
  downloadDocument: async (id: string, filename?: string): Promise<void> => {
    try {
      const res = await apiClient.get(`/employee-documents/${id}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "document";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(
        await getApiErrorMessageFromBlob(
          err,
          "Échec du téléchargement du fichier",
        ),
      );
    }
  },
};
