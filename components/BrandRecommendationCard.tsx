import { StyleSheet, Text, View } from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

type Props = {
  brandName: string;
  species: "dog" | "cat";
  benefits: string[];
};

export default function BrandRecommendationCard({
  brandName,
  species,
  benefits,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <MaterialCommunityIcons
          name={species === "cat" ? "cat" : "dog"}
          size={28}
          color="#2F6B57"
          accessibilityLabel={species === "cat" ? "Cat food" : "Dog food"}
        />
        <Text style={styles.brandName}>{brandName}</Text>
      </View>
      <Text style={styles.benefitsLabel}>Nutritional highlights</Text>
      {benefits.map((line, i) => (
        <View key={`${line}-${i}`} style={styles.bulletRow}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.benefitText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    maxWidth: "88%",
    alignSelf: "flex-start",
    backgroundColor: "#f3f4f6",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  brandName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  benefitsLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  bullet: {
    marginRight: 8,
    color: "#374151",
    fontSize: 14,
    lineHeight: 20,
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    color: "#1f2937",
    lineHeight: 20,
  },
});
