# Activity sync: integration plan

The prototype's **Connect** buttons import sample Seattle workouts (`js/sync.js`) so the whole flow can be demoed. This document is the plan for real sync. Every source maps into the same input the engine already accepts:

```js
{ type, minutes, distanceKm, elevM, steps, intensity, date, place, externalId, source }
```

`externalId` makes imports idempotent: re-syncing never duplicates an activity. Synced activities are marked `verified` and earn ×1.1 essence.

| Source | Platform | How | Notes |
|---|---|---|---|
| **Strava** | Web, iOS, Android | OAuth 2.0 (`activity:read`) → `GET /athlete/activities` + webhook subscription for new uploads | Needs a backend to store refresh tokens and receive webhooks. Strava's API terms restrict showing a user's data to other users, so clan views use derived totals, not raw activities. |
| **Apple Health** | iOS app only | HealthKit: `HKWorkout` (type, duration, distance, elevation ascended) + `HKQuantityTypeIdentifierStepCount` | No web API. Requires the native app (React Native or Expo with a HealthKit module). Read-only permission prompt per data type. |
| **Health Connect** | Android app | `ExerciseSessionRecord`, `StepsRecord`, `DistanceRecord`, `ElevationGainedRecord` | Replaces Google Fit, whose APIs are deprecated. |
| **Garmin** | Web, iOS, Android | Garmin Connect Developer Program (Health / Activity API) with push notifications | Requires approval as a Garmin partner. |

## Activity type mapping (examples)
| Wildbound | Strava `sport_type` | HealthKit `HKWorkoutActivityType` |
|---|---|---|
| walk | Walk | walking |
| hike | Hike | hiking |
| run | Run, TrailRun | running |
| cycle | Ride, GravelRide, EBikeRide (×0.5) | cycling |
| swim | Swim | swimming |
| paddle | Kayaking, Rowing, StandUpPaddling | paddleSports, rowing |
| strength | WeightTraining | traditionalStrengthTraining, functionalStrengthTraining |
| hiit | HighIntensityIntervalTraining, Crossfit | highIntensityIntervalTraining |
| yoga | Yoga, Pilates | yoga, pilates, flexibility |
| climb | RockClimbing | climbing |
| sport | Soccer, Tennis, Basketball… | soccer, tennis, basketball… |
| dance | — | socialDance, cardioDance |

## Effort
- If heart-rate data exists, derive intensity from time in zones (Z1–2 easy, Z3 moderate, Z4–5 hard).
- Otherwise, use the source's perceived exertion if present, and fall back to "moderate".

## Anti-cheat
- Server-side scoring only.
- Plausibility checks on speed per activity type, so a "walk" at 25 km/h is reclassified or rejected.
- Daily caps on manual minutes. Synced activities are weighted above manual ones.

## Check-ins (GPS)
The native app uses foreground location to confirm the user is within ~150 m of a place, and only after an activity that day. Precise location is never shared with the clan.
