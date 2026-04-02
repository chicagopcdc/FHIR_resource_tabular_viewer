import React, { useState } from 'react';
import Labs from './Labs';
import LabsTimeSeries from './LabsTimeSeries';

const LabsContainer = ({ observations = [], diagnosticReports = [], patientId, pagination, onPageChange, loading, ...otherProps }) => {
  const [activeLabView, setActiveLabView] = useState('current'); // 'current' or 'timeseries'

  return (
    <div className="labs-container">
      {/* Lab View Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '2px solid #e9ecef',
        marginBottom: '1rem',
        backgroundColor: '#f8f9fa'
      }}>
        <button
          onClick={() => setActiveLabView('current')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            backgroundColor: activeLabView === 'current' ? '#007bff' : 'transparent',
            color: activeLabView === 'current' ? 'white' : '#495057',
            fontWeight: activeLabView === 'current' ? '600' : '500',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontSize: '0.9rem',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            if (activeLabView !== 'current') {
              e.target.style.backgroundColor = '#e9ecef';
            }
          }}
          onMouseLeave={(e) => {
            if (activeLabView !== 'current') {
              e.target.style.backgroundColor = 'transparent';
            }
          }}
        >
          Labs
        </button>
        <button
          onClick={() => setActiveLabView('timeseries')}
          style={{
            padding: '0.75rem 1.5rem',
            border: 'none',
            backgroundColor: activeLabView === 'timeseries' ? '#007bff' : 'transparent',
            color: activeLabView === 'timeseries' ? 'white' : '#495057',
            fontWeight: activeLabView === 'timeseries' ? '600' : '500',
            borderRadius: '6px 6px 0 0',
            cursor: 'pointer',
            fontSize: '0.9rem',
            marginLeft: '2px',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            if (activeLabView !== 'timeseries') {
              e.target.style.backgroundColor = '#e9ecef';
            }
          }}
          onMouseLeave={(e) => {
            if (activeLabView !== 'timeseries') {
              e.target.style.backgroundColor = 'transparent';
            }
          }}
        >
          Graph View
        </button>
      </div>

      {/* Content */}
      <div style={{ minHeight: '500px' }}>
        {activeLabView === 'current' ? (
          <Labs 
            observations={observations}
            diagnosticReports={diagnosticReports}
            patientId={patientId}
            pagination={pagination}
            onPageChange={onPageChange}
            loading={loading}
            {...otherProps}
          />
        ) : (
          <LabsTimeSeries
            observations={observations}
            diagnosticReports={diagnosticReports}
            patientId={patientId}
          />
        )}
      </div>
    </div>
  );
};

export default LabsContainer;