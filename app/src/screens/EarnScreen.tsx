import { useState } from "react";
import { Image, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api, appendFile, type PickedFile } from "../api";
import { currentLocation } from "../location";
import { Button, Card, LegalReview, Message, Muted, Title, colors, input, type Notice } from "../ui";

type Props = { userId?: string; glassesEnabled: boolean; onEarned: () => void };

export function EarnScreen({ userId, glassesEnabled, onEarned }: Props) {
  const [photo, setPhoto] = useState<PickedFile>();
  const [description, setDescription] = useState("");
  const [fromGlasses, setFromGlasses] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  async function takePhoto() {
    setNotice(undefined);
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) return setNotice({ text: "Camera permission is needed to take photos.", ok: false });
    // Camera only, no gallery: fresh photos cut down on reposted or fake images.
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.7 });
    if (result.canceled) return;
    const a = result.assets[0];
    setPhoto({ uri: a.uri, mimeType: a.mimeType ?? "image/jpeg", name: a.fileName ?? "photo.jpg" });
  }

  async function upload() {
    if (!photo || !userId) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const loc = await currentLocation();
      if (!loc) return setNotice({ text: "Location is required so your photo can be found on the map.", ok: false });

      const form = new FormData();
      form.append("userId", userId);
      form.append("description", description);
      form.append("lat", String(loc.lat));
      form.append("lng", String(loc.lng));
      form.append("locationConsent", "true");
      form.append("termsAccepted", "true");
      form.append("source", fromGlasses ? "glasses" : "phone");
      await appendFile(form, "photo", photo);

      const res = await api("/photos", { method: "POST", body: form });
      if (!res.ok) return setNotice({ text: messageFor(res.body.error), ok: false });
      setPhoto(undefined);
      setDescription("");
      setNotice({ text: `Accepted! You earned ${res.body.earnedCents}¢${loc.test ? " (test location used)" : ""}.`, ok: true });
      onEarned();
    } catch {
      setNotice({ text: "Couldn't reach the server. Is the backend running?", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Title>Take a photo, earn 1¢</Title>
      {photo ? (
        <Image source={{ uri: photo.uri }} style={s.preview} />
      ) : (
        <View style={[s.preview, s.placeholder]}>
          <Muted>No photo yet</Muted>
        </View>
      )}
      <Button kind="ghost" label={photo ? "Retake photo" : "Take photo"} onPress={takePhoto} />
      <TextInput
        style={[input, { minHeight: 60 }]}
        placeholder="Describe what's in the photo"
        placeholderTextColor={colors.muted}
        value={description}
        onChangeText={setDescription}
        multiline
      />

      {glassesEnabled && (
        <View style={{ gap: 8 }}>
          <View style={s.row}>
            <Text style={s.rowText}>Taken with smart glasses (say "QuickEye, snap")</Text>
            <Switch value={fromGlasses} onValueChange={setFromGlasses} />
          </View>
          {fromGlasses && (
            <LegalReview>
              Glasses capture is a test switch for now. Connecting real glasses (Ray-Ban Meta toolkit) comes next, and
              photographing people with glasses needs legal sign-off.
            </LegalReview>
          )}
        </View>
      )}

      <Text style={s.terms}>
        By uploading you agree to the AIweb terms: you sell this photo to AIweb for 1¢, and AIweb may use it and sell
        licenses for it.
      </Text>
      <LegalReview>The terms (copyright transfer or license) must be written by a lawyer before launch.</LegalReview>
      <Button kind="copper" label="Upload and earn 1¢" onPress={upload} disabled={!photo} busy={busy} />
      <Message notice={notice} />
    </Card>
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
    case "feature_disabled":
      return "Glasses capture is switched off.";
    default:
      return "Something went wrong. Please try again.";
  }
}

const s = StyleSheet.create({
  preview: { width: "100%", aspectRatio: 4 / 3, borderRadius: 12 },
  placeholder: { backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { flex: 1, color: colors.ink },
  terms: { color: colors.muted, fontSize: 12 },
});
