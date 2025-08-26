// src/DynamicFilterSidebar.js - Functional Filter System with Navigation
import React, { useState, useEffect, useMemo } from 'react';
import './App.css';

const DynamicFilterSidebar = ({ 
  isOpen, 
  onClose, 
  onFilterChange,
  currentResourceType = 'Patient',
  patients = [],
  observations = [],
  diagnosticReports = [],
  documentReferences = [],
  medicalData = {},
  pagination = {},
  onPageChange,
  onPageSizeChange
}) => {
  const [expandedSections, setExpandedSections] = useState({
    'page_navigation': true,
    'gender': true,
    'age_range': true
  });
  const [activeFilters, setActiveFilters] = useState({});
  const [customAgeRange, setCustomAgeRange] = useState({ from: '', to: '' });
  const [pageNavigation, setPageNavigation] = useState({ targetPage: '' });

  // Generate filter options based on actual data
  const filterOptions = useMemo(() => {
    const options = {};

    if (patients.length > 0) {
      // Gender options
      const genders = [...new Set(patients.map(p => p.gender).filter(Boolean))];
      options.gender = genders.map(gender => ({
        value: gender,
        label: gender.charAt(0).toUpperCase() + gender.slice(1),
        count: patients.filter(p => p.gender === gender).length
      }));

      // State options
      const states = [...new Set(patients.map(p => p.state).filter(Boolean))];
      if (states.length > 0 && states.length <= 50) {
        options.state = states.sort().map(state => ({
          value: state,
          label: state,
          count: patients.filter(p => p.state === state).length
        }));
      }

      // City options
      const cities = [...new Set(patients.map(p => p.city).filter(Boolean))];
      if (cities.length > 0 && cities.length <= 100) {
        options.city = cities.sort().map(city => ({
          value: city,
          label: city,
          count: patients.filter(p => p.city === city).length
        }));
      }

      // Age statistics for range
      const ages = patients.map(p => parseInt(p.age)).filter(age => !isNaN(age));
      if (ages.length > 0) {
        options.ageStats = {
          min: Math.min(...ages),
          max: Math.max(...ages),
          avg: Math.round(ages.reduce((a, b) => a + b, 0) / ages.length)
        };
      }

      // Data availability options
      options.dataAvailability = [
        { 
          value: 'has_observations', 
          label: 'Has Observations',
          count: patients.filter(p => 
            observations.some(obs => obs.patient_id === p.id || obs.subject?.reference === `Patient/${p.id}`)
          ).length
        },
        { 
          value: 'has_conditions', 
          label: 'Has Medical Conditions',
          count: patients.filter(p => 
            medicalData.conditions?.some(cond => cond.patient_id === p.id || cond.subject?.reference === `Patient/${p.id}`)
          ).length
        },
        { 
          value: 'has_medications', 
          label: 'Has Medications',
          count: patients.filter(p => 
            medicalData.medications?.some(med => med.patient_id === p.id || med.subject?.reference === `Patient/${p.id}`)
          ).length
        }
      ].filter(option => option.count > 0);
    }

    return options;
  }, [patients, observations, medicalData]);

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  const handleFilterChange = (filterKey, value, checked) => {
    setActiveFilters(prev => {
      const current = prev[filterKey] || [];
      let updated;
      
      if (Array.isArray(current)) {
        updated = checked 
          ? [...current, value]
          : current.filter(item => item !== value);
      } else {
        updated = checked ? [value] : [];
      }
      
      const newFilters = {
        ...prev,
        [filterKey]: updated.length > 0 ? updated : undefined
      };

      // Clean up empty filters
      Object.keys(newFilters).forEach(key => {
        if (!newFilters[key] || (Array.isArray(newFilters[key]) && newFilters[key].length === 0)) {
          delete newFilters[key];
        }
      });

      onFilterChange && onFilterChange(newFilters);
      return newFilters;
    });
  };

  const handleAgeRangeChange = () => {
    const fromAge = parseInt(customAgeRange.from);
    const toAge = parseInt(customAgeRange.to);

    if (!isNaN(fromAge) && !isNaN(toAge) && fromAge <= toAge) {
      setActiveFilters(prev => {
        const newFilters = {
          ...prev,
          age_range: { type: 'custom_range', from: fromAge, to: toAge }
        };
        
        onFilterChange && onFilterChange(newFilters);
        return newFilters;
      });
    }
  };

  const clearAllFilters = () => {
    setActiveFilters({});
    setCustomAgeRange({ from: '', to: '' });
    onFilterChange && onFilterChange({});
  };

  const handlePageNavigation = () => {
    const targetPage = parseInt(pageNavigation.targetPage);
    if (!isNaN(targetPage) && targetPage > 0) {
      onPageChange && onPageChange(targetPage);
      setPageNavigation({ targetPage: '' });
    }
  };

  const getTotalActiveFilters = () => {
    return Object.values(activeFilters).reduce((total, filterValue) => {
      if (Array.isArray(filterValue)) {
        return total + filterValue.length;
      } else if (filterValue && typeof filterValue === 'object' && filterValue.type === 'custom_range') {
        return total + 1;
      }
      return total;
    }, 0);
  };

  const renderPageNavigation = () => (
    <div className="filter-category">
      <div 
        className="category-header"
        onClick={() => toggleSection('page_navigation')}
      >
        <span>Page Navigation</span>
        <span className={`arrow ${expandedSections.page_navigation ? 'expanded' : ''}`}>▼</span>
      </div>
      
      {expandedSections.page_navigation && (
        <div className="category-options">
          <div style={{ padding: '1rem 0' }}>
            <div style={{ marginBottom: '0.75rem', color: '#6b7280', fontSize: '0.875rem' }}>
              Current: Page {pagination.page} of many (50 patients per page)
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                type="number"
                min="1"
                value={pageNavigation.targetPage}
                onChange={(e) => setPageNavigation({ targetPage: e.target.value })}
                placeholder="Page #"
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              />
              <button
                onClick={handlePageNavigation}
                disabled={!pageNavigation.targetPage}
                style={{
                  background: pageNavigation.targetPage ? '#007bff' : '#e9ecef',
                  color: pageNavigation.targetPage ? 'white' : '#6c757d',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: pageNavigation.targetPage ? 'pointer' : 'not-allowed',
                  fontSize: '0.875rem'
                }}
              >
                Go
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.75rem' }}>
              <button
                onClick={() => onPageChange && onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                style={{
                  flex: 1,
                  background: pagination.page <= 1 ? '#e9ecef' : '#f8f9fa',
                  border: '1px solid #dee2e6',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  cursor: pagination.page <= 1 ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Previous
              </button>
              <button
                onClick={() => onPageChange && onPageChange(pagination.page + 1)}
                disabled={!pagination.has_next}
                style={{
                  flex: 1,
                  background: !pagination.has_next ? '#e9ecef' : '#f8f9fa',
                  border: '1px solid #dee2e6',
                  padding: '0.5rem',
                  borderRadius: '4px',
                  cursor: !pagination.has_next ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderGenderFilter = () => (
    <div className="filter-category">
      <div 
        className="category-header"
        onClick={() => toggleSection('gender')}
      >
        <span>
          Gender
          {activeFilters.gender?.length > 0 && (
            <span style={{
              marginLeft: '8px',
              background: '#dc3545',
              color: 'white',
              borderRadius: '50%',
              padding: '2px 6px',
              fontSize: '0.7rem'
            }}>
              {activeFilters.gender.length}
            </span>
          )}
        </span>
        <span className={`arrow ${expandedSections.gender ? 'expanded' : ''}`}>▼</span>
      </div>
      
      {expandedSections.gender && (
        <div className="category-options">
          <div className="options-list">
            {filterOptions.gender?.map((option, index) => (
              <div key={index} className="filter-option">
                <label className="filter-option-label">
                  <input 
                    type="checkbox" 
                    className="filter-checkbox"
                    checked={(activeFilters.gender || []).includes(option.value)}
                    onChange={(e) => handleFilterChange('gender', option.value, e.target.checked)}
                  />
                  <span className="filter-option-text">
                    {option.label}
                    <span className="option-count">({option.count})</span>
                  </span>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderAgeRangeFilter = () => (
    <div className="filter-category">
      <div 
        className="category-header"
        onClick={() => toggleSection('age_range')}
      >
        <span>
          Age Range
          {activeFilters.age_range && (
            <span style={{
              marginLeft: '8px',
              background: '#dc3545',
              color: 'white',
              borderRadius: '50%',
              padding: '2px 6px',
              fontSize: '0.7rem'
            }}>
              1
            </span>
          )}
        </span>
        <span className={`arrow ${expandedSections.age_range ? 'expanded' : ''}`}>▼</span>
      </div>
      
      {expandedSections.age_range && (
        <div className="category-options">
          <div style={{ padding: '1rem 0' }}>
            {filterOptions.ageStats && (
              <div style={{ marginBottom: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
                Available ages: {filterOptions.ageStats.min} - {filterOptions.ageStats.max} years 
                (avg: {filterOptions.ageStats.avg})
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#374151' }}>
                  From Age:
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={customAgeRange.from}
                  onChange={(e) => setCustomAgeRange(prev => ({ ...prev, from: e.target.value }))}
                  placeholder="Min"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', color: '#374151' }}>
                  To Age:
                </label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={customAgeRange.to}
                  onChange={(e) => setCustomAgeRange(prev => ({ ...prev, to: e.target.value }))}
                  placeholder="Max"
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #d1d5db',
                    borderRadius: '4px',
                    fontSize: '0.875rem'
                  }}
                />
              </div>
            </div>
            
            <button
              onClick={handleAgeRangeChange}
              disabled={!customAgeRange.from || !customAgeRange.to}
              style={{
                width: '100%',
                background: (customAgeRange.from && customAgeRange.to) ? '#007bff' : '#e9ecef',
                color: (customAgeRange.from && customAgeRange.to) ? 'white' : '#6c757d',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: (customAgeRange.from && customAgeRange.to) ? 'pointer' : 'not-allowed',
                fontSize: '0.875rem'
              }}
            >
              Apply Age Filter
            </button>
            
            {activeFilters.age_range && (
              <div style={{ 
                marginTop: '0.75rem', 
                padding: '0.5rem',
                background: '#e3f2fd',
                borderRadius: '4px',
                fontSize: '0.875rem',
                color: '#1976d2'
              }}>
                Active: {activeFilters.age_range.from} - {activeFilters.age_range.to} years
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderStateFilter = () => {
    if (!filterOptions.state) return null;

    return (
      <div className="filter-category">
        <div 
          className="category-header"
          onClick={() => toggleSection('state')}
        >
          <span>
            State/Province
            {activeFilters.state?.length > 0 && (
              <span style={{
                marginLeft: '8px',
                background: '#dc3545',
                color: 'white',
                borderRadius: '50%',
                padding: '2px 6px',
                fontSize: '0.7rem'
              }}>
                {activeFilters.state.length}
              </span>
            )}
          </span>
          <span className={`arrow ${expandedSections.state ? 'expanded' : ''}`}>▼</span>
        </div>
        
        {expandedSections.state && (
          <div className="category-options">
            <div className="options-list">
              {filterOptions.state.map((option, index) => (
                <div key={index} className="filter-option">
                  <label className="filter-option-label">
                    <input 
                      type="checkbox" 
                      className="filter-checkbox"
                      checked={(activeFilters.state || []).includes(option.value)}
                      onChange={(e) => handleFilterChange('state', option.value, e.target.checked)}
                    />
                    <span className="filter-option-text">
                      {option.label}
                      <span className="option-count">({option.count})</span>
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDataAvailabilityFilter = () => {
    if (!filterOptions.dataAvailability || filterOptions.dataAvailability.length === 0) return null;

    return (
      <div className="filter-category">
        <div 
          className="category-header"
          onClick={() => toggleSection('data_availability')}
        >
          <span>
            Available Data
            {activeFilters.data_availability?.length > 0 && (
              <span style={{
                marginLeft: '8px',
                background: '#dc3545',
                color: 'white',
                borderRadius: '50%',
                padding: '2px 6px',
                fontSize: '0.7rem'
              }}>
                {activeFilters.data_availability.length}
              </span>
            )}
          </span>
          <span className={`arrow ${expandedSections.data_availability ? 'expanded' : ''}`}>▼</span>
        </div>
        
        {expandedSections.data_availability && (
          <div className="category-options">
            <div className="options-list">
              {filterOptions.dataAvailability.map((option, index) => (
                <div key={index} className="filter-option">
                  <label className="filter-option-label">
                    <input 
                      type="checkbox" 
                      className="filter-checkbox"
                      checked={(activeFilters.data_availability || []).includes(option.value)}
                      onChange={(e) => handleFilterChange('data_availability', option.value, e.target.checked)}
                    />
                    <span className="filter-option-text">
                      {option.label}
                      <span className="option-count">({option.count})</span>
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'show' : ''}`} onClick={onClose}></div>
      
      <div className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h3>
            Filters
            {getTotalActiveFilters() > 0 && (
              <span style={{
                marginLeft: '8px',
                background: '#dc3545',
                color: 'white',
                borderRadius: '50%',
                padding: '4px 8px',
                fontSize: '0.75rem',
                fontWeight: '700'
              }}>
                {getTotalActiveFilters()}
              </span>
            )}
          </h3>
          <button className="close-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="sidebar-content">
          {getTotalActiveFilters() > 0 && (
            <div style={{ 
              margin: '0 0 1.5rem 0',
              padding: '0 1.5rem 1rem 1.5rem',
              borderBottom: '1px solid #e0e0e0'
            }}>
              <button 
                onClick={clearAllFilters}
                style={{
                  width: '100%',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: '500'
                }}
              >
                Clear All Filters ({getTotalActiveFilters()})
              </button>
            </div>
          )}

          {renderPageNavigation()}
          {renderGenderFilter()}
          {renderAgeRangeFilter()}
          {renderStateFilter()}
          {renderDataAvailabilityFilter()}

          {patients.length === 0 && (
            <div style={{
              padding: '2rem 1.5rem',
              textAlign: 'center',
              color: '#6b7280',
              fontStyle: 'italic'
            }}>
              Load patient data to see available filters
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default DynamicFilterSidebar;