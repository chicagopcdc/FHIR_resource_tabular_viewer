import React, { useState } from 'react';

const Sidebar = ({ isOpen, onClose }) => {
  const [expandedSections, setExpandedSections] = useState({});
  const [searchTerms, setSearchTerms] = useState({});
  const [filteredOptions, setFilteredOptions] = useState({});

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleSearch = (categoryKey, searchTerm) => {
    setSearchTerms(prev => ({
      ...prev,
      [categoryKey]: searchTerm
    }));

    const category = filterCategories.find(cat => cat.key === categoryKey);
    if (category) {
      const filtered = category.options.filter(option =>
        option.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      setFilteredOptions(prev => ({
        ...prev,
        [categoryKey]: filtered
      }));
    }
  };

  const getOptionsToShow = (categoryKey, originalOptions) => {
    const searchTerm = searchTerms[categoryKey];
    if (!searchTerm || searchTerm.trim() === '') {
      return originalOptions;
    }
    return filteredOptions[categoryKey] || originalOptions;
  };

  const filterCategories = [
    {
      name: 'Allergies',
      key: 'allergies',
      options: [
        'All Allergies',
        'Peanut Allergy',
        'Penicillin Allergy', 
        'Shellfish Allergy',
        'Pollen Allergy',
        'Pet Dander Allergy',
        'Food Allergies',
        'Drug Allergies',
        'Environmental Allergies',
        'Latex Allergy',
        'Milk Allergy',
        'Egg Allergy'
      ]
    },
    {
      name: 'Appointments',
      key: 'appointments',
      options: ['All Appointments', 'Scheduled', 'Completed', 'Cancelled', 'Pending', 'Rescheduled']
    },
    {
      name: 'Care Team',
      key: 'careteam',
      options: ['All Care Team', 'Primary Care', 'Specialists', 'Nurses', 'Therapists', 'Pharmacists']
    },
    {
      name: 'Conditions',
      key: 'conditions',
      options: ['All Conditions', 'Active', 'Resolved', 'Chronic', 'Acute', 'Under Treatment']
    },
    {
      name: 'Procedures',
      key: 'procedures',
      options: ['All Procedures', 'Surgical', 'Diagnostic', 'Therapeutic', 'Preventive', 'Emergency']
    },
    {
      name: 'Service Requests',
      key: 'servicerequests',
      options: ['All Service Requests', 'Lab Orders', 'Imaging', 'Referrals', 'Prescriptions', 'Consultations']
    }
  ];

  console.log('Sidebar render - isOpen:', isOpen);

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'show' : ''}`} onClick={onClose}></div>
      
      <div className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <h3>FHIR Filters</h3>
          <button className="close-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="sidebar-content">
          {filterCategories.map((category) => (
            <div key={category.key} className="filter-category">
              <div 
                className="category-header"
                onClick={() => toggleSection(category.key)}
              >
                <span>{category.name}</span>
                <span className={`arrow ${expandedSections[category.key] ? 'expanded' : ''}`}>
                  ▼
                </span>
              </div>
              
              {expandedSections[category.key] && (
                <div className="category-options">
                  <input
                    type="text"
                    placeholder={`Search ${category.name.toLowerCase()}...`}
                    value={searchTerms[category.key] || ''}
                    onChange={(e) => handleSearch(category.key, e.target.value)}
                    className="filter-search-input"
                  />
                  
                  <div className="options-list">
                    {getOptionsToShow(category.key, category.options).map((option, index) => (
                      <div key={index} className="filter-option">
                        <label className="filter-option-label">
                          <input 
                            type="checkbox" 
                            className="filter-checkbox"
                          />
                          <span className="filter-option-text">{option}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                  
                  {getOptionsToShow(category.key, category.options).length === 0 && searchTerms[category.key] && (
                    <div className="no-results">
                      No {category.name.toLowerCase()} found matching "{searchTerms[category.key]}"
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default Sidebar;