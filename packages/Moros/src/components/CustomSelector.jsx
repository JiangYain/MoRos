import React from 'react'

function CustomSelector({ value, options, onChange, className = "" }) {
  const activeIndex = options.findIndex(option => option.value === value)
  
  return (
    <div className={`custom-selector ${className}`}>
      <div className="selector-track">
        <div className="selector-options">
          {options.map((option, index) => (
            <div
              key={option.value}
              className={`selector-option ${value === option.value ? 'active' : ''}`}
              onClick={() => onChange(option.value)}
            >
              <div className="selector-option-label">
                {option.label}
              </div>
            </div>
          ))}
        </div>
        <div 
          className="selector-indicator"
          style={{
            width: `calc(${100 / options.length}% - 4px)`,
            left: `calc(${activeIndex * (100 / options.length)}% + 2px)`
          }}
        />
      </div>
    </div>
  )
}

export default CustomSelector
