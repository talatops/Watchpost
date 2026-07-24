import { createContext, useContext } from 'react';
import type { User } from '../types';

export interface UserContextValue {
  me: User | null;
  role: string;
}

export const UserContext = createContext<UserContextValue>({ me: null, role: '' });

export function useUser(): UserContextValue {
  return useContext(UserContext);
}
