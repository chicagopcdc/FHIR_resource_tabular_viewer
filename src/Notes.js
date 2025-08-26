// src/components/Notes.js - Your original structure with essential fixes only
import React, { useState, useEffect } from 'react';

const Notes = ({ documentReferences, diagnosticReports }) => {
  const [activeNotesTab, setActiveNotesTab] = useState('documentreference');
  const [selectedNote, setSelectedNote] = useState(null);
  const [showNoteModal, setShowNoteModal] = useState(false);

  if (!documentReferences && !diagnosticReports) {
    return <div className="loading">Loading notes data...</div>;
  }

  const handleNoteClick = (note) => {
    setSelectedNote(note);
    setShowNoteModal(true);
  };

  const handleCloseModal = () => {
    setShowNoteModal(false);
    setSelectedNote(null);
  };

  // ADD THIS: Handle click outside modal to close
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      handleCloseModal();
    }
  };

  // ADD THIS: Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && showNoteModal) {
        handleCloseModal();
      }
    };

    if (showNoteModal) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [showNoteModal]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return dateString;
    }
  };

  const createFullContent = (item) => {
    if (activeNotesTab === 'documentreference') {
      return `Document Reference

ID: ${item.id || 'Unknown'}
Resource Type: ${item.resourceType || 'DocumentReference'}
Status: ${item.status || 'Unknown'}
Date: ${item.date || 'Unknown'}
Source Patient: ${item.source_patient_id || 'Unknown'}
Source File: ${item.source_filename || 'Unknown'}

This is a FHIR DocumentReference resource that contains metadata about a document.
The actual document content is not available in this dataset.`;
    } else {
      return `Diagnostic Report

ID: ${item.id || 'Unknown'}
Resource Type: ${item.resourceType || 'DiagnosticReport'}
Status: ${item.status || 'Unknown'}
Effective Date: ${item.effectiveDateTime || 'Unknown'}
Issued Date: ${item.issued || 'Unknown'}
Source Patient: ${item.source_patient_id || 'Unknown'}
Source File: ${item.source_filename || 'Unknown'}

This is a FHIR DiagnosticReport resource that contains the results of diagnostic testing.
Detailed test results and interpretations would typically be included in the report content.`;
    }
  };

  const renderNoteModal = () => {
    if (!showNoteModal || !selectedNote) return null;

    return (
      <div className="modal-overlay" onClick={handleOverlayClick}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>{activeNotesTab === 'documentreference' ? 'Document Reference Details' : 'Diagnostic Report Details'}</h2>
            <button className="modal-close" onClick={handleCloseModal} title="Close">×</button>
          </div>
          <div className="modal-body">
            {selectedNote && (
              <>
                <div className="note-details-header">
                  <div className="note-metadata">
                    <span className={`type-badge ${selectedNote.resourceType?.toLowerCase() || 'unknown'}`}>
                      {selectedNote.resourceType || 'Unknown'}
                    </span>
                    <span className="note-date">
                      {formatDate(selectedNote.date || selectedNote.effectiveDateTime || selectedNote.issued)}
                    </span>
                  </div>
                  <div className="provider-info">
                    <div className="provider-name">System Generated</div>
                    <div className="provider-specialty">FHIR Resource</div>
                    <div className="provider-department">Healthcare System</div>
                  </div>
                </div>
                <div className="note-content-full">
                  <pre>{createFullContent(selectedNote)}</pre>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderNotesContent = () => {
    const currentNotes = activeNotesTab === 'documentreference' ? (documentReferences || []) : (diagnosticReports || []);
    
    return (
      <div className="notes-table-container">
        <table className="notes-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>ID</th>
              <th>Status</th>
              <th>Resource Type</th>
              <th>Source File</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {currentNotes.length > 0 ? (
              currentNotes.map((note, index) => (
                <tr key={note.id || index} className="note-row">
                  <td className="date-cell">
                    {formatDate(note.date || note.effectiveDateTime || note.issued)}
                  </td>
                  <td className="id-cell">{note.id || 'Unknown'}</td>
                  <td className="status-cell">
                    <span className={`status-badge ${note.status || 'unknown'}`}>
                      {note.status || 'Unknown'}
                    </span>
                  </td>
                  <td className="type-cell">{note.resourceType || 'Unknown'}</td>
                  <td className="source-cell">
                    <div className="source-preview">
                      {note.source_filename ? note.source_filename.substring(0, 30) + '...' : 'Unknown'}
                    </div>
                  </td>
                  <td className="action-cell">
                    <button 
                      className="view-btn"
                      onClick={() => handleNoteClick(note)}
                      title="View details"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="empty-state">
                  <div className="empty-state-icon">📝</div>
                  <p>No {activeNotesTab === 'documentreference' ? 'document references' : 'diagnostic reports'} found</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="notes-container">
      <div className="notes-tabs">
        <button 
          className={`notes-tab ${activeNotesTab === 'documentreference' ? 'active' : ''}`}
          onClick={() => setActiveNotesTab('documentreference')}
        >
          Document References ({documentReferences?.length || 0})
        </button>
        <button 
          className={`notes-tab ${activeNotesTab === 'diagnosticreport' ? 'active' : ''}`}
          onClick={() => setActiveNotesTab('diagnosticreport')}
        >
          Diagnostic Reports ({diagnosticReports?.length || 0})
        </button>
      </div>
      <div className="notes-content">
        {renderNotesContent()}
      </div>
      {renderNoteModal()}
    </div>
  );
};

export default Notes;