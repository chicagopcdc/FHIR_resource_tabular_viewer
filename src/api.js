// src/api.js - Complete FHIR Resource Gateway with Performance Optimization
// This is the ONLY file that makes API calls - everything else imports from here

const API_BASE = 'http://localhost:8000';
const DEFAULT_TIMEOUT = 30000; // 30 seconds for better performance
const MAX_RETRIES = 2; // Reduced retries for faster response

/**
 * Enhanced fetch with timeout, retry, and error handling
 */
async function safeFetch(url, options = {}) {
  let lastErr;

  for (let i = 0; i < MAX_RETRIES; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.message || errorData.detail || `HTTP ${response.status}`;
        } catch {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      lastErr = error.name === 'AbortError' 
        ? new Error('Request timed out - please try again') 
        : error;

      if (i < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, 200)); // Shorter delay
      }
    }
  }

  throw lastErr;
}

/**
 * Normalize response data from different server formats
 */
function normalizeResponse(data) {
  // Handle backend wrapper format
  if (data && typeof data === 'object' && 'success' in data) {
    return {
      success: data.success,
      data: Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []),
      pagination: data.pagination || {},
      message: data.message,
      resourceType: data.resource_type,
    };
  }

  // Handle raw FHIR Bundle
  if (data && data.resourceType === 'Bundle') {
    const entries = data.entry || [];
    const resources = entries.map((entry) => entry.resource || entry).filter(Boolean);

    return {
      success: true,
      data: resources,
      pagination: {
        total: data.total,
        count: resources.length,
        has_next: data.link?.some((link) => link.relation === 'next') || false,
      },
    };
  }

  // Handle array response
  if (Array.isArray(data)) {
    return {
      success: true,
      data: data,
      pagination: { count: data.length, has_next: false },
    };
  }

  // Handle single resource
  if (data && typeof data === 'object') {
    return {
      success: true,
      data: [data],
      pagination: { count: 1, has_next: false },
    };
  }

  return {
    success: false,
    data: [],
    pagination: {},
    message: 'Unknown response format',
  };
}

// =============================================================================
// CORE API FUNCTIONS - FULLY DYNAMIC
// =============================================================================

/**
 * Get all available resource types from FHIR server dynamically
 */
export async function listResourceTypes() {
  try {
    const response = await safeFetch('/api/resources');

    if (response.success && Array.isArray(response.data)) {
      return response.data;
    }

    console.warn('Unexpected response format for resource types:', response);
    return [];
  } catch (error) {
    console.error('Failed to load resource types:', error);
    return [];
  }
}

/**
 * Get dynamic schema for any resource type
 */
export async function getResourceSchema(resourceType, sampleSize = 20) {
  try {
    const response = await safeFetch(
      `/api/resources/${resourceType}/schema?sample_size=${sampleSize}`
    );

    if (response.success && response.schema) {
      return response.schema.columns || [];
    }

    console.warn(`No schema available for ${resourceType}:`, response);
    return [];
  } catch (error) {
    console.error(`Failed to get schema for ${resourceType}:`, error);
    return [];
  }
}

/**
 * Fetch resources with dynamic parameters and optimized pagination
 */
export async function fetchResources(resourceType, params = {}) {
  try {
    const searchParams = new URLSearchParams();

    // Add all parameters dynamically
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        searchParams.append(key, value.toString());
      }
    });

    const url = `/api/resources/${resourceType}${
      searchParams.toString() ? '?' + searchParams.toString() : ''
    }`;
    
    const response = await safeFetch(url);
    return normalizeResponse(response);
  } catch (error) {
    console.error(`Failed to fetch ${resourceType}:`, error);
    return {
      success: false,
      data: [],
      pagination: {},
      message: error.message,
    };
  }
}

/**
 * Follow pagination links efficiently
 */
export async function followPage(resourceType, pageUrl) {
  try {
    const encodedUrl = encodeURIComponent(pageUrl);
    const response = await safeFetch(
      `/api/resources/${resourceType}/page?page_url=${encodedUrl}`
    );

    return normalizeResponse(response);
  } catch (error) {
    console.error('Failed to follow page link:', error);
    return {
      success: false,
      data: [],
      pagination: {},
      message: error.message,
    };
  }
}

/**
 * Get single resource by ID
 */
export async function getById(resourceType, id) {
  try {
    const response = await safeFetch(`/api/resources/${resourceType}/${id}`);

    if (response.success && response.data) {
      return response.data;
    }

    return null;
  } catch (error) {
    console.error(`Failed to get ${resourceType}/${id}:`, error);
    return null;
  }
}

/**
 * CRITICAL: Get single resource by ID with detailed field separation (for Patient details)
 */
export async function getByIdDetailed(resourceType, id) {
  try {
    console.log(`Fetching detailed ${resourceType} with ID: ${id}`);
    const response = await safeFetch(`/api/resources/${resourceType}/${id}/detailed`);

    console.log('Detailed response received:', response);

    if (response.success) {
      return {
        success: true,
        fixed: response.fixed || {},
        dynamic: response.dynamic || {},
        all: response.all || null,
        resourceType: response.resource_type || resourceType,
      };
    }

    return {
      success: false,
      message: response.message || 'Resource not found',
      fixed: {},
      dynamic: {},
      all: null,
    };
  } catch (error) {
    console.error(`Failed to get detailed ${resourceType}/${id}:`, error);
    return {
      success: false,
      message: error.message,
      fixed: {},
      dynamic: {},
      all: null,
    };
  }
}

// =============================================================================
// PATIENT-SPECIFIC FUNCTIONS WITH PERFORMANCE OPTIMIZATION
// =============================================================================

/**
 * Load patients with optimized pagination
 */
export async function loadPatients(params = {}) {
  return await fetchResources('Patient', params);
}

/**
 * CRITICAL: Load detailed patient information with all related resources
 */
export async function loadPatientDetailed(patientId) {
  try {
    console.log('Loading patient detailed for ID:', patientId);
    
    // Get patient detailed data first
    const patientResponse = await getByIdDetailed('Patient', patientId);

    if (!patientResponse.success) {
      throw new Error(patientResponse.message || 'Patient not found');
    }

    console.log('Patient data loaded, fetching related resources...');

    // Load all related resources in parallel with proper filters
    const resourcePromises = [
      fetchResources('Observation', { subject: `Patient/${patientId}`, _count: 100 }),
      fetchResources('Condition', { subject: `Patient/${patientId}`, _count: 50 }),
      fetchResources('Procedure', { subject: `Patient/${patientId}`, _count: 50 }),
      fetchResources('MedicationRequest', { subject: `Patient/${patientId}`, _count: 50 }),
      fetchResources('Encounter', { subject: `Patient/${patientId}`, _count: 50 }),
      fetchResources('DiagnosticReport', { subject: `Patient/${patientId}`, _count: 50 }),
      fetchResources('DocumentReference', { subject: `Patient/${patientId}`, _count: 50 }),
      fetchResources('CareTeam', { subject: `Patient/${patientId}`, _count: 20 }),
      fetchResources('AllergyIntolerance', { patient: `Patient/${patientId}`, _count: 20 }),
      fetchResources('Immunization', { patient: `Patient/${patientId}`, _count: 50 }),
    ];

    const results = await Promise.allSettled(resourcePromises);

    // Extract results safely
    const [
      observations,
      conditions,
      procedures,
      medications,
      encounters,
      diagnosticReports,
      documentReferences,
      careTeam,
      allergies,
      immunizations,
    ] = results.map(result => 
      result.status === 'fulfilled' && result.value.success 
        ? result.value.data 
        : []
    );

    console.log('All resources loaded successfully');

    return {
      success: true,
      patient: patientResponse.all,
      patientFixed: patientResponse.fixed,
      patientDynamic: patientResponse.dynamic,
      observations,
      conditions,
      procedures,
      medications,
      encounters,
      diagnosticReports,
      documentReferences,
      careTeam,
      allergies,
      immunizations,
    };
  } catch (error) {
    console.error('Failed to load detailed patient:', error);
    return {
      success: false,
      message: error.message,
      patient: null,
      patientFixed: {},
      patientDynamic: {},
      observations: [],
      conditions: [],
      procedures: [],
      medications: [],
      encounters: [],
      diagnosticReports: [],
      documentReferences: [],
      careTeam: [],
      allergies: [],
      immunizations: [],
    };
  }
}

// Legacy support
export async function loadPatientDetails(patientId) {
  return await loadPatientDetailed(patientId);
}

// =============================================================================
// UTILITY FUNCTIONS FOR DATA PROCESSING
// =============================================================================

/**
 * Flatten FHIR resource to dotted keys for table display
 */
export function flattenResource(resource, maxDepth = 3) {
  const flattened = {};

  function flatten(obj, prefix = '', depth = 0) {
    if (depth > maxDepth || !obj || typeof obj !== 'object') {
      return;
    }

    if (Array.isArray(obj)) {
      if (obj.length > 0) {
        if (typeof obj[0] === 'string' || typeof obj[0] === 'number') {
          flattened[prefix] = obj.slice(0, 3).join(', ');
        } else {
          flattened[prefix] = JSON.stringify(obj);
        }
      }
      return;
    }

    Object.keys(obj).forEach((key) => {
      const newKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];

      if (value === null || value === undefined) {
        flattened[newKey] = '';
      } else if (typeof value === 'object') {
        flatten(value, newKey, depth + 1);
      } else {
        flattened[newKey] = value;
      }
    });
  }

  flatten(resource);
  return flattened;
}

/**
 * Get unified columns from resources for table display
 */
export function getUnifiedColumns(resources, priorityColumns = []) {
  if (!Array.isArray(resources) || resources.length === 0) {
    return [];
  }

  const allKeys = new Set();

  resources.forEach((resource) => {
    const flattened = flattenResource(resource);
    Object.keys(flattened).forEach((key) => allKeys.add(key));
  });

  const keyList = Array.from(allKeys);
  const prioritized = [];
  
  priorityColumns.forEach((col) => {
    if (keyList.includes(col)) {
      prioritized.push(col);
    }
  });

  keyList.forEach((key) => {
    if (!prioritized.includes(key)) {
      prioritized.push(key);
    }
  });

  return prioritized;
}

/**
 * Safe value display with null handling
 */
export function displayValue(value, fallback = 'N/A') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

/**
 * Format date safely
 */
export function formatDate(dateString) {
  if (!dateString) return 'N/A';

  try {
    return new Date(dateString).toLocaleDateString();
  } catch {
    return dateString;
  }
}