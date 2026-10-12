import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { services } from '@/services';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useCrashAlertStore } from '@/store/crashAlertStore';
import { CrashDetector } from '@/utils/crashDetector';
import type { GeoPoint } from '@/types';

const MOTION_INTERVAL_MS = 20;
const G = 9.80665;

export function useEmergencyConfig() {
  const signedIn = useAuthStore((s) => Boolean(s.session));
  return useQuery({
    queryKey: ['emergency', 'config'],
    queryFn: () => services.emergency.config(),
    // Crash detection never runs on the web, so there is nothing to configure there.
    enabled: signedIn && Platform.OS !== 'web',
    staleTime: 10 * 60_000,
  });
}

/**
 * Runs silently while the app is open on a phone: GPS speed arms the detector
 * once the car is moving, and motion samples are only read while armed, so a
 * parked phone costs almost nothing. A detection raises the countdown alert.
 *
 * Nothing runs on the web, when the driver turned it off, or until the server
 * has an emergency number configured.
 */
export function useCrashDetection() {
  const enabledByUser = usePreferencesStore((s) => s.crashDetection);
  const { data: config } = useEmergencyConfig();
  const active = Platform.OS !== 'web' && enabledByUser && Boolean(config?.enabled);
  const lastLocation = useRef<GeoPoint | undefined>(undefined);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const detector = new CrashDetector();
    let locationSub: Location.LocationSubscription | undefined;
    let motionSub: { remove: () => void } | undefined;
    let armedCheck: ReturnType<typeof setInterval> | undefined;

    const startMotion = async () => {
      if (motionSub) return;
      const { DeviceMotion } = await import('expo-sensors');
      if (cancelled || !(await DeviceMotion.isAvailableAsync())) return;
      DeviceMotion.setUpdateInterval(MOTION_INTERVAL_MS);
      motionSub = DeviceMotion.addListener(({ accelerationIncludingGravity: a }) => {
        if (!a) return;
        const detection = detector.push({ t: Date.now(), x: a.x / G, y: a.y / G, z: a.z / G });
        if (detection) {
          useCrashAlertStore.getState().raise({
            detection,
            detectedAt: new Date(detection.impactAt).toISOString(),
            location: lastLocation.current,
          });
        }
      });
    };
    const stopMotion = () => {
      motionSub?.remove();
      motionSub = undefined;
    };

    const start = async () => {
      // Location permission is asked for by the map; crash detection never prompts on its own.
      const permission = await Location.getForegroundPermissionsAsync();
      if (cancelled || permission.status !== 'granted') return;
      locationSub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 0 },
        (position) => {
          const { latitude, longitude, speed } = position.coords;
          lastLocation.current = { latitude, longitude };
          detector.pushSpeed(Date.now(), Math.max(0, speed ?? 0) * 3.6);
        },
      );
      if (cancelled) locationSub.remove();
      // Read the motion sensors only while the car has recently been moving.
      armedCheck = setInterval(() => {
        if (detector.isArmed(Date.now())) void startMotion();
        else stopMotion();
      }, 2000);
    };

    void start().catch(() => undefined);
    const appState = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopMotion();
    });

    return () => {
      cancelled = true;
      appState.remove();
      if (armedCheck) clearInterval(armedCheck);
      locationSub?.remove();
      stopMotion();
    };
  }, [active]);
}
