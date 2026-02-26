import React, { useState } from "react";
import { Search, RefreshCw, Filter } from "lucide-react";

const Header = ({
  onSearchChange,
  onSidebarToggle,
  onRefresh,
  searchTerm = "",
}) => {
  const [localSearchTerm, setLocalSearchTerm] = useState(searchTerm);

  // Sync local search term with prop changes (e.g., from session storage restoration)
  React.useEffect(() => {
    setLocalSearchTerm(searchTerm);
  }, [searchTerm]);

  const handleSearchInputChange = (event) => {
    const term = event.target.value;
    setLocalSearchTerm(term);
    // Don't trigger search on keystroke - only on button click or Enter
  };

  const handleSearchSubmit = () => {
    // Trigger search when button is clicked or Enter is pressed
    onSearchChange && onSearchChange(localSearchTerm);
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter") {
      handleSearchSubmit();
    }
  };

  const handleClearSearch = () => {
    setLocalSearchTerm("");
    // Trigger search with empty term to reset to normal patient list
    onSearchChange && onSearchChange("");
  };

  const handleQuickFiltersClick = () => {
    console.log("Quick Filters button clicked!");
    onSidebarToggle && onSidebarToggle();
  };

  const handleRefresh = () => {
    onRefresh ? onRefresh() : window.location.reload();
  };

  return (
    <div
      style={{
        background: "white",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        position: "relative",
        zIndex: 100,
      }}
    >
      {/* Top Header */}
      <div
        style={{
          padding: "1rem 1.5rem",
          borderBottom: "1px solid #e0e0e0",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: "600",
                color: "#333",
                margin: 0,
              }}
            >
              FHIR Patient Viewer
            </h1>
            <p
              style={{
                fontSize: "0.9rem",
                color: "#666",
                margin: "0.25rem 0 0 0",
              }}
            >
              Healthcare Data Management System
            </p>
          </div>
          <div
            style={{
              fontSize: "0.9rem",
              color: "#666",
            }}
          >
            Current Date and Time:{" "}
            {new Date().toLocaleString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              timeZoneName: "short",
            })}
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div
        style={{
          padding: "1rem 1.5rem",
          borderBottom: "1px solid #e0e0e0",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <button
              onClick={handleQuickFiltersClick}
              style={{
                background: "#dc3545",
                color: "white",
                border: "none",
                padding: "0.5rem 1rem",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "500",
                fontSize: "0.9rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <Filter style={{ width: "16px", height: "16px" }} />
              Quick Filters
            </button>
            <h2
              style={{
                fontSize: "1.25rem",
                fontWeight: "600",
                color: "#333",
                margin: 0,
              }}
            >
              FHIR Resource Viewer - Patient Search
            </h2>
          </div>
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
            }}
          >
            <button
              onClick={handleRefresh}
              style={{
                background: "#f8f9fa",
                border: "1px solid #dee2e6",
                padding: "0.5rem 1rem",
                borderRadius: "4px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.9rem",
                color: "#007bff",
              }}
            >
              <RefreshCw style={{ width: "16px", height: "16px" }} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div
        style={{
          padding: "1rem 1.5rem",
          borderBottom: "1px solid #e0e0e0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            maxWidth: "400px",
          }}
        >
          <div
            style={{
              position: "relative",
              flex: "1",
            }}
          >
            <Search
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "20px",
                height: "20px",
                color: "#999",
              }}
            />
            <input
              type="text"
              value={localSearchTerm}
              onChange={handleSearchInputChange}
              onKeyPress={handleKeyPress}
              placeholder="Search patients by name or ID..."
              style={{
                padding: "0.5rem 2.5rem 0.5rem 2.5rem",
                border: "2px solid #dee2e6", // Stronger border
                borderRadius: "4px 0 0 4px",
                width: "100%",
                fontSize: "1rem",
                height: "38px", // Fixed height to match button
                boxSizing: "border-box",
                outline: "none",
                transition:
                  "border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#007bff";
                e.target.style.boxShadow = "0 0 0 3px rgba(0,123,255,0.25)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#dee2e6";
                e.target.style.boxShadow = "none";
              }}
            />
            {/* Clear button - only show when there's text to clear */}
            {localSearchTerm && (
              <button
                onClick={handleClearSearch}
                style={{
                  position: "absolute",
                  right: "8px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "#c51515",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "50%",
                  width: "20px",
                  height: "20px",
                }}
                title="Clear search"
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = "#f8f9fa";
                  e.target.style.color = "#495057";
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = "transparent";
                  e.target.style.color = "#999";
                }}
              >
                ×
              </button>
            )}
          </div>
          <button
            onClick={handleSearchSubmit}
            style={{
              background: "#000000",
              color: "white",
              border: "2px solid #50565c", // Match input border width
              padding: "0.5rem 1rem",
              borderRadius: "0 4px 4px 0",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.9rem",
              fontWeight: "500",
              height: "38px", // Match input height
              boxSizing: "border-box",
              marginLeft: "-2px", // Overlap border with input for seamless look
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "#0056b3";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "#007bff";
            }}
          >
            <Search style={{ width: "16px", height: "16px" }} />
            Search
          </button>
        </div>
      </div>
    </div>
  );
};

export default Header;
