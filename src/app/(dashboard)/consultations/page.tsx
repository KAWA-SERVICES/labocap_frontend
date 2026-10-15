"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil, Trash2, Plus } from "lucide-react";
import { LimitedSelect as Select } from "@/components/ui/LimitedSelect";
import { RemoteSelectField } from "@/components/ui/RemoteSelectField";
import type { SelectOption } from "@/components/ui/FormSelect";
import {
  loadDoctorOptions,
  loadPatientOptions,
} from "@/lib/api/optionLoaders";
import type { ColumnDef } from "@tanstack/react-table";
import type { AxiosError } from "axios";

import { DataTable } from "@/components/common/DataTable";
import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { PermissionGate } from "@/components/common/PermissionGate";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { formatCFA, formatDate, nomComplet } from "@/lib/utils";
import {
  consultationsApi,
  type Consultation,
  type ConsultationRequest,
  type ConsultationFile,
} from "@/lib/api/consultations";
import { openDocFile } from "@/lib/api/docs";
import type { PageResponse, ApiError } from "@/types/api";
import apiClient from "@/lib/api/client";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------

interface TypeConsultation {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const consultationSchema = z.object({
  patientId: z.string().min(1, "Le patient est requis"),
  doctorId: z.string().optional(),
  typeConsultationId: z.string().optional(),
  date: z.string().min(1, "La date est requise"),
  motif: z.string().optional(),
  notes: z.string().optional(),
  amount: z.string().optional(),
});

type ConsultationFormData = z.infer<typeof consultationSchema>;

// ---------------------------------------------------------------------------
// Input style helper
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Composant formulaire partagé
// ---------------------------------------------------------------------------

interface ConsultationFormProps {
  form: ReturnType<typeof useForm<ConsultationFormData>>;
  /** Libellé du patient déjà sélectionné (édition) — la liste n'est pas préchargée. */
  initialPatientOption?: SelectOption | null;
  /** Idem pour le médecin. */
  initialDoctorOption?: SelectOption | null;
  typeOptions: { value: string; label: string }[];
  /** Affiche la zone fichiers (édition uniquement — l'upload se fait sur PUT). */
  showFiles?: boolean;
  existingFiles?: ConsultationFile[];
  onFilesChange?: (files: File[]) => void;
}

function ConsultationForm({
  form,
  initialPatientOption = null,
  initialDoctorOption = null,
  typeOptions,
  showFiles = false,
  existingFiles = [],
  onFilesChange,
}: ConsultationFormProps) {
  const {
    register,
    control,
    watch,
    formState: { errors },
  } = form;
  const hasType = !!watch("typeConsultationId");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* Patient */}
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className="text-sm font-medium text-gray-700">
          Patient <span className="text-red-500">*</span>
        </label>
        <Controller
          name="patientId"
          control={control}
          render={({ field }) => (
            <RemoteSelectField
              id="patientId"
              loadOptions={loadPatientOptions}
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? "")}
              selectedOption={initialPatientOption}
              placeholder="Rechercher un patient (nom, code, téléphone)..."
              isClearable
            />
          )}
        />
        {errors.patientId && (
          <p className="text-xs text-red-500">{errors.patientId.message}</p>
        )}
      </div>

      {/* Médecin */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Médecin</label>
        <Controller
          name="doctorId"
          control={control}
          render={({ field }) => (
            <RemoteSelectField
              id="doctorId"
              loadOptions={loadDoctorOptions}
              value={field.value || null}
              onChange={(v) => field.onChange(v ?? "")}
              selectedOption={initialDoctorOption}
              placeholder="Rechercher un médecin..."
              isClearable
            />
          )}
        />
      </div>

      {/* Type de consultation */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Type de consultation
        </label>
        <Controller
          name="typeConsultationId"
          control={control}
          render={({ field }) => (
            <Select
              instanceId="consultation-type"
              inputId="typeConsultationId"
              options={typeOptions}
              placeholder="Sélectionner un type..."
              value={typeOptions.find((o) => o.value === field.value) ?? null}
              onChange={(opt) => field.onChange(opt?.value ?? "")}
              isClearable
              classNamePrefix="react-select"
            />
          )}
        />
      </div>

      {/* Date */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Date <span className="text-red-500">*</span>
        </label>
        <input
          type="datetime-local"
          {...register("date")}
          className={inputClass}
        />
        {errors.date && (
          <p className="text-xs text-red-500">{errors.date.message}</p>
        )}
      </div>

      {/* Montant */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Montant</label>
        <input
          type="number"
          min={0}
          step="any"
          {...register("amount")}
          placeholder="0"
          className={inputClass}
        />
      </div>

      {/* Motif */}
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className="text-sm font-medium text-gray-700">Motif</label>
        <textarea
          rows={3}
          {...register("motif")}
          placeholder="Motif de la consultation..."
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1 sm:col-span-2">
        <label className="text-sm font-medium text-gray-700">Notes</label>
        <textarea
          rows={3}
          {...register("notes")}
          placeholder="Notes complémentaires..."
          className={`${inputClass} resize-none`}
        />
      </div>

      {/* Fichiers (édition uniquement) */}
      {showFiles && (
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label className="text-sm font-medium text-gray-700">Fichiers joints</label>

          {existingFiles.length > 0 ? (
            <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
              {existingFiles.map((f) => (
                <li key={f.id} className="flex items-center justify-between px-3 py-2 text-[.9rem]">
                  <span className="truncate text-gray-700">
                    {f.typeFileLabel || f.path.split("/").pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => openDocFile({ fileId: f.fileId, path: f.path })}
                    className="ml-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    Voir
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-400">Aucun fichier joint.</p>
          )}

          <input
            type="file"
            multiple
            disabled={!hasType}
            onChange={(e) => onFilesChange?.(Array.from(e.target.files ?? []))}
            className="rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
          />
          {!hasType && (
            <p className="text-xs text-amber-600">
              Sélectionnez d&apos;abord un type de consultation pour pouvoir joindre des fichiers.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

export default function ConsultationsPage() {
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  // --- Pagination & filtres
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // --- Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Consultation | null>(null);
  const [selectedConsultation, setSelectedConsultation] =
    useState<Consultation | null>(null);
  const [editFiles, setEditFiles] = useState<File[]>([]);

  // --- Formulaires
  const createForm = useForm<ConsultationFormData>({
    resolver: zodResolver(consultationSchema),
    defaultValues: {
      patientId: "",
      doctorId: "",
      typeConsultationId: "",
      date: "",
      motif: "",
      notes: "",
      amount: "",
    },
  });

  const editForm = useForm<ConsultationFormData>({
    resolver: zodResolver(consultationSchema),
  });

  // --- Query : fichiers de la consultation en cours d'édition
  const { data: editFilesData } = useQuery<ConsultationFile[]>({
    queryKey: ["consultation-files", selectedConsultation?.id],
    queryFn: () =>
      consultationsApi.getFiles(selectedConsultation!.id).then((r) => r.data),
    enabled: editOpen && !!selectedConsultation,
  });

  // --- Query : liste consultations
  const { data, isLoading } = useQuery<PageResponse<Consultation>>({
    queryKey: ["consultations", { page, size: pageSize, search, dateFrom, dateTo }],
    queryFn: () =>
      consultationsApi
        .findAll({
          page,
          size: pageSize,
          search: search || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        })
        .then((r) => r.data),
  });

  // Patients et médecins ne sont pas préchargés : leurs selects cherchent
  // directement en base (voir `RemoteSelectField`).

  // --- Query : types de consultation
  const { data: typeConsultationsData } = useQuery<TypeConsultation[]>({
    queryKey: ["type-consultations"],
    queryFn: () =>
      apiClient
        .get<PageResponse<TypeConsultation>>("/type-consultations", {
          params: { size: 1000 },
        })
        .then((r) => r.data.content),
  });

  const consultations = data?.content ?? [];
  const pageCount = data?.totalPages ?? 0;

  // Libellés des valeurs déjà posées à l'ouverture du modal d'édition.
  const editPatientOption: SelectOption | null = selectedConsultation?.patient
    ? {
        value: selectedConsultation.patientId,
        label: `${selectedConsultation.patient.code} - ${nomComplet(selectedConsultation.patient.lastname, selectedConsultation.patient.firstname)}`,
      }
    : null;

  const editDoctorOption: SelectOption | null =
    selectedConsultation?.doctorId && selectedConsultation.doctor
      ? {
          value: selectedConsultation.doctorId,
          label: nomComplet(selectedConsultation.doctor.lastname, selectedConsultation.doctor.firstname),
        }
      : null;

  const typeOptions =
    typeConsultationsData?.map((t) => ({
      value: t.id,
      label: t.name,
    })) ?? [];

  // --- Mutations
  const createMutation = useMutation({
    mutationFn: (data: ConsultationRequest) => consultationsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultations"] });
      toast.success("Consultation créée avec succès");
      setCreateOpen(false);
      createForm.reset();
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(
        err.response?.data?.message ?? "Erreur lors de la création"
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
      files,
    }: {
      id: string;
      data: Partial<ConsultationRequest>;
      files?: File[];
    }) => consultationsApi.update(id, data, files),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultations"] });
      queryClient.invalidateQueries({ queryKey: ["consultation-files"] });
      toast.success("Consultation modifiée avec succès");
      setEditOpen(false);
      setSelectedConsultation(null);
      setEditFiles([]);
      editForm.reset();
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(
        err.response?.data?.message ?? "Erreur lors de la modification"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => consultationsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultations"] });
      toast.success("Consultation supprimée avec succès");
      setDeleteTarget(null);
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(
        err.response?.data?.message ?? "Erreur lors de la suppression"
      );
    },
  });

  // --- Handlers
  function openEdit(consultation: Consultation) {
    setSelectedConsultation(consultation);
    editForm.reset({
      patientId: consultation.patientId,
      doctorId: consultation.doctorId ?? "",
      typeConsultationId: consultation.typeConsultationId ?? "",
      date: consultation.date,
      motif: consultation.motif ?? "",
      notes: consultation.notes ?? "",
      amount:
        consultation.amount != null ? String(consultation.amount) : "",
    });
    setEditFiles([]);
    setEditOpen(true);
  }

  function buildPayload(values: ConsultationFormData): ConsultationRequest {
    return {
      patientId: values.patientId,
      doctorId: values.doctorId || undefined,
      typeConsultationId: values.typeConsultationId || undefined,
      date: values.date,
      motif: values.motif || undefined,
      notes: values.notes || undefined,
      amount:
        values.amount === "" || values.amount === undefined
          ? undefined
          : Number(values.amount),
    };
  }

  function onCreateSubmit(values: ConsultationFormData) {
    createMutation.mutate(buildPayload(values));
  }

  function onEditSubmit(values: ConsultationFormData) {
    if (!selectedConsultation) return;
    updateMutation.mutate({
      id: selectedConsultation.id,
      data: buildPayload(values),
      files: editFiles.length > 0 ? editFiles : undefined,
    });
  }

  // --- Colonnes
  const columns: ColumnDef<Consultation>[] = [
    {
      header: "Patient",
      id: "patient",
      cell: ({ row }) => {
        const p = row.original.patient;
        if (!p) return "—";
        return `${p.code} — ${nomComplet(p.lastname, p.firstname)}`;
      },
    },
    {
      header: "Médecin",
      id: "doctor",
      cell: ({ row }) => {
        const d = row.original.doctor;
        if (!d) return "—";
        return nomComplet(d.lastname, d.firstname);
      },
    },
    {
      header: "Type",
      id: "type",
      cell: ({ row }) => row.original.typeConsultation?.name ?? "—",
    },
    {
      header: "Date",
      accessorKey: "date",
      cell: ({ getValue }) => formatDate(getValue<string>()),
    },
    {
      header: "Motif",
      accessorKey: "motif",
      cell: ({ row }) => {
        const motif = row.original.motif;
        if (!motif) return "—";
        return motif.length > 50 ? `${motif.slice(0, 50)}…` : motif;
      },
    },
    {
      header: "Montant",
      accessorKey: "amount",
      cell: ({ row }) =>
        row.original.amount != null
          ? formatCFA(row.original.amount)
          : "—",
    },
    {
      header: "Actions",
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <PermissionGate permission={PERMISSIONS.EDIT_CONSULTATIONS}>
            <button
              type="button"
              onClick={() => openEdit(row.original)}
              className="inline-flex items-center justify-center rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors"
              title="Modifier"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </PermissionGate>
          <PermissionGate permission={PERMISSIONS.DELETE_CONSULTATIONS}>
            <button
              type="button"
              onClick={() => setDeleteTarget(row.original)}
              className="inline-flex items-center justify-center rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600 transition-colors"
              title="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </PermissionGate>
        </div>
      ),
    },
  ];

  if (!can(PERMISSIONS.VIEW_CONSULTATIONS)) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Accès non autorisé</p>
      </div>
    );
  }

  // --- Render
  return (
    <div className="space-y-6">
      <PageHeader
        title="Consultations"
        action={
          can(PERMISSIONS.CREATE_CONSULTATIONS) ? (
            <button
              type="button"
              onClick={() => {
                createForm.reset();
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Nouvelle consultation
            </button>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {/* Filtres date */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Date début
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">
              Date fin
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(0);
              }}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setPage(0);
              }}
              className="mt-5 rounded-md border border-gray-300 bg-white px-3 py-2 text-[.9rem] text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Réinitialiser
            </button>
          )}
        </div>

        <DataTable
          columns={columns}
          data={consultations}
          isLoading={isLoading}
          pageCount={pageCount}
          pageIndex={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(0);
          }}
          searchValue={search}
          onSearchChange={(val) => {
            setSearch(val);
            setPage(0);
          }}
        />
      </div>

      {/* Modal création */}
      <CrudModal
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          createForm.reset();
        }}
        title="Nouvelle consultation"
        size="lg"
        onSubmit={createForm.handleSubmit(onCreateSubmit)}
        submitLabel="Ajouter une consultation"
        isSubmitting={createMutation.isPending}
      >
        <ConsultationForm form={createForm} typeOptions={typeOptions} />
      </CrudModal>

      {/* Modal édition */}
      <CrudModal
        isOpen={editOpen}
        onClose={() => {
          setEditOpen(false);
          setSelectedConsultation(null);
          setEditFiles([]);
          editForm.reset();
        }}
        title="Modifier la consultation"
        size="lg"
        onSubmit={editForm.handleSubmit(onEditSubmit)}
        submitLabel="Mettre à jour"
        isSubmitting={updateMutation.isPending}
      >
        <ConsultationForm
          form={editForm}
          initialPatientOption={editPatientOption}
          initialDoctorOption={editDoctorOption}
          typeOptions={typeOptions}
          showFiles
          existingFiles={editFilesData ?? []}
          onFilesChange={setEditFiles}
        />
      </CrudModal>

      {/* Modal confirmation suppression */}
      <ConfirmModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
        title="Supprimer cette consultation"
        message={
          deleteTarget
            ? `Voulez-vous vraiment supprimer la consultation du ${formatDate(deleteTarget.date)} ? Cette action est irréversible.`
            : ""
        }
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
