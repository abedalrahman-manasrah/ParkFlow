import { create } from 'zustand';
import type { AppNotification } from '@/types';

interface InAppNotificationState {
  /** The notification currently shown as an on-screen banner. */
  current?: AppNotification;
  show: (notification: AppNotification) => void;
  dismiss: () => void;
}

/** Holds the latest live notification so the banner can pop over any screen. */
export const useInAppNotificationStore = create<InAppNotificationState>((set) => ({
  current: undefined,
  show: (notification) => set({ current: notification }),
  dismiss: () => set({ current: undefined }),
}));
