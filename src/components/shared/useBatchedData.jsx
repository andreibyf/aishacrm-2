import { useState, useEffect } from 'react';
import { useApiOptimizer } from './ApiOptimizer';
import { User } from '@/api/entities';
import { Tenant } from '@/api/entities';
import { Notification } from '@/api/entities';
import { Employee } from '@/api/entities';

/**
 * Hook to batch load common initial data
 */
export function useBatchedInitialData(options = {}) {
  const {
    loadUser = true,
    loadTenant = true,
    loadNotifications = true,
    loadEmployees = false,
  } = options;

  const { batchLoad } = useApiOptimizer();
  const [data, setData] = useState({
    user: null,
    tenant: null,
    notifications: [],
    employees: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    const load = async () => {
      try {
        const requests = [];

        if (loadUser) {
          requests.push({
            key: 'user',
            entity: 'User',
            method: 'me',
            params: {},
            fn: () => User.me(),
            options: { enableCache: true, cacheTime: 10 * 60 * 1000 },
          });
        }

        if (loadTenant && loadUser) {
          requests.push({
            key: 'tenant',
            entity: 'Tenant',
            method: 'list',
            params: {},
            fn: () => Tenant.list(),
            options: { enableCache: true, cacheTime: 15 * 60 * 1000 },
          });
        }

        if (loadNotifications && loadUser) {
          requests.push({
            key: 'notifications',
            entity: 'Notification',
            method: 'filter',
            params: { is_read: false },
            fn: async () => {
              const user = await User.me();
              return Notification.filter({ user_email: user.email, is_read: false });
            },
            options: { enableCache: true, cacheTime: 2 * 60 * 1000 },
          });
        }

        if (loadEmployees && loadUser) {
          requests.push({
            key: 'employees',
            entity: 'Employee',
            method: 'list',
            params: {},
            fn: async () => {
              const user = await User.me();
              return Employee.filter({ tenant_id: user.tenant_id });
            },
            options: { enableCache: true, cacheTime: 5 * 60 * 1000 },
          });
        }

        const results = await batchLoad(requests);

        const newData = {
          loading: false,
          error: null,
        };

        results.forEach(result => {
          if (result.status === 'fulfilled') {
            newData[result.key] = result.data;
          } else {
            console.error(`Failed to load ${result.key}:`, result.error);
            newData[result.key] = result.key === 'user' ? null : [];
          }
        });

        setData(prev => ({ ...prev, ...newData }));
      } catch (error) {
        console.error('Batch data load failed:', error);
        setData(prev => ({ ...prev, loading: false, error }));
      }
    };

    load();
  }, [batchLoad, loadUser, loadTenant, loadNotifications, loadEmployees]);

  return data;
}