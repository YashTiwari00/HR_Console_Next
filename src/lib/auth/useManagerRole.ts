'use client';

import { useEffect, useState } from 'react';
import { normalizeRole } from '@/lib/auth/roles';
import { fetchCurrentUserContext } from '@/app/employee/_lib/pmsClient';

export function isManagerRoleValue(role: unknown) {
  return normalizeRole(role) === 'manager';
}

export function useManagerRole() {
  const [roleResolved, setRoleResolved] = useState(false);
  const [isManagerRole, setIsManagerRole] = useState(false);

  useEffect(() => {
    let active = true;

    async function resolveRole() {
      try {
        const context = await fetchCurrentUserContext();
        const role = context?.profile?.role;
        if (!active) return;
        setIsManagerRole(isManagerRoleValue(role));
      } catch {
        if (!active) return;
        setIsManagerRole(false);
      } finally {
        if (active) {
          setRoleResolved(true);
        }
      }
    }

    resolveRole();

    return () => {
      active = false;
    };
  }, []);

  return {
    roleResolved,
    isManagerRole,
  };
}
