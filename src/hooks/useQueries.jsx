import { useQuery } from '@tanstack/react-query';
import * as api from '../api';

export function usePatientDetails(patientId) {
  return useQuery({
    queryKey: ['patient', 'details', patientId],
    queryFn: () => api.getByIdDetailed('Patient', patientId),
    enabled: !!patientId,
    staleTime: 5 * 60 * 1000,
  });
}

export function usePatientResource(patientId, resourceType, page = 1, count = 50, options = {}) {
  const offset = (page - 1) * count;
  return useQuery({
    queryKey: ['patient', patientId, 'resource', resourceType, { page, count }],
    queryFn: () => api.getPatientResources(patientId, resourceType, count, page, offset),
    enabled: !!patientId && !!resourceType && (options.enabled !== false),
    staleTime: 60 * 1000,
  });
}

export function usePatients(params, activeFilters = {}) {
  return useQuery({
    queryKey: ['patients', params, activeFilters],
    queryFn: () => {
      const hasFilters = Object.keys(activeFilters).length > 0 || (activeFilters.filters && Object.keys(activeFilters.filters).length > 0) || (activeFilters.general_filters && Object.keys(activeFilters.general_filters).length > 0);
      return hasFilters ? api.loadPatientsWithFilters(params, activeFilters) : api.loadPatients(params);
    },
    staleTime: 30 * 1000, 
    keepPreviousData: true,
  });
}

export function usePatientFacets(params) {
  return useQuery({
    queryKey: ['patient', 'facets', params],
    queryFn: () => api.fetchPatientFacets(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useResourceTypes() {
  return useQuery({
    queryKey: ['resourceTypes'],
    queryFn: () => api.listResourceTypes(),
    staleTime: 60 * 60 * 1000,
  });
}
