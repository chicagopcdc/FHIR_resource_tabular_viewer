// dataUtils.js - Helper functions for loading and processing FHIR data
import * as XLSX from 'xlsx';

export const loadFHIRData = async () => {
  try {
    const response = await window.fs.readFile('multi_patient_combined_fhir.xlsx');
    const workbook = XLSX.read(response);
    
    const data = {
      patients: XLSX.utils.sheet_to_json(workbook.Sheets['patient']),
      observations: XLSX.utils.sheet_to_json(workbook.Sheets['observation']),
      documents: XLSX.utils.sheet_to_json(workbook.Sheets['documentreference']),
      conditions: XLSX.utils.sheet_to_json(workbook.Sheets['condition']),
      procedures: XLSX.utils.sheet_to_json(workbook.Sheets['procedure']),
      medications: XLSX.utils.sheet_to_json(workbook.Sheets['medicationrequest']),
      encounters: XLSX.utils.sheet_to_json(workbook.Sheets['encounter']),
      allergies: XLSX.utils.sheet_to_json(workbook.Sheets['allergyintolerance'])
    };
    
    return data;
  } catch (error) {
    console.error('Error loading FHIR data:', error);
    return null;
  }
};

export const calculateAge = (birthDate) => {
  if (!birthDate) return 0;
  
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
};

export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleDateString();
  } catch (error) {
    return 'Invalid Date';
  }
};

export const formatDateTime = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    return new Date(dateString).toLocaleString();
  } catch (error) {
    return 'Invalid Date';
  }
};

export const getPatientDataById = (patientId, allData) => {
  if (!allData || !allData.patients) return null;
  
  const patientIndex = parseInt(patientId.split('-')[1]) - 1;
  const patient = allData.patients[patientIndex];
  
  if (!patient) return null;
  
  return {
    patient,
    observations: allData.observations.filter(obs => 
      obs.source_patient_id === patient.source_patient_id
    ),
    documents: allData.documents.filter(doc => 
      doc.source_patient_id === patient.source_patient_id
    ),
    conditions: allData.conditions.filter(condition => 
      condition.source_patient_id === patient.source_patient_id
    ),
    procedures: allData.procedures.filter(procedure => 
      procedure.source_patient_id === patient.source_patient_id
    ),
    medications: allData.medications.filter(medication => 
      medication.source_patient_id === patient.source_patient_id
    ),
    encounters: allData.encounters.filter(encounter => 
      encounter.source_patient_id === patient.source_patient_id
    ),
    allergies: allData.allergies.filter(allergy => 
      allergy.source_patient_id === patient.source_patient_id
    )
  };
};

export const transformPatientsForTable = (patients) => {
  return patients.map((patient, index) => ({
    id: `PT-${String(index + 1).padStart(3, '0')}`,
    originalId: patient.id,
    name: `${patient.given_name} ${patient.family_name}`,
    birthDate: patient.birth_date,
    age: calculateAge(patient.birth_date),
    gender: patient.gender.charAt(0).toUpperCase() + patient.gender.slice(1),
    phone: `+1-555-${String(1230 + index).padStart(4, '0')}`,
    email: '[email protected]',
    address: `${patient.city}, ${patient.state} ${patient.postal_code}`,
    status: Math.random() > 0.2 ? 'ACTIVE' : 'INACTIVE'
  }));
};

export const filterPatients = (patients, searchTerm) => {
  if (!searchTerm) return patients;
  
  const term = searchTerm.toLowerCase();
  return patients.filter(patient =>
    patient.name.toLowerCase().includes(term) ||
    patient.id.toLowerCase().includes(term) ||
    patient.email.toLowerCase().includes(term) ||
    patient.address.toLowerCase().includes(term)
  );
};

export const applyQuickFilter = (patients, filterType) => {
  switch (filterType) {
    case 'active':
      return patients.filter(p => p.status === 'ACTIVE');
    case 'inactive':
      return patients.filter(p => p.status === 'INACTIVE');
    case 'male':
      return patients.filter(p => p.gender === 'Male');
    case 'female':
      return patients.filter(p => p.gender === 'Female');
    case 'all':
    default:
      return patients;
  }
};