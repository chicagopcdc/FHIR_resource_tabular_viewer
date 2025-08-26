import React, { useState } from 'react';
import { Search, Download, RefreshCw, Settings, Filter } from 'lucide-react';

const Header = ({ 
  onSearchChange, 
  onSidebarToggle, 
  onExport, 
  onRefresh, 
  onSettings,
  searchTerm = ''
}) => {
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);

  const handleSearch = (event) => {
    const term = event.target.value;
    setLocalSearchTerm(term);
    onSearchChange && onSearchChange(term);
  };

  const handleQuickFiltersClick = () => {
    console.log('Quick Filters button clicked!');
    onSidebarToggle && onSidebarToggle();
  };

  const handleExport = () => {
    onExport ? onExport() : console.log('Export functionality');
  };

  const handleRefresh = () => {
    onRefresh ? onRefresh() : window.location.reload();
  };

  const handleSettings = () => {
    onSettings ? onSettings() : console.log('Settings functionality');
  };

  return (
    <div style={{ 
      background: 'white', 
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)', 
      position: 'relative', 
      zIndex: 100 
    }}>
      {/* Top Header */}
      <div style={{ 
        padding: '1rem 1.5rem', 
        borderBottom: '1px solid #e0e0e0' 
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <div>
            <h1 style={{ 
              fontSize: '1.5rem', 
              fontWeight: '600', 
              color: '#333', 
              margin: 0 
            }}>
              FHIR Patient Viewer
            </h1>
            <p style={{ 
              fontSize: '0.9rem', 
              color: '#666', 
              margin: '0.25rem 0 0 0' 
            }}>
              Healthcare Data Management System
            </p>
          </div>
          <div style={{ 
            fontSize: '0.9rem', 
            color: '#666' 
          }}>
            Current Date and Time: Sunday, July 13, 2025 at 08:17 AM EDT
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div style={{ 
        padding: '1rem 1.5rem', 
        borderBottom: '1px solid #e0e0e0' 
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center' 
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '1rem' 
          }}>
            <button
              onClick={handleQuickFiltersClick}
              style={{
                background: '#dc3545',
                color: 'white',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <Filter style={{ width: '16px', height: '16px' }} />
              Quick Filters
            </button>
            <h2 style={{ 
              fontSize: '1.25rem', 
              fontWeight: '600', 
              color: '#333', 
              margin: 0 
            }}>
              FHIR Resource Viewer - Patient Search
            </h2>
          </div>
          <div style={{ 
            display: 'flex', 
            gap: '0.5rem' 
          }}>
            <button
              onClick={handleExport}
              style={{
                background: '#f8f9fa',
                border: '1px solid #dee2e6',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.9rem',
                color: '#007bff'
              }}
            >
              <Download style={{ width: '16px', height: '16px' }} />
              <span>Export</span>
            </button>
            <button
              onClick={handleRefresh}
              style={{
                background: '#f8f9fa',
                border: '1px solid #dee2e6',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.9rem',
                color: '#007bff'
              }}
            >
              <RefreshCw style={{ width: '16px', height: '16px' }} />
              <span>Refresh</span>
            </button>
            <button
              onClick={handleSettings}
              style={{
                background: '#f8f9fa',
                border: '1px solid #dee2e6',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.9rem',
                color: '#6c757d'
              }}
            >
              <Settings style={{ width: '16px', height: '16px' }} />
              <span>Settings</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ 
        padding: '1rem 1.5rem', 
        borderBottom: '1px solid #e0e0e0' 
      }}>
        <div style={{ 
          position: 'relative', 
          maxWidth: '300px' 
        }}>
          <Search style={{ 
            position: 'absolute', 
            left: '12px', 
            top: '50%', 
            transform: 'translateY(-50%)', 
            width: '20px', 
            height: '20px', 
            color: '#999' 
          }} />
          <input
            type="text"
            value={localSearchTerm}
            onChange={handleSearch}
            placeholder="Search"
            style={{
              padding: '0.5rem 1rem 0.5rem 2.5rem',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              width: '100%',
              fontSize: '1rem',
              outline: 'none'
            }}
            onFocus={(e) => {
              e.target.style.borderColor = '#007bff';
              e.target.style.boxShadow = '0 0 0 2px rgba(0,123,255,0.25)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = '#dee2e6';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default Header;