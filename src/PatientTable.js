import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

const PatientTable = ({ searchTerm, onPatientsLoaded }) => {
  const [patients, setPatients] = useState([]);
  const [filteredPatients, setFilteredPatients] = useState([]);
  const navigate = useNavigate();

  const calculateAge = (birthDate) => {
    if (!birthDate) return 'N/A';
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    return age;
  };

  // Load patient data on component mount
  useEffect(() => {
    const loadPatientData = async () => {
      try {
        console.log('Attempting to load patient data from Excel file...');
        
        // Try to fetch the Excel file from the public folder
        const response = await fetch('/multi_patient_combined_fhir.xlsx');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch file: ${response.status}`);
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer);
        
        console.log('Available sheets:', Object.keys(workbook.Sheets));
        
        // Check if 'patient' sheet exists
        if (!workbook.Sheets['patient']) {
          console.error('Sheet "patient" not found. Available sheets:', Object.keys(workbook.Sheets));
          throw new Error('Patient sheet not found');
        }
        
        const patientData = XLSX.utils.sheet_to_json(workbook.Sheets['patient']);
        console.log('Raw patient data loaded:', patientData.length, 'records');
        console.log('Sample record:', patientData[0]);
        
        //  data to match  current UI structure
        const transformedData = patientData.map((patient, index) => ({
          id: `PT-${String(index + 1).padStart(3, '0')}`,
          originalId: patient.id,
          name: `${patient.given_name || patient.first_name || ''} ${patient.family_name || patient.last_name || ''}`.trim(),
          birthDate: patient.birth_date || patient.birthdate || patient.dob || '',
          age: calculateAge(patient.birth_date || patient.birthdate || patient.dob),
          gender: (patient.gender || '').charAt(0).toUpperCase() + (patient.gender || '').slice(1),
          phone: patient.phone || `+1-555-${String(1230 + index).padStart(4, '0')}`,
          email: patient.email || `patient${index + 1}@example.com`,
          address: `${patient.city || ''}, ${patient.state || ''} ${patient.postal_code || patient.zip || ''}`.trim(),
          status: patient.status || (index % 4 === 0 || index % 4 === 3 ? 'INACTIVE' : 'ACTIVE') //  deterministic status based on index
        }));
        
        console.log('Transformed data:', transformedData.length, 'records');
        console.log('Sample transformed record:', transformedData[0]);
        
        setPatients(transformedData);
        setFilteredPatients(transformedData);
        
        // Notify parent component that data has been loaded
        if (onPatientsLoaded) {
          onPatientsLoaded(transformedData);
        }
        
      } catch (error) {
        console.error('Error loading patient data from Excel:', error);
        console.log('Falling back to sample data...');
        
        // Fallback to sample data if Excel loading fails
        const sampleData = [
          {
            id: 'PT-001',
            name: 'Annette105 Cruickshank494',
            birthDate: '2009-05-20',
            age: 16,
            gender: 'Female',
            phone: '+1-555-1230',
            email: 'patient1@example.com',
            address: 'Chicago, IL 60623',
            status: 'INACTIVE'
          },
          {
            id: 'PT-002',
            name: 'Cary869 Ritchie586',
            birthDate: '2023-11-11',
            age: 1,
            gender: 'Male',
            phone: '+1-555-1231',
            email: 'patient2@example.com',
            address: 'Hillsboro, IL 62051',
            status: 'ACTIVE'
          },
          {
            id: 'PT-003',
            name: 'Courtney281 Lockman863',
            birthDate: '2012-06-09',
            age: 13,
            gender: 'Female',
            phone: '+1-555-1232',
            email: 'patient3@example.com',
            address: 'Chicago, IL 60655',
            status: 'ACTIVE'
          },
          {
            id: 'PT-004',
            name: 'Gaston250 Robel940',
            birthDate: '2006-11-17',
            age: 18,
            gender: 'Male',
            phone: '+1-555-1233',
            email: 'patient4@example.com',
            address: 'Dallas City, IL 62330',
            status: 'INACTIVE'
          },
          {
            id: 'PT-005',
            name: 'Laila673 Schaefer657',
            birthDate: '2006-11-27',
            age: 18,
            gender: 'Female',
            phone: '+1-555-1234',
            email: 'patient5@example.com',
            address: 'Decatur, IL 62554',
            status: 'ACTIVE'
          },
          {
            id: 'PT-006',
            name: 'Larissa293 Quitzon246',
            birthDate: '2021-02-03',
            age: 4,
            gender: 'Female',
            phone: '+1-555-1235',
            email: 'patient6@example.com',
            address: 'Bartlett, IL 60107',
            status: 'ACTIVE'
          },
          {
            id: 'PT-007',
            name: 'Librada521 Grimes165',
            birthDate: '1998-08-24',
            age: 26,
            gender: 'Female',
            phone: '+1-555-1236',
            email: 'patient7@example.com',
            address: 'Hinckley, IL 60520',
            status: 'ACTIVE'
          },
          {
            id: 'PT-008',
            name: 'Lindsy319 Douglas31',
            birthDate: '2010-05-26',
            age: 15,
            gender: 'Female',
            phone: '+1-555-1237',
            email: 'patient8@example.com',
            address: 'Schaumburg, IL 60194',
            status: 'ACTIVE'
          },
          {
            id: 'PT-009',
            name: 'Lorena247 Alcala54',
            birthDate: '2022-07-04',
            age: 3,
            gender: 'Female',
            phone: '+1-555-1238',
            email: 'patient9@example.com',
            address: 'La Grange, IL 60513',
            status: 'ACTIVE'
          },
          {
            id: 'PT-010',
            name: 'Maricarmen445 Arellano2',
            birthDate: '2012-11-08',
            age: 12,
            gender: 'Female',
            phone: '+1-555-1239',
            email: 'patient10@example.com',
            address: 'Aurora, IL 60538',
            status: 'ACTIVE'
          }
        ];
        
        setPatients(sampleData);
        setFilteredPatients(sampleData);
        
     
        if (onPatientsLoaded) {
          onPatientsLoaded(sampleData);
        }
      }
    };

    loadPatientData();
  }, [onPatientsLoaded]);

  // Filter patients based on search term
  useEffect(() => {
    if (!searchTerm) {
      setFilteredPatients(patients);
    } else {
      const filtered = patients.filter(patient =>
        patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patient.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patient.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredPatients(filtered);
    }
  }, [searchTerm, patients]);

  const handlePatientClick = (patientId) => {
    console.log('Patient clicked, ID:', patientId);
    try {
      navigate(`/patient/${patientId}`);
    } catch (error) {
      // Fallback if navigate fails
      window.location.href = `/patient/${patientId}`;
    }
  };

  return (
    <div className="fhir-viewer">
      <div className="patient-table">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Birth Date</th>
              <th>Age</th>
              <th>Gender</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Address</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredPatients && filteredPatients.length > 0 ? (
              filteredPatients.map((patient) => (
                <tr key={patient.id}>
                  <td>{patient.id}</td>
                  <td>
                    <span 
                      className="patient-name-link"
                      onClick={() => handlePatientClick(patient.id)}
                    >
                      {patient.name}
                    </span>
                  </td>
                  <td>{patient.birthDate}</td>
                  <td>{patient.age}</td>
                  <td>{patient.gender}</td>
                  <td>{patient.phone}</td>
                  <td>{patient.email}</td>
                  <td>{patient.address}</td>
                  <td>
                    <span className={`status ${patient.status.toLowerCase()}`}>
                      {patient.status}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="9" className="no-patients">
                  No patients found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PatientTable;
