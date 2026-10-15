"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { LimitedSelect as Select } from "@/components/ui/LimitedSelect";
import { Button } from "@/components/ui/Button";
import { RemoteSelectField } from "@/components/ui/RemoteSelectField";
import type { SelectOption } from "@/components/ui/FormSelect";
import {
  loadDoctorOptions,
  loadHospitalOptions,
  loadPatientOptions,
  loadTestOrderOptions,
} from "@/lib/api/optionLoaders";
import type { TestOrderOption } from "@/lib/api/optionLoaders";
import type { AxiosError } from "axios";


import { PageHeader } from "@/components/ui/PageHeader";
import { FormToggle } from "@/components/ui/FormToggle";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { testOrdersApi, type TestOrderRequest } from "@/lib/api/testOrders";
import { openDocFile } from "@/lib/api/docs";
import { typeOrdersApi, type TypeOrder } from "@/lib/api/examens";
import { usersApi } from "@/lib/api/users";
import type { User } from "@/types/auth";
import type { ApiError as ApiErrorType } from "@/types/api";
import apiClient from "@/lib/api/client";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";
import { nomComplet } from "@/lib/utils";

/** « Affecter à » = utilisateur ayant le rôle docteur (signataire), comme Laravel. */
function isDoctorRole(name?: string): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return (
    n.includes("docteur") ||
    n.includes("doctor") ||
    n.includes("medecin") ||
    n.includes("médecin") ||
    n.includes("anapath") ||
    n.includes("anatomopath")
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContractOption {
  id: string;
  name: string;
}

/** Recherche des demandes d'examen (toutes) pour la référence Immuno Interne. */
const loadTestOrderReferences = loadTestOrderOptions();

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const editOrderSchema = z.object({
  // Mêmes champs obligatoires que le formulaire d'ajout.
  typeOrderId: z.string().min(1, "Le type d'examen est requis"),
  contratId: z.string().min(1, "Le contrat est requis"),
  patientId: z.string().min(1, "Le patient est requis"),
  // Facultatif, comme à la création : une demande enregistrée sans médecin
  // doit pouvoir être rouverte et complétée. L'exiger ici aurait rendu
  // impossible la correction même des demandes qu'on venait d'autoriser.
  doctorId: z.string().optional(),
  hospitalId: z.string().min(1, "L'hôpital est requis"),
  referenceHopital: z.string().optional(),
  examenReferenceInput: z.string().optional(),
  examenReferenceOrderId: z.string().optional(),
  prelevementDate: z.string().min(1, "La date de prélèvement est requise"),
  isUrgent: z.boolean(),
  // « Affecter à » (docteur signataire) et « Option d'envoi des résultats ».
  attribuateDoctorId: z.string().optional(),
  option: z.string().optional(), // "0" = Appel, "1" = SMS
  // Qui paie : le patient par défaut, sinon un tiers saisi librement (cf. le
  // formulaire d'ajout). Décocher remet la facturation au patient.
  factureAUnTiers: z.boolean().optional(),
  factureANom: z.string().optional(),
  factureAAdresse: z.string().optional(),
  factureAIfu: z.string().optional(),
}).refine(
  (d) => !d.factureAUnTiers || Boolean(d.factureANom?.trim()),
  { path: ["factureANom"], message: "Le nom de l'établissement est requis" },
);

type EditOrderFormData = z.infer<typeof editOrderSchema>;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface EditPageProps {
  params: Promise<{ id: string }>;
}

export default function TestOrderEditPage({ params }: EditPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EditOrderFormData>({
    resolver: zodResolver(editOrderSchema),
    defaultValues: {
      isUrgent: false,
      factureAUnTiers: false,
    },
  });

  // Libellé de la demande de référence Immuno Interne déjà sélectionnée.
  const [referenceOrderOption, setReferenceOrderOption] =
    useState<TestOrderOption | null>(null);

  // Pièce jointe (examen_file de Laravel) : nouveau fichier à téléverser (le fichier
  // déjà attaché est lu depuis order.archive).
  const [examenFile, setExamenFile] = useState<File | null>(null);

  // Watch type d'examen pour les champs conditionnels Immuno.
  const selectedTypeOrderId = watch("typeOrderId");
  const factureAUnTiers = watch("factureAUnTiers");

  // --- Query : demande existante
  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ["test-order", id],
    queryFn: () => testOrdersApi.findById(id).then((r) => r.data),
    enabled: !!id,
  });

  // Préremplir le formulaire dès que la demande est chargée
  useEffect(() => {
    if (!order) return;
    reset({
      typeOrderId: order.typeOrderId ?? "",
      contratId: order.contratId ?? "",
      patientId: order.patientId,
      doctorId: order.doctorId ?? "",
      hospitalId: order.hospitalId ?? "",
      referenceHopital: order.referenceHopital ?? "",
      // Examen de référence pré-rempli depuis test_affiliate, pour externe (texte)
      // comme interne (le select affiche la valeur enregistrée, modifiable).
      examenReferenceInput: order.testAffiliate ?? "",
      examenReferenceOrderId: order.testAffiliate ?? "",
      prelevementDate: order.prelevementDate ?? "",
      isUrgent: order.isUrgent,
      attribuateDoctorId: order.attribuateDoctorId ?? order.assignedToUserId ?? "",
      option: order.option == null ? "" : order.option ? "1" : "0",
      factureAUnTiers: Boolean(order.factureANom),
      factureANom: order.factureANom ?? "",
      factureAAdresse: order.factureAAdresse ?? "",
      factureAIfu: order.factureAIfu ?? "",
    });
    // Interne : amorce l'option affichée du select avec la référence enregistrée
    // (test_affiliate = code). Le champ montre donc la valeur courante, et
    // rechoisir une demande la remplace.
    setReferenceOrderOption(
      order.testAffiliate
        ? ({
            value: order.testAffiliate,
            label: order.testAffiliate,
            order: { code: order.testAffiliate },
          } as unknown as TestOrderOption)
        : null
    );
  }, [order, reset]);

  // --- Options déjà sélectionnées à l'ouverture : les listes (patients,
  // médecins, hôpitaux) sont trop grandes pour être préchargées, on reconstruit
  // le libellé depuis la demande elle-même.
  const initialPatientOption: SelectOption | null = order
    ? {
        value: order.patientId,
        label: `${order.patientFirstname} ${order.patientLastname}`.trim(),
      }
    : null;

  const initialDoctorOption: SelectOption | null =
    order?.doctorId && order.doctorName
      ? { value: order.doctorId, label: order.doctorName }
      : null;

  const initialHospitalOption: SelectOption | null =
    order?.hospitalId && order.hospitalName
      ? { value: order.hospitalId, label: order.hospitalName }
      : null;

  // --- Queries (référentiels)
  const { data: contractsData } = useQuery<ContractOption[]>({
    queryKey: ["contracts-active"],
    queryFn: async () => {
      const res = await apiClient.get<{ content: ContractOption[] }>(
        "/contracts",
        { params: { size: 1000, status: "ACTIF" } }
      );
      return res.data.content;
    },
  });

  const { data: typeOrdersData } = useQuery<TypeOrder[]>({
    queryKey: ["type-orders"],
    queryFn: () => typeOrdersApi.findAll().then((r) => r.data),
  });

  // Utilisateurs ayant le rôle docteur → select « Affecter à » (signataire).
  const { data: doctorUsersData } = useQuery({
    queryKey: ["users-doctors"],
    queryFn: () =>
      usersApi.findAll({ size: 500 }).then((r) => r.data.content as User[]),
  });
  const doctorUserOptions =
    (doctorUsersData ?? [])
      .filter((u) => (u.roles ?? []).some((r) => isDoctorRole(r.name)))
      .map((u) => ({
        value: u.id,
        label: nomComplet(u.lastname, u.firstname),
      })) ?? [];

  // Options React Select

  const contractOptions =
    contractsData?.map((c) => ({
      value: c.id,
      label: c.name,
    })) ?? [];

  const typeOrderOptions =
    typeOrdersData
      ?.filter((t) => t.id !== "1")
      .map((t) => ({
        value: t.id,
        label: t.title,
      })) ?? [];

  // Détection du type sélectionné pour afficher les champs Immuno (même logique
  // que le formulaire d'ajout) : insensible à la casse et aux accents.
  const selectedTypeOrder = typeOrdersData?.find(
    (t) => t.id === selectedTypeOrderId
  );
  const normalizedTypeTitle = (selectedTypeOrder?.title ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const isImmunoExterne = normalizedTypeTitle.includes("immuno externe");
  const isImmunoInterne = normalizedTypeTitle.includes("immuno interne");

  // --- Mutation mise à jour
  const updateMutation = useMutation({
    mutationFn: (data: TestOrderRequest) => testOrdersApi.update(id, data),
    onSuccess: async () => {
      // Téléverser la nouvelle pièce jointe si un fichier a été choisi.
      if (examenFile) {
        try {
          await testOrdersApi.uploadArchive(id, examenFile);
        } catch {
          toast.error("Demande mise à jour, mais échec de l'envoi de la pièce jointe");
        }
      }
      // La page détails lit la demande depuis le cache react-query : sans
      // invalidation elle affichait l'ancienne version (pièce jointe absente)
      // jusqu'à un rechargement manuel. On attend le refetch avant de naviguer
      // pour que la page s'ouvre déjà à jour.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["test-order", id] }),
        queryClient.invalidateQueries({ queryKey: ["test-order-images", id] }),
        queryClient.invalidateQueries({ queryKey: ["test-orders"] }),
      ]);
      toast.success("Demande mise à jour avec succès");
      router.push(`/test-orders/${id}/details`);
    },
    onError: (err: AxiosError<ApiErrorType>) => {
      toast.error(
        err.response?.data?.message ?? "Erreur lors de la mise à jour"
      );
    },
  });

  const onSubmit = (data: EditOrderFormData) => {
    const payload: TestOrderRequest = {
      patientId: data.patientId,
      prelevementDate: data.prelevementDate,
      isUrgent: data.isUrgent,
    };

    if (data.typeOrderId) payload.typeOrderId = data.typeOrderId;
    if (data.contratId) payload.contratId = data.contratId;
    if (data.doctorId) payload.doctorId = data.doctorId;
    if (data.hospitalId) payload.hospitalId = data.hospitalId;
    if (data.referenceHopital) payload.referenceHopital = data.referenceHopital;
    // Toujours transmis : le serveur efface le tiers quand le nom est vide,
    // c'est ce qui permet de revenir à une facturation au patient.
    payload.factureANom = data.factureAUnTiers ? data.factureANom?.trim() : "";
    payload.factureAAdresse = data.factureAUnTiers
      ? data.factureAAdresse?.trim() || undefined
      : undefined;
    payload.factureAIfu = data.factureAUnTiers
      ? data.factureAIfu?.trim() || undefined
      : undefined;
    // « Affecter à » → docteur signataire (le backend aligne attribuateDoctorId
    // ET assignedToUserId sur cet utilisateur).
    if (data.attribuateDoctorId)
      payload.assignedToUserId = data.attribuateDoctorId;
    // Option d'envoi des résultats : "0" = Appel (false), "1" = SMS (true).
    if (data.option === "0" || data.option === "1")
      payload.option = data.option === "1";
    // Examen de référence → colonne test_affiliate. Externe : texte. Interne :
    // code de la demande nouvellement choisie, sinon on conserve la valeur existante.
    if (isImmunoExterne && data.examenReferenceInput)
      payload.testAffiliate = data.examenReferenceInput;
    if (isImmunoInterne)
      payload.testAffiliate =
        referenceOrderOption?.order.code ?? order?.testAffiliate ?? "";

    // Le PUT remplace l'intégralité de la demande, examens compris.
    // On réinjecte donc les examens existants pour ne pas les effacer
    // (ils sont gérés sur la page "détails", pas dans ce formulaire).
    if (order?.details?.length) {
      payload.details = order.details.map((d) => ({
        labTestId: d.labTestId,
        price: d.price,
        discount: d.discount,
      }));
    }

    updateMutation.mutate(payload);
  };

  if (orderLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Modifier la demande d'examen"
        breadcrumbs={[
          { label: "Accueil", href: "/home" },
          { label: "Demandes d'examen", href: "/test-orders" },
          { label: `Modifier #${order?.code ?? id}` },
        ]}
      />

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Disposition alignée sur Laravel : 2 colonnes en grand écran (md+),
              empilé en petit écran. */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* 1. Type d'examen */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Type d&apos;examen <span className="text-red-500">*</span>
              </label>
              <Controller
                name="typeOrderId"
                control={control}
                render={({ field }) => (
                  <Select
                    instanceId="order-type"
                    inputId="typeOrderId"
                    options={typeOrderOptions}
                    placeholder="Sélectionner un type..."
                    value={
                      typeOrderOptions.find((o) => o.value === field.value) ??
                      null
                    }
                    onChange={(opt) => field.onChange(opt?.value ?? "")}
                    isClearable
                    classNamePrefix="react-select"
                  />
                )}
              />
              {errors.typeOrderId && (
                <p className="text-xs text-red-500">
                  {errors.typeOrderId.message}
                </p>
              )}
            </div>

            {/* 2. Contrat */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Contrat <span className="text-red-500">*</span>
              </label>
              <Controller
                name="contratId"
                control={control}
                render={({ field }) => (
                  <Select
                    instanceId="order-contract"
                    inputId="contratId"
                    options={contractOptions}
                    placeholder="Sélectionner un contrat..."
                    value={
                      contractOptions.find((o) => o.value === field.value) ??
                      null
                    }
                    onChange={(opt) => field.onChange(opt?.value ?? "")}
                    isClearable
                    classNamePrefix="react-select"
                  />
                )}
              />
              {errors.contratId && (
                <p className="text-xs text-red-500">
                  {errors.contratId.message}
                </p>
              )}
            </div>

            {/* Examen de référence (conditionnel Immuno) — pleine largeur sous la
                ligne Type/Contrat, comme le formulaire d'ajout. */}
            {isImmunoExterne && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 md:col-span-2">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">
                    Examen de Référence
                  </label>
                  <input
                    type="text"
                    {...register("examenReferenceInput")}
                    placeholder="Référence de l'examen externe..."
                    className={inputClass}
                  />
                  {errors.examenReferenceInput && (
                    <p className="text-xs text-red-500">
                      {errors.examenReferenceInput.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {isImmunoInterne && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 md:col-span-2">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">
                    Demande d&apos;examen de référence
                  </label>
                  <Controller
                    name="examenReferenceOrderId"
                    control={control}
                    render={({ field }) => (
                      <RemoteSelectField
                        id="examenReferenceOrderId"
                        loadOptions={loadTestOrderReferences}
                        value={field.value || null}
                        onChange={(v, opt) => {
                          field.onChange(v ?? "");
                          setReferenceOrderOption(opt);
                        }}
                        selectedOption={referenceOrderOption}
                        placeholder="Rechercher une demande de référence (code, patient)..."
                        isClearable
                      />
                    )}
                  />
                  {errors.examenReferenceOrderId && (
                    <p className="text-xs text-red-500">
                      {errors.examenReferenceOrderId.message}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* 3. Patient */}
            <div className="flex flex-col gap-1">
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
                <p className="text-xs text-red-500">
                  {errors.patientId.message}
                </p>
              )}
            </div>

            {/* 4. Médecin traitant */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Médecin traitant{" "}
                <span className="font-normal text-gray-500">
                  — peut être renseigné plus tard
                </span>
              </label>
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

            {/* 5. Hôpital de provenance */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Hôpital de provenance <span className="text-red-500">*</span>
              </label>
              <Controller
                name="hospitalId"
                control={control}
                render={({ field }) => (
                  <RemoteSelectField
                    id="hospitalId"
                    loadOptions={loadHospitalOptions}
                    value={field.value || null}
                    onChange={(v) => field.onChange(v ?? "")}
                    selectedOption={initialHospitalOption}
                    placeholder="Rechercher un hôpital..."
                    isClearable
                  />
                )}
              />
            </div>

            {/* 6. Référence hôpital */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Référence hôpital
              </label>
              <input
                type="text"
                {...register("referenceHopital")}
                placeholder="Numéro de référence..."
                className={inputClass}
              />
            </div>

            {/* 7. Date prélèvement */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Date prélèvement <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                {...register("prelevementDate")}
                className={inputClass}
              />
              {errors.prelevementDate && (
                <p className="text-xs text-red-500">
                  {errors.prelevementDate.message}
                </p>
              )}
            </div>

            {/* Pièce jointe — colonne droite de « Date prélèvement », comme Laravel. */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Pièce jointe
              </label>
              {order?.archive && (
                <button
                  type="button"
                  onClick={() => openDocFile({ fileId: order.archiveFileId, path: order.archive })}
                  className="mb-1 inline-flex w-fit items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
                >
                  Pièce jointe actuelle — ouvrir
                </button>
              )}
              <input
                type="file"
                onChange={(e) => setExamenFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {order?.archive && (
                <p className="text-xs text-gray-400">
                  Choisir un fichier remplace la pièce jointe actuelle.
                </p>
              )}
            </div>

            {/* 8. Cas urgent — ligne dédiée, colonne gauche (comme l'ajout ;
                l'emplacement de « Pièce jointe » reste vide). */}
            <div className="flex flex-col gap-2 md:col-start-1">
              <label className="text-sm font-medium text-gray-700">
                Cas urgent
              </label>
              <Controller
                name="isUrgent"
                control={control}
                render={({ field }) => (
                  <FormToggle
                    id="isUrgent-edit"
                    label={field.value ? "Urgent" : "Normal"}
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>

            {/* Qui sera facturé — mêmes règles qu'à l'ajout. */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">
                Facturer à
              </label>
              <Controller
                name="factureAUnTiers"
                control={control}
                render={({ field }) => (
                  <FormToggle
                    id="factureAUnTiers-edit"
                    label={field.value ? "Un établissement" : "Le patient"}
                    checked={Boolean(field.value)}
                    onChange={field.onChange}
                  />
                )}
              />
            </div>

            {factureAUnTiers && (
              <div className="grid gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4 md:col-span-2 md:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">
                    Nom de l&apos;établissement
                  </label>
                  <input
                    type="text"
                    {...register("factureANom")}
                    placeholder="Clinique, société, assurance…"
                    className={inputClass}
                  />
                  {errors.factureANom && (
                    <p className="text-xs text-red-600">
                      {errors.factureANom.message}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">
                    Adresse
                  </label>
                  <input
                    type="text"
                    {...register("factureAAdresse")}
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">
                    IFU
                  </label>
                  <input
                    type="text"
                    {...register("factureAIfu")}
                    className={inputClass}
                  />
                </div>
              </div>
            )}

            {/* Affecter à (docteur signataire) — calque Laravel edit.blade */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Affecter à
              </label>
              <Controller
                name="attribuateDoctorId"
                control={control}
                render={({ field }) => (
                  <Select
                    instanceId="order-signataire"
                    inputId="attribuateDoctorId"
                    options={doctorUserOptions}
                    placeholder="Sélectionnez un docteur signataire"
                    value={
                      doctorUserOptions.find((o) => o.value === field.value) ??
                      null
                    }
                    onChange={(opt) => field.onChange(opt?.value ?? "")}
                    isClearable
                    classNamePrefix="react-select"
                  />
                )}
              />
            </div>

            {/* Option d'envoi des résultats — Appel / SMS */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Option d&apos;envoi des résultats
              </label>
              <NativeSelect
                value={watch("option") ?? ""}
                onChange={(e) => setValue("option", e.target.value)}
                placeholder="Sélectionner une option d'envoi"
              >
                <option value="">Sélectionner une option d&apos;envoi</option>
                <option value="0">Appel</option>
                <option value="1">SMS</option>
              </NativeSelect>
            </div>

          </div>

          {/* Boutons */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Annuler
            </button>
            <Button type="submit" loading={updateMutation.isPending}>
              Mettre à jour
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
