import { useContext } from 'react';
import { ApiOptimizerContext } from '@/components/shared/ApiOptimizer';

export const useApiOptimizer = () => {
  const context = useContext(ApiOptimizerContext);
  if (!context) {
    // If not wrapped in provider, return a function that directly executes the request
    return { queueRequest: (req) => req() };
  }
  return context;
};
