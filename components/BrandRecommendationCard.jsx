import { View, Text, Image, StyleSheet } from "react-native";

const dogIcon = require("../assets/pet-food/dog_food_icon.png");
const catIcon = require("../assets/pet-food/cat_food_icon.png");

/**
 * @param {object} props
 * @param {string} props.brandName
 * @param {'dog' | 'cat'} props.species
 * @param {string[]} props.benefits
 */
export default function BrandRecommendationCard({ brandName, species, benefits }) {
  const iconSource = species === "cat" ? catIcon : dogIcon;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Image source={iconSource} style={styles.speciesIcon} accessibilityLabel={species === "cat" ? "Cat food" : "Dog food"} />
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
  },
  speciesIcon: {
    width: 28,
    height: 28,
    marginRight: 8,
    resizeMode: "contain",
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
