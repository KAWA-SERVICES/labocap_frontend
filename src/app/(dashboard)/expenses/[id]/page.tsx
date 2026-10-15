"use client";

import { formatCFA } from "@/lib/utils";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Paperclip, Trash2 } from "lucide-react";
import type { AxiosError } from "axios";

import { ConfirmModal } from "@/components/common/ConfirmModal";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { CreatableSelectField } from "@/components/ui/CreatableSelectField";
import {
  TableLengthControl,
  TablePaginationFooter,
  useTablePagination,
} from "@/components/common/TablePagination";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import {
  expensesApi,
  type ExpenseDetail,
  type PaymentMethod,
} from "@/lib/api/expenses";
import { expenseCategoriesApi, type ExpenseCategory } from "@/lib/api/expenses";
import { downloadDocFile } from "@/lib/api/docs";
import { suppliersApi } from "@/lib/api/suppliers";
import { inventoryApi } from "@/lib/api/inventory";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "ESPECES", label: "ESPECES" },
  { value: "MOBILEMONEY", label: "MOBILE MONEY" },
  { value: "CHEQUES", label: "CHEQUES" },
  { value: "VIREMENT", label: "VIREMENT" },
];


/**
 * Enrobe l'enregistrement react-hook-form d'un champ pour n'y laisser passer
 * que des chiffres. Le filtrage porte sur la valeur du DOM *avant* que
 * react-hook-form ne la lise, sinon un caractère collé resterait dans l'état
 * du formulaire.
 */
function chiffresSeulement(
  field: UseFormRegisterReturn,
): UseFormRegisterReturn {
  return {
    ...field,
    onChange: (event: { target: HTMLInputElement; type?: unknown }) => {
      event.target.value = event.target.value.replace(/\D/g, "");
      return field.onChange(event);
    },
  };
}

function formatAmount(amount: number): string {
  // Le FCFA n'a pas de sous-unité : jamais de décimales. L'unité elle-même
  // n'est plus affichée à l'écran (cf. formatCFA).
  return formatCFA(Math.round(amount));
}

// Le montant ne figure plus dans le formulaire : il vaut toujours la somme des
// articles de la dépense (le backend le recalcule à chaque ajout/retrait de
// ligne). Le saisir à part de l'article n'avait pas de sens et permettait
// d'enregistrer un montant sans rapport avec les lignes.
const expenseSchema = z.object({
  expenseCategorieId: z.string().min(1, { message: "La catégorie est requise" }),
  supplierId: z.string().optional(),
  description: z.string().optional(),
  date: z.string().optional(),
  payment: z.enum(["ESPECES", "CHEQUES", "MOBILEMONEY", "VIREMENT"] as const).optional(),
  invoiceNumber: z.string().optional(),
  paid: z.string(),
});

type ExpenseFormValues = z.infer<typeof expenseSchema>;

const detailSchema = z.object({
  articleName: z.string().min(1, { message: "L'article est requis" }),
  // Le FCFA n'a pas de sous-unité : le prix est un entier d'au moins 1.
  unitPrice: z
    .string()
    .min(1, { message: "Le prix de l'article est requis" })
    .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, {
      message: "Le prix doit être un nombre entier d'au moins 1 FCFA",
    }),
  quantity: z
    .string()
    .min(1, { message: "La quantité de l'article est requise" })
    .refine((v) => Number.isInteger(Number(v)) && Number(v) >= 1, {
      message: "La quantité doit être un entier supérieur ou égal à 1",
    }),
});

type DetailFormValues = z.infer<typeof detailSchema>;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { can } = usePermissions();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [toDelete, setToDelete] = useState<ExpenseDetail | null>(null);
  // Preuve d'achat choisie mais pas encore envoyée (envoi au « Soumettre »).
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // ---- Queries -------------------------------------------------------------

  const { data: expense, isLoading } = useQuery({
    queryKey: ["expense", id],
    queryFn: () => expensesApi.findById(id).then((r) => r.data),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["expense-categories"],
    queryFn: () => expenseCategoriesApi.findAll({ size: 200 }).then((r) => r.data),
  });
  const categories: ExpenseCategory[] = categoriesData?.content ?? [];

  const { data: suppliersData } = useQuery({
    queryKey: ["suppliers-select"],
    queryFn: () => suppliersApi.findAll({ size: 200 }).then((r) => r.data),
  });
  const suppliers = suppliersData?.content ?? [];

  const { data: articlesData } = useQuery({
    queryKey: ["articles-select"],
    queryFn: () => inventoryApi.findAll({ size: 200 }).then((r) => r.data),
  });
  const articles = articlesData?.articles?.content ?? [];

  // ---- Formulaires ---------------------------------------------------------

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    values: expense
      ? {
          expenseCategorieId: expense.expenseCategorieId ?? "",
          supplierId: expense.supplierId ?? "",
          description: expense.description ?? "",
          date: expense.date ?? new Date().toISOString().slice(0, 10),
          payment: (expense.payment as PaymentMethod) ?? "ESPECES",
          invoiceNumber: expense.invoiceNumber ?? "",
          paid: String(expense.paid ?? 0),
        }
      : undefined,
  });

  const detailForm = useForm<DetailFormValues>({
    resolver: zodResolver(detailSchema),
    defaultValues: { articleName: "", unitPrice: "", quantity: "" },
  });

  // `useWatch` plutôt que `detailForm.watch(...)` : souscription explicite au
  // champ, et cela évite l'avertissement du React Compiler sur `watch()`, qui
  // renvoie une fonction non mémoïsable. Alimente le total de la ligne et
  // l'activation du bouton d'ajout.
  const watchedPrice = useWatch({ control: detailForm.control, name: "unitPrice" });
  const watchedQty = useWatch({ control: detailForm.control, name: "quantity" });
  const watchedArticle = useWatch({ control: detailForm.control, name: "articleName" });

  // Le bouton restait actif sur un formulaire vide : on l'active seulement quand
  // les trois champs obligatoires sont renseignés.
  const ligneComplete =
    !!watchedArticle?.trim() &&
    Number(watchedPrice) > 0 &&
    Number(watchedQty) >= 1;
  const lineTotal = Math.round(
    (Number(watchedPrice) || 0) * (Number(watchedQty) || 0),
  );

  // ---- Mutations -----------------------------------------------------------

  function apiMessage(err: AxiosError): string {
    return (
      (err.response?.data as { message?: string })?.message ?? "Une erreur est survenue"
    );
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["expense", id] });
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
  }

  const updateMutation = useMutation({
    mutationFn: async (values: ExpenseFormValues) => {
      const current = expense?.paid ?? 0;
      const target = Number(values.paid);

      // La pièce jointe part avant la mise à jour : le PUT réécrit la colonne
      // `receipt`, il doit donc voir le chemin du fichier tout juste stocké et
      // non celui, périmé, du cache.
      let receipt = expense?.receipt;
      if (receiptFile) {
        receipt = (await expensesApi.uploadReceipt(id, receiptFile)).data.receipt;
      }

      // Les champs verrouillés retombent sur la valeur enregistrée : un select
      // désactivé ne doit jamais effacer silencieusement ce qu'il affiche.
      // `amount` n'est pas transmis : il est dérivé des articles côté backend.
      await expensesApi.update(id, {
        expenseCategorieId: values.expenseCategorieId,
        description: values.description || undefined,
        supplierId: values.supplierId || undefined,
        invoiceNumber: values.invoiceNumber || undefined,
        date: values.date || undefined,
        payment: values.payment ?? expense?.payment,
        // Repris tel quel : sans lui, le back remettrait la pièce jointe à vide.
        receipt,
      });

      // Le statut n'est pas porté par l'update : on déclenche les mêmes
      // opérations que la liste, pour que caisse et stock restent cohérents.
      if (target > current) {
        if (target === 1) await expensesApi.pay(id);
        else await expensesApi.updateStock(id);
      }
      return target;
    },
    onSuccess: () => {
      refresh();
      toast.success("Mise à jour effectuée avec succès !");
      router.push("/expenses");
    },
    onError: (err: AxiosError) => toast.error(apiMessage(err)),
  });

  const addDetailMutation = useMutation({
    mutationFn: (values: DetailFormValues) =>
      expensesApi.addDetail(id, {
        articleName: values.articleName,
        unitPrice: Number(values.unitPrice),
        quantity: Number(values.quantity),
      }),
    onSuccess: () => {
      refresh();
      toast.success("Donnée ajoutée avec succès");
      detailForm.reset();
    },
    onError: (err: AxiosError) => toast.error(apiMessage(err)),
  });

  const removeDetailMutation = useMutation({
    mutationFn: (detailId: string) => expensesApi.removeDetail(id, detailId),
    onSuccess: () => {
      refresh();
      setToDelete(null);
    },
    onError: (err: AxiosError) => {
      toast.error(apiMessage(err));
      setToDelete(null);
    },
  });

  // Pagination des lignes d'articles. Appelée avant les retours anticipés
  // ci-dessous : un hook ne peut pas être conditionnel.
  const detailsPagination = useTablePagination(expense?.details ?? []);

  // ---- Garde d'accès -------------------------------------------------------

  if (!can(PERMISSIONS.VIEW_EXPENCE_DETAILS) && !can(PERMISSIONS.VIEW_EXPENSES)) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">Accès non autorisé</p>
      </div>
    );
  }

  if (isLoading || !expense) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  // ---- Verrouillage par statut (règles de show.blade.php) ------------------

  const isSuper = can(PERMISSIONS.VIEW_SUPER_DEPENSES);
  const paid = expense.paid ?? 0;
  // Dès que la dépense est payée, les données financières se figent.
  const lockedWhenPaid = paid !== 0 && !isSuper;
  // Une fois livrée, tout se fige, y compris le statut et la facture.
  const lockedWhenDelivered = paid === 2 && !isSuper;

  const details: ExpenseDetail[] = expense.details ?? [];
  const detailsTotal = details.reduce((sum, d) => sum + (d.lineAmount ?? 0), 0);

  // ---- Render --------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/expenses")}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour
        </button>
      </div>

      <form onSubmit={form.handleSubmit((v) => updateMutation.mutate(v))} className="space-y-6">
        {/* Bloc 1 — Informations */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Détails de la dépense</h2>
            <span className="text-xs text-gray-600">
              <span className="text-red-500">*</span>champs obligatoires
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FormField
              label="Catégorie de dépense"
              required
              error={form.formState.errors.expenseCategorieId?.message}
            >
              <NativeSelect
                value={form.watch("expenseCategorieId") ?? ""}
                onChange={(e) =>
                  form.setValue("expenseCategorieId", e.target.value, {
                    shouldValidate: true,
                  })
                }
              >
                <option value="">Sélectionner une catégorie</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            <FormField label="Fournisseur" required>
              <NativeSelect
                value={form.watch("supplierId") ?? ""}
                onChange={(e) =>
                  form.setValue("supplierId", e.target.value, {
                    shouldValidate: true,
                  })
                }
              >
                <option value="">Sélectionner le fournisseur</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            <FormField label="Objet de la dépense">
              <input
                type="text"
                className={inputClass}
                readOnly={lockedWhenPaid}
                {...form.register("description")}
              />
            </FormField>

            <FormField label="Date de la dépense">
              <input
                type="date"
                className={inputClass}
                readOnly={lockedWhenPaid}
                {...form.register("date")}
              />
            </FormField>

            <FormField
              label="Montant"
              hint="Calculé automatiquement à partir des articles ajoutés ci-dessous."
            >
              <input
                type="text"
                className={inputClass}
                readOnly
                value={formatAmount(detailsTotal)}
              />
            </FormField>

            <FormField label="Type de paiement">
              <NativeSelect
                value={form.watch("payment") ?? ""}
                onChange={(e) =>
                  form.setValue("payment", e.target.value as PaymentMethod)
                }
                disabled={lockedWhenPaid}
              >
                {PAYMENT_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>

            <FormField label="Numéro de la facture">
              <input
                type="text"
                className={inputClass}
                readOnly={lockedWhenDelivered}
                {...form.register("invoiceNumber")}
              />
            </FormField>

            {/* Pièce jointe (« Preuve » d'achat) : champ fichier comme
                `expenses/show.blade.php`. Elle n'était affichée qu'en lecture,
                sans moyen d'en déposer une. Le fichier est envoyé au moment du
                « Soumettre », avec le reste du formulaire. */}
            <FormField
              label="Pièce jointe"
              hint={
                expense.receipt
                  ? "Choisir un fichier remplace la pièce jointe actuelle."
                  : undefined
              }
            >
              <input
                type="file"
                disabled={lockedWhenDelivered}
                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                className={`${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100`}
              />
              {expense.receipt ? (
                <button
                  type="button"
                  onClick={() => downloadDocFile({ fileId: expense.fileId, path: expense.receipt })}
                  className="mt-1 inline-flex w-fit items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                >
                  <Paperclip className="h-4 w-4" />
                  Télécharger le reçu actuel
                </button>
              ) : (
                <span className="mt-1 block text-sm text-gray-400">
                  Aucune pièce jointe
                </span>
              )}
            </FormField>

            <FormField label="Status de la dépense">
              <NativeSelect
                value={form.watch("paid") ?? "0"}
                onChange={(e) => form.setValue("paid", e.target.value)}
                disabled={lockedWhenDelivered}
              >
                <option value="0">Non payé</option>
                <option value="1">Payé</option>
                <option value="2">Payé et Livré</option>
              </NativeSelect>
            </FormField>
          </div>
        </div>

        {/* Bloc 2 — Liste des articles */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Liste des articles</h2>

          {paid === 0 && can(PERMISSIONS.CREATE_EXPENCE_DETAILS) && (
            /* Encadré distinct et intitulé : noyé dans la page, ce formulaire
               ne se lisait pas comme une action à faire. */
            <div className="mb-5 rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-4">
              <h3 className="text-sm font-semibold text-gray-900">
                Ajouter un article à cette dépense
              </h3>
              <p className="mb-3 mt-1 text-xs text-gray-600">
                Renseignez chaque article couvert par la dépense. Le total de la
                dépense est la somme des articles ajoutés ici.
              </p>
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <FormField label="Article" required error={detailForm.formState.errors.articleName?.message}>
                {/* Liste issue de la table des articles : select cherchable.
                    La saisie libre reste possible (un article hors stock peut
                    figurer sur une dépense), comme avec l'autocomplétion
                    Laravel. */}
                <CreatableSelectField
                  id="expense-article"
                  options={articles.map((a) => ({ value: a.name, label: a.name }))}
                  value={detailForm.watch("articleName") || null}
                  onChange={(v) =>
                    detailForm.setValue("articleName", v ?? "", {
                      shouldValidate: true,
                    })
                  }
                  placeholder="Rechercher ou saisir un article…"
                />
              </FormField>

              {/* `type="text"` + filtrage : `type="number"` laisse saisir
                  « 1,5 », « 1e3 » ou un signe moins sans jamais remonter la
                  valeur au champ. */}
              <FormField label="Prix" required error={detailForm.formState.errors.unitPrice?.message}>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  {...chiffresSeulement(detailForm.register("unitPrice"))}
                />
              </FormField>

              <FormField label="Quantité" required error={detailForm.formState.errors.quantity?.message}>
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputClass}
                  {...chiffresSeulement(detailForm.register("quantity"))}
                />
              </FormField>

              <FormField label="Total">
                <input type="number" className={inputClass} value={lineTotal} readOnly />
              </FormField>

              <div>
                <button
                  type="button"
                  onClick={detailForm.handleSubmit((v) => addDetailMutation.mutate(v))}
                  disabled={!ligneComplete || addDetailMutation.isPending}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Ajouter l&apos;article
                </button>
              </div>
              </div>
            </div>
          )}

          <TableLengthControl pagination={detailsPagination} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2">Prix</th>
                  <th className="px-3 py-2">Quantité</th>
                  <th className="px-3 py-2">Total</th>
                  {paid === 0 && <th className="px-3 py-2">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {details.length === 0 ? (
                  <tr>
                    <td colSpan={paid === 0 ? 6 : 5} className="px-3 py-6 text-center text-gray-400">
                      Aucun article
                    </td>
                  </tr>
                ) : (
                  detailsPagination.pageRows.map((d, i) => (
                    <tr key={d.id} className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-500">
                        {detailsPagination.offset + i + 1}
                      </td>
                      <td className="px-3 py-2">{d.articleName ?? "—"}</td>
                      <td className="px-3 py-2">{formatAmount(d.unitPrice ?? 0)}</td>
                      <td className="px-3 py-2">{d.quantity}</td>
                      <td className="px-3 py-2">{formatAmount(d.lineAmount ?? 0)}</td>
                      {paid === 0 && (
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setToDelete(d)}
                            className="inline-flex items-center rounded bg-red-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-red-700"
                            aria-label="Supprimer la ligne"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 font-semibold">
                  <td className="px-3 py-2" colSpan={4}>
                    Total:
                  </td>
                  <td className="px-3 py-2">{formatAmount(detailsTotal)}</td>
                  {paid === 0 && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
          <TablePaginationFooter pagination={detailsPagination} />

          <Button
            type="submit"
            className="mt-5 w-full"
            disabled={lockedWhenDelivered}
            loading={updateMutation.isPending}
          >
            Soumettre
          </Button>
        </div>
      </form>

      <ConfirmModal
        isOpen={toDelete !== null}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) removeDetailMutation.mutate(toDelete.id);
        }}
        title="Confirmation"
        message="Voulez-vous supprimer l'élément ?"
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={removeDetailMutation.isPending}
      />
    </div>
  );
}
