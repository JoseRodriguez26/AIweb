import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { API_URL, api, json } from "./api";

export const neon = "#39ff14";

type Item = { id: string; description: string; lat: number; lng: number; createdAt: string } & (
  | { kind: "photo"; imageUrl: string }
  | { kind: "video"; videoUrl: string; durationSec: number }
);

const REFRESH_MS = 5000;

// Live feed of the newest photos and videos. /search with no query returns the latest photos first.
export function Timeline({ side, userId }: { side: boolean; userId?: string }) {
  const [open, setOpen] = useState(true);
  const [photos, setPhotos] = useState<Item[]>([]);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const [pics, vids] = await Promise.all([
        api<{ results: Item[] }>("/search").catch(() => undefined),
        api<{ results: Item[] }>("/videos").catch(() => undefined),
      ]);
      if (!alive || (!pics?.ok && !vids?.ok)) return;
      const list = [
        ...(pics?.ok ? pics.body.results.map((p) => ({ ...p, kind: "photo" as const })) : []),
        ...(vids?.ok ? vids.body.results.map((v) => ({ ...v, kind: "video" as const })) : []),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) as Item[];
      // Highlight photos that arrived since the last refresh (not on first load).
      if (seen.current) setFresh(new Set(list.filter((p) => !seen.current!.has(p.id)).map((p) => p.id)));
      seen.current = new Set(list.map((p) => p.id));
      setPhotos(list);
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  async function report(id: string) {
    if (!userId) return;
    setReported((r) => new Set(r).add(id));
    await api(`/videos/${id}/flag`, json("POST", { userId })).catch(() => undefined);
  }

  return (
    <View style={[s.panel, side && s.side]}>
      <Pressable onPress={() => setOpen(!open)} style={s.head}>
        <Blink style={s.liveDot} />
        <Text style={s.headText}>Timeline</Text>
        <Text style={s.count}>{photos.length}</Text>
        <Text style={s.chevron}>{open ? "▾" : "▸"}</Text>
      </Pressable>

      {open && (
        <ScrollView style={side ? s.listSide : s.listInline} contentContainerStyle={s.list}>
          {photos.length === 0 && <Text style={s.empty}>Nothing yet. Post a photo or video in the Earn tab.</Text>}
          {photos.map((p) => (
            <View key={p.id} style={[s.item, fresh.has(p.id) && s.itemFresh]}>
              <View>
                {p.kind === "photo" ? (
                  <Image source={{ uri: `${API_URL}${p.imageUrl}` }} style={s.photo} />
                ) : (
                  <LoopVideo uri={`${API_URL}${p.videoUrl}`} />
                )}
                {p.kind === "video" && <Text style={s.badge}>▶ {Math.round(p.durationSec)}s</Text>}
                <View style={s.pinWrap}>
                  <Blink style={s.pinRing} />
                  <View style={s.pinDot} />
                </View>
              </View>
              <Text style={s.desc} numberOfLines={2}>{p.description}</Text>
              <View style={s.meta}>
                <Blink style={s.metaDot} />
                <Text style={s.coords}>{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</Text>
                <Text style={s.time}>{timeAgo(p.createdAt)}</Text>
              </View>
              {p.kind === "video" && userId && (
                <Pressable onPress={() => report(p.id)} disabled={reported.has(p.id)}>
                  <Text style={s.report}>{reported.has(p.id) ? "Reported. Thanks." : "Report spam or abuse"}</Text>
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// Muted, looping, like a short-video feed.
function LoopVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={s.photo} contentFit="cover" nativeControls={false} />;
}

function Blink({ style }: { style: object }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 0.15, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(v, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== "web" }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={[style, { opacity: v }]} />;
}

function timeAgo(iso: string) {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`;
  return `${Math.round(sec / 86400)}d ago`;
}

const glow = Platform.OS === "web" ? ({ boxShadow: `0 0 8px ${neon}, 0 0 16px ${neon}` } as object) : { shadowColor: neon, shadowOpacity: 1, shadowRadius: 8 };

const s = StyleSheet.create({
  panel: { backgroundColor: "#0b0f0c", borderRadius: 14, borderWidth: 1, borderColor: "#1d3a1a", overflow: "hidden" },
  side: { position: "absolute", top: 16, left: 16, bottom: 16, width: 300, zIndex: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#1d3a1a" },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: neon, ...glow },
  headText: { color: neon, fontWeight: "800", fontSize: 16, letterSpacing: 0.5, flex: 1 },
  count: { color: "#0b0f0c", backgroundColor: neon, fontWeight: "800", fontSize: 12, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden" },
  chevron: { color: neon, fontSize: 16, width: 16, textAlign: "center" },
  listSide: { flex: 1 },
  listInline: { maxHeight: 420 },
  list: { padding: 12, gap: 12 },
  empty: { color: "#7fae78", textAlign: "center", paddingVertical: 20 },
  item: { borderRadius: 10, borderWidth: 1, borderColor: "#1d3a1a", padding: 8, gap: 6, backgroundColor: "#101712" },
  itemFresh: { borderColor: neon, ...glow },
  photo: { width: "100%", aspectRatio: 4 / 3, borderRadius: 8, backgroundColor: "#16201a" },
  pinWrap: { position: "absolute", top: 10, right: 10, width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  pinRing: { position: "absolute", width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: neon, ...glow },
  pinDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: neon },
  desc: { color: "#e6f5e3", fontWeight: "600", fontSize: 13 },
  meta: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: neon, ...glow },
  coords: { color: neon, fontSize: 12, fontFamily: Platform.OS === "web" ? "monospace" : undefined, flex: 1 },
  time: { color: "#7fae78", fontSize: 11 },
  badge: { position: "absolute", left: 8, bottom: 8, color: "#0b0f0c", backgroundColor: neon, fontWeight: "800", fontSize: 11, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: "hidden" },
  report: { color: "#7fae78", fontSize: 11, textDecorationLine: "underline" },
});
