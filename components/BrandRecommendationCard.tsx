import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ChatReplyLocale } from "../utils/chatLocale";
import {
  displayEstimatedPriceForLocale,
  getUsdToKrwRate,
  stripPriceEstimateWords,
} from "../utils/estimatedPriceKrw";

export type BrandRecommendationCardProps = {
  brandName: string;
  species: "dog" | "cat";
  benefits: string[];
  productName?: string;
  /** Approximate retail price; informational only */
  estimatedPrice?: string;
  /** Match species line to user's language (English vs Korean UI) */
  labelLocale?: ChatReplyLocale;
};

export default function BrandRecommendationCard({
  brandName,
  species,
  benefits,
  productName,
  estimatedPrice,
  labelLocale = "ko",
}: BrandRecommendationCardProps) {
  const speciesLabel =
    labelLocale === "en"
      ? species === "cat"
        ? "Cat"
        : "Dog"
      : species === "cat"
        ? "고양이"
        : "강아지";

  const priceDisplay = useMemo(() => {
    if (!estimatedPrice?.trim()) return estimatedPrice;
    const rate = getUsdToKrwRate();
    const converted = displayEstimatedPriceForLocale(
      estimatedPrice,
      labelLocale,
      rate,
    );
    return stripPriceEstimateWords(converted);
  }, [estimatedPrice, labelLocale]);

  return (
    <View style={styles.card}>
      <Text style={styles.brand}>{brandName}</Text>
      {productName ? (
        <Text style={styles.product}>{productName}</Text>
      ) : null}
      {priceDisplay ? (
        <Text style={styles.price}>{priceDisplay}</Text>
      ) : null}
      <Text style={styles.meta}>{speciesLabel}</Text>
      {benefits.length > 0 ? (
        <View style={styles.bullets}>
          {benefits.map((line, i) => (
            <Text key={i} style={styles.bulletLine}>
              · {line}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(47, 107, 87, 0.22)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  brand: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1f2933",
  },
  product: {
    fontSize: 13,
    color: "#4b5563",
    marginTop: 2,
  },
  price: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2F6B57",
    marginTop: 6,
  },
  meta: {
    fontSize: 12,
    color: "#6b7280",
    marginTop: 4,
  },
  bullets: {
    marginTop: 8,
  },
  bulletLine: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 19,
  },
});
