import { useContext } from 'react';
import UserContextInternal from './UserContext.jsx';

export function useUser() {
  return useContext(UserContextInternal);
}
