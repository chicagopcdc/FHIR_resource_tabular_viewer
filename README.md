# Google Summer of Code 2025

## Data for the Common Good

**Contributor:** Manjula Kudapa

- 📧 Email: manjulakudapa819@gmail.com
- 💻 GitHub: [Manjula-819](https://github.com/Manjula-819)
- 🔗 LinkedIn: [Manjula Kudapa](https://www.linkedin.com/in/manjula-kudapa-238270251/)

**Mentor:** Paul Murdoch

# FHIR Resource Viewer Application

A comprehensive React-based web application for searching, filtering, and analyzing FHIR (Fast Healthcare Interoperability Resources) patient data. Built with a dynamic, configuration-driven architecture that supports real-time patient search, advanced filtering, and detailed medical data visualization.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Directory Structure](#directory-structure)
- [Configuration System](#configuration-system)
- [Core Components](#core-components)
- [API Integration](#api-integration)
- [Installation & Setup](#installation--setup)
- [Usage Guide](#usage-guide)
- [Development](#development)
- [Technical Details](#technical-details)
- [Troubleshooting](#troubleshooting)

## Overview

The FHIR Patient Search Application provides healthcare professionals and developers with a powerful interface to interact with FHIR-compliant healthcare data. The application supports dynamic resource discovery, advanced filtering capabilities, and comprehensive patient data visualization across multiple FHIR resource types.

### Key Features

- **Dynamic Patient Search**: Real-time search across FHIR Patient resources
- **Advanced Filtering**: Configuration-driven filter system supporting multiple resource types
- **Medical Data Visualization**: Tabbed interface for patient details, measurements, labs, and clinical notes
- **Time-Series Analysis**: Trend visualization for laboratory results and vital signs
- **Resource Management**: Dynamic tab system for configurable FHIR resource types
- **Export Functionality**: Data export capabilities for analysis and reporting
- **Responsive Design**: Mobile-friendly interface with adaptive layouts

## Architecture

The application follows a modular, component-based architecture with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │    App.js   │  │ Components  │  │  Configuration      │  │
│  │ (Main App)  │  │  Library    │  │   System           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│                     API Layer                               │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Backend FastAPI Server                     │ │
│  │  • Patient Search      • Filter Management             │ │
│  │  • Resource Discovery  • Data Transformation           │ │
│  │  • Metadata Endpoints  • Caching Layer                │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    FHIR Server                              │
│                (External FHIR API)                         │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **User Interaction**: User performs search or applies filters
2. **Frontend Processing**: React components handle UI state and validation
3. **API Communication**: Requests sent to backend FastAPI server
4. **Data Transformation**: Backend processes and normalizes FHIR data
5. **Response Handling**: Frontend receives processed data and updates UI
6. **Visualization**: Components render data in appropriate format

## Directory Structure

```
final-fhir/
├── fhir-backend-dynamic/            # Backend (FastAPI/Flask-based service)
│   ├── app/                         # Application source
│   │   ├── core/                    # Core utilities
│   │   │   └── logging.py           # Logging configuration
│   │   ├── models/                  # Data models
│   │   │   └── server.py            # Server model
│   │   ├── routers/                 # API routes
│   │   │   ├── aggregate.py         # Aggregation endpoints
│   │   │   ├── filters.py           # Filter endpoints
│   │   │   ├── health.py            # Health check endpoint
│   │   │   ├── metadata.py          # Metadata endpoints
│   │   │   ├── references.py        # Reference endpoints
│   │   │   ├── resources.py         # Resource endpoints
│   │   │   └── servers.py           # Server management endpoints
│   │   ├── services/                # Service layer
│   │   │   ├── aggregation.py       # Aggregation service
│   │   │   ├── patient_scoring.py   # NEW - Patient scoring and filtering logic
│   │   │   ├── cache_manager.py     # Cache handling
│   │   │   ├── data_availability.py # Data availability checks
│   │   │   ├── errors.py            # Error handling
│   │   │   ├── fhir.py              # FHIR utilities
│   │   │   ├── http.py              # HTTP utilities
│   │   │   ├── path_extractor.py    # Path extraction logic
│   │   │   ├── ratelimit.py         # Rate limiting service
│   │   │   ├── registry.py          # Registry service
│   │   │   └── schema.py            # Schema validation
│   │   ├── config.py                # Backend configuration
│   │   ├── main.py                  # Application entrypoint
│   │   └── startup.py               # Startup logic
│   ├── requirements.txt             # Backend dependencies
│   └── tests/                       # Backend tests
│       └── test_aggregation.py
│
├── public/                          # Static assets for React
│   ├── index.html                   # Root HTML file
│   ├── favicon.ico                  # App icon
│   ├── manifest.json                # PWA config
│   └── logo192.png, logo512.png     # Logos
│
├── src/                             # React frontend source
│   ├── __tests__/                   # Frontend tests
│   │   └── aggregateApi.test.js
│   ├── hooks/                       # React hooks
│   │   └── useAggregatedData.js
│   ├── services/                    # Service layer
│   │   ├── api.js                   # API communication
│   │   ├── aggregateApi.js          # Aggregated API calls
│   │   └── tabFilterService.js      # Filtering logic
│   ├── components/                  # React components
│   │   ├── App.js                   # Main app component
│   │   ├── PatientDetails.js        # Patient detail view
│   │   ├── PatientTable.js          # Patient list/table
│   │   ├── Labs.js                  # Lab results
│   │   ├── LabsContainer.js         # Labs container
│   │   ├── LabsTimeSeries.js        # Time series labs
│   │   ├── Measurements.js          # Measurements display
│   │   ├── Notes.js                 # Notes section
│   │   ├── GeneralInformation.js    # Patient demographics
│   │   ├── DynamicFilterSidebar.js  # Sidebar filters
│   │   ├── DynamicResourceTab.js    # Resource tab view
│   │   ├── AddTabModal.js           # Add new tab modal
│   │   └── Header.js                # App header
│   ├── styles/                      # CSS files
│   │   ├── App.css
│   │   ├── Dynamic.css
│   │   ├── PatientDetails.css
│   │   └── PatientTable.css
│   ├── config.js                    # Frontend config
│   └── index.js                     # React entry point
│
├── CONFIG.md                        # Project configuration guide
├── config.yaml                      # Global config
├── package.json                     # NPM dependencies
├── package-lock.json                # Dependency lockfile
├── restart-backend.bat              # Backend restart script (Windows)
├── test_filters.html                # Standalone filter testing page
└── README.md                        # Documentation

```

## Configuration System

The application uses a dual-configuration approach supporting both YAML and JavaScript configuration:

### config.yaml

Central configuration file containing:

- **FHIR Server Settings**: Base URLs, timeouts, resource definitions
- **Backend Configuration**: API endpoints, caching policies
- **Frontend Settings**: UI preferences, feature flags
- **Filter Definitions**: Dynamic filter configurations
- **Resource Categories**: FHIR resource organization
- **Search Parameters**: Default search configurations

### config.js

JavaScript configuration layer providing:

- **Environment Variable Support**: Development/production configurations
- **Runtime Configuration**: Dynamic configuration loading
- **Feature Flags**: Conditional feature enablement
- **API Configuration**: Endpoint and timeout settings

## Core Components

### App.js

Main application component coordinating:

- **State Management**: Central application state
- **Route Handling**: Navigation and view management
- **Data Loading**: Initial data fetching and caching
- **Filter Coordination**: Global filter state management

### PatientDetails.js

Comprehensive patient information interface featuring:

- **Tabbed Navigation**: Organized medical data display
- **Lazy Loading**: Performance-optimized data loading
- **Dynamic Tabs**: Configuration-driven tab system
- **Export Functionality**: Data export capabilities

### DynamicFilterSidebar.js

Advanced filtering system providing:

- **Configuration-Driven Filters**: Backend-defined filter options
- **Multi-Resource Filtering**: Cross-resource filter capabilities
- **Real-Time Updates**: Dynamic filter option generation
- **Staged Filtering**: Preview changes before application

### Medical Data Components

#### Labs.js & LabsContainer.js

Laboratory results management:

- **Inline Filtering**: Search and filter laboratory data
- **Reference Range Display**: Normal value indicators
- **Status Tracking**: Test result status management
- **Tabbed Interface**: Current results vs. time-series analysis

#### LabsTimeSeries.js

Advanced laboratory data analysis:

- **Trend Visualization**: SVG-based charting system
- **Multi-Test Comparison**: Comparative analysis tools
- **Date Range Filtering**: Time-based data filtering
- **Interactive Charts**: Clickable trend analysis

#### Measurements.js

Vital signs and measurement tracking:

- **Dynamic Filtering**: Type-based measurement filtering
- **Numeric Range Filters**: Value-based filtering
- **Categorization**: Automatic measurement categorization
- **Search Integration**: Text-based measurement search

#### Notes.js

Clinical documentation management:

- **Document Types**: Support for multiple document formats
- **Search Functionality**: Full-text search across documents
- **Provider Filtering**: Author-based document filtering
- **Modal Viewing**: Detailed document examination

## API Integration

### Core API Functions (api.js)

#### Patient Management

```javascript
// Search patients with filters
searchPatients(searchTerm, filters, pagination);

// Get patient details by ID
getPatientDetails(patientId);

// Get patient resources by type
getPatientResources(patientId, resourceType, limit);
```

#### Resource Discovery

```javascript
// Get available FHIR resources
getAvailableResources();

// Get resource metadata
getResourceMetadata(resourceType);

// Get filter configurations
getFilterTargets();
```

#### Data Processing

```javascript
// Transform FHIR data for frontend consumption
transformFhirData(rawData, resourceType);

// Normalize patient data
normalizePatientData(patient);

// Extract medical data
extractMedicalData(resources);
```

### API Endpoints

| Endpoint                              | Method | Description                   |
| ------------------------------------- | ------ | ----------------------------- |
| `/api/patients/search`                | POST   | Search patients with filters  |
| `/api/patients/{id}`                  | GET    | Get patient details           |
| `/api/patients/{id}/resources/{type}` | GET    | Get patient resources         |
| `/api/resources/available`            | GET    | Get available FHIR resources  |
| `/api/filters/targets`                | GET    | Get filter configurations     |
| `/api/filters/{type}/metadata`        | GET    | Get resource-specific filters |

## Installation & Setup

### Prerequisites

- Node.js (v14 or higher)
- NPM or Yarn package manager
- Backend FastAPI server (running on port 8000)
- Access to FHIR-compliant server

### Installation Steps

1. **Clone Repository**

```bash
git clone <repository-url>
cd final-fhir
```

2. **Install Dependencies**

```bash
npm install
```

3. **Configure Environment**
   Create `.env` file:

```env
REACT_APP_API_BASE_URL=http://localhost:8000
REACT_APP_FHIR_BASE_URL=https://hapi.fhir.org/baseR4/
REACT_APP_TITLE=FHIR Patient Search
```

4. **Start Development Server**

```bash
npm start
```

5. **Access Application**
   Navigate to `http://localhost:3000`

### Production Build

```bash
npm run build
```

## Usage Guide

### Basic Patient Search

1. **Search Interface**

   - Enter patient name, ID, or other identifiers
   - Use wildcard characters for broader searches
   - Apply demographic filters as needed

2. **Filter Application**

   - Open filter sidebar using filter button
   - Select desired filter criteria
   - Apply filters to refine results
   - Clear filters to reset search

3. **Patient Selection**
   - Click on patient row to view details
   - Patient information loads in tabbed interface
   - Navigate between different data types

### Advanced Filtering

1. **Dynamic Filters**

   - Filters automatically adjust based on available data
   - Resource-specific filters load on-demand
   - Multi-select options for complex filtering

2. **Medical Data Filters**
   - Laboratory results: Filter by test type, date range, values
   - Measurements: Filter by measurement type, numeric ranges
   - Notes: Search by content, provider, document type

### Data Visualization

1. **Laboratory Results**

   - Current lab results in tabular format
   - Time-series analysis with trend charts
   - Abnormal value highlighting

2. **Measurements**

   - Vital signs tracking
   - Historical measurement trends
   - Category-based organization

3. **Clinical Notes**
   - Document reference viewing
   - Full-text search capabilities
   - Provider and date filtering

## Development

### Development Workflow

1. **Component Development**

   - Follow React functional component patterns
   - Use hooks for state management
   - Implement proper prop validation

2. **Styling Guidelines**

   - Use CSS modules for component-specific styles
   - Follow consistent naming conventions
   - Implement responsive design principles

3. **API Integration**
   - Use centralized API service layer
   - Implement proper error handling
   - Cache frequently accessed data

### Code Organization

#### Component Structure

```javascript
// Standard component structure
import React, { useState, useEffect } from "react";
import "./ComponentName.css";

const ComponentName = ({ prop1, prop2, ...otherProps }) => {
  // State management
  const [state, setState] = useState(initialValue);

  // Effects and lifecycle
  useEffect(() => {
    // Component logic
  }, [dependencies]);

  // Event handlers
  const handleEvent = () => {
    // Event logic
  };

  // Render logic
  return <div className="component-container">{/* Component content */}</div>;
};

export default ComponentName;
```

#### API Service Pattern

```javascript
// API service structure
export const serviceName = {
  async methodName(parameters) {
    try {
      const response = await safeFetch(endpoint, options);
      return response.data;
    } catch (error) {
      console.error("Service error:", error);
      throw error;
    }
  },
};
```

### Testing

#### Filter Testing

Use `test_filters.html` for backend filter API testing:

1. Open file in web browser
2. Test individual resource filters
3. Verify multi-resource filter loading
4. Check API connectivity and response formats

#### Component Testing

- Implement unit tests for individual components
- Test API integration scenarios
- Validate filter logic and data transformation

## Technical Details

### State Management

- **Local State**: Component-level state using React hooks
- **Shared State**: Props drilling for component communication
- **Global State**: Application-level state in App.js

### Performance Optimizations

- **Lazy Loading**: Components and data loaded on-demand
- **Memoization**: Expensive calculations cached using useMemo
- **Virtual Scrolling**: Large datasets handled efficiently
- **API Caching**: Frequently accessed data cached locally

### Error Handling

- **API Errors**: Graceful handling with user-friendly messages
- **Component Errors**: Error boundaries prevent application crashes
- **Validation**: Input validation and sanitization
- **Logging**: Comprehensive error logging for debugging

### Security Considerations

- **Input Sanitization**: All user inputs validated and sanitized
- **API Security**: Secure communication with backend services
- **Data Privacy**: Patient data handled according to healthcare regulations
- **Access Control**: Appropriate user permissions and restrictions

## Troubleshooting

### Common Issues

#### API Connection Problems

```
Error: Unable to connect to backend API
Solution: Verify backend server is running on correct port (8000)
Check: config.js API_BASE_URL configuration
```

#### Filter Loading Issues

```
Error: Filters not loading for resource type
Solution: Check backend filter endpoint availability
Debug: Use test_filters.html to test API endpoints directly
```

#### Performance Issues

```
Issue: Slow loading of patient data
Solution: Implement pagination, reduce data payload size
Check: Network tab for API response times
```

#### Configuration Problems

```
Issue: Features not working as expected
Solution: Verify config.yaml settings match requirements
Check: Environment variables in .env file
```

### Debug Tools

1. **Browser Developer Tools**

   - Network tab for API monitoring
   - Console for error messages
   - React Developer Tools for component inspection

2. **Test Utilities**

   - `test_filters.html` for API testing
   - Component props validation
   - API response format verification

3. **Logging**
   - Console logging throughout application
   - API request/response logging
   - Error tracking and reporting

### Support Resources

- **Configuration Reference**: config.yaml documentation
- **API Documentation**: Backend API endpoint specifications
- **Component Library**: Individual component documentation
- **FHIR Specification**: Official FHIR resource documentation

---
