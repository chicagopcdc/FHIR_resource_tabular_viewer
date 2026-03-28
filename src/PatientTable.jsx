import React, { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { CONFIG } from "./config";

const PatientTable = ({
  patients = [],
  searchTerm = "",
  onPatientSelect,
  loading = false,
  pagination = {},
  onPageChange,
  onPageSizeChange,
}) => {

  const formatAge = (age) => {
    if (age === null || age === undefined || age === "Unknown") return "Unknown";
    if (typeof age === "string" && age.includes("years")) return age;
    return typeof age === "number" && age >= 0 ? `${age} years` : (Number(age) >= 0 ? `${Number(age)} years` : "Unknown");
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return dateString;
    }
  };

  const columns = useMemo(
    () => [
      {
        accessorKey: "id",
        header: "Patient ID",
        cell: ({ row }) => <span className="text-xs text-muted-foreground font-mono">{row.getValue("id") || "-"}</span>,
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          const p = row.original;
          const disabled = !p.id || p.id === "Unknown";
          return (
            <div className="flex flex-col">
              <button
                onClick={() => !disabled && onPatientSelect && onPatientSelect(p)}
                disabled={disabled}
                className={`text-left font-medium ${disabled ? "text-muted-foreground cursor-not-allowed" : "text-blue-600 hover:underline cursor-pointer"}`}
              >
                {p.given_name || "-"} {p.family_name || "-"}
              </button>
              <span className="text-[10px] text-muted-foreground">
                {!disabled ? "Click to view details" : "No ID available"}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "age",
        header: "Age",
        cell: ({ row }) => <span className="text-sm">{formatAge(row.getValue("age"))}</span>,
      },
      {
        accessorKey: "gender",
        header: "Gender",
        cell: ({ row }) => {
          const gender = row.getValue("gender");
          return (
            <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${
              gender === "male" ? "bg-blue-50 text-blue-700" : gender === "female" ? "bg-pink-50 text-pink-700" : "bg-gray-100 text-gray-700"
            }`}>
              {gender || "-"}
            </span>
          );
        },
      },
      {
        accessorKey: "birth_date",
        header: "Birth Date",
        cell: ({ row }) => <span className="text-sm">{formatDate(row.getValue("birth_date"))}</span>,
      },
      {
        id: "location",
        header: "Location",
        cell: ({ row }) => {
          const p = row.original;
          if (!p.city && !p.state && !p.country) return <span className="text-sm">-</span>;
          return (
            <div className="text-sm">
              {[p.city, p.state, p.country].filter(Boolean).join(", ")}
              {p.postal_code && <span className="text-muted-foreground text-xs ml-1">{p.postal_code}</span>}
            </div>
          );
        },
      },
      {
        accessorKey: "active",
        header: "Status",
        cell: ({ row }) => {
          const active = row.getValue("active");
          return (
            <span className={`px-2 py-1 rounded text-xs font-medium ${active ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {active ? "Active" : "Inactive"}
            </span>
          );
        },
      },
    ],
    [onPatientSelect]
  );

  const [sorting, setSorting] = useState([]);

  const table = useReactTable({
    data: patients,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
    // We handle pagination manually on the server side in App.jsx
    manualPagination: true,
  });

  const currentPage = pagination.page || 1;
  const totalPages =
    pagination.total && pagination.per_page
      ? Math.ceil(pagination.total / pagination.per_page)
      : Math.max(currentPage + (pagination.has_next ? 1 : 0), 1);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                {Array.from({ length: 7 }).map((_, i) => (
                  <TableHead key={i}><Skeleton className="h-4 w-20" /></TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full animate-in fade-in duration-300">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Patient Directory</h2>
        <p className="text-sm text-muted-foreground">
          Total: {pagination.total ?? patients.length} patients
          {searchTerm && ` (filtered for: "${searchTerm}")`}
        </p>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : (
                        <div
                          className={`flex items-center gap-2 ${
                            header.column.getCanSort()
                              ? "cursor-pointer select-none hover:text-foreground transition-colors"
                              : ""
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {header.column.getCanSort() && (
                            <span className="text-muted-foreground w-4 h-4 flex items-center justify-center">
                              {{
                                asc: <ArrowUp className="h-3 w-3 text-foreground" />,
                                desc: <ArrowDown className="h-3 w-3 text-foreground" />,
                              }[header.column.getIsSorted()] ?? <ArrowUpDown className="h-3 w-3 opacity-30 group-hover:opacity-100" />}
                            </span>
                          )}
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No patients found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {patients.length > 0 && (
        <>
          <div className="h-24 sm:h-28" aria-hidden="true" />

          <div className="fixed bottom-4 left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-6xl -translate-x-1/2 items-center justify-between gap-4 rounded-xl border bg-background/95 px-3 py-2 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/80 sm:px-4">
            <div className="flex flex-col sm:flex-row items-center gap-4 text-sm text-muted-foreground">
            <div>
              Showing page {currentPage} of {totalPages}
            </div>
            
            <div className="flex items-center gap-2">
              <label htmlFor="pageSize" className="whitespace-nowrap">Show:</label>
              <select
                id="pageSize"
                value={pagination.per_page || CONFIG.ui.defaultPageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                disabled={loading}
                className="border border-input bg-background rounded-md px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
              >
                {CONFIG.ui.pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span>per page</span>
            </div>
          </div>
          
            <div className="flex items-center space-x-2 self-end sm:self-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(1)}
                disabled={currentPage <= 1 || loading}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-sm font-medium">{currentPage}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(totalPages)}
                disabled={currentPage >= totalPages || loading}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PatientTable;
