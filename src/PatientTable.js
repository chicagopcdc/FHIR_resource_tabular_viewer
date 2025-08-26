import React from 'react';
import './PatientTable.css';

const PatientTable = ({ 
  patients = [], 
  searchTerm = '', 
  onPatientSelect, 
  loading = false,
  pagination = {},
  onPageChange,
  onPageSizeChange 
}) => {
  // Display value with proper null handling
  const displayValue = (value, defaultText = '-') => {
    if (value === null || value === undefined || value === '') {
      return defaultText;
    }
    return value;
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const handlePatientClick = (patient) => {
    if (onPatientSelect && patient.id) {
      onPatientSelect(patient);
    }
  };

  const handlePageChange = (newPage) => {
    if (onPageChange && newPage !== (pagination.page || 1) && newPage > 0) {
      onPageChange(newPage);
    }
  };

  const handlePageSizeChange = (event) => {
    const newPageSize = parseInt(event.target.value, 10);
    if (onPageSizeChange && newPageSize > 0) {
      onPageSizeChange(newPageSize);
    }
  };

  // Safe total-pages calculation
  const calculateTotalPages = () => {
    const total = pagination.total ?? 0;
    const perPage = pagination.per_page || 50;
    if (total <= 0 || perPage <= 0) return 1;
    return Math.ceil(total / perPage);
  };

  const getPageRange = () => {
    const perPage = pagination.per_page || 50;
    const total = pagination.total ?? 0;
    const totalPages = calculateTotalPages();
    const currentPage = Math.min(Math.max(pagination.page || 1, 1), totalPages);
    const startRecord = total === 0 ? 0 : ((currentPage - 1) * perPage) + 1;
    const endRecord = total === 0 ? 0 : Math.min(currentPage * perPage, total);
    return { startRecord, endRecord, totalPages, currentPage };
  };

  const renderPaginationControls = () => {
    const { startRecord, endRecord, totalPages, currentPage } = getPageRange();

    // Hide controls if everything fits on one page or no total known
    if ((pagination.total ?? 0) <= (pagination.per_page || 50)) {
      return null;
    }

    const generatePageNumbers = () => {
      const pages = [];
      const maxVisible = 7;
      if (totalPages <= maxVisible) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
      } else if (currentPage <= 4) {
        for (let i = 1; i <= 5; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
        pages.push('...');
        pages.push(totalPages);
      }
      return pages;
    };

    const pageNumbers = generatePageNumbers();

    return (
      <div className="pagination-controls">
        <div className="pagination-info">
          Showing {startRecord}-{endRecord} of {pagination.total ?? 0} patients
          {' '}(Page {currentPage} of {totalPages})
        </div>

        <div className="pagination-buttons">
          <button
            onClick={() => handlePageChange(1)}
            disabled={currentPage <= 1 || loading}
            className="btn"
          >
            First
          </button>

          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1 || loading}
            className="btn"
          >
            Previous
          </button>

          {pageNumbers.map((pageNum, index) =>
            pageNum === '...' ? (
              <span key={`ellipsis-${index}`} className="page-dots">...</span>
            ) : (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                disabled={loading}
                className={`btn ${pageNum === currentPage ? 'active' : ''}`}
              >
                {pageNum}
              </button>
            )
          )}

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || loading}
            className="btn"
          >
            Next
          </button>

          <button
            onClick={() => handlePageChange(totalPages)}
            disabled={currentPage >= totalPages || loading}
            className="btn"
          >
            Last
          </button>

          <label htmlFor="pageSize" className="page-size-label">Show:</label>
          <select
            id="pageSize"
            value={pagination.per_page || 50}
            onChange={handlePageSizeChange}
            disabled={loading}
            className="page-size-select"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span className="page-size-suffix">per page</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="patient-table-loading">
        <div className="loading-emoji">â³</div>
        <h3>Loading Patient Data</h3>
        <p>Fetching records from FHIR server...</p>
      </div>
    );
  }

  const { startRecord, endRecord, totalPages } = getPageRange(); // (kept for parity)

  return (
    <div className="patient-table-container">
      {/* Header */}
      <div className="patient-table-header">
        <h2>Patient Directory</h2>
        <p>
            Total: {pagination.total ?? patients.length} patients
            {searchTerm && ` (filtered for: "${searchTerm}")`}
        </p>
      </div>

      {/* Pagination at top */}
      {patients.length > 0 && renderPaginationControls()}

      {/* Table */}
      {patients.length === 0 ? (
        <div className="patient-table-empty">
          <div className="empty-emoji">ðŸ‘¤</div>
          <h3> Patients Found</h3>
          <p>
            {searchTerm
              ? `No patients match your search for "${searchTerm}"`
              : 'No patient data available from the server'}
          </p>
        </div>
      ) : (
        <div className="patient-table-wrapper">
          <table className="patient-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Name</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Birth Date</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient, index) => (
                <tr
                  key={patient.id || index}
                  className="patient-row"
                >
                  <td>{displayValue(patient.id)}</td>
                  <td>
                    <button
                      onClick={() => handlePatientClick(patient)}
                      className="patient-link"
                      onMouseEnter={(e) => (e.target.style.textDecoration = 'underline')}
                      onMouseLeave={(e) => (e.target.style.textDecoration = 'none')}
                    >
                      {displayValue(patient.given_name)} {displayValue(patient.family_name)}
                    </button>
                    <div className="patient-link-sub">Click to view details</div>
                  </td>
                  <td>{displayValue(patient.age)}</td>
                  <td>
                    {/* Keep the dynamic gender badge styling as inline to avoid behavior changes */}
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        backgroundColor:
                          patient.gender === 'male'
                            ? '#e3f2fd'
                            : patient.gender === 'female'
                            ? '#fce4ec'
                            : '#f5f5f5',
                        color:
                          patient.gender === 'male'
                            ? '#1976d2'
                            : patient.gender === 'female'
                            ? '#c2185b'
                            : '#616161'
                      }}
                    >
                      {displayValue(patient.gender)}
                    </span>
                  </td>
                  <td>{formatDate(patient.birth_date)}</td>
                  <td>
                    {patient.city || patient.state ? (
                      <div>
                        {[patient.city, patient.state].filter(Boolean).join(', ')}
                        {patient.postal_code && (
                          <span className="postal-muted">
                            {patient.postal_code}
                          </span>
                        )}
                      </div>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    <span className={`patient-status ${patient.active ? 'active' : 'inactive'}`}>
                      {patient.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default PatientTable;