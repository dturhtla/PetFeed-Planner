import { useLocalSearchParams } from "expo-router";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const nutrition = [
  { label: "칼로리", value: "375 kcal/100g" },
  { label: "조단백", value: "28%" },
  { label: "조지방", value: "15%" },
  { label: "조섬유", value: "4%" },
  { label: "조회분", value: "7%" },
];

export default function AnalysisResultScreen() {
  const params = useLocalSearchParams();
  const imageUri = Array.isArray(params.imageUri)
    ? params.imageUri[0]
    : params.imageUri;

  if (!imageUri) {
    return <Text>이미지가 없습니다</Text>;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>분석 결과</Text>

        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.previewImage} />
        ) : null}

        <View style={styles.topCard}>
          <Text style={styles.brand}>브랜드명 / 제품명</Text>
          <Text style={styles.sub}>권장 급여량과 영양 정보를 확인하세요.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>영양 정보</Text>
          {nutrition.map((item) => (
            <View key={item.label} style={styles.row}>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.value}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>추천/주의 사항</Text>
          <Text style={styles.desc}>
            • 현재 체중 기준 1일 권장 급여량 예시를 제공합니다.
          </Text>
          <Text style={styles.desc}>
            • 실제 급여량은 활동량, 나이, 건강 상태에 따라 달라질 수 있습니다.
          </Text>
        </View>
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
  previewImage: {
    width: "100%",
    height: 240,
    borderRadius: 16,
    marginBottom: 18,
  },
  topCard: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 18,
  },
  brand: { fontSize: 17, fontWeight: "700", color: "#222", marginBottom: 6 },
  sub: { fontSize: 13, color: "#666" },
  section: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#2F6B57",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 0.6,
    borderBottomColor: "#E4E8E6",
  },
  label: { fontSize: 14, color: "#333" },
  value: { fontSize: 14, fontWeight: "700", color: "#2F6B57" },
  desc: { fontSize: 13, color: "#555", lineHeight: 21, marginBottom: 6 },
});
