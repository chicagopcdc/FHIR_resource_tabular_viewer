// src/__tests__/aggregateApi.test.js
// Tests for aggregate API integration

import * as aggregateApi from '../services/aggregateApi';
import { CONFIG } from '../config';

// Mock fetch for testing
global.fetch = jest.fn();

// Mock CONFIG
jest.mock('../config', () => ({
  CONFIG: {
    api: {
      baseUrl: 'http://localhost:8000',
      timeout: 30000,
      maxRetries: 2
    },
    features: {
      aggregateEnabled: true,
      progressEnabled: true
    },
    ui: {
      defaultPageSize: 50
    }
  }
}));

describe('Aggregate API Service', () => {
  beforeEach(() => {
    fetch.mockClear();
    // Clear session storage
    global.sessionStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      removeItem: jest.fn()
    };
  });

  describe('createAggregate', () => {
    it('should create aggregate dataset successfully', async () => {
      const mockResponse = {
        dataset_id: 'dataset-123',
        total: 100,
        truncated: false,
        build_time_ms: 1500,
        cache_hit: false
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => mockResponse
      });

      const result = await aggregateApi.createAggregate(
        'Patient',
        { gender: 'male' },
        { name: 'Smith' },
        'test-session-123'
      );

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/aggregate/Patient',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json; charset=utf-8'
          }),
          body: JSON.stringify({
            filters: { gender: 'male' },
            search_params: { name: 'Smith' },
            user_session: 'test-session-123'
          })
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should throw error when user session is missing', async () => {
      await expect(
        aggregateApi.createAggregate('Patient', {}, {}, null)
      ).rejects.toThrow('User session is required for aggregate requests');
    });

    it('should handle API errors gracefully', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ detail: 'Aggregation failed' })
      });

      await expect(
        aggregateApi.createAggregate('Patient', {}, {}, 'test-session')
      ).rejects.toThrow('Aggregation failed');
    });
  });

  describe('getDatasetSlice', () => {
    it('should retrieve dataset slice successfully', async () => {
      const mockResponse = {
        dataset_id: 'dataset-123',
        total: 100,
        offset: 20,
        limit: 10,
        items: [
          { resourceType: 'Patient', id: 'patient-21' },
          { resourceType: 'Patient', id: 'patient-22' }
        ],
        has_next: true,
        has_prev: true,
        truncated: false
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await aggregateApi.getDatasetSlice(
        'dataset-123',
        20,
        10,
        'test-session'
      );

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/aggregate/dataset-123/slice?offset=20&limit=10&user_session=test-session',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Accept': 'application/json; charset=utf-8'
          })
        })
      );

      expect(result).toEqual(mockResponse);
    });

    it('should use default pagination parameters', async () => {
      const mockResponse = {
        dataset_id: 'dataset-123',
        total: 50,
        offset: 0,
        limit: 50,
        items: [],
        has_next: false,
        has_prev: false
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      await aggregateApi.getDatasetSlice('dataset-123', undefined, undefined, 'test-session');

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('offset=0&limit=50'),
        expect.any(Object)
      );
    });
  });

  describe('fetchResourcesWithAggregate', () => {
    it('should use aggregate flow when enabled', async () => {
      // Mock aggregate creation
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          dataset_id: 'dataset-123',
          total: 75,
          truncated: false,
          build_time_ms: 800,
          cache_hit: false
        })
      });

      // Mock slice retrieval
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          dataset_id: 'dataset-123',
          total: 75,
          offset: 0,
          limit: 25,
          items: [
            { resourceType: 'Patient', id: 'patient-1' },
            { resourceType: 'Patient', id: 'patient-2' }
          ],
          has_next: true,
          has_prev: false
        })
      });

      const fallbackFn = jest.fn();
      
      const result = await aggregateApi.fetchResourcesWithAggregate(
        'Patient',
        { gender: 'female' },
        { page: 1, per_page: 25 },
        'test-session',
        fallbackFn
      );

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(75);
      expect(result.aggregate_used).toBe(true);
      expect(fallbackFn).not.toHaveBeenCalled();
    });

    it('should fall back to traditional API when aggregate disabled', async () => {
      // Mock CONFIG to disable aggregate
      CONFIG.features.aggregateEnabled = false;

      const fallbackFn = jest.fn().mockResolvedValue({
        success: true,
        data: [{ resourceType: 'Patient', id: 'fallback-1' }],
        pagination: { total: 1, page: 1, per_page: 50 }
      });

      const result = await aggregateApi.fetchResourcesWithAggregate(
        'Patient',
        { name: 'Smith' },
        { page: 1, per_page: 50 },
        'test-session',
        fallbackFn
      );

      expect(result.aggregate_used).toBe(false);
      expect(fallbackFn).toHaveBeenCalled();
      
      // Restore CONFIG
      CONFIG.features.aggregateEnabled = true;
    });

    it('should fall back when aggregate fails', async () => {
      // Mock aggregate failure
      fetch.mockRejectedValueOnce(new Error('Server unavailable'));

      const fallbackFn = jest.fn().mockResolvedValue({
        success: true,
        data: [{ resourceType: 'Patient', id: 'fallback-1' }],
        pagination: { total: 1, page: 1, per_page: 50 }
      });

      const result = await aggregateApi.fetchResourcesWithAggregate(
        'Patient',
        { name: 'Smith' },
        { page: 1, per_page: 50 },
        'test-session',
        fallbackFn
      );

      expect(result.aggregate_used).toBe(false);
      expect(result.aggregate_error).toBe('Server unavailable');
      expect(fallbackFn).toHaveBeenCalled();
    });
  });

  describe('getDatasetProgress', () => {
    it('should retrieve progress information', async () => {
      const mockProgress = {
        dataset_id: 'dataset-123',
        resource_type: 'Patient',
        status: 'building',
        fetched: 25,
        estimated_total: 100,
        progress_percent: 25,
        build_time_ms: 5000
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProgress
      });

      const result = await aggregateApi.getDatasetProgress('dataset-123');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/aggregate/dataset-123/progress',
        expect.any(Object)
      );

      expect(result).toEqual(mockProgress);
    });
  });

  describe('deleteDataset', () => {
    it('should delete dataset successfully', async () => {
      const mockResponse = {
        success: true,
        dataset_id: 'dataset-123',
        message: 'Dataset deleted successfully'
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await aggregateApi.deleteDataset('dataset-123', 'test-session');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/aggregate/dataset-123?user_session=test-session',
        expect.objectContaining({
          method: 'DELETE'
        })
      );

      expect(result).toEqual(mockResponse);
    });
  });

  describe('Session Management', () => {
    it('should generate unique session identifiers', () => {
      const session1 = aggregateApi.generateUserSession();
      const session2 = aggregateApi.generateUserSession();

      expect(session1).toMatch(/^session_[a-z0-9]+_[a-z0-9]+$/);
      expect(session2).toMatch(/^session_[a-z0-9]+_[a-z0-9]+$/);
      expect(session1).not.toBe(session2);
    });

    it('should persist session in sessionStorage', () => {
      const mockSession = 'session_test123_abc456';
      global.sessionStorage.getItem.mockReturnValue(mockSession);

      const session = aggregateApi.getCurrentSession();

      expect(global.sessionStorage.getItem).toHaveBeenCalledWith('fhir_user_session');
      expect(session).toBe(mockSession);
    });

    it('should create new session if none exists', () => {
      global.sessionStorage.getItem.mockReturnValue(null);

      const session = aggregateApi.getCurrentSession();

      expect(global.sessionStorage.setItem).toHaveBeenCalledWith('fhir_user_session', session);
      expect(session).toMatch(/^session_[a-z0-9]+_[a-z0-9]+$/);
    });

    it('should clear session storage', () => {
      aggregateApi.clearCurrentSession();

      expect(global.sessionStorage.removeItem).toHaveBeenCalledWith('fhir_user_session');
    });
  });

  describe('Error Handling', () => {
    it('should retry on network failures', async () => {
      // First two calls fail, third succeeds
      fetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ dataset_id: 'success' })
        });

      const result = await aggregateApi.createAggregate('Patient', {}, {}, 'test-session');

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(result.dataset_id).toBe('success');
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'AbortError';
      
      fetch.mockRejectedValue(timeoutError);

      await expect(
        aggregateApi.createAggregate('Patient', {}, {}, 'test-session')
      ).rejects.toThrow('Aggregate request timed out');

      expect(fetch).toHaveBeenCalledTimes(2); // Should retry once
    });
  });
});