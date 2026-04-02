// LazyPatientDetails.js - Patient details with on-demand tab fetching (no background prefetch)
import React, { useState, useEffect, useRef } from 'react';
import GeneralInformation from './GeneralInformation';
import Measurements from './Measurements';
import Labs from './Labs';
import Notes from './Notes';
import DynamicResourceTab from './DynamicResourceTab';
import AddTabModal from './AddTabModal';
import * as api from './api';
import './PatientDetails.css';

// Tab cache with TTL
class TabCache {
  constructor(ttlMs = 10 * 60 * 1000) { // 10 minute TTL
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }
  _generateKey(patientId, tabName) {
    return `${patientId}|${tabName}`;
  }
  get(patientId, tabName) {
    const key = this._generateKey(patientId, tabName);
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      return cached.data;
    }
    if (cached) this.cache.delete(key);
    return null;
  }
  set(patientId, tabName, data) {
    const key = this._generateKey(patientId, tabName);
    this.cache.set(key, { data, timestamp: Date.now() });
  }
  clear(patientId) {
    const prefix = `${patientId}|`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }
}

// Global tab cache instance
const tabCache = new TabCache();

const LazyPatientDetails = ({ patientId, onBackToList }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Patient basic data (loaded immediately)
  const [patientData, setPatientData] = useState(null);

  // Tab-specific loading/error states
  const [tabLoading, setTabLoading] = useState({});
  const [tabErrors, setTabErrors] = useState({});

  // Cached tab data
  const [tabData, setTabData] = useState({
    general: null,
    measurements: null,
    labs: null,
    notes: null,
    conditions: null,
    encounters: null,
    procedures: null,
    medications: null,
    immunizations: null,
    allergies: null
  });

  // Dynamic tabs state
  const [dynamicTabs, setDynamicTabs] = useState([]);
  const [showAddTabModal, setShowAddTabModal] = useState(false);
  const [availableResources, setAvailableResources] = useState([]);

  // Abort controllers per-tab to cancel in-flight requests when switching tabs
  const controllersRef = useRef({});

  // Load basic patient data + available resources on mount / patientId change
  useEffect(() => {
    if (patientId) {
      loadPatientBasicData();
      loadAvailableResources();
      // Clear per-tab controllers on patient switch
      controllersRef.current = {};
      // Reset tab state on patient switch
      setActiveTab('general');
      setTabData({
        general: null,
        measurements: null,
        labs: null,
        notes: null,
        conditions: null,
        encounters: null,
        procedures: null,
        medications: null,
        immunizations: null,
        allergies: null
      });
      setTabLoading({});
      setTabErrors({});
    }
    // eslint-disable-next-line
  }, [patientId]);

  // Load current tab on activeTab change (ONLY this tab, nothing else)
  useEffect(() => {
    if (!patientId) return;
    loadTabData(activeTab);
    // eslint-disable-next-line
  }, [activeTab, patientId]);

  const getControllerForTab = (tabName) => {
    // Abort previous in-flight request for this tab, if any
    const prev = controllersRef.current[tabName];
    if (prev) prev.abort();
    const ctrl = new AbortController();
    controllersRef.current[tabName] = ctrl;
    return ctrl;
  };

  const loadPatientBasicData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try cache first
      const cachedPatient = tabCache.get(patientId, 'patient_basic');
      if (cachedPatient) {
        setPatientData(cachedPatient);
        setLoading(false);
        // Prime general tab data from cached patient
        setTabData(prev => ({ ...prev, general: cachedPatient }));
        return;
      }

      // Fetch only the patient detail
      const response = await api.getByIdDetailed('Patient', patientId);
      if (!response.success) {
        setError(response.message || 'Patient not found');
        setLoading(false);
        return;
      }

      const transformedPatient = transformPatientData(response.all);

      // Cache and set
      tabCache.set(patientId, 'patient_basic', transformedPatient);
      setPatientData(transformedPatient);
      setTabData(prev => ({ ...prev, general: transformedPatient }));
    } catch (err) {
      console.error('Error loading patient data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTabData = async (tabName) => {
    if (!patientId) return;
    if (tabLoading[tabName]) return;

    // If we already have cached in-memory data, use it
    const cachedData = tabCache.get(patientId, tabName);
    if (cachedData) {
      setTabData(prev => ({ ...prev, [tabName]: cachedData }));
      return;
    }

    // If we already fetched once this session
    if (tabData[tabName]) return;

    // Prepare loading & clear previous error for this tab
    setTabLoading(prev => ({ ...prev, [tabName]: true }));
    setTabErrors(prev => ({ ...prev, [tabName]: null }));

    const ctrl = getControllerForTab(tabName);

    try {
      let data = null;

      switch (tabName) {
        case 'general':
          data = loadGeneralTabData(); // local data only
          break;
        case 'measurements':
          data = await loadMeasurementsTabData(ctrl.signal);
          break;
        case 'labs':
          data = await loadLabsTabData(ctrl.signal);
          break;
        case 'notes':
          data = await loadNotesTabData(ctrl.signal);
          break;
        case 'conditions':
          data = await loadResourceTabData('Condition', ctrl.signal);
          break;
        case 'encounters':
          data = await loadResourceTabData('Encounter', ctrl.signal);
          break;
        case 'procedures':
          data = await loadResourceTabData('Procedure', ctrl.signal);
          break;
        case 'medications':
          data = await loadResourceTabData('MedicationRequest', ctrl.signal);
          break;
        case 'immunizations':
          data = await loadResourceTabData('Immunization', ctrl.signal);
          break;
        case 'allergies':
          data = await loadResourceTabData('AllergyIntolerance', ctrl.signal);
          break;
        default: {
          const dynamicTab = dynamicTabs.find(tab => tab.id === tabName);
          if (dynamicTab) {
            data = await loadResourceTabData(dynamicTab.label, ctrl.signal);
          }
        }
      }

      if (data) {
        tabCache.set(patientId, tabName, data);
        setTabData(prev => ({ ...prev, [tabName]: data }));
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        // Swallow aborts (tab switched)
        return;
      }
      console.error(`Error loading ${tabName} tab:`, err);
      setTabErrors(prev => ({ ...prev, [tabName]: err.message || 'Failed to load' }));
    } finally {
      setTabLoading(prev => ({ ...prev, [tabName]: false }));
    }
  };

  const loadGeneralTabData = () => {
    // General tab uses already-fetched patientData only
    return patientData;
  };

  const loadMeasurementsTabData = async (signal) => {
    const response = await api.getPatientResources(patientId, 'Observation', 200, { signal });
    if (response.success) {
      const measurements = response.data.filter(obs => {
        const category = obs.category?.[0]?.coding?.[0]?.code;
        return category === 'vital-signs' || category === 'body-measure';
      });
      return measurements;
    }
    throw new Error(response.message || 'Failed to load measurements');
  };

  const loadLabsTabData = async (signal) => {
    const response = await api.getPatientResources(patientId, 'Observation', 200, { signal });
    if (response.success) {
      const labs = response.data.filter(obs => {
        const category = obs.category?.[0]?.coding?.[0]?.code;
        return category === 'laboratory';
      });
      return labs;
    }
    throw new Error(response.message || 'Failed to load lab results');
  };

  const loadNotesTabData = async (signal) => {
    // Load both DocumentReference and DiagnosticReport resources for the Notes component
    const [docRefResponse, diagReportResponse] = await Promise.all([
      api.getPatientResources(patientId, 'DocumentReference', 100, { signal }),
      api.getPatientResources(patientId, 'DiagnosticReport', 100, { signal })
    ]);
    
    const result = {
      documentReferences: docRefResponse.success ? docRefResponse.data : [],
      diagnosticReports: diagReportResponse.success ? diagReportResponse.data : []
    };
    
    return result;
  };

  const loadResourceTabData = async (resourceType, signal) => {
    const response = await api.getPatientResources(patientId, resourceType, 100, { signal });
    if (response.success) return response.data;
    throw new Error(response.message || `Failed to load ${resourceType}`);
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
        .filter(rt => !['Patient', 'Observation', 'DiagnosticReport', 'DocumentReference'].includes(rt))
        .map(rt => ({
          id: rt.toLowerCase(),
          label: rt,
          description: getResourceDescription(rt),
          icon: getResourceIcon(rt.toLowerCase()),
          count: 0
        }));
      setAvailableResources(resources);
    } catch (err) {
      console.error('Error loading available resources:', err);
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
      'ServiceRequest': 'Service and procedure requests'
    };
    return descriptions[resourceType] || `${resourceType} resources from FHIR server`;
  };

  const getResourceIcon = (resourceType) => {
    const icons = {
      careplan: '📋',
      condition: '🏥',
      encounter: '📅',
      procedure: '⚕️',
      medicationrequest: '💊',
      immunization: '💉',
      allergyintolerance: '⚠️',
      careteam: '👥',
      goal: '🎯',
      servicerequest: '📝'
    };
    return icons[resourceType] || '📄';
  };

  const handleTabClick = (tabName) => {
    setActiveTab(tabName);
  };

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading patient information...</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="error-state">
          <p>Error: {error}</p>
          <button onClick={() => loadPatientBasicData()}>Retry</button>
        </div>
      );
    }
    if (tabLoading[activeTab]) {
      return (
        <div className="tab-loading-state">
          <div className="spinner"></div>
          <p>Loading {activeTab} data...</p>
        </div>
      );
    }
    if (tabErrors[activeTab]) {
      return (
        <div className="tab-error-state">
          <p>Error loading {activeTab}: {tabErrors[activeTab]}</p>
          <button onClick={() => loadTabData(activeTab)}>Retry</button>
        </div>
      );
    }

    const currentTabData = tabData[activeTab];

    switch (activeTab) {
      case 'general':
        return <GeneralInformation patient={patientData} />;
      case 'measurements':
        return <Measurements observations={currentTabData || []} />;
      case 'labs':
        return <Labs observations={currentTabData || []} />;
      case 'notes':
        return (
          <Notes 
            documentReferences={currentTabData?.documentReferences || []} 
            diagnosticReports={currentTabData?.diagnosticReports || []}
          />
        );
      case 'conditions':
      case 'encounters':
      case 'procedures':
      case 'medications':
      case 'immunizations':
      case 'allergies':
        return (
          <DynamicResourceTab
            resourceType={activeTab}
            resources={currentTabData || []}
            patientId={patientId}
          />
        );
      default: {
        const dynamicTab = dynamicTabs.find(tab => tab.id === activeTab);
        if (dynamicTab) {
          return (
            <DynamicResourceTab
              resourceType={dynamicTab.label}
              resources={currentTabData || []}
              patientId={patientId}
            />
          );
        }
        return <div>Tab not found</div>;
      }
    }
  };

  const staticTabs = [
    { id: 'general', label: 'Overview', icon: '📋' },
    { id: 'measurements', label: 'Measurements', icon: '📏' },
    { id: 'labs', label: 'Labs', icon: '🧪' },
    { id: 'notes', label: 'Notes', icon: '📝' },
    { id: 'conditions', label: 'Conditions', icon: '🏥' },
    { id: 'encounters', label: 'Encounters', icon: '📅' },
    { id: 'procedures', label: 'Procedures', icon: '⚕️' },
    { id: 'medications', label: 'Medications', icon: '💊' },
    { id: 'immunizations', label: 'Immunizations', icon: '💉' },
    { id: 'allergies', label: 'Allergies', icon: '⚠️' }
  ];

  const allTabs = [...staticTabs, ...dynamicTabs];

  return (
    <div className="patient-details">
      <div className="patient-header">
        <button className="back-button" onClick={onBackToList}>
          ← Back to Patient List
        </button>

        {patientData && (
          <div className="patient-title">
            <h1>{patientData.given_name} {patientData.family_name}</h1>
            <div className="patient-subtitle">
              ID: {patientData.id} |
              {patientData.birth_date && ` Born: ${patientData.birth_date}`} |
              {patientData.gender && ` Gender: ${patientData.gender}`}
            </div>
          </div>
        )}

        <div className="header-controls">
          {/* Background prefetch removed by request */}
          <button
            className="add-tab-button"
            onClick={() => setShowAddTabModal(true)}
          >
            + Add Tab
          </button>
        </div>
      </div>

      <div className="tab-navigation">
        {allTabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''} ${tabLoading[tab.id] ? 'loading' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            disabled={tabLoading[tab.id]}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-label">{tab.label}</span>
            {tabLoading[tab.id] && <span className="tab-spinner">⟳</span>}
            {tabErrors[tab.id] && <span className="tab-error">⚠️</span>}
          </button>
        ))}
      </div>

      <div className="tab-content">
        {renderTabContent()}
      </div>

      {showAddTabModal && (
        <AddTabModal
          availableResources={availableResources}
          onAddTab={(resource) => {
            setDynamicTabs(prev => [...prev, resource]);
            setShowAddTabModal(false);
          }}
          onClose={() => setShowAddTabModal(false)}
        />
      )}
    </div>
  );
};

export default LazyPatientDetails;
