import React, { useState } from 'react';

const Header = ({ onSearchChange, onFilterChange, onSidebarToggle }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showQuickFilters, setShowQuickFilters] = useState(false);

  const handleSearch = (event) => {
    const term = event.target.value;
    setSearchTerm(term);
    onSearchChange(term);
  };

  const toggleQuickFilters = () => {
    setShowQuickFilters(!showQuickFilters);
  };

  const applyQuickFilter = (filterType) => {
    onFilterChange(filterType);
    setShowQuickFilters(false);
  };

  const handleRefresh = () => {
    window.location.reload();
  };

  const handleExport = () => {
    console.log('Export functionality');
  };

  return (
    <div className="main-header">
      <div className="header-top">
        <div className="header-left">
          <button 
            className="sidebar-toggle-btn" 
            onClick={() => {
              console.log('Button clicked!');
              onSidebarToggle();
            }}
          >
            Quick Filters
          </button>
          <h1>FHIR Resource Viewer - Patient Search</h1>
        </div>
        <div className="header-right">
          <p className="current-date">
            Current Date and Time: {new Date().toLocaleString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              timeZoneName: 'short'
            })}
          </p>
        </div>
      </div>

      <div className="header-controls">
        <div className="left-controls">
          <input
            type="text"
            placeholder="Search"
            value={searchTerm}
            onChange={handleSearch}
            className="search-input"
          />
        </div>

        <div className="right-controls">
          <button className="export-btn" onClick={handleExport}>📤 Export</button>
          <button className="refresh-btn" onClick={handleRefresh}>🔄 Refresh</button>
          <button className="settings-btn">⚙️ Settings</button>
        </div>
      </div>

      {showQuickFilters && (
        <div className="quick-filters">
          <button onClick={() => applyQuickFilter('all')}>All</button>
          <button onClick={() => applyQuickFilter('active')}>Active</button>
          <button onClick={() => applyQuickFilter('inactive')}>Inactive</button>
          <button onClick={() => applyQuickFilter('male')}>Male</button>
          <button onClick={() => applyQuickFilter('female')}>Female</button>
        </div>
      )}
    </div>
  );
};

export default Header;