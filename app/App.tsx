import { useCallback, useEffect, useState } from "react";
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, getUserId, money, type Features } from "./src/api";
import { colors } from "./src/ui";
import { EarnScreen } from "./src/screens/EarnScreen";
import { MarketScreen } from "./src/screens/MarketScreen";
import { WalletScreen } from "./src/screens/WalletScreen";
import { ReportScreen } from "./src/screens/ReportScreen";

type Tab = "earn" | "wallet" | "market" | "report";

export default function App() {
  const [userId, setUserId] = useState<string>();
  const [balanceCents, setBalanceCents] = useState(0);
  const [features, setFeatures] = useState<Features>();
  const [tab, setTab] = useState<Tab>("earn");
  const [offline, setOffline] = useState(false);

  const refreshBalance = useCallback(async () => {
    if (!userId) return;
    const res = await api(`/users/${userId}/balance`).catch(() => undefined);
    if (res?.ok) setBalanceCents(res.body.balanceCents);
  }, [userId]);

  useEffect(() => {
    Promise.all([getUserId(), api<Features>("/features")])
      .then(([id, f]) => {
        setUserId(id);
        setFeatures(f.body);
      })
      .catch(() => setOffline(true));
  }, []);

  useEffect(() => {
    refreshBalance();
  }, [refreshBalance]);

  // Feature switches come from the backend (backend/src/features.ts).
  const tabs: { id: Tab; label: string; on: boolean }[] = [
    { id: "earn", label: "Earn", on: true },
    { id: "wallet", label: "Wallet", on: !!features?.payouts },
    { id: "market", label: "Buy photos", on: !!features?.marketplace },
    { id: "report", label: "Report", on: !!features?.incidentReports },
  ];

  return (
    <SafeAreaView style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.header}>
          <Text style={s.logo}>
            AI<Text style={{ color: colors.copper }}>web</Text>
          </Text>
          <Text style={s.balance}>{money(balanceCents)}</Text>
        </View>

        {offline && (
          <Text style={s.offline}>
            Can't reach the backend. Start it with "npm run dev" in the project folder, then reload.
          </Text>
        )}

        <View style={s.tabs}>
          {tabs
            .filter((t) => t.on)
            .map((t) => (
              <Pressable key={t.id} onPress={() => setTab(t.id)} style={[s.tab, tab === t.id && s.tabOn]}>
                <Text style={[s.tabText, tab === t.id && s.tabTextOn]}>{t.label}</Text>
              </Pressable>
            ))}
        </View>

        {tab === "earn" && <EarnScreen userId={userId} glassesEnabled={!!features?.glassesCapture} onEarned={refreshBalance} />}
        {tab === "wallet" && <WalletScreen userId={userId} balanceCents={balanceCents} onChange={refreshBalance} />}
        {tab === "market" && <MarketScreen />}
        {tab === "report" && <ReportScreen userId={userId} />}

        <Text style={s.footer}>Made in San Francisco, for the world.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 16, width: "100%", maxWidth: 480, alignSelf: "center" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  logo: { fontSize: 30, fontWeight: "800", color: colors.ink, letterSpacing: -0.5 },
  balance: { backgroundColor: colors.copperSoft, color: colors.copper, fontWeight: "700", paddingVertical: 4, paddingHorizontal: 12, borderRadius: 999, overflow: "hidden" },
  offline: { backgroundColor: "#fbe4e2", color: colors.bad, padding: 10, borderRadius: 10 },
  tabs: { flexDirection: "row", backgroundColor: colors.card, borderRadius: 12, padding: 4, gap: 4, borderWidth: 1, borderColor: colors.line },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  tabOn: { backgroundColor: colors.ink },
  tabText: { color: colors.muted, fontWeight: "600", fontSize: 13 },
  tabTextOn: { color: "#fff" },
  footer: { textAlign: "center", color: colors.muted, fontSize: 12, marginTop: 8, marginBottom: 24 },
});
