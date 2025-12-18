import { useEffect } from 'react';
import { useLocation } from 'wouter';

export function ScrollToTop() {
  const [location] = useLocation();

  useEffect(() => {
    // Scroll to top when pathname changes
    window.scrollTo(0, 0);
  }, [location]);

  return null;
}
