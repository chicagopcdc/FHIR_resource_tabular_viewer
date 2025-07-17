import React, { useState, useEffect } from 'react';
  import { useLocation } from 'react-router-dom';
  import fhirData from './fhircamila.json';

  function CareTeam() {
    const [selectedCareTeam, setSelectedCareTeam] = useState(null);
    const [error, setError] = useState(null);
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const careTeamId = searchParams.get('careTeamId');

    useEffect(() => {
      try {
        const careTeamEntries = fhirData.CareTeam?.entry
          ?.filter(entry => entry.resource?.resourceType === 'CareTeam')
          .map(entry => entry.resource) || [];
        if (careTeamId) {
          const careTeam = careTeamEntries.find(a => a.id === careTeamId);
          setSelectedCareTeam(careTeam || null);
        } else {
          setSelectedCareTeam(null);
        }
      } catch (err) {
        setError(`Error loading care team: ${err.message}`);
      }
    }, [careTeamId]);

    if (error) return <div className="text-red-500 text-center p-4">Error: {error}</div>;
    if (!fhirData.CareTeam) return <div className="text-center p-4">Loading care team...</div>;

    return (
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">Care Team</h2>
        {selectedCareTeam ? (
          <div className="p-2 border rounded">
            <p><strong>Name:</strong> {selectedCareTeam.name || 'Unknown'}</p>
            <p><strong>Status:</strong> {selectedCareTeam.status?.charAt(0).toUpperCase() + selectedCareTeam.status?.slice(1) || 'N/A'}</p>
          </div>
        ) : (
          <div className="text-center p-4 bg-gray-50 rounded">No care team selected - select from sidebar</div>
        )}
      </div>
    );
  }

  export default CareTeam;