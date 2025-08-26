import React, { useState } from 'react';
import './PatientDetails.css';

const GeneralInformation = ({ patientData, medicalData }) => {
  const [activeGeneralTab, setActiveGeneralTab] = useState('overview');
  const [activeMedicalTab, setActiveMedicalTab] = useState('conditions');

  if (!patientData) {
    return <div className="patient-details-loading">Loading patient data...</div>;
  }

  const renderDataTable = (title, data, columns) => (
    <div className="data-table">
      <h3>{title} ({data?.length || 0})</h3>
      <table>
        <thead>
          <tr>
            {columns.map(col => <th key={col.key}>{col.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {data && data.length > 0 ? (
            data.map(item => (
              <tr key={item.id}>
                {columns.map(col => (
                  <td key={col.key}>
                    {col.render ? col.render(item[col.key], item) : (item[col.key] || 'N/A')}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '2rem', color: '#6c757d' }}>
                No {title.toLowerCase()} found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  const renderPersonalInformationTable = () => {
    const personalData = [
      {
        id: 'given_name',
        field: 'Given Name',
        value: patientData.given_name || 'Unknown'
      },
      {
        id: 'family_name',
        field: 'Family Name',
        value: patientData.family_name || 'Unknown'
      },
      {
        id: 'birth_date',
        field: 'Birth Date',
        value: patientData.birth_date || 'Unknown'
      },
      {
        id: 'age',
        field: 'Age',
        value: calculateAge(patientData.birth_date)
      },
      {
        id: 'gender',
        field: 'Gender',
        value: patientData.gender || 'Unknown'
      },
      {
        id: 'city',
        field: 'City',
        value: patientData.city || 'Unknown'
      },
      {
        id: 'state',
        field: 'State',
        value: patientData.state || 'Unknown'
      },
      {
        id: 'postal_code',
        field: 'Postal Code',
        value: patientData.postal_code || 'Unknown'
      },
      {
        id: 'multiple_birth',
        field: 'Multiple Birth',
        value: patientData.multipleBirthBoolean ? 'Yes' : 'No'
      },
      {
        id: 'patient_id',
        field: 'Patient ID',
        value: patientData.combined_record_id || patientData.id || 'Unknown'
      }
    ];

    return renderDataTable('Personal Information', personalData, [
      { key: 'field', label: 'Field' },
      { key: 'value', label: 'Value' }
    ]);
  };

  const renderOverview = () => (
    <div className="patient-details-grid">
      <div className="detail-section" style={{ borderLeft: '4px solid white' }}>
        <h3>Active Conditions</h3>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#000', textAlign: 'center' }}>
          {medicalData?.conditions?.length || 0}
        </div>
        <div style={{ textAlign: 'center', color: '#6c757d' }}>Medical conditions</div>
      </div>
      
      <div className="detail-section" style={{ borderLeft: '4px solid white' }}>
        <h3>Total Encounters</h3>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#000', textAlign: 'center' }}>
          {medicalData?.encounters?.length || 0}
        </div>
        <div style={{ textAlign: 'center', color: '#6c757d' }}>Patient visits</div>
      </div>
      
      <div className="detail-section" style={{ borderLeft: '4px solid white' }}>
        <h3>Procedures</h3>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#000', textAlign: 'center' }}>
          {medicalData?.procedures?.length || 0}
        </div>
        <div style={{ textAlign: 'center', color: '#6c757d' }}>Medical procedures</div>
      </div>
      
      <div className="detail-section" style={{ borderLeft: '4px solid white' }}>
        <h3>Medications</h3>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#000', textAlign: 'center' }}>
          {medicalData?.medications?.length || 0}
        </div>
        <div style={{ textAlign: 'center', color: '#6c757d' }}>Medication requests</div>
      </div>
      
      <div className="detail-section" style={{ borderLeft: '4px solid white' }}>
        <h3>Immunizations</h3>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#000', textAlign: 'center' }}>
          {medicalData?.immunizations?.length || 0}
        </div>
        <div style={{ textAlign: 'center', color: '#6c757d' }}>Vaccinations</div>
      </div>
      
      <div className="detail-section" style={{ borderLeft: '4px solid white' }}>
        <h3>Care Team</h3>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#000', textAlign: 'center' }}>
          {medicalData?.careTeam?.length || 0}
        </div>
        <div style={{ textAlign: 'center', color: '#6c757d' }}>Care team members</div>
      </div>
      
      <div className="detail-section" style={{ borderLeft: '4px solid white' }}>
        <h3>Allergies</h3>
        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#000', textAlign: 'center' }}>
          {medicalData?.allergies?.length || 0}
        </div>
        <div style={{ textAlign: 'center', color: '#6c757d' }}>Known allergies</div>
      </div>
    </div>
  );

  const renderMedicalSummaryTable = () => {
    const summaryData = [
      {
        id: 'conditions',
        category: 'Active Conditions',
        count: medicalData?.conditions?.length || 0,
        description: 'Medical conditions'
      },
      {
        id: 'encounters',
        category: 'Total Encounters',
        count: medicalData?.encounters?.length || 0,
        description: 'Patient visits'
      },
      {
        id: 'procedures',
        category: 'Procedures',
        count: medicalData?.procedures?.length || 0,
        description: 'Medical procedures'
      },
      {
        id: 'medications',
        category: 'Medications',
        count: medicalData?.medications?.length || 0,
        description: 'Medication requests'
      },
      {
        id: 'immunizations',
        category: 'Immunizations',
        count: medicalData?.immunizations?.length || 0,
        description: 'Vaccinations'
      },
      {
        id: 'careTeam',
        category: 'Care Team',
        count: medicalData?.careTeam?.length || 0,
        description: 'Care team members'
      },
      {
        id: 'allergies',
        category: 'Allergies',
        count: medicalData?.allergies?.length || 0,
        description: 'Known allergies'
      }
    ];

    return renderDataTable('Medical Summary', summaryData, [
      { key: 'category', label: 'Category' },
      { key: 'count', label: 'Count' },
      { key: 'description', label: 'Description' }
    ]);
  };

  const renderConditions = () => {
    const statusRender = (value) => <span className={`status ${value || 'unknown'}`}>{value || 'Unknown'}</span>;
    const dateRender = (value) => value ? new Date(value).toLocaleDateString() : 'Unknown';

    return renderDataTable('Active Conditions', medicalData?.conditions, [
      { key: 'id', label: 'ID' },
      { key: 'resourceType', label: 'Type' },
      { key: 'status', label: 'Status', render: statusRender },
      { key: 'onsetDateTime', label: 'Onset Date', render: dateRender },
      { key: 'recordedDate', label: 'Recorded Date', render: dateRender },
      { key: 'abatementDateTime', label: 'Resolved Date', render: dateRender }
    ]);
  };

  const renderEncounters = () => {
    const statusRender = (value) => <span className={`status ${value || 'unknown'}`}>{value || 'Unknown'}</span>;

    return renderDataTable('Total Encounters', medicalData?.encounters, [
      { key: 'id', label: 'ID' },
      { key: 'resourceType', label: 'Type' },
      { key: 'status', label: 'Status', render: statusRender }
    ]);
  };

  const renderProcedures = () => {
    const statusRender = (value) => <span className={`status ${value || 'unknown'}`}>{value || 'Unknown'}</span>;

    return renderDataTable('Procedures', medicalData?.procedures, [
      { key: 'id', label: 'ID' },
      { key: 'resourceType', label: 'Type' },
      { key: 'status', label: 'Status', render: statusRender }
    ]);
  };

  const renderMedications = () => {
    const statusRender = (value) => <span className={`status ${value || 'unknown'}`}>{value || 'Unknown'}</span>;
    const dateRender = (value) => value ? new Date(value).toLocaleDateString() : 'Unknown';

    return renderDataTable('Medication Requests', medicalData?.medications, [
      { key: 'id', label: 'ID' },
      { key: 'resourceType', label: 'Type' },
      { key: 'status', label: 'Status', render: statusRender },
      { key: 'intent', label: 'Intent' },
      { key: 'authoredOn', label: 'Authored On', render: dateRender }
    ]);
  };

  const renderImmunizations = () => {
    const statusRender = (value) => <span className={`status ${value || 'unknown'}`}>{value || 'Unknown'}</span>;
    const dateRender = (value) => value ? new Date(value).toLocaleDateString() : 'Unknown';

    return renderDataTable('Immunizations', medicalData?.immunizations, [
      { key: 'id', label: 'ID' },
      { key: 'resourceType', label: 'Type' },
      { key: 'status', label: 'Status', render: statusRender },
      { key: 'occurrenceDateTime', label: 'Date', render: dateRender },
      { key: 'primarySource', label: 'Primary Source', render: (value) => value ? 'Yes' : 'No' }
    ]);
  };

  const renderCareTeam = () => {
    const statusRender = (value) => <span className={`status ${value || 'unknown'}`}>{value || 'Unknown'}</span>;

    return renderDataTable('Care Team', medicalData?.careTeam, [
      { key: 'id', label: 'ID' },
      { key: 'resourceType', label: 'Type' },
      { key: 'status', label: 'Status', render: statusRender }
    ]);
  };

  const renderAllergies = () => {
    const dateRender = (value) => value ? new Date(value).toLocaleDateString() : 'Unknown';

    return renderDataTable('Allergies', medicalData?.allergies, [
      { key: 'id', label: 'ID' },
      { key: 'resourceType', label: 'Type' },
      { key: 'type', label: 'Allergy Type' },
      { key: 'criticality', label: 'Criticality' },
      { key: 'recordedDate', label: 'Recorded Date', render: dateRender }
    ]);
  };

  const calculateAge = (birthDate) => {
    if (!birthDate) return 'Unknown';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return `${age} years`;
  };

  const renderMedicalSummaryContent = () => {
    switch (activeMedicalTab) {
      case 'conditions':
        return renderConditions();
      case 'encounters':
        return renderEncounters();
      case 'procedures':
        return renderProcedures();
      case 'medications':
        return renderMedications();
      case 'immunizations':
        return renderImmunizations();
      case 'careTeam':
        return renderCareTeam();
      case 'allergies':
        return renderAllergies();
      default:
        return renderMedicalSummaryTable();
    }
  };

  const renderGeneralContent = () => {
    switch (activeGeneralTab) {
      case 'personal':
        return renderPersonalInformationTable();
      case 'medical':
        return (
          <div>
            <div className="labs-tabs">
              <button 
                className={`lab-tab ${activeMedicalTab === 'conditions' ? 'active' : ''}`}
                onClick={() => setActiveMedicalTab('conditions')}
              >
                Conditions
              </button>
              <button 
                className={`lab-tab ${activeMedicalTab === 'encounters' ? 'active' : ''}`}
                onClick={() => setActiveMedicalTab('encounters')}
              >
                Encounters
              </button>
              <button 
                className={`lab-tab ${activeMedicalTab === 'procedures' ? 'active' : ''}`}
                onClick={() => setActiveMedicalTab('procedures')}
              >
                Procedures
              </button>
              <button 
                className={`lab-tab ${activeMedicalTab === 'medications' ? 'active' : ''}`}
                onClick={() => setActiveMedicalTab('medications')}
              >
                Medications
              </button>
              <button 
                className={`lab-tab ${activeMedicalTab === 'immunizations' ? 'active' : ''}`}
                onClick={() => setActiveMedicalTab('immunizations')}
              >
                Immunizations
              </button>
              <button 
                className={`lab-tab ${activeMedicalTab === 'careTeam' ? 'active' : ''}`}
                onClick={() => setActiveMedicalTab('careTeam')}
              >
                Care Team
              </button>
              <button 
                className={`lab-tab ${activeMedicalTab === 'allergies' ? 'active' : ''}`}
                onClick={() => setActiveMedicalTab('allergies')}
              >
                Allergies
              </button>
            </div>
            
            <div style={{ marginTop: '2rem' }}>
              {renderMedicalSummaryContent()}
            </div>
          </div>
        );
      default:
        return renderOverview();
    }
  };

  return (
    <div className="labs-container">
      <div className="labs-tabs">
        <button 
          className={`lab-tab ${activeGeneralTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveGeneralTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`lab-tab ${activeGeneralTab === 'personal' ? 'active' : ''}`}
          onClick={() => setActiveGeneralTab('personal')}
        >
          Personal Information
        </button>
        <button 
          className={`lab-tab ${activeGeneralTab === 'medical' ? 'active' : ''}`}
          onClick={() => setActiveGeneralTab('medical')}
        >
          Medical Summary
        </button>
      </div>
      
      <div className="labs-content">
        {renderGeneralContent()}
      </div>
    </div>
  );
};

export default GeneralInformation;