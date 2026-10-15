"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LimitedSelect as Select } from "@/components/ui/LimitedSelect";
import { Button } from "@/components/ui/Button";
import { Pencil, Trash2, ImagePlus, Eye, FileText, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { AxiosError } from "axios";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/common/DataTable";
import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { formatCFA, formatDate } from "@/lib/utils";
import {
  testOrdersApi,
  type TestOrder,
  type TestOrderDetail,
  type ImageDto,
  type TestOrderRequest,
} from "@/lib/api/testOrders";
import { labTestsApi, type LabTest } from "@/lib/api/examens";
import type { ApiError } from "@/types/api";
import { getApiErrorMessage } from "@/lib/api/errorMessages";
import { openDocFile } from "@/lib/api/docs";
import { SELECT_CONTROL_MIN_HEIGHT } from "@/components/ui/selectStyles";
import { PriseEnCharge } from "./PriseEnCharge";

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------

interface SelectOption {
  value: string;
  label: string;
  price: number;
  discount: number;
}

/**
 * Nom lisible d'une image de la galerie. Le backend renvoie un chemin de
 * stockage (`examen_images/<code>/<fichier>`) : seul le dernier segment
 * intéresse l'utilisateur, affiché entre parenthèses à côté de « Image N ».
 */
function imageBaseName(filename: string): string {
  const segments = filename.split(/[\\/]/);
  return segments[segments.length - 1] || filename;
}

// ---------------------------------------------------------------------------
// Page principale
// ---------------------------------------------------------------------------

interface Props { params: Promise<{ id: string }> }

export default function TestOrderDetailsPage({ params }: Props) {
  const { id: orderId } = use(params);
  const queryClient = useQueryClient();

  // ---- État galerie
  const [files, setFiles] = useState<FileList | null>(null);
  const [deleteImageIndex, setDeleteImageIndex] = useState<number | null>(null);
  // Un `<input type="file">` garde le nom du fichier choisi tant que sa valeur
  // n'est pas vidée : remettre l'état React à null ne suffit pas, le nom restait
  // affiché à côté du champ après l'ajout.
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- État examens
  const [selectedExam, setSelectedExam] = useState<SelectOption | null>(null);
  const [examPrice, setExamPrice] = useState(0);
  const [examDiscount, setExamDiscount] = useState(0);

  // ---- État modal édition détail
  const [editDetail, setEditDetail] = useState<TestOrderDetail | null>(null);
  const [editExam, setEditExam] = useState<SelectOption | null>(null);
  const [editPrice, setEditPrice] = useState(0);
  const [editDiscount, setEditDiscount] = useState(0);
  const [deleteDetailId, setDeleteDetailId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  const { data: order, isLoading } = useQuery<TestOrder>({
    queryKey: ["test-order", orderId],
    queryFn: () => testOrdersApi.findById(orderId).then((r) => r.data),
    enabled: !!orderId,
  });

  const { data: labTestsData } = useQuery({
    queryKey: ["lab-tests-all"],
    queryFn: () => labTestsApi.findAllSimple().then((r) => r.data),
  });

  const { data: galleryImages } = useQuery<ImageDto[]>({
    queryKey: ["test-order-images", orderId],
    queryFn: () => testOrdersApi.getImages(orderId).then((r) => r.data),
    enabled: !!orderId,
  });

  const examOptions: SelectOption[] = (labTestsData ?? []).map((t: LabTest) => ({
    value: t.id,
    label: t.name,
    price: t.price,
    discount: 0,
  }));

  // ---------------------------------------------------------------------------
  // Handlers sélection examen (ajouter)
  // ---------------------------------------------------------------------------

  const handleExamSelect = async (option: SelectOption | null) => {
    setSelectedExam(option);
    if (!option) {
      setExamPrice(0);
      setExamDiscount(0);
      return;
    }
    // Prix de base
    setExamPrice(option.price);
    setExamDiscount(0);
    // Si contrat → récupérer remise
    if (order?.contratId) {
      try {
        const res = await testOrdersApi
          .getDiscount(option.value, order.contratId)
          .then((r) => r.data);
        // "Prix" = prix de base (brut) ; "Remise" = montant remisé.
        // Le total est calculé ensuite (base - remise) — ne pas utiliser
        // priceAfterDiscount comme prix sous peine de double déduction.
        setExamPrice(res.basePrice ?? option.price);
        setExamDiscount(res.discount ?? 0);
      } catch {
        // Pas de remise → on garde le prix de base
      }
    }
  };

  const calculatedTotal =
    examPrice > 0 ? Math.max(0, examPrice - examDiscount) : 0;

  // ---------------------------------------------------------------------------
  // Handlers sélection examen (édition)
  // ---------------------------------------------------------------------------

  const handleEditExamSelect = async (option: SelectOption | null) => {
    setEditExam(option);
    if (!option) {
      setEditPrice(0);
      setEditDiscount(0);
      return;
    }
    setEditPrice(option.price);
    setEditDiscount(0);
    if (order?.contratId) {
      try {
        const res = await testOrdersApi
          .getDiscount(option.value, order.contratId)
          .then((r) => r.data);
        // Prix de base (brut), pas le net : le total est calculé (base - remise).
        setEditPrice(res.basePrice ?? option.price);
        setEditDiscount(res.discount ?? 0);
      } catch {
        // garde le prix de base
      }
    }
  };

  const editCalculatedTotal =
    editPrice > 0 ? Math.max(0, editPrice - editDiscount) : 0;

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------

  // Galerie — upload
  const uploadMutation = useMutation({
    mutationFn: (fl: FileList) => testOrdersApi.addImages(orderId, fl),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-order-images", orderId] });
      toast.success("Images ajoutées");
      setFiles(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(getApiErrorMessage(err, "Erreur lors de l'upload"));
    },
  });

  // Galerie — suppression
  const deleteImageMutation = useMutation({
    mutationFn: (index: number) =>
      testOrdersApi.deleteImage(orderId, index),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-order-images", orderId] });
      toast.success("Image supprimée");
      setDeleteImageIndex(null);
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(getApiErrorMessage(err, "Erreur lors de la suppression"));
    },
  });

  // Détail — ajout (via PUT /test-orders/{id} avec la liste complète mise à jour)
  const addDetailMutation = useMutation({
    mutationFn: (data: {
      testId: string;
      price: number;
      discount: number;
      total: number;
    }) => {
      if (!order) return Promise.reject(new Error("Demande introuvable"));
      // Garde-fou identique à Laravel (details_store) : un même examen ne peut
      // figurer qu'une fois sur le bon, sinon il est facturé deux fois à la
      // validation. Le back le refuse aussi (422) ; ce test évite l'aller-retour.
      if ((order.details ?? []).some((d) => d.labTestId === data.testId)) {
        return Promise.reject(
          new Error("Cet examen est déjà ajouté à la demande."),
        );
      }
      const newDetails = [
        ...(order.details ?? []).map((d) => ({
          labTestId: d.labTestId,
          price: d.price,
          discount: d.discount,
        })),
        { labTestId: data.testId, price: data.price, discount: data.discount },
      ];
      const payload: TestOrderRequest = {
        patientId: order.patientId,
        prelevementDate: order.prelevementDate ?? "",
        isUrgent: order.isUrgent,
        typeOrderId: order.typeOrderId,
        contratId: order.contratId,
        doctorId: order.doctorId,
        hospitalId: order.hospitalId,
        referenceHopital: order.referenceHopital,
        assignedToUserId: order.assignedToUserId,
        details: newDetails,
      };
      return testOrdersApi.update(orderId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-order", orderId] });
      toast.success("Examen ajouté");
      setSelectedExam(null);
      setExamPrice(0);
      setExamDiscount(0);
    },
    onError: (err: AxiosError<ApiError> | Error) => {
      toast.error(getApiErrorMessage(err, "Erreur lors de l'ajout"));
    },
  });

  // Détail — édition (via PUT /test-orders/{id} avec la liste complète mise à jour)
  const updateDetailMutation = useMutation({
    mutationFn: (data: {
      detailId: string;
      testId: string;
      price: number;
      discount: number;
      total: number;
    }) => {
      if (!order) return Promise.reject(new Error("Demande introuvable"));
      const updatedDetails = (order.details ?? []).map((d) =>
        d.id === data.detailId
          ? { labTestId: data.testId, price: data.price, discount: data.discount }
          : { labTestId: d.labTestId, price: d.price, discount: d.discount }
      );
      const payload: TestOrderRequest = {
        patientId: order.patientId,
        prelevementDate: order.prelevementDate ?? "",
        isUrgent: order.isUrgent,
        typeOrderId: order.typeOrderId,
        contratId: order.contratId,
        doctorId: order.doctorId,
        hospitalId: order.hospitalId,
        referenceHopital: order.referenceHopital,
        assignedToUserId: order.assignedToUserId,
        details: updatedDetails,
      };
      return testOrdersApi.update(orderId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-order", orderId] });
      toast.success("Examen modifié");
      setEditDetail(null);
      setEditExam(null);
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(getApiErrorMessage(err, "Erreur lors de la modification"));
    },
  });

  // Détail — suppression (via PUT /test-orders/{id} avec la liste filtrée)
  const deleteDetailMutation = useMutation({
    mutationFn: (detailId: string) => {
      if (!order) return Promise.reject(new Error("Demande introuvable"));
      const filteredDetails = (order.details ?? [])
        .filter((d) => d.id !== detailId)
        .map((d) => ({ labTestId: d.labTestId, price: d.price, discount: d.discount }));
      const payload: TestOrderRequest = {
        patientId: order.patientId,
        prelevementDate: order.prelevementDate ?? "",
        isUrgent: order.isUrgent,
        typeOrderId: order.typeOrderId,
        contratId: order.contratId,
        doctorId: order.doctorId,
        hospitalId: order.hospitalId,
        referenceHopital: order.referenceHopital,
        assignedToUserId: order.assignedToUserId,
        details: filteredDetails,
      };
      return testOrdersApi.update(orderId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-order", orderId] });
      toast.success("Examen supprimé");
      setDeleteDetailId(null);
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(getApiErrorMessage(err, "Erreur lors de la suppression"));
    },
  });

  // Statut — finalisation : passage en VALIDATED. C'est ce statut (et lui seul)
  // qui déclenche côté backend la génération du code de la demande, du rapport
  // (« CO » + code) et de la facture — équivalent de updateStatus() dans Laravel.
  const updateStatusMutation = useMutation({
    mutationFn: () => testOrdersApi.updateStatus(orderId, "VALIDATED"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-order", orderId] });
      toast.success("Demande validée");
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(getApiErrorMessage(err, "Erreur lors de la validation"));
    },
  });

  // ---------------------------------------------------------------------------
  // Handlers formulaires
  // ---------------------------------------------------------------------------

  const handleGalleryUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!files || files.length === 0) return;
    uploadMutation.mutate(files);
  };

  const handleAddDetail = () => {
    if (!selectedExam) return;
    addDetailMutation.mutate({
      testId: selectedExam.value, // mappé vers labTestId dans la mutation
      price: examPrice,
      discount: examDiscount,
      total: calculatedTotal,
    });
  };

  const handleOpenEditDetail = (detail: TestOrderDetail) => {
    setEditDetail(detail);
    const opt = examOptions.find((o) => o.value === detail.labTestId) ?? null;
    setEditExam(opt);
    setEditPrice(detail.price);
    setEditDiscount(detail.discount);
  };

  const handleEditDetailSubmit = () => {
    if (!editDetail || !editExam) return;
    updateDetailMutation.mutate({
      detailId: editDetail.id,
      testId: editExam.value, // mappé vers labTestId dans la mutation
      price: editPrice,
      discount: editDiscount,
      total: editCalculatedTotal,
    });
  };

  // Confirmation avant validation : l'opération est irréversible côté métier
  // (génération du code, création du compte rendu et de la facture, plus aucun
  // examen ajoutable ensuite). Elle partait auparavant au premier clic.
  const [confirmValidation, setConfirmValidation] = useState(false);

  const handleUpdateStatus = () => {
    // Garde anti double-soumission : empêche deux validations concurrentes
    // (double-clic) qui provoquaient un conflit de génération de code.
    if (updateStatusMutation.isPending) return;
    updateStatusMutation.mutate();
  };

  // ---------------------------------------------------------------------------
  // Colonnes DataTable examens
  // ---------------------------------------------------------------------------

  const canEditDetails = order?.status !== "VALIDATED";

  // « Examen de référence » ne concerne que les Immuno (interne/externe) — même
  // condition que l'apparition du champ dans les formulaires d'ajout/modif.
  const isImmuno = (order?.typeOrderTitle ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .includes("immuno");

  const detailsTotal = (order?.details ?? []).reduce(
    (sum, d) => sum + (d.total ?? 0),
    0
  );

  const detailColumns: ColumnDef<TestOrderDetail>[] = [
    {
      header: "#",
      id: "index",
      cell: ({ row }) => (
        <span className="text-xs text-gray-400">{row.index + 1}</span>
      ),
    },
    {
      header: "Examen",
      accessorKey: "testName",
    },
    {
      header: "Prix",
      id: "price",
      // Ferré à droite : les unités s'alignent sous les unités, et la ligne de
      // total tombe sous la colonne qu'elle totalise.
      meta: { align: "right" as const },
      cell: ({ row }) => formatCFA(row.original.price),
    },
    {
      header: "Remise",
      id: "discount",
      // Ferré à droite : les unités s'alignent sous les unités, et la ligne de
      // total tombe sous la colonne qu'elle totalise.
      meta: { align: "right" as const },
      cell: ({ row }) => formatCFA(row.original.discount),
    },
    {
      header: "Montant",
      id: "total",
      // Ferré à droite : les unités s'alignent sous les unités, et la ligne de
      // total tombe sous la colonne qu'elle totalise.
      meta: { align: "right" as const },
      cell: ({ row }) => formatCFA(row.original.total),
    },
    ...(canEditDetails
      ? [
          {
            header: "Actions",
            id: "actions",
            cell: ({ row }: { row: { original: TestOrderDetail } }) => (
              <div className="flex items-center gap-2">
                <IconButton
                  variant="edit"
                  title="Modifier"
                  aria-label="Modifier"
                  onClick={() => handleOpenEditDetail(row.original)}
                  icon={<Pencil className="h-4 w-4" />}
                />
                <IconButton
                  variant="delete"
                  title="Supprimer"
                  aria-label="Supprimer"
                  onClick={() => setDeleteDetailId(row.original.id)}
                  icon={<Trash2 className="h-4 w-4" />}
                />
              </div>
            ),
          } as ColumnDef<TestOrderDetail>,
        ]
      : []),
  ];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-gray-200" />
        <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-gray-500">Demande introuvable.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Demande d'examen : ${order.code ?? "En attente de validation"}`}
        breadcrumbs={[
          { label: "Demandes d'examen", href: "/test-orders" },
          { label: order.code ?? "Sans code" },
        ]}
      />

      {/* ===================================================================
          Section 1 — CTA compte rendu
      =================================================================== */}
      {order.reportId && (
        <Link
          href={`/reports/${order.reportId}`}
          className="w-full block text-center bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
        >
          CONSULTEZ LE COMPTE RENDU
        </Link>
      )}

      {/* ===================================================================
          Section 2 — Récapitulatif
      =================================================================== */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-800">
            Récapitulatif de la demande
          </h2>
          {order.status !== "VALIDATED" && (
            <Link
              href={`/test-orders/${orderId}/edit`}
              title="Modifier"
              aria-label="Modifier"
              className="inline-flex items-center justify-center rounded-sm bg-blue-600 p-[.4rem] text-white transition-shadow hover:shadow-[0_2px_6px_0_rgba(114,124,245,0.5)]"
            >
              <Pencil className="h-4 w-4" />
            </Link>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
          <div className="flex items-start gap-2">
            <dt className="font-medium text-gray-500 w-40 flex-shrink-0">Patient :</dt>
            <dd className="text-gray-800">
              {order.patientFirstname} {order.patientLastname}
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="font-medium text-gray-500 w-40 flex-shrink-0">
              Type d&apos;examen :
            </dt>
            <dd className="text-gray-800">{order.typeOrderTitle}</dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="font-medium text-gray-500 w-40 flex-shrink-0">Médecin :</dt>
            {/*
              Un tiret ne se distingue pas d'une donnée absente sans importance.
              Or le médecin traitant peut désormais manquer volontairement, le
              temps de le retrouver — il faut donc que ce manque se voie et
              appelle le geste, sinon il reste vide pour toujours.
            */}
            <dd className={order.doctorName ? "text-gray-800" : "text-amber-700"}>
              {order.doctorName ?? "à renseigner"}
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="font-medium text-gray-500 w-40 flex-shrink-0">Hôpital :</dt>
            <dd className="text-gray-800">{order.hospitalName ?? "—"}</dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="font-medium text-gray-500 w-40 flex-shrink-0">
              Référence hôpital :
            </dt>
            <dd className="text-gray-800">{order.referenceHopital ?? "—"}</dd>
          </div>
          {isImmuno && (
            <div className="flex items-start gap-2">
              <dt className="font-medium text-gray-500 w-40 flex-shrink-0">
                Examen de référence :
              </dt>
              <dd className="text-gray-800">{order.testAffiliate || "—"}</dd>
            </div>
          )}
          <div className="flex items-start gap-2">
            <dt className="font-medium text-gray-500 w-40 flex-shrink-0">
              Date prélèvement :
            </dt>
            <dd className="text-gray-800">
              {order.prelevementDate ? formatDate(order.prelevementDate) : "—"}
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="font-medium text-gray-500 w-40 flex-shrink-0">Contrat :</dt>
            <dd className="text-gray-800">{order.contratName ?? "—"}</dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="font-medium text-gray-500 w-40 flex-shrink-0">Cas urgent :</dt>
            <dd>
              {order.isUrgent ? (
                <Badge variant="danger" className="bg-red-700 text-white">
                  Urgent
                </Badge>
              ) : (
                <Badge variant="secondary">Normal</Badge>
              )}
            </dd>
          </div>
          <div className="flex items-start gap-2">
            <dt className="font-medium text-gray-500 w-40 flex-shrink-0">
              Pièce jointe :
            </dt>
            <dd className="text-gray-800">
              {order.archive ? (
                <button
                  type="button"
                  onClick={() => openDocFile({ fileId: order.archiveFileId, path: order.archive })}
                  className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"
                >
                  <Download className="h-3.5 w-3.5" />
                  Ouvrir / télécharger
                </button>
              ) : (
                "Aucun fichier"
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* ===================================================================
          Section 3 — Prise en charge
      =================================================================== */}
      <PriseEnCharge demandeId={orderId} />

      {/* ===================================================================
          Section 4 — Galerie des images
      =================================================================== */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <ImagePlus className="h-4 w-4 text-gray-500" />
          Gallerie des images
        </h2>

        {/* Formulaire upload */}
        <form onSubmit={handleGalleryUpload} className="flex items-center gap-3 mb-4">
          {/* Le back n'accepte que JPG et PNG, comme la règle Laravel
              `files_name.* => file|mimes:jpg,png`. On restreint le sélecteur en
              conséquence : avec « image/* » l'utilisateur pouvait choisir un HEIC
              ou un TIFF et ne découvrir le refus qu'après l'envoi. */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,image/jpeg,image/png"
            onChange={(e) => setFiles(e.target.files)}
            className="text-sm text-gray-600 file:mr-3 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
          />
          <Button
            type="submit"
            disabled={!files || files.length === 0}
            loading={uploadMutation.isPending}
          >
            {uploadMutation.isPending ? "Upload..." : "Ajouter"}
          </Button>
        </form>

        {/* Liste images */}
        {(galleryImages?.length ?? 0) === 0 ? (
          <p className="text-sm text-gray-500 italic">Aucune image ajoutée.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {(galleryImages ?? []).map((img) => (
              <div
                key={img.index}
                className="flex items-center gap-3 py-2"
              >
                <span className="flex-shrink-0 text-sm font-medium text-gray-700">
                  Image {img.index + 1}
                  <span
                    className="ml-1 font-normal text-gray-500"
                    title={imageBaseName(img.filename)}
                  >
                    ({imageBaseName(img.filename)})
                  </span>
                </span>
                <IconButton
                  variant="view"
                  title="Voir"
                  aria-label="Voir"
                  onClick={() => openDocFile({ fileId: img.fileId, path: img.filename })}
                  icon={<Eye className="h-4 w-4" />}
                />
                <IconButton
                  variant="delete"
                  title="Supprimer"
                  aria-label="Supprimer"
                  onClick={() => setDeleteImageIndex(img.index)}
                  icon={<Trash2 className="h-4 w-4" />}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ===================================================================
          Section 5 — Examens demandés
      =================================================================== */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-500" />
          Examens demandés
        </h2>

        {/* Formulaire ajout examen */}
        {canEditDetails && (
          <div className="flex flex-wrap gap-3 items-end mb-6">
            <div className="flex-1 min-w-48">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Examen
              </label>
              <Select<SelectOption>
                instanceId="test-order-add-exam"
                options={examOptions}
                value={selectedExam}
                onChange={handleExamSelect}
                placeholder="Sélectionner un examen..."
                isClearable
                classNamePrefix="rs"
                styles={{
                  control: (base) => ({
                    ...base,
                    minHeight: `${SELECT_CONTROL_MIN_HEIGHT}px`,
                    fontSize: "0.875rem",
                    borderColor: "#d1d5db",
                  }),
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Prix
              </label>
              <input
                type="text"
                readOnly
                value={examPrice > 0 ? formatCFA(examPrice) : ""}
                className="w-32 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-[.9rem] text-gray-700 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Remise
              </label>
              <input
                type="text"
                readOnly
                value={examDiscount > 0 ? formatCFA(examDiscount) : ""}
                className="w-32 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-[.9rem] text-gray-700 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Total
              </label>
              <input
                type="text"
                readOnly
                value={calculatedTotal > 0 ? formatCFA(calculatedTotal) : ""}
                className="w-32 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-[.9rem] text-gray-700 cursor-not-allowed"
              />
            </div>
            <button
              type="button"
              onClick={handleAddDetail}
              disabled={!selectedExam || addDetailMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              {addDetailMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {addDetailMutation.isPending ? "Ajout..." : "Ajouter"}
            </button>
          </div>
        )}

        {/* Tableau examens.
            Le second cadre qui entourait l'ensemble a été retiré : `DataTable`
            encadre déjà sa grille, et la barre d'outils comme la pagination
            vivent volontairement HORS de ce cadre. Les enfermer dans une
            bordure supplémentaire les collait contre elle, tandis que la ligne
            de total, elle, gardait son retrait — trois retraits horizontaux
            différents sur trois lignes superposées. S'y ajoutait un rayon de
            1rem contenu dans un rayon de 0,5rem, dont les coins débordaient.

            Le total passe par la trappe de pied : il appartient à la grille. */}
        <DataTable<TestOrderDetail>
          columns={detailColumns}
          data={order.details ?? []}
          tableFooter={
            (order.details?.length ?? 0) > 0 ? (
              <div className="flex justify-end">
                <span className="text-[.9rem] font-semibold text-gray-800">
                  Total : {formatCFA(detailsTotal)}
                </span>
              </div>
            ) : undefined
          }
        />

        <ConfirmModal
        isOpen={confirmValidation}
        onClose={() => setConfirmValidation(false)}
        onConfirm={() => {
          setConfirmValidation(false);
          handleUpdateStatus();
        }}
        title="Confirmer la demande d'examen"
        message={
          `Cette demande sera validée avec ${order?.details?.length ?? 0} examen(s). ` +
          "Un code, un compte rendu et une facture seront générés, et plus aucun " +
          "examen ne pourra être ajouté ensuite. Voulez-vous continuer ?"
        }
        confirmLabel="Confirmer la demande"
        cancelLabel="Revenir au formulaire"
        isLoading={updateStatusMutation.isPending}
      />

      {/* Bouton finalisation */}
        {canEditDetails && (
          <div className="mt-4">
            {/* Le fond cyan n'appartenait à aucune variante du système ; l'état
                désactivé est géré par le composant, plus besoin d'un gris manuel. */}
            <Button
              onClick={() => setConfirmValidation(true)}
              className="w-full py-3 font-semibold"
              disabled={!order.details?.length}
              loading={updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? "Enregistrement..." : "ENREGISTRER"}
            </Button>
          </div>
        )}
      </div>

      {/* ===================================================================
          Modal édition examen
      =================================================================== */}
      <CrudModal
        isOpen={editDetail !== null}
        onClose={() => {
          setEditDetail(null);
          setEditExam(null);
          setEditPrice(0);
          setEditDiscount(0);
        }}
        title="Modifier l'examen"
        onSubmit={handleEditDetailSubmit}
        submitLabel="Modifier"
        isSubmitting={updateDetailMutation.isPending}
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Examen
            </label>
            <Select<SelectOption>
              instanceId="test-order-edit-exam"
              options={examOptions}
              value={editExam}
              onChange={handleEditExamSelect}
              placeholder="Sélectionner un examen..."
              isClearable
              classNamePrefix="rs"
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: `${SELECT_CONTROL_MIN_HEIGHT}px`,
                  fontSize: "0.875rem",
                  borderColor: "#d1d5db",
                }),
              }}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prix
              </label>
              <input
                type="text"
                readOnly
                value={editPrice > 0 ? formatCFA(editPrice) : ""}
                className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-[.9rem] text-gray-700 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Remise
              </label>
              <input
                type="text"
                readOnly
                value={editDiscount > 0 ? formatCFA(editDiscount) : ""}
                className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-[.9rem] text-gray-700 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total
              </label>
              <input
                type="text"
                readOnly
                value={editCalculatedTotal > 0 ? formatCFA(editCalculatedTotal) : ""}
                className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-[.9rem] text-gray-700 cursor-not-allowed"
              />
            </div>
          </div>
        </div>
      </CrudModal>

      {/* ===================================================================
          ConfirmModal — suppression image
      =================================================================== */}
      <ConfirmModal
        isOpen={deleteImageIndex !== null}
        onClose={() => setDeleteImageIndex(null)}
        onConfirm={() => {
          if (deleteImageIndex !== null) deleteImageMutation.mutate(deleteImageIndex);
        }}
        title="Confirmation"
        message="Êtes-vous sûr de vouloir supprimer cette image?"
        confirmLabel="Oui, supprimer!"
        confirmVariant="danger"
        isLoading={deleteImageMutation.isPending}
      />

      {/* ===================================================================
          ConfirmModal — suppression examen
      =================================================================== */}
      <ConfirmModal
        isOpen={deleteDetailId !== null}
        onClose={() => setDeleteDetailId(null)}
        onConfirm={() => {
          if (deleteDetailId) deleteDetailMutation.mutate(deleteDetailId);
        }}
        title="Confirmation"
        message="Êtes-vous sûr de vouloir supprimer cet examen de la demande?"
        confirmLabel="Oui, supprimer!"
        confirmVariant="danger"
        isLoading={deleteDetailMutation.isPending}
      />
    </div>
  );
}
