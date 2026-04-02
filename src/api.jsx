// src/api.js - Complete FHIR Resource Gateway with UTF-8 encoding and dynamic resource loading
import { CONFIG } from './config';
import * as aggregateApi from './services/aggregateApi';

const API_BASE = CONFIG.api.baseUrl + '/api';
const DEFAULT_TIMEOUT = CONFIG.api.timeout;
const MAX_RETRIES = CONFIG.api.maxRetries;

// Enhanced API functions for measurement filtering
export const get = safeFetch;

/**
 * Enhanced fetch with UTF-8 encoding, timeout, retry, and error handling
 */
async function safeFetch(url, options = {}) {
  let lastErr;
  const fullUrl = `${API_BASE}${url}`;

  console.log(`🌐 API Request: ${options.method || 'GET'} ${fullUrl}`);

  for (let i = 0; i < MAX_RETRIES; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    const startTime = Date.now();

    try {
      const response = await fetch(fullUrl, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Accept': 'application/fhir+json; charset=utf-8',
          'Accept-Charset': 'utf-8',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      console.log(`✅ API Response: ${response.status} ${response.statusText} (${duration}ms)`);

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
      const duration = Date.now() - startTime;
      
      if (error.name === 'AbortError') {
        console.log(`⏰ Request timed out after ${duration}ms (${DEFAULT_TIMEOUT / 1000}s limit)`);
        lastErr = new Error(`Request timed out after ${DEFAULT_TIMEOUT / 1000}s - backend server may be slow or unresponsive`);
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        console.log(`🔌 Connection failed: ${error.message}`);
        lastErr = new Error(`Cannot connect to backend server at ${API_BASE} - make sure it's running`);
      } else {
        console.log(`❌ Request failed: ${error.message} (${duration}ms)`);
        lastErr = error;
      }

      if (i < MAX_RETRIES - 1) {
        const delay = Math.min(1000 * Math.pow(2, i), 5000); // Exponential backoff, max 5s
        console.log(`🔄 Retrying in ${delay}ms (attempt ${i + 1}/${MAX_RETRIES})`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastErr;
}

/**
 * Normalize response data from different server formats
 */
function normalizeResponse(data) {
  if (data && typeof data === 'object' && 'success' in data) {
    return {
      success: data.success,
      data: Array.isArray(data.data) ? data.data : (data.data ? [data.data] : []),
      pagination: data.pagination || {},
      message: data.message,
      resourceType: data.resource_type,
      prioritized: data.prioritized || false,
      fetched_all: data.fetched_all || false  // ADD THIS LINE
    };
  }

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

  if (Array.isArray(data)) {
    return {
      success: true,
      data: data,
      pagination: { count: data.length, has_next: false },
    };
  }

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
// CORE API FUNCTIONS - ENHANCED WITH DYNAMIC RESOURCE SUPPORT
// =============================================================================


/**
 * NEW: Get patient-specific resources dynamically with caching
 */
export async function getPatientResources(patientId, resourceType, count = 50, page = 1, offset = 0) {
  try {
    // Check cache first
    const cacheKey = `Patient/${patientId}/resources/${resourceType}/page/${page}`;
    const resourceParams = { _count: count, page, _getpagesoffset: offset };
    const cachedResponse = requestCache.get(cacheKey, resourceParams);
    if (cachedResponse) {
      return cachedResponse;
    }

    const response = await safeFetch(
      `/resources/Patient/${patientId}/resources/${resourceType}?_count=${count}&page=${page}&_getpagesoffset=${offset}`
    );

    let normalizedResponse;
    if (response.success) {
      normalizedResponse = {
        success: true,
        data: response.data || [],
        resourceType: response.resource_type,
        patientId: response.patient_id,
        count: response.count || 0,
        pagination: response.pagination || {
          page: page,
          per_page: count,
          total: response.count || 0,
          has_next: false,
          has_prev: false
        }
      };
    } else {
      normalizedResponse = {
        success: false,
        data: [],
        resourceType: resourceType,
        patientId: patientId,
        count: 0,
        pagination: { page: page, per_page: count, total: 0, has_next: false, has_prev: false },
        message: response.message || "Failed to fetch resources"
      };
    }
    
    // Cache the response
    requestCache.set(cacheKey, normalizedResponse, resourceParams);
    return normalizedResponse;
  } catch (error) {
    console.error(`Error fetching ${resourceType} for patient ${patientId}:`, error);
    return {
      success: false,
      data: [],
      resourceType: resourceType,
      patientId: patientId,
      count: 0,
      pagination: { page: page, per_page: count, total: 0, has_next: false, has_prev: false },
      message: error.message
    };
  }
}

/**
 * Get all available resource types from FHIR server dynamically
 */
export async function listResourceTypes() {
  try {
    const response = await safeFetch('/resources');

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
 * Get dynamic schema for any resource type (legacy endpoint)
 * @deprecated Use getResourceSchema from metadata endpoints instead
 */
export async function getLegacyResourceSchema(resourceType, sampleSize = 20) {
  try {
    const response = await safeFetch(
      `/resources/${resourceType}/schema?sample_size=${sampleSize}`
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
 * Fetch resources with dynamic parameters, enhanced options, and caching
 */
export async function fetchResources(resourceType, params = {}) {
  try {
    // Check cache first
    const cacheKey = `resources/${resourceType}`;
    const cachedResponse = requestCache.get(cacheKey, params);
    if (cachedResponse) {
      return cachedResponse;
    }

    const searchParams = new URLSearchParams();

    // Add all parameters dynamically
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        searchParams.append(key, value.toString());
      }
    });

    const url = `/resources/${resourceType}${
      searchParams.toString() ? '?' + searchParams.toString() : ''
    }`;
    
    const response = await safeFetch(url);
    const normalizedResponse = normalizeResponse(response);
    
    // Cache successful responses
    if (normalizedResponse.success) {
      requestCache.set(cacheKey, params, normalizedResponse);
    }
    
    return normalizedResponse;
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
 * NEW: Fetch patient facets for dynamic filtering with caching
 */
export async function fetchPatientFacets(params = {}, topN = 10) {
  try {
    // Check cache first
    const cacheKey = 'Patient/facets';
    const facetParams = { ...params, top_n: topN };
    const cachedResponse = requestCache.get(cacheKey, facetParams);
    if (cachedResponse) {
      return cachedResponse;
    }

    const searchParams = new URLSearchParams();
    
    // Add search parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        searchParams.append(key, value.toString());
      }
    });
    
    // Add top_n parameter
    searchParams.append('top_n', topN.toString());
    
    const url = `/resources/Patient/facets${
      searchParams.toString() ? '?' + searchParams.toString() : ''
    }`;
    
    const response = await safeFetch(url);
    
    let normalizedResponse;
    if (response.success) {
      normalizedResponse = {
        success: true,
        facets: response.facets || {},
        patientCount: response.patient_count || 0,
        totalResources: response.total_resources || 0
      };
    } else {
      normalizedResponse = {
        success: false,
        message: response.message || 'Failed to fetch facets',
        facets: {
          has_resource_counts: {},
          condition_codes: [],
          observation_codes: []
        }
      };
    }
    
    // Cache the response
    requestCache.set(cacheKey, facetParams, normalizedResponse);
    
    return normalizedResponse;
  } catch (error) {
    console.error('Failed to fetch patient facets:', error);
    return {
      success: false,
      message: error.message,
      facets: {
        has_resource_counts: {},
        condition_codes: [],
        observation_codes: []
      }
    };
  }
}

/**
 * NEW: Fetch measurement types with caching for measurement filter
 */
export async function fetchMeasurementTypes(params = {}) {
  try {
    // Check cache first
    const cacheKey = 'Observation/measurement-types';
    const measurementParams = { ...params };
    const cachedResponse = requestCache.get(cacheKey, measurementParams);
    if (cachedResponse) {
      return cachedResponse;
    }

    const searchParams = new URLSearchParams();
    
    // Add search parameters
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        searchParams.append(key, value.toString());
      }
    });
    
    const url = `/resources/Observation/measurement-types${
      searchParams.toString() ? '?' + searchParams.toString() : ''
    }`;
    
    const response = await safeFetch(url);
    
    let normalizedResponse;
    if (response.success) {
      normalizedResponse = {
        success: true,
        measurementTypes: response.measurement_types || [],
        totalTypes: response.total_types || 0,
        categories: response.categories || {}
      };
    } else {
      normalizedResponse = {
        success: false,
        message: response.message || 'Failed to fetch measurement types',
        measurementTypes: [],
        totalTypes: 0,
        categories: {}
      };
    }
    
    // Cache the response with longer TTL since measurement types don't change often
    requestCache.set(cacheKey, measurementParams, normalizedResponse, 600000); // 10 minute cache
    
    
    return normalizedResponse;
  } catch (error) {
    console.error('Failed to fetch measurement types:', error);
    return {
      success: false,
      message: error.message,
      measurementTypes: [],
      totalTypes: 0,
      categories: {}
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
      `/resources/${resourceType}/page?page_url=${encodedUrl}`
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
 * Get single resource by ID with caching
 */
export async function getById(resourceType, id) {
  try {
    // Check cache first
    const cacheKey = `${resourceType}/${id}`;
    const cachedResponse = requestCache.get(cacheKey, {});
    if (cachedResponse) {
      return cachedResponse;
    }

    const response = await safeFetch(`/resources/${resourceType}/${id}`);

    if (response.success && response.data) {
      // Cache the successful response
      requestCache.set(cacheKey, {}, response.data);
      return response.data;
    }

    return null;
  } catch (error) {
    console.error(`Failed to get ${resourceType}/${id}:`, error);
    return null;
  }
}

/**
 * ENHANCED: Get single resource by ID with detailed field separation
 */
export async function getByIdDetailed(resourceType, id) {
  try {
    const response = await safeFetch(`/resources/${resourceType}/${id}/detailed`);


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
// ENHANCED PATIENT FUNCTIONS WITH DYNAMIC RESOURCE LOADING
// =============================================================================

/**
 * Check if aggregate flow should be used
 */
function shouldUseAggregate(filters = {}) {
  return CONFIG.features.aggregateEnabled && Object.keys(filters).length > 0;
}

/**
 * Load patients with enhanced options - with aggregate integration
 */
export async function loadPatients(params = {}) {
  // Traditional fallback function
  const fallbackFn = () => fetchResources('Patient', params);
  
  // If no search term or filters, use traditional API
  if (!params.search && !params.filters) {
    return await fallbackFn();
  }
  
  // Try aggregate flow if enabled
  if (shouldUseAggregate(params.filters || {})) {
    try {
      const userSession = aggregateApi.getCurrentSession();
      const filters = params.filters || {};
      const searchParams = { search: params.search || '' };
      
      const pagination = {
        page: Math.floor((params._getpagesoffset || 0) / (params._count || CONFIG.ui.defaultPageSize)) + 1,
        per_page: params._count || CONFIG.ui.defaultPageSize
      };
      
      return await aggregateApi.fetchResourcesWithAggregate(
        'Patient',
        filters,
        pagination,
        userSession,
        fallbackFn
      );
    } catch (error) {
      console.warn('Aggregate flow failed, using traditional API:', error.message);
      return await fallbackFn();
    }
  }
  
  return await fallbackFn();
}

/**
 * Load patients using metadata-driven filtering - with aggregate integration
 */
export async function loadPatientsWithFilters(params = {}, appliedFilters = {}) {
  // Traditional fallback function
  const fallbackFn = async () => {
    try {
      // If no filters applied, use regular patient loading
      if (!appliedFilters || Object.keys(appliedFilters).length === 0) {
        return await loadPatients(params);
      }

      // Check cache first
      const cacheKey = `patients_with_filters/${JSON.stringify(appliedFilters)}`;
      const cachedResponse = requestCache.get(cacheKey, params);
      if (cachedResponse) {
        console.log('🎯 Cache hit for filtered patients');
        return cachedResponse;
      }

      const searchParams = new URLSearchParams();
      
      // Add pagination parameters
      if (params._count) searchParams.append('_count', params._count);
      if (params._getpagesoffset !== undefined) searchParams.append('_getpagesoffset', params._getpagesoffset);
      
      // Add applied filters as JSON string
      searchParams.append('applied_filters', JSON.stringify(appliedFilters));

      const url = `/resources/Patient/with-filters?${searchParams.toString()}`;
      console.log('🔍 Loading patients with metadata filters:', appliedFilters);
      
      const response = await safeFetch(url);
      
      if (response.success) {
        // Cache the response
        requestCache.set(cacheKey, response, params);
        console.log(`✅ Loaded ${response.data?.length || 0} filtered patients (${response.matching_patient_count} total matches)`);
        return response;
      } else {
        throw new Error(response.message || 'Failed to load filtered patients');
      }
    } catch (error) {
      console.error('❌ Error loading patients with filters:', error);
      throw error;
    }
  };
  
  // Try aggregate flow if enabled and filters are present
  if (shouldUseAggregate(appliedFilters)) {
    try {
      const userSession = aggregateApi.getCurrentSession();
      
      const pagination = {
        page: Math.floor((params._getpagesoffset || 0) / (params._count || CONFIG.ui.defaultPageSize)) + 1,
        per_page: params._count || CONFIG.ui.defaultPageSize
      };
      
      console.log('🔗 Using aggregate flow for filtered patients');
      return await aggregateApi.fetchResourcesWithAggregate(
        'Patient',
        appliedFilters,
        pagination,
        userSession,
        fallbackFn
      );
    } catch (error) {
      console.warn('Aggregate flow failed for filtered patients, using traditional API:', error.message);
      return await fallbackFn();
    }
  }
  
  return await fallbackFn();
}

/**
 * ENHANCED: Load detailed patient information with dynamic resource loading
 */
export async function loadPatientDetailed(patientId) {
  try {
    
    // Get patient detailed data first
    const patientResponse = await getByIdDetailed('Patient', patientId);

    if (!patientResponse.success) {
      throw new Error(patientResponse.message || 'Patient not found');
    }


    // Get all available resource types first
    const availableResources = await listResourceTypes();
    
    // Define resource types to load with their patient reference parameters
    const resourcesToLoad = [
      { type: 'Observation', param: 'subject' },
      { type: 'Condition', param: 'subject' },
      { type: 'Procedure', param: 'subject' },
      { type: 'MedicationRequest', param: 'subject' },
      { type: 'Encounter', param: 'subject' },
      { type: 'DiagnosticReport', param: 'subject' },
      { type: 'DocumentReference', param: 'subject' },
      { type: 'CareTeam', param: 'subject' },
      { type: 'AllergyIntolerance', param: 'patient' },
      { type: 'Immunization', param: 'patient' },
      { type: 'CarePlan', param: 'subject' },
      { type: 'Goal', param: 'subject' },
      { type: 'ServiceRequest', param: 'subject' },
    ].filter(resource => availableResources.includes(resource.type));

    // Load all resources in parallel using the enhanced endpoint
    const resourcePromises = resourcesToLoad.map(resource => 
      getPatientResources(patientId, resource.type, 100)
    );

    const results = await Promise.allSettled(resourcePromises);

    // Create a dynamic response object
    const responseData = {
      success: true,
      patient: patientResponse.all,
      patientFixed: patientResponse.fixed,
      patientDynamic: patientResponse.dynamic,
    };

    // Map results to resource names dynamically
    results.forEach((result, index) => {
      const resourceType = resourcesToLoad[index].type;
      const keyName = resourceType.toLowerCase();
      
      if (result.status === 'fulfilled' && result.value.success) {
        responseData[keyName] = result.value.data;
      } else {
        responseData[keyName] = [];
        if (result.status === 'rejected') {
          console.warn(`Failed to load ${resourceType}:`, result.reason);
        }
      }
    });

    // Maintain backward compatibility with hardcoded names
    responseData.observations = responseData.observation || [];
    responseData.conditions = responseData.condition || [];
    responseData.procedures = responseData.procedure || [];
    responseData.medications = responseData.medicationrequest || [];
    responseData.encounters = responseData.encounter || [];
    responseData.diagnosticReports = responseData.diagnosticreport || [];
    responseData.documentReferences = responseData.documentreference || [];
    responseData.careTeam = responseData.careteam || [];
    responseData.allergies = responseData.allergyintolerance || [];
    responseData.immunizations = responseData.immunization || [];


    return responseData;
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
// ENHANCED UTILITY FUNCTIONS WITH DYNAMIC FIELD SUPPORT
// =============================================================================

/**
 * ENHANCED: Flatten FHIR resource with dynamic field detection
 */
export function flattenResource(resource, maxDepth = 4) {
  const flattened = {};

  function flatten(obj, prefix = '', depth = 0) {
    if (depth > maxDepth || !obj || typeof obj !== 'object') {
      return;
    }

    if (Array.isArray(obj)) {
      if (obj.length > 0) {
        if (typeof obj[0] === 'string' || typeof obj[0] === 'number') {
          flattened[prefix] = obj.slice(0, 3).join(', ');
        } else if (typeof obj[0] === 'object') {
          // For arrays of objects, try to get meaningful display values
          obj.slice(0, 2).forEach((item, index) => {
            flatten(item, `${prefix}[${index}]`, depth + 1);
          });
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
 * ENHANCED: Get unified columns with smart prioritization
 */
export function getUnifiedColumns(resources, priorityColumns = []) {
  if (!Array.isArray(resources) || resources.length === 0) {
    return [];
  }

  const allKeys = new Set();
  const keyFrequency = {};

  resources.forEach((resource) => {
    const flattened = flattenResource(resource);
    Object.keys(flattened).forEach((key) => {
      allKeys.add(key);
      keyFrequency[key] = (keyFrequency[key] || 0) + 1;
    });
  });

  const keyList = Array.from(allKeys);
  
  // Enhanced prioritization based on frequency and importance
  const prioritized = [];
  
  // Always include these first if present
  const essentialFields = ['id', 'resourceType', 'status', 'code', 'display'];
  essentialFields.forEach((field) => {
    if (keyList.includes(field)) {
      prioritized.push(field);
    }
  });
  
  // Add user-specified priority columns
  priorityColumns.forEach((col) => {
    if (keyList.includes(col) && !prioritized.includes(col)) {
      prioritized.push(col);
    }
  });

  // Add high-frequency fields (present in >50% of resources)
  keyList
    .filter(key => !prioritized.includes(key))
    .sort((a, b) => keyFrequency[b] - keyFrequency[a])
    .forEach((key) => {
      if (keyFrequency[key] > resources.length * 0.5) {
        prioritized.push(key);
      }
    });

  // Add remaining fields
  keyList.forEach((key) => {
    if (!prioritized.includes(key)) {
      prioritized.push(key);
    }
  });

  return prioritized.slice(0, 50); // Limit to prevent UI overload
}

/**
 * Safe value display with enhanced null handling
 */
export function displayValue(value, fallback = 'N/A') {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.length > 0 ? value.slice(0, 3).join(', ') : fallback;
    }
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

/**
 * NEW: Cache implementation for request caching
 */
class RequestCache {
  constructor(maxSize = CONFIG.cache.maxCacheSize, ttlMs = CONFIG.cache.requestCacheTtl) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }
  
  _generateKey(serverBase, path, paramsHash) {
    return `${serverBase}|${path}|${paramsHash}`;
  }
  
  _hashParams(params) {
    const sortedParams = Object.keys(params || {})
      .sort()
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return btoa(sortedParams).replace(/[^a-zA-Z0-9]/g, ''); // Simple hash
  }
  
  get(path, params = {}) {
    const key = this._generateKey(API_BASE, path, this._hashParams(params));
    const cached = this.cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < this.ttlMs) {
      return cached.data;
    }
    
    if (cached) {
      this.cache.delete(key); // Remove expired entry
    }
    
    return null;
  }
  
  set(path, params = {}, data) {
    const key = this._generateKey(API_BASE, path, this._hashParams(params));
    
    // Implement LRU by removing oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
  
  clear() {
    this.cache.clear();
  }
}

// Global cache instance
export const requestCache = new RequestCache();

// Export safeFetch for direct use
export { safeFetch };

// =============================================================================
// ENHANCED SEARCH FUNCTIONS FOR CONDITION CODES AND DEMOGRAPHICS
// =============================================================================

/**
 * Search patients by condition code with age and gender filters
 */
export async function searchPatientsByCondition(conditionCode, filters = {}) {
  try {
    const params = {
      condition_code: conditionCode,
      ...filters
    };
    
    const queryString = new URLSearchParams(params).toString();
    const url = `/resources/Patient/search/by-condition?${queryString}`;
    
    const data = await safeFetch(url);
    return {
      success: data.success || false,
      data: data.data || [],
      message: data.message,
      searchParams: data.search_params,
      count: data.count || 0,
      total: data.total
    };
  } catch (error) {
    console.error('Error searching patients by condition:', error);
    return {
      success: false,
      message: error.message,
      data: [],
      count: 0
    };
  }
}

// =============================================================================
// FHIR METADATA AND SCHEMA DISCOVERY FUNCTIONS
// =============================================================================

/**
 * Get FHIR server capability statement and supported resources
 */
export async function getFhirCapabilityStatement(serverUrl = null) {
  try {
    const params = serverUrl ? new URLSearchParams({ server_url: serverUrl }) : '';
    const url = `/metadata/capability-statement${params ? '?' + params : ''}`;
    
    const data = await safeFetch(url);
    return {
      success: true,
      ...data
    };
  } catch (error) {
    console.error('Error fetching FHIR capability statement:', error);
    return {
      success: false,
      message: error.message,
      supported_resources: [],
      resource_details: {}
    };
  }
}

/**
 * Get supported FHIR resources from server metadata
 */
export async function getSupportedResources(serverUrl = null) {
  try {
    const params = serverUrl ? new URLSearchParams({ server_url: serverUrl }) : '';
    const url = `/metadata/supported-resources${params ? '?' + params : ''}`;
    
    return await safeFetch(url);
  } catch (error) {
    console.error('Error fetching supported resources:', error);
    return {
      success: false,
      message: error.message,
      supported_resources: [],
      total_resources: 0
    };
  }
}

/**
 * Get inferred schema for a specific FHIR resource type
 */
export async function getResourceSchema(resourceType, serverUrl = null, sampleSize = 10) {
  try {
    const params = new URLSearchParams({ sample_size: sampleSize.toString() });
    if (serverUrl) params.append('server_url', serverUrl);
    
    const url = `/metadata/resource-schema/${resourceType}?${params}`;
    
    return await safeFetch(url);
  } catch (error) {
    console.error(`Error fetching schema for ${resourceType}:`, error);
    return {
      success: false,
      message: error.message,
      resource_type: resourceType,
      inferred_schema: {
        total_columns: 0,
        columns: [],
        full_column_list: []
      }
    };
  }
}

/**
 * Get schemas for multiple resource types in parallel
 */
export async function getBulkResourceSchemas(resourceTypes = null, serverUrl = null, sampleSize = 5) {
  try {
    const params = new URLSearchParams({ sample_size: sampleSize.toString() });
    if (resourceTypes) params.append('resource_types', resourceTypes.join(','));
    if (serverUrl) params.append('server_url', serverUrl);
    
    const url = `/metadata/bulk-resource-schemas?${params}`;
    
    return await safeFetch(url);
  } catch (error) {
    console.error('Error fetching bulk resource schemas:', error);
    return {
      success: false,
      message: error.message,
      schemas: {},
      errors: { general: error.message }
    };
  }
}

/**
 * Clear metadata cache
 */
export async function clearMetadataCache() {
  try {
    const data = await safeFetch('/metadata/cache', {
      method: 'DELETE'
    });
    return data;
  } catch (error) {
    console.error('Error clearing metadata cache:', error);
    return {
      success: false,
      message: error.message
    };
  }
}

/**
 * Get backend status and configuration
 */
export async function getBackendStatus() {
  try {
    const data = await safeFetch('/resources/config/status');
    return data;
  } catch (error) {
    console.error('Error getting backend status:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clear backend cache
 */
export async function clearBackendCache() {
  try {
    const data = await safeFetch('/resources/config/cache/clear', { method: 'POST' });
    return data;
  } catch (error) {
    console.error('Error clearing backend cache:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// =============================================================================
// DATA AVAILABILITY FUNCTIONS
// =============================================================================

/**
 * Check which resources actually contain data
 */
export async function checkDataAvailability() {
  try {
    const data = await safeFetch('/resources/data-availability');
    return data;
  } catch (error) {
    console.error('Error checking data availability:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Get only resources that have data
 */
export async function getResourcesWithData(minCount = 1) {
  try {
    const data = await safeFetch(`/resources/with-data?min_count=${minCount}`);
    return data;
  } catch (error) {
    console.error('Error getting resources with data:', error);
    return {
      success: false,
      error: error.message,
      resources_with_data: []
    };
  }
}

/**
 * Get top resources by data count
 */
export async function getTopResourcesByData(limit = 10) {
  try {
    const data = await safeFetch(`/resources/top-by-data?limit=${limit}`);
    return data;
  } catch (error) {
    console.error('Error getting top resources:', error);
    return {
      success: false,
      error: error.message,
      top_resources: []
    };
  }
}

/**
 * Force refresh data availability check
 */
export async function refreshDataAvailability() {
  try {
    const data = await safeFetch('/resources/data-availability/refresh', { method: 'POST' });
    return data;
  } catch (error) {
    console.error('Error refreshing data availability:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Check specific resources for data
 */
export async function checkSpecificResources(resourceTypes) {
  try {
    const data = await safeFetch('/resources/check-specific', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resourceTypes)
    });
    return data;
  } catch (error) {
    console.error('Error checking specific resources:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

