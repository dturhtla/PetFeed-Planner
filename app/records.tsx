import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const records = [
  { date: "2026.03.21", amount: "75 g", status: "정상" },
  { date: "2026.03.20", amount: "80 g", status: "많음" },
  { date: "2026.03.19", amount: "70 g", status: "적정" },
];

export default function RecordsScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>급여 기록</Text>

        {records.map((item, idx) => (
          <View key={idx} style={styles.card}>
            <Text style={styles.date}>{item.date}</Text>
            <Text style={styles.amount}>{item.amount}</Text>
            <Text style={styles.status}>{item.status}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F7F4" },
  container: { padding: 20 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2F6B57",
    alignSelf: "center",
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  date: { fontSize: 13, color: "#777", marginBottom: 6 },
  amount: { fontSize: 18, fontWeight: "700", color: "#222" },
  status: { fontSize: 13, color: "#2F6B57", marginTop: 6 },
});
