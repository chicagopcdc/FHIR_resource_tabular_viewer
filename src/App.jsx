import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, useNavigate, useParams } from "react-router-dom";
import Header from "./Header";
import PatientTable from "./PatientTable";
import PatientDetails from "./PatientDetails";
import { FilterSheet } from "./components/FilterSheet";
import { usePatients } from "./hooks/useQueries";
import { CONFIG } from "./config";
import "./App.css"; // Keep root app.css if any layout styles are left, else can be removed later

const DynamicResourceViewer = () => null;

function MainPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(CONFIG.ui.defaultPageSize);
  const [viewMode, setViewMode] = useState("patients"); // patients or resources

  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const handleSearchChange = (term) => {
    setSearchTerm(term);
    setPage(1); // Reset page on new search
  };

  const handleFilterChange = (filters) => {
    setActiveFilters(filters);
    setPage(1); // Reset page on filter
  };

  const handlePageChange = (newPage) => {
    setPage(newPage);
  };

  const handlePageSizeChange = (newSize) => {
    setPageSize(newSize);
    setPage(1);
  };

  const handlePatientSelect = (patient) => {
    if (patient && patient.id) {
      navigate(`/patient/${patient.id}`);
    }
  };

  // Setup params for TanStack Query
  const queryParams = {
    _count: pageSize,
    _getpagesoffset: (page - 1) * pageSize,
    ...(searchTerm ? { query: searchTerm } : {})
  };

  const { data: responseData, isLoading, isError, error } = usePatients(queryParams, activeFilters);

  const transformPatientForTable = (patient) => {
    if (!patient) return null;

    const name = patient.name?.[0] || {};
    // Clean up given names - handle commas and extra spaces properly
    const given_names = name.given?.slice(0, 2) || [];
    const given_name =
      given_names
        .map((n) => n.split(",")[0].trim()) // Take only part before comma and trim
        .join(" ") || "Unknown";
    const family_name = name.family || "Unknown";

    const calculateAge = (birthDate) => {
      if (!birthDate) return "Unknown";
      const dob = new Date(birthDate);
      const diffMs = Date.now() - dob.getTime();
      const ageDate = new Date(diffMs);
      return Math.abs(ageDate.getUTCFullYear() - 1970);
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
      country: address.country || null,
      postal_code: address.postalCode || null,
      active: patient.active !== undefined ? patient.active : true, // default to active if not specified
      originalResource: patient, // Keep original resource just in case
    };
  };

  const patients = (responseData?.data || []).map(transformPatientForTable).filter(Boolean);
  
  // Merge backend pagination with local state so PatientTable gets correctly bound values
  const pagination = {
    total: responseData?.pagination?.total || 0,
    has_next: responseData?.pagination?.has_next || false,
    has_prev: page > 1,
    page: page,
    per_page: pageSize
  };

  const getCurrentDateTime = () => {
    return new Date().toLocaleString("en-US", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", timeZoneName: "short",
    });
  };

  const checkHasActiveFilters = () => {
    if (!activeFilters || Object.keys(activeFilters).length === 0) return false;
    if (activeFilters.filters && Object.keys(activeFilters.filters).length > 0) return true;
    if (activeFilters.general_filters && Object.keys(activeFilters.general_filters).length > 0) return true;
    if (!activeFilters.filters && !activeFilters.general_filters && Object.keys(activeFilters).length > 0) return true;
    return false;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <Header
        onSearchChange={handleSearchChange}
        onRefresh={() => window.location.reload()}
        searchTerm={searchTerm}
        hasActiveFilters={checkHasActiveFilters()}
        onToggleFilters={() => setIsFiltersOpen(true)}
        onClearFilters={() => handleFilterChange({})}
      />
      
      <FilterSheet 
        isOpen={isFiltersOpen}
        onClose={() => setIsFiltersOpen(false)}
        activeFilters={activeFilters}
        onFilterChange={handleFilterChange}
        patients={patients}
        pagination={pagination}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      <main className="flex-1 w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {viewMode === "patients" ? (
          <>

            {isError ? (
              <div className="p-4 bg-red-50 text-red-700 rounded-md border border-red-200">
                <p className="font-medium">Error loading patients</p>
                <p className="text-sm">{error?.message || "An unknown error occurred"}</p>
              </div>
            ) : (
              <PatientTable
                patients={patients}
                searchTerm={searchTerm}
                onPatientSelect={handlePatientSelect}
                loading={isLoading}
                pagination={pagination}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            )}
          </>
        ) : (
          <DynamicResourceViewer />
        )}
      </main>
    </div>
  );
}

function PatientDetailsWrapper() {
  const { patientId } = useParams();
  const navigate = useNavigate();

  return (
    <PatientDetails patientId={patientId} onBackToList={() => navigate("/", { replace: true })} />
  );
}

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/patient/:patientId" element={<PatientDetailsWrapper />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
