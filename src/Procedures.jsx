import React, { useState, useEffect } from 'react';
  import { useLocation } from 'react-router-dom';
  import fhirData from './fhircamila.json';

  function Procedures() {
    const [selectedProcedure, setSelectedProcedure] = useState(null);
    const [error, setError] = useState(null);
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const procedureId = searchParams.get('procedureId');

    useEffect(() => {
      try {
        const procedureEntries = fhirData.Procedure?.entry
          ?.filter(entry => entry.resource?.resourceType === 'Procedure')
          .map(entry => entry.resource) || [];
        if (procedureId) {
          const procedure = procedureEntries.find(a => a.id === procedureId);
          setSelectedProcedure(procedure || null);
        } else {
          setSelectedProcedure(null);
        }
      } catch (err) {
        setError(`Error loading procedures: ${err.message}`);
      }
    }, [procedureId]);

    if (error) return <div className="text-red-500 text-center p-4">Error: {error}</div>;
    if (!fhirData.Procedure) return <div className="text-center p-4">Loading procedures...</div>;

    return (
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">Procedures</h2>
        {selectedProcedure ? (
          <div className="p-2 border rounded">
            <p><strong>Procedure:</strong> {selectedProcedure.code?.text || 'Unknown'}</p>
            <p><strong>Status:</strong> {selectedProcedure.status?.charAt(0).toUpperCase() + selectedProcedure.status?.slice(1) || 'N/A'}</p>
            <p><strong>Date:</strong> {selectedProcedure.performedDateTime ? new Date(selectedProcedure.performedDateTime).toLocaleDateString() : 'N/A'}</p>
          </div>
        ) : (
          <div className="text-center p-4 bg-gray-50 rounded">No procedure selected - select from sidebar</div>
        )}
      </div>
    );
  }

  export default Procedures;