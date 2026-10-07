import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

export const colors = {
  bg: "#eef0f2",
  card: "#ffffff",
  ink: "#15191e",
  muted: "#5d6670",
  line: "#d9dde2",
  copper: "#b4622a",
  copperSoft: "#f6e7dc",
  good: "#1f7a4d",
  bad: "#b3261e",
  warnBg: "#fff4d6",
  warnInk: "#7a5200",
};

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={s.title}>{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={s.muted}>{children}</Text>;
}

export function Button(props: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; kind?: "dark" | "copper" | "ghost" | "danger" }) {
  const kind = props.kind ?? "dark";
  return (
    <Pressable
      onPress={props.onPress}
      disabled={props.disabled || props.busy}
      style={[s.btn, s[kind], (props.disabled || props.busy) && s.disabled]}
    >
      {props.busy ? (
        <ActivityIndicator color={kind === "ghost" ? colors.ink : "#fff"} />
      ) : (
        <Text style={[s.btnText, kind === "ghost" && { color: colors.ink }]}>{props.label}</Text>
      )}
    </Pressable>
  );
}

export type Notice = { text: string; ok: boolean } | undefined;

export function Message({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <Text style={[s.msg, notice.ok ? s.msgOk : s.msgBad]}>{notice.text}</Text>;
}

// Yellow banner on every feature a lawyer still needs to approve.
export function LegalReview({ children }: { children: ReactNode }) {
  return (
    <View style={s.legal}>
      <Text style={s.legalHead}>⚠️ Needs legal review</Text>
      <Text style={s.legalText}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 12 },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  muted: { fontSize: 13, color: colors.muted },
  btn: { borderRadius: 10, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center" },
  dark: { backgroundColor: colors.ink },
  copper: { backgroundColor: colors.copper },
  danger: { backgroundColor: colors.bad },
  ghost: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line },
  disabled: { opacity: 0.4 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  msg: { padding: 10, borderRadius: 10, fontSize: 14 },
  msgOk: { backgroundColor: "#e3f3ea", color: colors.good },
  msgBad: { backgroundColor: "#fbe4e2", color: colors.bad },
  legal: { backgroundColor: colors.warnBg, borderRadius: 10, padding: 10, gap: 2 },
  legalHead: { color: colors.warnInk, fontWeight: "700", fontSize: 13 },
  legalText: { color: colors.warnInk, fontSize: 12 },
});

export const input = {
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: 10,
  padding: 12,
  fontSize: 15,
  color: colors.ink,
  backgroundColor: colors.bg,
} as const;
