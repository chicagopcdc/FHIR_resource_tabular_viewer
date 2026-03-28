// Tab-specific filtering service with caching
class TabFilterService {
  constructor() {
    this.cache = new Map();
    this.cacheExpiry = new Map();
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes
  }

  // Generate cache key from parameters
  generateCacheKey(patientId, resourceType, filters) {
    const filterParams = Object.keys(filters)
      .sort()
      .map(key => `${key}=${filters[key]}`)
      .join('&');
    return `${patientId}-${resourceType}-${filterParams}`;
  }

  // Check if cache entry is valid
  isCacheValid(key) {
    const expiry = this.cacheExpiry.get(key);
    return expiry && Date.now() < expiry;
  }

  // Get cached data if valid
  getCachedData(key) {
    if (this.isCacheValid(key)) {
      console.log(`🎯 Cache hit for ${key}`);
      return this.cache.get(key);
    }
    return null;
  }

  // Cache data with expiry
  cacheData(key, data) {
    this.cache.set(key, data);
    this.cacheExpiry.set(key, Date.now() + this.cacheDuration);
    console.log(`💾 Cached data for ${key}`);
    
    // Clean up old entries if cache gets too large
    if (this.cache.size > 50) {
      this.cleanupCache();
    }
  }

  // Clean up expired cache entries
  cleanupCache() {
    const now = Date.now();
    for (const [key, expiry] of this.cacheExpiry.entries()) {
      if (now >= expiry) {
        this.cache.delete(key);
        this.cacheExpiry.delete(key);
      }
    }
  }

  // Fetch filtered patient resources
  async fetchFilteredResources(patientId, resourceType, filters = {}) {
    const cacheKey = this.generateCacheKey(patientId, resourceType, filters);
    
    // Try cache first
    const cachedData = this.getCachedData(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    console.log(`🔍 Fetching filtered ${resourceType} for patient ${patientId}:`, filters);

    try {
      // Build query parameters
      const queryParams = new URLSearchParams();
      queryParams.append('_count', '500'); // Get more data for filtering
      
      // Add filter parameters
      Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined && filters[key] !== '') {
          queryParams.append(key, filters[key]);
        }
      });

      const url = `http://localhost:8000/api/resources/Patient/${patientId}/resources/${resourceType}/filtered?${queryParams}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        console.log(`✅ Fetched ${data.count}/${data.original_count} filtered ${resourceType} items`);
        console.log(`📊 Applied filters:`, data.filters_applied);
        
        // Cache the successful response
        this.cacheData(cacheKey, data);
        
        return data;
      } else {
        console.error(`❌ Failed to fetch filtered ${resourceType}:`, data.message);
        throw new Error(data.message);
      }
    } catch (error) {
      console.error(`🚨 Error fetching filtered ${resourceType}:`, error);
      throw error;
    }
  }

  // Fetch available filter options for a resource type
  async fetchFilterOptions(patientId, resourceType) {
    const cacheKey = `options-${patientId}-${resourceType}`;
    
    // Try cache first
    const cachedOptions = this.getCachedData(cacheKey);
    if (cachedOptions) {
      return cachedOptions;
    }

    console.log(`🔍 Fetching filter options for ${resourceType} of patient ${patientId}`);

    try {
      // Fetch all data first to analyze filter options
      const url = `http://localhost:8000/api/resources/Patient/${patientId}/resources/${resourceType}`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.success) {
        const options = this.analyzeFilterOptions(data.data, resourceType);
        
        // Cache the options
        this.cacheData(cacheKey, options);
        
        console.log(`📊 Generated filter options for ${resourceType}:`, options);
        return options;
      } else {
        console.error(`❌ Failed to fetch ${resourceType} for filter analysis:`, data.message);
        return {};
      }
    } catch (error) {
      console.error(`🚨 Error fetching filter options for ${resourceType}:`, error);
      return {};
    }
  }

  // Analyze data to generate filter options
  analyzeFilterOptions(data, resourceType) {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return {};
    }

    const options = {
      measurement_types: new Set(),
      units: new Set(),
      statuses: new Set(),
      categories: new Set(),
      document_types: new Set(),
      authors: new Set(),
      value_ranges: { min: Infinity, max: -Infinity, hasValues: false }
    };

    data.forEach(item => {
      // Common fields
      if (item.status) {
        options.statuses.add(item.status);
      }

      // For observations (measurements/labs)
      if (resourceType === 'Observation') {
        if (item.code_display) {
          options.measurement_types.add(item.code_display);
        }
        if (item.value_unit) {
          options.units.add(item.value_unit);
        }
        if (item.value_quantity !== null && item.value_quantity !== undefined) {
          const value = parseFloat(item.value_quantity);
          if (!isNaN(value)) {
            options.value_ranges.min = Math.min(options.value_ranges.min, value);
            options.value_ranges.max = Math.max(options.value_ranges.max, value);
            options.value_ranges.hasValues = true;
          }
        }
        
        // Category analysis
        if (item.category) {
          const categoryName = this.extractCategoryName(item.category);
          if (categoryName) {
            options.categories.add(categoryName);
          }
        }
      }

      // For document references and diagnostic reports
      if (resourceType === 'DocumentReference' || resourceType === 'DiagnosticReport') {
        if (item.resourceType) {
          options.document_types.add(item.resourceType);
        }

        // Extract author
        if (item.author) {
          const authorName = this.extractAuthorName(item.author);
          if (authorName) {
            options.authors.add(authorName);
          }
        }
      }
    });

    // Convert sets to sorted arrays
    const result = {
      measurement_types: Array.from(options.measurement_types).sort(),
      units: Array.from(options.units).sort(),
      statuses: Array.from(options.statuses).sort(),
      categories: Array.from(options.categories).sort(),
      document_types: Array.from(options.document_types).sort(),
      authors: Array.from(options.authors).sort().slice(0, 20), // Limit authors to top 20
    };

    // Add value range only if we have values
    if (options.value_ranges.hasValues) {
      result.value_range = {
        min: Math.floor(options.value_ranges.min),
        max: Math.ceil(options.value_ranges.max)
      };
    }

    return result;
  }

  // Helper method to extract category name
  extractCategoryName(category) {
    if (Array.isArray(category) && category.length > 0) {
      category = category[0];
    }
    if (typeof category === 'object' && category.coding && category.coding.length > 0) {
      return category.coding[0].display || category.coding[0].code;
    }
    if (typeof category === 'object' && category.text) {
      return category.text;
    }
    return null;
  }

  // Helper method to extract author name
  extractAuthorName(author) {
    if (Array.isArray(author) && author.length > 0) {
      author = author[0];
    }
    if (typeof author === 'object') {
      return author.display || author.reference || '';
    }
    return '';
  }

  // Clear cache (useful for testing or when data changes)
  clearCache() {
    this.cache.clear();
    this.cacheExpiry.clear();
    console.log('🗑️ Cache cleared');
  }

  // Get cache statistics
  getCacheStats() {
    this.cleanupCache(); // Clean up expired entries first
    return {
      totalEntries: this.cache.size,
      validEntries: Array.from(this.cacheExpiry.values()).filter(expiry => Date.now() < expiry).length
    };
  }
}

// Create singleton instance
const tabFilterService = new TabFilterService();

export default tabFilterService;