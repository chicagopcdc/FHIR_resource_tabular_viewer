import React, { useState, useEffect, useMemo } from 'react';
import { Search, Calendar, User, FileText, Filter, ChevronDown, ChevronRight } from 'lucide-react';

const ClinicalNotes = ({ 
  documentReferences = [], 
  diagnosticReports = [],
  patientId 
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    dateRange: 'all',
    noteType: 'all',
    provider: 'all',
    specialty: 'all',
    status: 'all'
  });
  const [sortConfig, setSortConfig] = useState({
    key: 'date',
    direction: 'desc'
  });
  const [expandedNotes, setExpandedNotes] = useState(new Set());
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'detailed'

  // Combine and normalize all notes data
  const allNotes = useMemo(() => {
    const notes = [];
    
    // Process DocumentReferences as clinical notes
    documentReferences.forEach(doc => {
      notes.push({
        id: doc.id || 'unknown',
        type: 'document',
        title: doc.type?.text || doc.description || 'Clinical Document',
        date: doc.date || doc.created || 'Unknown',
        provider: doc.author?.[0]?.display || doc.custodian?.display || 'Unknown Provider',
        specialty: extractSpecialty(doc.author?.[0]),
        status: doc.status || 'unknown',
        content: doc.content?.[0]?.attachment?.data || doc.description || 'Content not available',
        category: doc.category?.[0]?.text || 'General',
        source: 'DocumentReference',
        rawData: doc
      });
    });

    // Process DiagnosticReports as clinical notes  
    diagnosticReports.forEach(report => {
      notes.push({
        id: report.id || 'unknown',
        type: 'report',
        title: report.code?.text || 'Diagnostic Report',
        date: report.effectiveDateTime || report.issued || 'Unknown',
        provider: report.performer?.[0]?.display || 'Unknown Provider',
        specialty: extractSpecialty(report.performer?.[0]) || 'Diagnostics',
        status: report.status || 'unknown',
        content: extractDiagnosticReportContent(report),
        category: report.category?.[0]?.text || 'Diagnostic',
        source: 'DiagnosticReport',
        rawData: report
      });
    });

    return notes;
  }, [documentReferences, diagnosticReports]);

  // Extract available filter options from data
  const filterOptions = useMemo(() => {
    const types = new Set();
    const providers = new Set();
    const specialties = new Set();
    const statuses = new Set();
    const dates = [];

    allNotes.forEach(note => {
      if (note.category) types.add(note.category);
      if (note.provider) providers.add(note.provider);
      if (note.specialty) specialties.add(note.specialty);
      if (note.status) statuses.add(note.status);
      if (note.date && note.date !== 'Unknown') {
        const noteDate = new Date(note.date);
        if (!isNaN(noteDate.getTime())) {
          dates.push(noteDate);
        }
      }
    });

    // Generate data-driven date range options
    const dateRanges = generateDateRanges(dates);

    return {
      types: Array.from(types).sort(),
      providers: Array.from(providers).sort(),
      specialties: Array.from(specialties).sort(),
      statuses: Array.from(statuses).sort(),
      dateRanges
    };
  }, [allNotes]);

  // Filter and search notes
  const filteredNotes = useMemo(() => {
    let filtered = allNotes;

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(note => 
        note.title.toLowerCase().includes(searchLower) ||
        note.content.toLowerCase().includes(searchLower) ||
        note.provider.toLowerCase().includes(searchLower) ||
        note.specialty.toLowerCase().includes(searchLower) ||
        note.category.toLowerCase().includes(searchLower)
      );
    }

    // Apply filters
    if (filters.dateRange !== 'all') {
      // Handle specific date filtering (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(filters.dateRange)) {
        const selectedDate = filters.dateRange;
        filtered = filtered.filter(note => {
          const noteDate = new Date(note.date);
          const noteDateKey = noteDate.toISOString().split('T')[0];
          return noteDateKey === selectedDate;
        });
      } else {
        // Handle traditional range filtering
        const now = new Date();
        const filterDate = getFilterDate(now, filters.dateRange);
        filtered = filtered.filter(note => {
          const noteDate = new Date(note.date);
          return noteDate >= filterDate;
        });
      }
    }

    if (filters.noteType !== 'all') {
      filtered = filtered.filter(note => note.category === filters.noteType);
    }

    if (filters.provider !== 'all') {
      filtered = filtered.filter(note => note.provider === filters.provider);
    }

    if (filters.specialty !== 'all') {
      filtered = filtered.filter(note => note.specialty === filters.specialty);
    }

    if (filters.status !== 'all') {
      filtered = filtered.filter(note => note.status === filters.status);
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (sortConfig.key === 'date') {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [allNotes, searchTerm, filters, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleNoteExpansion = (noteId) => {
    setExpandedNotes(prev => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(noteId)) {
        newExpanded.delete(noteId);
      } else {
        newExpanded.add(noteId);
      }
      return newExpanded;
    });
  };

  const formatDate = (dateString) => {
    if (!dateString || dateString === 'Unknown') return 'Unknown Date';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateString;
    }
  };

  const getStatusBadgeStyle = (status) => {
    const styles = {
      final: { backgroundColor: '#28a745', color: 'white' },
      preliminary: { backgroundColor: '#ffc107', color: '#212529' },
      current: { backgroundColor: '#17a2b8', color: 'white' },
      superseded: { backgroundColor: '#6c757d', color: 'white' },
      unknown: { backgroundColor: '#e9ecef', color: '#495057' }
    };
    return styles[status?.toLowerCase()] || styles.unknown;
  };

  return (
    <div className="clinical-notes-viewer" style={{ padding: '1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#333', fontSize: '1.5rem' }}>
              📋 Clinical Notes & Reports
            </h2>
            <p style={{ margin: '0.25rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
              Browse and search clinical documentation by date, type, provider, and specialty
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: '#666' }}>
              {filteredNotes.length} of {allNotes.length} notes
            </span>
            <button
              onClick={() => setViewMode(viewMode === 'list' ? 'detailed' : 'list')}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                backgroundColor: '#f8f9fa',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              {viewMode === 'list' ? 'Detailed View' : 'List View'}
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ position: 'relative', maxWidth: '400px' }}>
            <Search style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '16px',
              height: '16px',
              color: '#999'
            }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search notes by content, provider, or keywords..."
              style={{
                width: '100%',
                padding: '0.75rem 0.75rem 0.75rem 2.5rem',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Filters */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
          gap: '0.75rem',
          marginBottom: '1rem'
        }}>
          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
            style={{ padding: '0.5rem', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '0.8rem' }}
          >
            <option value="all">All Dates</option>
            {filterOptions.dateRanges.map(range => (
              <option key={range.value} value={range.value}>
                {range.label}
              </option>
            ))}
          </select>

          <select
            value={filters.noteType}
            onChange={(e) => setFilters(prev => ({ ...prev, noteType: e.target.value }))}
            style={{ padding: '0.5rem', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '0.8rem' }}
          >
            <option value="all">All Types</option>
            {filterOptions.types.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <select
            value={filters.provider}
            onChange={(e) => setFilters(prev => ({ ...prev, provider: e.target.value }))}
            style={{ padding: '0.5rem', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '0.8rem' }}
          >
            <option value="all">All Providers</option>
            {filterOptions.providers.map(provider => (
              <option key={provider} value={provider}>{provider}</option>
            ))}
          </select>

          <select
            value={filters.specialty}
            onChange={(e) => setFilters(prev => ({ ...prev, specialty: e.target.value }))}
            style={{ padding: '0.5rem', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '0.8rem' }}
          >
            <option value="all">All Specialties</option>
            {filterOptions.specialties.map(specialty => (
              <option key={specialty} value={specialty}>{specialty}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            style={{ padding: '0.5rem', border: '1px solid #dee2e6', borderRadius: '4px', fontSize: '0.8rem' }}
          >
            <option value="all">All Statuses</option>
            {filterOptions.statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          color: '#666'
        }}>
          <FileText style={{ width: '48px', height: '48px', margin: '0 auto 1rem', opacity: 0.5 }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>No Clinical Notes Found</h3>
          <p style={{ margin: 0 }}>
            {searchTerm ? `No notes match your search "${searchTerm}"` : 'No clinical notes available for this patient'}
          </p>
        </div>
      ) : (
        <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #dee2e6' }}>
          {/* Table Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: viewMode === 'list' ? '1fr 120px 200px 150px 100px 60px' : '1fr 120px 200px 150px 100px',
            gap: '0.75rem',
            padding: '1rem',
            backgroundColor: '#f8f9fa',
            borderBottom: '1px solid #dee2e6',
            fontWeight: '600',
            fontSize: '0.85rem',
            color: '#495057'
          }}>
            <button
              onClick={() => handleSort('title')}
              style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}
            >
              Note Title {sortConfig.key === 'title' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => handleSort('date')}
              style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}
            >
              Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => handleSort('provider')}
              style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}
            >
              Provider {sortConfig.key === 'provider' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </button>
            <button
              onClick={() => handleSort('specialty')}
              style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}
            >
              Specialty {sortConfig.key === 'specialty' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </button>
            <span>Status</span>
            {viewMode === 'list' && <span>View</span>}
          </div>

          {/* Notes */}
          {filteredNotes.map((note, index) => (
            <div key={note.id || index} style={{
              borderBottom: index < filteredNotes.length - 1 ? '1px solid #dee2e6' : 'none'
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: viewMode === 'list' ? '1fr 120px 200px 150px 100px 60px' : '1fr 120px 200px 150px 100px',
                gap: '0.75rem',
                padding: '1rem',
                alignItems: 'center',
                fontSize: '0.9rem'
              }}>
                <div>
                  <div style={{ fontWeight: '600', color: '#333', marginBottom: '0.25rem' }}>
                    {note.title}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#666' }}>
                    {note.category} • {note.source}
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>
                  {formatDate(note.date)}
                </div>
                <div style={{ fontSize: '0.85rem' }}>
                  {note.provider}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                  {note.specialty}
                </div>
                <div>
                  <span style={{
                    ...getStatusBadgeStyle(note.status),
                    padding: '0.25rem 0.5rem',
                    borderRadius: '12px',
                    fontSize: '0.75rem',
                    fontWeight: '500'
                  }}>
                    {note.status}
                  </span>
                </div>
                {viewMode === 'list' && (
                  <button
                    onClick={() => toggleNoteExpansion(note.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: '#007bff',
                      padding: '0.25rem'
                    }}
                  >
                    {expandedNotes.has(note.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                )}
              </div>

              {/* Expanded Content */}
              {(viewMode === 'detailed' || expandedNotes.has(note.id)) && (
                <div style={{
                  padding: '0 1rem 1rem 1rem',
                  backgroundColor: '#f8f9fa',
                  borderTop: '1px solid #dee2e6'
                }}>
                  <div style={{
                    fontSize: '0.9rem',
                    lineHeight: '1.5',
                    color: '#495057',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    padding: '0.75rem',
                    backgroundColor: 'white',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px'
                  }}>
                    {note.content}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Helper functions
function extractSpecialty(provider) {
  if (!provider) return 'General';
  
  // Simple specialty extraction from provider display name
  const display = provider.display || provider.reference || '';
  
  if (display.toLowerCase().includes('cardio')) return 'Cardiology';
  if (display.toLowerCase().includes('neuro')) return 'Neurology';
  if (display.toLowerCase().includes('onco')) return 'Oncology';
  if (display.toLowerCase().includes('radio')) return 'Radiology';
  if (display.toLowerCase().includes('patho')) return 'Pathology';
  if (display.toLowerCase().includes('emer')) return 'Emergency';
  if (display.toLowerCase().includes('surg')) return 'Surgery';
  if (display.toLowerCase().includes('pedia')) return 'Pediatrics';
  if (display.toLowerCase().includes('psych')) return 'Psychiatry';
  if (display.toLowerCase().includes('derma')) return 'Dermatology';
  
  return 'General Medicine';
}

function extractDiagnosticReportContent(report) {
  // Try different content sources in order of preference
  
  // 1. Check for conclusion text
  if (report.conclusion && report.conclusion.trim()) {
    return report.conclusion;
  }
  
  // 2. Check for narrative text in text.div (often contains the main content)
  if (report.text?.div) {
    // Clean up HTML tags for better readability
    const cleanText = report.text.div
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ')     // Replace multiple spaces with single space
      .trim();
    
    if (cleanText && cleanText !== 'N/A') {
      return cleanText;
    }
  }
  
  // 3. Check for presentedForm data (base64 encoded documents)
  if (report.presentedForm?.[0]?.data) {
    const contentType = report.presentedForm[0].contentType || 'Unknown format';
    const base64Data = report.presentedForm[0].data;
    
    // If it's text/plain, decode and display the content
    if (contentType.toLowerCase().includes('text/plain') || contentType.toLowerCase().includes('text/')) {
      try {
        const decodedText = atob(base64Data);
        if (decodedText && decodedText.trim()) {
          return decodedText.trim();
        }
      } catch (error) {
        console.warn('Failed to decode base64 text content:', error);
      }
    }
    
    // For non-text content types or if decoding failed
    const dataSize = base64Data.length;
    return `Report available as ${contentType} (${Math.round(dataSize * 0.75)} bytes)\n\nNote: This report contains binary data that cannot be displayed as text. The report may be a PDF, image, or other document format.`;
  }
  
  // 4. Check if there are result references - try to extract meaningful content
  if (report.result?.length > 0) {
    const resultCount = report.result.length;
    
    // Try to extract result data from the report's contained resources
    let resultContent = extractResultContent(report, allNotes);
    
    if (resultContent) {
      return `${report.code?.text || 'Diagnostic Report'}\n\n${resultContent}`;
    }
    
    // Fallback to reference list if no detailed content found
    const resultList = report.result
      .slice(0, 8) // Show more results
      .map(ref => `• ${ref.reference || ref.display || 'Observation result'}`)
      .join('\n');
    
    const moreResults = report.result.length > 8 ? `\n... and ${report.result.length - 8} more results` : '';
    
    return `This diagnostic report contains ${resultCount} result${resultCount === 1 ? '' : 's'}:\n\n${resultList}${moreResults}\n\nNote: Individual results can be viewed in the Labs or Measurements tabs.`;
  }
  
  // 5. Fallback to basic info if available
  const reportType = report.code?.text || report.code?.coding?.[0]?.display || 'Diagnostic Report';
  const status = report.status || 'unknown';
  const date = report.effectiveDateTime || report.issued || 'unknown date';
  
  return `${reportType}\nStatus: ${status}\nDate: ${date}\n\nNo detailed content available for this report.`;
}

function extractResultContent(report, allNotes = []) {
  // Check if the report contains embedded observations in 'contained' resources
  if (report.contained && report.contained.length > 0) {
    const observations = report.contained.filter(resource => resource.resourceType === 'Observation');
    
    if (observations.length > 0) {
      const resultText = observations.map(obs => formatObservationResult(obs)).join('\n');
      return `Results:\n${resultText}`;
    }
  }
  
  // Enhanced fallback: provide more detailed information about the results
  if (report.result?.length > 0) {
    const reportDate = report.effectiveDateTime || report.issued;
    const reportType = report.code?.text || report.code?.coding?.[0]?.display || 'Diagnostic Report';
    
    // Create a more informative description
    let content = `${reportType}\n`;
    
    if (reportDate) {
      content += `Date: ${new Date(reportDate).toLocaleDateString()}\n`;
    }
    
    if (report.status) {
      content += `Status: ${report.status}\n`;
    }
    
    if (report.performer?.[0]?.display) {
      content += `Performed by: ${report.performer[0].display}\n`;
    }
    
    content += `\nThis report contains ${report.result.length} individual lab result${report.result.length === 1 ? '' : 's'}:\n\n`;
    
    // Show result references with better formatting
    const resultList = report.result
      .slice(0, 10) // Show up to 10 results
      .map((ref, index) => {
        const refId = ref.reference || ref.display || 'Unknown result';
        // Try to make the reference more readable
        const cleanRef = refId.replace(/^(Observation\/|urn:uuid:)/, '').substring(0, 20);
        return `${index + 1}. Lab Result: ${cleanRef}`;
      }).join('\n');
    
    const moreResults = report.result.length > 10 ? `\n... and ${report.result.length - 10} more results` : '';
    
    content += resultList + moreResults;
    content += '\n\n💡 Individual results with values can be viewed in the "Labs" or "Measurements" tabs for detailed values, reference ranges, and trends.';
    
    return content;
  }
  
  return null;
}

function formatObservationResult(obs) {
  const testName = obs.code?.text || 
                  obs.code?.coding?.[0]?.display || 
                  obs.code?.coding?.[0]?.code || 
                  'Test';
  
  let value = 'N/A';
  let unit = '';
  let status = obs.status ? `(${obs.status})` : '';
  
  // Extract value based on different value types
  if (obs.valueQuantity) {
    value = obs.valueQuantity.value || 'N/A';
    unit = obs.valueQuantity.unit || obs.valueQuantity.code || '';
  } else if (obs.valueString) {
    value = obs.valueString;
  } else if (obs.valueCodeableConcept) {
    value = obs.valueCodeableConcept.text || 
            obs.valueCodeableConcept.coding?.[0]?.display || 
            obs.valueCodeableConcept.coding?.[0]?.code || 'N/A';
  } else if (obs.valueBoolean !== undefined) {
    value = obs.valueBoolean ? 'Positive' : 'Negative';
  } else if (obs.component && obs.component.length > 0) {
    // Handle components (like Blood Pressure with systolic/diastolic)
    const componentValues = obs.component.map(comp => {
      const compName = comp.code?.text || comp.code?.coding?.[0]?.display || 'Component';
      const compValue = comp.valueQuantity?.value || comp.valueString || 'N/A';
      const compUnit = comp.valueQuantity?.unit || comp.valueQuantity?.code || '';
      return `${compName}: ${compValue} ${compUnit}`.trim();
    }).join(', ');
    value = componentValues;
  }
  
  // Reference range if available
  let refRange = '';
  if (obs.referenceRange && obs.referenceRange.length > 0) {
    const range = obs.referenceRange[0];
    if (range.low?.value !== undefined && range.high?.value !== undefined) {
      refRange = ` [Normal: ${range.low.value}-${range.high.value} ${range.low.unit || ''}]`;
    } else if (range.text) {
      refRange = ` [${range.text}]`;
    }
  }
  
  // Format the result line
  const valueWithUnit = unit ? `${value} ${unit}` : value;
  return `• ${testName}: ${valueWithUnit}${refRange} ${status}`.trim();
}

function getFilterDate(now, range) {
  // Handle specific dates (format: "YYYY-MM-DD")
  if (/^\d{4}-\d{2}-\d{2}$/.test(range)) {
    return new Date(range);
  }
  
  const date = new Date(now);
  
  // Handle year ranges (format: "YYYY")
  if (/^\d{4}$/.test(range)) {
    return new Date(`${range}-01-01`);
  }
  
  // Handle traditional ranges
  switch (range) {
    case '1d':
      date.setDate(date.getDate() - 1);
      break;
    case '1w':
      date.setDate(date.getDate() - 7);
      break;
    case '1m':
      date.setMonth(date.getMonth() - 1);
      break;
    case '3m':
      date.setMonth(date.getMonth() - 3);
      break;
    case '1y':
      date.setFullYear(date.getFullYear() - 1);
      break;
    default:
      return new Date(0); // Return epoch for 'all'
  }
  
  return date;
}

function generateDateRanges(dates) {
  if (!dates || dates.length === 0) {
    return [];
  }

  const ranges = [];

  // Group dates by actual date (YYYY-MM-DD)
  const dateGroups = {};
  dates.forEach(date => {
    const dateKey = date.toISOString().split('T')[0]; // Get YYYY-MM-DD format
    if (!dateGroups[dateKey]) {
      dateGroups[dateKey] = [];
    }
    dateGroups[dateKey].push(date);
  });

  // Convert to ranges with counts
  Object.keys(dateGroups)
    .sort((a, b) => new Date(b) - new Date(a)) // Sort by date descending (newest first)
    .forEach(dateKey => {
      const count = dateGroups[dateKey].length;
      const formattedDate = new Date(dateKey).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      ranges.push({
        value: dateKey, // Use ISO date as value for filtering
        label: `${formattedDate} (${count} ${count === 1 ? 'note' : 'notes'})`,
        count: count,
        date: new Date(dateKey)
      });
    });

  return ranges;
}

export default ClinicalNotes;