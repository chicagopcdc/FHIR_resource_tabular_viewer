// App.js - Updated with working pagination filters
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import Header from './Header';
import DynamicFilterSidebar from './DynamicFilterSidebar';
import PatientTable from './PatientTable';
import PatientDetails from './PatientDetails';
import { applyEnhancedFilters, buildFHIRSearchParams, getEnhancedFilterSummary } from './filterUtils';

import * as api from './api';
import './App.css';

const DynamicResourceViewer = () => null;

const MainPage = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
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
    allergies: []
  });
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('patients');
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: 50,
    total: 0,
    has_next: false,
    has_prev: false,
    next_query: null,
    prev_query: null
  });
  const [originalPatients, setOriginalPatients] = useState([]);
  const [filterSummary, setFilterSummary] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (viewMode === 'patients') {
      loadPatients();
    }
  }, [pagination.page, searchTerm, viewMode, pagination.per_page]);

  // Update filter summary when filters change
  useEffect(() => {
    setFilterSummary(getEnhancedFilterSummary(activeFilters));
  }, [activeFilters]);

  const loadPatients = async () => {
    try {
      setLoading(true);
      setError(null);

      // Build FHIR search parameters from active filters
      const filterParams = buildFHIRSearchParams(activeFilters, 'Patient');
      
      const params = { 
        _count: pagination.per_page,
        ...filterParams
      };

      if (pagination.page > 1) {
        if (pagination.next_query) {
          Object.assign(params, pagination.next_query);
        } else {
          params._getpagesoffset = (pagination.page - 1) * pagination.per_page;
        }
      }

      if (searchTerm.trim()) {
        params.name = searchTerm.trim();
      }

      if (!searchTerm.trim() && Object.keys(filterParams).length === 0) {
        params._sort = '-_lastUpdated';
      }

      console.log('Loading patients with filters:', params);
      const response = await api.fetchResources('Patient', params);

      if (response.success) {
        const transformedPatients = (response.data || []).map(transformPatientForTable);
        
        // Apply client-side filters
        const clientFilteredPatients = applyEnhancedFilters(
          transformedPatients, 
          activeFilters,
          { observations, diagnosticReports, documentReferences, medicalData }
        );
        
        setPatients(clientFilteredPatients);
        setOriginalPatients(transformedPatients);

        const newPagination = {
          ...pagination,
          has_next: response.pagination.has_next || false,
          has_prev: response.pagination.has_prev || pagination.page > 1,
          next_query: response.pagination.next_query || null,
          prev_query: response.pagination.prev_query || null
        };

        setPagination(newPagination);
        console.log('Patients loaded:', clientFilteredPatients.length, 'Has next:', newPagination.has_next);
      } else {
        throw new Error(response.message || 'Failed to load patients');
      }
    } catch (err) {
      console.error('Error loading patients:', err);
      setError(err.message);
      setPatients([]);
      setPagination(prev => ({
        ...prev,
        total: 0,
        has_next: false,
        has_prev: false
      }));
    } finally {
      setLoading(false);
    }
  };

  const transformPatientForTable = (patient) => {
    const name = patient.name?.[0] || {};
    const given_name = name.given?.join(' ') || 'Unknown';
    const family_name = name.family || 'Unknown';

    const calculateAge = (birthDate) => {
      if (!birthDate) return 'Unknown';
      const today = new Date();
      const birth = new Date(birthDate);
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
      return age;
    };

    const address = patient.address?.[0] || {};

    return {
      id: patient.id,
      given_name,
      family_name,
      age: calculateAge(patient.birthDate),
      gender: patient.gender || 'Unknown',
      birth_date: patient.birthDate,
      city: address.city,
      state: address.state,
      postal_code: address.postalCode,
      active: patient.active !== false
    };
  };

  const handleSidebarToggle = () => setSidebarOpen(!sidebarOpen);
  const handleSidebarClose = () => setSidebarOpen(false);

  const handleSearchChange = (term) => {
    setSearchTerm(term);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (newFilters) => {
    console.log('Filter change received:', newFilters);
    setActiveFilters(newFilters);
    
    // Apply client-side filtering
    const filteredPatients = applyEnhancedFilters(
      originalPatients, 
      newFilters,
      { observations, diagnosticReports, documentReferences, medicalData }
    );
    
    setPatients(filteredPatients);
    setPagination(prev => ({ ...prev, page: 1 }));
    
    // Reload from server with new filters after short delay
    setTimeout(() => {
      loadPatients();
    }, 100);
  };

  const handlePatientSelect = (patient) => {
    try {
      const patientId = patient.id;
      if (patientId) {
        navigate(`/patient/${patientId}`);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      window.location.href = `/patient/${patient.id}`;
    }
  };

  const handleExport = () => {
    const filteredData = applyEnhancedFilters(originalPatients, activeFilters, {
      observations, diagnosticReports, documentReferences, medicalData
    });
    const csvData = convertToCSV(filteredData, activeFilters);
    
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `filtered_patients_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const convertToCSV = (data, filters) => {
    if (!data.length) return 'No data to export';
    
    const headers = Object.keys(data[0]);
    const filterSummary = getEnhancedFilterSummary(filters);
    
    const csvRows = [
      `# FHIR Patient Export`,
      `# Export Date: ${new Date().toISOString()}`,
      `# Filters Applied: ${filterSummary}`,
      `# Total Records: ${data.length}`,
      '',
      headers.join(',')
    ];
    
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header];
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      });
      csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
  };

  const handleRefresh = () => {
    const randomOffset = Math.floor(Math.random() * 1000) * 50;
    setPagination(prev => ({ 
      ...prev, 
      page: 1, 
      next_query: null, 
      prev_query: null,
      randomOffset 
    }));
    loadPatients();
  };

  const handleSettings = () => console.log('Settings functionality');

  const handlePageChange = (newPage) => {
    if (newPage !== pagination.page && newPage > 0) {
      console.log(`Navigating to page ${newPage}`);
      setPagination(prev => ({ ...prev, page: newPage }));
    }
  };

  const handlePageSizeChange = (newPageSize) => {
    console.log(`Changing page size to ${newPageSize}`);
    setPagination(prev => ({ 
      ...prev, 
      per_page: newPageSize, 
      page: 1,
      next_query: null,
      prev_query: null
    }));
  };

  const handleViewModeChange = (mode) => {
    setViewMode(mode);
    if (mode === 'patients') {
      setPagination(prev => ({ ...prev, page: 1 }));
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
      <Header 
        onSidebarToggle={handleSidebarToggle}
        onSearchChange={handleSearchChange}
        onExport={handleExport}
        onRefresh={handleRefresh}
        onSettings={handleSettings}
        searchTerm={searchTerm}
      />

      <div style={{ background: 'white', borderBottom: '1px solid #dee2e6', padding: '12px 20px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', maxWidth: '1400px', margin: '0 auto' }}>
          <span style={{ fontWeight: '600', marginRight: '15px', color: '#495057' }}>View:</span>
          <button
            onClick={() => handleViewModeChange('patients')}
            style={{
              padding: '8px 16px',
              border: '2px solid transparent',
              borderRadius: '6px',
              background: viewMode === 'patients' ? '#007bff' : 'transparent',
              color: viewMode === 'patients' ? 'white' : '#495057',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.2s ease',
              borderColor: viewMode === 'patients' ? '#007bff' : '#dee2e6'
            }}
          >
            Patients
          </button>
          <button
            onClick={() => handleViewModeChange('resources')}
            style={{
              padding: '8px 16px',
              border: '2px solid transparent',
              borderRadius: '6px',
              background: viewMode === 'resources' ? '#007bff' : 'transparent',
              color: viewMode === 'resources' ? 'white' : '#495057',
              cursor: 'pointer',
              fontWeight: '500',
              transition: 'all 0.2s ease',
              borderColor: viewMode === 'resources' ? '#007bff' : '#dee2e6'
            }}
          >
            Resources
          </button>
        </div>
      </div>

      {/* Filter Summary Bar */}
      {filterSummary !== 'No filters applied' && (
        <div style={{ 
          background: '#e3f2fd', 
          padding: '8px 20px', 
          borderBottom: '1px solid #bbdefb',
          fontSize: '0.9rem',
          color: '#1976d2'
        }}>
          <strong>Active Filters:</strong> {filterSummary}
          <button 
            onClick={() => handleFilterChange({})}
            style={{
              marginLeft: '12px',
              background: 'transparent',
              border: '1px solid #1976d2',
              color: '#1976d2',
              padding: '2px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            Clear All
          </button>
        </div>
      )}

      <div className="app-layout">
        {viewMode === 'patients' && (
          <DynamicFilterSidebar 
            isOpen={sidebarOpen} 
            onClose={handleSidebarClose}
            onFilterChange={handleFilterChange}
            currentResourceType="Patient"
            patients={originalPatients}
            observations={observations}
            diagnosticReports={diagnosticReports}
            documentReferences={documentReferences}
            medicalData={medicalData}
            pagination={pagination}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
          />
        )}

        <div className={`main-content ${sidebarOpen && viewMode === 'patients' ? 'sidebar-open' : ''}`}>
          {viewMode === 'patients' ? (
            <>
              {/* Pagination Info Bar */}
              <div style={{ 
                background: "white", 
                padding: "12px 20px", 
                borderBottom: "1px solid #dee2e6", 
                display: "flex", 
                justifyContent: "space-between", 
                alignItems: "center",
                boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
              }}>
                <div style={{ fontSize: "0.9rem", color: "#6c757d" }}>
                  {patients.length > 0 ? (
                    <>
                      Showing page {pagination.page} ({patients.length} patients on this page)
                      {Object.keys(activeFilters).length > 0 && (
                        <span style={{ marginLeft: "8px", color: "#dc3545", fontWeight: "500" }}>
                          • Filtered from {originalPatients.length} total
                        </span>
                      )}
                      {pagination.has_next && (
                        <span style={{ marginLeft: "8px", color: "#28a745" }}>
                          • More pages available
                        </span>
                      )}
                    </>
                  ) : (
                    'No patients found'
                  )}
                </div>
                
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                  <button 
                    disabled={pagination.page === 1 || loading} 
                    onClick={() => handlePageChange(1)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #dee2e6",
                      borderRadius: "4px",
                      background: pagination.page === 1 || loading ? "#f8f9fa" : "white",
                      cursor: pagination.page === 1 || loading ? "not-allowed" : "pointer",
                      color: pagination.page === 1 || loading ? "#6c757d" : "#495057"
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
                      background: pagination.page === 1 || loading ? "#f8f9fa" : "white",
                      cursor: pagination.page === 1 || loading ? "not-allowed" : "pointer",
                      color: pagination.page === 1 || loading ? "#6c757d" : "#495057"
                    }}
                  >
                    Previous
                  </button>
                  
                  <span style={{ 
                    fontWeight: "600", 
                    padding: "6px 12px",
                    background: "#007bff",
                    color: "white",
                    borderRadius: "4px",
                    minWidth: "40px",
                    textAlign: "center"
                  }}>
                    {pagination.page}
                  </span>
                  
                  <button 
                    disabled={!pagination.has_next || loading} 
                    onClick={() => handlePageChange(pagination.page + 1)}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #dee2e6",
                      borderRadius: "4px",
                      background: !pagination.has_next || loading ? "#f8f9fa" : "white",
                      cursor: !pagination.has_next || loading ? "not-allowed" : "pointer",
                      color: !pagination.has_next || loading ? "#6c757d" : "#495057"
                    }}
                  >
                    Next
                  </button>
                  
                  <select 
                    value={pagination.per_page} 
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    disabled={loading}
                    style={{
                      padding: "6px 8px",
                      border: "1px solid #dee2e6",
                      borderRadius: "4px",
                      background: "white",
                      cursor: loading ? "not-allowed" : "pointer"
                    }}
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                  
                  <span style={{ fontSize: "0.9rem", color: "#6c757d" }}>per page</span>
                </div>
              </div>

              <PatientTable
                patients={patients}
                searchTerm={searchTerm}
                activeFilters={activeFilters}
                onPatientSelect={handlePatientSelect}
                loading={loading}
                pagination={pagination}
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
  return <PatientDetails patientId={patientId} />;
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