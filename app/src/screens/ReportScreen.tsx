import { useState } from "react";
import { Image, Linking, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api, appendFile, type PickedFile } from "../api";
import { currentLocation } from "../location";
import { Button, Card, LegalReview, Message, Muted, Title, colors, input, type Notice } from "../ui";

// Good Samaritan mode: record an incident and keep it private to share with police.
// Never paid, never sold, never searchable.
export function ReportScreen({ userId }: { userId?: string }) {
  const [file, setFile] = useState<PickedFile & { isVideo: boolean }>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();

  async function record() {
    setNotice(undefined);
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) return setNotice({ text: "Camera permission is needed.", ok: false });
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], quality: 0.7 });
    if (result.canceled) return;
    const a = result.assets[0];
    const isVideo = a.type === "video";
    setFile({ uri: a.uri, mimeType: a.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg"), name: a.fileName ?? "incident", isVideo });
  }

  async function submit() {
    if (!file || !userId) return;
    setBusy(true);
    try {
      const loc = await currentLocation();
      const form = new FormData();
      form.append("userId", userId);
      form.append("note", note);
      if (loc) {
        form.append("lat", String(loc.lat));
        form.append("lng", String(loc.lng));
      }
      await appendFile(form, "file", file);
      const res = await api("/incidents", { method: "POST", body: form });
      if (!res.ok) return setNotice({ text: "Couldn't save the report. Please try again.", ok: false });
      setFile(undefined);
      setNote("");
      setNotice({ text: res.body.message, ok: true });
    } catch {
      setNotice({ text: "Couldn't reach the server. Is the backend running?", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={s.sos}>
        <Text style={s.sosHead}>Someone in danger? Call 911 first.</Text>
        <Text style={s.sosText}>Stay at a safe distance. Never approach a dangerous scene to record it.</Text>
        {Platform.OS !== "web" && <Button kind="danger" label="Call 911" onPress={() => Linking.openURL("tel:911")} />}
      </View>
      <Title>Report an incident</Title>
      <Muted>Your report is saved privately so you can share it with the police. It is never paid, sold or shown in search.</Muted>
      <LegalReview>
        Recording crimes raises evidence, privacy and audio-consent questions. A lawyer must approve this feature before
        launch.
      </LegalReview>
      {file && !file.isVideo && <Image source={{ uri: file.uri }} style={s.preview} />}
      {file?.isVideo && <Muted>Video ready to send.</Muted>}
      <Button kind="ghost" label={file ? "Record again" : "Record photo or video"} onPress={record} />
      <TextInput
        style={[input, { minHeight: 60 }]}
        placeholder="What happened? (optional)"
        placeholderTextColor={colors.muted}
        value={note}
        onChangeText={setNote}
        multiline
      />
      <Button label="Save report" onPress={submit} disabled={!file} busy={busy} />
      <Message notice={notice} />
    </Card>
  );
}

const s = StyleSheet.create({
  sos: { backgroundColor: "#fbe4e2", borderRadius: 12, padding: 12, gap: 6 },
  sosHead: { color: colors.bad, fontWeight: "800", fontSize: 16 },
  sosText: { color: colors.bad, fontSize: 13 },
  preview: { width: "100%", aspectRatio: 4 / 3, borderRadius: 12 },
});
