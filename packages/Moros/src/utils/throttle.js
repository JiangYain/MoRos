/**
 * Throttle function - limits function execution to once per specified interval
 * @param {Function} fn - Function to throttle
 * @param {number} wait - Minimum time between function calls in milliseconds
 * @returns {Function} Throttled function
 */
export const throttle = (fn, wait = 30) => {
  let lastTime = 0;
  let timeout = null;
  
  return (...args) => {
    const now = performance.now();
    const remaining = wait - (now - lastTime);
    
    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastTime = now;
      fn(...args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastTime = performance.now();
        timeout = null;
        fn(...args);
      }, remaining);
    }
  };
};

/**
 * Debounce function - delays function execution until after wait milliseconds have elapsed
 * @param {Function} fn - Function to debounce
 * @param {number} wait - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export const debounce = (fn, wait = 300) => {
  let timeout = null;
  
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      fn(...args);
    }, wait);
  };
};
