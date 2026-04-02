import React, { useState, useEffect } from 'react';
  import { useLocation } from 'react-router-dom';
  import fhirData from './fhircamila.json';

  function Conditions() {
    const [selectedCondition, setSelectedCondition] = useState(null);
    const [error, setError] = useState(null);
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const conditionId = searchParams.get('conditionId');

    useEffect(() => {
      try {
        const conditionEntries = fhirData.Condition?.entry
          ?.filter(entry => entry.resource?.resourceType === 'Condition')
          .map(entry => entry.resource) || [];
        if (conditionId) {
          const condition = conditionEntries.find(a => a.id === conditionId);
          setSelectedCondition(condition || null);
        } else {
          setSelectedCondition(null);
        }
      } catch (err) {
        setError(`Error loading conditions: ${err.message}`);
      }
    }, [conditionId]);

    if (error) return <div className="text-red-500 text-center p-4">Error: {error}</div>;
    if (!fhirData.Condition) return <div className="text-center p-4">Loading conditions...</div>;

    return (
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">Conditions</h2>
        {selectedCondition ? (
          <div className="p-2 border rounded">
            <p><strong>Condition:</strong> {selectedCondition.code?.text || 'Unknown'}</p>
            <p><strong>Status:</strong> {selectedCondition.clinicalStatus?.text || 'N/A'}</p>
            <p><strong>Date:</strong> {selectedCondition.onsetDateTime ? new Date(selectedCondition.onsetDateTime).toLocaleDateString() : 'N/A'}</p>
          </div>
        ) : (
          <div className="text-center p-4 bg-gray-50 rounded">No condition selected - select from sidebar</div>
        )}
      </div>
    );
  }

  export default Conditions;