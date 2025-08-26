// src/AddTabModal.js - Updated to remove hardcoded categories
import React, { useState, useMemo } from 'react';
import './AddTabModal.css';

const AddTabModal = ({ availableResources, tabCounts, onAddTab, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  console.log('🔍 MODAL DEBUG: availableResources prop:', availableResources);
  console.log('🔍 MODAL DEBUG: tabCounts prop:', tabCounts);

  // Dynamic categorization based on resource names - NO HARDCODING
  const categorizeResources = (resources) => {
    const categories = {
      'Patient Care': [],
      'Clinical Data': [],
      'Administrative': [],
      'Workflow': [],
      'Terminology': [],
      'Other': []
    };

    resources.forEach(resource => {
      const resourceName = resource.label.toLowerCase();
      
      // Categorize based on common FHIR resource patterns
      if (resourceName.includes('patient') || resourceName.includes('care') || 
          resourceName.includes('plan') || resourceName.includes('goal') ||
          resourceName.includes('team') || resourceName.includes('allergy') ||
          resourceName.includes('condition') || resourceName.includes('medication')) {
        categories['Patient Care'].push(resource);
      } else if (resourceName.includes('observation') || resourceName.includes('diagnostic') ||
                resourceName.includes('procedure') || resourceName.includes('immunization') ||
                resourceName.includes('specimen') || resourceName.includes('imaging')) {
        categories['Clinical Data'].push(resource);
      } else if (resourceName.includes('organization') || resourceName.includes('practitioner') ||
                resourceName.includes('location') || resourceName.includes('account') ||
                resourceName.includes('schedule') || resourceName.includes('appointment')) {
        categories['Administrative'].push(resource);
      } else if (resourceName.includes('task') || resourceName.includes('communication') ||
                resourceName.includes('request') || resourceName.includes('response') ||
                resourceName.includes('workflow')) {
        categories['Workflow'].push(resource);
      } else if (resourceName.includes('code') || resourceName.includes('value') ||
                resourceName.includes('concept') || resourceName.includes('terminology')) {
        categories['Terminology'].push(resource);
      } else {
        categories['Other'].push(resource);
      }
    });

    // Remove empty categories
    Object.keys(categories).forEach(category => {
      if (categories[category].length === 0) {
        delete categories[category];
      }
    });

    return categories;
  };

  // Filter and search resources
  const filteredResources = useMemo(() => {
    let filtered = [...availableResources];

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(resource =>
        resource.label.toLowerCase().includes(searchLower) ||
        resource.description.toLowerCase().includes(searchLower)
      );
    }

    // Categorize filtered resources
    const categorized = categorizeResources(filtered);

    // Apply category filter
    if (selectedCategory !== 'All') {
      return { [selectedCategory]: categorized[selectedCategory] || [] };
    }

    return categorized;
  }, [availableResources, searchTerm, selectedCategory]);

  // Get available categories dynamically
  const availableCategories = useMemo(() => {
    const categorized = categorizeResources(availableResources);
    return ['All', ...Object.keys(categorized).sort()];
  }, [availableResources]);

  // Calculate total resources for each category
  const getCategoryCount = (categoryName) => {
    if (categoryName === 'All') {
      return availableResources.length;
    }
    const categorized = categorizeResources(availableResources);
    return categorized[categoryName]?.length || 0;
  };

  return (
    <div className="add-tab-modal-overlay" onClick={onClose}>
      <div className="add-tab-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Add Resource Tab</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          <p className="modal-description">
            Select a FHIR resource type to add as a new tab. All resource types are discovered dynamically from the FHIR server.
          </p>
          
          {/* Search and Filter Controls */}
          <div className="modal-controls">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search resources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <span className="search-icon">🔍</span>
            </div>
            
            <div className="category-filter">
              <select 
                value={selectedCategory} 
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="category-select"
              >
                {availableCategories.map(category => (
                  <option key={category} value={category}>
                    {category} {category !== 'All' ? `(${getCategoryCount(category)})` : `(${availableResources.length})`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Resource Grid by Category */}
          <div className="resource-categories">
            {Object.entries(filteredResources).map(([categoryName, resources]) => (
              <div key={categoryName} className="resource-category">
                <h4 className="category-header">
                  {categoryName}
                  <span className="category-count">({resources.length})</span>
                </h4>
                
                <div className="resource-grid">
                  {resources.map(resource => (
                    <div 
                      key={resource.id}
                      className="resource-card"
                      onClick={() => onAddTab(resource.id)}
                    >
                      <div className="resource-icon">{resource.icon}</div>
                      <div className="resource-info">
                        <h5>{resource.label}</h5>
                        <p>{resource.description}</p>
                        <div className="resource-count">
                          {tabCounts[resource.id] || 0} items available
                        </div>
                      </div>
                      <div className="add-indicator">+</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          
          {/* Empty State */}
          {availableResources.length === 0 && (
            <div className="empty-state">
              <p>No additional resource types available to add as tabs.</p>
            </div>
          )}

          {/* No Search Results */}
          {availableResources.length > 0 && Object.keys(filteredResources).length === 0 && (
            <div className="empty-state">
              <p>No resources found matching "{searchTerm}"</p>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <div className="results-summary">
            Showing {Object.values(filteredResources).flat().length} of {availableResources.length} resources
          </div>
          <button className="cancel-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddTabModal;