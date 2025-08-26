// src/filterUtils.js - Updated Working Filter Logic

/**
 * Apply filters to patient data based on user selections
 * @param {Array} data - Array of patient objects to filter
 * @param {Object} activeFilters - Object containing active filter selections
 * @param {Object} relatedData - Object containing observations, medical data, etc.
 * @returns {Array} Filtered patients array
 */
export function applyEnhancedFilters(data = [], activeFilters = {}, relatedData = {}) {
  if (!data.length || Object.keys(activeFilters).length === 0) {
    return data; // Return all if no filters
  }

  return data.filter(patient => {
    // Check each active filter category
    for (const [filterKey, filterValues] of Object.entries(activeFilters)) {
      if (!filterValues || (Array.isArray(filterValues) && filterValues.length === 0)) continue;

      if (!matchesFilter(patient, filterKey, filterValues, relatedData)) {
        return false; // Patient doesn't match this filter
      }
    }
    
    return true; // Patient matches all filters
  });
}

/**
 * Check if a patient matches a specific filter
 * @param {Object} patient - Patient object
 * @param {string} filterKey - Filter category key
 * @param {*} filterValues - Filter values (array or object)
 * @param {Object} relatedData - Related medical data
 * @returns {boolean} Whether patient matches the filter
 */
function matchesFilter(patient, filterKey, filterValues, relatedData) {
  switch (filterKey) {
    case 'gender':
      return Array.isArray(filterValues) 
        ? filterValues.includes(patient.gender)
        : patient.gender === filterValues;
    
    case 'state':
      return Array.isArray(filterValues) 
        ? filterValues.includes(patient.state)
        : patient.state === filterValues;
    
    case 'city':
      return Array.isArray(filterValues) 
        ? filterValues.includes(patient.city)
        : patient.city === filterValues;
    
    case 'age_range':
      return matchesAgeRange(patient, filterValues);
    
    case 'data_availability':
      return matchesDataAvailability(patient, filterValues, relatedData);
    
    default:
      console.warn(`Unknown filter key: ${filterKey}`);
      return true; // Don't filter for unknown filters
  }
}

/**
 * Check if patient matches age range filter
 * @param {Object} patient - Patient object
 * @param {Object|Array} filterValues - Age filter values
 * @returns {boolean} Whether patient matches age range
 */
function matchesAgeRange(patient, filterValues) {
  const age = parseInt(patient.age);
  if (isNaN(age)) return false;

  // Handle custom range
  if (filterValues.type === 'custom_range') {
    const fromAge = parseInt(filterValues.from);
    const toAge = parseInt(filterValues.to);
    
    if (isNaN(fromAge) || isNaN(toAge)) return true; // Invalid range, don't filter
    
    return age >= fromAge && age <= toAge;
  }
  
  // Handle preset ranges (if we add them later)
  if (Array.isArray(filterValues)) {
    return filterValues.some(range => {
      switch (range) {
        case '0-17': return age <= 17;
        case '18-30': return age >= 18 && age <= 30;
        case '31-45': return age >= 31 && age <= 45;
        case '46-60': return age >= 46 && age <= 60;
        case '61-75': return age >= 61 && age <= 75;
        case '75+': return age > 75;
        default: return false;
      }
    });
  }

  return true;
}

/**
 * Check if patient has the required data types
 * @param {Object} patient - Patient object
 * @param {Array} dataTypes - Array of required data types
 * @param {Object} relatedData - Related data (observations, medical data, etc.)
 * @returns {boolean} Whether patient has all required data types
 */
function matchesDataAvailability(patient, dataTypes, relatedData) {
  if (!Array.isArray(dataTypes) || dataTypes.length === 0) return true;
  
  return dataTypes.every(dataType => {
    switch (dataType) {
      case 'has_observations':
        return (relatedData.observations || []).some(obs => 
          obs.patient_id === patient.id || 
          obs.subject?.reference === `Patient/${patient.id}`
        );
      
      case 'has_conditions':
        return (relatedData.medicalData?.conditions || []).some(condition => 
          condition.patient_id === patient.id || 
          condition.subject?.reference === `Patient/${patient.id}`
        );
      
      case 'has_medications':
        return (relatedData.medicalData?.medications || []).some(med => 
          med.patient_id === patient.id || 
          med.subject?.reference === `Patient/${patient.id}`
        );
      
      case 'has_procedures':
        return (relatedData.medicalData?.procedures || []).some(proc => 
          proc.patient_id === patient.id || 
          proc.subject?.reference === `Patient/${patient.id}`
        );
      
      case 'has_diagnosticreports':
        return (relatedData.diagnosticReports || []).some(report => 
          report.patient_id === patient.id || 
          report.subject?.reference === `Patient/${patient.id}`
        );
      
      default:
        return true; // Unknown data type, don't filter
    }
  });
}

/**
 * Generate filter summary text for display
 * @param {Object} activeFilters - Active filter selections
 * @returns {string} Human-readable filter summary
 */
export function getEnhancedFilterSummary(activeFilters = {}) {
  if (Object.keys(activeFilters).length === 0) {
    return 'No filters applied';
  }

  const summaryParts = [];
  
  Object.entries(activeFilters).forEach(([filterKey, filterValue]) => {
    if (!filterValue) return;
    
    const filterName = getFilterDisplayName(filterKey);
    
    if (filterValue.type === 'custom_range') {
      summaryParts.push(`${filterName}: ${filterValue.from}-${filterValue.to} years`);
    } else if (Array.isArray(filterValue)) {
      const valueCount = filterValue.length;
      if (valueCount === 1) {
        summaryParts.push(`${filterName}: ${filterValue[0]}`);
      } else {
        summaryParts.push(`${filterName}: ${valueCount} selected`);
      }
    } else {
      summaryParts.push(`${filterName}: ${filterValue}`);
    }
  });

  return summaryParts.join(', ');
}

/**
 * Convert filter key to display name
 * @param {string} filterKey - Internal filter key
 * @returns {string} Human-readable filter name
 */
function getFilterDisplayName(filterKey) {
  const displayNames = {
    age_range: 'Age Range',
    gender: 'Gender',
    state: 'State',
    city: 'City',
    data_availability: 'Available Data'
  };
  
  return displayNames[filterKey] || filterKey.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Build FHIR search parameters from active filters for server-side filtering
 * @param {Object} activeFilters - Active filter selections
 * @param {string} resourceType - FHIR resource type
 * @returns {Object} FHIR search parameters
 */
export function buildFHIRSearchParams(activeFilters = {}, resourceType = 'Patient') {
  const searchParams = {};
  
  Object.entries(activeFilters).forEach(([filterKey, filterValue]) => {
    if (!filterValue) return;
    
    switch (filterKey) {
      case 'gender':
        if (Array.isArray(filterValue) && filterValue.length > 0) {
          searchParams.gender = filterValue.join(',');
        }
        break;
        
      case 'age_range':
        if (filterValue.type === 'custom_range') {
          const today = new Date();
          const maxBirthDate = new Date(today.getFullYear() - parseInt(filterValue.from), today.getMonth(), today.getDate());
          const minBirthDate = new Date(today.getFullYear() - parseInt(filterValue.to) - 1, today.getMonth(), today.getDate());
          
          searchParams.birthdate = `ge${minBirthDate.toISOString().split('T')[0]}`;
          searchParams.birthdate += `,le${maxBirthDate.toISOString().split('T')[0]}`;
        }
        break;
        
      case 'state':
        if (Array.isArray(filterValue) && filterValue.length > 0) {
          searchParams['address-state'] = filterValue.join(',');
        }
        break;
        
      case 'city':
        if (Array.isArray(filterValue) && filterValue.length > 0) {
          searchParams['address-city'] = filterValue.join(',');
        }
        break;
    }
  });
  
  return searchParams;
}

/**
 * Validate filter values and provide user feedback
 * @param {Object} activeFilters - Active filter selections
 * @returns {Object} Validation result with errors and warnings
 */
export function validateFilters(activeFilters = {}) {
  const errors = [];
  const warnings = [];
  
  Object.entries(activeFilters).forEach(([filterKey, filterValue]) => {
    if (!filterValue) return;
    
    if (filterValue.type === 'custom_range') {
      const from = parseInt(filterValue.from);
      const to = parseInt(filterValue.to);
      
      if (isNaN(from) || isNaN(to)) {
        errors.push(`${getFilterDisplayName(filterKey)}: Please enter valid numbers for both range values`);
      } else if (from > to) {
        errors.push(`${getFilterDisplayName(filterKey)}: "From" value must be less than or equal to "To" value`);
      } else if (from < 0) {
        warnings.push(`${getFilterDisplayName(filterKey)}: Negative values may not return expected results`);
      }
    }
    
    if (Array.isArray(filterValue) && filterValue.length === 0) {
      warnings.push(`${getFilterDisplayName(filterKey)}: No options selected - this filter will be ignored`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Export filtered data with metadata
 * @param {Array} filteredData - Filtered data array
 * @param {Object} activeFilters - Active filters for metadata
 * @param {string} format - Export format ('csv', 'json')
 * @returns {string|Object} Exported data in requested format
 */
export function exportFilteredData(filteredData = [], activeFilters = {}, format = 'json') {
  const metadata = {
    exportDate: new Date().toISOString(),
    filterSummary: getEnhancedFilterSummary(activeFilters),
    recordCount: filteredData.length,
    filters: activeFilters
  };
  
  if (format === 'csv') {
    return convertToCSV(filteredData, metadata);
  }
  
  return {
    metadata,
    data: filteredData
  };
}

/**
 * Convert data array to CSV format
 * @param {Array} data - Data to convert
 * @param {Object} metadata - Export metadata
 * @returns {string} CSV formatted string
 */
function convertToCSV(data, metadata) {
  if (!data.length) return 'No data to export';
  
  const headers = Object.keys(data[0]);
  const csvRows = [
    `# Export Date: ${metadata.exportDate}`,
    `# Filters Applied: ${metadata.filterSummary}`,
    `# Record Count: ${metadata.recordCount}`,
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
}