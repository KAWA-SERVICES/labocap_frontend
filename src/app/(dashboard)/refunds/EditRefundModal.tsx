"use client";

import { formatCFA } from "@/lib/utils";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { AxiosError } from "axios";

import { RHFSelect } from "@/components/ui/RHFSelect";
import { RemoteSelectField } from "@/components/ui/RemoteSelectField";
import { MAX_VISIBLE_OPTIONS } from "@/components/ui/LimitedSelect";
import { FormField } from "@/components/ui/FormField";
import {
  refundsApi,
  refundReasonsApi,
  type RefundReason,
  type RefundRequest,
} from "@/lib/api/refunds";
import { invoicesApi, type Invoice } from "@/lib/api/invoices";
import { openDocFile } from "@/lib/api/docs";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";


function formatAmount(amount: number): string {
  return formatCFA(amount);
}

const loadInvoiceOptions = (input: string) =>
  invoicesApi
    .findAll({ size: MAX_VISIBLE_OPTIONS, search: input || undefined, paid: true, statusInvoice: 0 })
    .then((r) =>
      r.data.content.map((inv: Invoice) => ({
        value: inv.id,
        label: `${inv.code} — ${formatAmount(inv.total)}${inv.patientName ? ` (${inv.patientName})` : ""}`,
      }))
    );

const schema = z.object({
  refundReasonId: z.string().min(1, "Sélectionner une raison"),
  invoiceId: z.string().min(1, "Sélectionner la facture de référence"),
  montant: z.string().min(1, "Le montant est requis"),
  note: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

/**
 * Modale d'édition d'une demande de remboursement (calque `refund/edit.blade`).
 * Si le statut est « Aprouvé », seuls le fichier reste modifiable ; les autres
 * champs sont verrouillés (règle Laravel).
 */
export function EditRefundModal({
  refund,
  onClose,
}: {
  refund: RefundRequest;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const locked = refund.status === "Aprouvé";

  const { data: reasonsData } = useQuery({
    queryKey: ["refund-reasons"],
    queryFn: () => refundReasonsApi.findAll().then((r) => r.data),
  });
  const reasons: RefundReason[] = Array.isArray(reasonsData) ? reasonsData : [];

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      refundReasonId: refund.refundReasonId ?? "",
      invoiceId: refund.invoiceId ?? "",
      montant: String(refund.montant ?? ""),
      note: refund.note ?? "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: FormValues) =>
      refundsApi.update(
        refund.id,
        {
          invoiceId: values.invoiceId,
          refundReasonId: values.refundReasonId,
          montant: Number(values.montant),
          note: values.note || undefined,
        },
        file
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["refunds"] });
      queryClient.invalidateQueries({ queryKey: ["refund-pending-count"] });
      toast.success("Demande mise à jour avec succès");
      onClose();
    },
    onError: (err: AxiosError) =>
      toast.error(
        (err.response?.data as { message?: string })?.message ??
          "Un problème est survenu lors de la mise à jour"
      ),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Modifier la demande {refund.code ?? ""}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit((v) => updateMutation.mutate(v))}>
          <div className="space-y-4 p-6">
            <p className="text-right text-sm text-gray-600">
              <span className="text-red-600">*</span>champs obligatoires
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                control={control}
                name="invoiceId"
                render={({ field }) =>
                  locked ? (
                    <FormField label="Facture de référence" required>
                      <input value={refund.invoiceCode ?? ""} disabled className={inputClass} />
                    </FormField>
                  ) : (
                    <RemoteSelectField
                      label="Facture de référence"
                      required
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? "")}
                      loadOptions={loadInvoiceOptions}
                      selectedOption={
                        refund.invoiceId
                          ? { value: refund.invoiceId, label: refund.invoiceCode ?? refund.invoiceId }
                          : null
                      }
                      placeholder="Sélectionner la facture"
                      error={errors.invoiceId?.message}
                    />
                  )
                }
              />

              {locked ? (
                <FormField label="Raison de la demande" required>
                  <input value={refund.refundReasonLabel ?? ""} disabled className={inputClass} />
                </FormField>
              ) : (
                <RHFSelect
                  control={control}
                  name="refundReasonId"
                  label="Raison de la demande"
                  required
                  options={reasons.map((r) => ({ value: r.id, label: r.label }))}
                  placeholder="Sélectionner une raison"
                  error={errors.refundReasonId?.message}
                />
              )}
            </div>

            <FormField label="Montant" required error={errors.montant?.message}>
              <input type="number" {...register("montant")} disabled={locked} className={inputClass} />
            </FormField>

            <FormField label="Pièce jointe (PDF)">
              {refund.attachment && (
                <button
                  type="button"
                  onClick={() => openDocFile({ fileId: refund.fileId, path: refund.attachment })}
                  className="mb-1 inline-block text-sm text-blue-600 hover:underline"
                >
                  Pièce jointe actuelle — ouvrir
                </button>
              )}
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="mt-1 text-xs text-gray-400">
                Veuillez joindre la facture d&apos;avoir déchargée, signée et datée par le
                demandeur de remboursement.
              </p>
            </FormField>

            <FormField label="Description" error={errors.note?.message}>
              <textarea {...register("note")} rows={5} disabled={locked} className={inputClass} />
            </FormField>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {updateMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Mettre à jour
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
