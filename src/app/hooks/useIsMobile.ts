import { useState, useEffect } from 'react';

const MOBILE_BREAKPOINT = 768;

function getIsMobile() {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(getIsMobile());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
}
