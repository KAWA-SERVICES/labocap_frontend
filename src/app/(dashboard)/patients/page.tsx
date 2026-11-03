"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useForm,
  type UseFormRegister,
  type FieldErrors,
  type Control,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, Pencil, Trash2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { AxiosError } from "axios";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/common/DataTable";
import {
  RowActions,
  RowActionsProvider,
  type RowAction,
} from "@/components/ui/RowActions";
import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { PageHeader } from "@/components/ui/PageHeader";
import { RHFCreatableSelect } from "@/components/ui/RHFCreatableSelect";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCFA, generatePatientCode, nomComplet } from "@/lib/utils";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { LANGUE_OPTIONS } from "@/lib/constants/patient";
import { patientsApi, Patient, PatientRequest } from "@/lib/api/patients";
import type { PageResponse, ApiError } from "@/types/api";
import type { UseFormWatch, UseFormSetValue } from "react-hook-form";
import { INPUT_CLASS as fieldInput } from "@/lib/ui/inputClass";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const patientSchema = z.object({
  lastname: z.string().min(1, "Le nom est requis"),
  firstname: z.string().min(1, "Le prénom est requis"),
  genre: z.string().min(1, "Le genre est requis"),
  langue: z.string().min(1, "La langue est requise"),
  birthday: z.string().optional(),
  age: z.string().min(1, "L'âge est requis"),
  yearOrMonth: z.string().min(1, "L'unité d'âge est requise"),
  profession: z.string().optional(),
  // Facultatif et sans format imposé, à la demande du client : tous les patients
  // n'ont pas de numéro, et ceux qui en ont l'écrivent librement (indicatif,
  // second numéro entre parenthèses, mention « fils de… »). Ni le backend ni la
  // base ne l'exigeaient : la contrainte n'existait qu'ici.
  telephone1: z.string().optional(),
  telephone2: z.string().optional(),
  adresse: z.string().min(1, "L'adresse est requise"),
});

type PatientFormData = z.infer<typeof patientSchema>;

// ---------------------------------------------------------------------------
// Form fields component (shared by create & edit modals)
// ---------------------------------------------------------------------------

interface PatientFormFieldsProps {
  register: UseFormRegister<PatientFormData>;
  control: Control<PatientFormData>;
  errors: FieldErrors<PatientFormData>;
  /** Code patient généré automatiquement, affiché en lecture seule. */
  code: string;
  watch: UseFormWatch<PatientFormData>;
  setValue: UseFormSetValue<PatientFormData>;
}

const GENRE_OPTIONS = [
  { value: "M", label: "Masculin" },
  { value: "F", label: "Féminin" },
];

const YEAR_OR_MONTH_OPTIONS = [
  { value: "false", label: "Mois" },
  { value: "true", label: "Ans" },
];

/**
 * Âge en années révolues à partir d'une date de naissance ISO.
 * Renvoie `null` si la date est absente, invalide ou dans le futur.
 */
function calculerAge(birthday?: string): number | null {
  if (!birthday) return null;
  const naissance = new Date(birthday);
  if (Number.isNaN(naissance.getTime())) return null;
  const today = new Date();
  if (naissance > today) return null;
  let age = today.getFullYear() - naissance.getFullYear();
  const moisEcoule =
    today.getMonth() - naissance.getMonth() ||
    today.getDate() - naissance.getDate();
  if (moisEcoule < 0) age -= 1;
  return age >= 0 ? age : null;
}


function PatientFormFields({
  register,
  control,
  errors,
  code,
  watch,
  setValue,
}: PatientFormFieldsProps) {
  // Âge déduit de la date de naissance dès qu'elle est saisie : les deux champs
  // coexistaient et pouvaient se contredire. On garde l'âge modifiable quand
  // aucune date n'est donnée — c'est le cas de 99,7 % des fiches existantes,
  // le laboratoire relevant l'âge et rarement la date de naissance.
  const birthday = watch("birthday");
  const ageCalcule = useMemo(() => calculerAge(birthday), [birthday]);

  useEffect(() => {
    if (ageCalcule != null) {
      setValue("age", String(ageCalcule), { shouldValidate: true });
      // Une date de naissance implique un âge exprimé en années.
      setValue("yearOrMonth", "true");
    }
  }, [ageCalcule, setValue]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {/* 1. Code (readonly) — pleine largeur en haut, comme Laravel */}
      <div className="sm:col-span-2 flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Code</label>
        <input
          type="text"
          value={code}
          readOnly
          className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2 text-[.9rem] text-gray-500 cursor-not-allowed"
        />
      </div>

      {/* 2. Nom */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Nom <span className="text-red-500">*</span>
        </label>
        <input type="text" {...register("lastname")} className={fieldInput} />
        {errors.lastname && (
          <p className="text-xs text-red-500">{errors.lastname.message}</p>
        )}
      </div>

      {/* 3. Prénom */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Prénom <span className="text-red-500">*</span>
        </label>
        <input type="text" {...register("firstname")} className={fieldInput} />
        {errors.firstname && (
          <p className="text-xs text-red-500">{errors.firstname.message}</p>
        )}
      </div>

      {/* 4. Genre */}
      <RHFCreatableSelect
        control={control}
        name="genre"
        label="Genre"
        required
        options={GENRE_OPTIONS}
        placeholder="Sélectionner le genre"
        error={errors.genre?.message}
      />

      {/* 5. Langue */}
      <RHFCreatableSelect
        control={control}
        name="langue"
        label="Langue"
        required
        options={LANGUE_OPTIONS}
        placeholder="Sélectionner une langue"
        error={errors.langue?.message}
      />

      {/* 6. Date de naissance */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Date de naissance
        </label>
        <input type="date" {...register("birthday")} className={fieldInput} />
      </div>

      {/* 7. Âge */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Âge <span className="text-red-500">*</span>
        </label>
        <input
          type="number"
          min={0}
          {...register("age")}
          readOnly={ageCalcule != null}
          className={`${fieldInput} ${ageCalcule != null ? "bg-gray-50 text-gray-600" : ""}`}
        />
        {ageCalcule != null && (
          <p className="text-xs text-gray-500">
            Calculé depuis la date de naissance
          </p>
        )}
        {errors.age && (
          <p className="text-xs text-red-500">{errors.age.message}</p>
        )}
      </div>

      {/* 8. Mois ou Années */}
      <RHFCreatableSelect
        control={control}
        name="yearOrMonth"
        label="Mois ou Années"
        required
        options={YEAR_OR_MONTH_OPTIONS}
        placeholder="Mois ou Ans"
        error={errors.yearOrMonth?.message}
      />

      {/* 9. Profession */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Profession</label>
        <input type="text" {...register("profession")} className={fieldInput} />
      </div>

      {/* 10. Téléphone 1 */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Téléphone 1</label>
        {/* `text` et non `tel` : sur mobile, `tel` ouvre un pavé numérique d'où
            une lettre ou un « + » ne se saisit pas — la valeur les accepterait,
            mais le clavier les rend inatteignables. */}
        <input
          type="text"
          placeholder="97000000"
          {...register("telephone1")}
          className={fieldInput}
        />
        {errors.telephone1 && (
          <p className="text-xs text-red-500">{errors.telephone1.message}</p>
        )}
      </div>

      {/* 11. Téléphone 2 */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">Téléphone 2</label>
        <input type="text" {...register("telephone2")} className={fieldInput} />
      </div>

      {/* 12. Adresse — pleine largeur (comme Laravel) */}
      <div className="sm:col-span-2 flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">
          Adresse <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={2}
          {...register("adresse")}
          className={`${fieldInput} resize-none`}
        />
        {errors.adresse && (
          <p className="text-xs text-red-500">{errors.adresse.message}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PatientsPage() {
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  // --- Pagination & search state
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  // Recherche débouncée (~350 ms) : évite une requête à chaque frappe.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // --- Modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Patient | null>(null);
  // Code patient généré (format Laravel : 10 caractères hexadécimaux minuscules).
  // Régénéré à chaque ouverture de la modale de création.
  const [generatedCode, setGeneratedCode] = useState("");

  // --- Create form
  const {
    register: registerCreate,
    control: controlCreate,
    watch: watchCreate,
    setValue: setValueCreate,
    handleSubmit: handleSubmitCreate,
    formState: { errors: createErrors },
    reset: resetCreate,
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      genre: "",
      langue: "",
      yearOrMonth: "true",
    },
  });

  // --- Edit form
  const {
    register: registerEdit,
    control: controlEdit,
    watch: watchEdit,
    setValue: setValueEdit,
    handleSubmit: handleSubmitEdit,
    formState: { errors: editErrors },
    reset: resetEdit,
  } = useForm<PatientFormData>({
    resolver: zodResolver(patientSchema),
  });

  // --- Query
  const { data, isLoading } = useQuery<PageResponse<Patient>>({
    queryKey: ["patients", { page, size: pageSize, search: debouncedSearch }],
    queryFn: () =>
      patientsApi
        .findAll({ page, size: pageSize, search: debouncedSearch || undefined })
        .then((r) => r.data),
  });

  const patients = data?.content ?? [];
  const pageCount = data?.totalPages ?? 0;

  // --- Mutations
  const createMutation = useMutation({
    mutationFn: (data: PatientRequest) => patientsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Patient créé avec succès");
      setCreateOpen(false);
      resetCreate();
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(err.response?.data?.message ?? "Erreur lors de la création");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PatientRequest }) =>
      patientsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Patient modifié avec succès");
      setEditOpen(false);
      setSelectedPatient(null);
      resetEdit();
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(
        err.response?.data?.message ?? "Erreur lors de la modification"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => patientsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      toast.success("Patient supprimé avec succès");
      setDeleteConfirm(null);
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(
        err.response?.data?.message ?? "Erreur lors de la suppression"
      );
    },
  });

  // --- Handlers
  const handleOpenEdit = (patient: Patient) => {
    setSelectedPatient(patient);
    resetEdit({
      lastname: patient.lastname,
      firstname: patient.firstname,
      genre: patient.genre,
      langue: patient.langue,
      birthday: patient.birthday ?? "",
      age: patient.age != null ? String(patient.age) : "",
      yearOrMonth:
        patient.yearOrMonth === undefined
          ? ""
          : patient.yearOrMonth
          ? "true"
          : "false",
      profession: patient.profession ?? "",
      telephone1: patient.telephone1,
      telephone2: patient.telephone2 ?? "",
      adresse: patient.adresse,
    });
    setEditOpen(true);
  };

  const handleOpenCreate = () => {
    setGeneratedCode(generatePatientCode());
    resetCreate({ genre: "", langue: "", yearOrMonth: "true" });
    setCreateOpen(true);
  };

  const handleCloseCreate = () => {
    setCreateOpen(false);
    resetCreate();
  };

  const handleCloseEdit = () => {
    setEditOpen(false);
    setSelectedPatient(null);
    resetEdit();
  };

  const onCreateSubmit = (formData: PatientFormData) => {
    const payload: PatientRequest = {
      code: generatedCode || generatePatientCode(),
      lastname: formData.lastname,
      firstname: formData.firstname,
      genre: formData.genre,
      langue: formData.langue,
      birthday: formData.birthday || undefined,
      age: Number(formData.age),
      yearOrMonth: formData.yearOrMonth ? formData.yearOrMonth === "true" : undefined,
      profession: formData.profession || undefined,
      // Champ vide → absent du payload, comme `telephone2` et les autres
      // facultatifs : on enregistre l'absence de numéro, pas une chaîne vide.
      telephone1: formData.telephone1 || undefined,
      telephone2: formData.telephone2 || undefined,
      adresse: formData.adresse,
    };
    createMutation.mutate(payload);
  };

  const onEditSubmit = (formData: PatientFormData) => {
    if (!selectedPatient) return;
    const payload: PatientRequest = {
      code: selectedPatient.code,
      lastname: formData.lastname,
      firstname: formData.firstname,
      genre: formData.genre,
      langue: formData.langue,
      birthday: formData.birthday || undefined,
      age: Number(formData.age),
      yearOrMonth: formData.yearOrMonth ? formData.yearOrMonth === "true" : undefined,
      profession: formData.profession || undefined,
      // Champ vide → absent du payload, comme `telephone2` et les autres
      // facultatifs : on enregistre l'absence de numéro, pas une chaîne vide.
      telephone1: formData.telephone1 || undefined,
      telephone2: formData.telephone2 || undefined,
      adresse: formData.adresse,
    };
    updateMutation.mutate({ id: selectedPatient.id, data: payload });
  };

  // --- Columns
  const columns: ColumnDef<Patient>[] = [
    {
      header: "Code",
      accessorKey: "code",
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-mono text-xs">{row.original.code ?? "—"}</span>
      ),
    },
    {
      header: "Nom & Prénoms",
      id: "fullname",
      accessorFn: (row) => nomComplet(row.lastname, row.firstname),
      enableSorting: true,
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">
          {nomComplet(row.original.lastname, row.original.firstname)}
        </span>
      ),
    },
    {
      header: "Contacts",
      id: "contacts",
      accessorFn: (row) =>
        [row.telephone1, row.telephone2].filter(Boolean).join(" / "),
      enableSorting: true,
      cell: ({ row }) =>
        [row.original.telephone1, row.original.telephone2]
          .filter(Boolean)
          .join(" / ") || "—",
    },
    {
      header: "Total",
      accessorKey: "totalInvoiced",
      enableSorting: true,
      cell: ({ row }) => formatCFA(row.original.totalInvoiced ?? 0),
    },
    {
      header: "Paye",
      accessorKey: "totalPaid",
      enableSorting: true,
      cell: ({ row }) => formatCFA(row.original.totalPaid ?? 0),
    },
    {
      header: "Due",
      accessorKey: "totalUnpaid",
      enableSorting: true,
      cell: ({ row }) => formatCFA(row.original.totalUnpaid ?? 0),
    },
    {
      header: "Actions",
      id: "actions",
      enableSorting: false,
      cell: ({ row }) => {
        const patient = row.original;
        const actions: RowAction[] = [
          {
            label: "Voir le profil",
            icon: <Eye className="h-3.5 w-3.5" />,
            href: `/patients/${patient.id}`,
          },
        ];

        if (can(PERMISSIONS.EDIT_PATIENTS)) {
          actions.push({
            label: "Modifier",
            icon: <Pencil className="h-3.5 w-3.5" />,
            variant: "edit",
            onClick: () => handleOpenEdit(patient),
          });
        }

        if (can(PERMISSIONS.DELETE_PATIENTS)) {
          actions.push({
            label: "Supprimer",
            icon: <Trash2 className="h-3.5 w-3.5" />,
            variant: "delete",
            onClick: () => setDeleteConfirm(patient),
          });
        }

        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Patients"
        action={
          can(PERMISSIONS.CREATE_PATIENTS) ? (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Ajouter un nouveau patient
            </button>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {/* Barre de recherche + compteur (cohérent avec Hôpitaux/Médecins) */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              placeholder="Rechercher (code, nom, prénom, téléphone, email)..."
              className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="text-sm text-gray-500">
            {data?.totalElements ?? 0} patient{(data?.totalElements ?? 0) > 1 ? "s" : ""} au total
          </div>
        </div>

        {/* Jusqu'à trois actions : le tableau replie uniformément. */}
        <RowActionsProvider collapse>
          <DataTable
            columns={columns}
            data={patients}
            isLoading={isLoading}
            pageCount={pageCount}
            pageIndex={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        </RowActionsProvider>
      </div>

      {/* ================================================================
          Modal Création
      ================================================================ */}
      <CrudModal
        isOpen={createOpen}
        onClose={handleCloseCreate}
        title="Ajouter un nouveau patient"
        size="xl"
        onSubmit={handleSubmitCreate(onCreateSubmit)}
        submitLabel="Ajouter un nouveau patient"
        isSubmitting={createMutation.isPending}
      >
        <PatientFormFields
          register={registerCreate}
          control={controlCreate}
          errors={createErrors}
          code={generatedCode}
          watch={watchCreate}
          setValue={setValueCreate}
        />
      </CrudModal>

      {/* ================================================================
          Modal Édition
      ================================================================ */}
      <CrudModal
        isOpen={editOpen}
        onClose={handleCloseEdit}
        title="Modifier le patient"
        size="xl"
        onSubmit={handleSubmitEdit(onEditSubmit)}
        submitLabel="Modifier"
        isSubmitting={updateMutation.isPending}
      >
        <PatientFormFields
          register={registerEdit}
          control={controlEdit}
          errors={editErrors}
          code={selectedPatient?.code ?? ""}
          watch={watchEdit}
          setValue={setValueEdit}
        />
      </CrudModal>

      {/* ================================================================
          Confirm suppression
      ================================================================ */}
      <ConfirmModal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) deleteMutation.mutate(deleteConfirm.id);
        }}
        title="Supprimer ce patient"
        message={
          deleteConfirm
            ? `Voulez-vous vraiment supprimer ${nomComplet(deleteConfirm.lastname, deleteConfirm.firstname)} ? Cette action est irréversible.`
            : ""
        }
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
