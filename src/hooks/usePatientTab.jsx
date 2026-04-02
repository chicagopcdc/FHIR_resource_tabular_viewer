// src/hooks/usePatientTab.jsx
// Tab-specific TanStack Query hooks for PatientDetails.
// Each hook only fires when that tab is active (enabled flag).
// TanStack handles caching, cancellation, and stale-while-revalidate automatically.

import { useQuery } from '@tanstack/react-query';
import * as api from '../api';
import { CONFIG } from '../config';

/**
 * Fetch basic patient demographics only — runs on mount, no tab required.
 */
export function usePatientBasic(patientId) {
  return useQuery({
    queryKey: ['patient', 'basic', patientId],
    queryFn: () => api.getByIdDetailed('Patient', patientId),
    enabled: !!patientId,
    staleTime: 10 * 60 * 1000,  // 10 min — demographics don't change often
    retry: 2,
  });
}

/**
 * Fetch Observations — only fires when the measurements or labs tab is active.
 */
export function usePatientObservations(patientId, page = 1, enabled = false) {
  const offset = (page - 1) * CONFIG.ui.defaultPageSize;
  return useQuery({
    queryKey: ['patient', patientId, 'Observation', page],
    queryFn: () =>
      api.getPatientResources(patientId, 'Observation', CONFIG.ui.defaultPageSize, page, offset),
    enabled: !!patientId && enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Generic single-resource-type fetcher for any tab.
 * Pass enabled=true only when that tab is active.
 */
export function useTabResource(patientId, resourceType, page = 1, enabled = false) {
  const offset = (page - 1) * CONFIG.ui.defaultPageSize;
  return useQuery({
    queryKey: ['patient', patientId, resourceType, page],
    queryFn: () =>
      api.getPatientResources(patientId, resourceType, CONFIG.ui.defaultPageSize, page, offset),
    enabled: !!patientId && !!resourceType && enabled,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Fetch supported resource types for the "Add Tab" dialog.
 */
export function useAvailableResourceTypes() {
  return useQuery({
    queryKey: ['supportedResources'],
    queryFn: () => api.getSupportedResources(),
    staleTime: 60 * 60 * 1000, // 1 hour — rarely changes
    retry: 1,
  });
}
