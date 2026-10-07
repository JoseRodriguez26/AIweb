import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { api, json, money } from "../api";
import { Button, Card, LegalReview, Message, Muted, Title, colors, input, type Notice } from "../ui";

type Payout = { id: string; cents: number; provider: string; status: string; createdAt: string };
const PROVIDERS = [
  { id: "paypal", label: "PayPal", hint: "PayPal email" },
  { id: "stripe", label: "Bank (Stripe)", hint: "Stripe account ID" },
];

// Photographer side: connect a payout account and cash out.
export function WalletScreen({ userId, balanceCents, onChange }: { userId?: string; balanceCents: number; onChange: () => void }) {
  const [provider, setProvider] = useState("paypal");
  const [account, setAccount] = useState("");
  const [connected, setConnected] = useState<{ provider: string; account: string }>();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [minCents, setMinCents] = useState(500);
  const [notice, setNotice] = useState<Notice>();

  async function load() {
    if (!userId) return;
    const acc = await api(`/users/${userId}/payout-account`);
    setConnected(acc.ok ? acc.body : undefined);
    const p = await api(`/users/${userId}/payouts`);
    if (p.ok) {
      setPayouts(p.body.payouts);
      setMinCents(p.body.minCents);
    }
  }

  useEffect(() => {
    load().catch(() => setNotice({ text: "Couldn't reach the server. Is the backend running?", ok: false }));
  }, [userId]);

  async function connect() {
    const res = await api(`/users/${userId}/payout-account`, json("PUT", { provider, account }));
    if (!res.ok) return setNotice({ text: "Enter your account to connect it.", ok: false });
    setNotice({ text: "Payout account connected.", ok: true });
    load();
  }

  async function cashOut() {
    const res = await api(`/users/${userId}/cashout`, { method: "POST" });
    if (!res.ok) {
      const text =
        res.body.error === "below_minimum"
          ? `You can cash out once you reach ${money(res.body.minCents)}.`
          : "Connect a payout account first.";
      return setNotice({ text, ok: false });
    }
    setNotice({ text: `${money(res.body.cents)} is on its way (test mode, no money is sent).`, ok: true });
    onChange();
    load();
  }

  const hint = PROVIDERS.find((p) => p.id === provider)?.hint ?? "";
  return (
    <Card>
      <Title>Your earnings</Title>
      <Text style={s.big}>{money(balanceCents)}</Text>
      <Muted>You can cash out once you reach {money(minCents)}.</Muted>
      <LegalReview>
        Paying users worldwide must go through a licensed provider (PayPal or Stripe), which checks identity and tax
        forms. Test mode for now: no money moves.
      </LegalReview>

      {connected ? (
        <Muted>
          Paid to: {connected.provider === "paypal" ? "PayPal" : "Stripe"} · {connected.account}
        </Muted>
      ) : (
        <View style={{ gap: 8 }}>
          <Muted>Connect where you want to be paid</Muted>
          <View style={s.row}>
            {PROVIDERS.map((p) => (
              <Pressable key={p.id} onPress={() => setProvider(p.id)} style={[s.chip, provider === p.id && s.chipOn]}>
                <Text style={[s.chipText, provider === p.id && s.chipTextOn]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput style={input} placeholder={hint} placeholderTextColor={colors.muted} value={account} onChangeText={setAccount} autoCapitalize="none" />
          <Button label="Connect payout account" onPress={connect} />
        </View>
      )}

      <Button kind="copper" label="Cash out" onPress={cashOut} disabled={!connected} />
      <Message notice={notice} />

      {payouts.length > 0 && (
        <View style={{ gap: 6 }}>
          <Muted>Cash-outs</Muted>
          {payouts.map((p) => (
            <View key={p.id} style={s.payout}>
              <Text style={s.payoutText}>{new Date(p.createdAt).toLocaleDateString()}</Text>
              <Text style={s.payoutText}>{p.status}</Text>
              <Text style={[s.payoutText, { fontWeight: "700" }]}>{money(p.cents)}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const s = StyleSheet.create({
  big: { fontSize: 34, fontWeight: "800", color: colors.copper },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontWeight: "600" },
  chipTextOn: { color: "#fff" },
  payout: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: 6 },
  payoutText: { color: colors.ink, fontSize: 13 },
});
