// PatientDetails.jsx — Fully TanStack Query driven
// No chained useEffect, no manual loading state, no backgroundLoadTabData.
// Tabs only fetch when active (enabled flag), TanStack handles caching + cancellation.

import React, { useState, useMemo, useEffect } from "react";
import {
  usePatientBasic,
  usePatientObservations,
  useTabResource,
  useAvailableResourceTypes,
} from "./hooks/usePatientTab";
import PatientDemographics from "./components/PatientDemographics";
import ClinicalResourceTable from "./components/ClinicalResourceTable";
import AddResourceDialog from "./components/AddResourceDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Info, Plus, X, AlertTriangle, Loader2 } from "lucide-react";
import { CONFIG } from "./config";

// ─── helpers ────────────────────────────────────────────────────────────────

function transformPatientData(fhirPatient) {
  if (!fhirPatient) return null;
  const name = fhirPatient.name?.[0] || {};
  const address = fhirPatient.address?.[0] || {};
  return {
    id: fhirPatient.id,
    given_name: name.given?.join(" ") || "Unknown",
    family_name: name.family || "Unknown",
    birth_date: fhirPatient.birthDate,
    gender: fhirPatient.gender,
    city: address.city,
    state: address.state,
    postal_code: address.postalCode,
    active: fhirPatient.active !== undefined ? fhirPatient.active : true,
  };
}

// ─── main component ──────────────────────────────────────────────────────────

const PatientDetails = ({ patientId, onBackToList }) => {
  const [activeTab, setActiveTab] = useState("general");

  // Per-tab pagination
  const [obsPage, setObsPage] = useState(1);
  const [diagPage, setDiagPage] = useState(1);
  const [docPage, setDocPage] = useState(1);

  const readDynamicTabs = (id) => {
    try {
      if (typeof window === "undefined") return [];
      const raw = window.localStorage.getItem(`dynamic_tabs_${id}`);
      return JSON.parse(raw || "[]");
    } catch {
      return [];
    }
  };

  const writeDynamicTabs = (id, tabs) => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(`dynamic_tabs_${id}`, JSON.stringify(tabs));
    } catch {
      // no-op
    }
  };

  // Dynamic (user-added) tabs
  const [dynamicTabs, setDynamicTabs] = useState(() => readDynamicTabs(patientId));
  const [dynamicTabPages, setDynamicTabPages] = useState({});
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  useEffect(() => {
    // Rehydrate state for the selected patient
    setDynamicTabs(readDynamicTabs(patientId));
    setDynamicTabPages({});
    setActiveTab("general");
    setObsPage(1);
    setDiagPage(1);
    setDocPage(1);
  }, [patientId]);

  // ── queries ─────────────────────────────────────────────────────────────

  const {
    data: patientResponse,
    isLoading: isPatientLoading,
    isError: isPatientError,
    error: patientError,
    refetch: refetchPatient,
  } = usePatientBasic(patientId);

  const isMeasurementsActive = activeTab === "measurements";
  const isLabsActive = activeTab === "labs";
  const isNotesActive = activeTab === "notes";

  // Observations are shared between measurements + labs tabs
  const {
    data: obsData,
    isLoading: isObsLoading,
  } = usePatientObservations(patientId, obsPage, isMeasurementsActive || isLabsActive);

  const {
    data: diagData,
    isLoading: isDiagLoading,
  } = useTabResource(patientId, "DiagnosticReport", diagPage, isLabsActive || isNotesActive);

  const {
    data: docData,
    isLoading: isDocLoading,
  } = useTabResource(patientId, "DocumentReference", docPage, isNotesActive);

  // Resource types for "Add Tab" dialog
  const { data: supportedResourcesResponse } = useAvailableResourceTypes();
  const availableResources = useMemo(() => {
    const raw = supportedResourcesResponse?.supported_resources || [];
    const fixed = ["Patient", "Observation", "DiagnosticReport", "DocumentReference"];
    const existingTypes = dynamicTabs.map((t) => t.id);
    return raw
      .filter((r) => !fixed.includes(r) && !existingTypes.includes(r))
      .map((r) => ({ id: r, label: r }));
  }, [supportedResourcesResponse, dynamicTabs]);

  // ── derived data ────────────────────────────────────────────────────────

  const patientData = useMemo(() => {
    if (!patientResponse) return null;
    // getByIdDetailed returns { success, all, fixed, dynamic }
    if (patientResponse.success && patientResponse.all) {
      return transformPatientData(patientResponse.all);
    }
    // Fallback: maybe raw FHIR resource came back
    const raw = patientResponse.all || patientResponse.patient || patientResponse;
    if (raw?.id) return transformPatientData(raw);
    return null;
  }, [patientResponse]);

  const observations = obsData?.data || [];
  const diagnosticReports = diagData?.data || [];
  const documentReferences = docData?.data || [];

  // ── tab management ───────────────────────────────────────────────────────

  const handleAddTab = (resourceId) => {
    if (!dynamicTabs.find((t) => t.id === resourceId)) {
      const next = [...dynamicTabs, { id: resourceId, label: resourceId }];
      setDynamicTabs(next);
      writeDynamicTabs(patientId, next);
      setActiveTab(resourceId);
    }
  };

  const handleRemoveTab = (e, tabId) => {
    e.stopPropagation();
    const next = dynamicTabs.filter((t) => t.id !== tabId);
    setDynamicTabs(next);
    writeDynamicTabs(patientId, next);
    if (activeTab === tabId) setActiveTab("general");
  };

  // ── columns ──────────────────────────────────────────────────────────────

  const observationColumns = useMemo(
    () => [
      {
        accessorKey: "effectiveDateTime",
        header: "Date",
        cell: ({ row }) => {
          const d = row.original.effectiveDateTime || row.original.issued;
          return d ? new Date(d).toLocaleDateString() : "N/A";
        },
      },
      {
        id: "name",
        header: "Test Name",
        cell: ({ row }) =>
          row.original.code?.text ||
          row.original.code?.coding?.[0]?.display ||
          "Unknown",
      },
      {
        id: "value",
        header: "Value",
        cell: ({ row }) => {
          const obs = row.original;
          const val = obs.valueQuantity?.value ?? obs.valueString ?? "N/A";
          const unit = obs.valueQuantity?.unit || "";
          return `${val}${unit ? " " + unit : ""}`;
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.getValue("status") || "—"}
          </Badge>
        ),
      },
    ],
    []
  );

  const reportColumns = useMemo(
    () => [
      {
        accessorKey: "effectiveDateTime",
        header: "Date",
        cell: ({ row }) => {
          const d = row.original.effectiveDateTime || row.original.issued;
          return d ? new Date(d).toLocaleDateString() : "N/A";
        },
      },
      {
        id: "type",
        header: "Type",
        cell: ({ row }) =>
          row.original.code?.text ||
          row.original.code?.coding?.[0]?.display ||
          row.original.type?.text ||
          "Unknown",
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant="outline" className="capitalize">
            {row.getValue("status") || "—"}
          </Badge>
        ),
      },
      {
        id: "action",
        header: "",
        cell: () => (
          <Button variant="ghost" size="sm">
            <Info className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    []
  );

  // ── guards ───────────────────────────────────────────────────────────────

  if (isPatientLoading) {
    return (
      <div className="p-8 space-y-6 animate-in fade-in duration-500">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-100 w-full rounded-lg" />
      </div>
    );
  }

  if (isPatientError) {
    return (
      <div className="p-8 text-center flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="text-2xl font-bold">Failed to load patient</h2>
        <p className="text-muted-foreground max-w-md">
          {patientError?.message || "The server returned an error. This may be due to rate limiting."}
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBackToList}>Back to Dashboard</Button>
          <Button onClick={() => refetchPatient()}>Retry</Button>
        </div>
      </div>
    );
  }

  if (!patientData) {
    return (
      <div className="p-8 text-center flex flex-col items-center gap-4">
        <h2 className="text-xl font-bold text-muted-foreground">
          Patient not found
        </h2>
        <Button variant="outline" onClick={onBackToList}>Back to Dashboard</Button>
      </div>
    );
  }

  // ── pagination helpers ───────────────────────────────────────────────────

  const totalPages = (responseData) =>
    responseData?.pagination?.total
      ? Math.ceil(responseData.pagination.total / CONFIG.ui.defaultPageSize)
      : 1;

  const tabTriggerClass =
    "px-6 py-2.5 border border-slate-200/80 bg-slate-50/80 text-slate-900 rounded-md data-[state=active]:bg-white data-[state=active]:border-slate-300 data-[state=active]:text-slate-900";

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col min-h-screen bg-gray-50/50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBackToList} className="gap-2">
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              {patientData.given_name} {patientData.family_name}
            </h1>
            <p className="text-xs font-mono text-muted-foreground">
              ID: {patientData.id}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAddDialogOpen(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Add Tab
        </Button>
      </header>

      <AddResourceDialog
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        availableResources={availableResources}
        onAddTab={handleAddTab}
      />

      {/* Content */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-white border w-full justify-start h-32 p-1.5 overflow-x-auto">
            <TabsTrigger value="general" className={tabTriggerClass}>General</TabsTrigger>
            <TabsTrigger value="measurements" className={`${tabTriggerClass} gap-2`}>
              Measurements
              {isMeasurementsActive && isObsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </TabsTrigger>
            <TabsTrigger value="labs" className={`${tabTriggerClass} gap-2`}>
              Labs & Reports
              {isLabsActive && (isObsLoading || isDiagLoading) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </TabsTrigger>
            <TabsTrigger value="notes" className={`${tabTriggerClass} gap-2`}>
              Clinical Notes
              {isNotesActive && (isDiagLoading || isDocLoading) && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </TabsTrigger>
            {dynamicTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className={`${tabTriggerClass} group relative`}>
                {tab.label}
                <span
                  role="button"
                  tabIndex={-1}
                  className="inline-flex items-center justify-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                  onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                  onClick={(e) => handleRemoveTab(e, tab.id)}
                >
                  <X className="h-3 w-3 hover:text-destructive" style={{ pointerEvents: 'none' }} />
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {/* General */}
          <TabsContent value="general" className="mt-0">
            <PatientDemographics patientData={patientData} />
          </TabsContent>

          {/* Measurements — Observations only */}
          <TabsContent value="measurements" className="mt-0 space-y-4">
            <ClinicalResourceTable
              title="Vital Signs & Measurements"
              data={observations}
              columns={observationColumns}
              isLoading={isObsLoading}
              count={obsData?.pagination?.total}
              page={obsPage}
              onPageChange={setObsPage}
              totalPages={totalPages(obsData)}
            />
          </TabsContent>

          {/* Labs — Observations + DiagnosticReports */}
          <TabsContent value="labs" className="mt-0 space-y-4">
            <ClinicalResourceTable
              title="Observations (Lab Category)"
              data={observations}
              columns={observationColumns}
              isLoading={isObsLoading}
              count={obsData?.pagination?.total}
              page={obsPage}
              onPageChange={setObsPage}
              totalPages={totalPages(obsData)}
            />
            <ClinicalResourceTable
              title="Diagnostic Reports"
              data={diagnosticReports}
              columns={reportColumns}
              isLoading={isDiagLoading}
              count={diagData?.pagination?.total}
              page={diagPage}
              onPageChange={setDiagPage}
              totalPages={totalPages(diagData)}
            />
          </TabsContent>

          {/* Notes — DiagnosticReports + DocumentReferences */}
          <TabsContent value="notes" className="mt-0 space-y-4">
            <ClinicalResourceTable
              title="Diagnostic Reports"
              data={diagnosticReports}
              columns={reportColumns}
              isLoading={isDiagLoading}
              count={diagData?.pagination?.total}
              page={diagPage}
              onPageChange={setDiagPage}
              totalPages={totalPages(diagData)}
            />
            <ClinicalResourceTable
              title="Document References"
              data={documentReferences}
              columns={reportColumns}
              isLoading={isDocLoading}
              count={docData?.pagination?.total}
              page={docPage}
              onPageChange={setDocPage}
              totalPages={totalPages(docData)}
            />
          </TabsContent>

          {/* Dynamic tabs */}
          {dynamicTabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-0 space-y-4">
              <DynamicTabContent
                patientId={patientId}
                resourceType={tab.id}
                title={tab.label}
                isActive={activeTab === tab.id}
                page={dynamicTabPages[tab.id] || 1}
                onPageChange={(p) =>
                  setDynamicTabPages((prev) => ({ ...prev, [tab.id]: p }))
                }
              />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
};

// ─── dynamic tab content ─────────────────────────────────────────────────────
// Separate component so each tab's hook doesn't violate rules-of-hooks.

const DynamicTabContent = ({
  patientId,
  resourceType,
  title,
  isActive,
  page,
  onPageChange,
}) => {
  const { data, isLoading } = useTabResource(patientId, resourceType, page, isActive);

  const columns = useMemo(() => {
    const items = data?.data || [];
    if (items.length === 0) return [];
    const first = items[0];
    const keys = Object.keys(first)
      .filter((k) => !["id", "meta", "text", "resourceType"].includes(k))
      .slice(0, 5);
    return [
      {
        accessorKey: "id",
        header: "ID",
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.id?.substring(0, 8)}…
          </span>
        ),
      },
      ...keys.map((key) => ({
        accessorKey: key,
        header: key.charAt(0).toUpperCase() + key.slice(1),
        cell: ({ row }) => {
          const val = row.original[key];
          if (val === null || val === undefined) return "—";
          if (typeof val === "object") return JSON.stringify(val).slice(0, 30) + "…";
          return String(val);
        },
      })),
    ];
  }, [data]);

  const totalPages = data?.pagination?.total
    ? Math.ceil(data.pagination.total / CONFIG.ui.defaultPageSize)
    : 1;

  return (
    <ClinicalResourceTable
      title={title}
      data={data?.data || []}
      columns={columns}
      isLoading={isLoading}
      count={data?.pagination?.total}
      page={page}
      onPageChange={onPageChange}
      totalPages={totalPages}
    />
  );
};

export default PatientDetails;
