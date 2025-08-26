// src/DynamicResourceTab.js - Fixed to always show table structure
import React, { useState, useEffect } from 'react';
import './PatientDetails.css';
import'./Dynamic.css';

const DynamicResourceTab = ({ 
  resourceType, 
  resourceLabel, 
  resourceData, 
  patientId, 
  onRemoveTab,
  onSort,
  sortConfig,
  filters 
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(resourceData);

  useEffect(() => {
    setData(resourceData);
  }, [resourceData]);

  // Column configurations for different resource types
  const getColumnConfig = (type) => {
    const configs = {
      careplan: [
        { key: 'id', label: 'ID', sortable: true },
        { 
          key: 'title', 
          label: 'Title', 
          sortable: true,
          render: (value) => value || 'Untitled Plan'
        },
        { 
          key: 'status', 
          label: 'Status', 
          sortable: true,
          render: (value) => (
            <span className={`status ${(value || 'unknown').toLowerCase()}`}>
              {value || 'Unknown'}
            </span>
          )
        },
        { 
          key: 'intent', 
          label: 'Intent', 
          sortable: true,
          render: (value) => value || 'Not specified'
        },
        { 
          key: 'created', 
          label: 'Created Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'period_start', 
          label: 'Start Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Not set'
        },
        { 
          key: 'period_end', 
          label: 'End Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Ongoing'
        },
        { 
          key: 'category', 
          label: 'Category', 
          sortable: true,
          render: (value) => value || 'Not categorized'
        }
      ],
      
      conditions: [
        { key: 'id', label: 'ID', sortable: true },
        { 
          key: 'code_display', 
          label: 'Condition', 
          sortable: true,
          render: (value) => value || 'Unknown condition'
        },
        { 
          key: 'clinical_status', 
          label: 'Clinical Status', 
          sortable: true,
          render: (value) => (
            <span className={`status ${(value || 'unknown').toLowerCase()}`}>
              {value || 'Unknown'}
            </span>
          )
        },
        { 
          key: 'verification_status', 
          label: 'Verification Status', 
          sortable: true,
          render: (value) => (
            <span className={`status ${(value || 'unknown').toLowerCase()}`}>
              {value || 'Unknown'}
            </span>
          )
        },
        { 
          key: 'onset_date', 
          label: 'Onset Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'recorded_date', 
          label: 'Recorded Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'severity', 
          label: 'Severity', 
          sortable: true,
          render: (value) => value || 'Not specified'
        }
      ],
      
      encounters: [
        { key: 'id', label: 'ID', sortable: true },
        { 
          key: 'type_display', 
          label: 'Type', 
          sortable: true,
          render: (value) => value || 'Unknown type'
        },
        { 
          key: 'status', 
          label: 'Status', 
          sortable: true,
          render: (value) => (
            <span className={`status ${(value || 'unknown').toLowerCase()}`}>
              {value || 'Unknown'}
            </span>
          )
        },
        { 
          key: 'class_display', 
          label: 'Class', 
          sortable: true,
          render: (value) => value || 'Unknown class'
        },
        { 
          key: 'start_date', 
          label: 'Start Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'end_date', 
          label: 'End Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'location', 
          label: 'Location', 
          sortable: true,
          render: (value) => value || 'Not specified'
        }
      ],

      procedures: [
        { key: 'id', label: 'ID', sortable: true },
        { 
          key: 'code_display', 
          label: 'Procedure', 
          sortable: true,
          render: (value) => value || 'Unknown procedure'
        },
        { 
          key: 'status', 
          label: 'Status', 
          sortable: true,
          render: (value) => (
            <span className={`status ${(value || 'unknown').toLowerCase()}`}>
              {value || 'Unknown'}
            </span>
          )
        },
        { 
          key: 'performed_date', 
          label: 'Performed Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'performer', 
          label: 'Performer', 
          sortable: true,
          render: (value) => value || 'Not specified'
        },
        { 
          key: 'location', 
          label: 'Location', 
          sortable: true,
          render: (value) => value || 'Not specified'
        },
        { 
          key: 'outcome', 
          label: 'Outcome', 
          sortable: false,
          render: (value) => value || 'Not documented'
        }
      ],

      medications: [
        { key: 'id', label: 'ID', sortable: true },
        { 
          key: 'code_display', 
          label: 'Medication', 
          sortable: true,
          render: (value) => value || 'Unknown medication'
        },
        { 
          key: 'status', 
          label: 'Status', 
          sortable: true,
          render: (value) => (
            <span className={`status ${(value || 'unknown').toLowerCase()}`}>
              {value || 'Unknown'}
            </span>
          )
        },
        { 
          key: 'intent', 
          label: 'Intent', 
          sortable: true,
          render: (value) => value || 'Not specified'
        },
        { 
          key: 'authored_date', 
          label: 'Authored Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'dosage', 
          label: 'Dosage', 
          sortable: false,
          render: (value) => value || 'Not specified'
        },
        { 
          key: 'requester', 
          label: 'Requester', 
          sortable: true,
          render: (value) => value || 'Not specified'
        }
      ],

      immunizations: [
        { key: 'id', label: 'ID', sortable: true },
        { 
          key: 'vaccine_display', 
          label: 'Vaccine', 
          sortable: true,
          render: (value) => value || 'Unknown vaccine'
        },
        { 
          key: 'status', 
          label: 'Status', 
          sortable: true,
          render: (value) => (
            <span className={`status ${(value || 'unknown').toLowerCase()}`}>
              {value || 'Unknown'}
            </span>
          )
        },
        { 
          key: 'occurrence_date', 
          label: 'Date Given', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'primary_source', 
          label: 'Primary Source', 
          sortable: true,
          render: (value) => value ? 'Yes' : 'No'
        },
        { 
          key: 'lot_number', 
          label: 'Lot Number', 
          sortable: false,
          render: (value) => value || 'Not recorded'
        },
        { 
          key: 'manufacturer', 
          label: 'Manufacturer', 
          sortable: true,
          render: (value) => value || 'Not specified'
        },
        { 
          key: 'performer', 
          label: 'Performer', 
          sortable: true,
          render: (value) => value || 'Not specified'
        }
      ],

      allergies: [
        { key: 'id', label: 'ID', sortable: true },
        { 
          key: 'code_display', 
          label: 'Allergen', 
          sortable: true,
          render: (value) => value || 'Unknown allergen'
        },
        { 
          key: 'type', 
          label: 'Type', 
          sortable: true,
          render: (value) => value || 'Not specified'
        },
        { 
          key: 'criticality', 
          label: 'Criticality', 
          sortable: true,
          render: (value) => (
            <span className={`criticality ${(value || 'unknown').toLowerCase()}`}>
              {value || 'Not assessed'}
            </span>
          )
        },
        { 
          key: 'clinical_status', 
          label: 'Clinical Status', 
          sortable: true,
          render: (value) => (
            <span className={`status ${(value || 'unknown').toLowerCase()}`}>
              {value || 'Unknown'}
            </span>
          )
        },
        { 
          key: 'recorded_date', 
          label: 'Recorded Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'reaction', 
          label: 'Reaction', 
          sortable: false,
          render: (value) => value || 'Not documented'
        },
        { 
          key: 'recorder', 
          label: 'Recorder', 
          sortable: true,
          render: (value) => value || 'Not specified'
        }
      ],

      careTeam: [
        { key: 'id', label: 'ID', sortable: true },
        { 
          key: 'name', 
          label: 'Team Name', 
          sortable: true,
          render: (value) => value || 'Unnamed team'
        },
        { 
          key: 'participant_name', 
          label: 'Participant', 
          sortable: true,
          render: (value) => value || 'Unknown participant'
        },
        { 
          key: 'role', 
          label: 'Role', 
          sortable: true,
          render: (value) => value || 'Not specified'
        },
        { 
          key: 'status', 
          label: 'Status', 
          sortable: true,
          render: (value) => (
            <span className={`status ${(value || 'unknown').toLowerCase()}`}>
              {value || 'Unknown'}
            </span>
          )
        },
        { 
          key: 'organization', 
          label: 'Organization', 
          sortable: true,
          render: (value) => value || 'Not specified'
        },
        { 
          key: 'period_start', 
          label: 'Start Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'period_end', 
          label: 'End Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Ongoing'
        }
      ],

      diagnosticReports: [
        { key: 'id', label: 'ID', sortable: true },
        { 
          key: 'code_display', 
          label: 'Report Type', 
          sortable: true,
          render: (value) => value || 'Unknown report'
        },
        { 
          key: 'status', 
          label: 'Status', 
          sortable: true,
          render: (value) => (
            <span className={`status ${(value || 'unknown').toLowerCase()}`}>
              {value || 'Unknown'}
            </span>
          )
        },
        { 
          key: 'category', 
          label: 'Category', 
          sortable: true,
          render: (value) => value || 'Not specified'
        },
        { 
          key: 'effective_date', 
          label: 'Effective Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'issued', 
          label: 'Issued Date', 
          sortable: true,
          render: (value) => value ? new Date(value).toLocaleDateString() : 'Unknown'
        },
        { 
          key: 'performer', 
          label: 'Performer', 
          sortable: true,
          render: (value) => value || 'Not specified'
        },
        { 
          key: 'conclusion', 
          label: 'Conclusion', 
          sortable: false,
          render: (value) => (
            <div style={{ maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {value || 'No conclusion'}
            </div>
          )
        }
      ]
    };

    return configs[type] || [
      { key: 'id', label: 'ID', sortable: true },
      { key: 'resourceType', label: 'Type', sortable: true },
      { 
        key: 'status', 
        label: 'Status', 
        sortable: true,
        render: (value) => (
          <span className={`status ${(value || 'unknown').toLowerCase()}`}>
            {value || 'Unknown'}
          </span>
        )
      }
    ];
  };

  const columns = getColumnConfig(resourceType);

  const handleSort = (columnKey) => {
    if (onSort) {
      onSort(columnKey);
    }
  };

  const getSortIcon = (columnKey) => {
    if (sortConfig?.key === columnKey) {
      return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
    }
    return '';
  };

  const getResourceIcon = (type) => {
    const icons = {
      careplan: '📋',
      conditions: '🏥',
      encounters: '📅',
      procedures: '⚕️',
      medications: '💊',
      immunizations: '💉',
      allergies: '⚠️',
      careTeam: '👥',
      diagnosticReports: '📊'
    };
    return icons[type] || '📋';
  };

  const getResourceDescription = (type) => {
    const descriptions = {
      careplan: 'Care plans and treatment programs',
      conditions: 'Medical conditions, diagnoses, and health problems',
      encounters: 'Healthcare visits, appointments, and interactions',
      procedures: 'Medical procedures, interventions, and treatments',
      medications: 'Prescriptions, medication requests, and drug therapy',
      immunizations: 'Vaccination records and immunization history',
      allergies: 'Allergies, intolerances, and adverse reactions',
      careTeam: 'Healthcare team members and care coordination',
      diagnosticReports: 'Laboratory reports and diagnostic test results'
    };
    return descriptions[type] || 'Healthcare resource data';
  };

  const renderTable = () => {
    return (
      <div className="data-table">
        <div className="table-wrapper">
          <table className="dynamic-resource-table">
            <thead>
              <tr>
                {columns.map(column => (
                  <th 
                    key={column.key}
                    className={`${column.sortable ? 'sortable-header' : ''} ${
                      sortConfig?.key === column.key ? 
                        `sorted-${sortConfig.direction}` : ''
                    }`}
                    onClick={column.sortable ? () => handleSort(column.key) : undefined}
                    title={column.sortable ? 'Click to sort' : ''}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(!data || data.length === 0) ? (
                <tr>
                  <td colSpan={columns.length} className="empty-table-cell">
                    <div className="table-empty-state">
                      <span className="empty-icon">{getResourceIcon(resourceType)}</span>
                      <div className="empty-message">
                        <strong>No {resourceLabel} Records</strong>
                        <p>This patient has no {resourceLabel.toLowerCase()} data available</p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                data.map((item, index) => (
                  <tr key={item.id || index}>
                    {columns.map(column => (
                      <td key={column.key}>
                        {column.render 
                          ? column.render(item[column.key], item) 
                          : (item[column.key] || 'N/A')
                        }
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <div>Loading {resourceLabel.toLowerCase()}...</div>
      </div>
    );
  }

  return (
    <div className="dynamic-resource-tab">
      <div className="resource-header">
        <div className="resource-title">
          <div className="title-with-icon">
            <span className="resource-icon-large">{getResourceIcon(resourceType)}</span>
            <div>
              <h2>{resourceLabel}</h2>
              <p className="resource-subtitle">{getResourceDescription(resourceType)}</p>
            </div>
          </div>
          <div className="resource-meta">
            <span className="resource-count">{data?.length || 0} records</span>
            <span className="resource-type-badge">{resourceType}</span>
          </div>
        </div>
        
        <div className="resource-actions">
          <button 
            className="remove-tab-action"
            onClick={onRemoveTab}
            title="Remove this tab"
          >
            <span>Remove Tab</span>
            <span className="remove-icon">×</span>
          </button>
        </div>
      </div>

      <div className="resource-content">
        {renderTable()}
      </div>

      {/* Data Source Information */}
      <div className="data-source-info">
        <div className="source-item">
          <strong>📡 Data Source:</strong> 
          <code>FHIR Server /api/patient/{patientId}</code>
        </div>
        <div className="source-item">
          <strong>🆔 Patient ID:</strong> 
          <span>{patientId}</span>
        </div>
        <div className="source-item">
          <strong>🔄 Last Updated:</strong> 
          <span>{new Date().toLocaleString()}</span>
        </div>
        <div className="source-item">
          <strong>📊 Resource Type:</strong> 
          <span>{resourceType}</span>
        </div>
      </div>
    </div>
  );
};

export default DynamicResourceTab;