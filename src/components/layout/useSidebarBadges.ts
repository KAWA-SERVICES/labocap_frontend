"use client";

import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { testOrdersApi } from "@/lib/api/testOrders";
import { inventoryApi } from "@/lib/api/inventory";
import { refundsApi } from "@/lib/api/refunds";
import { invoicesApi } from "@/lib/api/invoices";
import { cashboxApi } from "@/lib/api/cashbox";
import { supportApi } from "@/lib/api/support";

/** Compteurs affichés en pastille dans le menu, référencés par `nav-config`. */
export type BadgeKey =
  | "immunoPending"
  | "stockMinimum"
  | "refundPending"
  | "testOrderPending"
  | "invoicePending"
  | "voucherPending"
  | "ticketOpen";

/**
 * Compteurs du menu latéral. `undefined` tant que la requête n'a pas répondu
 * (ou n'est pas autorisée) : le menu l'affiche comme 0, c'est-à-dire sans
 * pastille.
 */
export function useSidebarBadges(): Record<BadgeKey, number | undefined> {
  const { can } = usePermissions();

  const { data: immunoPendingCount } = useQuery({
    queryKey: ["immuno-pending-count"],
    queryFn: () => testOrdersApi.countImmunoPending().then((r) => r.data.count),
    enabled: can(PERMISSIONS.VIEW_TEST_ORDERS),
    refetchOnWindowFocus: false,
  });

  // Badge « Stocks » : articles ayant atteint le stock minimum (getnbrStockMinim).
  const { data: stockMinimumCount } = useQuery({
    queryKey: ["stock-minimum-count"],
    queryFn: () => inventoryApi.countStockMinimum().then((r) => r.data.count),
    enabled: can(PERMISSIONS.VIEW_ARTICLES),
    refetchOnWindowFocus: false,
  });

  // Badge « Remboursements » : demandes en attente (getnbrRefundRequestPending).
  const { data: refundPendingCount } = useQuery({
    queryKey: ["refund-pending-count"],
    queryFn: () => refundsApi.countPending().then((r) => r.data.count),
    enabled: can(PERMISSIONS.VIEW_REFUNDS),
    refetchOnWindowFocus: false,
  });

  // Badge « Demandes d'examen » : bons cyto/histo en attente (getnbrTestOrderpending).
  const { data: testOrderPendingCount } = useQuery({
    queryKey: ["test-order-pending-count"],
    queryFn: () => testOrdersApi.countPending().then((r) => r.data.count),
    enabled: can(PERMISSIONS.VIEW_TEST_ORDERS),
    refetchOnWindowFocus: false,
  });

  // Badge « Factures » : factures non réglées (getnbrInvoicepending).
  const { data: invoicePendingCount } = useQuery({
    queryKey: ["invoice-pending-count"],
    queryFn: () => invoicesApi.countUnpaid().then((r) => r.data.count),
    enabled: can(PERMISSIONS.VIEW_INVOICES),
    refetchOnWindowFocus: false,
  });

  // Badge « Caisses » : bons de caisse en attente (getnbrBonCaissePending).
  const { data: voucherPendingCount } = useQuery({
    queryKey: ["cashbox-voucher-pending-count"],
    queryFn: () => cashboxApi.countPendingVouchers().then((r) => r.data.count),
    enabled: can(PERMISSIONS.VIEW_CASHBOXES),
    refetchOnWindowFocus: false,
  });

  // Badge « Signaler un problème » : tickets ouverts (getnbrTicketPending).
  const { data: ticketOpenCount } = useQuery({
    queryKey: ["ticket-open-count"],
    queryFn: () => supportApi.countOpen().then((r) => r.data.count),
    refetchOnWindowFocus: false,
  });

  return {
    immunoPending: immunoPendingCount,
    stockMinimum: stockMinimumCount,
    refundPending: refundPendingCount,
    testOrderPending: testOrderPendingCount,
    invoicePending: invoicePendingCount,
    voucherPending: voucherPendingCount,
    ticketOpen: ticketOpenCount,
  };
}
