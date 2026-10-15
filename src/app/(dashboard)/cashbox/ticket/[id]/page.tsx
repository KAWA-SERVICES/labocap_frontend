"use client";

import { formatCFA } from "@/lib/utils";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import type { AxiosError } from "axios";

import { PageHeader } from "@/components/ui/PageHeader";
import { RHFSelect } from "@/components/ui/RHFSelect";
import { FormField } from "@/components/ui/FormField";
import { PermissionGate } from "@/components/common/PermissionGate";
import {
  TableLengthControl,
  TablePaginationFooter,
  useTablePagination,
} from "@/components/common/TablePagination";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { cashboxApi, type CashboxVoucherDetail } from "@/lib/api/cashbox";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { openDocFile } from "@/lib/api/docs";
import { expenseCategoriesApi } from "@/lib/api/expenses";
import { suppliersApi } from "@/lib/api/suppliers";
import type { ApiError } from "@/types/api";
import { Button } from "@/components/ui/Button";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";


function formatAmount(v?: number) {
  if (v == null) return "—";
  return formatCFA(v);
}

/**
 * Ne retient que les chiffres d'une saisie : les montants sont en FCFA, une
 * devise sans sous-unité, et les quantités sont des entiers. Cela écarte aussi
 * le signe moins, la virgule et la notation exponentielle.
 */
function entierPositif(value: string): string {
  return value.replace(/\D/g, "");
}

// ---------------------------------------------------------------------------
// Schéma en-tête du bon
// ---------------------------------------------------------------------------

const headerSchema = z.object({
  expenseCategoryId: z.string().min(1, "La catégorie est requise"),
  supplierId: z.string().min(1, "Le fournisseur est requis"),
});

type HeaderData = z.infer<typeof headerSchema>;

interface PageProps {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Page — Édition d'un bon de caisse (réplique Laravel cashbox.ticket.details.index)
// ---------------------------------------------------------------------------

export default function CashboxTicketEditPage({ params }: PageProps) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  // Ligne article en cours de saisie
  const [itemName, setItemName] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [quantity, setQuantity] = useState("1");

  const lineTotal = (Number(unitPrice) || 0) * (Number(quantity) || 0);

  // ---- Queries -------------------------------------------------------------

  const { data: voucher, isLoading } = useQuery({
    queryKey: ["cashbox-ticket", id],
    queryFn: () => cashboxApi.getVoucher(id).then((r) => r.data),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["expense-categories-all"],
    queryFn: () => expenseCategoriesApi.findAll({ size: 200 }).then((r) => r.data),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers-all"],
    queryFn: () => suppliersApi.findAll({ size: 200 }).then((r) => r.data),
  });

  const categories = categoriesData?.content ?? [];
  const suppliers = suppliersData?.content ?? [];

  const isEditable = voucher?.status === "en attente";

  // ---- Form en-tête --------------------------------------------------------

  const form = useForm<HeaderData>({
    resolver: zodResolver(headerSchema),
    defaultValues: { expenseCategoryId: "", supplierId: "" },
  });

  // Pièce jointe du bon (optionnelle) — remplace l'existante si fournie.
  const [ticketFile, setTicketFile] = useState<File | null>(null);

  // Ligne d'article en attente de confirmation de suppression : comme partout
  // ailleurs dans l'application, un clic sur la corbeille ne supprime pas
  // directement.
  const [detailToDelete, setDetailToDelete] =
    useState<CashboxVoucherDetail | null>(null);

  // Réinitialise le formulaire quand le bon est chargé.
  useEffect(() => {
    if (voucher) {
      form.reset({
        expenseCategoryId: voucher.expenseCategoryId ?? "",
        supplierId: voucher.supplierId ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voucher?.id]);

  // ---- Mutations -----------------------------------------------------------

  const headerMutation = useMutation({
    mutationFn: (d: HeaderData) =>
      cashboxApi.updateVoucher(
        id,
        {
          // « Objet » retiré du formulaire (comme Laravel) : on conserve la
          // description existante pour ne pas l'effacer.
          description: voucher?.description ?? "",
          expenseCategoryId: d.expenseCategoryId,
          supplierId: d.supplierId,
        },
        ticketFile,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashbox-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["cashbox-tickets"] });
      setTicketFile(null);
      toast.success("Bon de caisse enregistré");
    },
    onError: (e: AxiosError<ApiError>) =>
      toast.error(e.response?.data?.message ?? "Erreur lors de l'enregistrement"),
  });

  const addDetailMutation = useMutation({
    mutationFn: () =>
      cashboxApi.addVoucherDetail(id, {
        itemName: itemName.trim(),
        quantity: Number(quantity) || 1,
        unitPrice: Number(unitPrice),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashbox-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["cashbox-tickets"] });
      setItemName("");
      setUnitPrice("");
      setQuantity("1");
    },
    onError: (e: AxiosError<ApiError>) =>
      toast.error(e.response?.data?.message ?? "Erreur lors de l'ajout de l'article"),
  });

  const removeDetailMutation = useMutation({
    mutationFn: (detailId: string) => cashboxApi.deleteVoucherDetail(id, detailId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cashbox-ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["cashbox-tickets"] });
      setDetailToDelete(null);
      toast.success("Article supprimé");
    },
    onError: (e: AxiosError<ApiError>) => {
      toast.error(e.response?.data?.message ?? "Erreur lors de la suppression");
      setDetailToDelete(null);
    },
  });

  function handleAddDetail() {
    if (!itemName.trim()) {
      toast.error("Le nom de l'article est requis");
      return;
    }
    // Montants en FCFA : entiers strictement positifs. La saisie est déjà
    // filtrée, ce contrôle couvre le champ laissé vide ou à zéro.
    if (!Number.isInteger(Number(unitPrice)) || Number(unitPrice) < 1) {
      toast.error("Le prix doit être un nombre entier d'au moins 1 FCFA");
      return;
    }
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1) {
      toast.error("La quantité doit être un nombre entier d'au moins 1");
      return;
    }
    addDetailMutation.mutate();
  }

  // ---- Render --------------------------------------------------------------

  const details = voucher?.details ?? [];
  const detailsPagination = useTablePagination(details);

  return (
    <PermissionGate
      permission={PERMISSIONS.VIEW_CASHBOX_TICKETS}
      fallback={
        <div className="flex h-64 items-center justify-center text-sm text-gray-500">
          Accès non autorisé.
        </div>
      }
    >
      <div className="space-y-6">
        <PageHeader
          title={`Bon de caisse : ${voucher?.code ?? ""}`}
          breadcrumbs={[
            { label: "Trésorerie" },
            { label: "Bon de caisse", href: "/cashbox/ticket" },
            { label: voucher?.code ?? "Détail" },
          ]}
          action={
            <Link
              href="/cashbox/ticket"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Link>
          }
        />

        {isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            Chargement…
          </div>
        ) : !voucher ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
            Bon de caisse introuvable.
          </div>
        ) : (
          <>
            {/* === Card 1 : en-tête du bon === */}
            <form
              onSubmit={form.handleSubmit((d) => headerMutation.mutate(d))}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-gray-800">
                  Informations du bon
                </h2>
                <span className="text-xs text-gray-600">
                  <span className="text-red-500">*</span> champs obligatoires
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormField label="Type de caisse" required>
                  <input
                    type="text"
                    value="Caisse de dépense"
                    readOnly
                    className={`${inputClass} bg-gray-50 text-gray-500`}
                  />
                </FormField>

                <RHFSelect
                  control={form.control}
                  name="expenseCategoryId"
                  label="Catégorie de dépense"
                  required
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="Choisir une catégorie..."
                  error={form.formState.errors.expenseCategoryId?.message}
                  isDisabled={!isEditable}
                />

                <RHFSelect
                  control={form.control}
                  name="supplierId"
                  label="Fournisseur"
                  required
                  options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
                  placeholder="Choisir un fournisseur..."
                  error={form.formState.errors.supplierId?.message}
                  isDisabled={!isEditable}
                />

                {/* Pièce jointe (optionnelle) — calque details.blade (dropify). */}
                <FormField label="Pièce jointe">
                  {voucher.ticketFile && (
                    <button
                      type="button"
                      onClick={() => openDocFile({ fileId: voucher.fileId, path: voucher.ticketFile })}
                      className="mb-1 inline-block text-sm text-blue-600 hover:underline"
                    >
                      Pièce jointe actuelle — ouvrir
                    </button>
                  )}
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    disabled={!isEditable}
                    onChange={(e) => setTicketFile(e.target.files?.[0] ?? null)}
                    className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100 ${!isEditable ? "bg-gray-50 text-gray-500" : ""}`}
                  />
                </FormField>
              </div>

              {isEditable && (
                <div className="mt-4 flex justify-end">
                  <Button
                    type="submit"
                    loading={headerMutation.isPending}
                    icon={<Save className="h-4 w-4" />}
                    className="rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700"
                  >
                    Enregistrer
                  </Button>
                </div>
              )}
            </form>

            {/* === Card 2 : articles === */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-base font-semibold text-gray-800">
                Liste des articles
              </h2>

              {/* Formulaire d'ajout d'un article */}
              {isEditable && (
                <div className="mb-4 grid grid-cols-1 gap-3 border-b border-gray-100 pb-4 sm:grid-cols-12 sm:items-end">
                  <div className="sm:col-span-5">
                    <label className="mb-1 block text-xs text-gray-500">Article</label>
                    <input
                      type="text"
                      value={itemName}
                      onChange={(e) => setItemName(e.target.value)}
                      placeholder="Désignation"
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-gray-500">
                      Prix <span className="text-red-500">*</span>
                    </label>
                    {/* Le FCFA n'a pas de sous-unité : entiers strictement
                        positifs uniquement. `type="text"` + filtrage plutôt que
                        `type="number"`, qui laisse saisir « 1,5 », « 1e3 » ou un
                        signe moins sans que la valeur remonte jamais au champ. */}
                    <input
                      type="text"
                      inputMode="numeric"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(entierPositif(e.target.value))}
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-gray-500">
                      Quantité <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={quantity}
                      onChange={(e) => setQuantity(entierPositif(e.target.value))}
                      className={inputClass}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs text-gray-500">Total</label>
                    <input
                      type="text"
                      value={formatAmount(lineTotal)}
                      readOnly
                      className={`${inputClass} bg-gray-50 text-gray-500`}
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <Button
                      onClick={handleAddDetail}
                      loading={addDetailMutation.isPending}
                      icon={<Plus className="h-4 w-4" />}
                      className="h-[38px] w-full gap-1 rounded-lg px-0 py-0 text-sm font-medium hover:bg-blue-700"
                      title="Ajouter l'article"
                    />
                  </div>
                </div>
              )}

              {/* Tableau des articles */}
              <TableLengthControl pagination={detailsPagination} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">Article</th>
                      <th className="pb-2 pr-4 text-right">Prix</th>
                      <th className="pb-2 pr-4 text-right">Quantité</th>
                      <th className="pb-2 pr-4 text-right">Total</th>
                      {isEditable && <th className="pb-2 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {details.length === 0 ? (
                      <tr>
                        <td
                          colSpan={isEditable ? 6 : 5}
                          className="py-6 text-center text-sm text-gray-400"
                        >
                          Aucun article. Ajoutez-en ci-dessus.
                        </td>
                      </tr>
                    ) : (
                      detailsPagination.pageRows.map((d, i) => (
                        <tr key={d.id}>
                          <td className="py-2 pr-4 text-gray-500">
                            {detailsPagination.offset + i + 1}
                          </td>
                          <td className="py-2 pr-4 font-medium">{d.itemName}</td>
                          <td className="py-2 pr-4 text-right text-gray-600">
                            {formatAmount(d.unitPrice)}
                          </td>
                          <td className="py-2 pr-4 text-right">{d.quantity}</td>
                          <td className="py-2 pr-4 text-right font-medium">
                            {formatAmount(d.lineAmount)}
                          </td>
                          {isEditable && (
                            <td className="py-2 text-right">
                              <button
                                type="button"
                                onClick={() => setDetailToDelete(d)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                title="Supprimer la ligne"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-300 font-semibold">
                      <td colSpan={4} className="py-3 pr-4 text-right text-gray-700">
                        Total :
                      </td>
                      <td className="py-3 pr-4 text-right text-gray-900">
                        {formatAmount(voucher.amount)}
                      </td>
                      {isEditable && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <TablePaginationFooter pagination={detailsPagination} />
            </div>
          </>
        )}

        <ConfirmModal
          isOpen={detailToDelete !== null}
          onClose={() => setDetailToDelete(null)}
          onConfirm={() => {
            if (detailToDelete) removeDetailMutation.mutate(detailToDelete.id);
          }}
          title="Confirmation"
          message={`Voulez-vous supprimer l'article « ${detailToDelete?.itemName ?? ""} » de ce bon de caisse ?`}
          confirmLabel="Oui, supprimer!"
          confirmVariant="danger"
          isLoading={removeDetailMutation.isPending}
        />
      </div>
    </PermissionGate>
  );
}
