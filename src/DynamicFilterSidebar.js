// src/DynamicFilterSidebar.js 
import React, { useState, useEffect, useMemo } from 'react';
import * as api from './api';
import { CONFIG } from './config';
import './App.css';

const DynamicFilterSidebar = ({ 
  isOpen, 
  onClose, 
  onFilterChange,
  activeFilters: parentActiveFilters = {},
  selectedResourceTypes = ['Patient'], // Array of resource types to fetch filters for
  patients = [],
  pagination = {},
  onPageChange,
  onPageSizeChange,
  fhirBaseUrl = 'https://hapi.fhir.org/baseR4', // Add FHIR base URL prop
  onFhirSearch  // Add callback for FHIR search results
}) => {
  // Dynamic filter targets state
  const [filterTargets, setFilterTargets] = useState(null);
  const [dynamicSelectedResourceTypes, setDynamicSelectedResourceTypes] = useState([]);
  const [loadingTargets, setLoadingTargets] = useState(false);

  // Filter UI configuration state
  const [filterUIConfig, setFilterUIConfig] = useState(null);
  const [loadingUIConfig, setLoadingUIConfig] = useState(false);


  // Resource-specific filter state
  const [availableFilters, setAvailableFilters] = useState({}); // { resourceType: [filters] }
  const [loadingFilters, setLoadingFilters] = useState({});     // { resourceType: boolean }
  const [filterErrors, setFilterErrors] = useState({});        // { resourceType: error }

  // UI state
  const [expandedSections, setExpandedSections] = useState({
    'resource_filters': true  
  });
  const [activeFilters, setActiveFilters] = useState({});
  const [stagedFilters, setStagedFilters] = useState({}); // Staged changes before applying

  // Fetch filter targets from backend configuration
  const fetchFilterTargets = async () => {
    if (loadingTargets) return;
    
    setLoadingTargets(true);
    try {
      console.log('Fetching filter targets from backend...');
      const response = await api.get('/filters/targets');
      
      if (response.success && response.resource_types) {
        setFilterTargets(response);
        setDynamicSelectedResourceTypes(response.resource_types);
        console.log(`Loaded ${response.resource_types.length} resource types from configuration`);
      } else {
        console.warn('Filter targets response missing resource_types:', response);
      }
    } catch (error) {
      console.error('Error fetching filter targets:', error);
    } finally {
      setLoadingTargets(false);
    }
  };

  // Fetch filter UI configuration from backend
  const fetchFilterUIConfig = async () => {
    if (loadingUIConfig) return;
    
    setLoadingUIConfig(true);
    try {
      console.log('📋 Fetching filter UI configuration from backend...');
      const response = await api.get('/filters/ui-config');
      
      if (response.success && response.ui_config) {
        setFilterUIConfig(response.ui_config);
        console.log('✅ Filter UI config loaded:', response.ui_config.sections);
        
        // Initialize expanded sections based on config
        const initialExpanded = { 'resource_filters': true };
        response.ui_config.sections?.forEach(section => {
          if (section.expanded_by_default) {
            initialExpanded[section.id] = true;
          }
        });
        setExpandedSections(prev => ({ ...prev, ...initialExpanded }));
        
      } else {
        console.warn('⚠️ No UI config found, using default structure');
        setExpandedSections(prev => ({ ...prev, 'resource_filters': true }));
      }
    } catch (error) {
      console.error('❌ Failed to fetch filter UI config:', error);
      setExpandedSections(prev => ({ ...prev, 'resource_filters': true }));
    } finally {
      setLoadingUIConfig(false);
    }
  };

  // Fetch available filters per resource type from backend
  const fetchAvailableFilters = async (resourceType) => {
    if (loadingFilters[resourceType]) return; // Prevent duplicate requests
    
    setLoadingFilters(prev => ({ ...prev, [resourceType]: true }));
    setFilterErrors(prev => ({ ...prev, [resourceType]: null }));
    
    try {
      console.log('Fetching filters for configured resource type');
      
      // Call backend filters API: GET /api/filters/{resourceType}/metadata?sample_size=N
      const queryParams = new URLSearchParams({ sample_size: CONFIG.ui.defaultPageSize.toString() });
      const url = `/filters/${resourceType}/metadata?${queryParams}`;
      
      const response = await api.get(url);
      
      if (response.success && response.filters) {
        setAvailableFilters(prev => ({
          ...prev,
          [resourceType]: response.filters
        }));
        console.log(`Loaded ${response.filters.length} filters from configuration`);
      } else {
        throw new Error(response.message || 'Failed to load filters from configuration');
      }
    } catch (error) {
      console.error('Error loading filters from configuration:', error);
      setFilterErrors(prev => ({ 
        ...prev, 
        [resourceType]: error.message || 'Failed to load filters'
      }));
    } finally {
      setLoadingFilters(prev => ({ ...prev, [resourceType]: false }));
    }
  };

  // FHIR Search functionality 
  const executeFhirSearch = async (searchParams) => {
    if (!fhirBaseUrl) return null;
    
    try {
      // Ensure we're searching for Patients specifically
      const url = new URL(`${fhirBaseUrl}/Patient`);
      Object.entries(searchParams).forEach(([key, value]) => {
        if (value && value !== 'all') {
          url.searchParams.append(key, value);
        }
      });

      console.log('FHIR Search URL:', url.toString());
      const response = await fetch(url.toString());
      const data = await response.json();
      
      if (onFhirSearch) {
        onFhirSearch(data, searchParams);
      }
      
      return data;
    } catch (error) {
      console.error('FHIR search error:', error);
      return null;
    }
  };


  // Fetch filter targets and UI config on mount
  useEffect(() => {
    if (isOpen) {
      fetchFilterTargets();
      fetchFilterUIConfig();
    }
  }, [isOpen]);

  // Initialize staged filters when component mounts or parent active filters change
  useEffect(() => {
    setActiveFilters(parentActiveFilters);
    setStagedFilters({ ...parentActiveFilters });
    
  }, [parentActiveFilters]);

  // Fetch filters for selected resource types when sidebar opens or resource types change
  useEffect(() => {
    if (isOpen && dynamicSelectedResourceTypes.length > 0) {
      console.log(`Fetching filters for ${dynamicSelectedResourceTypes.length} configured resource types`);
      
      // Fetch filters for each selected resource type
      dynamicSelectedResourceTypes.forEach(resourceType => {
        fetchAvailableFilters(resourceType);
      });
    }
  }, [isOpen, dynamicSelectedResourceTypes]);



  // Dynamic filter discovery - finds all possible filters from actual patient data
  const discoverDynamicFilters = useMemo(() => {
    if (patients.length === 0) {
      return {};
    }
    
    const dynamicFilters = {};
    
    
    const samplePatient = patients[0];
    const fieldsToAnalyze = ['maritalStatus', 'race', 'ethnicity', 'language', 'country', 'county'];
    
    fieldsToAnalyze.forEach(field => {
      if (samplePatient[field]) {
        const values = [...new Set(patients.map(p => p[field]).filter(Boolean))];
        
        // Only create filter if there are multiple distinct values and not too many
        if (values.length > 1 && values.length <= 20) {
          dynamicFilters[field] = {
            label: field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1'),
            options: values.sort().map(value => ({
              value,
              label: value,
              count: patients.filter(p => p[field] === value).length
            }))
          };
        }
      }
    });
    


    return dynamicFilters;
  }, [patients]);

  // Generate filter options based on actual data 
  const filterOptions = useMemo(() => {
    const options = {};

    if (patients.length === 0) {
      return options;
    }




      // State options - handle both transformed and raw FHIR data
      const states = [...new Set(patients.map(p => {
        // Try transformed data first
        if (p.state) return p.state;
        
        // Try raw FHIR address data
        if (p.address && Array.isArray(p.address) && p.address[0]) {
          return p.address[0].state;
        }
        return null;
      }).filter(Boolean))];
      
      if (states.length > 1 && states.length <= 50) {
        options.state = states.sort().map(state => ({
          value: state,
          label: state,
          count: patients.filter(p => {
            const patientState = p.state || (p.address && p.address[0] && p.address[0].state);
            return patientState === state;
          }).length
        }));
      }

      // Active status filter
      const activeStatuses = [...new Set(patients.map(p => p.active).filter(val => val !== undefined && val !== null))];
      if (activeStatuses.length > 1) {
        options.active = activeStatuses.map(status => ({
          value: status.toString(),
          label: status ? 'Active' : 'Inactive',
          count: patients.filter(p => p.active === status).length
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
      

    return options;
  }, [patients]);

  const toggleSection = (sectionKey) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };



  const handleFilterChange = (filterKey, value, checked) => {
    setStagedFilters(prev => {
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
      Object.keys(newFilters).forEach(key => {
        if (!newFilters[key] || (Array.isArray(newFilters[key]) && newFilters[key].length === 0)) {
          delete newFilters[key];
        }
      });

      // Don't call onFilterChange immediately - wait for Apply button
      return newFilters;
    });
  };


  const applyFilters = () => {
    setActiveFilters({ ...stagedFilters });
    
    // Wrap filters in the expected structure for the App.js handler
    const filterPayload = {
      filters: { ...stagedFilters } // Resource-specific filters go in 'filters' property
    };
    
    onFilterChange && onFilterChange(filterPayload);
  };

  const clearAllFilters = () => {
    setActiveFilters({});
    setStagedFilters({});
    
    // Send empty filter payload with expected structure
    const filterPayload = {
      filters: {} // Empty filters
    };
    
    onFilterChange && onFilterChange(filterPayload);
  };

  const resetStagedFilters = () => {
    setStagedFilters({ ...activeFilters });
  };

  const hasPendingChanges = () => {
    return JSON.stringify(stagedFilters) !== JSON.stringify(activeFilters);
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

  // Render filter sections based on config.yaml configuration
  const renderConfigDrivenSections = () => {
    if (!filterUIConfig || !filterUIConfig.sections) {
      return null;
    }

    return filterUIConfig.sections.map(section => {
      // Get resources for this section
      let sectionResources = [];
      
      if (section.resources === "auto") {
        // Auto-discover from available filters, excluding specified resources
        const excludeResources = section.exclude_resources || [];
        sectionResources = Object.keys(availableFilters).filter(
          resourceType => !excludeResources.includes(resourceType)
        );
      } else if (Array.isArray(section.resources)) {
        sectionResources = section.resources;
      }
      
      // Count total filters and active filters for this section
      let totalFilters = 0;
      let activeFiltersCount = 0;
      
      sectionResources.forEach(resourceType => {
        const resourceFilters = availableFilters[resourceType] || [];
        totalFilters += resourceFilters.length;
        
        const resourceActiveFilters = resourceFilters.filter(filter => 
          stagedFilters[filter.key] && (
            (Array.isArray(stagedFilters[filter.key]) && stagedFilters[filter.key].length > 0) ||
            false
          )
        ).length;
        activeFiltersCount += resourceActiveFilters;
      });

      return (
        <div key={section.id} className="filter-category">
          <div 
            className="category-header"
            onClick={() => toggleSection(section.id)}
          >
            <span>
              {section.icon} {section.label}
              {activeFiltersCount > 0 && (
                <span style={{
                  marginLeft: '8px',
                  background: '#dc3545',
                  color: 'white',
                  borderRadius: '50%',
                  padding: '2px 6px',
                  fontSize: '0.7rem'
                }}>
                  {activeFiltersCount}
                </span>
              )}
            </span>
            <span className={`arrow ${expandedSections[section.id] ? 'expanded' : ''}`}>▼</span>
          </div>
          
          {expandedSections[section.id] && (
            <div className="category-options">
              {/* Loading states */}
              {sectionResources.some(resourceType => loadingFilters[resourceType]) && (
                <div style={{ 
                  padding: '0.5rem', 
                  fontSize: '0.75rem', 
                  color: '#1976d2', 
                  background: '#e3f2fd',
                  borderRadius: '4px',
                  marginBottom: '0.75rem',
                  textAlign: 'center'
                }}>
                  🔄 Loading {section.label.toLowerCase()}...
                </div>
              )}
              
              {/* Error states */}
              {sectionResources
                .filter(resourceType => filterErrors[resourceType])
                .map(resourceType => (
                  <div key={resourceType} style={{ 
                    padding: '0.5rem', 
                    fontSize: '0.75rem', 
                    color: '#d32f2f', 
                    background: '#ffebee',
                    borderRadius: '4px',
                    marginBottom: '0.75rem'
                  }}>
                    Error loading {resourceType} filters: {filterErrors[resourceType]}
                  </div>
                ))}
              
              {/* Render resource sections for this UI section */}
              {sectionResources.map(resourceType => 
                renderResourceTypeSection(resourceType, availableFilters[resourceType] || [])
              )}
              
              {/* No filters available message */}
              {totalFilters === 0 && !sectionResources.some(resourceType => loadingFilters[resourceType]) && (
                <div style={{ 
                  padding: '1rem', 
                  textAlign: 'center', 
                  color: '#6b7280',
                  fontSize: '0.875rem'
                }}>
                  No {section.label.toLowerCase()} available. 
                  {section.description && <br />}{section.description}
                </div>
              )}
            </div>
          )}
        </div>
      );
    });
  };

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
                      checked={(stagedFilters.state || []).includes(option.value)}
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

  // Generic filter renderer - renders filters exactly as described by backend API
  const renderGenericFilter = (filter, resourceType) => {
    if (!filter || !filter.key) {
      console.warn('Invalid filter object:', filter);
      return null;
    }

    // Filter header with label and description
    const filterHeader = (
      <div style={{ 
        fontWeight: '500', 
        marginBottom: '0.5rem',
        color: '#4b5563',
        fontSize: '0.875rem'
      }}>
        {filter.label || filter.key}
        {filter.description && (
          <div style={{ 
            fontWeight: 'normal', 
            color: '#6b7280', 
            fontSize: '0.75rem',
            marginTop: '0.25rem' 
          }}>
            {filter.description}
          </div>
        )}
      </div>
    );

    // Render based on filter type from backend
    switch (filter.type) {
      case 'multi_select':
        return (
          <div>
            {filterHeader}
            <div className="options-list" style={{ 
              maxHeight: '200px', 
              overflowY: 'auto',
              border: filter.options && filter.options.length > 10 ? '1px solid #e5e7eb' : 'none',
              borderRadius: '4px',
              padding: filter.options && filter.options.length > 10 ? '0.5rem' : '0'
            }}>
              {filter.options && filter.options.map((option, optionIndex) => (
                <div key={optionIndex} className="filter-option">
                  <label className="filter-option-label">
                    <input 
                      type="checkbox" 
                      className="filter-checkbox"
                      checked={(stagedFilters[filter.key] || []).includes(option.value)}
                      onChange={(e) => handleFilterChange(filter.key, option.value, e.target.checked)}
                    />
                    <span className="filter-option-text">
                      {option.label || option.value}
                      {option.count !== undefined && (
                        <span className="option-count">({option.count})</span>
                      )}
                    </span>
                  </label>
                </div>
              ))}
              {(!filter.options || filter.options.length === 0) && (
                <div style={{ 
                  color: '#6b7280', 
                  fontSize: '0.875rem', 
                  fontStyle: 'italic',
                  padding: '0.5rem 0'
                }}>
                  No options available
                </div>
              )}
            </div>
          </div>
        );

      case 'range_select':
        return (
          <div>
            {filterHeader}
            <div style={{ 
              fontSize: '0.875rem',
              color: '#6b7280',
              padding: '0.5rem 0'
            }}>
              Range filter UI not implemented yet
              {filter.min_value !== undefined && filter.max_value !== undefined && (
                <div>Range: {filter.min_value} - {filter.max_value}</div>
              )}
            </div>
          </div>
        );


      case 'date_range':
        return (
          <div>
            {filterHeader}
            <div style={{ 
              fontSize: '0.875rem',
              color: '#6b7280',
              padding: '0.5rem 0'
            }}>
              Date range filter UI not implemented yet
              {filter.min_date && filter.max_date && (
                <div>Date range: {new Date(filter.min_date).toLocaleDateString()} - {new Date(filter.max_date).toLocaleDateString()}</div>
              )}
            </div>
          </div>
        );


      default:
        // Fallback: treat unknown types as multi_select if they have options
        if (filter.options && Array.isArray(filter.options)) {
          console.warn(`Unknown filter type '${filter.type}', treating as multi_select`);
          return renderGenericFilter({ ...filter, type: 'multi_select' }, resourceType);
        } else {
          return (
            <div>
              {filterHeader}
              <div style={{ 
                fontSize: '0.875rem',
                color: '#dc2626',
                padding: '0.5rem 0'
              }}>
                Unknown filter type: {filter.type || 'undefined'}
              </div>
            </div>
          );
        }
    }
  };

  // Hierarchical Resource filters - organized by resource type and category
  const renderResourceFilters = () => {
    const totalFilters = Object.values(availableFilters).reduce((sum, filters) => sum + filters.length, 0);
    
    // Count active filters using actual filter keys from backend
    const backendFilterKeys = new Set();
    Object.values(availableFilters).forEach(filters => {
      filters.forEach(filter => {
        if (filter.key) {
          backendFilterKeys.add(filter.key);
        }
      });
    });
    
    const totalActiveFilters = Object.keys(stagedFilters).filter(key => 
      backendFilterKeys.has(key)
    ).length;

    return (
      <div className="filter-category">
        <div 
          className="category-header"
          onClick={() => toggleSection('resource_filters')}
        >
          <span>
            Medical Resource Filters
            {totalActiveFilters > 0 && (
              <span style={{
                marginLeft: '8px',
                background: '#dc3545',
                color: 'white',
                borderRadius: '50%',
                padding: '2px 6px',
                fontSize: '0.7rem'
              }}>
                {totalActiveFilters}
              </span>
            )}
          </span>
          <span className={`arrow ${expandedSections.resource_filters ? 'expanded' : ''}`}>▼</span>
        </div>
        
        {expandedSections.resource_filters && (
          <div className="category-options">
            {/* Loading states */}
            {Object.values(loadingFilters).some(loading => loading) && (
              <div style={{ 
                padding: '0.5rem', 
                fontSize: '0.75rem', 
                color: '#1976d2', 
                background: '#e3f2fd',
                borderRadius: '4px',
                marginBottom: '0.75rem',
                textAlign: 'center'
              }}>
                🔄 Loading filters...
              </div>
            )}
            
            {/* Error states */}
            {Object.entries(filterErrors).filter(([, error]) => error).map(([resourceType, error]) => (
              <div key={resourceType} style={{ 
                padding: '0.5rem', 
                fontSize: '0.75rem', 
                color: '#d32f2f', 
                background: '#ffebee',
                borderRadius: '4px',
                marginBottom: '0.75rem'
              }}>
                 Error loading {resourceType} filters: {error}
              </div>
            ))}
            
            {/* Render hierarchical filters by resource type */}
            {renderHierarchicalResourceFilters()}
            
            {/* No filters available message */}
            {totalFilters === 0 && !Object.values(loadingFilters).some(loading => loading) && (
              <div style={{ 
                padding: '1rem', 
                textAlign: 'center', 
                color: '#6b7280',
                fontSize: '0.875rem'
              }}>
                No filters available. Select resource types to see available filters.
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render hierarchical resource filters organized by resource type - now with lazy loading
  const renderHierarchicalResourceFilters = () => {
    // Use filterTargets to show all available resource types, not just loaded ones
    if (!filterTargets || !filterTargets.resource_types) {
      return null;
    }

    return filterTargets.resource_types.map(resourceType => 
      renderResourceTypeSection(resourceType, availableFilters[resourceType] || [])
    );
  };

  // Render individual resource type section - now with lazy loading support
  const renderResourceTypeSection = (resourceType, filters) => {
    const resourceSectionKey = `resource_${resourceType.toLowerCase()}`;
    const resourceActiveFilters = filters.filter(filter => 
      stagedFilters[filter.key] && stagedFilters[filter.key].length > 0
    ).length;
    const isExpanded = expandedSections[resourceSectionKey];
    const isLoading = loadingFilters[resourceType];
    const hasError = filterErrors[resourceType];

    // Handle lazy loading when section is expanded
    const handleResourceToggle = () => {
      const wasExpanded = expandedSections[resourceSectionKey];
      
      // Toggle the section first
      toggleSection(resourceSectionKey);
      
      // If we're expanding and don't have filters yet, fetch them
      if (!wasExpanded && filters.length === 0 && !isLoading && !hasError) {
        fetchAvailableFilters(resourceType);
      }
    };

    return (
      <div key={resourceType} className="filter-subcategory">
        <div 
          className="subcategory-header"
          onClick={handleResourceToggle}
        >
          <span>
            {resourceType}
            {resourceActiveFilters > 0 && (
              <span style={{
                marginLeft: '8px',
                background: '#28a745',
                color: 'white',
                borderRadius: '50%',
                padding: '2px 6px',
                fontSize: '0.65rem'
              }}>
                {resourceActiveFilters}
              </span>
            )}
          </span>
          <span className={`arrow ${isExpanded ? 'expanded' : ''}`}>▼</span>
        </div>
        
        {isExpanded && (
          <div className="subcategory-options">
            {isLoading && (
              <div style={{ 
                padding: '0.75rem', 
                fontSize: '0.75rem', 
                color: '#1976d2', 
                background: '#e3f2fd',
                borderRadius: '4px',
                marginBottom: '0.5rem',
                textAlign: 'center'
              }}>
                🔄 Loading {resourceType} filters...
              </div>
            )}
            
            {hasError && (
              <div style={{ 
                padding: '0.75rem', 
                fontSize: '0.75rem', 
                color: '#d32f2f', 
                background: '#ffebee',
                borderRadius: '4px',
                marginBottom: '0.5rem'
              }}>
                ❌ Error loading {resourceType} filters: {hasError}
              </div>
            )}
            
            {!isLoading && !hasError && filters.length === 0 && (
              <div style={{ 
                padding: '0.75rem', 
                fontSize: '0.75rem', 
                color: '#6b7280',
                textAlign: 'center'
              }}>
                No filters available for {resourceType}
              </div>
            )}
            
            {filters.map((filter, index) => (
              <div key={`${resourceType}-${filter.key}`} className="filter-item">
                {renderGenericFilter(filter, resourceType)}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Generic dynamic filter renderer
  const renderDynamicFilter = (filterKey, filterConfig) => {
    if (!filterConfig || !filterConfig.options || filterConfig.options.length === 0) return null;

    return (
      <div key={filterKey} className="filter-category">
        <div 
          className="category-header"
          onClick={() => toggleSection(filterKey)}
        >
          <span>
            {filterConfig.label}
            {(stagedFilters[filterKey]?.length > 0 || activeFilters[filterKey]?.length > 0) && (
              <span style={{
                marginLeft: '8px',
                background: '#dc3545',
                color: 'white',
                borderRadius: '50%',
                padding: '2px 6px',
                fontSize: '0.7rem'
              }}>
                {(stagedFilters[filterKey] || activeFilters[filterKey] || []).length}
              </span>
            )}
          </span>
          <span className={`arrow ${expandedSections[filterKey] ? 'expanded' : ''}`}>▼</span>
        </div>
        
        {expandedSections[filterKey] && (
          <div className="category-options">
            <div className="options-list">
              {filterConfig.options.map((option, index) => (
                <div key={index} className="filter-option">
                  <label className="filter-option-label">
                    <input 
                      type="checkbox" 
                      className="filter-checkbox"
                      checked={(stagedFilters[filterKey] || []).includes(option.value)}
                      onChange={(e) => handleFilterChange(filterKey, option.value, e.target.checked)}
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

  
  if (!isOpen) {
    return null;
  }
  

  return (
    <>
      <div className={`sidebar-overlay show`} onClick={onClose}></div>
      
      <div className={`sidebar sidebar-open`}>
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

          {renderConfigDrivenSections()}
          {renderStateFilter()}
          
          
          {/* Dynamic Filters Section */}
          {Object.entries(discoverDynamicFilters).map(([filterKey, filterConfig]) => 
            renderDynamicFilter(filterKey, filterConfig)
          )}

          {patients.length === 0 && (
            <div style={{
              padding: '2rem 1.5rem',
              textAlign: 'center',
              color: '#6b7280',
              fontStyle: 'italic'
            }}>
              <h4 style={{ color: '#374151', marginBottom: '1rem' }}>No Filters Available</h4>
              <p style={{ margin: '0.5rem 0' }}>
                Load patient data first to see available filters.
              </p>
              <p style={{ margin: '0.5rem 0', fontSize: '0.875rem' }}>
                Filters will include: Gender, Location, and more based on your data.
              </p>
            </div>
          )}
          

          {/* Apply/Reset Filters Buttons */}
          {patients.length > 0 && (
            <div style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid #e0e0e0',
              marginTop: 'auto',
              display: 'flex',
              gap: '8px',
              flexDirection: 'column'
            }}>
              <button
                onClick={applyFilters}
                disabled={!hasPendingChanges()}
                style={{
                  width: '100%',
                  background: hasPendingChanges() ? '#007bff' : '#6c757d',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1rem',
                  borderRadius: '6px',
                  cursor: hasPendingChanges() ? 'pointer' : 'not-allowed',
                  fontSize: '0.9rem',
                  fontWeight: '500',
                  opacity: hasPendingChanges() ? 1 : 0.6
                }}
              >
                Apply Filters
                {hasPendingChanges() && (
                  <span style={{ marginLeft: '8px', fontSize: '0.8rem' }}>
                    ({Object.keys(stagedFilters).length} pending)
                  </span>
                )}
              </button>
              
              {hasPendingChanges() && (
                <button
                  onClick={resetStagedFilters}
                  style={{
                    width: '100%',
                    background: 'transparent',
                    color: '#6c757d',
                    border: '1px solid #6c757d',
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Reset Changes
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default DynamicFilterSidebar;