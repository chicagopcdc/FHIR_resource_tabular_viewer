// src/PatientDetails.js - Complete Patient Details with Dynamic Resource Loading
import React, { useState, useEffect } from 'react';
import GeneralInformation from './GeneralInformation';
import Measurements from './Measurements';
import Labs from './Labs';
import Notes from './Notes';
import DynamicResourceTab from './DynamicResourceTab';
import AddTabModal from './AddTabModal';
import * as api from './api';
import './PatientDetails.css';
const FilterSidebar = () => null;


const PatientDetails = ({ patientId }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  
  // Patient data state
  const [patientData, setPatientData] = useState(null);
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

  // Dynamic tabs state
  const [dynamicTabs, setDynamicTabs] = useState([]);
  const [showAddTabModal, setShowAddTabModal] = useState(false);
  const [availableResources, setAvailableResources] = useState([]);
  const [allResourceData, setAllResourceData] = useState({});

  // Original data for filtering
  const [originalData, setOriginalData] = useState({
    observations: [],
    diagnosticReports: [],
    documentReferences: [],
    medicalData: {}
  });

  // Filter and sort state
  const [filters, setFilters] = useState({
    dateRange: { start: '', end: '' },
    categories: [],
    status: [],
    types: [],
    searchTerm: ''
  });

  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'asc'
  });

  // Load data on mount
  useEffect(() => {
    if (patientId) {
      loadPatientData();
      loadAvailableResources();
    }
  }, [patientId]);

  // Apply filters when they change
  useEffect(() => {
    applyFiltersAndSorting();
  }, [filters, sortConfig, originalData]);

  const loadPatientData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('Loading patient details for ID:', patientId);
      
      const response = await api.loadPatientDetailed(patientId);
      
      if (!response.success) {
        setError(response.message || 'Patient not found');
        setLoading(false);
        return;
      }

      console.log('Patient data loaded successfully');

      // Transform FHIR patient data for display
      const transformedPatient = transformPatientData(response.patient);

      // Store all data
      setAllResourceData(response);
      
      // Store original data for filtering
      setOriginalData({
        observations: response.observations || [],
        diagnosticReports: response.diagnosticReports || [],
        documentReferences: response.documentReferences || [],
        medicalData: {
          conditions: response.conditions || [],
          encounters: response.encounters || [],
          procedures: response.procedures || [],
          medications: response.medications || [],
          immunizations: response.immunizations || [],
          careTeam: response.careTeam || [],
          allergies: response.allergies || []
        }
      });

      setPatientData(transformedPatient);
      
    } catch (error) {
      console.error('Error loading patient data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const transformPatientData = (fhirPatient) => {
    if (!fhirPatient) return null;
    
    const name = fhirPatient.name?.[0] || {};
    const address = fhirPatient.address?.[0] || {};
    
    return {
      id: fhirPatient.id,
      given_name: name.given?.join(' ') || 'Unknown',
      family_name: name.family || 'Unknown',
      birth_date: fhirPatient.birthDate,
      gender: fhirPatient.gender,
      city: address.city,
      state: address.state,
      postal_code: address.postalCode,
      multipleBirthBoolean: fhirPatient.multipleBirthBoolean,
      combined_record_id: fhirPatient.id
    };
  };

  const loadAvailableResources = async () => {
    try {
      const resourceTypes = await api.listResourceTypes();
      
      const resources = resourceTypes
        .filter(resourceType => 
          // Exclude fixed tabs and Patient itself
          !['Patient', 'Observation', 'DiagnosticReport', 'DocumentReference'].includes(resourceType)
        )
        .map(resourceType => ({
          id: resourceType.toLowerCase(),
          label: resourceType,
          description: getResourceDescription(resourceType),
          icon: getResourceIcon(resourceType.toLowerCase()),
          count: 0
        }));
      
      setAvailableResources(resources);
      console.log('Available dynamic resources loaded:', resources.length);
    } catch (error) {
      console.error('Error loading available resources:', error);
      setAvailableResources([]);
    }
  };

  const getResourceDescription = (resourceType) => {
    const descriptions = {
      'CarePlan': 'Care plans and treatment programs',
      'Condition': 'Medical conditions and diagnoses',
      'Encounter': 'Healthcare visits and interactions',
      'Procedure': 'Medical procedures and interventions',
      'MedicationRequest': 'Medication prescriptions and requests',
      'Immunization': 'Vaccination records',
      'AllergyIntolerance': 'Allergies and intolerances',
      'CareTeam': 'Healthcare team members',
      'Goal': 'Patient goals and targets',
      'ServiceRequest': 'Service and procedure requests',
      'Appointment': 'Scheduled appointments'
    };
    return descriptions[resourceType] || `${resourceType} resources from FHIR server`;
  };

  const getResourceIcon = (resourceType) => {
    const icons = {
      careplan: 'ðŸ“‹',
      condition: 'ðŸ¥',
      encounter: 'ðŸ“…',
      procedure: 'âš•ï¸',
      medicationrequest: 'ðŸ’Š',
      immunization: 'ðŸ’‰',
      allergyintolerance: 'âš ï¸',
      careteam: 'ðŸ‘¥',
      goal: 'ðŸŽ¯',
      servicerequest: 'ðŸ“',
      appointment: 'ðŸ“…'
    };
    return icons[resourceType.toLowerCase()] || 'ðŸ“‹';
  };

  const handleAddTab = async (resourceType) => {
    try {
      setShowAddTabModal(false);
      
      // Check if tab already exists
      if (dynamicTabs.find(tab => tab.resourceType === resourceType)) {
        return; // Silently ignore duplicates
      }

      console.log('Adding dynamic tab for resource type:', resourceType);
      
      // Fetch resource data with appropriate filters
      const params = {
        _count: 100
      };

      // Use different reference parameters based on resource type
      if (['AllergyIntolerance', 'Immunization'].includes(resourceType)) {
        params.patient = `Patient/${patientId}`;
      } else {
        params.subject = `Patient/${patientId}`;
      }

      const response = await api.fetchResources(resourceType, params);

      let resourceData = [];
      if (response.success) {
        resourceData = response.data || [];
      }

      const newTab = {
        id: `${resourceType.toLowerCase()}-${Date.now()}`,
        resourceType: resourceType.toLowerCase(),
        label: resourceType,
        data: resourceData
      };

      setDynamicTabs(prev => [...prev, newTab]);
      setActiveTab(newTab.id);
      
      console.log(`Dynamic tab added: ${newTab.label} (${resourceData.length} items)`);
    } catch (error) {
      console.error('Error adding dynamic tab:', error);
    }
  };

  const handleRemoveTab = (tabId) => {
    setDynamicTabs(prev => prev.filter(tab => tab.id !== tabId));
    
    if (activeTab === tabId) {
      setActiveTab('general');
    }
  };

  const getFilteredAvailableResources = () => {
    const existingResourceTypes = dynamicTabs.map(tab => tab.resourceType);
    return availableResources.filter(resource => 
      !existingResourceTypes.includes(resource.id)
    );
  };

  const getTabCounts = () => {
    const counts = {};
    availableResources.forEach(resource => {
      const dataKey = resource.id;
      const resourceData = allResourceData[dataKey] || [];
      counts[resource.id] = Array.isArray(resourceData) ? resourceData.length : 0;
    });
    return counts;
  };

  const categorizeObservation = (codeDisplay) => {
    if (!codeDisplay) return 'Other';
    
    const lowerCode = codeDisplay.toLowerCase();
    if (lowerCode.includes('body height') || lowerCode.includes('body weight') || 
        lowerCode.includes('body mass') || lowerCode.includes('blood pressure') ||
        lowerCode.includes('heart rate') || lowerCode.includes('respiratory rate') ||
        lowerCode.includes('temperature') || lowerCode.includes('oxygen saturation')) {
      return 'Vital Signs';
    } else if (lowerCode.includes('gad-7') || lowerCode.includes('phq-9') || 
               lowerCode.includes('dast-10') || lowerCode.includes('audit-c') ||
               lowerCode.includes('pain severity') || lowerCode.includes('score')) {
      return 'Survey';
    } else if (lowerCode.includes('tobacco smoking') || lowerCode.includes('smoking status')) {
      return 'Social History';
    } else if (lowerCode.includes('leukocytes') || lowerCode.includes('erythrocytes') ||
               lowerCode.includes('hemoglobin') || lowerCode.includes('hematocrit') ||
               lowerCode.includes('platelets') || lowerCode.includes('glucose') ||
               lowerCode.includes('cholesterol') || lowerCode.includes('creatinine')) {
      return 'Lab Results';
    } else {
      return 'Physical Exam';
    }
  };

  const applyFiltersAndSorting = () => {
    if (!originalData.observations.length) return;

    let filteredObservations = [...originalData.observations];
    let filteredDiagnosticReports = [...originalData.diagnosticReports];
    let filteredDocumentReferences = [...originalData.documentReferences];
    let filteredMedicalData = { ...originalData.medicalData };

    // Apply date filter
    if (filters.dateRange.start || filters.dateRange.end) {
      const startDate = filters.dateRange.start ? new Date(filters.dateRange.start) : new Date('1900-01-01');
      const endDate = filters.dateRange.end ? new Date(filters.dateRange.end) : new Date('2100-12-31');

      filteredObservations = filteredObservations.filter(item => {
        const itemDate = new Date(item.effectiveDateTime || item.effective_date);
        return itemDate >= startDate && itemDate <= endDate;
      });

      filteredDiagnosticReports = filteredDiagnosticReports.filter(item => {
        const itemDate = new Date(item.effectiveDateTime || item.issued);
        return itemDate >= startDate && itemDate <= endDate;
      });
    }

    // Apply category filter
    if (filters.categories.length > 0) {
      filteredObservations = filteredObservations.filter(item => {
        const category = categorizeObservation(item.code?.text || item.code_display);
        return filters.categories.includes(category);
      });
    }

    // Apply status filter
    if (filters.status.length > 0) {
      filteredObservations = filteredObservations.filter(item => 
        filters.status.includes(item.status)
      );

      filteredDiagnosticReports = filteredDiagnosticReports.filter(item => 
        filters.status.includes(item.status)
      );
    }

    // Apply search term filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      
      filteredObservations = filteredObservations.filter(item => 
        (item.code?.text || item.code_display || '').toLowerCase().includes(searchLower) ||
        (item.valueQuantity?.value || item.value_quantity || '').toString().toLowerCase().includes(searchLower)
      );

      filteredDiagnosticReports = filteredDiagnosticReports.filter(item => 
        (item.code?.text || item.code_display || '').toLowerCase().includes(searchLower)
      );
    }

    // Apply sorting
    if (sortConfig.key) {
      const sortData = (data) => {
        return [...data].sort((a, b) => {
          let aVal = a[sortConfig.key];
          let bVal = b[sortConfig.key];

          // Handle date sorting
          if (sortConfig.key.includes('date') || sortConfig.key.includes('Date')) {
            aVal = new Date(aVal || '1900-01-01');
            bVal = new Date(bVal || '1900-01-01');
          }

          // Handle numeric sorting
          if (typeof aVal === 'string' && !isNaN(Number(aVal))) {
            aVal = Number(aVal);
            bVal = Number(bVal);
          }

          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      };

      filteredObservations = sortData(filteredObservations);
      filteredDiagnosticReports = sortData(filteredDiagnosticReports);
    }

    // Set filtered data
    setObservations(filteredObservations);
    setDiagnosticReports(filteredDiagnosticReports);
    setDocumentReferences(filteredDocumentReferences);
    setMedicalData(filteredMedicalData);
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleFilterChange = (newFilters) => {
    setFilters(newFilters);
  };

  const clearFilters = () => {
    setFilters({
      dateRange: { start: '', end: '' },
      categories: [],
      status: [],
      types: [],
      searchTerm: ''
    });
    setSortConfig({ key: null, direction: 'asc' });
  };

  const toggleFilters = () => {
    setShowFilters(!showFilters);
  };

  const handleBackClick = () => {
    window.history.back();
  };

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="patient-details-loading">
          <h2>Loading patient data from FHIR server...</h2>
        </div>
      );
    }

    if (error) {
      return (
        <div className="patient-details-error">
          <h2>Unable to Load Patient Data</h2>
          <p>Error: {error}</p>
          <button onClick={() => loadPatientData()}>Try Again</button>
        </div>
      );
    }

    if (!patientData) {
      return <div className="empty-state">Patient data not found</div>;
    }

    const commonProps = {
      onSort: handleSort,
      sortConfig: sortConfig,
      filters: filters,
      onFilterChange: handleFilterChange
    };

    // Check if it's a dynamic tab
    const dynamicTab = dynamicTabs.find(tab => tab.id === activeTab);
    if (dynamicTab) {
      return (
        <DynamicResourceTab
          resourceType={dynamicTab.resourceType}
          resourceLabel={dynamicTab.label}
          resourceData={dynamicTab.data}
          patientId={patientId}
          onRemoveTab={() => handleRemoveTab(dynamicTab.id)}
          onSort={handleSort}
          sortConfig={sortConfig}
          filters={filters}
        />
      );
    }

    // Fixed tabs
    switch (activeTab) {
      case 'measurements':
        return <Measurements observations={observations} {...commonProps} />;
      case 'labs':
        return <Labs observations={observations} diagnosticReports={diagnosticReports} {...commonProps} />;
      case 'notes':
        return <Notes documentReferences={documentReferences} diagnosticReports={diagnosticReports} {...commonProps} />;
      default:
        return <GeneralInformation patientData={patientData} medicalData={medicalData} {...commonProps} />;
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px' }}>â³</div>
          <h2 style={{ color: '#333', marginBottom: '10px' }}>Loading Patient Details</h2>
          <p style={{ color: '#666' }}>Fetching data from FHIR server...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f5f5f5' }}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div style={{ fontSize: '48px', marginBottom: '20px', color: '#dc3545' }}>âš ï¸</div>
          <h2 style={{ color: '#dc3545', marginBottom: '10px' }}>Patient Not Found</h2>
          <p style={{ color: '#666', marginBottom: '20px' }}>Error: {error}</p>
          <button onClick={handleBackClick} style={{ 
            padding: '12px 24px', 
            background: '#6c757d', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer', 
            fontSize: '1rem', 
            fontWeight: '500',
            marginRight: '10px'
          }}>
            Back to Patient List
          </button>
          <button onClick={() => loadPatientData()} style={{ 
            padding: '12px 24px', 
            background: '#007bff', 
            color: 'white', 
            border: 'none', 
            borderRadius: '6px', 
            cursor: 'pointer', 
            fontSize: '1rem', 
            fontWeight: '500'
          }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="patient-details-container">
      {/* Filter Sidebar */}
      <FilterSidebar 
        isOpen={showFilters}
        onToggle={toggleFilters}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={clearFilters}
        observations={originalData.observations}
        diagnosticReports={originalData.diagnosticReports}
      />

      {/* Main Content */}
      <div className={showFilters ? 'main-content sidebar-open' : 'main-content'}>
        {/* Header */}
        <div className="header">
          <div className="header-left">
            <button className="back-button" onClick={handleBackClick}>
              <span>â†</span> Back to Patient List
            </button>
            <button className="sidebar-toggle-btn" onClick={toggleFilters}>
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
          {patientData && (
            <div className="patient-header-info">
              <h1>{patientData.given_name} {patientData.family_name}</h1>
              <span className="patient-id">ID: {patientData.id}</span>
              <span style={{
                background: '#28a745',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: '500',
                marginLeft: '12px'
              }}>FHIR</span>
            </div>
          )}
        </div>

        {/* Enhanced Tabs with Dynamic Tabs */}
        <div className="tabs-container">
          <div className="tabs">
            {/* Fixed Tabs */}
            <button 
              className={`tab ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              General Information
            </button>
            <button 
              className={`tab ${activeTab === 'measurements' ? 'active' : ''}`}
              onClick={() => setActiveTab('measurements')}
            >
              Measurements ({observations.filter(obs => {
                const category = categorizeObservation(obs.code?.text || obs.code_display);
                return ['Vital Signs', 'Survey', 'Social History'].includes(category);
              }).length})
            </button>
            <button 
              className={`tab ${activeTab === 'labs' ? 'active' : ''}`}
              onClick={() => setActiveTab('labs')}
            >
              Labs ({observations.filter(obs => {
                const category = categorizeObservation(obs.code?.text || obs.code_display);
                return category === 'Lab Results';
              }).length + diagnosticReports.length})
            </button>
            <button 
              className={`tab ${activeTab === 'notes' ? 'active' : ''}`}
              onClick={() => setActiveTab('notes')}
            >
              Notes ({documentReferences.length})
            </button>

            {/* Dynamic Tabs */}
            {dynamicTabs.map(tab => (
              <button
                key={tab.id}
                className={`tab dynamic-tab ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span>{tab.label} ({tab.data?.length || 0})</span>
                <span 
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTab(tab.id);
                  }}
                  title="Remove tab"
                  style={{
                    marginLeft: '8px',
                    padding: '2px 6px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.2)',
                    fontSize: '0.8rem'
                  }}
                >
                  Ã—
                </span>
              </button>
            ))}

            {/* Add Tab Button */}
            <button 
              className="tab add-tab-btn"
              onClick={() => setShowAddTabModal(true)}
              title="Add resource tab"
              style={{
                background: '#28a745',
                color: 'white',
                border: 'none',
                padding: '0.75rem 1rem',
                cursor: 'pointer',
                fontSize: '1.2rem',
                fontWeight: '600',
                transition: 'all 0.2s ease'
              }}
            >
              +
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="content">
          {renderTabContent()}
        </div>
      </div>

      {/* Add Tab Modal */}
      {showAddTabModal && (
        <AddTabModal
          availableResources={getFilteredAvailableResources()}
          tabCounts={getTabCounts()}
          onAddTab={handleAddTab}
          onClose={() => setShowAddTabModal(false)}
        />
      )}

      {/* Overlay for mobile */}
      {showFilters && <div className="sidebar-overlay" onClick={toggleFilters}></div>}
    </div>
  );
};

export default PatientDetails;