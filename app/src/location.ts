import * as Location from "expo-location";

export type Coords = { lat: number; lng: number; test?: boolean };

// Asks for location permission and returns the current position, or undefined if the user said no.
// While developing on a computer that can't find its position, falls back to a San Francisco test location.
export async function currentLocation(): Promise<Coords | undefined> {
  const perm = await Location.requestForegroundPermissionsAsync().catch(() => undefined);
  if (!perm?.granted) return undefined;
  try {
    const pos = await Location.getCurrentPositionAsync({});
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    if (__DEV__) return { lat: 37.8199, lng: -122.4783, test: true }; // Golden Gate Bridge
    return undefined;
  }
}
