"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  Phone,
  Mail,
  Download,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import type { AxiosError } from "axios";

import { DataTable } from "@/components/common/DataTable";
import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { FormField } from "@/components/ui/FormField";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { IconButton } from "@/components/ui/IconButton";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import {
  hrApi,
  type Employee,
  type EmployeeRequest,
  type EmployeeContrat,
  type EmployeeContratRequest,
  type EmployeeDocument,
  type TimeOff,
  type TimeOffRequest,
  type TimeoffStatus,
} from "@/lib/api/hr";
import { usersApi, type User } from "@/lib/api/users";
import { urlFichier } from "@/lib/fichiers";
import { useUIStore } from "@/stores/ui.store";
import type { ApiError } from "@/types/api";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";
import { nomComplet } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Constantes & helpers
// ---------------------------------------------------------------------------


const NC = "Non renseigné";

// Types de contrat — options de la modale Laravel employee_contrats/create.
const CONTRACT_TYPES = [
  "CDI",
  "CDD",
  "Saisonnier",
  "Apprentissage",
  "Extra",
  "Intérim",
  "Stagiaire",
];

// Statuts de congé — l'enum backend (PENDING/APPROVED/REJECTED) rendu en français.
const TIMEOFF_STATUS: { value: TimeoffStatus; label: string }[] = [
  { value: "PENDING", label: "En attente" },
  { value: "APPROVED", label: "Approuvé" },
  { value: "REJECTED", label: "Rejeté" },
];

function statusLabel(s: TimeoffStatus): string {
  return TIMEOFF_STATUS.find((x) => x.value === s)?.label ?? s;
}

function formatMoney(v?: number | null): string {
  if (v == null) return NC;
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(v);
}

function formatDate(s?: string | null): string {
  if (!s) return NC;
  return new Date(s).toLocaleDateString("fr-FR");
}

function initials(employee?: Employee): string {
  if (!employee) return "—";
  const a = (employee.lastName?.[0] ?? "").toUpperCase();
  const b = (employee.firstName?.[0] ?? "").toUpperCase();
  return (a + b) || "—";
}

function numOrUndef(s?: string): number | undefined {
  return s === "" || s == null ? undefined : Number(s);
}

// ---------------------------------------------------------------------------
// Schémas de formulaire
// ---------------------------------------------------------------------------

const employeeSchema = z.object({
  firstName: z.string().min(1, "Le nom est requis"),
  lastName: z.string().min(1, "Les prénoms sont requis"),
  email: z.string().email("Email invalide").optional().or(z.literal("")),
  phone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  placeOfBirth: z.string().optional(),
  gender: z.string().optional(),
  nationality: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  cnssNumber: z.string().optional(),
  userId: z.string().optional(),
});
type EmployeeForm = z.infer<typeof employeeSchema>;

const contratSchema = z.object({
  type: z.string().optional(),
  startDate: z.string().min(1, "La date de début est requise"),
  endDate: z.string().optional(),
  probationEndDate: z.string().optional(),
  weeklyWorkHours: z.string().optional(),
  workingDaysPerWeek: z.string().optional(),
  terminationReason: z.string().optional(),
  salary: z.string().min(1, "Le salaire est requis"),
  hourlyGrossRate: z.string().optional(),
  transportAllowance: z.string().optional(),
  iban: z.string().optional(),
  bic: z.string().optional(),
});
type ContratForm = z.infer<typeof contratSchema>;

const docSchema = z.object({
  name: z.string().min(1, "Le nom du fichier est requis"),
});
type DocForm = z.infer<typeof docSchema>;

// ---------------------------------------------------------------------------
// Page — Fiche employé (réplique Laravel employees/detail.blade.php)
// ---------------------------------------------------------------------------

export default function EmployeeDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const employeeId = use(paramsPromise).id;
  const router = useRouter();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const { openTimeoffModal } = useUIStore();
  const canEdit = can(PERMISSIONS.EDIT_EMPLOYEES);

  // ---- Employé -------------------------------------------------------------
  const { data: employee } = useQuery({
    queryKey: ["employee", employeeId],
    queryFn: () => hrApi.findById(employeeId).then((r) => r.data),
  });

  const [editEmpOpen, setEditEmpOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | undefined>(undefined);
  const [photoIllisible, setPhotoIllisible] = useState(false);
  const empForm = useForm<EmployeeForm>({ resolver: zodResolver(employeeSchema) });

  const { data: usersData } = useQuery({
    queryKey: ["users", "for-employee-select"],
    queryFn: () => usersApi.findAll({ size: 1000 }).then((r) => r.data),
    enabled: editEmpOpen,
  });
  const users: User[] = usersData?.content ?? [];

  const updateEmpMutation = useMutation({
    mutationFn: async (d: EmployeeForm) => {
      await hrApi.update(employeeId, {
        firstName: d.firstName,
        lastName: d.lastName,
        email: d.email || undefined,
        phone: d.phone || undefined,
        dateOfBirth: d.dateOfBirth || undefined,
        placeOfBirth: d.placeOfBirth || undefined,
        gender: d.gender || undefined,
        nationality: d.nationality || undefined,
        address: d.address || undefined,
        city: d.city || undefined,
        cnssNumber: d.cnssNumber || undefined,
        userId: d.userId || undefined,
        // Préservés : le backend écrase position/salary/hireDate si absents.
        position: employee?.position,
        salary: employee?.salary,
        hireDate: employee?.hireDate,
      } as EmployeeRequest);
      // Upload de la photo séparément (endpoint multipart dédié) si fournie.
      if (photoFile) await hrApi.uploadPhoto(employeeId, photoFile);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee", employeeId] });
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Employé modifié");
      setPhotoFile(undefined);
      setEditEmpOpen(false);
    },
    onError: (e: AxiosError<ApiError>) =>
      toast.error(e.response?.data?.message ?? "Erreur lors de la modification"),
  });

  function openEditEmp() {
    if (!employee) return;
    setPhotoFile(undefined);
    empForm.reset({
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email ?? "",
      phone: employee.phone ?? "",
      dateOfBirth: employee.dateOfBirth ?? "",
      placeOfBirth: employee.placeOfBirth ?? "",
      gender: employee.gender ?? "",
      nationality: employee.nationality ?? "",
      address: employee.address ?? "",
      city: employee.city ?? "",
      cnssNumber: employee.cnssNumber ?? "",
      userId: employee.userId ?? "",
    });
    setEditEmpOpen(true);
  }

  // ---- Contrats ------------------------------------------------------------
  const { data: contratsData, isLoading: contratsLoading } = useQuery({
    queryKey: ["employee-contrats", employeeId],
    queryFn: () =>
      hrApi.getContrats(employeeId, { size: 100 }).then((r) => r.data),
  });
  const contrats = contratsData?.content ?? [];

  const [contratModalOpen, setContratModalOpen] = useState(false);
  const [contratTab, setContratTab] = useState<"contrat" | "paie">("contrat");
  const [editingContrat, setEditingContrat] = useState<EmployeeContrat | null>(null);
  const [deleteContrat, setDeleteContrat] = useState<EmployeeContrat | null>(null);
  const contratForm = useForm<ContratForm>({ resolver: zodResolver(contratSchema) });

  const saveContratMutation = useMutation({
    mutationFn: (d: ContratForm) => {
      const payload: EmployeeContratRequest = {
        type: d.type || undefined,
        startDate: d.startDate,
        endDate: d.endDate || undefined,
        probationEndDate: d.probationEndDate || undefined,
        weeklyWorkHours: numOrUndef(d.weeklyWorkHours),
        workingDaysPerWeek: numOrUndef(d.workingDaysPerWeek),
        terminationReason: d.terminationReason || undefined,
        salary: Number(d.salary),
        hourlyGrossRate: numOrUndef(d.hourlyGrossRate),
        transportAllowance: numOrUndef(d.transportAllowance),
        iban: d.iban || undefined,
        bic: d.bic || undefined,
      };
      return editingContrat
        ? hrApi.updateContrat(employeeId, editingContrat.id, payload)
        : hrApi.createContrat(employeeId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-contrats", employeeId] });
      toast.success(editingContrat ? "Contrat modifié" : "Contrat créé");
      setContratModalOpen(false);
      setEditingContrat(null);
    },
    onError: (e: AxiosError<ApiError>) =>
      toast.error(e.response?.data?.message ?? "Erreur lors de l'enregistrement"),
  });

  const deleteContratMutation = useMutation({
    mutationFn: (id: string) => hrApi.deleteContrat(employeeId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-contrats", employeeId] });
      toast.success("Contrat supprimé");
      setDeleteContrat(null);
    },
    onError: (e: AxiosError<ApiError>) =>
      toast.error(e.response?.data?.message ?? "Erreur lors de la suppression"),
  });

  function openNewContrat() {
    setEditingContrat(null);
    setContratTab("contrat");
    contratForm.reset({
      type: "", startDate: "", endDate: "", probationEndDate: "",
      weeklyWorkHours: "", workingDaysPerWeek: "", terminationReason: "",
      salary: "", hourlyGrossRate: "", transportAllowance: "", iban: "", bic: "",
    });
    setContratModalOpen(true);
  }
  function openEditContrat(c: EmployeeContrat) {
    setEditingContrat(c);
    setContratTab("contrat");
    contratForm.reset({
      type: c.type ?? "",
      startDate: c.startDate ?? "",
      endDate: c.endDate ?? "",
      probationEndDate: c.probationEndDate ?? "",
      weeklyWorkHours: c.weeklyWorkHours != null ? String(c.weeklyWorkHours) : "",
      workingDaysPerWeek: c.workingDaysPerWeek != null ? String(c.workingDaysPerWeek) : "",
      terminationReason: c.terminationReason ?? "",
      salary: c.salary != null ? String(c.salary) : "",
      hourlyGrossRate: c.hourlyGrossRate != null ? String(c.hourlyGrossRate) : "",
      transportAllowance: c.transportAllowance != null ? String(c.transportAllowance) : "",
      iban: c.iban ?? "",
      bic: c.bic ?? "",
    });
    setContratModalOpen(true);
  }

  const contratColumns: ColumnDef<EmployeeContrat>[] = [
    {
      header: "#",
      id: "rownum",
      cell: ({ row }) => <span className="text-gray-500">{row.index + 1}</span>,
    },
    { header: "Type", accessorKey: "type", cell: ({ row }) => row.original.type ?? NC },
    {
      header: "Début",
      accessorKey: "startDate",
      cell: ({ row }) => formatDate(row.original.startDate),
    },
    {
      header: "Fin",
      accessorKey: "endDate",
      cell: ({ row }) => formatDate(row.original.endDate),
    },
    {
      header: "Salaire brute mensuelle",
      accessorKey: "salary",
      cell: ({ row }) => formatMoney(row.original.salary),
    },
    {
      header: "Actions",
      id: "actions",
      cell: ({ row }) =>
        canEdit ? (
          <div className="flex items-center gap-2">
            <IconButton
              variant="info"
              title="Modifier"
              aria-label="Modifier"
              onClick={() => openEditContrat(row.original)}
              icon={<Pencil className="h-4 w-4" />}
            />
            <IconButton
              variant="delete"
              title="Supprimer"
              aria-label="Supprimer"
              onClick={() => setDeleteContrat(row.original)}
              icon={<Trash2 className="h-4 w-4" />}
            />
          </div>
        ) : null,
    },
  ];

  // ---- Congés --------------------------------------------------------------
  const { data: congesData, isLoading: congesLoading } = useQuery({
    queryKey: ["employee-timeoffs", employeeId],
    queryFn: () =>
      hrApi.getTimeOffs(employeeId, { size: 100 }).then((r) => r.data),
  });
  // Tri du plus récemment créé au plus ancien (fallback sur la date de début).
  const conges = [...(congesData?.content ?? [])].sort(
    (a, b) =>
      new Date(b.createdAt ?? b.startDate).getTime() -
      new Date(a.createdAt ?? a.startDate).getTime()
  );

  const [deleteConge, setDeleteConge] = useState<TimeOff | null>(null);
  const [editConge, setEditConge] = useState<TimeOff | null>(null);
  const [congeForm, setCongeForm] = useState({ startDate: "", endDate: "", reason: "" });

  /** Ouvre la modale de correction pré-remplie avec la demande choisie. */
  function openEditConge(conge: TimeOff) {
    setCongeForm({
      startDate: conge.startDate?.slice(0, 10) ?? "",
      endDate: conge.endDate?.slice(0, 10) ?? "",
      reason: conge.reason ?? "",
    });
    setEditConge(conge);
  }

  // Correction des dates et du motif — route Laravel `employee-timeoff-update`,
  // qui n'avait pas d'équivalent : on pouvait approuver ou refuser une demande
  // mais pas en corriger le contenu.
  const updateCongeMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: TimeOffRequest }) =>
      hrApi.updateTimeOff(employeeId, id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-timeoffs", employeeId] });
      toast.success("Demande de congé mise à jour");
      setEditConge(null);
    },
    onError: (e: AxiosError<ApiError>) =>
      toast.error(e.response?.data?.message ?? "Erreur lors de la modification"),
  });

  const updateCongeStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TimeoffStatus }) =>
      hrApi.updateTimeoffStatus(employeeId, id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-timeoffs", employeeId] });
      toast.success("Statut modifié");
    },
    onError: (e: AxiosError<ApiError>) =>
      toast.error(e.response?.data?.message ?? "Erreur lors de la modification"),
  });

  const deleteCongeMutation = useMutation({
    mutationFn: (id: string) => hrApi.deleteTimeOff(employeeId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-timeoffs", employeeId] });
      toast.success("Congé supprimé");
      setDeleteConge(null);
    },
    onError: (e: AxiosError<ApiError>) =>
      toast.error(e.response?.data?.message ?? "Erreur lors de la suppression"),
  });

  const congeColumns: ColumnDef<TimeOff>[] = [
    {
      header: "Date début",
      accessorKey: "startDate",
      cell: ({ row }) => formatDate(row.original.startDate),
    },
    {
      header: "Date fin",
      accessorKey: "endDate",
      cell: ({ row }) => formatDate(row.original.endDate),
    },
    { header: "Type", accessorKey: "reason", cell: ({ row }) => row.original.reason ?? NC },
    {
      header: "Status",
      id: "status",
      cell: ({ row }) =>
        canEdit ? (
          <NativeSelect
            value={row.original.status}
            onChange={(e) =>
              updateCongeStatusMutation.mutate({
                id: row.original.id,
                status: e.target.value as TimeoffStatus,
              })
            }
            className="w-44"
          >
            {TIMEOFF_STATUS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <Badge variant="success">{statusLabel(row.original.status)}</Badge>
        ),
    },
    {
      header: "Actions",
      id: "actions",
      cell: ({ row }) =>
        canEdit ? (
          <div className="flex items-center gap-1">
          <IconButton
            variant="edit"
            title="Modifier"
            aria-label="Modifier"
            onClick={() => openEditConge(row.original)}
            icon={<Pencil className="h-4 w-4" />}
          />
          <IconButton
            variant="delete"
            title="Supprimer"
            aria-label="Supprimer"
            onClick={() => setDeleteConge(row.original)}
            icon={<Trash2 className="h-4 w-4" />}
          />
          </div>
        ) : null,
    },
  ];

  // ---- Documents -----------------------------------------------------------
  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ["employee-docs", employeeId],
    queryFn: () =>
      hrApi.getDocuments(employeeId, { size: 100 }).then((r) => r.data),
  });
  const docs = docsData?.content ?? [];

  const [docModalOpen, setDocModalOpen] = useState(false);
  const [editingDoc, setEditingDoc] = useState<EmployeeDocument | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<EmployeeDocument | null>(null);
  const [docFile, setDocFile] = useState<File | undefined>(undefined);
  const docForm = useForm<DocForm>({ resolver: zodResolver(docSchema) });

  const saveDocMutation = useMutation({
    mutationFn: (d: DocForm) =>
      editingDoc
        ? hrApi.updateDocument(editingDoc.id, { name: d.name })
        : hrApi.uploadDocument(employeeId, d.name, undefined, docFile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-docs", employeeId] });
      toast.success(editingDoc ? "Document modifié" : "Document ajouté");
      setDocModalOpen(false);
      setEditingDoc(null);
      setDocFile(undefined);
    },
    onError: (e: AxiosError<ApiError>) =>
      toast.error(e.response?.data?.message ?? "Erreur lors de l'enregistrement"),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (id: string) => hrApi.deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employee-docs", employeeId] });
      toast.success("Document supprimé");
      setDeleteDoc(null);
    },
    onError: (e: AxiosError<ApiError>) =>
      toast.error(e.response?.data?.message ?? "Erreur lors de la suppression"),
  });

  function openNewDoc() {
    setEditingDoc(null);
    setDocFile(undefined);
    docForm.reset({ name: "" });
    setDocModalOpen(true);
  }
  function openEditDoc(d: EmployeeDocument) {
    setEditingDoc(d);
    setDocFile(undefined);
    docForm.reset({ name: d.name });
    setDocModalOpen(true);
  }

  const docColumns: ColumnDef<EmployeeDocument>[] = [
    {
      header: "#",
      id: "rownum",
      cell: ({ row }) => <span className="text-gray-500">{row.index + 1}</span>,
    },
    { header: "Nom", accessorKey: "name" },
    {
      header: "Fichier",
      id: "file",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={() => hrApi.downloadDocument(row.original.id, row.original.name)}
          className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
        >
          <Download className="h-4 w-4" />
          Télécharger
        </button>
      ),
    },
    {
      header: "Actions",
      id: "actions",
      cell: ({ row }) =>
        canEdit ? (
          <div className="flex items-center gap-2">
            <IconButton
              variant="info"
              title="Modifier"
              aria-label="Modifier"
              onClick={() => openEditDoc(row.original)}
              icon={<Pencil className="h-4 w-4" />}
            />
            <IconButton
              variant="delete"
              title="Supprimer"
              aria-label="Supprimer"
              onClick={() => setDeleteDoc(row.original)}
              icon={<Trash2 className="h-4 w-4" />}
            />
          </div>
        ) : null,
    },
  ];

  // ---- Render --------------------------------------------------------------
  return (
    <div className="space-y-5">
      {/* `page-title-box` de `employees/detail.blade.php` : titre « Employé »
          et bouton primaire « Retour » à droite. */}
      <PageHeader
        title="Employé"
        action={
          <Button
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => router.push("/hr/employees")}
          >
            Retour
          </Button>
        }
      />

      {/* Carte profil — bg-primary Hyper (#727cf5), calque profile-user-box */}
      <div className="overflow-hidden rounded bg-blue-600 p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            {employee?.photoUrl && !photoIllisible ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urlFichier({ fileId: employee.fileId, path: employee.photoUrl })}
                alt=""
                // 403 (dossier non lisible) ou 404 : on retombe sur les initiales.
                onError={() => setPhotoIllisible(true)}
                className="h-24 w-24 rounded-full border-4 border-white/30 object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-3xl font-bold text-white">
                {initials(employee)}
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold text-white">
                {employee ? `${employee.lastName} ${employee.firstName}` : "…"}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-blue-50">
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-4 w-4" />
                  {employee?.phone || NC}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-4 w-4" />
                  {employee?.email || NC}
                </span>
              </p>

              <ul className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
                <li>
                  <div className="text-sm font-semibold text-white">
                    {employee?.address || NC}
                  </div>
                  <div className="text-xs text-blue-100">Adresse</div>
                </li>
                <li>
                  <div className="text-sm font-semibold text-white">
                    {formatDate(employee?.dateOfBirth)} ,&nbsp;{employee?.placeOfBirth || NC}
                  </div>
                  <div className="text-xs text-blue-100">
                    Date et lieu de naissance
                  </div>
                </li>
                <li>
                  <div className="text-sm font-semibold text-white">
                    {employee?.cnssNumber || NC}
                  </div>
                  <div className="text-xs text-blue-100">
                    N° de sécurité sociale
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {canEdit && (
            <div className="flex-shrink-0">
              <button
                type="button"
                onClick={openEditEmp}
                className="inline-flex items-center gap-2 rounded-[.15rem] bg-white px-[.9rem] py-[.45rem] text-[.9rem] font-normal text-gray-700 transition-shadow hover:shadow-[0_2px_6px_0_rgba(0,0,0,0.15)]"
              >
                <Pencil className="h-4 w-4" />
                Modifier
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Contrats */}
      <Section
        title="Contrats"
        action={
          canEdit && (
            <button
              type="button"
              onClick={openNewContrat}
              className="inline-flex items-center gap-2 rounded-[.15rem] bg-blue-600 px-[.9rem] py-[.45rem] text-[.9rem] font-normal text-white transition-[background-color,box-shadow] hover:shadow-[0_2px_6px_0_rgba(114,124,245,0.5)]"
            >
              <Plus className="h-4 w-4" />
              Nouveau contrat
            </button>
          )
        }
      >
        <DataTable columns={contratColumns} data={contrats} isLoading={contratsLoading} />
      </Section>

      {/* Congés */}
      <Section
        title="Congés"
        action={
          canEdit && (
            <button
              type="button"
              onClick={() => openTimeoffModal(employeeId)}
              className="inline-flex items-center gap-2 rounded-[.15rem] bg-blue-600 px-[.9rem] py-[.45rem] text-[.9rem] font-normal text-white transition-[background-color,box-shadow] hover:shadow-[0_2px_6px_0_rgba(114,124,245,0.5)]"
            >
              <Plus className="h-4 w-4" />
              Demande de congé
            </button>
          )
        }
      >
        <DataTable columns={congeColumns} data={conges} isLoading={congesLoading} />
      </Section>

      {/* Documents */}
      <Section
        title="Documents"
        action={
          canEdit && (
            <button
              type="button"
              onClick={openNewDoc}
              className="inline-flex items-center gap-2 rounded-[.15rem] bg-blue-600 px-[.9rem] py-[.45rem] text-[.9rem] font-normal text-white transition-[background-color,box-shadow] hover:shadow-[0_2px_6px_0_rgba(114,124,245,0.5)]"
            >
              <Plus className="h-4 w-4" />
              Nouveau document
            </button>
          )
        }
      >
        <DataTable columns={docColumns} data={docs} isLoading={docsLoading} />
      </Section>

      {/* ============================ MODALES ============================ */}

      {/* Modifier l'employé — calque employees/edit.blade (Informations personnelles) */}
      <CrudModal
        isOpen={editEmpOpen}
        onClose={() => setEditEmpOpen(false)}
        title="Informations personnelles"
        size="xl"
        onSubmit={empForm.handleSubmit((d) => updateEmpMutation.mutate(d))}
        submitLabel="Mettre à jour"
        isSubmitting={updateEmpMutation.isPending}
      >
        <p className="mb-2 text-right text-xs text-red-600">*champs obligatoires</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Nom" required error={empForm.formState.errors.firstName?.message}>
            <input type="text" {...empForm.register("firstName")} className={inputClass} />
          </FormField>
          <FormField label="Prénoms" required error={empForm.formState.errors.lastName?.message}>
            <input type="text" {...empForm.register("lastName")} className={inputClass} />
          </FormField>
          <FormField label="Email" error={empForm.formState.errors.email?.message}>
            <input type="email" {...empForm.register("email")} className={inputClass} />
          </FormField>
          <FormField label="Téléphone" error={empForm.formState.errors.phone?.message}>
            <input type="tel" {...empForm.register("phone")} className={inputClass} />
          </FormField>
          <FormField label="Date de naissance">
            <input type="date" {...empForm.register("dateOfBirth")} className={inputClass} />
          </FormField>
          <FormField label="Lieu de naissance">
            <input type="text" {...empForm.register("placeOfBirth")} className={inputClass} />
          </FormField>
          <FormField label="Sexe">
            <NativeSelect
              value={empForm.watch("gender") ?? ""}
              onChange={(e) => empForm.setValue("gender", e.target.value)}
            >
              <option value="">Selectionner le sexe</option>
              <option value="Masculin">Masculin</option>
              <option value="Feminin">Feminin</option>
            </NativeSelect>
          </FormField>
          <FormField label="Nationalité">
            <input type="text" {...empForm.register("nationality")} className={inputClass} />
          </FormField>
          <FormField label="Adresse">
            <input type="text" {...empForm.register("address")} className={inputClass} />
          </FormField>
          <FormField label="Ville">
            <input type="text" {...empForm.register("city")} className={inputClass} />
          </FormField>
          <FormField label="Numéro CNSS" className="sm:col-span-2">
            <input type="text" {...empForm.register("cnssNumber")} className={inputClass} />
          </FormField>
          <FormField label="Utilisateur" className="sm:col-span-2">
            {/* Liste alimentée par la table des utilisateurs : cherchable. */}
            <NativeSelect
              value={empForm.watch("userId") ?? ""}
              onChange={(e) => empForm.setValue("userId", e.target.value)}
              placeholder="Associer à un utilisateur"
            >
              <option value="">Associer à un utilisateur</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {nomComplet(u.lastname, u.firstname)}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Photo de l'employé" className="sm:col-span-2">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setPhotoFile(e.target.files?.[0])}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            />
            {photoFile && <p className="mt-1 text-xs text-gray-500">{photoFile.name}</p>}
          </FormField>
        </div>
      </CrudModal>

      {/* Contrat (création / édition) — wizard 2 onglets Contrat / Paie */}
      <CrudModal
        isOpen={contratModalOpen}
        onClose={() => { setContratModalOpen(false); setEditingContrat(null); }}
        title={
          employee
            ? `Contrat de ${employee.lastName} ${employee.firstName}`
            : "Contrat"
        }
        size="xl"
        onSubmit={contratForm.handleSubmit((d) => saveContratMutation.mutate(d))}
        submitLabel={editingContrat ? "Mettre à jour" : "Ajouter un contrat pour un employé"}
        isSubmitting={saveContratMutation.isPending}
      >
        {/* Onglets (nav-pills Laravel) */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setContratTab("contrat")}
            className={`rounded-[.15rem] px-3 py-2 text-[.9rem] font-medium transition-colors ${
              contratTab === "contrat"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Contrat
          </button>
          <button
            type="button"
            onClick={() => setContratTab("paie")}
            className={`rounded-[.15rem] px-3 py-2 text-[.9rem] font-medium transition-colors ${
              contratTab === "paie"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Paie
          </button>
        </div>

        {/* Barre de progression du wizard (calque Laravel : bg-success,
            transition width .6s ease) */}
        <div className="wizard-progress mb-4 h-1 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-green-600"
            style={{ width: contratTab === "contrat" ? "50%" : "100%" }}
          />
        </div>

        {/* Onglet Contrat — le panneau actif apparaît en fondu (.tab-pane.fade) */}
        {contratTab === "contrat" && (
          <div key="contrat" className="wizard-pane grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Type de contrat" className="sm:col-span-2">
              <NativeSelect
                value={contratForm.watch("type") ?? ""}
                onChange={(e) => contratForm.setValue("type", e.target.value)}
              >
                <option value="">Selectionner un type de contrat</option>
                {CONTRACT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField
              label="Date de début"
              required
              error={contratForm.formState.errors.startDate?.message}
            >
              <input type="date" {...contratForm.register("startDate")} className={inputClass} />
            </FormField>
            <FormField label="Date de fin">
              <input type="date" {...contratForm.register("endDate")} className={inputClass} />
            </FormField>
            <FormField label="Date d'évaluation" className="sm:col-span-2">
              <input type="date" {...contratForm.register("probationEndDate")} className={inputClass} />
            </FormField>
            <FormField label="Heure/Semaine">
              <input type="number" min={0} {...contratForm.register("weeklyWorkHours")} className={inputClass} />
            </FormField>
            <FormField label="Jour/Semaine">
              <input type="number" min={0} {...contratForm.register("workingDaysPerWeek")} className={inputClass} />
            </FormField>
            <FormField label="Raison du fin de contrat" className="sm:col-span-2">
              <textarea rows={3} {...contratForm.register("terminationReason")} className={inputClass} />
            </FormField>
          </div>
        )}

        {/* Onglet Paie */}
        {contratTab === "paie" && (
          <div key="paie" className="wizard-pane grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label="Salaire brut / mois"
              required
              error={contratForm.formState.errors.salary?.message}
            >
              <input type="number" min={0} step="1" {...contratForm.register("salary")} className={inputClass} />
            </FormField>
            <FormField label="Taux brute/Heures">
              <input type="number" min={0} {...contratForm.register("hourlyGrossRate")} className={inputClass} />
            </FormField>
            <FormField label="Indemnite de transport">
              <input type="number" min={0} {...contratForm.register("transportAllowance")} className={inputClass} />
            </FormField>
            <FormField label="Numéro de compte bancaire (IBAN)">
              <input type="text" {...contratForm.register("iban")} className={inputClass} />
            </FormField>
            <FormField label="BIC">
              <input type="text" {...contratForm.register("bic")} className={inputClass} />
            </FormField>
          </div>
        )}
      </CrudModal>

      {/* Document (création / édition) */}
      <CrudModal
        isOpen={docModalOpen}
        onClose={() => { setDocModalOpen(false); setEditingDoc(null); }}
        title={editingDoc ? "Modifier le document" : "Ajouter un nouveau fichier"}
        onSubmit={docForm.handleSubmit((d) => saveDocMutation.mutate(d))}
        submitLabel={editingDoc ? "Mettre à jour" : "Ajouter un nouveau fichier"}
        isSubmitting={saveDocMutation.isPending}
      >
        <div className="grid grid-cols-1 gap-4">
          <FormField label="Nom du fichier" required error={docForm.formState.errors.name?.message}>
            <input type="text" {...docForm.register("name")} className={inputClass} />
          </FormField>
          {!editingDoc && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Fichier</label>
              <input
                type="file"
                onChange={(e) => setDocFile(e.target.files?.[0])}
                className="block w-full text-sm text-gray-500 file:mr-4 file:rounded file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
              {docFile && (
                <p className="text-xs text-gray-500">{docFile.name}</p>
              )}
            </div>
          )}
        </div>
      </CrudModal>

      {/* Confirmations de suppression */}
      <ConfirmModal
        isOpen={deleteContrat !== null}
        onClose={() => setDeleteContrat(null)}
        onConfirm={() => deleteContrat && deleteContratMutation.mutate(deleteContrat.id)}
        title="Supprimer ce contrat"
        message="Voulez-vous vraiment supprimer ce contrat ?"
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={deleteContratMutation.isPending}
      />
      {/* Correction d'une demande de congé — dates et motif */}
      <CrudModal
        isOpen={editConge !== null}
        onClose={() => setEditConge(null)}
        title="Modifier la demande de congé"
        onSubmit={() => {
          if (!editConge) return;
          updateCongeMutation.mutate({ id: editConge.id, data: congeForm });
        }}
        submitLabel="Enregistrer"
        isSubmitting={updateCongeMutation.isPending}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Date de début" required>
            <input
              type="date"
              value={congeForm.startDate}
              onChange={(e) =>
                setCongeForm((f) => ({ ...f, startDate: e.target.value }))
              }
              className={inputClass}
            />
          </FormField>
          <FormField label="Date de fin" required>
            <input
              type="date"
              value={congeForm.endDate}
              onChange={(e) =>
                setCongeForm((f) => ({ ...f, endDate: e.target.value }))
              }
              className={inputClass}
            />
          </FormField>
          <FormField label="Motif" className="sm:col-span-2">
            <input
              type="text"
              value={congeForm.reason}
              onChange={(e) =>
                setCongeForm((f) => ({ ...f, reason: e.target.value }))
              }
              placeholder="Congé annuel, maladie…"
              className={inputClass}
            />
          </FormField>
        </div>
      </CrudModal>

      <ConfirmModal
        isOpen={deleteConge !== null}
        onClose={() => setDeleteConge(null)}
        onConfirm={() => deleteConge && deleteCongeMutation.mutate(deleteConge.id)}
        title="Supprimer ce congé"
        message="Voulez-vous vraiment supprimer ce congé ?"
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={deleteCongeMutation.isPending}
      />
      <ConfirmModal
        isOpen={deleteDoc !== null}
        onClose={() => setDeleteDoc(null)}
        onConfirm={() => deleteDoc && deleteDocMutation.mutate(deleteDoc.id)}
        title="Supprimer ce document"
        message={deleteDoc ? `Supprimer le document « ${deleteDoc.name} » ?` : ""}
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={deleteDocMutation.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section — carte titrée avec bouton d'action (calque des cards Laravel)
// ---------------------------------------------------------------------------

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[18px] font-semibold text-gray-900">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
