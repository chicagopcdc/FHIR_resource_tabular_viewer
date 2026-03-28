// filterResourceCache.js - Config-driven cache manager for FHIR resources
import * as api from './api';

class FilterResourceCache {
  constructor() {
    this.cache = new Map();
    this.loadingPromises = new Map();
    this.cacheTimestamps = new Map();
    this.filterCache = new Map(); // Cache for filter metadata per resource type
    this.cacheTTL = 10 * 60 * 1000; // 10 minutes
    this.isInitialized = false;
    this.initializationPromise = null;
    this.configuredResourceTypes = [];
  }

  // Initialize cache structure based on config
  async initialize() {
    if (this.isInitialized) {
      return this.getAllCachedData();
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initializeFromConfig();
    const result = await this.initializationPromise;
    this.isInitialized = true;
    
    return result;
  }

  // Initialize cache structure from backend configuration
  async _initializeFromConfig() {
    try {
      console.log('📋 Initializing cache from backend configuration...');
      
      // Get configured resource types from backend
      const response = await api.get('/filters/targets');
      
      if (response.success && response.resource_types) {
        this.configuredResourceTypes = response.resource_types;
        console.log(`📋 Found ${this.configuredResourceTypes.length} configured resource types:`, this.configuredResourceTypes);
        
        // Initialize empty cache entries for each configured resource type
        this.configuredResourceTypes.forEach(resourceType => {
          this.cache.set(resourceType, []);
          this.cacheTimestamps.set(resourceType, 0); // Mark as not loaded
        });
        
        return this.getAllCachedData();
      } else {
        console.warn('⚠️ No resource types found in backend configuration');
        return {};
      }
    } catch (error) {
      console.error('❌ Failed to initialize cache from configuration:', error);
      // Fallback to empty cache
      return {};
    }
  }

  // Get configured resource types
  getConfiguredResourceTypes() {
    return [...this.configuredResourceTypes];
  }

  // Get specific resource type from cache
  getResource(resourceType) {
    if (!this.isInitialized) {
      console.warn(`⚠️ Cache not initialized, returning empty array for ${resourceType}`);
      return [];
    }

    if (!this.configuredResourceTypes.includes(resourceType)) {
      console.warn(`⚠️ ${resourceType} not in configured resource types`);
      return [];
    }

    const data = this.cache.get(resourceType) || [];
    const timestamp = this.cacheTimestamps.get(resourceType) || 0;
    
    // If never loaded (timestamp = 0), return empty but don't auto-load
    if (timestamp === 0) {
      console.log(`📋 ${resourceType} not yet loaded - use loadResourceLazily() to load`);
      return [];
    }
    
    // Check if cache is stale for already-loaded data
    if (Date.now() - timestamp > this.cacheTTL) {
      console.log(`🔄 Cache stale for ${resourceType}, consider refreshing...`);
      // Don't auto-refresh, let caller decide
    }

    return data;
  }

  // Load a resource type's data lazily
  async loadResourceLazily(resourceType, options = {}) {
    if (!this.configuredResourceTypes.includes(resourceType)) {
      console.warn(`⚠️ ${resourceType} not in configured resource types`);
      return [];
    }

    const timestamp = this.cacheTimestamps.get(resourceType) || 0;
    
    // If already loading, return the existing promise
    if (this.loadingPromises.has(resourceType)) {
      return this.loadingPromises.get(resourceType);
    }

    // If already loaded and fresh, return cached data
    if (timestamp > 0 && Date.now() - timestamp <= this.cacheTTL) {
      return this.cache.get(resourceType) || [];
    }

    // Load the resource
    return this.refreshResource(resourceType, options);
  }

  // Get all cached data dynamically based on configured resource types
  getAllCachedData() {
    const data = {};
    
    // Add each configured resource type to the data object
    for (const resourceType of this.configuredResourceTypes) {
      const key = resourceType.toLowerCase();
      data[key] = this.getResource(resourceType);
    }
    
    // Add legacy medicalData structure if needed
    if (this.configuredResourceTypes.length > 0) {
      data.medicalData = {};
      for (const resourceType of this.configuredResourceTypes) {
        const key = resourceType.toLowerCase();
        data.medicalData[key] = data[key];
      }
    }
    
    return data;
  }

  // Get filter metadata cache for specific resource type
  getFilterCache(resourceType) {
    const key = `filters_${resourceType}`;
    const cached = this.filterCache.get(key);
    
    if (cached && Date.now() - cached.timestamp <= this.cacheTTL) {
      return cached.data;
    }
    
    return null;
  }

  // Set filter metadata cache for specific resource type
  setFilterCache(resourceType, data) {
    const key = `filters_${resourceType}`;
    this.filterCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Clear filter metadata cache for specific resource type
  clearFilterCache(resourceType = null) {
    if (resourceType) {
      const key = `filters_${resourceType}`;
      this.filterCache.delete(key);
    } else {
      // Clear all filter cache
      this.filterCache.clear();
    }
  }

  // Refresh specific resource with configurable options
  async refreshResource(resourceType, options = {}) {
    if (!this.configuredResourceTypes.includes(resourceType)) {
      console.warn(`⚠️ ${resourceType} not in configured resource types`);
      return [];
    }

    if (this.loadingPromises.has(resourceType)) {
      return this.loadingPromises.get(resourceType);
    }

    const loadPromise = this._loadSingleResource(resourceType, options);
    this.loadingPromises.set(resourceType, loadPromise);
    
    try {
      const result = await loadPromise;
      this.loadingPromises.delete(resourceType);
      return result;
    } catch (error) {
      this.loadingPromises.delete(resourceType);
      throw error;
    }
  }

  // Load single resource with configurable parameters
  async _loadSingleResource(resourceType, options = {}) {
    try {
      console.log(`🔄 Loading ${resourceType}...`);
      
      // Default options
      const defaultOptions = {
        _count: 10, // Small default batch size
        _sort: '-_lastUpdated' // Most recent first
      };
      
      const params = { ...defaultOptions, ...options };
      
      const response = await api.fetchResources(resourceType, params);
      
      if (response.success) {
        const data = response.data || [];
        this.cache.set(resourceType, data);
        this.cacheTimestamps.set(resourceType, Date.now());
        console.log(`✅ Loaded ${data.length} ${resourceType} records`);
        return data;
      } else {
        console.warn(`❌ Failed to load ${resourceType}:`, response.message);
        return this.cache.get(resourceType) || [];
      }
    } catch (error) {
      console.error(`💥 Error loading ${resourceType}:`, error);
      return this.cache.get(resourceType) || [];
    }
  }

  // Load all configured resource types
  async loadAllConfiguredResources(options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`🔄 Loading all ${this.configuredResourceTypes.length} configured resource types...`);
    
    const loadPromises = this.configuredResourceTypes.map(async (resourceType) => {
      try {
        const data = await this.loadResourceLazily(resourceType, options);
        return { resourceType, success: true, count: data.length };
      } catch (error) {
        console.error(`💥 Error loading ${resourceType}:`, error);
        return { resourceType, success: false, error: error.message };
      }
    });

    const results = await Promise.allSettled(loadPromises);
    
    // Build summary
    const summary = {
      loadResults: results.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason }),
      ...this.getAllCachedData()
    };

    // Create summary stats for logging
    const resourceCounts = {};
    for (const [resourceType, data] of this.cache.entries()) {
      resourceCounts[resourceType] = Array.isArray(data) ? data.length : 0;
    }

    console.log('📋 Load summary:', resourceCounts);
    return summary;
  }

  // Preload resources for specific patients (config-driven)
  async preloadPatientResources(patientIds, options = {}) {
    if (!Array.isArray(patientIds) || patientIds.length === 0) {
      return;
    }

    if (!this.isInitialized) {
      await this.initialize();
    }

    console.log(`🔄 Preloading resources for ${patientIds.length} patients...`);
    
    const patientRefs = patientIds.map(id => `Patient/${id}`).join(',');
    const defaultOptions = {
      subject: patientRefs,
      _count: 50,
      ...options
    };
    
    const preloadPromises = this.configuredResourceTypes.map(async (resourceType) => {
      try {
        const response = await api.fetchResources(resourceType, defaultOptions);
        
        if (response.success && response.data.length > 0) {
          // Merge with existing cache
          const existing = this.cache.get(resourceType) || [];
          const merged = [...existing];
          
          // Add new records (avoid duplicates by ID)
          const existingIds = new Set(existing.map(r => r.id));
          response.data.forEach(record => {
            if (!existingIds.has(record.id)) {
              merged.push(record);
            }
          });
          
          this.cache.set(resourceType, merged);
          this.cacheTimestamps.set(resourceType, Date.now());
          console.log(`📈 Preloaded ${response.data.length} ${resourceType} for patients`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to preload ${resourceType}:`, error.message);
      }
    });

    await Promise.allSettled(preloadPromises);
  }

  // Clear specific resource cache
  clearResource(resourceType) {
    this.cache.delete(resourceType);
    this.cacheTimestamps.delete(resourceType);
    this.loadingPromises.delete(resourceType);
    this.clearFilterCache(resourceType);
    console.log(`🗑️ Cleared ${resourceType} cache`);
  }

  // Clear all cache
  clearAll() {
    this.cache.clear();
    this.cacheTimestamps.clear();
    this.loadingPromises.clear();
    this.filterCache.clear();
    this.isInitialized = false;
    this.initializationPromise = null;
    this.configuredResourceTypes = [];
    console.log('🗑️ Cleared all cache and configuration');
  }

  // Get cache statistics
  getStats() {
    const stats = {};
    for (const [resourceType, data] of this.cache.entries()) {
      const timestamp = this.cacheTimestamps.get(resourceType) || 0;
      const age = Date.now() - timestamp;
      const isStale = age > this.cacheTTL;
      
      stats[resourceType] = {
        count: Array.isArray(data) ? data.length : 0,
        age: age,
        ageMinutes: Math.floor(age / (1000 * 60)),
        isStale,
        lastUpdated: timestamp > 0 ? new Date(timestamp).toLocaleTimeString() : 'Never'
      };
    }
    
    return {
      isInitialized: this.isInitialized,
      configuredResourceTypes: this.configuredResourceTypes,
      resourceStats: stats,
      totalCached: Object.values(stats).reduce((sum, stat) => sum + stat.count, 0),
      filterCacheSize: this.filterCache.size
    };
  }

  // Check if resource type is configured
  isConfiguredResourceType(resourceType) {
    return this.configuredResourceTypes.includes(resourceType);
  }

  // Refresh configuration (re-fetch from backend)
  async refreshConfiguration() {
    console.log('🔄 Refreshing cache configuration...');
    this.isInitialized = false;
    this.initializationPromise = null;
    this.configuredResourceTypes = [];
    
    // Clear existing cache for non-configured resources
    const currentResources = Array.from(this.cache.keys());
    await this.initialize();
    
    // Remove any resources that are no longer configured
    for (const resourceType of currentResources) {
      if (!this.configuredResourceTypes.includes(resourceType)) {
        this.clearResource(resourceType);
        console.log(`🗑️ Removed ${resourceType} - no longer configured`);
      }
    }
    
    console.log('✅ Configuration refreshed');
  }
}

// Create singleton instance
export const filterResourceCache = new FilterResourceCache();

// Export individual methods for convenience
export const initializeFilterCache = () => filterResourceCache.initialize();
export const getFilterResources = () => filterResourceCache.getAllCachedData();
export const refreshFilterResource = (resourceType, options) => filterResourceCache.refreshResource(resourceType, options);
export const loadFilterResourceLazily = (resourceType, options) => filterResourceCache.loadResourceLazily(resourceType, options);
export const loadAllConfiguredResources = (options) => filterResourceCache.loadAllConfiguredResources(options);
export const clearAllFilterCache = () => filterResourceCache.clearAll();
export const getFilterCacheStats = () => filterResourceCache.getStats();
export const preloadPatientResources = (patientIds, options) => filterResourceCache.preloadPatientResources(patientIds, options);
export const getFilterCache = (resourceType) => filterResourceCache.getFilterCache(resourceType);
export const setFilterCache = (resourceType, data) => filterResourceCache.setFilterCache(resourceType, data);
export const clearFilterCache = (resourceType) => filterResourceCache.clearFilterCache(resourceType);
export const getConfiguredResourceTypes = () => filterResourceCache.getConfiguredResourceTypes();
export const refreshConfiguration = () => filterResourceCache.refreshConfiguration();

export default filterResourceCache;