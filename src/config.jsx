/**
 * Frontend Configuration for FHIR Patient Search Application
 * Loads settings from config.yaml via environment variables or defaults
 */

// Load config.yaml in the browser (for development)
let yamlConfig = null;

// Attempt to load config from window object (if provided by backend)
if (typeof window !== 'undefined' && window.APP_CONFIG) {
  yamlConfig = window.APP_CONFIG;
}

/**
 * Configuration object with defaults and environment variable overrides
 */
export const CONFIG = {
  // API Configuration
  api: {
    baseUrl: import.meta.env.VITE_API_BASE_URL || yamlConfig?.frontend?.api_base_url || 'http://localhost:8000',
    timeout: parseInt(import.meta.env.VITE_TIMEOUT) || yamlConfig?.fhir?.timeout_seconds * 1000 || 30000,
    maxRetries: parseInt(import.meta.env.VITE_MAX_RETRIES) || yamlConfig?.fhir?.max_retries || 1,
  },

  // FHIR Server Configuration
  fhir: {
    baseUrl: import.meta.env.VITE_FHIR_BASE_URL || yamlConfig?.fhir?.base_url || 'https://hapi.fhir.org/baseR4/',
    supportedResources: yamlConfig?.fhir?.supported_resources || [
      'Patient', 'Observation', 'Condition', 'Procedure', 'MedicationRequest',
      'Encounter', 'DiagnosticReport', 'DocumentReference', 'AllergyIntolerance', 'Immunization',
      'Medication', 'MedicationAdministration', 'MedicationDispense', 'MedicationStatement',
      'CarePlan', 'CareTeam', 'Goal', 'Flag', 'FamilyMemberHistory', 'ImagingStudy',
      'Media', 'Practitioner', 'PractitionerRole', 'Organization', 'Location',
      'Appointment', 'Communication', 'RiskAssessment'
    ]
  },

  // UI Configuration
  ui: {
    title: import.meta.env.VITE_TITLE || yamlConfig?.frontend?.title || 'FHIR Patient Search',
    defaultPageSize: parseInt(import.meta.env.VITE_DEFAULT_PAGE_SIZE) || yamlConfig?.frontend?.ui?.default_page_size || 50,
    maxSearchResults: parseInt(import.meta.env.VITE_MAX_SEARCH_RESULTS) || yamlConfig?.frontend?.ui?.max_search_results || 200,
    pageSizeOptions: yamlConfig?.frontend?.ui?.page_size_options || [25, 50, 100, 200],
    enableExport: import.meta.env.VITE_ENABLE_EXPORT !== 'false' && (yamlConfig?.frontend?.ui?.enable_export !== false),
    enableFilters: import.meta.env.VITE_ENABLE_FILTERS !== 'false' && (yamlConfig?.frontend?.ui?.enable_filters !== false),
    aggregateEnabled: import.meta.env.VITE_AGGREGATE_ENABLED === 'true' || (yamlConfig?.frontend?.ui?.aggregate_enabled === true),
  },

  // Cache Configuration
  cache: {
    requestCacheTtl: parseInt(import.meta.env.VITE_CACHE_TTL) || yamlConfig?.frontend?.cache?.request_cache_ttl_minutes * 60 * 1000 || 5 * 60 * 1000, // 5 minutes in ms
    maxCacheSize: parseInt(import.meta.env.VITE_MAX_CACHE_SIZE) || yamlConfig?.frontend?.cache?.max_cache_size || 100,
  },

  // Feature Flags
  features: {
    conditionCodeSearch: import.meta.env.VITE_CONDITION_SEARCH !== 'false' && (yamlConfig?.features?.condition_code_search !== false),
    ageFiltering: import.meta.env.VITE_AGE_FILTERING !== 'false' && (yamlConfig?.features?.age_filtering !== false),
    genderFiltering: import.meta.env.VITE_GENDER_FILTERING !== 'false' && (yamlConfig?.features?.gender_filtering !== false),
    demographicSearch: import.meta.env.VITE_DEMOGRAPHIC_SEARCH !== 'false' && (yamlConfig?.features?.demographic_search !== false),
    patientCaching: import.meta.env.VITE_PATIENT_CACHING !== 'false' && (yamlConfig?.features?.patient_caching !== false),
    backgroundPrefetch: import.meta.env.VITE_BACKGROUND_PREFETCH !== 'false' && (yamlConfig?.features?.background_prefetch !== false),
    exportFunctionality: import.meta.env.VITE_EXPORT_FUNCTIONALITY !== 'false' && (yamlConfig?.features?.export_functionality !== false),
    advancedFilters: import.meta.env.VITE_ADVANCED_FILTERS !== 'false' && (yamlConfig?.features?.advanced_filters !== false),
    aggregateEnabled: import.meta.env.VITE_AGGREGATE_ENABLED === 'true' || (yamlConfig?.frontend?.ui?.aggregate_enabled === true),
    progressEnabled: import.meta.env.VITE_PROGRESS_ENABLED !== 'false' && (yamlConfig?.backend?.aggregate?.progress_enabled !== false),
  },

  // Search Configuration
  search: {
    conditionCodes: yamlConfig?.search_parameters?.condition_codes || [],
    ageRanges: yamlConfig?.search_parameters?.age?.default_ranges || [
      { name: "Children", min: 0, max: 17 },
      { name: "Adults", min: 18, max: 64 },
      { name: "Seniors", min: 65, max: 150 }
    ],
    genderOptions: yamlConfig?.search_parameters?.gender?.options || [],
    minAge: yamlConfig?.search_parameters?.age?.min_age || 0,
    maxAge: yamlConfig?.search_parameters?.age?.max_age || 150,
  },

  // Performance Settings
  performance: {
    requestTimeout: parseInt(import.meta.env.VITE_REQUEST_TIMEOUT) || yamlConfig?.performance?.request_timeout_seconds * 1000 || 30000,
    maxConcurrentRequests: parseInt(import.meta.env.VITE_MAX_CONCURRENT_REQUESTS) || yamlConfig?.performance?.max_concurrent_requests || 50,
  },

  // Development Settings
  development: {
    enableDebugLogs: import.meta.env.VITE_DEBUG === 'true' || import.meta.env.MODE === 'development',
    enablePerformanceLogging: import.meta.env.VITE_PERFORMANCE_LOGS === 'true',
  }
};

/**
 * Load backend configuration dynamically
 */
export async function loadBackendConfig() {
  try {
    const response = await fetch(`${CONFIG.api.baseUrl}/resources/config/status`);
    if (response.ok) {
      const backendStatus = await response.json();
      if (backendStatus.success) {
        // Update frontend config with backend values
        Object.assign(CONFIG.fhir, {
          baseUrl: backendStatus.configuration?.fhir_base_url || CONFIG.fhir.baseUrl,
          supportedResources: backendStatus.configuration?.supported_resources || CONFIG.fhir.supportedResources
        });
        
        Object.assign(CONFIG.features, backendStatus.supported_features || CONFIG.features);
        
        return backendStatus;
      }
    }
  } catch (error) {
    console.warn('Could not load backend configuration, using frontend defaults:', error.message);
  }
  return null;
}

/**
 * Validate configuration
 */
export function validateConfig() {
  const issues = [];
  
  if (!CONFIG.api.baseUrl) {
    issues.push('API base URL is not configured');
  }
  
  if (!CONFIG.fhir.baseUrl) {
    issues.push('FHIR base URL is not configured');
  }
  
  if (CONFIG.ui.defaultPageSize <= 0 || CONFIG.ui.defaultPageSize > 1000) {
    issues.push('Invalid default page size');
  }
  
  if (issues.length > 0) {
    console.warn('Configuration validation issues:', issues);
  }
  
  return issues.length === 0;
}

/**
 * Get environment name
 */
export function getEnvironment() {
  return import.meta.env.MODE || 'development';
}

/**
 * Check if feature is enabled
 */
export function isFeatureEnabled(feature) {
  return CONFIG.features[feature] === true;
}

// Validate configuration on load
validateConfig();

// Export individual sections for convenience
export const API_CONFIG = CONFIG.api;
export const FHIR_CONFIG = CONFIG.fhir;
export const UI_CONFIG = CONFIG.ui;
export const CACHE_CONFIG = CONFIG.cache;
export const FEATURE_FLAGS = CONFIG.features;
export const SEARCH_CONFIG = CONFIG.search;

export default CONFIG;