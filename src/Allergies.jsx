import React, { useState } from 'react';

const Allergies = () => {
  const [allergies, setAllergies] = useState([
    {
      id: 1,
      allergen: 'Penicillin',
      type: 'Drug',
      severity: 'High',
      reaction: 'Rash, difficulty breathing',
      dateRecorded: '2024-01-15'
    },
    {
      id: 2,
      allergen: 'Peanuts',
      type: 'Food',
      severity: 'Severe',
      reaction: 'Anaphylaxis',
      dateRecorded: '2023-08-20'
    },
    {
      id: 3,
      allergen: 'Dust Mites',
      type: 'Environmental',
      severity: 'Moderate',
      reaction: 'Sneezing, runny nose',
      dateRecorded: '2023-12-10'
    }
  ]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newAllergy, setNewAllergy] = useState({
    allergen: '',
    type: 'Drug',
    severity: 'Low',
    reaction: '',
    dateRecorded: new Date().toISOString().split('T')[0]
  });

  const handleAddAllergy = (e) => {
    e.preventDefault();
    const allergy = {
      ...newAllergy,
      id: Date.now()
    };
    setAllergies([...allergies, allergy]);
    setNewAllergy({
      allergen: '',
      type: 'Drug',
      severity: 'Low',
      reaction: '',
      dateRecorded: new Date().toISOString().split('T')[0]
    });
    setShowAddForm(false);
  };

  const handleDeleteAllergy = (id) => {
    setAllergies(allergies.filter(allergy => allergy.id !== id));
  };

  const getSeverityColor = (severity) => {
    switch(severity.toLowerCase()) {
      case 'severe': return '#dc3545';
      case 'high': return '#fd7e14';
      case 'moderate': return '#ffc107';
      case 'low': return '#28a745';
      default: return '#6c757d';
    }
  };

  return (
    <div className="allergies-container">
      <div className="allergies-header">
        <h2>Patient Allergies</h2>
        <button 
          className="btn-primary"
          onClick={() => setShowAddForm(true)}
        >
          Add New Allergy
        </button>
      </div>

      <div className="allergies-list">
        {allergies.length === 0 ? (
          <div className="no-allergies">
            <p>No allergies recorded for this patient.</p>
          </div>
        ) : (
          <div className="allergies-grid">
            {allergies.map(allergy => (
              <div key={allergy.id} className="allergy-card">
                <div className="allergy-header">
                  <h3>{allergy.allergen}</h3>
                  <span 
                    className="severity-badge"
                    style={{ backgroundColor: getSeverityColor(allergy.severity) }}
                  >
                    {allergy.severity}
                  </span>
                </div>
                <div className="allergy-details">
                  <p><strong>Type:</strong> {allergy.type}</p>
                  <p><strong>Reaction:</strong> {allergy.reaction}</p>
                  <p><strong>Date Recorded:</strong> {allergy.dateRecorded}</p>
                </div>
                <div className="allergy-actions">
                  <button className="btn-secondary">Edit</button>
                  <button 
                    className="btn-danger"
                    onClick={() => handleDeleteAllergy(allergy.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddForm && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Add New Allergy</h3>
              <button 
                className="close-btn"
                onClick={() => setShowAddForm(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAddAllergy}>
              <div className="form-group">
                <label>Allergen:</label>
                <input
                  type="text"
                  value={newAllergy.allergen}
                  onChange={(e) => setNewAllergy({...newAllergy, allergen: e.target.value})}
                  required
                />
              </div>
              <div className="form-group">
                <label>Type:</label>
                <select
                  value={newAllergy.type}
                  onChange={(e) => setNewAllergy({...newAllergy, type: e.target.value})}
                >
                  <option value="Drug">Drug</option>
                  <option value="Food">Food</option>
                  <option value="Environmental">Environmental</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Severity:</label>
                <select
                  value={newAllergy.severity}
                  onChange={(e) => setNewAllergy({...newAllergy, severity: e.target.value})}
                >
                  <option value="Low">Low</option>
                  <option value="Moderate">Moderate</option>
                  <option value="High">High</option>
                  <option value="Severe">Severe</option>
                </select>
              </div>
              <div className="form-group">
                <label>Reaction:</label>
                <textarea
                  value={newAllergy.reaction}
                  onChange={(e) => setNewAllergy({...newAllergy, reaction: e.target.value})}
                  rows="3"
                  required
                />
              </div>
              <div className="form-group">
                <label>Date Recorded:</label>
                <input
                  type="date"
                  value={newAllergy.dateRecorded}
                  onChange={(e) => setNewAllergy({...newAllergy, dateRecorded: e.target.value})}
                  required
                />
              </div>
              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowAddForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Add Allergy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Allergies;