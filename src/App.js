// App.js - Complete fixed version with all issues resolved
import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useParams,
  useNavigate,
} from "react-router-dom";
import Header from "./Header";
import DynamicFilterSidebar from "./DynamicFilterSidebar";
import PatientTable from "./PatientTable";
import PatientDetails from "./PatientDetails";
import LazyPatientDetails from "./LazyPatientDetails";

import * as api from "./api";
import { CONFIG } from "./config";
import {
  initializeFilterCache,
  getFilterResources,
  getFilterCacheStats,
  clearFilterCache,
} from "./filterResourceCache";
import "./App.css";

const DynamicResourceViewer = () => null;

const MainPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState([]);
  const [observations, setObservations] = useState([]);
  const [diagnosticReports, setDiagnosticReports] = useState([]);
  const [documentReferences, setDocumentReferences] = useState([]);
  const [medicalData, setMedicalData] = useState({
    conditions: [],
    encounters: [],
    procedures: [],
    medications: [],
    immunizations: [],
    careTeam: [],
    allergies: [],
    medicationRequests: [],
    carePlans: [],
    goals: [],
    flags: [],
  });
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("patients");
  const [isPageChanging, setIsPageChanging] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: CONFIG.ui.defaultPageSize,
    total: 0,
    has_next: false,
    has_prev: false,
    next_query: null,
    prev_query: null,
    fetched_all: false,
  });
  const [originalPatients, setOriginalPatients] = useState([]);
  const navigate = useNavigate();

  // Validate restored filters to prevent problematic combinations
  const validateRestoredFilters = (filters) => {
    if (!filters || typeof filters !== "object") return {};

    const cleanedFilters = { ...filters };

    // Remove any undefined or null filters
    Object.keys(cleanedFilters).forEach((key) => {
      if (cleanedFilters[key] === undefined || cleanedFilters[key] === null) {
        delete cleanedFilters[key];
      }
      // Remove empty arrays
      else if (
        Array.isArray(cleanedFilters[key]) &&
        cleanedFilters[key].length === 0
      ) {
        delete cleanedFilters[key];
      }
      // Remove empty objects (except age_range which can have min_age or max_age)
      else if (
        typeof cleanedFilters[key] === "object" &&
        !Array.isArray(cleanedFilters[key]) &&
        key !== "age_range" &&
        Object.keys(cleanedFilters[key]).length === 0
      ) {
        delete cleanedFilters[key];
      }
    });

    return cleanedFilters;
  };

  // Restore navigation state on component mount
  useEffect(() => {
    const restored = restoreNavigationState();
    if (restored) {
      // If state was restored, force a reload to apply the restored state
      setTimeout(() => {
        // Check if restored state has active filters - if so, load all patients
        const savedState = sessionStorage.getItem("patientListState");
        const parsedState = JSON.parse(savedState);
        const hasFilters =
          parsedState?.filters && Object.keys(parsedState.filters).length > 0;

        if (hasFilters) {
          console.log("🔍 Restoring with filters, using filtered loading");
          // Don't call loadPatients directly - let the useEffect handle it with proper filter routing
          // The activeFilters state is already set in restoreNavigationState
          // Remove the saved state since filters are restored
          setTimeout(() => sessionStorage.removeItem("patientListState"), 1000);
        } else {
          loadPatients(1).then(() => {
            // Remove the saved state after successful restoration
            sessionStorage.removeItem("patientListState");
          });
        }
      }, 100);
    }
  }, []);

  // Save navigation state before each patient list update
  useEffect(() => {
    if (patients.length > 0) {
      saveNavigationState();
    }
  }, [patients, pagination, activeFilters, searchTerm]);

  const restoreNavigationState = () => {
    try {
      const savedState = sessionStorage.getItem("patientListState");
      if (savedState) {
        const state = JSON.parse(savedState);
        const timeDiff = Date.now() - (state.timestamp || 0);

        if (timeDiff < 30 * 60 * 1000) {
          if (state.page) {
            setPagination((prev) => ({ ...prev, page: state.page }));
          }
          if (state.filters) {
            // Validate and clean restored filters
            const cleanedFilters = validateRestoredFilters(state.filters);
            setActiveFilters(cleanedFilters);
          }
          if (state.searchTerm) {
            setSearchTerm(state.searchTerm);
          }

          // Don't remove the state yet - remove it after successful restoration
          return true;
        }
      }
    } catch (error) {
      console.error("Error restoring navigation state:", error);
    }
    return false;
  };

  const saveNavigationState = () => {
    try {
      const state = {
        page: pagination.page,
        filters: activeFilters,
        searchTerm: searchTerm,
        timestamp: Date.now(),
      };
      sessionStorage.setItem("patientListState", JSON.stringify(state));
    } catch (error) {
      console.error("Error saving navigation state:", error);
    }
  };

  // Consolidated patient loading with debouncing
  useEffect(() => {
    if (viewMode !== "patients") return;

    // Skip initial load if we're restoring state and no actual changes
    const hasStoredState = sessionStorage.getItem("patientListState");

    // Load patients with a small delay to prevent multiple simultaneous calls
    const timeoutId = setTimeout(() => {
      // Check if there are actual filter values, not just empty structure
      const hasActiveFilters =
        (activeFilters.filters &&
          Object.keys(activeFilters.filters).length > 0) ||
        (activeFilters.general_filters &&
          Object.keys(activeFilters.general_filters).length > 0);
      const hasSearchTerm = searchTerm.trim().length > 0;
      const isInitialLoad = originalPatients.length === 0;

      // Always load on initial app load, even if filters are restored from session
      if (isInitialLoad) {
        // If filters are active (e.g., restored from session), use filtered loading
        if (hasActiveFilters) {
          console.log("🔍 Initial load with restored filters:", activeFilters);
          loadPatientsWithFilters(activeFilters, pagination.page);
        } else {
          loadPatients(1); // Load from page 1 without filters
        }
        return;
      }

      // For search terms, always do server-side search (don't use client-side filtering)
      if (hasSearchTerm) {
        loadPatients(1); // Server-side search with the search term
        return;
      }

      // For filters only (no search), use server-side metadata filtering
      if (hasActiveFilters) {
        // Don't interfere if a page change is already in progress
        console.log(
          `🔍 Main effect triggered - isPageChanging: ${isPageChanging}, page: ${pagination.page}`
        );
        if (isPageChanging) {
          console.log("⏭️ Skipping main effect - page change in progress");
          return;
        }
        console.log(
          "🔍 Loading patients with filters from main effect:",
          activeFilters
        );
        loadPatientsWithFilters(activeFilters, pagination.page);
        return;
      }

      loadPatients(pagination.page); // Regular pagination for unfiltered results only
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [
    pagination.page,
    searchTerm,
    viewMode,
    pagination.per_page,
    activeFilters,
    isPageChanging,
  ]);

  // Load related data for filtering on app initialization
  useEffect(() => {
    console.log("Loading related data for filtering on app start");

    // Clean up any corrupted or problematic session data on app start
    try {
      const savedState = sessionStorage.getItem("patientListState");
      if (savedState) {
        const state = JSON.parse(savedState);
        const validatedFilters = validateRestoredFilters(state.filters || {});

        // If filters were significantly changed during validation, clear the session
        if (
          Object.keys(state.filters || {}).length >
          Object.keys(validatedFilters).length
        ) {
          console.log("🧹 Clearing session storage due to invalid filters");
          sessionStorage.removeItem("patientListState");
          setActiveFilters({});
        }
      }
    } catch (e) {
      console.log("🧹 Clearing corrupted session storage:", e.message);
      sessionStorage.removeItem("patientListState");
    }

    // Clear any existing filter cache on app initialization
    console.log("🧹 Clearing existing filter cache on app start");
    clearFilterCache();

    // Smart cache loading - only initialize when needed

    // Load initial patients normally
    if (viewMode === "patients") {
      loadPatients(1);
    }
  }, []);

  // REMOVED: loadRelatedDataForFiltering - now using lazy loading
  // Filter data will be loaded on-demand when individual resource dropdowns are opened
  // This avoids blocking the sidebar open with heavy resource loading

  const loadPatients = async (page = 1) => {
    // Prevent concurrent loading calls
    if (loading) {
      console.log("⏸️ Patient loading already in progress, skipping...");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Validate and clean active filters before proceeding
      const validatedFilters = validateRestoredFilters(activeFilters);
      if (JSON.stringify(validatedFilters) !== JSON.stringify(activeFilters)) {
        console.log(
          "🧹 Active filters were cleaned during loading:",
          validatedFilters
        );
        setActiveFilters(validatedFilters);
      }

      const params = {
        _count: pagination.per_page,
        _getpagesoffset: (page - 1) * pagination.per_page,
      };

      // Use generic 'search' parameter to let backend decide (ID vs name vs email)
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
        console.log("Searching patients with term:", searchTerm.trim());
      }

      console.log(
        "🔍 Loading patients with params:",
        JSON.stringify(params, null, 2)
      );
      console.log("🔍 Search term:", searchTerm);
      console.log("🔍 Page:", page);

      const response = await api.fetchResources("Patient", params);

      console.log("API response:", response);
      console.log("Response success:", response.success);
      console.log("Response data length:", response.data?.length);

      if (response.success) {
        const transformedPatients = (response.data || []).map(
          transformPatientForTable
        );

        console.log("Transformed patients:", transformedPatients.length);
        console.log("First patient sample:", transformedPatients[0]);

        // Backend filtering is now handled server-side, no need for client filtering
        setPatients(transformedPatients);
        setOriginalPatients(transformedPatients);

        console.log(
          "State updated - patients set to:",
          transformedPatients.length
        );

        // Update pagination
        const newPagination = {
          ...pagination,
          page: page,
          has_next: response.pagination.has_next || false,
          has_prev: page > 1,
          next_query: response.pagination.next_query,
          prev_query: response.pagination.prev_query,
          total: response.pagination.total || transformedPatients.length,
        };

        setPagination(newPagination);

        console.log(
          "Patients loaded:",
          transformedPatients.length,
          `(page ${page})`
        );

        // Related data is loaded separately in useEffect - don't block patient loading
      } else {
        throw new Error(response.message || "Failed to load patients");
      }
    } catch (err) {
      console.error("Error loading patients:", err);
      setError(err.message);
      setPatients([]);
      setPagination((prev) => ({
        ...prev,
        total: 0,
        has_next: false,
        has_prev: false,
      }));
    } finally {
      setLoading(false);
      setIsPageChanging(false);
    }
  };

  const transformPatientForTable = (patient) => {
    if (!patient) return null;

    const name = patient.name?.[0] || {};
    // Clean up given names - handle commas and extra spaces properly
    const given_names = name.given?.slice(0, 2) || [];
    const given_name =
      given_names
        .map((name) => name.split(",")[0].trim()) // Take only part before comma and trim
        .join(" ") || "Unknown";
    const family_name = name.family || "Unknown";

    const calculateAge = (birthDate) => {
      if (!birthDate) return "Unknown";
      try {
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (
          monthDiff < 0 ||
          (monthDiff === 0 && today.getDate() < birth.getDate())
        ) {
          age--;
        }
        return age >= 0 ? age : "Unknown";
      } catch {
        return "Unknown";
      }
    };

    const address = patient.address?.[0] || {};

    return {
      id: patient.id || "Unknown",
      given_name,
      family_name,
      age: calculateAge(patient.birthDate),
      gender: patient.gender || "Unknown",
      birth_date: patient.birthDate || null,
      city: address.city || null,
      state: address.state || null,
      postal_code: address.postalCode || null,
      active: patient.active !== false,
      _data_score: patient._data_score || 0,
    };
  };

  const handleSidebarToggle = async () => {
    console.log("🎛️ Sidebar toggle clicked! Current state:", sidebarOpen);
    if (!sidebarOpen) {
      // Initialize filter cache structure only (fast, no resource loading)
      try {
        console.log("🔧 Initializing filter cache structure for sidebar...");
        await initializeFilterCache(); // Now only initializes structure, doesn't load data
        console.log("✅ Filter cache structure ready");
      } catch (error) {
        console.warn("⚠️ Filter cache initialization failed:", error);
        // Continue anyway, sidebar will work with basic functionality
      }
    }
    setSidebarOpen(!sidebarOpen);
    console.log("🎛️ Sidebar state changed to:", !sidebarOpen);
  };

  const handleSidebarClose = () => setSidebarOpen(false);

  const handleSearchChange = (term) => {
    setSearchTerm(term);

    // Only reset to page 1 if this is a new search, not state restoration
    const hasStoredState = sessionStorage.getItem("patientListState");
    if (!hasStoredState) {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  };

  const handleFilterChange = (filterPayload) => {
    console.log("🎛️ Filter change received (normalized):", filterPayload);
    setActiveFilters(filterPayload);

    // Reset to page 1 when filters change
    setPagination((prev) => ({ ...prev, page: 1 }));

    // Check if there are any active filters in the payload
    const hasResourceFilters =
      filterPayload.filters && Object.keys(filterPayload.filters).length > 0;
    const hasGeneralFilters =
      filterPayload.general_filters &&
      Object.keys(filterPayload.general_filters).length > 0;
    const hasActiveFilters = hasResourceFilters || hasGeneralFilters;

    if (hasActiveFilters) {
      console.log("🔍 Loading patients with server-side filtering...");
      loadPatientsWithFilters(filterPayload, 1);
    } else {
      console.log("🔍 No filters active, loading normal dataset");
      loadPatients(1); // Load page 1 without filters
    }
  };

  const loadPatientsWithFilters = async (filters, page = 1) => {
    try {
      setLoading(true);
      setError(null);

      // Extract applied filters for metadata-driven search
      const appliedFilters = extractAppliedFiltersForMetadata(filters);

      const params = {
        _count: pagination.per_page,
        _getpagesoffset: (page - 1) * pagination.per_page,
      };

      console.log("🔍 Loading patients with metadata filters:", appliedFilters);
      console.log("🔍 Pagination params:", params);

      // Use the new metadata-driven patient search
      const response = await api.loadPatientsWithFilters(
        params,
        appliedFilters
      );

      if (response.success && response.data) {
        const transformedPatients = response.data.map(transformPatientForTable);
        setPatients(transformedPatients);
        setOriginalPatients(transformedPatients); // Update original as well

        // Update pagination for filtered results
        // Check if query was optimized and returned all results
        const isOptimized =
          response.pagination.optimized || response.query_optimized;
        const returnedAllResults = isOptimized && !response.pagination.has_next;

        if (response.pagination.loaded_all_filtered || returnedAllResults) {
          // All filtered records loaded - disable server pagination, use client-side
          console.log(
            `📄 All filtered records loaded (${transformedPatients.length}) - switching to client-side pagination`
          );
          setPagination((prev) => ({
            ...prev,
            page: prev.page, // Keep the current page from state, not the requested page
            total: transformedPatients.length,
            has_next:
              Math.ceil(transformedPatients.length / prev.per_page) > prev.page,
            has_prev: prev.page > 1,
            per_page: prev.per_page, // Keep user's page size preference for display
            loaded_all_filtered: true, // Flag for frontend to handle client-side pagination
            all_filtered_records: transformedPatients.length,
            optimized: true,
          }));
        } else {
          // Regular server-side pagination
          setPagination((prev) => ({
            ...prev,
            page: page,
            total:
              response.pagination.total ||
              response.matching_patient_count ||
              transformedPatients.length,
            has_next: response.pagination.has_next || false,
            has_prev: page > 1,
            per_page: prev.per_page, // Always keep the frontend's per_page setting
            next_query: response.pagination.next_query,
            prev_query: response.pagination.prev_query,
            optimized: response.pagination.optimized || false, // Track if query was optimized
            loaded_all_filtered: false,
          }));
        }

        // Log pagination details for debugging
        console.log("📄 Updated pagination:", {
          page,
          total: response.pagination.total,
          per_page: response.pagination.per_page,
          has_next: response.pagination.has_next,
          optimized: response.pagination.optimized,
        });

        console.log(
          `✅ Loaded ${transformedPatients.length} patients from ${response.matching_patient_count} total matches`
        );
        if (response.query_optimized) {
          console.log(
            `⚡ Query was optimized: effective page size = ${response.effective_page_size}`
          );
        }
      } else {
        throw new Error(response.message || "Failed to load filtered patients");
      }
    } catch (err) {
      console.error("Error loading filtered patients:", err);
      setError(err.message);
    } finally {
      setLoading(false);
      setIsPageChanging(false);
    }
  };

  // Extract applied filters in the format expected by the metadata API
  const extractAppliedFiltersForMetadata = (filterPayload) => {
    const appliedFilters = {};

    // Handle filters from the resource-specific filters object (client-side filtering)
    if (filterPayload.filters && typeof filterPayload.filters === "object") {
      Object.entries(filterPayload.filters).forEach(([key, filterData]) => {
        // Handle age range filter (object with min_age/max_age)
        if (
          key === "age_range" &&
          filterData &&
          typeof filterData === "object" &&
          (filterData.min_age !== undefined || filterData.max_age !== undefined)
        ) {
          appliedFilters[key] = filterData;
        }
        // Handle regular filters (arrays)
        else if (
          filterData &&
          Array.isArray(filterData) &&
          filterData.length > 0
        ) {
          appliedFilters[key] = filterData;
        }
      });
    }

    // Handle filters from general_filters (server-side metadata filtering)
    if (
      filterPayload.general_filters &&
      typeof filterPayload.general_filters === "object"
    ) {
      Object.entries(filterPayload.general_filters).forEach(
        ([key, filterData]) => {
          // Handle age range filter (object with min_age/max_age)
          if (
            key === "age_range" &&
            filterData &&
            typeof filterData === "object" &&
            (filterData.min_age !== undefined ||
              filterData.max_age !== undefined)
          ) {
            appliedFilters[key] = filterData;
          }
          // Handle regular filters (arrays)
          else if (
            filterData &&
            Array.isArray(filterData) &&
            filterData.length > 0
          ) {
            appliedFilters[key] = filterData;
          }
        }
      );
    }

    console.log("🎯 Extracted filters for metadata:", appliedFilters);
    return appliedFilters;
  };

  const handlePatientSelect = (patient) => {
    try {
      const patientId = patient.id;
      if (patientId && patientId !== "Unknown") {
        saveNavigationState();
        console.log("Navigating to patient details, state saved");
        navigate(`/patient/${patientId}`);
      }
    } catch (error) {
      console.error("Navigation error:", error);
      saveNavigationState();
      window.location.href = `/patient/${patient.id}`;
    }
  };

  const handleExport = () => {
    // Export current displayed patients (already filtered by server)
    const csvData = convertToCSV(patients);

    const blob = new Blob([csvData], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `patients_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const convertToCSV = (data) => {
    if (!data.length) return "No data to export";

    const headers = Object.keys(data[0]);

    const csvRows = [
      "# FHIR Patient Export",
      `# Export Date: ${new Date().toISOString()}`,
      `# Total Records: ${data.length}`,
      "",
      headers.join(","),
    ];

    data.forEach((row) => {
      const values = headers.map((header) => {
        const value = row[header];
        if (value === null || value === undefined) return "";
        // Convert to string for consistent handling
        const strValue = String(value);
        // Check if value needs quoting (contains comma, double quote, or newline)
        const needsQuoting = strValue.includes(",") || strValue.includes('"') || strValue.includes("\n") || strValue.includes("\r");
        if (needsQuoting) {
          // Escape double quotes by doubling them, then wrap in quotes (RFC 4180)
          return `"${strValue.replace(/"/g, '""')}"`;
        }
        return strValue;
      });
      csvRows.push(values.join(","));
    });

    return csvRows.join("\n");
  };

  const handleRefresh = () => {
    console.log("🔄 Refreshing patients and clearing filter cache...");

    // Clear filter cache to force reload of filter data
    clearFilterCache();

    // Clear session state and any problematic filters
    sessionStorage.removeItem("patientListState");
    setActiveFilters({});

    // Reset pagination
    setPagination((prev) => ({
      ...prev,
      page: 1,
      next_query: null,
      prev_query: null,
    }));

    // Reload patients from page 1 - filter data will be loaded on demand
    loadPatients(1);
    // REMOVED: loadRelatedDataForFiltering();
  };

  const handlePageChange = (newPage) => {
    if (newPage !== pagination.page && newPage > 0) {
      console.log(
        `📄 Navigating to page ${newPage} (isPageChanging: ${isPageChanging})`
      );
      setIsPageChanging(true);
      console.log(`📄 Set isPageChanging to true for page ${newPage}`);
      setPagination((prev) => ({ ...prev, page: newPage }));

      // Check if all filtered records are already loaded (client-side pagination)
      if (pagination.loaded_all_filtered) {
        console.log(
          "📄 Using client-side pagination for all loaded filtered records"
        );
        setIsPageChanging(false);
        // No need to fetch data - just update page state for client-side pagination
        return;
      }

      // Check if there are active filters in the formatted payload
      const hasResourceFilters =
        activeFilters.filters && Object.keys(activeFilters.filters).length > 0;
      const hasGeneralFilters =
        activeFilters.general_filters &&
        Object.keys(activeFilters.general_filters).length > 0;
      const hasActiveFilters = hasResourceFilters || hasGeneralFilters;

      if (hasActiveFilters) {
        console.log("📄 Loading page with filters:", activeFilters);
        loadPatientsWithFilters(activeFilters, newPage);
      } else {
        console.log("📄 Loading page without filters");
        loadPatients(newPage);
      }
    }
  };

  const handlePageSizeChange = (newPageSize) => {
    console.log(`📏 Changing page size to ${newPageSize}`);
    setPagination((prev) => ({
      ...prev,
      per_page: newPageSize,
      page: 1,
      next_query: null,
      prev_query: null,
    }));

    // Check if all filtered records are already loaded (client-side pagination)
    if (pagination.loaded_all_filtered) {
      console.log("📏 Using client-side pagination for page size change");
      // No need to reload data - just update page size for client-side pagination
      return;
    }

    // Reload data with new page size and current filters
    const hasResourceFilters =
      activeFilters.filters && Object.keys(activeFilters.filters).length > 0;
    const hasGeneralFilters =
      activeFilters.general_filters &&
      Object.keys(activeFilters.general_filters).length > 0;
    const hasActiveFilters = hasResourceFilters || hasGeneralFilters;

    if (hasActiveFilters) {
      console.log("📏 Reloading with new page size and filters");
      // Wait for pagination state to update, then load
      setTimeout(() => loadPatientsWithFilters(activeFilters, 1), 50);
    } else {
      console.log("📏 Reloading with new page size, no filters");
      setTimeout(() => loadPatients(1), 50);
    }
  };

  const handleFhirSearchResults = async (searchResults, searchParams) => {
    console.log("🔍 FHIR Search Results received:", searchResults);
    console.log("🔍 Search Parameters:", searchParams);

    // Check if this is a condition-based search
    const conditionCode = searchParams["_has:Condition:patient:code"];
    if (conditionCode) {
      console.log(`🔍 Searching for patients with condition: ${conditionCode}`);

      try {
        setLoading(true);

        // Use the dedicated condition search API if available
        const conditionSearchResponse = await api.searchPatientsByCondition(
          conditionCode,
          {
            per_page: CONFIG.ui.defaultPageSize,
            page: 1,
          }
        );

        console.log(
          "🔍 Backend condition search response:",
          conditionSearchResponse
        );

        if (
          conditionSearchResponse.success &&
          conditionSearchResponse.data &&
          conditionSearchResponse.data.length > 0
        ) {
          console.log(
            `🔍 Found ${conditionSearchResponse.data.length} patients with condition ${conditionCode} via backend`
          );
          setPatients(conditionSearchResponse.data);
          setOriginalPatients(conditionSearchResponse.data);

          // Update pagination to reflect filtered results
          setPagination((prev) => ({
            ...prev,
            total: conditionSearchResponse.data.length,
            page: 1,
            has_next: false,
            has_prev: false,
          }));
          setLoading(false);
          return;
        } else {
          console.warn(
            "🔍 Backend condition search found no patients, trying direct FHIR results"
          );
        }
      } catch (error) {
        console.warn(
          "🔍 Condition search API failed, falling back to FHIR results:",
          error
        );
      }
    }

    // Fallback: Process FHIR search results directly
    console.log("🔍 Processing direct FHIR search results...");
    console.log("🔍 FHIR results structure:", {
      hasEntry: searchResults && searchResults.entry,
      entryCount: searchResults?.entry?.length || 0,
      total: searchResults?.total,
      resourceType: searchResults?.resourceType,
    });

    if (
      searchResults &&
      searchResults.entry &&
      searchResults.entry.length > 0
    ) {
      // Extract patient IDs from FHIR search results
      const patientIds = searchResults.entry
        .map((entry, index) => {
          console.log(`🔍 Processing entry ${index}:`, {
            resourceType: entry.resource?.resourceType,
            id: entry.resource?.id,
            fullUrl: entry.fullUrl,
          });

          if (entry.resource && entry.resource.resourceType === "Patient") {
            return entry.resource.id;
          }
          return null;
        })
        .filter(Boolean);

      console.log(
        `🔍 Extracted ${patientIds.length} patient IDs from FHIR results:`,
        patientIds
      );

      if (patientIds.length > 0) {
        try {
          // Load the specific patients from the search results
          console.log("🔍 Loading patients with IDs:", patientIds);
          const patientsResponse = await api.loadPatients({
            page: 1,
            per_page: Math.min(patientIds.length, CONFIG.ui.defaultPageSize),
            ids: patientIds.join(","),
          });

          console.log("🔍 Backend response for patient IDs:", patientsResponse);

          if (patientsResponse.success && patientsResponse.data) {
            // Filter the results to only include patients from FHIR search
            const filteredPatients = patientsResponse.data.filter((patient) => {
              const matches = patientIds.includes(patient.id);
              console.log(
                `🔍 Patient ${patient.id} matches FHIR results: ${matches}`
              );
              return matches;
            });

            console.log(
              `🔍 Successfully filtered to ${filteredPatients.length} matching patients from FHIR search`
            );

            if (filteredPatients.length > 0) {
              setPatients(filteredPatients);
              setOriginalPatients(filteredPatients);

              // Update pagination to reflect filtered results
              setPagination((prev) => ({
                ...prev,
                total: filteredPatients.length,
                page: 1,
                has_next: false,
                has_prev: false,
              }));
            } else {
              console.warn(
                "🔍 No patients from backend matched FHIR search results"
              );
              setPatients([]);
              setOriginalPatients([]);
              setPagination((prev) => ({ ...prev, total: 0 }));
            }
          } else {
            console.error(
              "🔍 Backend failed to load patients:",
              patientsResponse
            );
            setError("Failed to load patient data from backend");
          }
        } catch (error) {
          console.error("🔍 Error loading FHIR search results:", error);
          setError(
            `Failed to load patients matching condition: ${error.message}`
          );
        }
      } else {
        console.log("🔍 No patient IDs extracted from FHIR search results");
        setPatients([]);
        setOriginalPatients([]);
        setPagination((prev) => ({ ...prev, total: 0 }));
      }
    } else {
      console.log("🔍 FHIR search returned no results");
      setPatients([]);
      setOriginalPatients([]);
      setPagination((prev) => ({ ...prev, total: 0 }));
    }

    setLoading(false);
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    if (mode === "patients") {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  };

  const getCurrentDateTime = () => {
    try {
      return new Date().toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return new Date().toString();
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5" }}>
      <Header
        onSidebarToggle={handleSidebarToggle}
        onSearchChange={handleSearchChange}
        onExport={handleExport}
        onRefresh={handleRefresh}
        searchTerm={searchTerm}
        currentDateTime={getCurrentDateTime()}
      />

      <div className="app-layout">
        {viewMode === "patients" && (
          <DynamicFilterSidebar
            isOpen={sidebarOpen}
            onClose={handleSidebarClose}
            onFilterChange={handleFilterChange}
            activeFilters={activeFilters}
            // selectedResourceTypes will be fetched dynamically from backend
            patients={originalPatients}
            observations={observations}
            diagnosticReports={diagnosticReports}
            documentReferences={documentReferences}
            medicalData={medicalData}
            pagination={pagination}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            fhirBaseUrl="https://hapi.fhir.org/baseR4"
            onFhirSearch={handleFhirSearchResults}
          />
        )}

        <div
          className={`main-content ${
            sidebarOpen && viewMode === "patients" ? "sidebar-open" : ""
          }`}
        >
          {viewMode === "patients" ? (
            <>
              <div
                style={{
                  background: "white",
                  padding: "12px 20px",
                  borderBottom: "1px solid #dee2e6",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                }}
              >
                <div style={{ fontSize: "0.9rem", color: "#6c757d" }}>
                  {patients.length > 0 ? (
                    <>
                      Showing page {pagination.page} ({patients.length} patients
                      on this page)
                      {((activeFilters.filters &&
                        Object.keys(activeFilters.filters).length > 0) ||
                        (activeFilters.general_filters &&
                          Object.keys(activeFilters.general_filters).length >
                            0)) && (
                        <>
                          <span
                            style={{
                              marginLeft: "8px",
                              color: "#dc3545",
                              fontWeight: "500",
                            }}
                          >
                            • Filtered from {originalPatients.length} total
                          </span>
                          <button
                            onClick={() => {
                              setActiveFilters({});
                              setPatients(originalPatients);
                              setPagination((prev) => ({ ...prev, page: 1 }));
                            }}
                            style={{
                              marginLeft: "12px",
                              padding: "4px 8px",
                              fontSize: "0.8rem",
                              background: "#dc3545",
                              color: "white",
                              border: "none",
                              borderRadius: "3px",
                              cursor: "pointer",
                              fontWeight: "500",
                            }}
                            title="Clear all active filters"
                          >
                            Clear Filters
                          </button>
                        </>
                      )}
                      {pagination.has_next && (
                        <span style={{ marginLeft: "8px", color: "#28a745" }}>
                          • More pages available
                        </span>
                      )}
                    </>
                  ) : (
                    "No patients found"
                  )}
                </div>

                <div
                  style={{ display: "flex", gap: "8px", alignItems: "center" }}
                >
                  <button
                    disabled={pagination.page === 1 || loading}
                    onClick={() => handlePageChange(1)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #dee2e6",
                      borderRadius: "4px",
                      background:
                        pagination.page === 1 || loading ? "#f8f9fa" : "white",
                      cursor:
                        pagination.page === 1 || loading
                          ? "not-allowed"
                          : "pointer",
                      color:
                        pagination.page === 1 || loading
                          ? "#6c757d"
                          : "#495057",
                    }}
                  >
                    First
                  </button>
                  <button
                    disabled={pagination.page === 1 || loading}
                    onClick={() => handlePageChange(pagination.page - 1)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #dee2e6",
                      borderRadius: "4px",
                      background:
                        pagination.page === 1 || loading ? "#f8f9fa" : "white",
                      cursor:
                        pagination.page === 1 || loading
                          ? "not-allowed"
                          : "pointer",
                      color:
                        pagination.page === 1 || loading
                          ? "#6c757d"
                          : "#495057",
                    }}
                  >
                    Previous
                  </button>

                  <span
                    style={{
                      fontWeight: "600",
                      padding: "6px 12px",
                      background: "#007bff",
                      color: "white",
                      borderRadius: "4px",
                      minWidth: "40px",
                      textAlign: "center",
                    }}
                  >
                    {pagination.page}
                  </span>

                  <button
                    disabled={!pagination.has_next || loading}
                    onClick={() => handlePageChange(pagination.page + 1)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #dee2e6",
                      borderRadius: "4px",
                      background:
                        !pagination.has_next || loading ? "#f8f9fa" : "white",
                      cursor:
                        !pagination.has_next || loading
                          ? "not-allowed"
                          : "pointer",
                      color:
                        !pagination.has_next || loading ? "#6c757d" : "#495057",
                    }}
                  >
                    Next
                  </button>

                  <select
                    value={pagination.per_page}
                    onChange={(e) =>
                      handlePageSizeChange(Number(e.target.value))
                    }
                    disabled={loading}
                    style={{
                      padding: "6px 8px",
                      border: "1px solid #dee2e6",
                      borderRadius: "4px",
                      background: "white",
                      cursor: loading ? "not-allowed" : "pointer",
                    }}
                  >
                    {CONFIG.ui.pageSizeOptions.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>

                  <span style={{ fontSize: "0.9rem", color: "#6c757d" }}>
                    per page
                  </span>
                </div>
              </div>

              <PatientTable
                patients={(() => {
                  // Check if we have all filtered records loaded
                  if (pagination.loaded_all_filtered) {
                    // Apply client-side pagination to show manageable chunks
                    const startIndex =
                      (pagination.page - 1) * pagination.per_page;
                    const endIndex = startIndex + pagination.per_page;
                    return patients.slice(startIndex, endIndex);
                  }
                  // Otherwise use server-paginated results as-is
                  return patients;
                })()}
                searchTerm={searchTerm}
                activeFilters={activeFilters}
                onPatientSelect={handlePatientSelect}
                loading={loading}
                pagination={(() => {
                  if (pagination.loaded_all_filtered) {
                    // Calculate client-side pagination info
                    const totalPatients = patients.length;
                    const currentPage = pagination.page || 1;
                    const perPage =
                      pagination.per_page || CONFIG.ui.defaultPageSize;
                    const totalPages = Math.ceil(totalPatients / perPage);

                    return {
                      ...pagination,
                      total: totalPatients,
                      has_next: currentPage < totalPages,
                      has_prev: currentPage > 1,
                      page: currentPage,
                      per_page: perPage,
                    };
                  }
                  return pagination;
                })()}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          ) : (
            <DynamicResourceViewer />
          )}
        </div>
      </div>
    </div>
  );
};

function PatientDetailsWrapper() {
  const { patientId } = useParams();
  const navigate = useNavigate();

  const handleBackToList = () => {
    // Don't navigate immediately - let the MainPage component restore state first
    navigate("/", { replace: true });
  };

  return (
    <PatientDetails patientId={patientId} onBackToList={handleBackToList} />
  );
}

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route
            path="/patient/:patientId"
            element={<PatientDetailsWrapper />}
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
