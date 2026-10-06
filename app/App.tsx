import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

type Photo = { uri: string; mimeType: string };

export default function App() {
  const [userId, setUserId] = useState<string>();
  const [photo, setPhoto] = useState<Photo>();
  const [description, setDescription] = useState("");
  const [balanceCents, setBalanceCents] = useState(0);
  const [busy, setBusy] = useState(false);

  // First version: an anonymous account per install. Real sign-in comes later.
  useEffect(() => {
    fetch(`${API_URL}/users`, { method: "POST" })
      .then((r) => r.json())
      .then((u: { id: string }) => setUserId(u.id))
      .catch(() => Alert.alert("Can't reach the server", `Check that the backend is running at ${API_URL}`));
  }, []);

  async function takePhoto() {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) return Alert.alert("Camera permission is needed to take photos.");
    // Camera only, no gallery: photos must be taken fresh, which cuts down on reposted or fake images.
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setPhoto({ uri: asset.uri, mimeType: asset.mimeType ?? "image/jpeg" });
  }

  async function upload() {
    if (!photo || !userId) return;
    const loc = await Location.requestForegroundPermissionsAsync();
    if (!loc.granted) return Alert.alert("Location is required so your photo can be found on the map.");
    setBusy(true);
    try {
      const pos = await Location.getCurrentPositionAsync({});
      const form = new FormData();
      form.append("userId", userId);
      form.append("description", description);
      form.append("lat", String(pos.coords.latitude));
      form.append("lng", String(pos.coords.longitude));
      form.append("locationConsent", "true");
      form.append("termsAccepted", "true");
      // React Native's FormData accepts this file shape.
      form.append("photo", { uri: photo.uri, name: "photo.jpg", type: photo.mimeType } as unknown as Blob);

      const res = await fetch(`${API_URL}/photos`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) return Alert.alert("Not accepted", messageFor(body.error));

      const bal = await fetch(`${API_URL}/users/${userId}/balance`).then((r) => r.json());
      setBalanceCents(bal.balanceCents);
      setPhoto(undefined);
      setDescription("");
      Alert.alert("Accepted!", `You earned ${body.earnedCents}¢`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.title}>AIweb</Text>
      <Text style={styles.balance}>Balance: ${(balanceCents / 100).toFixed(2)}</Text>

      {photo ? (
        <Image source={{ uri: photo.uri }} style={styles.preview} />
      ) : (
        <View style={[styles.preview, styles.placeholder]}>
          <Text style={styles.muted}>No photo yet</Text>
        </View>
      )}

      <Pressable style={styles.button} onPress={takePhoto}>
        <Text style={styles.buttonText}>{photo ? "Retake photo" : "Take photo"}</Text>
      </Pressable>

      <TextInput
        style={styles.input}
        placeholder="Describe what's in the photo"
        value={description}
        onChangeText={setDescription}
        multiline
      />

      <Text style={styles.terms}>
        By uploading you agree to the AIweb terms: you sell this photo to AIweb for 1¢, and AIweb may use it and
        sell licenses for it.
      </Text>

      <Pressable
        style={[styles.button, (!photo || busy) && styles.disabled]}
        onPress={upload}
        disabled={!photo || busy}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Upload and earn 1¢</Text>}
      </Pressable>
    </SafeAreaView>
  );
}

function messageFor(error: string) {
  switch (error) {
    case "duplicate_photo":
      return "This photo was already uploaded.";
    case "description_too_short":
      return "Add a short description of what's in the photo.";
    case "location_consent_required":
    case "invalid_location":
      return "We couldn't get a valid location for this photo.";
    default:
      return "Something went wrong. Please try again.";
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 16, gap: 12, backgroundColor: "#fff" },
  title: { fontSize: 28, fontWeight: "700", marginTop: 16 },
  balance: { fontSize: 16, color: "#333" },
  preview: { width: "100%", aspectRatio: 3 / 4, borderRadius: 12 },
  placeholder: { backgroundColor: "#eee", alignItems: "center", justifyContent: "center" },
  muted: { color: "#888" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, minHeight: 60 },
  button: { backgroundColor: "#111", padding: 14, borderRadius: 8, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600" },
  disabled: { opacity: 0.4 },
  terms: { color: "#666", fontSize: 12 },
});
