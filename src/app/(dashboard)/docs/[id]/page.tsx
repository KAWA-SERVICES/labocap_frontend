"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Download, Eye, FileText, Upload, Calendar } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionGate } from "@/components/common/PermissionGate";
import {
  TableLengthControl,
  TablePaginationFooter,
  useTablePagination,
} from "@/components/common/TablePagination";
import { PERMISSIONS } from "@/lib/constants/permissions";
import { formatDate } from "@/lib/utils";
import {
  docsApi,
  documentationCategoriesApi,
  type Doc,
  type DocVersion,
  openDocFile,
  downloadDocFile,
  formatFileSize,
} from "@/lib/api/docs";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(paramsPromise);

  const { data: doc, isLoading } = useQuery<Doc>({
    queryKey: ["doc", id],
    queryFn: () => docsApi.findById(id).then((r) => r.data),
    enabled: !!id,
  });

  const { data: versions, isLoading: versionsLoading } = useQuery<DocVersion[]>({
    queryKey: ["doc-versions", id],
    queryFn: () => docsApi.getVersions(id).then((r) => r.data),
    enabled: !!id,
  });

  const { data: categories } = useQuery({
    queryKey: ["documentation-categories"],
    queryFn: () => documentationCategoriesApi.findAll().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const categoryName = doc?.documentationCategoryId
    ? (categories ?? []).find((c) => c.id === doc.documentationCategoryId)?.name
    : undefined;

  const sortedVersions = [...(versions ?? [])].sort((a, b) => b.version - a.version);
  const maxVersion = sortedVersions[0]?.version ?? 0;
  const versionsPagination = useTablePagination(sortedVersions);

  return (
    <div className="space-y-6">
      {/* `page-title-box` de `documentations/docs/index_detail.blade.php` :
          titre « Documents » et bouton de retour à droite. */}
      <PageHeader
        title="Documents"
        action={
          <Button
            icon={<ArrowLeft className="h-4 w-4" />}
            onClick={() => router.back()}
          >
            Retour à la liste
          </Button>
        }
      />

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm space-y-4 animate-pulse">
          <div className="h-6 w-64 rounded bg-gray-200" />
          <div className="h-4 w-40 rounded bg-gray-200" />
          <div className="h-4 w-80 rounded bg-gray-200" />
        </div>
      ) : !doc ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">Document introuvable.</p>
          <Link href="/docs" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
            Retour à la liste
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* En-tête */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3 flex-1 min-w-0">
                <div className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-blue-500 flex-shrink-0" />
                  <h1 className="text-xl font-bold text-gray-900 truncate">{doc.title}</h1>
                </div>

                {categoryName && (
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
                    {categoryName}
                  </span>
                )}

                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-gray-500">Taille</dt>
                    <dd className="font-medium text-gray-900">{formatFileSize(doc.fileSize)}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Créé le</dt>
                    <dd className="font-medium text-gray-900 flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      {formatDate(doc.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Versions</dt>
                    <dd className="font-medium text-gray-900">{versions?.length ?? "—"}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-col gap-2 flex-shrink-0">
                {/* Visualiser / Télécharger */}
                <button
                  type="button"
                  onClick={() => openDocFile({ fileId: doc.fileId, path: doc.attachment })}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Eye className="h-4 w-4" />
                  Visualiser
                </button>
                <button
                  type="button"
                  onClick={() => downloadDocFile({ fileId: doc.fileId, path: doc.attachment }, doc.title)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  <Download className="h-4 w-4" />
                  Télécharger
                </button>

                {/* Nouvelle version */}
                <PermissionGate permission={PERMISSIONS.EDIT_DOCS}>
                  <Link
                    href={`/docs/${doc.id}/edit`}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                  >
                    <Upload className="h-4 w-4" />
                    Nouvelle version
                  </Link>
                </PermissionGate>
              </div>
            </div>
          </div>

          {/* Historique des versions */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Historique des versions</h2>
            </div>
            <div className="p-5">
              {versionsLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
                  ))}
                </div>
              ) : sortedVersions.length === 0 ? (
                <p className="text-sm text-gray-500">Aucune version enregistrée.</p>
              ) : (
                <div>
                  <TableLengthControl pagination={versionsPagination} />
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left">
                        <th className="pb-3 pr-4 font-medium text-gray-700">Version</th>
                        <th className="pb-3 pr-4 font-medium text-gray-700">Titre</th>
                        <th className="pb-3 pr-4 font-medium text-gray-700">Taille</th>
                        <th className="pb-3 pr-4 font-medium text-gray-700">Date</th>
                        <th className="pb-3 font-medium text-gray-700">Fichier</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versionsPagination.pageRows.map((v) => (
                        <tr key={v.id} className="border-b border-gray-100 last:border-0">
                          <td className="py-3 pr-4">
                            {v.version === maxVersion ? (
                              <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                                v{v.version} — actuelle
                              </span>
                            ) : (
                              <span className="text-gray-500">v{v.version}</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-gray-800">{v.title ?? "—"}</td>
                          <td className="py-3 pr-4 text-gray-600">{formatFileSize(v.fileSize)}</td>
                          <td className="py-3 pr-4 text-gray-600">{formatDate(v.createdAt)}</td>
                          <td className="py-3">
                            {v.version === maxVersion ? (
                              <span className="text-xs text-gray-400">Version actuelle</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => downloadDocFile({ fileId: v.fileId, path: v.attachment })}
                                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              >
                                <Download className="h-3.5 w-3.5" />
                                Télécharger
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  <TablePaginationFooter pagination={versionsPagination} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
