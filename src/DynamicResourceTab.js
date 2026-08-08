// DynamicResourceTab.js - Complete with dynamic column detection and schema-based rendering
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as api from './api';
import './PatientDetails.css';
import'./Dynamic.css';

const DynamicResourceTab = ({ 
  resourceType, 
  resourceLabel, 
  resourceData = [], 
  originalData = [], // This should be the unflattened server data
  schema = [],
  patientId, 
  onRemoveTab,
  onSort,
  sortConfig,
  filters,
  loading = false, // New loading prop
  error = null // New error prop
}) => {
  const [localLoading, setLocalLoading] = useState(false);
  const [data, setData] = useState([]); // Flattened data for display
  const [rawData, setRawData] = useState([]); // Original nested data for schema paths
  const [columns, setColumns] = useState([]);
  const [pathCache] = useState(() => new Map()); // Cache for path extractions
  const [displayColumns, setDisplayColumns] = useState([]);
  const [initialized, setInitialized] = useState(false);

  // Reset component state only when patient changes (not when switching tabs)
  useEffect(() => {
    setInitialized(false);
    setData([]);
    setRawData([]);
    setColumns([]);
    setDisplayColumns([]);
    pathCache.clear(); // Clear path cache when patient changes
  }, [patientId]); // Removed resourceType dependency

  // Initialize or update when data props change
  useEffect(() => {
    const hasData = resourceData.length > 0 || originalData.length > 0;
    
    
    // Always update the data state with current props
    setData(resourceData);
    setRawData(originalData);
    
    // If not initialized or data changed significantly, reinitialize
    if (!initialized || 
        (data.length === 0 && resourceData.length > 0) ||
        (rawData.length === 0 && originalData.length > 0)) {
      
      // Fast path for empty data - no need to process columns
      if (!hasData) {
        setColumns([]);
        setDisplayColumns([]);
        setInitialized(true);
        return;
      }
      
      // Only process columns if we have data
      
      if (schema && schema.length > 0) {
        setupColumnsFromMetadata();
      } else {
        detectColumns();
      }
      
      setInitialized(true);
    }
  }, [resourceData, originalData, schema]);

  // Helper function to render FHIR values properly for React with smart N/A detection
  const renderFhirValue = (value, fieldKey = '') => {
    if (value === null || value === undefined) {
      return <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>;
    }
    
    // Handle primitive values - these are real server data
    if (typeof value === 'string') {
      if (value.trim() === '') return <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>;
      return value;
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'boolean') {
      return <span style={{ 
        color: value ? '#28a745' : '#dc3545', 
        fontWeight: '500' 
      }}>
        {value ? 'Yes' : 'No'}
      </span>;
    }
    
    // Handle arrays - these contain real server data
    if (Array.isArray(value)) {
      if (value.length === 0) return <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>;
      
      // For arrays of primitives, join them
      if (value.length > 0 && (typeof value[0] === 'string' || typeof value[0] === 'number')) {
        const validValues = value.filter(v => v !== null && v !== undefined && v !== '');
        if (validValues.length === 0) return <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>;
        return validValues.slice(0, 3).join(', ');
      }
      
      // For arrays of objects, find the first one with useful data
      for (const item of value) {
        const rendered = renderFhirValue(item, fieldKey);
        if (rendered && typeof rendered === 'string' && rendered !== '—') {
          return rendered;
        } else if (rendered && typeof rendered === 'object' && rendered.props && !rendered.props.children.includes('—')) {
          return rendered;
        }
      }
      return <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>;
    }
    
    // Handle objects with comprehensive field checking
    if (typeof value === 'object') {
      // Priority order for display fields
      const displayFields = ['display', 'text', 'name', 'title'];
      for (const field of displayFields) {
        if (value[field] && typeof value[field] === 'string' && value[field].trim() !== '') {
          return value[field];
        }
      }
      
      // Check for coding patterns
      if (value.code && typeof value.code === 'string' && value.code.trim() !== '') {
        return value.code;
      }
      
      // Handle quantity objects with units (must check BEFORE generic .value extraction)
      if (value.value !== undefined && value.unit) {
        return <span>
          <strong>{value.value}</strong> {value.unit}
        </span>;
      }
      
      // Handle quantity with comparator (e.g., "< 5 mg/dL")
      if (value.value !== undefined && value.comparator) {
        const unit = value.unit || value.code || '';
        return <span>
          <strong>{value.comparator} {value.value}</strong>{unit ? ` ${unit}` : ''}
        </span>;
      }
      
      // Handle quantity without unit but with code (e.g., "120 mm[Hg]")
      if (value.value !== undefined && value.code && !value.unit) {
        return <span>
          <strong>{value.value}</strong> {value.code}
        </span>;
      }
      
      // Handle nested values (generic .value extraction - must come AFTER quantity checks)
      if (value.value !== undefined) {
        return renderFhirValue(value.value, fieldKey);
      }
      
      // Handle references - format them nicely
      if (value.reference && typeof value.reference === 'string') {
        return <span style={{ 
          fontFamily: 'monospace', 
          fontSize: '0.9em',
          color: '#0066cc'
        }}>
          {value.reference}
        </span>;
      }
      
      // Handle period objects
      if (value.start || value.end) {
        const start = value.start ? new Date(value.start).toLocaleDateString() : '';
        const end = value.end ? new Date(value.end).toLocaleDateString() : '';
        if (start && end) return `${start} - ${end}`;
        if (start) return `From ${start}`;
        if (end) return `Until ${end}`;
      }
      
      // Try nested coding arrays
      if (value.coding && Array.isArray(value.coding)) {
        return renderFhirValue(value.coding, fieldKey);
      }
      
      // Show compact JSON for small objects, truncate large ones
      try {
        const jsonStr = JSON.stringify(value);
        if (jsonStr.length <= 30) {
          return <span style={{ 
            fontFamily: 'monospace', 
            fontSize: '0.8em',
            color: '#666'
          }}>
            {jsonStr}
          </span>;
        }
        return <span style={{ 
          fontFamily: 'monospace', 
          fontSize: '0.8em',
          color: '#666',
          cursor: 'help'
        }} title={jsonStr}>
          {jsonStr.substring(0, 27)}...
        </span>;
      } catch {
        return <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>;
      }
    }
    
    return <span style={{ color: '#999', fontStyle: 'italic' }}>—</span>;
  };

  // Hybrid path extraction: tries multiple strategies for best data coverage
  const extractValueByPath = useCallback((obj, path) => {
    if (!obj || !path) return null;
    
    // Create cache key - use object ID if available, otherwise stringify (expensive but necessary)
    const objId = obj.id || JSON.stringify(obj).slice(0, 50);
    const cacheKey = `${objId}_${path}`;
    
    // Check cache first
    if (pathCache.has(cacheKey)) {
      return pathCache.get(cacheKey);
    }
    
    try {
      let result = null;
      
      // Strategy 1: Try the exact path as provided
      if (path.includes('[*]')) {
        result = extractWithWildcard(obj, path);
      } else {
        result = extractRegularPath(obj, path);
      }
      
      // Strategy 2: If no result and path contains array indices, try wildcard version
      if (result === null && /\[\d+\]/.test(path)) {
        const wildcardPath = path.replace(/\[\d+\]/g, '[*]');
        result = extractWithWildcard(obj, wildcardPath);
      }
      
      // Strategy 3: If no result and path contains wildcards, try first index
      if (result === null && path.includes('[*]')) {
        const indexedPath = path.replace(/\[\*\]/g, '[0]');
        result = extractRegularPath(obj, indexedPath);
      }
      
      // Strategy 4: For array-like paths, try without any brackets
      if (result === null && /\[[\d\*]+\]/.test(path)) {
        const noBracketsPath = path.replace(/\[[\d\*]+\]/g, '');
        result = extractRegularPath(obj, noBracketsPath);
      }
      
      // Cache the result
      pathCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.warn(`Error extracting path "${path}" from object:`, error);
      pathCache.set(cacheKey, null);
      return null;
    }
  }, [pathCache]);

  // Regular path extraction helper
  const extractRegularPath = useCallback((obj, path) => {
    if (!obj || !path) return null;
    
    try {
      const parts = path.split(/[.\[\]]+/).filter(Boolean);
      let current = obj;
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        
        if (current === null || current === undefined) {
          return null;
        }
        
        // Handle array indices
        const arrayIndex = parseInt(part, 10);
        if (!isNaN(arrayIndex)) {
          if (Array.isArray(current) && current[arrayIndex] !== undefined) {
            current = current[arrayIndex];
          } else {
            return null;
          }
        } else {
          if (typeof current === 'object' && current.hasOwnProperty(part)) {
            current = current[part];
          } else {
            return null;
          }
        }
      }
      
      return current;
    } catch (error) {
      return null;
    }
  }, []);

  // Wildcard array extraction helper
  const extractWithWildcard = useCallback((obj, path) => {
    try {
      // Split path by [*] to handle multiple wildcards
      const segments = path.split('[*]');
      const basePath = segments[0]; // e.g., "code.coding"
      const afterPath = segments[1]; // e.g., ".display"
      
      // Navigate to the array
      let current = obj;
      if (basePath) {
        const baseParts = basePath.split('.').filter(Boolean);
        for (const part of baseParts) {
          if (current && typeof current === 'object' && current.hasOwnProperty(part)) {
            current = current[part];
          } else {
            return null;
          }
        }
      }
      
      // If current is not an array, return null
      if (!Array.isArray(current)) {
        return null;
      }
      
      // Extract values from array elements
      const results = [];
      for (const item of current) {
        if (item === null || item === undefined) continue;
        
        if (afterPath && afterPath.startsWith('.')) {
          // Navigate deeper into each array item
          const subPath = afterPath.substring(1); // Remove leading dot
          const subParts = subPath.split('.').filter(Boolean);
          let subCurrent = item;
          
          for (const subPart of subParts) {
            if (subCurrent && typeof subCurrent === 'object' && subCurrent.hasOwnProperty(subPart)) {
              subCurrent = subCurrent[subPart];
            } else {
              subCurrent = null;
              break;
            }
          }
          
          if (subCurrent !== null && subCurrent !== undefined) {
            results.push(subCurrent);
          }
        } else {
          // No further path, use the array item directly
          if (item !== null && item !== undefined) {
            results.push(item);
          }
        }
      }
      
      // Return first non-null result, or join multiple results
      if (results.length === 0) {
        return null;
      } else if (results.length === 1) {
        return results[0];
      } else {
        // Multiple values found - join them or return array based on content
        const allStrings = results.every(r => typeof r === 'string');
        if (allStrings) {
          return results.join(', '); // Join string values
        } else {
          return results[0]; // Return first non-string value
        }
      }
      
    } catch (error) {
      console.warn(`Error in wildcard extraction for path "${path}":`, error);
      return null;
    }
  }, []);

  // Format column labels to be human readable and meaningful
  const formatColumnLabel = useCallback((key) => {
    // Handle common FHIR patterns for better readability
    let formatted = key
      .replace(/\[(\d+)\]/g, '') // Remove array indices like [0], [1]
      .replace(/\.coding\./g, ' ') // Replace .coding. with space
      .replace(/\.coding$/g, '') // Remove trailing .coding
      .replace(/([A-Z])/g, ' $1') // Add space before capitals
      .replace(/_/g, ' ') // Replace underscores with spaces
      .replace(/\./g, ' ') // Replace dots with spaces
      .trim();
    
    // Smart replacements for common FHIR terms
    const replacements = {
      'resource type': 'Type',
      'meta version id': 'Version',
      'meta last updated': 'Last Updated', 
      'meta source': 'Source',
      'clinical status': 'Status',
      'verification status': 'Verification',
      'onset date time': 'Onset Date',
      'onset period start': 'Onset Start',
      'onset period end': 'Onset End',
      'recorded date': 'Recorded',
      'abatement date time': 'Resolved Date',
      'abatement string': 'Resolution',
      'subject reference': 'Patient',
      'subject display': 'Patient Name',
      'subject type': 'Subject Type',
      'encounter reference': 'Visit',
      'asserter reference': 'Reported By',
      'recorder reference': 'Recorded By',
      'body site': 'Location',
      'code text': 'Description',
      'code display': 'Name',
      'code system': 'Code System',
      'severity': 'Severity',
      'category': 'Category',
      'text div': 'Notes'
    };
    
    // Apply smart replacements
    const lowerFormatted = formatted.toLowerCase();
    for (const [pattern, replacement] of Object.entries(replacements)) {
      if (lowerFormatted.includes(pattern)) {
        formatted = replacement;
        break;
      }
    }
    
    // If no replacement found, do standard formatting
    if (formatted === key || formatted.toLowerCase() === lowerFormatted) {
      formatted = formatted
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
    }
    
    return formatted.trim();
  }, []);

  // Dynamic field importance calculation based on actual data characteristics
  const calculateFieldImportance = useCallback((fieldKey, dataPresence, sampleValues, dataType) => {
    let importance = 0;
    const key = fieldKey.toLowerCase();
    
    // Base importance on data presence (0-40 points)
    importance += dataPresence * 40;
    
    // Bonus for essential FHIR fields (detected dynamically)
    if (key === 'id' || key === 'resourcetype') importance += 60;
    else if (key.includes('status') && dataPresence > 0.5) importance += 50;
    else if (key.includes('code') && dataPresence > 0.3) importance += 40;
    
    // Bonus for fields with meaningful content (not just IDs/references)
    if (sampleValues && sampleValues.length > 0) {
      const hasRichContent = sampleValues.some(val => 
        typeof val === 'string' && val.length > 5 && !val.match(/^[a-f0-9-]+$/i)
      );
      if (hasRichContent) importance += 20;
    }
    
    // Bonus for date fields that actually contain dates
    if ((key.includes('date') || key.includes('time')) && dataPresence > 0.2) {
      importance += 25;
    }
    
    // Bonus for display/text fields with actual content
    if ((key.includes('display') || key.includes('text') || key.includes('name')) && dataPresence > 0.3) {
      importance += 30;
    }
    
    // Penalty for very sparse data
    if (dataPresence < 0.1) importance *= 0.5;
    
    return Math.round(importance);
  }, []);

  // Dynamic field discovery from actual server data
  const discoverFields = useCallback((data) => {
    if (!data || data.length === 0) return [];
    
    const fieldStats = new Map();
    const sampleSize = Math.min(data.length, 20); // Analyze up to 20 records
    
    // Recursively discover all paths in the data
    const explorePath = (obj, basePath = '') => {
      if (!obj || typeof obj !== 'object') return;
      
      Object.keys(obj).forEach(key => {
        const fullPath = basePath ? `${basePath}.${key}` : key;
        const value = obj[key];
        
        if (value === null || value === undefined) return;
        
        // Initialize field stats
        if (!fieldStats.has(fullPath)) {
          fieldStats.set(fullPath, {
            path: fullPath,
            count: 0,
            sampleValues: [],
            dataTypes: new Set(),
            isArray: false,
            maxLength: 0
          });
        }
        
        const stats = fieldStats.get(fullPath);
        stats.count++;
        
        if (Array.isArray(value)) {
          stats.isArray = true;
          // Take first non-null item from array for analysis
          const firstItem = value.find(item => item !== null && item !== undefined);
          if (firstItem !== undefined) {
            stats.sampleValues.push(firstItem);
            stats.dataTypes.add(typeof firstItem);
            stats.maxLength = Math.max(stats.maxLength, String(firstItem).length);
            
            // If array contains objects, explore them too
            if (typeof firstItem === 'object') {
              explorePath(firstItem, `${fullPath}[0]`);
            }
          }
        } else if (typeof value === 'object') {
          // Explore nested objects
          explorePath(value, fullPath);
          stats.sampleValues.push('[Object]');
          stats.dataTypes.add('object');
        } else {
          // Primitive value
          stats.sampleValues.push(value);
          stats.dataTypes.add(typeof value);
          stats.maxLength = Math.max(stats.maxLength, String(value).length);
        }
      });
    };
    
    // Analyze sample data
    data.slice(0, sampleSize).forEach(item => {
      explorePath(item);
    });
    
    return Array.from(fieldStats.values())
      .filter(stats => stats.count > 0) // Only include fields that have data
      .sort((a, b) => b.count - a.count); // Sort by data presence
  }, []);

  // Memoized column definitions - show ALL schema columns like before
  const columnDefs = useMemo(() => {
    if (!schema || schema.length === 0) return [];

    return schema.map(schemaPath => {
      // Analyze sample data for this path to determine characteristics
      const dataToCheck = rawData.length > 0 ? rawData : resourceData;
      const sampleData = dataToCheck.slice(0, Math.min(10, dataToCheck.length));
      
      // Extract sample values to understand data type and content
      const sampleValues = sampleData
        .map(item => extractValueByPath(item, schemaPath))
        .filter(val => val !== null && val !== undefined && val !== '');
      
      // Determine data type from samples
      const dataType = sampleValues.length > 0 ? typeof sampleValues[0] : 'unknown';
      const isDateField = sampleValues.some(val => 
        typeof val === 'string' && !isNaN(Date.parse(val)) && (val.includes('-') || val.includes('T'))
      );
      const isNumericField = sampleValues.every(val => 
        typeof val === 'number' || (typeof val === 'string' && !isNaN(Number(val)))
      );
      const isReferenceField = sampleValues.some(val => 
        typeof val === 'string' && (val.includes('/') || val.startsWith('urn:'))
      );
      const isBooleanField = sampleValues.every(val => typeof val === 'boolean');
      
      // Calculate dynamic width based on actual content length
      const maxContentLength = sampleValues.reduce((max, val) => 
        Math.max(max, String(val || '').length), schemaPath.length
      );
      let width = `${Math.min(Math.max(maxContentLength * 8 + 20, 100), 300)}px`;
      
      // Smart rendering based on detected data characteristics
      let render = null;
      if (isDateField) {
        width = '140px';
        render = (value) => {
          if (!value) return renderFhirValue(value);
          try {
            return new Date(value).toLocaleDateString();
          } catch {
            return renderFhirValue(value);
          }
        };
      } else if (schemaPath.toLowerCase().includes('status')) {
        width = '120px';
        render = (value) => (
          <span className={`status ${String(value || 'unknown').toLowerCase()}`}>
            {renderFhirValue(value)}
          </span>
        );
      } else if (schemaPath.toLowerCase().includes('id')) {
        width = '140px';
        render = (value) => (
          <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
            {renderFhirValue(value)}
          </span>
        );
      } else if (isReferenceField) {
        width = '200px';
        render = (value) => (
          <span style={{ 
            fontFamily: 'monospace', 
            fontSize: '0.8rem',
            color: '#007bff',
            wordBreak: 'break-all'
          }}>
            {renderFhirValue(value)}
          </span>
        );
      } else if (isNumericField) {
        width = '100px';
        render = (value) => (
          <span style={{ fontFamily: 'monospace', textAlign: 'right' }}>
            {renderFhirValue(value)}
          </span>
        );
      } else if (isBooleanField) {
        width = '80px';
        render = (value) => (
          <span style={{ 
            color: value ? '#28a745' : '#dc3545',
            fontWeight: '600'
          }}>
            {value ? 'Yes' : 'No'}
          </span>
        );
      }
      
      // Calculate data presence for this column
      const dataPresence = sampleValues.length / Math.max(sampleData.length, 1);
      
      return {
        key: schemaPath,
        label: formatColumnLabel(schemaPath),
        width,
        dataType,
        isDateField,
        isNumericField,
        isReferenceField,
        isBooleanField,
        sampleValues: sampleValues.slice(0, 3),
        dataPresence,
        sortable: false,
        render: render || ((value) => renderFhirValue(value)),
        fromMetadata: true
      };
    });
  }, [schema, rawData, resourceData, extractValueByPath, formatColumnLabel]);

  // Columns already have data presence calculated, just use them directly
  const columnsWithDataPresence = columnDefs;

  // Use metadata-driven column setup (preferred approach)
  const setupColumnsFromMetadata = () => {
    if (!schema || schema.length === 0) {
      setColumns([]);
      setDisplayColumns([]);
      return;
    }


    const hasData = (rawData.length > 0 || resourceData.length > 0);
    
    if (!hasData) {
      // No data available - show all available columns from schema
      setColumns(columnDefs);
      setDisplayColumns(columnDefs);
      return;
    }

    // Sort all columns by data presence and importance, but show them all
    const sortedColumns = columnsWithDataPresence
      .sort((a, b) => {
        // Calculate dynamic importance for each column
        const aImportance = calculateFieldImportance(a.key, a.dataPresence || 0, a.sampleValues, a.dataType);
        const bImportance = calculateFieldImportance(b.key, b.dataPresence || 0, b.sampleValues, b.dataType);
        
        // Sort by calculated dynamic importance
        return bImportance - aImportance;
      });


    setColumns(columnDefs);
    setDisplayColumns(sortedColumns);
  };

  // Auto-detect columns from actual data with intelligent prioritization (fallback)
  const detectColumns = () => {
    if (!resourceData.length) {
      setColumns([]);
      setDisplayColumns([]);
      return;
    }

    // Get all unique keys from the data
    const allKeys = new Set();
    const keyFrequency = {};
    const keyTypes = {};
    const sampleValues = {};

    resourceData.forEach(item => {
      Object.keys(item).forEach(key => {
        allKeys.add(key);
        keyFrequency[key] = (keyFrequency[key] || 0) + 1;
        
        // Track data types and sample values
        const value = item[key];
        if (value !== null && value !== undefined && value !== '') {
          if (!keyTypes[key]) {
            keyTypes[key] = typeof value;
            sampleValues[key] = value;
          }
        }
      });
    });

    // Create column definitions with smart prioritization
    const columnDefs = Array.from(allKeys).map(key => {
      const frequency = keyFrequency[key] / resourceData.length;
      const dataType = keyTypes[key] || 'string';
      
      // Determine column priority and configuration
      let priority = 0;
      let width = '150px';
      let render = null;

      // Dynamic priority calculation based on data characteristics
      priority = calculateFieldImportance(key, frequency, sampleValues[key] ? [sampleValues[key]] : [], dataType);

      // Configure rendering and width based on data type and content
      if (key.includes('date') || key.includes('Date') || key.includes('time')) {
        width = '130px';
        render = (value) => {
          if (!value) return 'N/A';
          try {
            return new Date(value).toLocaleDateString();
          } catch {
            return value;
          }
        };
      } else if (key === 'status') {
        width = '100px';
        render = (value) => (
          <span className={`status ${String(value || 'unknown').toLowerCase()}`}>
            {value || 'Unknown'}
          </span>
        );
      } else if (key.includes('id')) {
        width = '120px';
        render = (value) => (
          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
            {value || 'N/A'}
          </span>
        );
      } else if (dataType === 'boolean') {
        width = '80px';
        render = (value) => (
          <span style={{ 
            color: value ? '#28a745' : '#dc3545',
            fontWeight: '600'
          }}>
            {value ? 'Yes' : 'No'}
          </span>
        );
      } else if (dataType === 'number') {
        width = '100px';
        render = (value) => (
          <span style={{ fontFamily: 'monospace', textAlign: 'right' }}>
            {value !== null && value !== undefined ? value : 'N/A'}
          </span>
        );
      } else if (key.includes('url') || key.includes('reference')) {
        width = '200px';
        render = (value) => (
          <span style={{ 
            fontFamily: 'monospace', 
            fontSize: '0.8rem',
            color: '#007bff',
            wordBreak: 'break-all'
          }}>
            {value || 'N/A'}
          </span>
        );
      } else {
        // Default text rendering with smart width
        const maxLength = Math.max(
          key.length,
          ...resourceData.map(item => String(item[key] || '').length).slice(0, 10)
        );
        
        if (maxLength > 50) width = '300px';
        else if (maxLength > 30) width = '200px';
        else if (maxLength > 15) width = '150px';
        else width = '120px';
      }

      return {
        key,
        label: formatColumnLabel(key),
        priority,
        frequency,
        dataType,
        width,
        sortable: false,
        render: render || ((value) => renderFhirValue(value))
      };
    });

    // Sort by priority and show all columns
    const sortedColumns = columnDefs
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    setColumns(columnDefs);
    setDisplayColumns(sortedColumns);
  };


  // Removed sorting functionality for cleaner headers

  const getResourceIcon = (resourceType) => {
    // Dynamic icon generation based on resource type patterns
    const type = resourceType.toLowerCase();
    
    // Clinical data icons
    if (type.includes('condition') || type.includes('diagnosis')) return '🏥';
    if (type.includes('observation') || type.includes('vital')) return '📊';
    if (type.includes('procedure') || type.includes('surgery')) return '⚕️';
    if (type.includes('medication') || type.includes('drug')) return '💊';
    if (type.includes('immunization') || type.includes('vaccine')) return '💉';
    if (type.includes('allergy') || type.includes('intolerance')) return '⚠️';
    
    // People and organizations
    if (type.includes('patient') || type.includes('person')) return '👤';
    if (type.includes('practitioner') || type.includes('provider')) return '👨‍⚕️';
    if (type.includes('organization') || type.includes('facility')) return '🏢';
    if (type.includes('location') || type.includes('place')) return '📍';
    
    // Care management
    if (type.includes('care') && type.includes('plan')) return '📋';
    if (type.includes('care') && type.includes('team')) return '👥';
    if (type.includes('goal') || type.includes('target')) return '🎯';
    if (type.includes('encounter') || type.includes('visit')) return '📅';
    if (type.includes('appointment') || type.includes('schedule')) return '🗓️';
    
    // Documentation and media
    if (type.includes('document') || type.includes('reference')) return '📄';
    if (type.includes('diagnostic') && type.includes('report')) return '📋';
    if (type.includes('imaging') || type.includes('study')) return '🖼️';
    if (type.includes('media') || type.includes('photo')) return '📸';
    
    // Administrative
    if (type.includes('coverage') || type.includes('insurance')) return '🛡️';
    if (type.includes('account') || type.includes('billing')) return '💰';
    if (type.includes('device') || type.includes('equipment')) return '🔧';
    if (type.includes('family') || type.includes('history')) return '👨‍👩‍👧‍👦';
    if (type.includes('provenance') || type.includes('audit')) return '📜';
    
    // Requests and workflow
    if (type.includes('request') || type.includes('order')) return '📝';
    if (type.includes('task') || type.includes('workflow')) return '⚡';
    if (type.includes('communication') || type.includes('message')) return '💬';
    
    // Default for unknown types
    return '📋';
  };

  const getResourceDescription = (resourceType) => {
    // Dynamic description generation based on resource type patterns
    const type = resourceType.toLowerCase();
    
    // Clinical data patterns
    if (type.includes('condition') || type.includes('diagnosis')) return 'Medical conditions and diagnoses';
    if (type.includes('observation') || type.includes('vital')) return 'Clinical observations and measurements';
    if (type.includes('procedure') || type.includes('surgery')) return 'Medical procedures and interventions';
    if (type.includes('medication') || type.includes('drug')) return 'Medication prescriptions and therapy';
    if (type.includes('immunization') || type.includes('vaccine')) return 'Vaccination records and immunization';
    if (type.includes('allergy') || type.includes('intolerance')) return 'Allergies and adverse reactions';
    
    // Administrative patterns  
    if (type.includes('encounter') || type.includes('visit')) return 'Healthcare visits and encounters';
    if (type.includes('patient') || type.includes('person')) return 'Patient demographic information';
    if (type.includes('practitioner') || type.includes('provider')) return 'Healthcare providers and practitioners';
    if (type.includes('organization') || type.includes('facility')) return 'Healthcare organizations and facilities';
    if (type.includes('location') || type.includes('place')) return 'Healthcare locations and facilities';
    
    // Care management patterns
    if (type.includes('care') && type.includes('plan')) return 'Care plans and treatment programs';
    if (type.includes('care') && type.includes('team')) return 'Healthcare team members and coordination';
    if (type.includes('goal') || type.includes('target')) return 'Patient goals and treatment targets';
    if (type.includes('appointment') || type.includes('schedule')) return 'Scheduled appointments and bookings';
    
    // Documentation patterns
    if (type.includes('document') || type.includes('reference')) return 'Clinical documents and references';
    if (type.includes('diagnostic') && type.includes('report')) return 'Diagnostic test results and reports';
    if (type.includes('imaging') || type.includes('study')) return 'Medical imaging studies and scans';
    if (type.includes('media') || type.includes('photo')) return 'Photos, videos, and media attachments';
    
    // Administrative patterns
    if (type.includes('coverage') || type.includes('insurance')) return 'Insurance coverage and benefits';
    if (type.includes('account') || type.includes('billing')) return 'Billing and financial information';
    if (type.includes('device') || type.includes('equipment')) return 'Medical devices and equipment';
    if (type.includes('family') || type.includes('history')) return 'Family medical history records';
    if (type.includes('provenance') || type.includes('audit')) return 'Record provenance and audit trail';
    
    // Request/workflow patterns
    if (type.includes('request') || type.includes('order')) return 'Service and procedure requests';
    if (type.includes('task') || type.includes('workflow')) return 'Clinical tasks and workflow items';
    if (type.includes('communication') || type.includes('message')) return 'Clinical communications and messages';
    
    // Default for unknown types
    return `${resourceType} healthcare data from FHIR server`;
  };

  // Enhanced table rendering with dynamic columns
  const renderTable = () => {
    if (displayColumns.length === 0) {
      return (
        <div className="table-empty-state">
          <span className="empty-icon">{getResourceIcon(resourceType)}</span>
          <div className="empty-message">
            <strong>No Column Schema Available</strong>
            <p>Unable to detect columns for {resourceLabel.toLowerCase()} data</p>
          </div>
        </div>
      );
    }

    return (
      <div className="data-table">
        <div 
          className="table-wrapper" 
          style={{ 
            overflowX: 'auto', 
            overflowY: 'auto', 
            maxHeight: displayColumns.length > 15 ? '600px' : 'none',
            border: displayColumns.length > 15 ? '1px solid #dee2e6' : 'none'
          }}
        >
          <table 
            className="dynamic-resource-table"
            style={{
              minWidth: displayColumns.length > 10 ? `${displayColumns.length * 150}px` : '100%',
              tableLayout: 'fixed'
            }}
          >
            <thead>
              <tr>
                {displayColumns.map(column => (
                  <th 
                    key={column.key}
                    className="table-header"
                    style={{ width: column.width, minWidth: column.width }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(!data || data.length === 0) ? (
                <tr>
                  <td colSpan={displayColumns.length} className="empty-table-cell">
                    <div className="table-empty-state">
                      <span className="empty-icon" style={{ fontSize: '2rem', color: '#6c757d' }}>[{resourceType}]</span>
                      <div className="empty-message">
                        <strong>No {resourceLabel} Records</strong>
                        <p>This patient has no {resourceLabel.toLowerCase()} data available</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((item, index) => {
                  // For metadata columns, use original raw data; for flattened columns use transformed data
                  const rawItem = rawData[index] || item;
                  return (
                    <tr key={item.id || rawItem.id || index}>
                      {displayColumns.map(column => (
                        <td key={column.key} style={{ maxWidth: column.width }}>
                          <div style={{ 
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}>
                            {column.render 
                              ? column.render(
                                  column.fromMetadata 
                                    ? extractValueByPath(rawItem, column.key) 
                                    : item[column.key], 
                                  rawItem || item
                                ) 
                              : renderFhirValue(
                                  column.fromMetadata 
                                    ? extractValueByPath(rawItem, column.key) 
                                    : item[column.key]
                                )
                            }
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Column selector for user customization - Always visible at top
  const renderColumnSelector = () => {
    if (columns.length === 0) return null;

    return (
      <div style={{
        marginBottom: '1.5rem',
        padding: '1rem',
        background: '#f8f9fa',
        borderRadius: '8px',
        border: '1px solid #e9ecef'
      }}>
        <div style={{ 
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h3 style={{ margin: 0, fontWeight: '600', color: '#495057', fontSize: '1rem' }}>
              Column Selection ({displayColumns.length} of {columns.length} shown)
            </h3>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => setDisplayColumns(columns.slice(0, 8))}
              style={{
                padding: '0.25rem 0.75rem',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Key Fields
            </button>
            <button
              onClick={() => setDisplayColumns([])}
              style={{
                padding: '0.25rem 0.75rem',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Clear All
            </button>
          </div>
        </div>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
          gap: '0.5rem',
          maxHeight: '200px',
          overflowY: 'auto',
          padding: '0.5rem',
          border: '1px solid #dee2e6',
          borderRadius: '4px',
          backgroundColor: 'white'
        }}>
          {columns.map(column => (
            <label key={column.key} style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              fontSize: '0.85rem',
              padding: '0.25rem',
              borderRadius: '3px',
              cursor: 'pointer',
              backgroundColor: displayColumns.some(dc => dc.key === column.key) ? '#e3f2fd' : 'transparent'
            }}>
              <input
                type="checkbox"
                checked={displayColumns.some(dc => dc.key === column.key)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setDisplayColumns(prev => [...prev, column].sort((a, b) => b.priority - a.priority));
                  } else {
                    setDisplayColumns(prev => prev.filter(dc => dc.key !== column.key));
                  }
                }}
                style={{ marginRight: '0.25rem' }}
              />
              <span style={{ flex: 1, fontWeight: displayColumns.some(dc => dc.key === column.key) ? '600' : 'normal' }}>
                {column.label}
              </span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <div>Loading {resourceLabel.toLowerCase()}...</div>
      </div>
    );
  }

  // Show loading state only when we expect data to be loaded
  if (loading && (resourceData.length > 0 || originalData.length > 0 || !initialized)) {
    const loadingMessage = initialized 
      ? `Loading ${resourceType} data...` 
      : `Initializing ${resourceType} tab...`;
    
    return (
      <div className="dynamic-resource-tab">
        <div className="resource-header">
          <div className="resource-title">
            <div className="title-with-icon">
              <span className="resource-icon-large">{getResourceIcon(resourceType)}</span>
              <div className="title-content">
                <h2 className="resource-title-text">{resourceLabel}</h2>
                <p className="resource-subtitle">{loadingMessage}</p>
              </div>
            </div>
            <div className="resource-meta">
              <span className="resource-type-badge">{resourceType}</span>
            </div>
          </div>
          
          <div className="resource-actions">
            <button 
              className="remove-tab-action"
              onClick={onRemoveTab}
              title="Remove this tab"
            >
              <span>Remove Tab</span>
              <span className="remove-icon">×</span>
            </button>
          </div>
        </div>

        <div className="resource-content">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '300px',
            flexDirection: 'column',
            gap: '15px'
          }}>
            <div style={{ 
              fontSize: '18px', 
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <div className="loading-spinner">⟳</div>
              Loading...
            </div>
            <p style={{ color: '#6c757d', textAlign: 'center', margin: 0 }}>
              {initialized 
                ? `Fetching ${resourceType} records from FHIR server...` 
                : loadingMessage
              }
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  // Show loading state if tab is not yet initialized (first time setup)
  if (!initialized) {
    return (
      <div className="dynamic-resource-tab">
        <div className="resource-header">
          <div className="resource-title">
            <div className="title-with-icon">
              <span className="resource-icon-large">{getResourceIcon(resourceType)}</span>
              <div className="title-content">
                <h2 className="resource-title-text">{resourceLabel}</h2>
                <p className="resource-subtitle">Initializing {resourceType} tab...</p>
              </div>
            </div>
            <div className="resource-meta">
              <span className="resource-type-badge">{resourceType}</span>
            </div>
          </div>
          
          <div className="resource-actions">
            <button 
              className="remove-tab-action"
              onClick={onRemoveTab}
              title="Remove this tab"
            >
              <span>Remove Tab</span>
              <span className="remove-icon">×</span>
            </button>
          </div>
        </div>

        <div className="resource-content">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '300px',
            flexDirection: 'column',
            gap: '15px'
          }}>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>Loading...</div>
            <p>Initializing {resourceType} tab...</p>
          </div>
        </div>
      </div>
    );
  }
  
  // Show error state if there was an error loading data
  if (error) {
    return (
      <div className="dynamic-resource-tab">
        <div className="resource-header">
          <div className="resource-title">
            <div className="title-with-icon">
              <span className="resource-icon-large">{getResourceIcon(resourceType)}</span>
              <div className="title-content">
                <h2 className="resource-title-text">{resourceLabel}</h2>
                <p className="resource-subtitle">Error loading data</p>
              </div>
            </div>
            <div className="resource-meta">
              <span className="resource-type-badge">{resourceType}</span>
            </div>
          </div>
          
          <div className="resource-actions">
            <button 
              className="remove-tab-action"
              onClick={onRemoveTab}
              title="Remove this tab"
            >
              <span>Remove Tab</span>
              <span className="remove-icon">×</span>
            </button>
          </div>
        </div>

        <div className="resource-content">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '300px',
            flexDirection: 'column',
            gap: '15px',
            padding: '2rem',
            textAlign: 'center'
          }}>
            <span style={{ fontSize: '3rem', color: '#dc3545' }}>⚠</span>
            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#dc3545' }}>Failed to Load Data</h3>
              <p style={{ margin: 0, color: '#6c757d', fontSize: '0.9rem' }}>
                {error}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }
  
  // Show empty state - no data available and not loading
  if (initialized && !loading && (!data || data.length === 0) && (!rawData || rawData.length === 0) && (!resourceData || resourceData.length === 0) && (!originalData || originalData.length === 0)) {
    return (
      <div className="dynamic-resource-tab">
        <div className="resource-header">
          <div className="resource-title">
            <div className="title-with-icon">
              <span className="resource-icon-large">{getResourceIcon(resourceType)}</span>
              <div className="title-content">
                <h2 className="resource-title-text">{resourceLabel}</h2>
                <p className="resource-subtitle">{getResourceDescription(resourceType)}</p>
              </div>
            </div>
            <div className="resource-meta">
              <span className="resource-type-badge">{resourceType}</span>
            </div>
          </div>
          
          <div className="resource-actions">
            <button 
              className="remove-tab-action"
              onClick={onRemoveTab}
              title="Remove this tab"
            >
              <span>Remove Tab</span>
              <span className="remove-icon">×</span>
            </button>
          </div>
        </div>

        <div className="resource-content">
          <div className="table-empty-state" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '300px',
            flexDirection: 'column',
            gap: '15px',
            padding: '2rem',
            textAlign: 'center'
          }}>
            <span className="empty-icon" style={{ fontSize: '3rem', opacity: 0.5, color: '#6c757d' }}>
              [{resourceType}]
            </span>
            <div className="empty-message">
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#495057' }}>No {resourceLabel} Records</h3>
              <p style={{ margin: 0, color: '#6c757d', fontSize: '0.9rem' }}>
                This patient has no {resourceLabel.toLowerCase()} data available in their medical record.
              </p>
            </div>
          </div>
          
          {/* Data source info even for empty state */}
          <div className="data-source-info">
            <div className="source-item">
              <strong>Data Source:</strong> 
              <code>GET /api/resources/Patient/{patientId}/resources/{resourceType}</code>
            </div>
            <div className="source-item">
              <strong>Patient ID:</strong> 
              <span>{patientId}</span>
            </div>
            <div className="source-item">
              <strong>Resource Type:</strong> 
              <span>{resourceLabel}</span>
            </div>
            <div className="source-item">
              <strong>Records Found:</strong> 
              <span>0</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dynamic-resource-tab">
      <div className="resource-header">
        <div className="resource-title">
          <div className="title-with-icon">
            <span className="resource-icon-large">{getResourceIcon(resourceType)}</span>
            <div className="title-content">
              <h2 className="resource-title-text">{resourceLabel}</h2>
              <p className="resource-subtitle">{getResourceDescription(resourceType)}</p>
            </div>
          </div>
          <div className="resource-meta">
            <span className="resource-type-badge">{resourceType}</span>
          </div>
        </div>
        
        <div className="resource-actions">
          <button 
            className="remove-tab-action"
            onClick={onRemoveTab}
            title="Remove this tab"
          >
            <span>Remove Tab</span>
            <span className="remove-icon">×</span>
          </button>
        </div>
      </div>

      <div className="resource-content">
        

        {/* Column Customization - Now visible at top */}
        {renderColumnSelector()}

        {/* Enhanced Table with Auto-Detected Columns */}
        {renderTable()}

      </div>
    </div>
  );
};

export default DynamicResourceTab;