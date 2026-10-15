"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Eye, Loader2, Pencil, X } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import type { AxiosError } from "axios";

import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable } from "@/components/common/DataTable";
import {
  TableLengthControl,
  TablePaginationFooter,
  useTablePagination,
} from "@/components/common/TablePagination";
import { PermissionGate } from "@/components/common/PermissionGate";
import { Badge } from "@/components/ui/Badge";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import {
  refundsApi,
  type RefundRequest,
  type RefundRequestLog,
} from "@/lib/api/refunds";
import { openDocFile } from "@/lib/api/docs";
import { EditRefundModal } from "./EditRefundModal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const actionBtn =
  "inline-flex h-8 w-9 items-center justify-center rounded-md text-white transition-colors disabled:opacity-50";

/** Date au format Laravel de l'écran : jj/mm/aa hh:mm:ss. */
function formatDateTime(value?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Laravel tronque l'objet à 50 caractères (helper `tronquerChaine`). */
function tronquerChaine(value?: string): string {
  if (!value) return "";
  return value.length > 50 ? value.slice(0, 50) + "…" : value;
}

/**
 * Libellés de statut de l'écran Laravel : la valeur en base (`Aprouvé`, avec un
 * seul « p ») diffère du libellé affiché (« Acceptée »).
 */
function statusBadge(status: string) {
  if (status === "En attente") return <Badge variant="warning">En attente</Badge>;
  if (status === "Aprouvé") return <Badge variant="success">Acceptée</Badge>;
  if (status === "Rejeté") return <Badge variant="danger">Refusée</Badge>;
  return <Badge variant="secondary">Clôturée</Badge>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RefundsPage() {
  return (
    <PermissionGate permission={PERMISSIONS.VIEW_REFUNDS}>
      <RefundsContent />
    </PermissionGate>
  );
}

function RefundsContent() {
  const { can } = usePermissions();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [detail, setDetail] = useState<RefundRequest | null>(null);
  const [editing, setEditing] = useState<RefundRequest | null>(null);

  // Historique des mises à jour de la modale détail.
  const detailLogsPagination = useTablePagination(detail?.logs ?? []);

  // Laravel affiche la liste entière, sans filtre ni pagination serveur.
  const { data, isLoading } = useQuery({
    queryKey: ["refunds"],
    queryFn: () => refundsApi.findAll({ size: 1000 }).then((r) => r.data),
  });

  const refunds: RefundRequest[] = useMemo(() => data?.content ?? [], [data]);

  /** Second tableau : tous les logs, demande confondue, du plus récent au plus ancien. */
  const allLogs = useMemo(
    () =>
      refunds
        .flatMap((r) =>
          (r.logs ?? []).map((l) => ({ ...l, refundCode: r.code ?? "" })),
        )
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")),
    [refunds],
  );

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["refunds"] });
    queryClient.invalidateQueries({ queryKey: ["refund-pending-count"] });
  }

  function apiError(err: AxiosError) {
    toast.error(
      (err.response?.data as { message?: string })?.message ??
        "Un problème est suvenu lors de l'enrégistrement",
    );
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => refundsApi.approve(id),
    onSuccess: (res) => {
      invalidate();
      // Laravel redirige vers l'avoir généré, à encaisser ensuite.
      const invoiceId = (res.data as { id?: string | null })?.id;
      if (invoiceId) {
        router.push(`/invoices/${invoiceId}`);
        return;
      }
      toast.success("Mis à jour éffectué avec success");
    },
    onError: apiError,
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => refundsApi.reject(id),
    onSuccess: () => {
      invalidate();
      toast.success("La demande est rejeté");
    },
    onError: apiError,
  });

  const pending = approveMutation.isPending || rejectMutation.isPending;

  // ---- Colonnes : # · Code · Objet · Montant · Dernière actualisation · Statut · Action

  const columns: ColumnDef<RefundRequest>[] = [
    {
      header: "#",
      id: "index",
      enableSorting: false,
      cell: ({ row }) => row.index + 1,
    },
    {
      header: "Code",
      accessorKey: "code",
      cell: ({ row }) => row.original.code ?? "",
    },
    {
      header: "Objet",
      id: "objet",
      cell: ({ row }) => tronquerChaine(row.original.refundReasonLabel),
    },
    {
      header: "Montant",
      accessorKey: "montant",
    },
    {
      header: "Dernière actualisation",
      id: "updatedAt",
      cell: ({ row }) => formatDateTime(row.original.updatedAt ?? row.original.createdAt),
    },
    {
      header: "Statut",
      id: "status",
      cell: ({ row }) => statusBadge(row.original.status),
    },
    {
      header: "Action",
      id: "actions",
      enableSorting: false,
      cell: ({ row }) => {
        const refund = row.original;
        return (
          <div className="flex items-center gap-2">
            {/* Décision définitive : Accepter/Refuser ne sont proposés que tant
               que la demande est « En attente ». Une fois acceptée ou refusée,
               plus aucune action de statut. */}
            {refund.status === "En attente" && (
              <PermissionGate permission={PERMISSIONS.PROCESS_REFUNDS}>
                <button
                  onClick={() => approveMutation.mutate(refund.id)}
                  disabled={pending}
                  className={`${actionBtn} bg-blue-600 hover:bg-blue-700`}
                  aria-label="Accepter"
                  title="Accepter"
                >
                  {approveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => rejectMutation.mutate(refund.id)}
                  disabled={pending}
                  className={`${actionBtn} bg-red-500 hover:bg-red-600`}
                  aria-label="Refuser"
                  title="Refuser"
                >
                  {rejectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                </button>
              </PermissionGate>
            )}
            {/* Édition — Laravel ne l'offre que sur « En attente » et « Aprouvé ». */}
            {["En attente", "Aprouvé"].includes(refund.status) &&
              can(PERMISSIONS.EDIT_REFUNDS) && (
                <button
                  onClick={() => setEditing(refund)}
                  className={`${actionBtn} bg-gray-600 hover:bg-gray-700`}
                  aria-label="Modifier"
                  title="Modifier"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            <button
              onClick={() => setDetail(refund)}
              className={`${actionBtn} bg-blue-600 hover:bg-blue-700`}
              aria-label="Détail"
              title="Détail"
            >
              <Eye className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
  ];

  // ---- Colonnes du second tableau

  type LogRow = RefundRequestLog & { refundCode: string };

  const logColumns: ColumnDef<LogRow>[] = [
    {
      header: "#",
      id: "index",
      enableSorting: false,
      cell: ({ row }) => row.index + 1,
    },
    {
      // Faute présente dans le Blade Laravel, conservée telle quelle.
      header: "Demande de rembousement",
      id: "refundCode",
      cell: ({ row }) => row.original.refundCode,
    },
    {
      header: "Utilisateur",
      id: "user",
      cell: ({ row }) => row.original.userFullName ?? "",
    },
    {
      header: "Operation",
      accessorKey: "operation",
    },
    {
      header: "Dernière mis à jour",
      id: "createdAt",
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Demandes de remboursements"
        action={
          can(PERMISSIONS.CREATE_REFUNDS) ? (
            <button
              onClick={() => router.push("/refunds/create")}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Ajouter une nouvelle demande
            </button>
          ) : undefined
        }
      />

      <DataTable
        title="Liste des demandes de remboursements"
        columns={columns}
        data={refunds}
        isLoading={isLoading}
      />

      <DataTable
        title="Historique des demandes de remboursements"
        columns={logColumns}
        data={allLogs}
        isLoading={isLoading}
      />

      {/* ---- Modal édition ---- */}
      {editing && (
        <EditRefundModal refund={editing} onClose={() => setEditing(null)} />
      )}

      {/* ---- Modal détail ---- */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">
                Demande {detail.code ?? ""}{" "}
                <span className="font-normal text-gray-500">
                  [{statusLabel(detail.status)}]
                </span>
              </h2>
              <button
                onClick={() => setDetail(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="max-h-96 space-y-2 overflow-y-auto p-6 text-sm">
              <p>
                <span className="font-medium">Description :</span> {detail.note ?? ""}
              </p>
              <p>
                <span className="font-medium">Raison :</span>{" "}
                {detail.refundReasonLabel ?? ""}
              </p>
              <p>
                <span className="font-medium">Montant :</span> {detail.montant}
              </p>
              <p>
                <span className="font-medium">Facture référence :</span>{" "}
                {detail.invoiceCode ?? ""}
              </p>
              <p>
                <span className="font-medium">Pièce jointe :</span>{" "}
                {detail.attachment ? (
                  <button
                    type="button"
                    onClick={() => openDocFile({ fileId: detail.fileId, path: detail.attachment })}
                    className="text-blue-600 hover:underline"
                  >
                    Voir
                  </button>
                ) : (
                  ""
                )}
              </p>

              <h3 className="pt-4 text-sm font-semibold text-gray-900">
                Historique des mises à jour
              </h3>
              <TableLengthControl pagination={detailLogsPagination} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase text-gray-500">
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">Demande de rembousement</th>
                      <th className="pb-2 pr-4">Utilisateur</th>
                      <th className="pb-2 pr-4">Operation</th>
                      <th className="pb-2">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detailLogsPagination.pageRows.map((l, i) => (
                      <tr key={l.id ?? i}>
                        <td className="py-2 pr-4">
                          {detailLogsPagination.offset + i + 1}
                        </td>
                        <td className="py-2 pr-4">{detail.code ?? ""}</td>
                        <td className="py-2 pr-4">{l.userFullName ?? ""}</td>
                        <td className="py-2 pr-4">{l.operation}</td>
                        <td className="py-2 text-gray-500">
                          {formatDateTime(l.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <TablePaginationFooter pagination={detailLogsPagination} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mention colorée du titre de la modale détail. */
function statusLabel(status: string): string {
  if (status === "En attente") return "En attente";
  if (status === "Aprouvé") return "Aprouvée";
  if (status === "Rejeté") return "Rejetée";
  return "Clôturée";
}
