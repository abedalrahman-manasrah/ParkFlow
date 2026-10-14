import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { useAuthStore } from '@parkflow/client/store/authStore';
import { API_BASE_URL, refreshSession } from '@parkflow/client/services/http/apiClient';

export function useManagementSync() {
  const client = useQueryClient();
  const session = useAuthStore(state => state.session);
  const role = useAuthStore(state => state.user?.role);
  const permitted = role === 'ADMIN' || role === 'PARKING_OPERATOR';

  useEffect(() => { client.clear(); }, [session?.userId, client]);
  useEffect(() => {
    if (!session || !permitted || !API_BASE_URL) return;
    const socket = io(API_BASE_URL.replace(/\/api\/v1$/, ''), {
      auth: { token: session.accessToken }, transports: ['websocket'], reconnection: true,
    });
    const refreshData = () => {
      for (const key of ['admin', 'operator', 'management', 'vehicle-verification']) {
        void client.invalidateQueries({ queryKey: [key] });
      }
    };
    socket.on('connect', refreshData);
    for (const event of ['parking.availability.updated', 'parking.zone.updated', 'parking.session.updated', 'notification.created']) {
      socket.on(event, refreshData);
    }
    const refreshIfNeeded = () => {
      if (Date.parse(session.expiresAt) <= Date.now() + 30000) void refreshSession().catch(() => undefined);
    };
    socket.on('connect_error', refreshIfNeeded);
    const timer = setTimeout(() => { void refreshSession().catch(() => undefined); }, Math.max(1000, Date.parse(session.expiresAt) - Date.now() - 30000));
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return;
      refreshData(); refreshIfNeeded();
      if (!socket.connected) socket.connect();
    });
    return () => { clearTimeout(timer); subscription.remove(); socket.disconnect(); };
  }, [session?.accessToken, permitted, client]);
}
