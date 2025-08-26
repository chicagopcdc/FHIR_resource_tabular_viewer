// src/components/Measurements.js
import React, { useState } from 'react';

const Measurements = ({ observations }) => {
  const [activeMeasurementTab, setActiveMeasurementTab] = useState('observations');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  if (!observations) {
    return <div className="loading">Loading measurements data...</div>;
  }

  // Categorize observations for measurements (vital signs, physical exam, surveys)
  const measurementObservations = observations.filter(obs => {
    const codeDisplay = obs.code_display?.toLowerCase() || '';
    return (
      codeDisplay.includes('body height') ||
      codeDisplay.includes('body weight') ||
      codeDisplay.includes('body mass index') ||
      codeDisplay.includes('blood pressure') ||
      codeDisplay.includes('heart rate') ||
      codeDisplay.includes('respiratory rate') ||
      codeDisplay.includes('pain severity') ||
      codeDisplay.includes('tobacco smoking') ||
      codeDisplay.includes('temperature') ||
      codeDisplay.includes('oxygen saturation') ||
      codeDisplay.includes('gad-7') ||
      codeDisplay.includes('phq-9') ||
      codeDisplay.includes('dast-10') ||
      codeDisplay.includes('audit-c') ||
      codeDisplay.includes('survey') ||
      codeDisplay.includes('score')
    );
  });

  const getSafeClassName = (category) => {
    if (!category || typeof category !== 'string') return 'unknown';
    return category.toLowerCase().replace(/\s+/g, '-');
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
    } else {
      return 'Physical Exam';
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(measurementObservations.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentObservations = measurementObservations.slice(startIndex, endIndex);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const renderMeasurementContent = () => {
    if (activeMeasurementTab === 'observations') {
      return (
        <div className="measurement-observations-container">
          {/* Controls Bar */}
          <div className="observation-controls">
            <div className="controls-left">
              <span className="record-info">
                Showing {Math.min(startIndex + 1, measurementObservations.length)}-{Math.min(endIndex, measurementObservations.length)} of {measurementObservations.length} observations
              </span>
            </div>
            <div className="controls-right">
              <label htmlFor="itemsPerPage">Show:</label>
              <select 
                id="itemsPerPage"
                value={itemsPerPage} 
                onChange={handleItemsPerPageChange}
                className="items-per-page-select"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                {measurementObservations.length > 0 && <option value={measurementObservations.length}>All</option>}
              </select>
              <span>per page</span>
            </div>
          </div>

          {/* Observations Table */}
          <div className="lab-table-container">
            <table className="lab-table observations-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Measurement Type</th>
                  <th>Value</th>
                  <th>Unit</th>
                  <th>Status</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {currentObservations.length > 0 ? (
                  currentObservations.map(obs => (
                    <tr key={obs.id} className="observation-row">
                      <td className="date-cell">{formatDate(obs.effective_date || obs.effectiveDateTime)}</td>
                      <td className="type-cell">{obs.code_display || 'Unknown'}</td>
                      <td className="value-cell">{obs.value_quantity || 'N/A'}</td>
                      <td className="unit-cell">{obs.value_unit || '-'}</td>
                      <td className="status-cell">
                        <span className={`status-badge ${obs.status || 'unknown'}`}>
                          {obs.status || 'Unknown'}
                        </span>
                      </td>
                      <td className="category-cell">
                        <span className={`category-badge ${getSafeClassName(categorizeObservation(obs.code_display))}`}>
                          {categorizeObservation(obs.code_display)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state">No measurement observations found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination-container">
              <button 
                className="pagination-btn"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              
              <div className="page-numbers">
                {[...Array(totalPages)].map((_, index) => {
                  const page = index + 1;
                  if (
                    page === 1 || 
                    page === totalPages || 
                    (page >= currentPage - 2 && page <= currentPage + 2)
                  ) {
                    return (
                      <button
                        key={page}
                        className={`page-number ${currentPage === page ? 'active' : ''}`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    );
                  } else if (
                    page === currentPage - 3 || 
                    page === currentPage + 3
                  ) {
                    return <span key={page} className="page-dots">...</span>;
                  }
                  return null;
                })}
              </div>
              
              <button 
                className="pagination-btn"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="labs-container">
      <div className="labs-tabs">
        <button 
          className={`lab-tab ${activeMeasurementTab === 'observations' ? 'active' : ''}`}
          onClick={() => setActiveMeasurementTab('observations')}
        >
          Measurements ({measurementObservations.length})
        </button>
      </div>
      <div className="labs-content">
        {renderMeasurementContent()}
      </div>
    </div>
  );
};

export default Measurements;