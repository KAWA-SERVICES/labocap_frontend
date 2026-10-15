"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  Clock,
  Download,
  Eye,
  FilePlus,
  FileText,
  FolderPlus,
  History,
  Pencil,
  RotateCcw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { AxiosError } from "axios";

import { CrudModal } from "@/components/common/CrudModal";
import { ConfirmModal } from "@/components/common/ConfirmModal";
import { PermissionGate } from "@/components/common/PermissionGate";
import {
  TableLengthControl,
  TablePaginationFooter,
  useTablePagination,
} from "@/components/common/TablePagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { formatDate } from "@/lib/utils";
import {
  docsApi,
  documentationCategoriesApi,
  type Doc,
  type DocVersion,
  type DocumentationCategory,
  downloadDocFile,
  openDocFile,
  formatFileSize,
} from "@/lib/api/docs";
import type { ApiError } from "@/types/api";
import { INPUT_CLASS as inputClass } from "@/lib/ui/inputClass";

// ---------------------------------------------------------------------------
// Vue active du volet droit
// ---------------------------------------------------------------------------

type View =
  | { type: "recent" }
  | { type: "trash" }
  | { type: "category"; id: string; name: string };


export default function DocsExplorerPage() {
  const { can } = usePermissions();
  const queryClient = useQueryClient();

  const [view, setView] = useState<View>({ type: "recent" });

  // Modales catégories
  const [catCreateOpen, setCatCreateOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catEdit, setCatEdit] = useState<DocumentationCategory | null>(null);
  const [catDelete, setCatDelete] = useState<DocumentationCategory | null>(null);

  // Modales documents
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [versionDoc, setVersionDoc] = useState<Doc | null>(null);
  const [nvTitle, setNvTitle] = useState("");
  const [nvFile, setNvFile] = useState<File | null>(null);
  const [historyDoc, setHistoryDoc] = useState<Doc | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<Doc | null>(null);
  const [permanentDoc, setPermanentDoc] = useState<Doc | null>(null);

  // --- Catégories (volet gauche)
  const { data: categories } = useQuery<DocumentationCategory[]>({
    queryKey: ["documentation-categories"],
    queryFn: () => documentationCategoriesApi.findAll().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  // --- Documents du volet droit selon la vue
  const { data: docs, isLoading } = useQuery<Doc[]>({
    queryKey: ["docs-explorer", view],
    queryFn: () => {
      if (view.type === "recent") return docsApi.recent(12).then((r) => r.data);
      if (view.type === "trash") return docsApi.trash({ size: 100 }).then((r) => r.data.content);
      return docsApi.byCategory(view.id).then((r) => r.data);
    },
  });

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
  const versionsPagination = useTablePagination(sortedVersions);

  function invalidateDocs() {
    queryClient.invalidateQueries({ queryKey: ["docs-explorer"] });
    queryClient.invalidateQueries({ queryKey: ["docs"] });
  }

  function apiError(err: AxiosError<ApiError>) {
    toast.error(err.response?.data?.message ?? "Une erreur est survenue");
  }

  // --- Mutations catégories
  const catCreateMutation = useMutation({
    mutationFn: (name: string) => documentationCategoriesApi.create({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documentation-categories"] });
      toast.success("Catégorie créée");
      setCatCreateOpen(false);
      setCatName("");
    },
    onError: apiError,
  });

  const catUpdateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      documentationCategoriesApi.update(id, { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documentation-categories"] });
      toast.success("Catégorie modifiée");
      setCatEdit(null);
    },
    onError: apiError,
  });

  const catDeleteMutation = useMutation({
    mutationFn: (id: string) => documentationCategoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documentation-categories"] });
      toast.success("Catégorie supprimée");
      setCatDelete(null);
      if (view.type === "category") setView({ type: "recent" });
    },
    onError: apiError,
  });

  // --- Mutations documents
  const editMutation = useMutation({
    mutationFn: ({ id, title, file }: { id: string; title: string; file?: File | null }) =>
      docsApi.updateTitle(id, title, file),
    onSuccess: () => {
      invalidateDocs();
      toast.success("Document mis à jour");
      setEditDoc(null);
      setEditFile(null);
    },
    onError: apiError,
  });

  const versionMutation = useMutation({
    mutationFn: ({ id, file, title }: { id: string; file: File; title?: string }) =>
      docsApi.addVersion(id, file, title || undefined),
    onSuccess: () => {
      invalidateDocs();
      toast.success("Nouvelle version ajoutée");
      setVersionDoc(null);
      setNvTitle("");
      setNvFile(null);
    },
    onError: apiError,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => docsApi.delete(id),
    onSuccess: () => {
      invalidateDocs();
      toast.success("Document supprimé");
      setDeleteDoc(null);
    },
    onError: apiError,
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => docsApi.restore(id),
    onSuccess: () => {
      invalidateDocs();
      toast.success("Document restauré");
    },
    onError: apiError,
  });

  const permanentMutation = useMutation({
    mutationFn: (id: string) => docsApi.permanentDelete(id),
    onSuccess: () => {
      invalidateDocs();
      toast.success("Document supprimé définitivement");
      setPermanentDoc(null);
    },
    onError: apiError,
  });

  const sectionTitle = useMemo(() => {
    if (view.type === "recent") return "Récent";
    if (view.type === "trash") return "Fichiers supprimés";
    return view.name;
  }, [view]);

  const items = docs ?? [];
  const isTrash = view.type === "trash";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documentation"
        breadcrumbs={[{ label: "Accueil", href: "/home" }, { label: "Documentation" }]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* ============ Volet gauche ============ */}
        <aside className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          {can(PERMISSIONS.MANAGE_SETTINGS) && (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setCatName("");
                  setCatCreateOpen(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                <FolderPlus className="h-4 w-4" />
                Dossier
              </button>
              <Link
                href="/docs/create"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FilePlus className="h-4 w-4" />
                Fichier
              </Link>
            </div>
          )}

          <nav className="space-y-1">
            <SidebarItem
              active={view.type === "recent"}
              onClick={() => setView({ type: "recent" })}
              icon={<Clock className="h-4 w-4" />}
              label="Récent"
            />

            <p className="px-2 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Catégories
            </p>
            {(categories ?? []).map((c) => (
              <div key={c.id} className="group flex items-center">
                <SidebarItem
                  active={view.type === "category" && view.id === c.id}
                  onClick={() => setView({ type: "category", id: c.id, name: c.name })}
                  icon={<FileText className="h-4 w-4" />}
                  label={c.name}
                  className="flex-1"
                />
                {can(PERMISSIONS.MANAGE_SETTINGS) && (
                  <span className="flex opacity-0 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setCatEdit(c);
                        setCatName(c.name);
                      }}
                      className="rounded p-1 text-gray-400 hover:text-blue-600"
                      title="Renommer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCatDelete(c)}
                      className="rounded p-1 text-gray-400 hover:text-red-600"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
            ))}

            {can(PERMISSIONS.EDIT_DOCS) && (
              <>
                <div className="my-2 border-t border-gray-100" />
                <SidebarItem
                  active={view.type === "trash"}
                  onClick={() => setView({ type: "trash" })}
                  icon={<Trash2 className="h-4 w-4" />}
                  label="Fichiers supprimés"
                />
              </>
            )}
          </nav>
        </aside>

        {/* ============ Volet droit ============ */}
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-800">{sectionTitle}</h2>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">
              Aucun document dans cette section.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-col rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900" title={doc.title}>
                        {doc.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(doc.fileSize)} · {formatDate(doc.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-gray-100 pt-3">
                    {isTrash ? (
                      <>
                        <CardBtn
                          onClick={() => restoreMutation.mutate(doc.id)}
                          title="Restaurer"
                          className="hover:text-green-600"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </CardBtn>
                        <CardBtn
                          onClick={() => setPermanentDoc(doc)}
                          title="Supprimer définitivement"
                          className="hover:text-red-600"
                        >
                          <XCircle className="h-4 w-4" />
                        </CardBtn>
                      </>
                    ) : (
                      <>
                        <CardBtn onClick={() => openDocFile({ fileId: doc.fileId, path: doc.attachment })} title="Visualiser" className="hover:text-blue-600">
                          <Eye className="h-4 w-4" />
                        </CardBtn>
                        <CardBtn onClick={() => downloadDocFile({ fileId: doc.fileId, path: doc.attachment })} title="Télécharger" className="hover:text-green-600">
                          <Download className="h-4 w-4" />
                        </CardBtn>
                        <CardBtn onClick={() => setHistoryDoc(doc)} title="Historique des versions" className="hover:text-purple-600">
                          <History className="h-4 w-4" />
                        </CardBtn>
                        <PermissionGate permission={PERMISSIONS.EDIT_DOCS}>
                          <CardBtn
                            onClick={() => {
                              setEditDoc(doc);
                              setEditTitle(doc.title);
                              setEditFile(null);
                            }}
                            title="Modifier le titre"
                            className="hover:text-yellow-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </CardBtn>
                          <CardBtn
                            onClick={() => {
                              setVersionDoc(doc);
                              setNvTitle("");
                              setNvFile(null);
                            }}
                            title="Nouvelle version"
                            className="hover:text-blue-600"
                          >
                            <Upload className="h-4 w-4" />
                          </CardBtn>
                        </PermissionGate>
                        <PermissionGate permission={PERMISSIONS.DELETE_DOCS}>
                          <CardBtn onClick={() => setDeleteDoc(doc)} title="Supprimer" className="hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </CardBtn>
                        </PermissionGate>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ===================== Modales catégories ===================== */}
      <CrudModal
        isOpen={catCreateOpen}
        onClose={() => setCatCreateOpen(false)}
        title="Ajouter une catégorie"
        submitLabel="Ajouter une catégorie"
        isSubmitting={catCreateMutation.isPending}
        onSubmit={() => catName.trim() && catCreateMutation.mutate(catName.trim())}
      >
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            Nom <span className="text-red-500">*</span>
          </label>
          <input value={catName} onChange={(e) => setCatName(e.target.value)} className={inputClass} />
        </div>
      </CrudModal>

      <CrudModal
        isOpen={catEdit !== null}
        onClose={() => setCatEdit(null)}
        title="Modifier la catégorie"
        submitLabel="Modifier"
        isSubmitting={catUpdateMutation.isPending}
        onSubmit={() =>
          catEdit && catName.trim() && catUpdateMutation.mutate({ id: catEdit.id, name: catName.trim() })
        }
      >
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">
            Nom <span className="text-red-500">*</span>
          </label>
          <input value={catName} onChange={(e) => setCatName(e.target.value)} className={inputClass} />
        </div>
      </CrudModal>

      <ConfirmModal
        isOpen={catDelete !== null}
        onClose={() => setCatDelete(null)}
        onConfirm={() => catDelete && catDeleteMutation.mutate(catDelete.id)}
        title="Supprimer cette catégorie"
        message={catDelete ? `Supprimer la catégorie "${catDelete.name}" ?` : ""}
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={catDeleteMutation.isPending}
      />

      {/* ===================== Modales documents ===================== */}
      <CrudModal
        isOpen={editDoc !== null}
        onClose={() => setEditDoc(null)}
        title="Modifier le document"
        submitLabel="Mettre à jour"
        isSubmitting={editMutation.isPending}
        onSubmit={() =>
          editDoc && editTitle.trim() &&
          editMutation.mutate({ id: editDoc.id, title: editTitle.trim(), file: editFile })
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Titre <span className="text-red-500">*</span>
            </label>
            <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Remplacer le fichier (optionnel)</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.docx,.xlsx,.doc,.xls"
              onChange={(e) => setEditFile(e.target.files?.[0] ?? null)}
              className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100`}
            />
          </div>
        </div>
      </CrudModal>

      <CrudModal
        isOpen={versionDoc !== null}
        onClose={() => setVersionDoc(null)}
        title={`Nouvelle version — ${versionDoc?.title ?? ""}`}
        submitLabel="Ajouter la version"
        isSubmitting={versionMutation.isPending}
        onSubmit={() =>
          versionDoc && nvFile &&
          versionMutation.mutate({ id: versionDoc.id, file: nvFile, title: nvTitle || undefined })
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Titre (optionnel)</label>
            <input value={nvTitle} onChange={(e) => setNvTitle(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Fichier <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.docx,.xlsx,.doc,.xls"
              onChange={(e) => setNvFile(e.target.files?.[0] ?? null)}
              className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100`}
            />
          </div>
        </div>
      </CrudModal>

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
                      <td className="py-2 pr-4">v{v.version}</td>
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

      <ConfirmModal
        isOpen={deleteDoc !== null}
        onClose={() => setDeleteDoc(null)}
        onConfirm={() => deleteDoc && deleteMutation.mutate(deleteDoc.id)}
        title="Supprimer ce document"
        message={deleteDoc ? `Déplacer "${deleteDoc.title}" vers la corbeille ?` : ""}
        confirmLabel="Supprimer"
        confirmVariant="danger"
        isLoading={deleteMutation.isPending}
      />

      <ConfirmModal
        isOpen={permanentDoc !== null}
        onClose={() => setPermanentDoc(null)}
        onConfirm={() => permanentDoc && permanentMutation.mutate(permanentDoc.id)}
        title="Supprimer définitivement"
        message={
          permanentDoc
            ? `Supprimer définitivement "${permanentDoc.title}" ? Cette action est irréversible.`
            : ""
        }
        confirmLabel="Supprimer définitivement"
        confirmVariant="danger"
        isLoading={permanentMutation.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

function SidebarItem({
  active,
  onClick,
  icon,
  label,
  className = "",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
        active ? "bg-blue-50 font-medium text-blue-700" : "text-gray-600 hover:bg-gray-50"
      } ${className}`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

function CardBtn({
  onClick,
  title,
  className = "",
  children,
}: {
  onClick: () => void;
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center rounded p-1.5 text-gray-500 transition-colors hover:bg-gray-100 ${className}`}
    >
      {children}
    </button>
  );
}
