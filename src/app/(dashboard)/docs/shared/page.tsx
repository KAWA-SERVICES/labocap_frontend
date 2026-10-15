"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Download, Eye } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/common/DataTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/utils";
import {
  docsApi,
  documentationCategoriesApi,
  type Doc,
  downloadDocFile,
  formatFileSize,
} from "@/lib/api/docs";

// ---------------------------------------------------------------------------
// Page : documents partagés avec l'utilisateur courant (via ses rôles)
// ---------------------------------------------------------------------------

export default function SharedDocsPage() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ["docs-shared", { page, size: pageSize }],
    queryFn: () =>
      docsApi.sharedWithMe({ page, size: pageSize }).then((r) => r.data),
  });

  const docs = data?.content ?? [];
  const pageCount = data?.totalPages ?? 0;

  const { data: categories } = useQuery({
    queryKey: ["documentation-categories"],
    queryFn: () => documentationCategoriesApi.findAll().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const categoryMap = Object.fromEntries(
    (categories ?? []).map((c) => [c.id, c.name])
  );

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
        return (
          <div className="flex items-center gap-1">
            <Link
              href={`/docs/${doc.id}`}
              className="inline-flex items-center justify-center rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors"
              title="Voir le document"
            >
              <Eye className="h-4 w-4" />
            </Link>
            <button
              type="button"
              onClick={() => downloadDocFile({ fileId: doc.fileId, path: doc.attachment })}
              className="inline-flex items-center justify-center rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-green-600 transition-colors"
              title="Télécharger"
            >
              <Download className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partagé avec moi"
        breadcrumbs={[
          { label: "Accueil", href: "/home" },
          { label: "Documents", href: "/docs" },
          { label: "Partagé avec moi" },
        ]}
      />

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
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
        />
      </div>
    </div>
  );
}
