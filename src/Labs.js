// src/components/Labs.js
import React, { useState } from 'react';

const Labs = ({ observations, diagnosticReports }) => {
  const [activeLabTab, setActiveLabTab] = useState('observation');

  if (!observations && !diagnosticReports) {
    return <div className="loading">Loading lab data...</div>;
  }

  // Filter observations for lab tests (laboratory category)
  const labObservations = (observations || []).filter(obs => {
    const codeDisplay = obs.code_display?.toLowerCase() || '';
    return (
      codeDisplay.includes('leukocytes') ||
      codeDisplay.includes('erythrocytes') ||
      codeDisplay.includes('hemoglobin') ||
      codeDisplay.includes('hematocrit') ||
      codeDisplay.includes('mcv') ||
      codeDisplay.includes('mch') ||
      codeDisplay.includes('mchc') ||
      codeDisplay.includes('platelets') ||
      codeDisplay.includes('glucose') ||
      codeDisplay.includes('urea nitrogen') ||
      codeDisplay.includes('creatinine') ||
      codeDisplay.includes('sodium') ||
      codeDisplay.includes('potassium') ||
      codeDisplay.includes('chloride') ||
      codeDisplay.includes('carbon dioxide') ||
      codeDisplay.includes('calcium') ||
      codeDisplay.includes('protein') ||
      codeDisplay.includes('albumin') ||
      codeDisplay.includes('globulin') ||
      codeDisplay.includes('bilirubin') ||
      codeDisplay.includes('alkaline phosphatase') ||
      codeDisplay.includes('alanine aminotransferase') ||
      codeDisplay.includes('aspartate aminotransferase') ||
      codeDisplay.includes('cholesterol') ||
      codeDisplay.includes('triglycerides') ||
      codeDisplay.includes('hdl') ||
      codeDisplay.includes('ldl')
    );
  });

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const getReference = (testName) => {
    const referenceRanges = {
      'Hemoglobin [Mass/volume] in Blood': '12.0-16.0 g/dL',
      'Leukocytes [#/volume] in Blood by Automated count': '4,500-11,000 /μL',
      'Platelets [#/volume] in Blood by Automated count': '150,000-450,000 /μL',
      'Hematocrit [Volume Fraction] of Blood by Automated count': '37-47 %',
      'Erythrocytes [#/volume] in Blood by Automated count': '4.2-5.9 million/μL',
      'MCV [Entitic volume] by Automated count': '80-100 fL',
      'MCH [Entitic mass] by Automated count': '27-33 pg',
      'MCHC [Mass/volume] by Automated count': '32-36 g/dL',
      'Glucose [Mass/volume] in Serum or Plasma': '70-100 mg/dL',
      'Urea nitrogen [Mass/volume] in Serum or Plasma': '7-20 mg/dL',
      'Creatinine [Mass/volume] in Serum or Plasma': '0.6-1.2 mg/dL',
      'Sodium [Moles/volume] in Serum or Plasma': '136-145 mEq/L',
      'Potassium [Moles/volume] in Serum or Plasma': '3.5-5.0 mEq/L',
      'Chloride [Moles/volume] in Serum or Plasma': '98-107 mEq/L',
      'Carbon dioxide, total [Moles/volume] in Serum or Plasma': '22-28 mEq/L',
      'Calcium [Mass/volume] in Serum or Plasma': '8.5-10.5 mg/dL',
      'Protein [Mass/volume] in Serum or Plasma': '6.0-8.3 g/dL',
      'Albumin [Mass/volume] in Serum or Plasma': '3.5-5.0 g/dL',
      'Cholesterol [Mass/volume] in Serum or Plasma': '<200 mg/dL',
      'Triglycerides [Mass/volume] in Serum or Plasma': '<150 mg/dL'
    };
    
    // Find matching reference range
    for (const [key, range] of Object.entries(referenceRanges)) {
      if (testName && testName.includes(key.split(' [')[0])) {
        return range;
      }
    }
    return 'N/A';
  };

  const renderLabContent = () => {
    if (activeLabTab === 'observation') {
      return (
        <div className="lab-table-container">
          <table className="lab-table">
            <thead>
              <tr>
                <th>Test Name</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Reference Range</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {labObservations.length > 0 ? (
                labObservations.map((obs, index) => (
                  <tr key={obs.id || index}>
                    <td className="test-name">{obs.code_display || 'Unknown'}</td>
                    <td className="test-value">{obs.value_quantity || 'N/A'}</td>
                    <td className="test-unit">{obs.value_unit || '-'}</td>
                    <td className="reference-range">{getReference(obs.code_display)}</td>
                    <td className="test-date">{formatDate(obs.effective_date || obs.effectiveDateTime)}</td>
                    <td>
                      <span className={`status-badge ${obs.status || 'unknown'}`}>
                        {obs.status || 'Unknown'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state">No lab observations found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    } else {
      return (
        <div className="lab-table-container">
          <table className="lab-table">
            <thead>
              <tr>
                <th>Report ID</th>
                <th>Status</th>
                <th>Effective Date</th>
                <th>Issued Date</th>
                <th>Resource Type</th>
              </tr>
            </thead>
            <tbody>
              {diagnosticReports && diagnosticReports.length > 0 ? (
                diagnosticReports.map((report, index) => (
                  <tr key={report.id || index}>
                    <td className="report-id">{report.id || 'Unknown'}</td>
                    <td>
                      <span className={`status-badge ${report.status || 'unknown'}`}>
                        {report.status || 'Unknown'}
                      </span>
                    </td>
                    <td className="report-date">{formatDate(report.effectiveDateTime)}</td>
                    <td className="report-date">{formatDate(report.issued)}</td>
                    <td className="report-type">{report.resourceType || 'DiagnosticReport'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="empty-state">No diagnostic reports found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }
  };

  return (
    <div className="labs-container">
      <div className="labs-tabs">
        <button 
          className={`lab-tab ${activeLabTab === 'observation' ? 'active' : ''}`}
          onClick={() => setActiveLabTab('observation')}
        >
          Lab Results ({labObservations.length})
        </button>
        <button 
          className={`lab-tab ${activeLabTab === 'diagnostic' ? 'active' : ''}`}
          onClick={() => setActiveLabTab('diagnostic')}
        >
          Diagnostic Reports ({diagnosticReports?.length || 0})
        </button>
      </div>
      <div className="labs-content">
        {renderLabContent()}
      </div>
    </div>
  );
};

export default Labs;