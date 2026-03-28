// src/hooks/useAggregatedData.js
// React hook for managing aggregate dataset lifecycle and slice pagination

import { useState, useEffect, useCallback, useRef } from 'react';
import * as aggregateApi from '../services/aggregateApi';
import { CONFIG } from '../config';

/**
 * Custom hook for managing aggregated dataset with pagination
 * @param {string} resourceType - FHIR resource type
 * @param {object} filters - Current filter parameters
 * @param {object} initialPagination - Initial pagination state
 * @param {function} fallbackFetcher - Fallback function for traditional API
 * @returns {object} Hook state and methods
 */
export function useAggregatedData(resourceType, filters = {}, initialPagination = {}, fallbackFetcher = null) {
  const [dataset, setDataset] = useState(null);
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    per_page: CONFIG.ui.defaultPageSize,
    total: 0,
    has_next: false,
    has_prev: false,
    ...initialPagination
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [aggregateUsed, setAggregateUsed] = useState(false);

  // Refs for tracking current request and preventing stale updates
  const currentRequestRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const userSession = aggregateApi.getCurrentSession();

  /**
   * Build or retrieve aggregate dataset
   */
  const buildDataset = useCallback(async (forceRebuild = false) => {
    const requestId = Date.now();
    currentRequestRef.current = requestId;
    
    setLoading(true);
    setError(null);
    setProgress(null);

    try {
      console.log(`🏗️ Building dataset for ${resourceType} with filters:`, filters);

      // Create aggregate dataset
      const aggregateResult = await aggregateApi.createAggregate(
        resourceType,
        filters,
        {},
        userSession
      );

      // Check if this request is still current
      if (currentRequestRef.current !== requestId) {
        console.log(' Dataset build cancelled (newer request started)');
        return;
      }

      setDataset({
        id: aggregateResult.dataset_id,
        total: aggregateResult.total,
        truncated: aggregateResult.truncated,
        build_time_ms: aggregateResult.build_time_ms,
        cache_hit: aggregateResult.cache_hit,
        resource_type: resourceType
      });

      setAggregateUsed(true);
      
      // Update pagination with total
      setPagination(prev => ({
        ...prev,
        total: aggregateResult.total,
        page: 1 // Reset to first page with new dataset
      }));

      console.log(`✅ Dataset ready: ${aggregateResult.dataset_id} (${aggregateResult.total} items)`);

      // If it was a long build, clear any progress polling
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

    } catch (err) {
      console.warn(`⚠️ Aggregate build failed, attempting fallback:`, err.message);

      // Check if this request is still current
      if (currentRequestRef.current !== requestId) {
        return;
      }

      // Fall back to traditional API if available
      if (fallbackFetcher) {
        try {
          const fallbackResult = await fallbackFetcher(filters, pagination);
          
          if (currentRequestRef.current !== requestId) {
            return;
          }

          setData(fallbackResult.data || []);
          setPagination(prev => ({
            ...prev,
            total: fallbackResult.pagination?.total || fallbackResult.data?.length || 0,
            has_next: fallbackResult.pagination?.has_next || false,
            has_prev: fallbackResult.pagination?.has_prev || false
          }));
          setAggregateUsed(false);
          
        } catch (fallbackErr) {
          setError(`Both aggregate and fallback failed: ${fallbackErr.message}`);
        }
      } else {
        setError(`Aggregate build failed: ${err.message}`);
      }
    } finally {
      if (currentRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [resourceType, JSON.stringify(filters), userSession, fallbackFetcher]);

  /**
   * Load specific page slice from dataset
   */
  const loadPage = useCallback(async (page) => {
    if (!dataset) {
      console.warn('No dataset available for pagination');
      return;
    }

    const requestId = Date.now();
    currentRequestRef.current = requestId;
    
    setLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * pagination.per_page;
      
      const sliceResult = await aggregateApi.getDatasetSlice(
        dataset.id,
        offset,
        pagination.per_page,
        userSession
      );

      // Check if this request is still current
      if (currentRequestRef.current !== requestId) {
        console.log('🚫 Page load cancelled (newer request started)');
        return;
      }

      setData(sliceResult.items);
      setPagination(prev => ({
        ...prev,
        page: page,
        total: sliceResult.total,
        has_next: sliceResult.has_next,
        has_prev: sliceResult.has_prev
      }));

      console.log(`📄 Page ${page} loaded: ${sliceResult.items.length} items`);

    } catch (err) {
      if (currentRequestRef.current === requestId) {
        setError(`Failed to load page ${page}: ${err.message}`);
        console.error('Page load error:', err);
      }
    } finally {
      if (currentRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [dataset, pagination.per_page, userSession]);

  /**
   * Change page size and reload current page
   */
  const changePageSize = useCallback(async (newPageSize) => {
    if (!dataset) {
      return;
    }

    // Calculate what the new page should be to show similar content
    const currentOffset = (pagination.page - 1) * pagination.per_page;
    const newPage = Math.floor(currentOffset / newPageSize) + 1;

    setPagination(prev => ({
      ...prev,
      per_page: newPageSize,
      page: newPage
    }));

    // Load the new page
    await loadPage(newPage);
  }, [dataset, pagination, loadPage]);

  /**
   * Poll for progress updates during long builds
   */
  const startProgressPolling = useCallback((datasetId) => {
    if (!CONFIG.features.progressEnabled || progressIntervalRef.current) {
      return;
    }

    progressIntervalRef.current = setInterval(async () => {
      try {
        const progressData = await aggregateApi.getDatasetProgress(datasetId);
        setProgress(progressData);

        // Stop polling when complete
        if (progressData.status === 'ready' || progressData.status === 'error' || progressData.status === 'truncated') {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      } catch (err) {
        // Progress polling failed - not critical
        console.debug('Progress polling failed:', err.message);
      }
    }, 2000); // Poll every 2 seconds
  }, []);

  /**
   * Clean up dataset cache
   */
  const clearDataset = useCallback(async () => {
    if (dataset) {
      try {
        await aggregateApi.deleteDataset(dataset.id, userSession);
        console.log(`🗑️ Dataset cleared: ${dataset.id}`);
      } catch (err) {
        console.warn('Failed to delete dataset:', err.message);
      }
    }
    
    setDataset(null);
    setData([]);
    setProgress(null);
    setAggregateUsed(false);
    
    // Clear progress polling
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, [dataset, userSession]);

  // Effect: Build dataset when filters change
  useEffect(() => {
    if (CONFIG.ui.aggregateEnabled && Object.keys(filters).length > 0) {
      buildDataset();
    }
    
    // Cleanup on unmount or filter change
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, [buildDataset]);

  // Effect: Load first page when dataset is ready
  useEffect(() => {
    if (dataset && pagination.page === 1) {
      loadPage(1);
    }
  }, [dataset, loadPage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    };
  }, []);

  return {
    // Data state
    data,
    pagination,
    dataset,
    loading,
    error,
    progress,
    aggregateUsed,

    // Actions
    buildDataset,
    loadPage,
    changePageSize,
    clearDataset,
    
    // Convenience methods
    nextPage: () => loadPage(pagination.page + 1),
    prevPage: () => loadPage(pagination.page - 1),
    refresh: () => buildDataset(true),
    
    // State helpers
    hasData: data.length > 0,
    isEmpty: !loading && data.length === 0,
    isFirstPage: pagination.page <= 1,
    isLastPage: !pagination.has_next,
    totalPages: Math.ceil(pagination.total / pagination.per_page)
  };
}

/**
 * Simplified hook for basic aggregate pagination
 * @param {string} resourceType - FHIR resource type
 * @param {object} filters - Filter parameters
 * @returns {object} Simplified hook interface
 */
export function useSimpleAggregatedData(resourceType, filters = {}) {
  const hook = useAggregatedData(resourceType, filters);
  
  return {
    data: hook.data,
    loading: hook.loading,
    error: hook.error,
    pagination: hook.pagination,
    loadPage: hook.loadPage,
    refresh: hook.refresh,
    hasData: hook.hasData,
    isEmpty: hook.isEmpty
  };
}