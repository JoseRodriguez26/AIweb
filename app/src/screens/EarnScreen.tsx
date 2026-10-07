import { useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import * as ImagePicker from "expo-image-picker";
import { api, appendFile, type PickedFile } from "../api";
import { currentLocation } from "../location";
import { Button, Card, LegalReview, Message, Muted, Title, colors, input, type Notice } from "../ui";

type Props = { userId?: string; glassesEnabled: boolean; onEarned: () => void };

// Must match MAX_VIDEO_SECONDS in backend/src/videos.ts.
const MAX_VIDEO_SECONDS = 60;

export function EarnScreen({ userId, glassesEnabled, onEarned }: Props) {
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [photo, setPhoto] = useState<PickedFile>();
  const [video, setVideo] = useState<PickedFile>();
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

  async function recordVideo() {
    setNotice(undefined);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["videos"], videoMaxDuration: MAX_VIDEO_SECONDS, quality: 0.7 };
    // Browsers can't record through the picker, so on the web a video file is chosen instead.
    let result: ImagePicker.ImagePickerResult;
    if (Platform.OS === "web") {
      result = await ImagePicker.launchImageLibraryAsync(options);
    } else {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) return setNotice({ text: "Camera permission is needed to record videos.", ok: false });
      result = await ImagePicker.launchCameraAsync(options);
    }
    if (result.canceled) return;
    const a = result.assets[0];
    if (a.duration && a.duration / 1000 > MAX_VIDEO_SECONDS + 0.5) {
      return setNotice({ text: `Videos can be up to ${MAX_VIDEO_SECONDS} seconds.`, ok: false });
    }
    setVideo({ uri: a.uri, mimeType: a.mimeType ?? "video/mp4", name: a.fileName ?? "video.mp4" });
  }

  async function upload() {
    const file = mode === "photo" ? photo : video;
    if (!file || !userId) return;
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
      if (mode === "photo") form.append("source", fromGlasses ? "glasses" : "phone");
      await appendFile(form, mode, file);

      const res = await api(mode === "photo" ? "/photos" : "/videos", { method: "POST", body: form });
      if (!res.ok) return setNotice({ text: messageFor(res.body.error), ok: false });
      if (mode === "photo") setPhoto(undefined);
      else setVideo(undefined);
      setDescription("");
      const earned = res.body.earnedCents > 0 ? `You earned ${res.body.earnedCents}¢` : "Posted (daily paid limit reached, so no pay for this one)";
      setNotice({ text: `Accepted! ${earned}${loc.test ? " (test location used)" : ""}.`, ok: true });
      onEarned();
    } catch {
      setNotice({ text: "Couldn't reach the server. Is the backend running?", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <View style={s.switcher}>
        {(["photo", "video"] as const).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[s.switchBtn, mode === m && s.switchOn]}>
            <Text style={[s.switchText, mode === m && s.switchTextOn]}>{m === "photo" ? "Photo" : "Short video"}</Text>
          </Pressable>
        ))}
      </View>

      {mode === "photo" ? (
        <>
          <Title>Take a photo, earn 1¢</Title>
          {photo ? (
            <Image source={{ uri: photo.uri }} style={s.preview} />
          ) : (
            <View style={[s.preview, s.placeholder]}>
              <Muted>No photo yet</Muted>
            </View>
          )}
          <Button kind="ghost" label={photo ? "Retake photo" : "Take photo"} onPress={takePhoto} />
        </>
      ) : (
        <>
          <Title>Post a short video, earn 1¢</Title>
          {video ? (
            <VideoPreview uri={video.uri} />
          ) : (
            <View style={[s.preview, s.placeholder]}>
              <Muted>Up to {MAX_VIDEO_SECONDS} seconds, any topic</Muted>
            </View>
          )}
          <Button kind="ghost" label={video ? "Pick a different video" : Platform.OS === "web" ? "Choose video" : "Record video"} onPress={recordVideo} />
        </>
      )}
      <TextInput
        style={[input, { minHeight: 60 }]}
        placeholder={`Describe what's in the ${mode}`}
        placeholderTextColor={colors.muted}
        value={description}
        onChangeText={setDescription}
        multiline
      />

      {glassesEnabled && mode === "photo" && (
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
        By uploading you agree to the AIweb terms: you sell this {mode} to AIweb for 1¢, and AIweb may use it and sell
        licenses for it. No spam, links or content you don't have the right to post.
      </Text>
      <LegalReview>The terms (copyright transfer or license) must be written by a lawyer before launch.</LegalReview>
      <Button kind="copper" label="Upload and earn 1¢" onPress={upload} disabled={mode === "photo" ? !photo : !video} busy={busy} />
      <Message notice={notice} />
    </Card>
  );
}

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={s.preview} contentFit="cover" nativeControls={false} />;
}

function messageFor(error: string) {
  switch (error) {
    case "duplicate_video":
      return "This video was already uploaded.";
    case "not_a_video":
      return "That file isn't a supported video (MP4, MOV or WebM).";
    case "video_too_long":
      return "Videos can be up to 60 seconds.";
    case "video_too_large":
      return "That video is too big (50 MB max).";
    case "no_links":
      return "Links aren't allowed in descriptions.";
    case "description_too_long":
      return "Keep the description under 500 characters.";
    case "too_many_uploads":
      return "You're posting too fast. Try again in a bit.";
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
  switcher: { flexDirection: "row", backgroundColor: colors.bg, borderRadius: 10, padding: 3, gap: 3 },
  switchBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center" },
  switchOn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  switchText: { color: colors.muted, fontWeight: "600", fontSize: 13 },
  switchTextOn: { color: colors.ink },
});
