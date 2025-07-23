import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import './PatientDetails.css';

const PatientDetails = ({ patientId }) => {
  const [activeTab, setActiveTab] = useState('general');
  const [activeLabTab, setActiveLabTab] = useState('observation');
  const [activeMeasurementTab, setActiveMeasurementTab] = useState('observations');
  const [activeNotesTab, setActiveNotesTab] = useState('documentreference');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [selectedNote, setSelectedNote] = useState(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  
  // State for dynamic data
  const [patientData, setPatientData] = useState(null);
  const [observations, setObservations] = useState([]);
  const [labObservations, setLabObservations] = useState([]);
  const [diagnosticReports, setDiagnosticReports] = useState([]);
  const [documentReferences, setDocumentReferences] = useState([]);
  const [diagnosticReportNotes, setDiagnosticReportNotes] = useState([]);

  useEffect(() => {
    loadPatientData();
  }, [patientId]);

  const loadPatientData = async () => {
    try {
      setLoading(true);
      
    
      if (!window.fs || !window.fs.readFile) {
        console.warn('Excel file reader not available, using mock data');
        // Use existing mock data as fallback
        const mockPatientData = {
          personal: {
            givenName: 'Annette105',
            familyName: 'Cruickshank494',
            birthDate: '2009-05-20',
            age: '16 years',
            gender: 'female',
            multipleBirth: 'No',
            street: '123 Main Street',
            city: 'Chicago',
            state: 'IL',
            postalCode: '60623',
            country: 'USA',
            phone: '+1-555-1230',
            email: 'patient1@example.com'
          },
          medical: {
            activeConditions: 15,
            totalEncounters: 62,
            procedures: 84,
            medications: 13,
            immunizations: 17,
            careTeamMembers: 2,
            allergies: 0
          },
          labs: {
            observations: 8,
            diagnosticReports: 6
          },
          measurements: {
            observations: 153
          },
          notes: {
            documentReferences: 3,
            diagnosticReports: 2
          }
        };
        
      
        const mockObservations = Array.from({ length: 153 }, (_, i) => ({
          id: i + 1,
          type: ['Body Height', 'Body Weight', 'Heart rate', 'Blood pressure panel', 'Respiratory rate'][i % 5],
          value: ['165', '58', '72', '120/80', '16'][i % 5],
          unit: ['cm', 'kg', 'bpm', 'mmHg', 'breaths/min'][i % 5],
          date: new Date(2024, 11 - (i % 12), 28 - (i % 28)).toLocaleDateString(),
          category: 'Vital Signs',
          status: 'final'
        }));

      
        const mockLabObservations = [
          {
            id: 1,
            type: 'Hemoglobin',
            value: '14.2',
            unit: 'g/dL',
            date: '2024-12-10',
            status: 'final',
            reference: '12.0-16.0'
          },
          {
            id: 2,
            type: 'White Blood Cell Count',
            value: '7,200',
            unit: '/μL',
            date: '2024-12-10',
            status: 'final',
            reference: '4,500-11,000'
          },
          {
            id: 3,
            type: 'Platelet Count',
            value: '285,000',
            unit: '/μL',
            date: '2024-12-10',
            status: 'final',
            reference: '150,000-450,000'
          },
          {
            id: 4,
            type: 'Glucose',
            value: '92',
            unit: 'mg/dL',
            date: '2024-12-08',
            status: 'final',
            reference: '70-100'
          },
          {
            id: 5,
            type: 'Cholesterol, Total',
            value: '185',
            unit: 'mg/dL',
            date: '2024-12-08',
            status: 'final',
            reference: '<200'
          },
          {
            id: 6,
            type: 'Creatinine',
            value: '0.9',
            unit: 'mg/dL',
            date: '2024-12-08',
            status: 'final',
            reference: '0.6-1.2'
          },
          {
            id: 7,
            type: 'ALT (Alanine Aminotransferase)',
            value: '28',
            unit: 'U/L',
            date: '2024-12-05',
            status: 'final',
            reference: '7-56'
          },
          {
            id: 8,
            type: 'TSH (Thyroid Stimulating Hormone)',
            value: '2.1',
            unit: 'mIU/L',
            date: '2024-11-30',
            status: 'final',
            reference: '0.4-4.0'
          }
        ];

     
        const mockDiagnosticReports = [
          {
            id: 1,
            type: 'Complete Blood Count',
            date: '2024-12-10',
            status: 'final',
            performer: 'Central Laboratory',
            category: 'Hematology'
          },
          {
            id: 2,
            type: 'Basic Metabolic Panel',
            date: '2024-12-08',
            status: 'final',
            performer: 'Central Laboratory',
            category: 'Chemistry'
          },
          {
            id: 3,
            type: 'Lipid Panel',
            date: '2024-12-08',
            status: 'final',
            performer: 'Central Laboratory',
            category: 'Chemistry'
          },
          {
            id: 4,
            type: 'Liver Function Tests',
            date: '2024-12-05',
            status: 'final',
            performer: 'Central Laboratory',
            category: 'Chemistry'
          },
          {
            id: 5,
            type: 'Thyroid Function Tests',
            date: '2024-11-30',
            status: 'final',
            performer: 'Endocrine Laboratory',
            category: 'Endocrinology'
          },
          {
            id: 6,
            type: 'Chest X-Ray',
            date: '2024-11-25',
            status: 'final',
            performer: 'Dr. Rodriguez',
            category: 'Radiology'
          }
        ];
        
    
        const mockDocumentReferences = [
          { 
            id: 1, 
            type: 'DocumentReference', 
            date: '2024-12-15', 
            author: 'Dr. Smith', 
            authorId: 'practitioner-001',
            specialty: 'Internal Medicine',
            department: 'General Medicine',
            locationId: 'location-001',
            content: 'Progress Note: Patient shows improvement in overall health metrics. Continue current treatment plan.',
            fullContent: 'Progress Note\n\nDate: December 15, 2024\nTime: 14:30\n\nSubjective:\nPatient reports feeling better overall. Energy levels have improved significantly over the past week. Sleep quality has been good, averaging 7-8 hours per night. No new complaints.\n\nObjective:\nVital signs stable. BP 120/80, HR 72, RR 16, Temp 98.6°F. Patient appears well and in no acute distress.\n\nAssessment:\nPatient shows marked improvement in overall health metrics. Current treatment plan appears to be effective.\n\nPlan:\n- Continue current medications\n- Follow-up in 2 weeks\n- Patient education on lifestyle modifications provided\n- Return if symptoms worsen'
          },
          { 
            id: 3, 
            type: 'DocumentReference', 
            date: '2024-11-28', 
            author: 'Dr. Williams', 
            authorId: 'practitioner-003',
            specialty: 'Emergency Medicine',
            department: 'Emergency Department',
            locationId: 'location-003',
            content: 'Discharge Summary: Patient discharged in stable condition. Follow-up in 2 weeks.',
            fullContent: 'Emergency Department Discharge Summary\n\nPatient: Annette105 Cruickshank494\nDate of Service: November 28, 2024\nDischarge Time: 16:45\n\nChief Complaint:\nPatient presented with chest pain and shortness of breath.\n\nHistory of Present Illness:\nPatient experienced sudden onset chest pain while at rest. Pain was sharp, non-radiating, and associated with mild shortness of breath. No nausea, vomiting, or diaphoresis.\n\nPhysical Examination:\nVital signs stable. Cardiac examination revealed regular rate and rhythm, no murmurs. Lungs clear to auscultation bilaterally.\n\nDiagnostic Studies:\n- EKG: Normal sinus rhythm, no acute changes\n- Chest X-ray: No acute abnormalities\n- Troponin: Negative\n\nDisposition:\nPatient discharged in stable condition. Symptoms resolved during observation period. Follow-up with primary care physician in 2 weeks or sooner if symptoms recur.\n\nMedications:\nNone prescribed at discharge.\n\nInstructions:\nReturn to ED if chest pain recurs or worsens.'
          },
          { 
            id: 5, 
            type: 'DocumentReference', 
            date: '2024-11-20', 
            author: 'Nurse Davis', 
            authorId: 'practitioner-005',
            specialty: 'Nursing',
            department: 'Medical Ward',
            locationId: 'location-005',
            content: 'Nursing Note: Vital signs stable throughout shift. Patient ambulatory without assistance.',
            fullContent: 'Nursing Progress Note\n\nDate: November 20, 2024\nShift: Day Shift (07:00-19:00)\nNurse: Davis, RN\n\nAssessment:\nPatient alert and oriented x3. Vital signs stable throughout shift:\n- 08:00: BP 118/76, HR 68, RR 14, Temp 98.4°F, O2 Sat 98% RA\n- 12:00: BP 122/78, HR 72, RR 16, Temp 98.6°F, O2 Sat 99% RA\n- 16:00: BP 120/80, HR 70, RR 15, Temp 98.5°F, O2 Sat 98% RA\n\nPhysical Status:\nPatient ambulatory without assistance. Good appetite, tolerated regular diet well. No complaints of pain or discomfort.\n\nMedications:\nAll medications administered as ordered. Patient compliant with medication regimen.\n\nPlan:\n- Continue current care plan\n- Monitor vital signs per protocol\n- Encourage ambulation\n- Patient education reinforced\n\nNext shift informed of patient status.'
          },
        ];

      
        const mockDiagnosticReportNotes = [
          { 
            id: 2, 
            type: 'DiagnosticReport', 
            date: '2024-12-10', 
            author: 'Dr. Johnson', 
            authorId: 'practitioner-002',
            specialty: 'Pathology',
            department: 'Laboratory Services',
            locationId: 'location-002',
            content: 'Laboratory Report: CBC results within normal limits. Hemoglobin 14.2 g/dL, WBC 7,200/μL.',
            fullContent: 'Complete Blood Count Report\n\nPatient: Annette105 Cruickshank494\nDate: December 10, 2024\nOrdering Physician: Dr. Smith\nPerforming Lab: Central Laboratory\n\nResults:\n- Hemoglobin: 14.2 g/dL (Normal: 12.0-16.0)\n- Hematocrit: 42.5% (Normal: 37-47%)\n- White Blood Cell Count: 7,200/μL (Normal: 4,500-11,000)\n- Platelet Count: 285,000/μL (Normal: 150,000-450,000)\n- Red Blood Cell Count: 4.8 million/μL (Normal: 4.2-5.4)\n\nInterpretation:\nAll values are within normal limits. No evidence of anemia, infection, or hematologic abnormalities.\n\nRecommendations:\nRoutine follow-up as clinically indicated.'
          },
          { 
            id: 4, 
            type: 'DiagnosticReport', 
            date: '2024-11-25', 
            author: 'Dr. Rodriguez', 
            authorId: 'practitioner-004',
            specialty: 'Radiology',
            department: 'Imaging Services',
            locationId: 'location-004',
            content: 'Radiology Report: Chest X-ray shows no acute abnormalities. Heart size normal.',
            fullContent: 'Chest X-Ray Report\n\nPatient: Annette105 Cruickshank494\nExam Date: November 25, 2024\nExam Time: 10:30 AM\nStudy: Chest X-ray, PA and Lateral\nOrdering Physician: Dr. Williams\nRadiologist: Dr. Rodriguez\n\nTechnical Quality:\nAdequate inspiration and positioning. Good penetration and contrast.\n\nFindings:\nLungs: Clear bilaterally. No consolidation, effusion, or pneumothorax.\nHeart: Normal size and contour. Cardiomediastinal silhouette within normal limits.\nBones: No acute fractures or abnormalities.\nSoft tissues: Unremarkable.\n\nImpression:\nNo acute cardiopulmonary abnormalities. Normal chest X-ray.\n\nRecommendations:\nClinical correlation as appropriate. No immediate follow-up imaging required unless clinically indicated.'
          }
        ];
        
        setPatientData(mockPatientData); 
        setObservations(mockObservations);
        setLabObservations(mockLabObservations);
        setDiagnosticReports(mockDiagnosticReports);
        setDocumentReferences(mockDocumentReferences);
        setDiagnosticReportNotes(mockDiagnosticReportNotes);
        setLoading(false);
        return;
      }
      
      // Load actual Excel file data
      const response = await window.fs.readFile('multi_patient_combined_fhir.xlsx');
      const workbook = XLSX.read(response);
      
      // Get patient data
      const patientSheet = workbook.Sheets['patient'];
      const patients = XLSX.utils.sheet_to_json(patientSheet);
      const currentPatient = patients.find(p => p.id === patientId);
      
      if (!currentPatient) {
        console.error('Patient not found');
        setLoading(false);
        return;
      }

      // Calculate age from birth date
      const calculateAge = (birthDate) => {
        const today = new Date();
        const birth = new Date(birthDate);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
          age--;
        }
        return `${age} years`;
      };

      // Format date for display
      const formatDate = (dateString) => {
        if (!dateString) return 'Unknown';
        try {
          return new Date(dateString).toLocaleDateString();
        } catch {
          return dateString;
        }
      };

      // Load all sheets
      const observationSheet = workbook.Sheets['observation'];
      const allObservations = XLSX.utils.sheet_to_json(observationSheet);
      
      const diagnosticReportSheet = workbook.Sheets['diagnosticreport'];
      const allDiagnosticReports = XLSX.utils.sheet_to_json(diagnosticReportSheet);
      
      const documentReferenceSheet = workbook.Sheets['documentreference'];
      const allDocumentReferences = XLSX.utils.sheet_to_json(documentReferenceSheet);
      
      const conditionSheet = workbook.Sheets['condition'];
      const allConditions = XLSX.utils.sheet_to_json(conditionSheet);
      
      const procedureSheet = workbook.Sheets['procedure'];
      const allProcedures = XLSX.utils.sheet_to_json(procedureSheet);
      
      const medicationRequestSheet = workbook.Sheets['medicationrequest'];
      const allMedicationRequests = XLSX.utils.sheet_to_json(medicationRequestSheet);
      
      const immunizationSheet = workbook.Sheets['immunization'];
      const allImmunizations = XLSX.utils.sheet_to_json(immunizationSheet);
      
      const encounterSheet = workbook.Sheets['encounter'];
      const allEncounters = XLSX.utils.sheet_to_json(encounterSheet);

      // Filter data for current patient
      const patientObservations = allObservations.filter(obs => 
        obs.source_patient_id === currentPatient.source_patient_id
      );
      
      const patientDiagnosticReports = allDiagnosticReports.filter(report => 
        report.source_patient_id === currentPatient.source_patient_id
      );
      
      const patientDocumentReferences = allDocumentReferences.filter(doc => 
        doc.source_patient_id === currentPatient.source_patient_id
      );
      
      const patientConditions = allConditions.filter(cond => 
        cond.source_patient_id === currentPatient.source_patient_id
      );
      
      const patientProcedures = allProcedures.filter(proc => 
        proc.source_patient_id === currentPatient.source_patient_id
      );
      
      const patientMedicationRequests = allMedicationRequests.filter(med => 
        med.source_patient_id === currentPatient.source_patient_id
      );
      
      const patientImmunizations = allImmunizations.filter(imm => 
        imm.source_patient_id === currentPatient.source_patient_id
      );
      
      const patientEncounters = allEncounters.filter(enc => 
        enc.source_patient_id === currentPatient.source_patient_id
      );

      // Separate lab observations from vital signs
      const vitalSigns = patientObservations.filter(obs => 
        obs.code_display && (
          obs.code_display.includes('Height') ||
          obs.code_display.includes('Weight') ||
          obs.code_display.includes('Heart rate') ||
          obs.code_display.includes('Blood pressure') ||
          obs.code_display.includes('Respiratory rate') ||
          obs.code_display.includes('Temperature') ||
          obs.code_display.includes('BMI') ||
          obs.code_display.includes('Pain severity')
        )
      );

      const labObservations = patientObservations.filter(obs => 
        obs.code_display && (
          obs.code_display.includes('Hemoglobin') ||
          obs.code_display.includes('Glucose') ||
          obs.code_display.includes('Cholesterol') ||
          obs.code_display.includes('Leukocytes') ||
          obs.code_display.includes('Platelet') ||
          obs.code_display.includes('Hematocrit') ||
          obs.code_display.includes('Erythrocytes') ||
          obs.code_display.includes('Urea nitrogen') ||
          obs.code_display.includes('Creatinine') ||
          obs.code_display.includes('Sodium') ||
          obs.code_display.includes('Potassium') ||
          obs.code_display.includes('Chloride') ||
          obs.code_display.includes('Carbon dioxide')
        )
      );

      // Process observations for measurements tab
      const processedObservations = patientObservations.map((obs, index) => ({
        id: index + 1,
        type: obs.code_display || 'Unknown',
        value: obs.value_quantity || obs.value_string || 'N/A',
        unit: obs.value_unit || '',
        date: formatDate(obs.effective_date || obs.effectiveDateTime),
        category: categorizeObservation(obs.code_display),
        status: obs.status || 'unknown'
      }));

      // Process lab observations
      const processedLabObservations = labObservations.map((obs, index) => ({
        id: index + 1,
        type: obs.code_display || 'Unknown',
        value: obs.value_quantity || obs.value_string || 'N/A',
        unit: obs.value_unit || '',
        date: formatDate(obs.effective_date || obs.effectiveDateTime),
        status: obs.status || 'unknown',
        reference: 'N/A' // Reference ranges not available in this dataset
      }));

      // Process diagnostic reports
      const processedDiagnosticReports = patientDiagnosticReports.map((report, index) => ({
        id: index + 1,
        type: 'Diagnostic Report',
        date: formatDate(report.effectiveDateTime || report.issued),
        status: report.status || 'unknown',
        performer: 'Laboratory Services',
        category: 'General'
      }));

      // Process document references
      const processedDocumentReferences = patientDocumentReferences.map((doc, index) => ({
        id: index + 1,
        type: 'DocumentReference',
        date: formatDate(doc.date),
        author: 'Healthcare Provider',
        authorId: 'provider-001',
        specialty: 'General Medicine',
        department: 'Medical Services',
        locationId: 'location-001',
        content: `Document ID: ${doc.id}`,
        fullContent: `Document Reference\n\nID: ${doc.id}\nType: ${doc.type}\nDate: ${doc.date}\nStatus: ${doc.status}\n\nContent not available in data source.`
      }));

      // Process diagnostic report notes
      const processedDiagnosticReportNotes = patientDiagnosticReports.map((report, index) => ({
        id: index + 1,
        type: 'DiagnosticReport',
        date: formatDate(report.effectiveDateTime || report.issued),
        author: 'Laboratory Staff',
        authorId: 'lab-staff-001',
        specialty: 'Laboratory Medicine',
        department: 'Laboratory Services',
        locationId: 'lab-001',
        content: `Diagnostic Report: ${report.code_display || 'Report'}`,
        fullContent: `Diagnostic Report\n\nID: ${report.id}\nType: ${report.code_display}\nDate: ${report.effectiveDateTime || report.issued}\nStatus: ${report.status}\n\nDetailed results not available in data source.`
      }));

      //  complete patient data object
      const completePatientData = {
        personal: {
          givenName: currentPatient.given_name || 'Unknown',
          familyName: currentPatient.family_name || 'Unknown',
          birthDate: formatDate(currentPatient.birth_date),
          age: calculateAge(currentPatient.birth_date),
          gender: currentPatient.gender || 'unknown',
          multipleBirth: currentPatient.multiple_birth_boolean ? 'Yes' : 'No',
          street: currentPatient.address_line || 'Unknown',
          city: currentPatient.address_city || 'Unknown',
          state: currentPatient.address_state || 'Unknown',
          postalCode: currentPatient.address_postal_code || 'Unknown',
          country: currentPatient.address_country || 'Unknown',
          phone: currentPatient.telecom_value || 'Unknown',
          email: 'Not available'
        },
        medical: {
          activeConditions: patientConditions.length,
          totalEncounters: patientEncounters.length,
          procedures: patientProcedures.length,
          medications: patientMedicationRequests.length,
          immunizations: patientImmunizations.length,
          careTeamMembers: 0, 
          allergies: 0 
        },
        labs: {
          observations: processedLabObservations.length,
          diagnosticReports: processedDiagnosticReports.length
        },
        measurements: {
          observations: processedObservations.length
        },
        notes: {
          documentReferences: processedDocumentReferences.length,
          diagnosticReports: processedDiagnosticReportNotes.length
        }
      };

      setPatientData(completePatientData);
      setObservations(processedObservations);
      setLabObservations(processedLabObservations);
      setDiagnosticReports(processedDiagnosticReports);
      setDocumentReferences(processedDocumentReferences);
      setDiagnosticReportNotes(processedDiagnosticReportNotes);
      
    } catch (error) {
      console.error('Error loading patient data:', error);
      // Use mock data on error
      const mockPatientData = {
        personal: {
          givenName: 'Test',
          familyName: 'Patient',
          birthDate: '1990-01-01',
          age: '34 years',
          gender: 'unknown',
          multipleBirth: 'No',
          street: 'Unknown',
          city: 'Unknown',
          state: 'Unknown',
          postalCode: 'Unknown',
          country: 'Unknown',
          phone: 'Unknown',
          email: 'Unknown'
        },
        medical: {
          activeConditions: 0,
          totalEncounters: 0,
          procedures: 0,
          medications: 0,
          immunizations: 0,
          careTeamMembers: 0,
          allergies: 0
        },
        labs: {
          observations: 0,
          diagnosticReports: 0
        },
        measurements: {
          observations: 0
        },
        notes: {
          documentReferences: 0,
          diagnosticReports: 0
        }
      };
      setPatientData(mockPatientData);
      setObservations([]);
      setLabObservations([]);
      setDiagnosticReports([]);
      setDocumentReferences([]);
      setDiagnosticReportNotes([]);
    } finally {
      setLoading(false);
    }
  };

  const categorizeObservation = (type) => {
    if (!type) return 'Other';
    
    const lowerType = type.toLowerCase();
    if (lowerType.includes('blood') || lowerType.includes('hemoglobin') || 
        lowerType.includes('leukocyte') || lowerType.includes('platelet')) {
      return 'Laboratory';
    } else if (lowerType.includes('questionnaire') || lowerType.includes('gad') || 
               lowerType.includes('phq') || lowerType.includes('pain')) {
      return 'Survey';
    } else if (lowerType.includes('tobacco') || lowerType.includes('smoking')) {
      return 'Social History';
    } else {
      return 'Vital Signs';
    }
  };

  // Helper function to safely get className
  const getSafeClassName = (type) => {
    if (!type || typeof type !== 'string') return 'unknown';
    return type.toLowerCase().replace(/\s+/g, '-');
  };

  // Pagination logic
  const totalPages = Math.ceil(observations.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentObservations = observations.slice(startIndex, endIndex);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1);
  };

  const handleBackClick = () => {
    window.history.back();
  };

  const handleNoteClick = (note) => {
    setSelectedNote(note);
    setShowNoteModal(true);
  };

  const handleCloseModal = () => {
    setShowNoteModal(false);
    setSelectedNote(null);
  };

  const renderNoteModal = () => {
    if (!showNoteModal || !selectedNote) return null;

    return (
      <div className="modal-overlay" onClick={handleCloseModal}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h2>Clinical Note Details</h2>
            <button className="modal-close" onClick={handleCloseModal}>×</button>
          </div>
          <div className="modal-body">
            {selectedNote && (
              <>
                <div className="note-details-header">
                  <div className="note-metadata">
                    <span className={`type-badge ${getSafeClassName(selectedNote.type)}`}>
                      {selectedNote.type || 'Unknown'}
                    </span>
                    <span className="note-date">{selectedNote.date || 'Unknown'}</span>
                  </div>
                  <div className="provider-info">
                    <div className="provider-name">{selectedNote.author || 'Unknown'}</div>
                    <div className="provider-specialty">{selectedNote.specialty || 'Unknown'}</div>
                    <div className="provider-department">{selectedNote.department || 'Unknown'}</div>
                  </div>
                </div>
                <div className="note-content-full">
                  <pre>{selectedNote.fullContent || 'No content available'}</pre>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderLabContent = () => {
    if (activeLabTab === 'observation') {
      return (
        <div className="lab-table-container">
          <table className="lab-table">
            <thead>
              <tr>
                <th>Test Name</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Reference Range</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {labObservations.length > 0 ? (
                labObservations.map(obs => (
                  <tr key={obs.id}>
                    <td className="test-name">{obs.type}</td>
                    <td className="test-value">{obs.value}</td>
                    <td className="test-unit">{obs.unit}</td>
                    <td className="reference-range">{obs.reference}</td>
                    <td className="test-date">{obs.date}</td>
                    <td><span className="status-badge final">{obs.status}</span></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="empty-state">No lab observations found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    } else {
      return (
        <div className="lab-table-container">
          <table className="lab-table">
            <thead>
              <tr>
                <th>Report Type</th>
                <th>Category</th>
                <th>Date</th>
                <th>Status</th>
                <th>Performer</th>
              </tr>
            </thead>
            <tbody>
              {diagnosticReports.length > 0 ? (
                diagnosticReports.map(report => (
                  <tr key={report.id}>
                    <td className="report-type">{report.type}</td>
                    <td className="report-category">{report.category}</td>
                    <td className="report-date">{report.date}</td>
                    <td><span className="status-badge final">{report.status}</span></td>
                    <td className="report-performer">{report.performer}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="empty-state">No diagnostic reports found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }
  };

  const renderNotesContent = () => {
    const currentNotes = activeNotesTab === 'documentreference' ? documentReferences : diagnosticReportNotes;
    
    return (
      <div className="notes-table-container">
        <table className="notes-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Author</th>
              <th>Specialty</th>
              <th>Department</th>
              <th>Content</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {currentNotes.length > 0 ? (
              currentNotes.map(note => (
                <tr key={note.id} className="note-row">
                  <td className="date-cell">{note.date || 'Unknown'}</td>
                  <td className="author-cell">{note.author || 'Unknown'}</td>
                  <td className="specialty-cell">{note.specialty || 'Unknown'}</td>
                  <td className="department-cell">{note.department || 'Unknown'}</td>
                  <td className="content-cell">
                    <div className="content-preview">{note.content || 'No content'}</div>
                  </td>
                  <td className="action-cell">
                    <button 
                      className="view-btn"
                      onClick={() => handleNoteClick(note)}
                      title="View full note"
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

  const renderMeasurementContent = () => {
    if (activeMeasurementTab === 'observations') {
      return (
        <div className="measurement-observations-container">
          {/* Controls Bar */}
          <div className="observation-controls">
            <div className="controls-left">
              <span className="record-info">
                Showing {Math.min(startIndex + 1, observations.length)}-{Math.min(endIndex, observations.length)} of {observations.length} observations
              </span>
            </div>
            <div className="controls-right">
              <label htmlFor="itemsPerPage">Show:</label>
              <select 
                id="itemsPerPage"
                value={itemsPerPage} 
                onChange={handleItemsPerPageChange}
                className="items-per-page-select"
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                {observations.length > 0 && <option value={observations.length}>All</option>}
              </select>
              <span>per page</span>
            </div>
          </div>

          {/* Observations Table */}
          <div className="lab-table-container">
            <table className="lab-table observations-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Measurement Type</th>
                  <th>Value</th>
                  <th>Unit</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {currentObservations.length > 0 ? (
                  currentObservations.map(obs => (
                    <tr key={obs.id} className="observation-row">
                      <td className="date-cell">{obs.date}</td>
                      <td className="type-cell">{obs.type}</td>
                      <td className="value-cell">{obs.value}</td>
                      <td className="unit-cell">{obs.unit || '-'}</td>
                      <td className="category-cell">
                        <span className={`category-badge ${getSafeClassName(obs.category)}`}>
                          {obs.category}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="empty-state">No measurement observations found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination-container">
              <button 
                className="pagination-btn"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              
              <div className="page-numbers">
                {[...Array(totalPages)].map((_, index) => {
                  const page = index + 1;
                  if (
                    page === 1 || 
                    page === totalPages || 
                    (page >= currentPage - 2 && page <= currentPage + 2)
                  ) {
                    return (
                      <button
                        key={page}
                        className={`page-number ${currentPage === page ? 'active' : ''}`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    );
                  } else if (
                    page === currentPage - 3 || 
                    page === currentPage + 3
                  ) {
                    return <span key={page} className="page-dots">...</span>;
                  }
                  return null;
                })}
              </div>
              
              <button 
                className="pagination-btn"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const renderTabContent = () => {
    if (loading) {
      return <div className="loading">Loading patient data...</div>;
    }

    if (!patientData) {
      return <div className="empty-state">Patient data not found</div>;
    }

    switch (activeTab) {
      case 'measurements':
        return (
          <div className="labs-container">
            <div className="labs-tabs">
              <button 
                className={`lab-tab ${activeMeasurementTab === 'observations' ? 'active' : ''}`}
                onClick={() => setActiveMeasurementTab('observations')}
              >
                Observations
              </button>
            </div>
            <div className="labs-content">
              {renderMeasurementContent()}
            </div>
          </div>
        );
      case 'labs':
        return (
          <div className="labs-container">
            <div className="labs-tabs">
              <button 
                className={`lab-tab ${activeLabTab === 'observation' ? 'active' : ''}`}
                onClick={() => setActiveLabTab('observation')}
              >
                Observation
              </button>
              <button 
                className={`lab-tab ${activeLabTab === 'diagnostic' ? 'active' : ''}`}
                onClick={() => setActiveLabTab('diagnostic')}
              >
                Diagnostic Report
              </button>
            </div>
            <div className="labs-content">
              {renderLabContent()}
            </div>
          </div>
        );
      case 'notes':
        return (
          <div className="notes-container">
            <div className="notes-tabs">
              <button 
                className={`notes-tab ${activeNotesTab === 'documentreference' ? 'active' : ''}`}
                onClick={() => setActiveNotesTab('documentreference')}
              >
                Document Reference
              </button>
              <button 
                className={`notes-tab ${activeNotesTab === 'diagnosticreport' ? 'active' : ''}`}
                onClick={() => setActiveNotesTab('diagnosticreport')}
              >
                Diagnostic Report
              </button>
            </div>
            <div className="notes-content">
              {renderNotesContent()}
            </div>
            {renderNoteModal()}
          </div>
        );
      default:
        return (
          <div className="general-info-container">
            {/* Personal & Address Information Card (Merged) */}
            <div className="info-card">
              <h2 className="card-header">Personal Information</h2>
              <div className="info-content">
                <div className="info-row">
                  <span className="info-label">Given Name:</span>
                  <span className="info-value">{patientData.personal.givenName}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Family Name:</span>
                  <span className="info-value">{patientData.personal.familyName}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Birth Date:</span>
                  <span className="info-value">{patientData.personal.birthDate}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Age:</span>
                  <span className="info-value">{patientData.personal.age}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Gender:</span>
                  <span className="info-value">{patientData.personal.gender}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Phone:</span>
                  <span className="info-value">{patientData.personal.phone}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Email:</span>
                  <span className="info-value">{patientData.personal.email}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Street:</span>
                  <span className="info-value">{patientData.personal.street}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">City:</span>
                  <span className="info-value">{patientData.personal.city}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">State:</span>
                  <span className="info-value">{patientData.personal.state}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Postal Code:</span>
                  <span className="info-value">{patientData.personal.postalCode}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Country:</span>
                  <span className="info-value">{patientData.personal.country}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Multiple Birth:</span>
                  <span className="info-value">{patientData.personal.multipleBirth}</span>
                </div>
              </div>
            </div>

            {/* Medical Summary Card */}
            <div className="info-card">
              <h2 className="card-header">Medical Summary</h2>
              <div className="info-content">
                <div className="info-row">
                  <span className="info-label">Active Conditions:</span>
                  <span className="info-value number">{patientData.medical.activeConditions}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Total Encounters:</span>
                  <span className="info-value number">{patientData.medical.totalEncounters}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Procedures:</span>
                  <span className="info-value number">{patientData.medical.procedures}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Medications:</span>
                  <span className="info-value number">{patientData.medical.medications}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Immunizations:</span>
                  <span className="info-value number">{patientData.medical.immunizations}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Care Team Members:</span>
                  <span className="info-value number">{patientData.medical.careTeamMembers}</span>
                </div>
                <div className="info-row">
                  <span className="info-label">Allergies:</span>
                  <span className="info-value number">{patientData.medical.allergies}</span>
                </div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="patient-details-container">
      {/*  Header with just back button */}
      <div className="header">
        <button className="back-button" onClick={handleBackClick}>
          <span>←</span> Back to Patient List
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <div className="tabs">
          <button 
            className={`tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General Information
          </button>
          <button 
            className={`tab ${activeTab === 'measurements' ? 'active' : ''}`}
            onClick={() => setActiveTab('measurements')}
          >
            Measurements
          </button>
          <button 
            className={`tab ${activeTab === 'labs' ? 'active' : ''}`}
            onClick={() => setActiveTab('labs')}
          >
            Labs
          </button>
          <button 
            className={`tab ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => setActiveTab('notes')}
          >
            Notes
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="content">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default PatientDetails;
