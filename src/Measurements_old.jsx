// src/components/Measurements.js
import React, { useState, useEffect } from 'react';

const Measurements = ({ observations, patientId, pagination, onPageChange, loading }) => {
  const [activeMeasurementTab, setActiveMeasurementTab] = useState('observations');
  
  // Search and sorting state
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('date');
  
  // Enhanced filtering state
  const [selectedMeasurementType, setSelectedMeasurementType] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [valueRange, setValueRange] = useState({ min: '', max: '' });
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  if (!observations) {
    return <div className="loading">Loading measurements data...</div>;
  }

  // Get unique filter options from data
  const getFilterOptions = () => {
    const allData = observations || [];
    
    const measurementTypes = [...new Set(allData.map(obs => obs.code_display).filter(Boolean))].sort();
    const units = [...new Set(allData.map(obs => obs.value_unit).filter(Boolean))].sort();
    const statuses = [...new Set(allData.map(obs => obs.status).filter(Boolean))].sort();
    
    // Get value range
    const numericValues = allData
      .map(obs => parseFloat(obs.value_quantity))
      .filter(val => !isNaN(val) && isFinite(val));
    
    const valueRangeData = numericValues.length > 0 ? {
      min: Math.min(...numericValues),
      max: Math.max(...numericValues)
    } : null;
    
    return {
      measurementTypes,
      units,
      statuses,
      valueRange: valueRangeData
    };
  };
  
  const filterOptions = getFilterOptions();

  // Apply all filters to the observations
  const getProcessedObservations = () => {
    let data = observations || [];
    
    // Apply measurement type filter
    if (selectedMeasurementType) {
      data = data.filter(obs => obs.code_display === selectedMeasurementType);
    }
    
    // Apply unit filter
    if (selectedUnit) {
      data = data.filter(obs => obs.value_unit === selectedUnit);
    }
    
    // Apply status filter
    if (selectedStatus) {
      data = data.filter(obs => obs.status === selectedStatus);
    }
    
    // Apply numeric value range filter
    if (valueRange.min !== '' || valueRange.max !== '') {
      data = data.filter(obs => {
        const value = parseFloat(obs.value_quantity);
        if (isNaN(value)) return false;
        
        const minCheck = valueRange.min === '' || value >= parseFloat(valueRange.min);
        const maxCheck = valueRange.max === '' || value <= parseFloat(valueRange.max);
        
        return minCheck && maxCheck;
      });
    }
    
    // Apply date range filter
    if (dateRange.from || dateRange.to) {
      data = data.filter(obs => {
        const obsDate = new Date(obs.effective_date || obs.effectiveDateTime);
        if (isNaN(obsDate.getTime())) return false;
        
        const fromCheck = !dateRange.from || obsDate >= new Date(dateRange.from);
        const toCheck = !dateRange.to || obsDate <= new Date(dateRange.to);
        
        return fromCheck && toCheck;
      });
    }
    
    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      data = data.filter(obs => {
        const codeDisplay = (obs.code_display || '').toLowerCase();
        const value = (obs.value_quantity || '').toString().toLowerCase();
        const unit = (obs.value_unit || '').toLowerCase();
        const status = (obs.status || '').toLowerCase();
        
        return codeDisplay.includes(searchLower) ||
               value.includes(searchLower) ||
               unit.includes(searchLower) ||
               status.includes(searchLower);
      });
    }
    
    // Apply sorting (always descending for dates, ascending for text)
    data = [...data].sort((a, b) => {
      let aVal, bVal;
      let useDescending = false;
      
      switch (sortBy) {
        case 'date':
          aVal = new Date(a.effective_date || a.effectiveDateTime || '1900-01-01');
          bVal = new Date(b.effective_date || b.effectiveDateTime || '1900-01-01');
          useDescending = true; // Latest dates first
          break;
        case 'type':
          aVal = (a.code_display || '').toLowerCase();
          bVal = (b.code_display || '').toLowerCase();
          break;
        case 'value':
          aVal = parseFloat(a.value_quantity) || 0;
          bVal = parseFloat(b.value_quantity) || 0;
          useDescending = true; // Higher values first
          break;
        case 'unit':
          aVal = (a.value_unit || '').toLowerCase();
          bVal = (b.value_unit || '').toLowerCase();
          break;
        case 'status':
          aVal = (a.status || '').toLowerCase();
          bVal = (b.status || '').toLowerCase();
          break;
        default:
          aVal = a;
          bVal = b;
      }
      
      if (useDescending) {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      } else {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
    });
    
    return data;
  };
  
  const measurementObservations = getProcessedObservations();

  // Simple categorization function
  const categorizeObservation = (obs) => {
    // Try to use FHIR category if available
    if (obs.category && obs.category.length > 0) {
      const category = obs.category[0];
      if (category.coding && category.coding.length > 0) {
        return category.coding[0].display || category.coding[0].code || 'Measurement';
      } else if (category.text) {
        return category.text;
      }
    }
    
    // Fallback to 'Measurement'
    return 'Measurement';
  };

  const getSafeClassName = (category) => {
    if (!category || typeof category !== 'string') return 'unknown';
    return category.toLowerCase().replace(/\s+/g, '-');
  };

  // Calculate pagination indexes
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, measurementObservations.length);

  // Log measurement stats after functions are defined
  console.log('📈 Dynamic measurement observations (showing ALL):', measurementObservations.length);
  
  // Log categories dynamically found with error handling
  if (measurementObservations.length > 0) {
    try {
      const categories = measurementObservations.reduce((acc, obs) => {
        if (!obs) return acc; // Skip null/undefined observations
        const category = categorizeObservation(obs);
        acc[category] = (acc[category] || 0) + 1;
        return acc;
      }, {});
    } catch (error) {
      console.error('Error categorizing measurements:', error);
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  // Use server-side pagination instead of client-side
  const currentObservations = measurementObservations; // Show all data from server
  
  const handlePaginationPageChange = (page) => {
    if (onPageChange) {
      onPageChange(page);
    }
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };


  const renderMeasurementContent = () => {
    if (activeMeasurementTab === 'observations') {
      return (
        <div className="measurement-observations-container">

          {/* Enhanced Filter Controls */}
          <div style={{ 
            padding: '1rem 0', 
            borderBottom: '1px solid #e0e0e0',
            marginBottom: '1rem'
          }}>
            {/* Search and Sort Row */}
            <div style={{
              display: 'flex',
              gap: '1rem',
              flexWrap: 'wrap',
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              {/* Search */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '300px' }}>
                <label style={{ fontWeight: '500', fontSize: '0.9rem' }}>Search:</label>
                <input
                  type="text"
                  placeholder="Search measurements..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  style={{
                    flex: 1,
                    padding: '0.5rem',
                    border: searchTerm ? '2px solid #007bff' : '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    background: searchTerm ? '#f8f9ff' : 'white'
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setCurrentPage(1);
                    }}
                    style={{
                      background: '#6b7280',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Sort */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ fontWeight: '500', fontSize: '0.9rem' }}>Sort:</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.9rem'
                  }}
                >
                  <option value="date">Date (Latest First)</option>
                  <option value="type">Measurement Type (A-Z)</option>
                  <option value="value">Value (Highest First)</option>
                  <option value="unit">Unit (A-Z)</option>
                  <option value="status">Status (A-Z)</option>
                  <option value="category">Category (A-Z)</option>
                </select>
              </div>

              {/* Advanced Filters Toggle */}
              <button
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                style={{
                  background: showAdvancedFilters ? '#28a745' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.5rem 1rem',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                 Filters
                {(selectedMeasurementType || selectedUnit || selectedStatus || valueRange.min || valueRange.max || dateRange.from || dateRange.to) && (
                  <span style={{
                    background: 'rgba(255,255,255,0.3)',
                    borderRadius: '50%',
                    padding: '2px 6px',
                    fontSize: '0.75rem',
                    fontWeight: '700'
                  }}>
                    {[selectedMeasurementType, selectedUnit, selectedStatus, 
                      (valueRange.min || valueRange.max) ? 1 : 0,
                      (dateRange.from || dateRange.to) ? 1 : 0
                    ].filter(Boolean).length}
                  </span>
                )}
                <span style={{ fontSize: '0.8rem' }}>
                  {showAdvancedFilters ? '▲' : '▼'}
                </span>
              </button>
            </div>

            {/* Advanced Filters Panel */}
            {showAdvancedFilters && (
              <div style={{
                background: '#f8f9fa',
                border: '1px solid #e9ecef',
                borderRadius: '6px',
                padding: '1rem',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem'
              }}>
                {/* Measurement Type Filter */}
                {filterOptions.measurementTypes.length > 0 && (
                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '0.5rem', 
                      fontSize: '0.875rem', 
                      fontWeight: '500',
                      color: '#374151'
                    }}>
                      Measurement Type:
                    </label>
                    <select
                      value={selectedMeasurementType}
                      onChange={(e) => {
                        setSelectedMeasurementType(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: selectedMeasurementType ? '2px solid #dc3545' : '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        background: selectedMeasurementType ? '#fff5f5' : 'white'
                      }}
                    >
                      <option value="">All Types ({filterOptions.measurementTypes.length})</option>
                      {filterOptions.measurementTypes.map(type => {
                        const count = (observations || []).filter(obs => obs.code_display === type).length;
                        return (
                          <option key={type} value={type}>
                            {type} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Numeric Range Filter */}
                {filterOptions.valueRange && (
                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '0.5rem', 
                      fontSize: '0.875rem', 
                      fontWeight: '500',
                      color: '#374151'
                    }}>
                      Value Range ({filterOptions.valueRange.min.toFixed(1)} - {filterOptions.valueRange.max.toFixed(1)}):
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="number"
                        placeholder={`Min (${filterOptions.valueRange.min.toFixed(1)})`}
                        value={valueRange.min}
                        onChange={(e) => {
                          setValueRange(prev => ({ ...prev, min: e.target.value }));
                          setCurrentPage(1);
                        }}
                        step={filterOptions.valueRange.max - filterOptions.valueRange.min > 100 ? "1" : "0.1"}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          border: valueRange.min ? '2px solid #28a745' : '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                          background: valueRange.min ? '#f0fff4' : 'white'
                        }}
                      />
                      <input
                        type="number"
                        placeholder={`Max (${filterOptions.valueRange.max.toFixed(1)})`}
                        value={valueRange.max}
                        onChange={(e) => {
                          setValueRange(prev => ({ ...prev, max: e.target.value }));
                          setCurrentPage(1);
                        }}
                        step={filterOptions.valueRange.max - filterOptions.valueRange.min > 100 ? "1" : "0.1"}
                        style={{
                          flex: 1,
                          padding: '0.5rem',
                          border: valueRange.max ? '2px solid #28a745' : '1px solid #d1d5db',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                          background: valueRange.max ? '#f0fff4' : 'white'
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Unit Filter */}
                {filterOptions.units.length > 0 && (
                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '0.5rem', 
                      fontSize: '0.875rem', 
                      fontWeight: '500',
                      color: '#374151'
                    }}>
                      Unit:
                    </label>
                    <select
                      value={selectedUnit}
                      onChange={(e) => {
                        setSelectedUnit(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: selectedUnit ? '2px solid #ffc107' : '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        background: selectedUnit ? '#fffbf0' : 'white'
                      }}
                    >
                      <option value="">All Units ({filterOptions.units.length})</option>
                      {filterOptions.units.map(unit => {
                        const count = (observations || []).filter(obs => obs.value_unit === unit).length;
                        return (
                          <option key={unit} value={unit}>
                            {unit} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Status Filter */}
                {filterOptions.statuses.length > 0 && (
                  <div>
                    <label style={{ 
                      display: 'block', 
                      marginBottom: '0.5rem', 
                      fontSize: '0.875rem', 
                      fontWeight: '500',
                      color: '#374151'
                    }}>
                      Status:
                    </label>
                    <select
                      value={selectedStatus}
                      onChange={(e) => {
                        setSelectedStatus(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        border: selectedStatus ? '2px solid #17a2b8' : '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        background: selectedStatus ? '#f0f9ff' : 'white'
                      }}
                    >
                      <option value="">All Statuses ({filterOptions.statuses.length})</option>
                      {filterOptions.statuses.map(status => {
                        const count = (observations || []).filter(obs => obs.status === status).length;
                        const statusIcon = '';
                        return (
                          <option key={status} value={status}>
                            {status.toUpperCase()} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Date Range Filter */}
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '0.5rem', 
                    fontSize: '0.875rem', 
                    fontWeight: '500',
                    color: '#374151'
                  }}>
                    Date Range:
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="date"
                      value={dateRange.from}
                      onChange={(e) => {
                        setDateRange(prev => ({ ...prev, from: e.target.value }));
                        setCurrentPage(1);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        border: dateRange.from ? '2px solid #6f42c1' : '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        background: dateRange.from ? '#faf5ff' : 'white'
                      }}
                    />
                    <span style={{ color: '#6b7280', fontSize: '0.875rem' }}>to</span>
                    <input
                      type="date"
                      value={dateRange.to}
                      onChange={(e) => {
                        setDateRange(prev => ({ ...prev, to: e.target.value }));
                        setCurrentPage(1);
                      }}
                      style={{
                        flex: 1,
                        padding: '0.5rem',
                        border: dateRange.to ? '2px solid #6f42c1' : '1px solid #d1d5db',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        background: dateRange.to ? '#faf5ff' : 'white'
                      }}
                    />
                  </div>
                </div>

                {/* Clear All Filters */}
                {(selectedMeasurementType || selectedUnit || selectedStatus || valueRange.min || valueRange.max || dateRange.from || dateRange.to) && (
                  <div style={{ gridColumn: 'span 2', textAlign: 'center', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => {
                        setSelectedMeasurementType('');
                        setSelectedUnit('');
                        setSelectedStatus('');
                        setValueRange({ min: '', max: '' });
                        setDateRange({ from: '', to: '' });
                        setCurrentPage(1);
                      }}
                      style={{
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.75rem 1.5rem',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        fontWeight: '500'
                      }}
                    >
                      Clear All Filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div className="observation-controls">
            <div className="controls-left">
              <span className="record-info">
                Showing {Math.min(startIndex + 1, measurementObservations.length)}-{Math.min(endIndex, measurementObservations.length)} of {measurementObservations.length} observations
                {searchTerm && <span style={{ color: '#6b7280', marginLeft: '0.5rem' }}>(filtered)</span>}
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
                  <th 
                    onClick={() => setSortBy('date')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Date {sortBy === 'date' && '↓'}
                  </th>
                  <th 
                    onClick={() => setSortBy('type')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Measurement Type {sortBy === 'type' && '↑'}
                  </th>
                  <th 
                    onClick={() => setSortBy('value')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Value {sortBy === 'value' && '↓'}
                  </th>
                  <th 
                    onClick={() => setSortBy('unit')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Unit {sortBy === 'unit' && '↑'}
                  </th>
                  <th 
                    onClick={() => setSortBy('status')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Status {sortBy === 'status' && '↑'}
                  </th>
                  <th 
                    onClick={() => setSortBy('category')}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                  >
                    Category {sortBy === 'category' && '↑'}
                  </th>
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
                        <span className={`category-badge ${getSafeClassName(categorizeObservation(obs))}`}>
                          {categorizeObservation(obs)}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state">
                      {(searchTerm || selectedMeasurementType || selectedUnit || selectedStatus || valueRange.min || valueRange.max || dateRange.from || dateRange.to)
                        ? 'No measurements match your search and filters'
                        : 'No measurement observations found'
                      }
                      {(searchTerm || selectedMeasurementType || selectedUnit || selectedStatus || valueRange.min || valueRange.max || dateRange.from || dateRange.to) && (
                        <div style={{ marginTop: '0.5rem' }}>
                          <button
                            onClick={() => {
                              setSearchTerm('');
                              setSelectedMeasurementType('');
                              setSelectedUnit('');
                              setSelectedStatus('');
                              setValueRange({ min: '', max: '' });
                              setDateRange({ from: '', to: '' });
                              setCurrentPage(1);
                            }}
                            style={{
                              background: '#007bff',
                              color: 'white',
                              border: 'none',
                              borderRadius: '4px',
                              padding: '0.5rem 1rem',
                              cursor: 'pointer',
                              fontSize: '0.9rem'
                            }}
                          >
                            Clear All Filters
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Server-side pagination controls */}
          {pagination && pagination.total > pagination.per_page && (
            <div className="pagination-container">
              <div className="pagination-info">
                Showing {Math.min((pagination.page - 1) * pagination.per_page + 1, pagination.total)}-
                {Math.min(pagination.page * pagination.per_page, pagination.total)} of {pagination.total} measurements
              </div>
              <div className="pagination-controls">
                <button 
                  className="pagination-btn"
                  disabled={!pagination.has_prev || loading}
                  onClick={() => handlePaginationPageChange(pagination.page - 1)}
                >
                  ← Previous
                </button>
                <span className="page-indicator">Page {pagination.page}</span>
                <button 
                  className="pagination-btn"
                  disabled={!pagination.has_next || loading}
                  onClick={() => handlePaginationPageChange(pagination.page + 1)}
                >
                  Next →
                </button>
              </div>
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
          Measurements
        </button>
      </div>
      <div className="labs-content">
        {renderMeasurementContent()}
      </div>
    </div>
  );
};

export default Measurements;
