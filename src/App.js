import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SideBar from './SideBar';
import Header from './Header';
import PatientTable from './PatientTable';
import PatientDetails from './PatientDetails';
import './App.css';

function App() {
  const [allPatients, setAllPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  console.log('App render - sidebarOpen:', sidebarOpen); // Debug log

  const handlePatientsLoaded = (patients) => {
    console.log('Patients loaded in App:', patients.length);
    setAllPatients(patients);
  };

  const handleSearchChange = (term) => {
    setSearchTerm(term);
  };

  const handleFilterChange = (filterType) => {
    // Filter logic can be implemented here if needed
    console.log('Filter applied:', filterType);
  };

  const toggleSidebar = () => {
    console.log('Toggle clicked! Current state:', sidebarOpen);
    const newState = !sidebarOpen;
    setSidebarOpen(newState);
    console.log('New state will be:', newState);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route 
            path="/" 
            element={
              <div className="app-layout">
                <SideBar 
                  isOpen={sidebarOpen} 
                  onClose={closeSidebar}
                />
                <div className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
                  <Header 
                    onSearchChange={handleSearchChange}
                    onFilterChange={handleFilterChange}
                    onSidebarToggle={toggleSidebar}
                  />
                  <PatientTable 
                    searchTerm={searchTerm}
                    onPatientsLoaded={handlePatientsLoaded}
                  />
                </div>
              </div>
            } 
          />
          <Route path="/patient/:patientId" element={<PatientDetails />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;