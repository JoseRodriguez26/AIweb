import { useEffect, useState } from "react";
import { Image, Linking, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { API_URL, api, json, money } from "../api";
import { currentLocation } from "../location";
import { Button, Card, LegalReview, Message, Muted, Title, colors, input, type Notice } from "../ui";

type Listing = { id: string; description: string; priceCents: number; previewUrl: string; distanceKm?: number };

// Buyer side: businesses search photos by place and buy a license.
export function MarketScreen() {
  const [buyerId, setBuyerId] = useState<string>();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [q, setQ] = useState("");
  const [nearMe, setNearMe] = useState(false);
  const [results, setResults] = useState<Listing[]>([]);
  const [notice, setNotice] = useState<Notice>();
  const [lastDownload, setLastDownload] = useState<string>();

  async function search() {
    const params = new URLSearchParams({ q });
    if (nearMe) {
      const loc = await currentLocation();
      if (loc) {
        params.set("lat", String(loc.lat));
        params.set("lng", String(loc.lng));
        params.set("radiusKm", "5");
      }
    }
    const res = await api<{ results: Listing[] }>(`/marketplace?${params}`).catch(() => undefined);
    if (!res) return setNotice({ text: "Couldn't reach the server. Is the backend running?", ok: false });
    setResults(res.body.results ?? []);
  }

  useEffect(() => {
    search();
  }, []);

  async function signUp() {
    const res = await api("/buyers", json("POST", { name, email }));
    if (!res.ok) return setNotice({ text: "Enter a name and a valid email.", ok: false });
    setBuyerId(res.body.id);
    setNotice({ text: `Buyer account created for ${name}.`, ok: true });
  }

  async function buy(photoId: string) {
    if (!buyerId) return setNotice({ text: "Create a buyer account first.", ok: false });
    const res = await api("/licenses", json("POST", { buyerId, photoId }));
    if (!res.ok) return setNotice({ text: "Purchase failed.", ok: false });
    setLastDownload(`${API_URL}${res.body.downloadUrl}`);
    setNotice({
      text: `License bought for ${money(res.body.priceCents)} (test mode, no charge). License ID ${res.body.licenseId} is hidden in the file.`,
      ok: true,
    });
  }

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <Title>Buy fresh photos of a place</Title>
        <LegalReview>
          Selling photo licenses needs lawyer-approved license terms, and photos of recognizable people need their
          permission.
        </LegalReview>
        {!buyerId ? (
          <View style={{ gap: 8 }}>
            <Muted>Buyer account</Muted>
            <TextInput style={input} placeholder="Business name" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
            <TextInput
              style={input}
              placeholder="Email"
              placeholderTextColor={colors.muted}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Button label="Create buyer account" onPress={signUp} />
          </View>
        ) : (
          <Muted>Signed in as buyer: {name}</Muted>
        )}
        <TextInput style={input} placeholder="Search, e.g. golden gate" placeholderTextColor={colors.muted} value={q} onChangeText={setQ} onSubmitEditing={search} />
        <View style={s.row}>
          <Text style={s.rowText}>Only within 5 km of me</Text>
          <Switch value={nearMe} onValueChange={setNearMe} />
        </View>
        <Button kind="ghost" label="Search" onPress={search} />
        <Message notice={notice} />
        {lastDownload && <Button kind="copper" label="Download licensed photo" onPress={() => Linking.openURL(lastDownload)} />}
      </Card>

      {results.length === 0 ? (
        <Card>
          <Muted>No photos for sale yet. Upload one in the Earn tab, then search again.</Muted>
        </Card>
      ) : (
        <View style={s.grid}>
          {results.map((r) => (
            <View key={r.id} style={s.item}>
              <Image source={{ uri: `${API_URL}${r.previewUrl}` }} style={s.thumb} />
              <Text style={s.desc} numberOfLines={2}>
                {r.description}
              </Text>
              {r.distanceKm !== undefined && <Muted>{r.distanceKm.toFixed(1)} km away</Muted>}
              <Button label={`Buy · ${money(r.priceCents)}`} onPress={() => buy(r.id)} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowText: { flex: 1, color: colors.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  item: { width: "47%", flexGrow: 1, backgroundColor: colors.card, borderRadius: 12, padding: 8, gap: 6, borderWidth: 1, borderColor: colors.line },
  thumb: { width: "100%", aspectRatio: 4 / 3, borderRadius: 8, backgroundColor: colors.bg },
  desc: { fontSize: 13, color: colors.ink },
});
