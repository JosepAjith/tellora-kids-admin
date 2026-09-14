import { useContext } from 'react';
import { AuthContext } from '../contexts/authContextValue.js';

export function useAuth() {
  return useContext(AuthContext);
}
