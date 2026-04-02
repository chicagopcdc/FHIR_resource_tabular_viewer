import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, Calendar, Filter, BarChart3, LineChart, Table, Download, List } from 'lucide-react';

const LabsTimeSeries = ({ 
  observations = [], 
  diagnosticReports = [], 
  patientId
}) => {
  const [filters, setFilters] = useState({
    dateRange: 'all',
    testType: 'all',
    abnormalOnly: false,
    category: 'all'
  });
  const [sortConfig, setSortConfig] = useState({
    key: 'date',
    direction: 'desc'
  });
  const [viewMode, setViewMode] = useState('table'); // 'table', 'graph'
  const [selectedTests, setSelectedTests] = useState(new Set());

  // Process and normalize lab data
  const labData = useMemo(() => {
    const labs = [];
    
    // Process Observations as lab results
    observations.forEach(obs => {
      const value = extractNumericValue(obs);
      const unit = extractUnit(obs);
      const referenceRange = extractReferenceRange(obs);
      
      labs.push({
        id: obs.id || 'unknown',
        testName: obs.code?.display || obs.code?.text || obs.code_display || 'Unknown Test',
        testCode: obs.code?.coding?.[0]?.code || obs.code_code || 'unknown',
        value: value,
        displayValue: obs.valueString || obs.value_quantity || value || 'N/A',
        unit: unit,
        date: obs.effectiveDateTime || obs.effective_date || obs.issued || 'Unknown',
        status: obs.status || 'unknown',
        category: obs.category?.[0]?.display || obs.category?.[0]?.text || 'Laboratory',
        referenceRange: referenceRange,
        isAbnormal: checkIfAbnormal(value, referenceRange, unit),
        performer: obs.performer?.[0]?.display || 'Unknown Lab',
        source: 'Observation',
        rawData: obs
      });
    });

    // Process DiagnosticReports
    diagnosticReports.forEach(report => {
      // If report has results, process each result
      if (report.result && report.result.length > 0) {
        report.result.forEach((resultRef, index) => {
          labs.push({
            id: `${report.id}-result-${index}`,
            testName: report.code?.display || report.code?.text || `Report Result ${index + 1}`,
            testCode: report.code?.coding?.[0]?.code || 'report-result',
            value: null, // DiagnosticReports typically don't have direct numeric values
            displayValue: 'See Report',
            unit: '',
            date: report.effectiveDateTime || report.issued || 'Unknown',
            status: report.status || 'unknown',
            category: report.category?.[0]?.display || 'Diagnostic Report',
            referenceRange: 'N/A',
            isAbnormal: false,
            performer: report.performer?.[0]?.display || 'Unknown',
            source: 'DiagnosticReport',
            rawData: report
          });
        });
      } else {
        // Process report as single lab item
        labs.push({
          id: report.id || 'unknown',
          testName: report.code?.display || report.code?.text || 'Diagnostic Report',
          testCode: report.code?.coding?.[0]?.code || 'diagnostic-report',
          value: null,
          displayValue: report.conclusion || 'See Report',
          unit: '',
          date: report.effectiveDateTime || report.issued || 'Unknown',
          status: report.status || 'unknown',
          category: report.category?.[0]?.display || 'Diagnostic Report',
          referenceRange: 'N/A',
          isAbnormal: false,
          performer: report.performer?.[0]?.display || 'Unknown',
          source: 'DiagnosticReport',
          rawData: report
        });
      }
    });

    return labs.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [observations, diagnosticReports]);

  // Get filter options from data
  const filterOptions = useMemo(() => {
    const testTypes = new Set();
    const categories = new Set();
    const dates = [];
    
    labData.forEach(lab => {
      if (lab.testName) testTypes.add(lab.testName);
      if (lab.category) categories.add(lab.category);
      if (lab.date) {
        const labDate = new Date(lab.date);
        if (!isNaN(labDate.getTime())) {
          dates.push(labDate);
        }
      }
    });

    // Generate data-driven date range options
    const dateRanges = generateDateRanges(dates);
    
    return {
      testTypes: Array.from(testTypes).sort(),
      categories: Array.from(categories).sort(),
      dateRanges
    };
  }, [labData]);

  // Filter lab data
  const filteredLabData = useMemo(() => {
    let filtered = labData;

    // Date filter
    if (filters.dateRange !== 'all') {
      // Handle specific date filtering (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(filters.dateRange)) {
        const selectedDate = filters.dateRange;
        filtered = filtered.filter(lab => {
          const labDate = new Date(lab.date);
          const labDateKey = labDate.toISOString().split('T')[0];
          return labDateKey === selectedDate;
        });
      } else {
        // Handle traditional range filtering
        const now = new Date();
        const filterDate = getFilterDate(now, filters.dateRange);
        filtered = filtered.filter(lab => new Date(lab.date) >= filterDate);
      }
    }

    // Test type filter
    if (filters.testType !== 'all') {
      filtered = filtered.filter(lab => lab.testName === filters.testType);
    }

    // Category filter
    if (filters.category !== 'all') {
      filtered = filtered.filter(lab => lab.category === filters.category);
    }

    // Abnormal only filter
    if (filters.abnormalOnly) {
      filtered = filtered.filter(lab => lab.isAbnormal);
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];

      if (sortConfig.key === 'date') {
        aValue = new Date(aValue);
        bValue = new Date(bValue);
      } else if (sortConfig.key === 'value') {
        aValue = parseFloat(aValue) || 0;
        bValue = parseFloat(bValue) || 0;
      }

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [labData, filters, sortConfig]);

  // Group data by test for trending
  const trendingData = useMemo(() => {
    const grouped = {};
    
    filteredLabData.forEach(lab => {
      if (lab.value !== null && !isNaN(parseFloat(lab.value))) {
        if (!grouped[lab.testName]) {
          grouped[lab.testName] = [];
        }
        grouped[lab.testName].push({
          date: new Date(lab.date),
          value: parseFloat(lab.value),
          unit: lab.unit,
          status: lab.status,
          isAbnormal: lab.isAbnormal,
          referenceRange: lab.referenceRange
        });
      }
    });
    
    // Sort each test's data by date
    Object.keys(grouped).forEach(testName => {
      grouped[testName].sort((a, b) => a.date - b.date);
    });
    
    return grouped;
  }, [filteredLabData]);

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleTestSelection = (testName) => {
    setSelectedTests(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(testName)) {
        newSelection.delete(testName);
      } else {
        newSelection.add(testName);
      }
      return newSelection;
    });
  };

  const formatDate = (dateString) => {
    if (!dateString || dateString === 'Unknown') return 'Unknown';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const formatValue = (value, unit) => {
    if (value === null || value === undefined || value === 'N/A') return 'N/A';
    
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      return `${numValue} ${unit || ''}`.trim();
    }
    return value;
  };

  const getStatusStyle = (status, isAbnormal) => {
    if (isAbnormal) {
      return { backgroundColor: '#dc3545', color: 'white' };
    }
    
    const styles = {
      final: { backgroundColor: '#28a745', color: 'white' },
      preliminary: { backgroundColor: '#ffc107', color: '#212529' },
      registered: { backgroundColor: '#17a2b8', color: 'white' },
      unknown: { backgroundColor: '#6c757d', color: 'white' }
    };
    
    return styles[status?.toLowerCase()] || styles.unknown;
  };

  const renderTable = () => (
    <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #dee2e6' }}>
      {/* Table Header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr 1fr 1fr 120px 100px 150px 80px',
        gap: '0.75rem',
        padding: '1rem',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #dee2e6',
        fontWeight: '600',
        fontSize: '0.85rem',
        color: '#495057'
      }}>
        <button onClick={() => handleSort('testName')} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
          Test Name {sortConfig.key === 'testName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
        </button>
        <button onClick={() => handleSort('value')} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
          Value {sortConfig.key === 'value' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
        </button>
        <span>Reference Range</span>
        <button onClick={() => handleSort('date')} style={{ textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
          Date {sortConfig.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
        </button>
        <span>Category</span>
        <span>Status</span>
        <span>Performer</span>
        <span>Trend</span>
      </div>

      {/* Table Rows */}
      {filteredLabData.map((lab, index) => (
        <div key={lab.id || index} style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 120px 100px 150px 80px',
          gap: '0.75rem',
          padding: '1rem',
          borderBottom: index < filteredLabData.length - 1 ? '1px solid #dee2e6' : 'none',
          alignItems: 'center',
          fontSize: '0.9rem',
          backgroundColor: lab.isAbnormal ? '#fff5f5' : 'white'
        }}>
          <div>
            <div style={{ fontWeight: '600', color: '#333' }}>
              {lab.testName}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>
              {lab.testCode}
            </div>
          </div>
          <div style={{
            fontWeight: lab.isAbnormal ? '600' : 'normal',
            color: lab.isAbnormal ? '#dc3545' : '#333'
          }}>
            {formatValue(lab.displayValue, lab.unit)}
          </div>
          <div style={{ fontSize: '0.85rem', color: '#666' }}>
            {lab.referenceRange}
          </div>
          <div style={{ fontSize: '0.85rem' }}>
            {formatDate(lab.date)}
          </div>
          <div style={{ fontSize: '0.8rem' }}>
            {lab.category}
          </div>
          <div>
            <span style={{
              ...getStatusStyle(lab.status, lab.isAbnormal),
              padding: '0.25rem 0.5rem',
              borderRadius: '12px',
              fontSize: '0.75rem',
              fontWeight: '500'
            }}>
              {lab.status}
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>
            {lab.performer}
          </div>
          <div>
            {trendingData[lab.testName] && trendingData[lab.testName].length > 1 ? (
              <button
                onClick={() => toggleTestSelection(lab.testName)}
                title={`${selectedTests.has(lab.testName) ? 'Remove from' : 'Add to'} trend graph (${trendingData[lab.testName].length} values)`}
                style={{
                  background: selectedTests.has(lab.testName) ? '#28a745' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.4rem 0.6rem',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-1px)';
                  e.target.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }}
              >
                <TrendingUp size={14} />
                {selectedTests.has(lab.testName) ? 'Selected' : 'Trend'}
              </button>
            ) : (
              <span style={{ color: '#999', fontSize: '0.75rem', fontStyle: 'italic' }}>
                Single value
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const renderSimpleGraph = () => {
    const selectedTestData = Array.from(selectedTests)
      .filter(testName => trendingData[testName])
      .slice(0, 3); // Limit to 3 tests for readability

    if (selectedTestData.length === 0) {
      return (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          backgroundColor: '#e3f2fd',
          borderRadius: '8px',
          color: '#1565c0',
          border: '2px dashed #42a5f5'
        }}>
          <TrendingUp style={{ width: '64px', height: '64px', margin: '0 auto 1rem', color: '#1976d2' }} />
          <h3 style={{ margin: '0 0 1rem 0', color: '#1565c0', fontSize: '1.3rem' }}>Ready to View Trends!</h3>
          <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #90caf9' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: '600', color: '#1565c0' }}>
              Click the <TrendingUp style={{ display: 'inline', width: '16px', height: '16px', color: '#28a745' }} /> trend buttons in the "Trend" column above
            </p>
            <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
              Select multiple tests to compare their values over time
            </p>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', fontStyle: 'italic' }}>
            Tests with multiple values over time will show trend buttons
          </p>
        </div>
      );
    }

    return (
      <div style={{ backgroundColor: 'white', borderRadius: '8px', border: '1px solid #dee2e6', padding: '1rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, color: '#333', fontSize: '1.3rem' }}>Lab Results Trend Over Time</h3>
          <p style={{ margin: '0.5rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
            Tracking {selectedTestData.length} test{selectedTestData.length !== 1 ? 's' : ''} with monthly timeline
          </p>
        </div>

        {/* Simple ASCII-style graph representation */}
        {selectedTestData.map(testName => {
          const data = trendingData[testName];
          
          // Safety checks for data
          if (!data || data.length === 0) {
            return (
              <div key={testName} style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: '#666' }}>
                  {testName}
                </h4>
                <p style={{ color: '#999', fontStyle: 'italic' }}>No data available for trending</p>
              </div>
            );
          }
          
          const numericValues = data.map(d => d.value).filter(v => v != null && !isNaN(v));
          if (numericValues.length === 0) {
            return (
              <div key={testName} style={{ marginBottom: '2rem', padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
                <h4 style={{ margin: '0 0 1rem 0', color: '#666' }}>
                  {testName}
                </h4>
                <p style={{ color: '#999', fontStyle: 'italic' }}>No numeric values available for trending</p>
              </div>
            );
          }
          
          const maxValue = Math.max(...numericValues);
          const minValue = Math.min(...numericValues);
          const range = maxValue - minValue || 1;

          // Calculate date range for chart info
          const validData = data.filter(d => d.date && d.date instanceof Date && !isNaN(d.date));
          const sortedData = [...validData].sort((a, b) => a.date - b.date);
          const minDate = sortedData.length > 0 ? sortedData[0].date : new Date();
          const maxDate = sortedData.length > 0 ? sortedData[sortedData.length - 1].date : new Date();

          return (
            <div key={testName} style={{ marginBottom: '2rem' }}>
              <h4 style={{ margin: '0 0 1rem 0', color: '#333' }}>
                {testName} {data[0]?.unit && `(${data[0].unit})`}
              </h4>
              
              <div style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '1rem', 
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
                overflowX: 'auto'
              }}>
                <div style={{ marginBottom: '0.5rem', color: '#666' }}>
                  Max: {maxValue} | Min: {minValue} | Range: {range.toFixed(2)}
                </div>
                
                {/* Enhanced SVG-based graph representations with dynamic scaling */}
                <div style={{ backgroundColor: '#fafafa', padding: '20px', borderRadius: '8px', marginTop: '10px' }}>
                  {(() => {
                    // Check for valid data
                    if (validData.length === 0) {
                      return (
                        <div style={{ padding: '1rem', color: '#999', fontStyle: 'italic' }}>
                          No valid dates available for charting
                        </div>
                      );
                    }

                    // Chart dimensions
                    const chartWidth = 800;
                    const chartHeight = 300;
                    const chartPadding = { left: 60, right: 40, top: 40, bottom: 80 };
                    const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
                    const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;

                    // Calculate dynamic value range with padding
                    const valueRange = maxValue - minValue || 1;
                    const valuePadding = valueRange * 0.1;
                    const displayMinValue = Math.max(0, minValue - valuePadding);
                    const displayMaxValue = maxValue + valuePadding;
                    const displayRange = displayMaxValue - displayMinValue;

                    // Prepare data for vertical bars
                    const barData = sortedData.map((d, index) => {
                      const barHeight = ((d.value - displayMinValue) / displayRange) * plotHeight;
                      const barWidth = Math.max(15, plotWidth / sortedData.length - 10);
                      const barX = chartPadding.left + (index * (plotWidth / sortedData.length)) + (plotWidth / sortedData.length - barWidth) / 2;
                      const barY = chartPadding.top + plotHeight - barHeight;
                      
                      return {
                        x: barX,
                        y: barY,
                        width: barWidth,
                        height: Math.max(2, barHeight),
                        value: d.value,
                        date: d.date,
                        color: d.value > maxValue * 0.8 ? '#dc3545' : 
                               d.value > maxValue * 0.6 ? '#fd7e14' :
                               d.value > maxValue * 0.4 ? '#ffc107' : '#28a745'
                      };
                    });

                    // Y-axis ticks
                    const yTicks = [];
                    for (let i = 0; i <= 5; i++) {
                      yTicks.push(displayMinValue + (displayRange * i / 5));
                    }

                    return (
                      <svg 
                        width="100%" 
                        height={chartHeight + 20}
                        viewBox={`0 0 ${chartWidth} ${chartHeight + 20}`}
                        style={{ border: '1px solid #e1e5e9', borderRadius: '4px', backgroundColor: 'white' }}
                      >
                        {/* Chart background */}
                        <rect 
                          x={chartPadding.left} 
                          y={chartPadding.top} 
                          width={plotWidth} 
                          height={plotHeight} 
                          fill="#fafbfc" 
                          stroke="#e1e5e9" 
                          strokeWidth="1"
                        />

                        {/* Horizontal grid lines */}
                        {yTicks.map((tick, i) => {
                          const y = chartPadding.top + plotHeight - ((tick - displayMinValue) / displayRange) * plotHeight;
                          return (
                            <line 
                              key={`grid-${i}`}
                              x1={chartPadding.left} 
                              y1={y} 
                              x2={chartPadding.left + plotWidth} 
                              y2={y} 
                              stroke="#f1f3f4" 
                              strokeWidth="1"
                            />
                          );
                        })}

                        {/* Vertical bars */}
                        {barData.map((bar, i) => (
                          <g key={`bar-${i}`}>
                            {/* Bar */}
                            <rect
                              x={bar.x}
                              y={bar.y}
                              width={bar.width}
                              height={bar.height}
                              fill={bar.color}
                              stroke="#fff"
                              strokeWidth="1"
                              opacity="0.8"
                            />
                            {/* Value label on top of bar */}
                            <text
                              x={bar.x + bar.width / 2}
                              y={bar.y - 5}
                              textAnchor="middle"
                              fontSize="10"
                              fill="#333"
                              fontWeight="bold"
                            >
                              {bar.value.toFixed(1)}
                            </text>
                            {/* Date label below x-axis */}
                            <text
                              x={bar.x + bar.width / 2}
                              y={chartPadding.top + plotHeight + 15}
                              textAnchor="middle"
                              fontSize="10"
                              fill="#666"
                              transform={`rotate(-45 ${bar.x + bar.width / 2} ${chartPadding.top + plotHeight + 15})`}
                            >
                              {bar.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </text>
                          </g>
                        ))}

                        {/* Y-axis */}
                        <line 
                          x1={chartPadding.left} 
                          y1={chartPadding.top} 
                          x2={chartPadding.left} 
                          y2={chartPadding.top + plotHeight} 
                          stroke="#333" 
                          strokeWidth="2"
                        />

                        {/* X-axis */}
                        <line 
                          x1={chartPadding.left} 
                          y1={chartPadding.top + plotHeight} 
                          x2={chartPadding.left + plotWidth} 
                          y2={chartPadding.top + plotHeight} 
                          stroke="#333" 
                          strokeWidth="2"
                        />

                        {/* Y-axis labels */}
                        {yTicks.map((tick, i) => {
                          const y = chartPadding.top + plotHeight - ((tick - displayMinValue) / displayRange) * plotHeight;
                          return (
                            <text 
                              key={`y-label-${i}`}
                              x={chartPadding.left - 10} 
                              y={y + 4} 
                              textAnchor="end" 
                              fontSize="12" 
                              fill="#666"
                            >
                              {tick.toFixed(1)}
                            </text>
                          );
                        })}

                        {/* Chart title */}
                        <text 
                          x={chartWidth / 2} 
                          y="25" 
                          textAnchor="middle" 
                          fontSize="16" 
                          fontWeight="bold" 
                          fill="#333"
                        >
                          {testName} - Vertical Bar Comparison
                        </text>

                        {/* Y-axis label */}
                        <text 
                          x="20" 
                          y={chartHeight / 2} 
                          textAnchor="middle" 
                          fontSize="12" 
                          fill="#666"
                          transform={`rotate(-90 20 ${chartHeight / 2})`}
                        >
                          Value ({data[0]?.unit || 'units'})
                        </text>
                      </svg>
                    );
                  })()}
                  
                  
                  {/* Chart information */}
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    marginTop: '10px', 
                    padding: '10px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    color: '#666'
                  }}>
                    <span>{data.length} data points</span>
                    <span>{minDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} to {maxDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                    <span>Range: {minValue.toFixed(1)} - {maxValue.toFixed(1)} {data[0]?.unit || ''}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="labs-timeseries-viewer" style={{ padding: '1rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#333', fontSize: '1.5rem' }}>
              Laboratory Results & Measurements
            </h2>
            <p style={{ margin: '0.25rem 0 0 0', color: '#666', fontSize: '0.9rem' }}>
              Time-series view with filtering and trending capabilities
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: '#666' }}>
              {filteredLabData.length} results
            </span>
            <button
              onClick={() => setViewMode(viewMode === 'table' ? 'graph' : 'table')}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                backgroundColor: '#f8f9fa',
                cursor: 'pointer',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}>
              {viewMode === 'table' ? (
                <>
                  <BarChart3 style={{ width: '16px', height: '16px' }} />
                  <span>Chart View</span>
                </>
              ) : (
                <>
                  <List style={{ width: '16px', height: '16px' }} />
                  <span>Table View</span>
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Enhanced Inline Filters */}
        <div style={{
          backgroundColor: '#f8f9fa',
          padding: '1rem',
          borderRadius: '8px',
          marginBottom: '1rem',
          border: '1px solid #e9ecef'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            alignItems: 'end'
          }}>
            {/* Date Range */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Date Range
              </label>
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters({...filters, dateRange: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="all">All Time</option>
                {filterOptions.dateRanges.map(range => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Test Type */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Test Type
              </label>
              <select
                value={filters.testType}
                onChange={(e) => setFilters({...filters, testType: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="all">All Tests</option>
                {filterOptions.testTypes.map(testName => (
                  <option key={testName} value={testName}>{testName}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: '500' }}>
                Category
              </label>
              <select
                value={filters.category}
                onChange={(e) => setFilters({...filters, category: e.target.value})}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  fontSize: '0.875rem'
                }}
              >
                <option value="all">All Categories</option>
                {filterOptions.categories.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>

            {/* Abnormal Only Checkbox */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
              <input
                type="checkbox"
                id="abnormal-only"
                checked={filters.abnormalOnly}
                onChange={(e) => setFilters({...filters, abnormalOnly: e.target.checked})}
                style={{ marginRight: '0.5rem' }}
              />
              <label htmlFor="abnormal-only" style={{ fontSize: '0.875rem', fontWeight: '500' }}>
                Abnormal Only
              </label>
            </div>
          </div>

          {/* Clear Filters Button */}
          <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setFilters({
                dateRange: 'all',
                testType: 'all',
                abnormalOnly: false,
                category: 'all'
              })}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {filteredLabData.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          border: '2px dashed #dee2e6'
        }}>
          <BarChart3 style={{ width: '48px', height: '48px', margin: '0 auto 1rem', opacity: 0.5 }} />
          <h3 style={{ margin: '0 0 0.5rem 0' }}>No Lab Results Found</h3>
          <p style={{ margin: 0 }}>No laboratory results match your current filters</p>
        </div>
      ) : (
        viewMode === 'table' ? renderTable() : renderSimpleGraph()
      )}
    </div>
  );
};

// Helper functions
function extractNumericValue(obs) {
  if (obs.valueQuantity?.value !== undefined) return obs.valueQuantity.value;
  if (obs.value_quantity !== undefined && !isNaN(parseFloat(obs.value_quantity))) return parseFloat(obs.value_quantity);
  if (obs.valueString && !isNaN(parseFloat(obs.valueString))) return parseFloat(obs.valueString);
  return null;
}

function extractUnit(obs) {
  if (obs.valueQuantity?.unit) return obs.valueQuantity.unit;
  if (obs.valueQuantity?.code) return obs.valueQuantity.code;
  if (obs.unit) return obs.unit;
  return '';
}

function extractReferenceRange(obs) {
  if (!obs.referenceRange || obs.referenceRange.length === 0) return 'N/A';
  
  const range = obs.referenceRange[0];
  const low = range.low?.value;
  const high = range.high?.value;
  const unit = range.low?.unit || range.high?.unit || '';
  
  if (low !== undefined && high !== undefined) {
    return `${low}-${high} ${unit}`.trim();
  } else if (range.text) {
    return range.text;
  }
  
  return 'N/A';
}

function checkIfAbnormal(value, referenceRange, unit) {
  if (!value || !referenceRange || referenceRange === 'N/A') return false;
  
  // Simple range check
  const rangeMatch = referenceRange.match(/(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)/);
  if (rangeMatch && !isNaN(parseFloat(value))) {
    const numValue = parseFloat(value);
    const low = parseFloat(rangeMatch[1]);
    const high = parseFloat(rangeMatch[2]);
    return numValue < low || numValue > high;
  }
  
  return false;
}

function getFilterDate(now, range) {
  // Handle specific dates (format: "YYYY-MM-DD")
  if (/^\d{4}-\d{2}-\d{2}$/.test(range)) {
    return new Date(range);
  }
  
  const date = new Date(now);
  
  // Handle year ranges (format: "YYYY")
  if (/^\d{4}$/.test(range)) {
    return new Date(`${range}-01-01`);
  }
  
  switch (range) {
    case '1w':
      date.setDate(date.getDate() - 7);
      break;
    case '1m':
      date.setMonth(date.getMonth() - 1);
      break;
    case '3m':
      date.setMonth(date.getMonth() - 3);
      break;
    case '6m':
      date.setMonth(date.getMonth() - 6);
      break;
    case '1y':
      date.setFullYear(date.getFullYear() - 1);
      break;
    default:
      return new Date(0);
  }
  
  return date;
}

function generateDateRanges(dates) {
  if (!dates || dates.length === 0) {
    return [];
  }

  const ranges = [];

  // Group dates by actual date (YYYY-MM-DD)
  const dateGroups = {};
  dates.forEach(date => {
    const dateKey = date.toISOString().split('T')[0]; // Get YYYY-MM-DD format
    if (!dateGroups[dateKey]) {
      dateGroups[dateKey] = [];
    }
    dateGroups[dateKey].push(date);
  });

  // Convert to ranges with counts
  Object.keys(dateGroups)
    .sort((a, b) => new Date(b) - new Date(a)) // Sort by date descending (newest first)
    .forEach(dateKey => {
      const count = dateGroups[dateKey].length;
      const formattedDate = new Date(dateKey).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      
      ranges.push({
        value: dateKey, // Use ISO date as value for filtering
        label: `${formattedDate} (${count} ${count === 1 ? 'result' : 'results'})`,
        count: count,
        date: new Date(dateKey)
      });
    });

  return ranges;
}

export default LabsTimeSeries;
