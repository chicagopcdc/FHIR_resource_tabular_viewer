import { render, screen } from '@testing-library/react';
import App from './App';

// Mock FHIR API calls to avoid network requests during tests
jest.mock('./api', () => ({
  fetchResources: jest.fn().mockResolvedValue({ success: true, data: [], pagination: {} }),
  loadPatientsWithFilters: jest.fn().mockResolvedValue({ success: true, data: [], pagination: {} }),
  loadPatients: jest.fn().mockResolvedValue({ success: true, data: [], pagination: {} }),
}));
jest.mock('./filterResourceCache', () => ({
  initializeFilterCache: jest.fn().mockResolvedValue(),
  getFilterResources: jest.fn(),
  getFilterCacheStats: jest.fn(),
  clearFilterCache: jest.fn(),
}));

test('renders FHIR Patient Viewer header', () => {
  render(<App />);
  const heading = screen.getByText(/FHIR Patient Viewer/i);
  expect(heading).toBeInTheDocument();
});
