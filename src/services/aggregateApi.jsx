// src/services/aggregateApi.js
// Frontend API client for aggregate/slice endpoints with error handling and retries

import { CONFIG } from '../config';

const API_BASE = CONFIG.api.baseUrl + '/api';
const DEFAULT_TIMEOUT = CONFIG.api.timeout;
const MAX_RETRIES = CONFIG.api.maxRetries;

/**
 * Enhanced fetch for aggregate endpoints with error handling
 */
async function aggregateFetch(url, options = {}) {
  let lastError;
  const fullUrl = `${API_BASE}${url}`;

  console.log(`🔗 Aggregate API Request: ${options.method || 'GET'} ${fullUrl}`);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
    const startTime = Date.now();

    try {
      const response = await fetch(fullUrl, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Accept': 'application/json; charset=utf-8',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      console.log(`✅ Aggregate API Response: ${response.status} ${response.statusText} (${duration}ms)`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.detail || errorData.message || `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      return await response.json();

    } catch (error) {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      if (error.name === 'AbortError') {
        console.log(`⏰ Aggregate request timed out after ${duration}ms`);
        lastError = new Error(`Aggregate request timed out after ${DEFAULT_TIMEOUT / 1000}s`);
      } else {
        console.log(`❌ Aggregate request failed: ${error.message} (${duration}ms)`);
        lastError = error;
      }

      if (attempt < MAX_RETRIES - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
        console.log(`🔄 Retrying aggregate request in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Create aggregated dataset for a resource type with filters
 * @param {string} resourceType - FHIR resource type (e.g., 'Patient')
 * @param {object} filters - Filter parameters
 * @param {object} searchParams - Additional FHIR search parameters
 * @param {string} userSession - User session identifier
 * @returns {Promise<object>} - { dataset_id, total, truncated, build_time_ms, cache_hit }
 */
export async function createAggregate(resourceType, filters = {}, searchParams = {}, userSession) {
  if (!userSession) {
    throw new Error('User session is required for aggregate requests');
  }

  const requestBody = {
    filters,
    search_params: searchParams,
    user_session: userSession
  };

  console.log(`🏗️ Creating aggregate for ${resourceType} with filters:`, filters);
  
  const response = await aggregateFetch(`/aggregate/${resourceType}`, {
    method: 'POST',
    body: JSON.stringify(requestBody)
  });

  console.log(`✅ Aggregate created: ${response.dataset_id} (${response.total} items, ${response.build_time_ms}ms, cache_hit=${response.cache_hit})`);
  return response;
}

/**
 * Get paginated slice from cached dataset
 * @param {string} datasetId - Dataset identifier
 * @param {number} offset - Starting offset for pagination
 * @param {number} limit - Number of items to return
 * @param {string} userSession - User session identifier
 * @returns {Promise<object>} - { dataset_id, total, offset, limit, items, has_next, has_prev, truncated }
 */
export async function getDatasetSlice(datasetId, offset = 0, limit = 50, userSession) {
  if (!userSession) {
    throw new Error('User session is required for slice requests');
  }

  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString(),
    user_session: userSession
  });

  console.log(`📄 Getting dataset slice: ${datasetId} (offset=${offset}, limit=${limit})`);
  
  const response = await aggregateFetch(`/aggregate/${datasetId}/slice?${params}`);
  
  console.log(`✅ Dataset slice retrieved: ${response.items.length}/${response.total} items`);
  return response;
}

/**
 * Get progress information for dataset build
 * @param {string} datasetId - Dataset identifier
 * @returns {Promise<object>} - Progress information
 */
export async function getDatasetProgress(datasetId) {
  console.log(`⏳ Getting progress for dataset: ${datasetId}`);
  
  const response = await aggregateFetch(`/aggregate/${datasetId}/progress`);
  
  console.log(`📊 Dataset progress: ${response.status} (${response.progress_percent}%)`);
  return response;
}

/**
 * Delete cached dataset
 * @param {string} datasetId - Dataset identifier
 * @param {string} userSession - User session identifier
 * @returns {Promise<object>} - Deletion result
 */
export async function deleteDataset(datasetId, userSession) {
  if (!userSession) {
    throw new Error('User session is required for dataset deletion');
  }

  const params = new URLSearchParams({
    user_session: userSession
  });

  console.log(`🗑️ Deleting dataset: ${datasetId}`);
  
  const response = await aggregateFetch(`/aggregate/${datasetId}?${params}`, {
    method: 'DELETE'
  });

  console.log(`✅ Dataset deleted: ${datasetId}`);
  return response;
}

/**
 * Check aggregate service health
 * @returns {Promise<object>} - Health status
 */
export async function getAggregateHealth() {
  const response = await aggregateFetch('/aggregate/health');
  return response;
}

/**
 * Wrapper for aggregate-based resource fetching with fallback to traditional API
 * @param {string} resourceType - FHIR resource type
 * @param {object} filters - Filter parameters
 * @param {object} pagination - Pagination settings { page, per_page }
 * @param {string} userSession - User session identifier
 * @param {function} fallbackFn - Fallback function if aggregate fails
 * @returns {Promise<object>} - Response with data and pagination info
 */
export async function fetchResourcesWithAggregate(resourceType, filters, pagination, userSession, fallbackFn) {
  // Check if aggregate is enabled
  if (!CONFIG.features.aggregateEnabled) {
    console.log('📋 Aggregate disabled, using fallback');
    return await fallbackFn();
  }

  try {
    // Calculate offset from page-based pagination
    const offset = (pagination.page - 1) * pagination.per_page;

    // Try to create aggregate dataset
    const aggregateResult = await createAggregate(
      resourceType,
      filters,
      {},
      userSession
    );

    // Get the requested slice
    const sliceResult = await getDatasetSlice(
      aggregateResult.dataset_id,
      offset,
      pagination.per_page,
      userSession
    );

    // Transform to match existing API response format
    return {
      success: true,
      data: sliceResult.items,
      pagination: {
        page: pagination.page,
        per_page: pagination.per_page,
        total: sliceResult.total,
        has_next: sliceResult.has_next,
        has_prev: sliceResult.has_prev,
        dataset_id: aggregateResult.dataset_id,
        truncated: sliceResult.truncated,
        build_time_ms: aggregateResult.build_time_ms,
        cache_hit: aggregateResult.cache_hit
      },
      resource_type: resourceType,
      aggregate_used: true
    };

  } catch (error) {
    console.warn(`⚠️ Aggregate failed for ${resourceType}, falling back:`, error.message);
    
    // Fall back to traditional API
    const fallbackResult = await fallbackFn();
    return {
      ...fallbackResult,
      aggregate_used: false,
      aggregate_error: error.message
    };
  }
}

/**
 * Generate user session identifier from browser/app state
 * This is a simple implementation - could be enhanced with proper session management
 */
export function generateUserSession() {
  // Use a combination of timestamp and random string for session ID
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return `session_${timestamp}_${random}`;
}

/**
 * Get or create persistent user session identifier
 */
let _currentSession = null;

export function getCurrentSession() {
  if (!_currentSession) {
    // Try to restore from sessionStorage
    _currentSession = sessionStorage.getItem('fhir_user_session');
    
    if (!_currentSession) {
      // Generate new session and store it
      _currentSession = generateUserSession();
      sessionStorage.setItem('fhir_user_session', _currentSession);
    }
  }
  
  return _currentSession;
}

/**
 * Clear current session (e.g., on logout)
 */
export function clearCurrentSession() {
  _currentSession = null;
  sessionStorage.removeItem('fhir_user_session');
}