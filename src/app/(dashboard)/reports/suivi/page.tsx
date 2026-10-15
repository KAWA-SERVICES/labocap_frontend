"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AxiosError } from "axios";
import { MessageSquare, Phone } from "lucide-react";

import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { NativeSelect } from "@/components/ui/NativeSelect";
import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { SignaturePad, type SignaturePadHandle } from "@/components/common/SignaturePad";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import {
  reportsApi,
  type ReportSuivi,
  type ReportSuiviRow,
} from "@/lib/api/reports";
import { typeOrdersApi, type TypeOrder } from "@/lib/api/examens";
import type { ApiError, PageResponse } from "@/types/api";
import { cn } from "@/lib/utils";
import { sanitize } from "@/lib/sanitize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TabId = "demandes" | "rapports";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Tous" },
  { value: "1", label: "Livrée" },
  { value: "5", label: "Non livrée" },
  { value: "2", label: "Informée" },
  { value: "3", label: "En attente" },
  { value: "4", label: "Terminée" },
];

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Tous" },
  { value: "Urgent", label: "Urgent" },
  { value: "Retard", label: "En retard" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR");
}

function formatDateTime(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR");
}

// ---------------------------------------------------------------------------
// Pill tabs
// ---------------------------------------------------------------------------

interface PillTabsProps {
  active: TabId;
  onChange: (tab: TabId) => void;
}

function PillTabs({ active, onChange }: PillTabsProps) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "demandes", label: "Liste des demandes suivi" },
    { id: "rapports", label: "Rapports" },
  ];
  return (
    <div className="flex flex-wrap gap-3">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "rounded-full px-6 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suivi row cells (reproduce blade partials)
// ---------------------------------------------------------------------------

function MacroCell({ row }: { row: ReportSuiviRow }) {
  return row.hasMacro ? (
    <span className="inline-flex items-center rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white">
      Oui
    </span>
  ) : (
    <span className="inline-flex items-center rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white">
      Non
    </span>
  );
}

function ReportCell({ row }: { row: ReportSuiviRow }) {
  if (row.reportStatus === "VALIDATED" || row.reportStatus === "DELIVERED") {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white">
          Terminer
        </span>
        {row.assignedDoctorName ? (
          <small className="text-[11px] font-semibold uppercase text-gray-500">
            {row.assignedDoctorName}
          </small>
        ) : null}
      </div>
    );
  }
  if (row.assignedDoctorName) {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center rounded-md bg-yellow-500 px-3 py-1 text-xs font-medium text-white">
          Affecter
        </span>
        <small className="text-[11px] font-semibold uppercase text-gray-500">
          {row.assignedDoctorName}
        </small>
      </div>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white">
      Non affecter
    </span>
  );
}

interface CallCellProps {
  row: ReportSuiviRow;
  onMarkInformed: (row: ReportSuiviRow) => void;
  onNotify: (row: ReportSuiviRow) => void;
}

function CallCell({ row, onMarkInformed, onNotify }: CallCellProps) {
  const { can } = usePermissions();
  const phone = row.patientPhone ?? "";
  const reportTerminated =
    row.reportStatus === "VALIDATED" || row.reportStatus === "DELIVERED";

  // Appel vocal / SMS OurVoice : nécessite la permission, un CR terminé et un téléphone.
  //
  // La permission lue est celle de la remise, non celle de la rédaction : prévenir
  // un patient que son résultat l'attend relève du guichet, et c'est ce que le
  // serveur exige désormais sur ces routes. Lire `edit-reports` ici afficherait le
  // bouton à un rédacteur qui n'a pas le droit de s'en servir.
  const canNotify =
    can(PERMISSIONS.DELIVER_REPORTS) && reportTerminated && !!phone && !!row.reportId;

  // Un seul bouton : c'est le serveur qui choisit le canal, comme l'action
  // Laravel `callOrSendSms` (SMS si le bon porte l'option, sinon appel vocal et
  // seulement entre 8h et 18h). Deux boutons distincts laissaient l'utilisateur
  // contourner cette règle et déclencher un appel en pleine nuit.
  const actions = canNotify ? (
    <button
      type="button"
      onClick={() => onNotify(row)}
      title="Prévenir le patient (SMS ou appel vocal selon le bon)"
      className="inline-flex items-center justify-center gap-1 rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-blue-600"
    >
      <Phone className="h-3.5 w-3.5" />
      <MessageSquare className="h-3.5 w-3.5" />
    </button>
  ) : null;

  if (row.isCalled) {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white">
          Oui
        </span>
        {phone ? (
          <small className="text-[11px] font-semibold uppercase text-gray-500">
            {phone}
          </small>
        ) : null}
        {actions}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => onMarkInformed(row)}
        disabled={!reportTerminated}
        className={cn(
          "inline-flex w-fit items-center rounded-md px-3 py-1 text-xs font-medium text-white transition-colors",
          reportTerminated
            ? "bg-red-600 hover:bg-red-700"
            : "cursor-not-allowed bg-red-300",
        )}
      >
        Non
      </button>
      {phone ? (
        <small className="text-[11px] font-semibold uppercase text-gray-500">
          {phone}
        </small>
      ) : null}
      {actions}
    </div>
  );
}

interface DeliveryCellProps {
  row: ReportSuiviRow;
  onOpenSignature: (row: ReportSuiviRow) => void;
  onOpenDetail: (row: ReportSuiviRow) => void;
}

function DeliveryCell({ row, onOpenSignature, onOpenDetail }: DeliveryCellProps) {
  const reportTerminated =
    row.reportStatus === "VALIDATED" || row.reportStatus === "DELIVERED";

  if (row.isDelivered) {
    return (
      <Button size="sm" onClick={() => onOpenDetail(row)}>
        Détail
      </Button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onOpenSignature(row)}
      disabled={!reportTerminated}
      className={cn(
        "inline-flex items-center rounded-md px-3 py-1 text-xs font-medium text-white transition-colors",
        reportTerminated
          ? "bg-red-600 hover:bg-red-700"
          : "cursor-not-allowed bg-red-300",
      )}
    >
      Non
    </button>
  );
}

// ---------------------------------------------------------------------------
// Signature modal
// ---------------------------------------------------------------------------

interface SignatureModalProps {
  row: ReportSuiviRow | null;
  onClose: () => void;
  onSubmit: (signatorName: string, relation: string, signature: string) => void;
  isSubmitting: boolean;
}

function SignatureModal({ row, onClose, onSubmit, isSubmitting }: SignatureModalProps) {
  if (!row) return null;
  // Le `key` posé par le parent garantit un remontage lors d'un changement de ligne,
  // ce qui réinitialise naturellement les états locaux (pas besoin de useEffect-reset).
  return (
    <SignatureModalInner
      row={row}
      onClose={onClose}
      onSubmit={onSubmit}
      isSubmitting={isSubmitting}
    />
  );
}

interface SignatureModalInnerProps {
  row: ReportSuiviRow;
  onClose: () => void;
  onSubmit: (signatorName: string, relation: string, signature: string) => void;
  isSubmitting: boolean;
}

function SignatureModalInner({
  row,
  onClose,
  onSubmit,
  isSubmitting,
}: SignatureModalInnerProps) {
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [retrieverName, setRetrieverName] = useState("");
  const [relation, setRelation] = useState("");
  const [usePatientName, setUsePatientName] = useState(false);

  const fullPatientName = `${row.patientFirstname ?? ""} ${row.patientLastname ?? ""}`.trim();

  const handleTogglePatient = (checked: boolean) => {
    setUsePatientName(checked);
    setRetrieverName(checked ? fullPatientName : "");
    // Cocher la case répond déjà à « à quel titre ? ». Décocher rend la main
    // sans effacer ce que l'agent aurait écrit entre-temps.
    if (checked) setRelation("Lui-même");
  };

  /**
   * La case « Patient lui-même » est un raccourci de saisie, pas un verrou : le
   * nom reste modifiable même une fois pré-rempli (un patient se fait souvent
   * représenter, et le nom de l'état civil n'est pas toujours celui qu'on
   * inscrit). Dès que la saisie s'écarte du nom du patient, la case se décoche
   * d'elle-même — elle décrirait sinon un récupérateur qui n'est plus le bon.
   *
   * On ne retouche jamais le nom ici : `handleTogglePatient` le vide au
   * décochage, et l'appeler à cet endroit effacerait la frappe en cours.
   */
  const handleNameChange = (value: string) => {
    setRetrieverName(value);
    if (usePatientName && value !== fullPatientName) {
      setUsePatientName(false);
    }
  };

  const handleClear = () => {
    padRef.current?.clear();
  };

  const handleSubmit = () => {
    if (!retrieverName.trim()) {
      toast.error("Veuillez saisir le nom du récupérateur");
      return;
    }
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      toast.error("Veuillez signer dans le cadre prévu");
      return;
    }
    onSubmit(retrieverName.trim(), relation.trim(), pad.toDataURL());
  };

  return (
    <CrudModal
      isOpen
      onClose={onClose}
      title={`Compte rendu : ${row.testOrderCode}`}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleClear}
            disabled={isSubmitting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            Effacer
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting && (
                <svg
                  className="h-4 w-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
              )}
              Enregistrer
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Demande d&apos;examen :{" "}
          <span className="font-semibold text-gray-900">{row.testOrderCode}</span>
        </p>

        <div>
          <label
            htmlFor="retriever-name"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Nom du récupérateur <span className="text-red-500">*</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="retriever-name"
              type="text"
              value={retrieverName}
              onChange={(e) => handleNameChange(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="Saisir le nom du récupérateur"
            />
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={usePatientName}
                onChange={(e) => handleTogglePatient(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              Patient lui-même
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Signature <span className="text-red-500">*</span>
          </label>
          <SignaturePad ref={padRef} height={220} />
          <p className="mt-1 text-xs text-gray-500">
            Signez à l&apos;aide de la souris ou directement avec le doigt sur écran tactile.
          </p>
        </div>
      </div>
    </CrudModal>
  );
}

// ---------------------------------------------------------------------------
// Delivery detail modal
// ---------------------------------------------------------------------------

interface DeliveryDetailModalProps {
  row: ReportSuiviRow | null;
  onClose: () => void;
}

function DeliveryDetailModal({ row, onClose }: DeliveryDetailModalProps) {
  if (!row) return null;

  const sig = row.retrieverSignature;
  const isPng = sig?.startsWith("data:image/png;base64,") ?? false;
  const isSvg = sig?.startsWith("<svg") || sig?.startsWith("<?xml") || false;

  return (
    <CrudModal
      isOpen
      onClose={onClose}
      title={`Détails — ${row.testOrderCode}`}
      size="lg"
      footer={
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
          >
            Fermer
          </button>
        </div>
      }
    >
      <dl className="space-y-3 text-sm">
        <div>
          <dt className="text-gray-500">Demande d&apos;examen</dt>
          <dd className="font-semibold text-gray-900">{row.testOrderCode}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Date de récupération</dt>
          <dd className="font-semibold text-gray-900">
            {formatDateTime(row.deliveryDate)}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Nom du récupérateur</dt>
          <dd className="font-semibold text-gray-900">
            {row.retrieverName ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="mb-2 text-gray-500">Signature</dt>
          <dd>
            {sig ? (
              isPng ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sig}
                  alt={`Signature de ${row.retrieverName ?? "—"}`}
                  className="max-h-64 w-full rounded-md border border-gray-200 bg-white object-contain"
                />
              ) : isSvg ? (
                <div
                  className="max-h-64 w-full overflow-hidden rounded-md border border-gray-200 bg-white p-2"
                  dangerouslySetInnerHTML={{ __html: sanitize(sig, "svg") }}
                />
              ) : (
                <p className="text-gray-500">Signature non disponible</p>
              )
            ) : (
              <p className="text-gray-500">Signature non disponible</p>
            )}
          </dd>
        </div>
      </dl>
    </CrudModal>
  );
}

// ---------------------------------------------------------------------------
// Rapports tab (stats — préservé de l'ancienne page)
// ---------------------------------------------------------------------------

function RapportsTab({
  data,
  isLoading,
  selectedYear,
  selectedMonth,
  onYearChange,
  onMonthChange,
}: {
  data: ReportSuivi | undefined;
  isLoading: boolean;
  selectedYear: number | undefined;
  selectedMonth: number | undefined;
  onYearChange: (y: number | undefined) => void;
  onMonthChange: (m: number | undefined) => void;
}) {
  const years = data?.listYears ?? [];

  const MONTHS = [
    { value: 1, label: "Janvier" },
    { value: 2, label: "Février" },
    { value: 3, label: "Mars" },
    { value: 4, label: "Avril" },
    { value: 5, label: "Mai" },
    { value: 6, label: "Juin" },
    { value: 7, label: "Juillet" },
    { value: 8, label: "Août" },
    { value: 9, label: "Septembre" },
    { value: 10, label: "Octobre" },
    { value: 11, label: "Novembre" },
    { value: 12, label: "Décembre" },
  ];

  const monthLabel = selectedMonth
    ? MONTHS.find((m) => m.value === selectedMonth)?.label
    : undefined;
  const periodeLabel = `${monthLabel ?? "Tous"} - ${selectedYear ?? "Tous"}`;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-gray-500">
          Impossible de charger les données de suivi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtres période */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Année
          </label>
          <NativeSelect
            value={selectedYear ?? ""}
            onChange={(e) =>
              onYearChange(e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">Toutes</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">
            Mois
          </label>
          <NativeSelect
            value={selectedMonth ?? ""}
            onChange={(e) =>
              onMonthChange(e.target.value ? Number(e.target.value) : undefined)
            }
          >
            <option value="">Tous</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {/* Tableau de synthèse par période (réplique Laravel onglet "Rapports") */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm [&_th]:border-r [&_th]:border-gray-300 [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-gray-200 [&_td:last-child]:border-r-0">
            <thead className="border-b-2 border-gray-300 bg-gray-200">
              <tr>
                {[
                  "Période",
                  "Demande d'examen",
                  "Macro",
                  "Compte rendu",
                  "Patient informé",
                  "Patient livré",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-800"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr className="align-top">
                <td className="px-4 py-3 font-medium text-gray-700">
                  {periodeLabel}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <div className="font-semibold text-gray-900">
                    Total : {data.examens.totalGeneral}
                  </div>
                  <div>Histologie : {data.examens.histologie}</div>
                  <div>Immuno Externe : {data.examens.immunoExterne}</div>
                  <div>Immuno Interne : {data.examens.immunoInterne}</div>
                  <div>Cytologie : {data.examens.cytologie}</div>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <div>Réalisé : {data.macros.pathology}</div>
                  <div>
                    Non Réalisé :{" "}
                    {Math.max(0, data.examens.totalGeneral - data.macros.pathology)}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <div>En attente : {data.rapports.attente}</div>
                  <div>Affecté : {data.rapports.affecte}</div>
                  <div>Terminée : {data.rapports.termine}</div>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <div>
                    En attente :{" "}
                    {Math.max(0, data.examens.totalGeneral - data.patientCalled.called)}
                  </div>
                  <div>Informé : {data.patientCalled.called}</div>
                </td>
                <td className="px-4 py-3 text-gray-700">
                  <div>En attente : {data.patientCalled.notDeliver}</div>
                  <div>Livré : {data.patientCalled.deliver}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demandes tab
// ---------------------------------------------------------------------------

interface DemandesTabProps {
  search: string;
  setSearch: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
  priority: string;
  setPriority: (v: string) => void;
  typeOrderId: string;
  setTypeOrderId: (v: string) => void;
  dateBegin: string;
  setDateBegin: (v: string) => void;
  dateEnd: string;
  setDateEnd: (v: string) => void;
  page: number;
  setPage: (v: number) => void;
  pageSize: number;
  setPageSize: (v: number) => void;
  rowsData: PageResponse<ReportSuiviRow> | undefined;
  isLoading: boolean;
  isError: boolean;
  typeOrders: TypeOrder[];
  onMarkInformed: (row: ReportSuiviRow) => void;
  onNotify: (row: ReportSuiviRow) => void;
  onOpenSignature: (row: ReportSuiviRow) => void;
  onOpenDetail: (row: ReportSuiviRow) => void;
}

function DemandesTab({
  search,
  setSearch,
  status,
  setStatus,
  priority,
  setPriority,
  typeOrderId,
  setTypeOrderId,
  dateBegin,
  setDateBegin,
  dateEnd,
  setDateEnd,
  page,
  setPage,
  pageSize,
  setPageSize,
  rowsData,
  isLoading,
  isError,
  typeOrders,
  onMarkInformed,
  onNotify,
  onOpenSignature,
  onOpenDetail,
}: DemandesTabProps) {
  const rows = rowsData?.content ?? [];
  const totalElements = rowsData?.totalElements ?? 0;
  const totalPages = rowsData?.totalPages ?? 0;

  const handleFilterChange = (fn: () => void) => {
    fn();
    setPage(0);
  };

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label
              htmlFor="filter-search"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Rechercher
            </label>
            <input
              id="filter-search"
              type="text"
              value={search}
              onChange={(e) => handleFilterChange(() => setSearch(e.target.value))}
              placeholder="Code, patient, médecin..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="filter-status"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Status
            </label>
            <NativeSelect
              id="filter-status"
              value={status}
              onChange={(e) => handleFilterChange(() => setStatus(e.target.value))}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <label
              htmlFor="filter-priority"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Priorité
            </label>
            <NativeSelect
              id="filter-priority"
              value={priority}
              onChange={(e) =>
                handleFilterChange(() => setPriority(e.target.value))
              }
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <label
              htmlFor="filter-type"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Type d&apos;examen
            </label>
            <NativeSelect
              id="filter-type"
              value={typeOrderId}
              onChange={(e) =>
                handleFilterChange(() => setTypeOrderId(e.target.value))
              }
            >
              <option value="">Tous</option>
              {typeOrders.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <label
              htmlFor="filter-date-begin"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Date début
            </label>
            <input
              id="filter-date-begin"
              type="date"
              value={dateBegin}
              onChange={(e) =>
                handleFilterChange(() => setDateBegin(e.target.value))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label
              htmlFor="filter-date-end"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Date fin
            </label>
            <input
              id="filter-date-end"
              type="date"
              value={dateEnd}
              onChange={(e) =>
                handleFilterChange(() => setDateEnd(e.target.value))
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm [&_th]:border-r [&_th]:border-gray-300 [&_th:last-child]:border-r-0 [&_td]:border-r [&_td]:border-gray-200 [&_td:last-child]:border-r-0">
            <thead className="border-b-2 border-gray-300 bg-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-800">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-800">
                  Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-800">
                  Macro
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-800">
                  Compte rendu
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-800">
                  Patient informé
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-800">
                  Patient livré
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                Array.from({ length: Math.min(pageSize, 10) }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 animate-pulse rounded bg-gray-200" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-red-600"
                  >
                    Erreur lors du chargement des demandes. Vérifiez que
                    l&apos;endpoint <code>/reports/suivi/list</code> est disponible.
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-gray-500"
                  >
                    Aucune demande trouvée
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.reportId}
                    className={cn(
                      "transition-colors hover:bg-gray-50",
                      row.isUrgent && "bg-red-50 hover:bg-red-100",
                    )}
                  >
                    <td className="px-4 py-3 align-top text-gray-700">
                      {formatDate(row.createdAt)}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-mono text-xs font-semibold text-gray-900">
                        {row.testOrderCode}
                      </div>
                      {row.typeOrderTitle ? (
                        <small className="text-[11px] font-semibold uppercase text-gray-500">
                          {row.typeOrderTitle}
                        </small>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <MacroCell row={row} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <ReportCell row={row} />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <CallCell
                        row={row}
                        onMarkInformed={onMarkInformed}
                        onNotify={onNotify}
                      />
                    </td>
                    <td className="px-4 py-3 align-top">
                      <DeliveryCell
                        row={row}
                        onOpenSignature={onOpenSignature}
                        onOpenDetail={onOpenDetail}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Lignes par page :</span>
          <NativeSelect
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
          >
            {PAGE_SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
          <span className="ml-2">
            {totalElements} résultat{totalElements > 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0 || isLoading}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-[.9rem] text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Précédent
          </button>
          <span className="text-sm text-gray-600">
            Page {totalPages === 0 ? 0 : page + 1} sur {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={page + 1 >= totalPages || isLoading}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-[.9rem] text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ReportsSuiviPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("demandes");

  // ----- Onglet "Liste des demandes" -----
  const [search, setSearch] = useState("");
  // Recherche debouncée : le champ reste réactif, mais la requête n'est
  // déclenchée qu'après ~350 ms d'inactivité pour éviter une requête par frappe.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [typeOrderId, setTypeOrderId] = useState("");
  const [dateBegin, setDateBegin] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  // ----- Onglet "Rapports" (stats) -----
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined);

  // ----- Modales -----
  const [signatureRow, setSignatureRow] = useState<ReportSuiviRow | null>(null);
  const [detailRow, setDetailRow] = useState<ReportSuiviRow | null>(null);
  const [informRow, setInformRow] = useState<ReportSuiviRow | null>(null);

  // Debounce de la recherche
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // ----- Queries -----
  const suiviStatsQuery = useQuery<ReportSuivi>({
    queryKey: ["reports-suivi-stats", selectedYear, selectedMonth],
    queryFn: async () => {
      const params: { year?: number; month?: number } = {};
      if (selectedYear) params.year = selectedYear;
      if (selectedMonth) params.month = selectedMonth;
      const res = await reportsApi.getSuivi(
        Object.keys(params).length > 0 ? params : undefined,
      );
      return res.data;
    },
  });

  const listParams = useMemo(() => {
    const params: Record<string, unknown> = { page, size: pageSize };
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (status) params.status = Number(status);
    if (typeOrderId) params.typeOrderId = typeOrderId;
    if (dateBegin) params.dateBegin = dateBegin;
    if (dateEnd) params.dateEnd = dateEnd;
    if (priority === "Urgent") params.isUrgent = true;
    if (priority === "Retard") params.isLate = true;
    return params;
  }, [page, pageSize, debouncedSearch, status, typeOrderId, dateBegin, dateEnd, priority]);

  const listQuery = useQuery<PageResponse<ReportSuiviRow>>({
    queryKey: ["reports-suivi-list", listParams],
    queryFn: async () => {
      const res = await reportsApi.getSuiviList(listParams);
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  const typeOrdersQuery = useQuery<TypeOrder[]>({
    queryKey: ["type-orders-all"],
    queryFn: async () => {
      const res = await typeOrdersApi.findAll();
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
  });

  // ----- Mutations -----
  const informedMutation = useMutation({
    mutationFn: (id: string) => reportsApi.informedPatient(id),
    onSuccess: () => {
      toast.success("Patient marqué comme informé");
      setInformRow(null);
      queryClient.invalidateQueries({ queryKey: ["reports-suivi-list"] });
      queryClient.invalidateQueries({ queryKey: ["reports-suivi-stats"] });
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(
        err.response?.data?.message ?? "Erreur lors de la mise à jour",
      );
    },
  });

  // Notification du patient : le canal est décidé côté serveur (SMS si le bon
  // porte l'option, sinon appel vocal dans la plage 8h–18h), comme l'action
  // Laravel `callOrSendSms`. La réponse dit ce qui a réellement été fait.
  const notifyMutation = useMutation({
    mutationFn: (reportId: string) => reportsApi.notifyPatient(reportId),
    onSuccess: (res) => {
      const data = res.data;
      if (data?.channel === "NONE") toast.warning(data.message);
      else toast.success(data?.message ?? "Patient notifié");
      queryClient.invalidateQueries({ queryKey: ["reports-suivi-list"] });
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(
        err.response?.data?.message ?? "Erreur lors de la notification du patient",
      );
    },
  });

  const signatureMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { signatorName: string; relation?: string; signature: string };
    }) => reportsApi.storeSignature(id, data),
    onSuccess: () => {
      toast.success("Signature enregistrée avec succès");
      setSignatureRow(null);
      queryClient.invalidateQueries({ queryKey: ["reports-suivi-list"] });
      queryClient.invalidateQueries({ queryKey: ["reports-suivi-stats"] });
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(
        err.response?.data?.message ?? "Erreur lors de l'enregistrement",
      );
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suivi des demandes"
        breadcrumbs={[
          { label: "Accueil", href: "/home" },
          { label: "Comptes rendus", href: "/reports" },
          { label: "Suivi" },
        ]}
      />

      <PillTabs active={activeTab} onChange={setActiveTab} />

      {activeTab === "demandes" ? (
        <DemandesTab
          search={search}
          setSearch={setSearch}
          status={status}
          setStatus={setStatus}
          priority={priority}
          setPriority={setPriority}
          typeOrderId={typeOrderId}
          setTypeOrderId={setTypeOrderId}
          dateBegin={dateBegin}
          setDateBegin={setDateBegin}
          dateEnd={dateEnd}
          setDateEnd={setDateEnd}
          page={page}
          setPage={setPage}
          pageSize={pageSize}
          setPageSize={setPageSize}
          rowsData={listQuery.data}
          isLoading={listQuery.isLoading}
          isError={listQuery.isError}
          typeOrders={typeOrdersQuery.data ?? []}
          onMarkInformed={(r) => setInformRow(r)}
          onNotify={(r) => r.reportId && notifyMutation.mutate(r.reportId)}
          onOpenSignature={(r) => setSignatureRow(r)}
          onOpenDetail={(r) => setDetailRow(r)}
        />
      ) : (
        <RapportsTab
          data={suiviStatsQuery.data}
          isLoading={suiviStatsQuery.isLoading}
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          onYearChange={setSelectedYear}
          onMonthChange={setSelectedMonth}
        />
      )}

      {/* Modales */}
      <ConfirmModal
        isOpen={!!informRow}
        onClose={() => setInformRow(null)}
        onConfirm={() => informRow && informedMutation.mutate(informRow.reportId)}
        title="Marquer comme informé"
        message={
          informRow
            ? `Confirmer que le patient pour la demande ${informRow.testOrderCode} a bien été informé ?`
            : ""
        }
        confirmLabel="Confirmer"
        confirmVariant="primary"
        isLoading={informedMutation.isPending}
      />

      <SignatureModal
        key={signatureRow?.reportId ?? "closed"}
        row={signatureRow}
        onClose={() => setSignatureRow(null)}
        onSubmit={(signatorName, relation, signature) => {
          if (!signatureRow) return;
          signatureMutation.mutate({
            id: signatureRow.reportId,
            // La qualité n'est envoyée que si elle a été saisie : une chaîne
            // vide écrirait un blanc en base, indistinguable d'un champ rempli
            // puis effacé.
            data: relation
              ? { signatorName, relation, signature }
              : { signatorName, signature },
          });
        }}
        isSubmitting={signatureMutation.isPending}
      />

      <DeliveryDetailModal
        row={detailRow}
        onClose={() => setDetailRow(null)}
      />
    </div>
  );
}
