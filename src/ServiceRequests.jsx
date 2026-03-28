import React, { useState, useEffect } from 'react';
  import { useLocation } from 'react-router-dom';
  import fhirData from './fhircamila.json';

  function ServiceRequests() {
    const [selectedServiceRequest, setSelectedServiceRequest] = useState(null);
    const [error, setError] = useState(null);
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const serviceRequestId = searchParams.get('serviceRequestId');

    useEffect(() => {
      try {
        const serviceRequestEntries = fhirData.ServiceRequest?.entry
          ?.filter(entry => entry.resource?.resourceType === 'ServiceRequest')
          .map(entry => entry.resource) || [];
        if (serviceRequestId) {
          const serviceRequest = serviceRequestEntries.find(a => a.id === serviceRequestId);
          setSelectedServiceRequest(serviceRequest || null);
        } else {
          setSelectedServiceRequest(null);
        }
      } catch (err) {
        setError(`Error loading service requests: ${err.message}`);
      }
    }, [serviceRequestId]);

    if (error) return <div className="text-red-500 text-center p-4">Error: {error}</div>;
    if (!fhirData.ServiceRequest) return <div className="text-center p-4">Loading service requests...</div>;

    return (
      <div className="bg-white shadow-md rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">Service Requests</h2>
        {selectedServiceRequest ? (
          <div className="p-2 border rounded">
            <p><strong>Type:</strong> {selectedServiceRequest.code?.coding?.[0]?.display || 'Unknown'}</p>
            <p><strong>Status:</strong> {selectedServiceRequest.status?.charAt(0).toUpperCase() + selectedServiceRequest.status?.slice(1) || 'N/A'}</p>
            <p><strong>Date:</strong> {selectedServiceRequest.authoredOn ? new Date(selectedServiceRequest.authoredOn).toLocaleDateString() : 'N/A'}</p>
          </div>
        ) : (
          <div className="text-center p-4 bg-gray-50 rounded">No service request selected - select from sidebar</div>
        )}
      </div>
    );
  }

  export default ServiceRequests;