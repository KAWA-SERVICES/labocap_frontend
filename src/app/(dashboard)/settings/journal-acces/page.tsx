"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { PageHeader } from "@/components/ui/PageHeader";
import { DataTableCard } from "@/components/common/DataTableCard";
import { PermissionGate } from "@/components/common/PermissionGate";
import { FormField } from "@/components/ui/FormField";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { Button } from "@/components/ui/Button";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";
import {
  ACTION_LABELS,
  ENTITY_TYPE_LABELS,
  auditApi,
  type AuditEntityType,
  type AuditParams,
  type LigneAcces,
} from "@/lib/api/audit";
import { usersApi } from "@/lib/api/users";
import { formaterDate, lignesEnCsv, telechargerCsv } from "@/lib/audit-csv";

const columns: ColumnDef<LigneAcces>[] = [
  { header: "Date", id: "at", cell: ({ row }) => formaterDate(row.original.at) },
  { header: "Utilisateur", accessorKey: "utilisateur" },
  { header: "Action", id: "action", cell: ({ row }) => ACTION_LABELS[row.original.action] ?? row.original.action },
  { header: "Type", id: "type", cell: ({ row }) => ENTITY_TYPE_LABELS[row.original.entityType] ?? row.original.entityType },
  {
    header: "Identifiant",
    accessorKey: "entityId",
    cell: ({ row }) => <span className="font-mono text-xs text-gray-600">{row.original.entityId}</span>,
  },
  { header: "Adresse IP", accessorKey: "ip" },
];

/**
 * Journal des consultations : qui a lu, téléchargé ou imprimé quoi. Lecture
 * seule — l'écriture est faite par l'API au moment de chaque accès.
 */
export default function JournalAccesPage() {
  const { can } = usePermissions();
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");
  const [userId, setUserId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  // Les dates viennent d'un `<input type="date">` (AAAA-MM-JJ) ; l'API attend
  // un date-time, on couvre la journée entière.
  const params: AuditParams = { page, size: pageSize };
  if (entityType) params.entityType = entityType as AuditEntityType;
  if (entityId.trim()) params.entityId = entityId.trim();
  if (userId.trim()) params.userId = userId.trim();
  if (from) params.from = `${from}T00:00:00`;
  if (to) params.to = `${to}T23:59:59`;

  const { data, isLoading } = useQuery({
    queryKey: ["audit-acces", params],
    queryFn: () => auditApi.findAcces(params).then((r) => r.data),
    enabled: can(PERMISSIONS.VIEW_AUDIT),
  });
  const lignes = data?.content ?? [];

  // `/users` exige `edit-users` : sans ce droit on retombe sur un champ UUID.
  const peutListerUtilisateurs = can(PERMISSIONS.EDIT_USERS);
  const { data: utilisateurs } = useQuery({
    queryKey: ["users-select"],
    queryFn: () => usersApi.findAll({ size: 500 }).then((r) => r.data.content),
    enabled: peutListerUtilisateurs,
  });

  // Chaque filtre renvoie à la première page : la page courante n'a plus de sens.
  const filtre = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };

  const exporter = () =>
    telechargerCsv(`journal-acces-${new Date().toISOString().slice(0, 10)}.csv`, lignesEnCsv(lignes));

  return (
    <PermissionGate
      permission={PERMISSIONS.VIEW_AUDIT}
      fallback={<p className="text-gray-600">Vous n&apos;avez pas accès au journal des consultations.</p>}
    >
      <div className="space-y-6">
        <PageHeader
          title="Journal d'accès"
          action={
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={exporter} disabled={lignes.length === 0}>
              Exporter la page (CSV)
            </Button>
          }
        />

        <DataTableCard
          columns={columns}
          data={lignes}
          isLoading={isLoading}
          hideToolbarSearch
          emptyTitle="Aucune consultation"
          emptyDescription="Aucun accès ne correspond aux filtres."
          pageCount={data?.totalPages ?? 0}
          pageIndex={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={filtre(setPageSize)}
          filters={
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <FormField label="Type">
                <NativeSelect value={entityType} onChange={(e) => filtre(setEntityType)(e.target.value)} placeholder="Tous">
                  <option value="">Tous</option>
                  {Object.entries(ENTITY_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </NativeSelect>
              </FormField>
              <FormField label="Identifiant">
                <input
                  type="text"
                  value={entityId}
                  onChange={(e) => filtre(setEntityId)(e.target.value)}
                  placeholder="UUID ou chemin de fichier"
                  className={inputClass}
                />
              </FormField>
              <FormField label="Utilisateur">
                {peutListerUtilisateurs ? (
                  <NativeSelect value={userId} onChange={(e) => filtre(setUserId)(e.target.value)} placeholder="Tous">
                    <option value="">Tous</option>
                    {(utilisateurs ?? []).map((u) => (
                      <option key={u.id} value={u.id}>{`${u.firstname} ${u.lastname}`}</option>
                    ))}
                  </NativeSelect>
                ) : (
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => filtre(setUserId)(e.target.value)}
                    placeholder="UUID de l'utilisateur"
                    className={inputClass}
                  />
                )}
              </FormField>
              <FormField label="Du">
                <input type="date" value={from} onChange={(e) => filtre(setFrom)(e.target.value)} className={inputClass} />
              </FormField>
              <FormField label="Au">
                <input type="date" value={to} onChange={(e) => filtre(setTo)(e.target.value)} className={inputClass} />
              </FormField>
            </div>
          }
        />
      </div>
    </PermissionGate>
  );
}
