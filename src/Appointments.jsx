import React, { useState } from 'react';

const Appointments = () => {
  const [appointments, setAppointments] = useState([
    {
      id: 1,
      patientName: 'John Doe',
      patientId: 'PT-001',
      date: '2025-06-25',
      time: '10:00',
      provider: 'Dr. Smith',
      department: 'Cardiology',
      type: 'Follow-up',
      status: 'Scheduled',
      notes: 'Regular checkup'
    },
    {
      id: 2,
      patientName: 'Jane Smith',
      patientId: 'PT-002',
      date: '2025-06-24',
      time: '14:30',
      provider: 'Dr. Johnson',
      department: 'Internal Medicine',
      type: 'New Patient',
      status: 'Confirmed',
      notes: 'Initial consultation'
    },
    {
      id: 3,
      patientName: 'Michael Johnson',
      patientId: 'PT-003',
      date: '2025-06-23',
      time: '09:15',
      provider: 'Dr. Williams',
      department: 'Orthopedics',
      type: 'Treatment',
      status: 'Completed',
      notes: 'Physical therapy session'
    }
  ]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState('All');

  const statusOptions = ['All', 'Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No Show'];
  
  const getStatusColor = (status) => {
    switch(status.toLowerCase()) {
      case 'scheduled': return '#007bff';
      case 'confirmed': return '#28a745';
      case 'completed': return '#6c757d';
      case 'cancelled': return '#dc3545';
      case 'no show': return '#fd7e14';
      default: return '#6c757d';
    }
  };

  const filteredAppointments = appointments.filter(appointment => {
    const statusMatch = filterStatus === 'All' || appointment.status === filterStatus;
    const dateMatch = appointment.date === selectedDate;
    return statusMatch && (selectedDate === '' || dateMatch);
  });

  const updateAppointmentStatus = (id, newStatus) => {
    setAppointments(appointments.map(apt => 
      apt.id === id ? { ...apt, status: newStatus } : apt
    ));
  };

  return (
    <div className="appointments-container">
      <div className="appointments-header">
        <h2>Appointments</h2>
        <div className="header-controls">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="date-picker"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="status-filter"
          >
            {statusOptions.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button 
            className="btn-primary"
            onClick={() => setShowAddForm(true)}
          >
            Schedule Appointment
          </button>
        </div>
      </div>

      <div className="appointments-list">
        {filteredAppointments.length === 0 ? (
          <div className="no-appointments">
            <p>No appointments found for the selected criteria.</p>
          </div>
        ) : (
          <div className="appointments-table">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Patient</th>
                  <th>Provider</th>
                  <th>Department</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAppointments.map(appointment => (
                  <tr key={appointment.id}>
                    <td>{appointment.time}</td>
                    <td>
                      <div>
                        <strong>{appointment.patientName}</strong>
                        <br />
                        <small>{appointment.patientId}</small>
                      </div>
                    </td>
                    <td>{appointment.provider}</td>
                    <td>{appointment.department}</td>
                    <td>{appointment.type}</td>
                    <td>
                      <span 
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(appointment.status) }}
                      >
                        {appointment.status}
                      </span>
                    </td>
                    <td>
                      <div className="appointment-actions">
                        <select
                          value={appointment.status}
                          onChange={(e) => updateAppointmentStatus(appointment.id, e.target.value)}
                          className="status-update"
                        >
                          {statusOptions.slice(1).map(status => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                        <button className="btn-sm btn-secondary">Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal large">
            <div className="modal-header">
              <h3>Schedule New Appointment</h3>
              <button 
                className="close-btn"
                onClick={() => setShowAddForm(false)}
              >
                ×
              </button>
            </div>
            <form>
              <div className="form-row">
                <div className="form-group">
                  <label>Patient:</label>
                  <select required>
                    <option value="">Select Patient</option>
                    <option value="PT-001">John Doe (PT-001)</option>
                    <option value="PT-002">Jane Smith (PT-002)</option>
                    <option value="PT-003">Michael Johnson (PT-003)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Date:</label>
                  <input type="date" required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Time:</label>
                  <input type="time" required />
                </div>
                <div className="form-group">
                  <label>Duration:</label>
                  <select>
                    <option value="15">15 minutes</option>
                    <option value="30">30 minutes</option>
                    <option value="45">45 minutes</option>
                    <option value="60">1 hour</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Provider:</label>
                  <select required>
                    <option value="">Select Provider</option>
                    <option value="Dr. Smith">Dr. Smith</option>
                    <option value="Dr. Johnson">Dr. Johnson</option>
                    <option value="Dr. Williams">Dr. Williams</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Department:</label>
                  <select required>
                    <option value="">Select Department</option>
                    <option value="Cardiology">Cardiology</option>
                    <option value="Internal Medicine">Internal Medicine</option>
                    <option value="Orthopedics">Orthopedics</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Appointment Type:</label>
                <select required>
                  <option value="">Select Type</option>
                  <option value="New Patient">New Patient</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Treatment">Treatment</option>
                  <option value="Consultation">Consultation</option>
                </select>
              </div>
              <div className="form-group">
                <label>Notes:</label>
                <textarea rows="3" placeholder="Additional notes..."></textarea>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Schedule Appointment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Appointments;