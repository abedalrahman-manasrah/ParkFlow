# Crash detection

While the driver has ParkFlow open, the phone watches for a crash. If it detects
one and the driver does not respond, it calls an emergency number.

## How it works

1. **Armed only while driving.** GPS speed arms the detector once the car has gone
   faster than 20 km/h in the last minute. Motion sensors are read only while armed,
   so a parked phone costs almost no battery.
2. **Detection** (`src/utils/crashDetector.ts`) needs all of:
   - a hard impact: at least 4 g, lasting several samples (a dropped phone is one short spike);
   - then, 3 seconds later, either the phone has **turned over** by 60° or more
     (the car rolled or flipped), or the car has **stopped** (GPS under 8 km/h).
3. **Countdown.** A full-screen red screen vibrates and counts down (15 s by default).
   - "أنا بخير — إلغاء" cancels it.
   - "اتصل الآن" calls straight away.
   - When it reaches zero, the call is placed.
4. **Call.** On Android, with the call permission, the number is dialed directly with
   no tap needed. Without the permission, and on iOS, the dialer opens with the number
   filled in.
5. **Record.** Every detection is saved on the backend (`crash_events`) with its
   location, speed, impact and outcome (`cancelled`, `called`, `call_failed`, `no_number`).

Nothing is shown to the driver until a crash is detected. They can turn it off in
**Settings → السلامة → كشف الحوادث**.

## Turning it on

Crash detection stays **off until a number is configured**. In `server/.env`:

```env
EMERGENCY_CALL_NUMBER=101
EMERGENCY_COUNTDOWN_SECONDS=15
```

Then restart the backend. The app reads the number from `GET /api/v1/emergency/config`,
so changing it needs no new app build.

## Building for Android

Crash detection uses native modules (`expo-sensors`, `expo-intent-launcher`), so it
needs a development or production build. It does not run in Expo Go or on the web.
The permissions (`CALL_PHONE`, `VIBRATE`, location) and the iOS motion description
are already in `app.json`.

```bash
npx expo run:android
```

or, with EAS:

```bash
eas build --platform android
```

## Testing

- **Without crashing a car:** in a development build, **Settings → السلامة** has a
  "محاكاة حادث (للتطوير)" button that opens the countdown. With no number configured,
  letting it run out records `no_number` and calls nobody.
- **Detection logic:** `CrashDetector` is plain TypeScript with no device dependencies,
  so it can be fed synthetic samples. When it was written it was checked against seven
  cases: rollover, side flip, frontal crash then stop (all detected), and dropped
  phone while parked, phone hitting the floor while driving, pothole, hard braking
  (none detected).
- **Real-world tuning:** the thresholds live in `CRASH_THRESHOLDS`. Check them on real
  drives before relying on the feature, and expect to adjust `impactG` and `rolloverDeg`
  for how phones are usually mounted.

## Limits

- Works while ParkFlow is open, including in the foreground during navigation.
  Detection with the app closed would need an Android foreground service. That is
  not built yet.
- iOS cannot place a call without the user tapping, so on iPhone the dialer opens
  with the number ready.
- The detector is a heuristic. It will miss some crashes and, rarely, flag a hard
  knock. The countdown exists so a false alarm can be cancelled before anyone is called.
