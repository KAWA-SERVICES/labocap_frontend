"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Download,
  Eye,
  History,
  Pencil,
  Plus,
  Share2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { AxiosError } from "axios";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/common/DataTable";
import {
  TableLengthControl,
  TablePaginationFooter,
  useTablePagination,
} from "@/components/common/TablePagination";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { CrudModal } from "@/components/common/CrudModal";
import { PageHeader } from "@/components/ui/PageHeader";
import { SelectField } from "@/components/ui/SelectField";
import { usePermissions } from "@/hooks/usePermissions";
import {
  RowActions,
  RowActionsProvider,
  type RowAction,
} from "@/components/ui/RowActions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { formatDate } from "@/lib/utils";
import {
  docsApi,
  documentationCategoriesApi,
  type Doc,
  type DocVersion,
  downloadDocFile,
  formatFileSize,
} from "@/lib/api/docs";
import { usersApi } from "@/lib/api/users";
import type { ApiError } from "@/types/api";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocsPage() {
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  // --- Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");

  // --- Modal: suppression
  const [deleteConfirm, setDeleteConfirm] = useState<Doc | null>(null);

  // --- Modal: nouvelle version
  const [newVersionDoc, setNewVersionDoc] = useState<Doc | null>(null);
  const [nvTitle, setNvTitle] = useState("");
  const [nvFile, setNvFile] = useState<File | null>(null);
  const nvFileRef = useRef<HTMLInputElement>(null);

  // --- Modal: édition du titre (calque doc.update)
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);

  // --- Modal: historique des versions
  const [historyDoc, setHistoryDoc] = useState<Doc | null>(null);

  // --- Modal: partage par rôle
  const [shareDoc, setShareDoc] = useState<Doc | null>(null);
  const [shareRoleId, setShareRoleId] = useState("");

  // --- Query principale
  const { data, isLoading } = useQuery({
    queryKey: ["docs", { page, size: pageSize, search }],
    queryFn: () =>
      docsApi
        .findAll({ page, size: pageSize, search: search || undefined })
        .then((r) => r.data),
  });

  const docs = data?.content ?? [];
  const pageCount = data?.totalPages ?? 0;

  // --- Query catégories (pour l'affichage du nom)
  const { data: categories } = useQuery({
    queryKey: ["documentation-categories"],
    queryFn: () => documentationCategoriesApi.findAll().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const categoryMap = Object.fromEntries(
    (categories ?? []).map((c) => [c.id, c.name])
  );

  // --- Query versions (quand historyDoc est défini)
  const { data: versions, isLoading: versionsLoading } = useQuery<DocVersion[]>({
    queryKey: ["doc-versions", historyDoc?.id],
    queryFn: () => docsApi.getVersions(historyDoc!.id).then((r) => r.data),
    enabled: !!historyDoc,
  });

  // Versions les plus récentes en tête, puis paginées comme les autres tableaux.
  const sortedVersions = useMemo(
    () => [...(versions ?? [])].sort((a, b) => b.version - a.version),
    [versions],
  );
  const maxVersion = sortedVersions[0]?.version ?? 0;
  const versionsPagination = useTablePagination(sortedVersions);

  // --- Mutation: suppression
  const deleteMutation = useMutation({
    mutationFn: (id: string) => docsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docs"] });
      toast.success("Document supprimé");
      setDeleteConfirm(null);
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(err.response?.data?.message ?? "Erreur lors de la suppression");
    },
  });

  // --- Query rôles (pour le partage)
  const { data: rolesPage } = useQuery({
    queryKey: ["roles-for-share"],
    queryFn: () => usersApi.getRoles().then((r) => r.data),
    enabled: !!shareDoc,
    staleTime: 5 * 60 * 1000,
  });
  const roles = rolesPage?.content ?? [];

  // --- Mutation: partage par rôle
  const shareMutation = useMutation({
    mutationFn: ({ id, roleId }: { id: string; roleId: string }) =>
      docsApi.share(id, roleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docs"] });
      toast.success("Document partagé");
      setShareDoc(null);
      setShareRoleId("");
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(err.response?.data?.message ?? "Erreur lors du partage");
    },
  });

  // --- Mutation: nouvelle version
  const addVersionMutation = useMutation({
    mutationFn: ({ id, file, title }: { id: string; file: File; title?: string }) =>
      docsApi.addVersion(id, file, title || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docs"] });
      toast.success("Nouvelle version ajoutée");
      setNewVersionDoc(null);
      setNvTitle("");
      setNvFile(null);
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(err.response?.data?.message ?? "Erreur lors de l'ajout de version");
    },
  });

  // --- Mutation: édition du titre
  const updateTitleMutation = useMutation({
    mutationFn: ({ id, title, file }: { id: string; title: string; file?: File | null }) =>
      docsApi.updateTitle(id, title, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docs"] });
      toast.success("Document mis à jour");
      setEditDoc(null);
      setEditTitle("");
      setEditFile(null);
    },
    onError: (err: AxiosError<ApiError>) => {
      toast.error(err.response?.data?.message ?? "Erreur lors de la mise à jour");
    },
  });

  // --- Colonnes
  const columns: ColumnDef<Doc>[] = [
    {
      header: "Titre",
      accessorKey: "title",
      cell: ({ row }) => (
        <span className="font-medium text-gray-900">{row.original.title}</span>
      ),
    },
    {
      header: "Catégorie",
      id: "category",
      cell: ({ row }) => {
        const name = row.original.documentationCategoryId
          ? categoryMap[row.original.documentationCategoryId]
          : undefined;
        return name ? (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
            {name}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        );
      },
    },
    {
      header: "Taille",
      id: "fileSize",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatFileSize(row.original.fileSize)}</span>
      ),
    },
    {
      header: "Date",
      accessorKey: "createdAt",
      cell: ({ row }) => (
        <span className="text-sm text-gray-600">{formatDate(row.original.createdAt)}</span>
      ),
    },
    {
      header: "Actions",
      id: "actions",
      cell: ({ row }) => {
        const doc = row.original;

        // Sept actions : `PermissionGate` cède à `can()`, les conditions devant
        // être évaluées AVANT de construire la liste — c'est sa longueur qui
        // décide de l'affichage, et une garde en JSX arriverait trop tard.
        const actions: RowAction[] = [
          {
            label: "Voir le document",
            icon: <Eye className="h-4 w-4" />,
            href: `/docs/${doc.id}`,
          },
          {
            label: "Télécharger",
            icon: <Download className="h-4 w-4" />,
            onClick: () => downloadDocFile({ fileId: doc.fileId, path: doc.attachment }),
          },
          {
            label: "Historique des versions",
            icon: <History className="h-4 w-4" />,
            onClick: () => setHistoryDoc(doc),
          },
        ];

        if (can(PERMISSIONS.EDIT_DOCS)) {
          actions.push(
            {
              label: "Modifier le titre",
              icon: <Pencil className="h-4 w-4" />,
              onClick: () => {
                setEditDoc(doc);
                setEditTitle(doc.title);
                setEditFile(null);
              },
            },
            {
              label: "Partager",
              icon: <Share2 className="h-4 w-4" />,
              onClick: () => {
                setShareDoc(doc);
                setShareRoleId(doc.roleId ?? "");
              },
            },
            {
              label: "Nouvelle version",
              icon: <Upload className="h-4 w-4" />,
              onClick: () => {
                setNewVersionDoc(doc);
                setNvTitle("");
                setNvFile(null);
              },
            },
          );
        }

        if (can(PERMISSIONS.DELETE_DOCS)) {
          actions.push({
            label: "Supprimer",
            icon: <Trash2 className="h-4 w-4" />,
            onClick: () => setDeleteConfirm(doc),
            variant: "delete",
          });
        }

        return <RowActions actions={actions} />;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        breadcrumbs={[
          { label: "Accueil", href: "/home" },
          { label: "Documents" },
        ]}
        action={
          can(PERMISSIONS.CREATE_DOCS) ? (
            <Link
              href="/docs/create"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              Nouveau document
            </Link>
          ) : undefined
        }
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        {/* Sept actions déclarées : le tableau replie uniformément. */}
        <RowActionsProvider collapse>
          <DataTable
            columns={columns}
            data={docs}
            isLoading={isLoading}
            pageCount={pageCount}
            pageIndex={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(0);
            }}
            searchValue={search}
            onSearchChange={(val) => {
              setSearch(val);
              setPage(0);
            }}
          />
        </RowActionsProvider>
      </div>

      {/* Modal: suppression */}
      <ConfirmModal
        isOpen={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) deleteMutation.mutate(deleteConfirm.id);
        }}
        title="Supprimer ce document"
        message={
          deleteConfirm
            ? `Voulez-vous vraiment supprimer "${deleteConfirm.title}" ? Cette action est irréversible.`
            : ""
        }
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={deleteMutation.isPending}
      />

      {/* Modal: édition du titre (calque doc/edit.blade) */}
      <CrudModal
        isOpen={editDoc !== null}
        onClose={() => setEditDoc(null)}
        title="Modifier le document"
        submitLabel="Mettre à jour"
        isSubmitting={updateTitleMutation.isPending}
        onSubmit={() => {
          if (!editDoc || !editTitle.trim()) return;
          updateTitleMutation.mutate({
            id: editDoc.id,
            title: editTitle.trim(),
            file: editFile,
          });
        }}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Titre <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              placeholder="Titre du document"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Remplacer le fichier (optionnel)
            </label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.docx,.xlsx,.doc,.xls"
              onChange={(e) => setEditFile(e.target.files?.[0] ?? null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="text-xs text-gray-400">
              Laisser vide conserve le fichier actuel (pas de nouvelle version).
            </p>
          </div>
        </div>
      </CrudModal>

      {/* Modal: partage par rôle */}
      <CrudModal
        isOpen={shareDoc !== null}
        onClose={() => setShareDoc(null)}
        title={`Partager — ${shareDoc?.title ?? ""}`}
        submitLabel="Partager"
        isSubmitting={shareMutation.isPending}
        onSubmit={() => {
          if (!shareDoc || !shareRoleId) return;
          shareMutation.mutate({ id: shareDoc.id, roleId: shareRoleId });
        }}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Le document sera accessible à tous les utilisateurs du rôle sélectionné,
            qui recevront une notification par email.
          </p>
          <SelectField
            label="Rôle"
            required
            placeholder="Rechercher un rôle..."
            options={roles.map((r) => ({ value: r.id, label: r.name }))}
            value={shareRoleId || null}
            onChange={(v) => setShareRoleId(v ?? "")}
          />
        </div>
      </CrudModal>

      {/* Modal: nouvelle version */}
      <CrudModal
        isOpen={newVersionDoc !== null}
        onClose={() => setNewVersionDoc(null)}
        title={`Nouvelle version — ${newVersionDoc?.title ?? ""}`}
        submitLabel="Ajouter la version"
        isSubmitting={addVersionMutation.isPending}
        onSubmit={() => {
          if (!nvFile || !newVersionDoc) return;
          addVersionMutation.mutate({
            id: newVersionDoc.id,
            file: nvFile,
            title: nvTitle || undefined,
          });
        }}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Titre (optionnel)
            </label>
            <input
              type="text"
              value={nvTitle}
              onChange={(e) => setNvTitle(e.target.value)}
              placeholder="Titre de cette version"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Fichier <span className="text-red-500">*</span>
            </label>
            <input
              ref={nvFileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.docx,.xlsx,.doc,.xls"
              onChange={(e) => setNvFile(e.target.files?.[0] ?? null)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-[.9rem] file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100"
            />
            {nvFile && (
              <p className="text-xs text-gray-500">
                {nvFile.name} ({formatFileSize(nvFile.size)})
              </p>
            )}
          </div>
        </div>
      </CrudModal>

      {/* Modal: historique des versions */}
      <CrudModal
        isOpen={historyDoc !== null}
        onClose={() => setHistoryDoc(null)}
        title={`Historique des versions — ${historyDoc?.title ?? ""}`}
        size="lg"
      >
        {versionsLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : sortedVersions.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-500">Aucune version trouvée.</p>
        ) : (
          <div>
            <TableLengthControl pagination={versionsPagination} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="pb-2 pr-4 font-medium text-gray-700">Version</th>
                    <th className="pb-2 pr-4 font-medium text-gray-700">Titre</th>
                    <th className="pb-2 pr-4 font-medium text-gray-700">Taille</th>
                    <th className="pb-2 pr-4 font-medium text-gray-700">Date</th>
                    <th className="pb-2 font-medium text-gray-700">Fichier</th>
                  </tr>
                </thead>
                <tbody>
                  {versionsPagination.pageRows.map((v) => (
                    <tr key={v.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4">
                        {v.version === maxVersion ? (
                          <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                            v{v.version} — actuelle
                          </span>
                        ) : (
                          <span className="text-gray-600">v{v.version}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-800">{v.title ?? "—"}</td>
                      <td className="py-2 pr-4 text-gray-600">{formatFileSize(v.fileSize)}</td>
                      <td className="py-2 pr-4 text-gray-600">{formatDate(v.createdAt)}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => downloadDocFile({ fileId: v.fileId, path: v.attachment })}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Télécharger
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePaginationFooter pagination={versionsPagination} />
          </div>
        )}
      </CrudModal>
    </div>
  );
}
