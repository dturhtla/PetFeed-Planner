import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const API_URL = "https://soulful-ouida-penetrably.ngrok-free.dev/food/analyze";

type ProfileData = {
  name: string;
  age: string;
  weight: string;
  gender: string;
  petType: string;
  bcs: string;
};

type FoodInfo = {
  brand: string | null;
  product_name: string | null;
  calories_per_100g: number | null;
  main_ingredients: string[] | null;
  protein_pct: number | null;
  fat_pct: number | null;
  confidence: number;
};

type FeedingRecommendation = {
  daily_grams: number;
  meals_per_day: number;
  grams_per_meal: number;
  daily_kcal: number;
  recommendation: string;
  ingredient_warnings: string[];
};

const parseAge = (ageStr: string) => {
  const yearMatch = ageStr.match(/(\d+)년/);
  const monthMatch = ageStr.match(/(\d+)개월/);
  const years = yearMatch ? parseInt(yearMatch[1]) : 0;
  const months = monthMatch ? parseInt(monthMatch[1]) : 0;
  return { years, months };
};

const getLifeStage = (ageStr: string, gender: string, petType: string, bcs: string) => {
  const { years, months } = parseAge(ageStr);
  const totalMonths = years * 12 + months;

  if (totalMonths < 12) {
    if (petType === "강아지") return "어린강아지";
    return "어린고양이";
  }

  if (years >= 8) {
    if (petType === "강아지") return "노령견";
    return "노령묘";
  }

  if (gender === "중성화") {
    if (petType === "강아지") return "중성화성견";
    return "중성화성묘";
  }

  if (bcs === "과체중" || bcs === "비만") {
    if (petType === "강아지") return "비만견";
    return "비만묘";
  }

  if (petType === "강아지") return "성견";
  return "성묘";
};

export default function AnalysisResultScreen() {
  const params = useLocalSearchParams();
  const imageUri = Array.isArray(params.imageUri)
    ? params.imageUri[0]
    : params.imageUri;

  if (!imageUri) {
    return <Text>이미지가 없습니다</Text>;
  }

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [foodInfo, setFoodInfo] = useState<FoodInfo | null>(null);
  const [feeding, setFeeding] = useState<FeedingRecommendation | null>(null);

  useEffect(() => {
    console.log("useEffect 실행됨");
    console.log("imageUri:", imageUri);
    analyzeFood();
  }, []);

  const analyzeFood = async () => {
    try {
      console.log("analyzeFood 시작");
      setIsLoading(true);
      setError(null);

      const savedUser = await AsyncStorage.getItem("loggedInUser");
      console.log("savedUser:", savedUser);

      if (!savedUser) {
        setError("로그인 정보를 찾을 수 없어요.");
        return;
      }

      const parsedUser = JSON.parse(savedUser);
      const email = parsedUser.email;
      console.log("email:", email);

      const savedProfile = await AsyncStorage.getItem(`petProfile_${email}`);
      console.log("savedProfile:", savedProfile);

      if (!savedProfile) {
        setError("프로필 정보를 찾을 수 없어요. 프로필을 먼저 입력해주세요.");
        return;
      }

      const profile: ProfileData = JSON.parse(savedProfile);
      const { years, months } = parseAge(profile.age || "");
      const lifeStage = getLifeStage(
        profile.age || "",
        profile.gender || "",
        profile.petType || "",
        profile.bcs || ""
      );

      console.log("profile:", profile);
      console.log("lifeStage:", lifeStage);
      console.log("imageUri:", imageUri);

      if (!imageUri) {
        setError("이미지를 찾을 수 없어요.");
        return;
      }

      const queryParams = new URLSearchParams({
        pet_name: profile.name || "",
        species: profile.petType || "",
        weight_kg: profile.weight || "0",
        age_year: String(years),
        age_month: String(months),
        life_stage: lifeStage,
        health_conditions: "",
      });

      const formData = new FormData();
      formData.append("image", {
        uri: imageUri,
        type: "image/jpeg",
        name: "food.jpg",
      } as any);

      console.log("API 호출 시작:", API_URL);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      const response = await fetch(`${API_URL}?${queryParams}`, {
        method: "POST",
        body: formData,
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log("응답 상태:", response.status);

      const result = await response.json();
      console.log("결과:", result);

      if (result.status === "needs_retry") {
        setError(result.message);
        return;
      }

      if (result.status === "success") {
        setFoodInfo(result.food_info);
        setFeeding(result.feeding_recommendation);
      }
    } catch (err) {
      console.log("에러:", err);
      setError("서버 연결에 실패했어요. 서버가 실행 중인지 확인해주세요.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color="#2F6B57" />
          <Text style={{ marginTop: 16, fontSize: 16, color: "#2F6B57" }}>
            사료 분석 중...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
          <Text style={{ fontSize: 15, color: "#D64545", textAlign: "center" }}>
            {error}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>분석 결과</Text>

        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.previewImage} />
        ) : null}

        <View style={styles.topCard}>
          <Text style={styles.brand}>
            {foodInfo?.brand || "브랜드 정보 없음"} /{" "}
            {foodInfo?.product_name || "제품명 정보 없음"}
          </Text>
          <Text style={styles.sub}>권장 급여량과 영양 정보를 확인하세요.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>영양 정보</Text>
          {[
            {
              label: "칼로리",
              value: foodInfo?.calories_per_100g
                ? `${foodInfo.calories_per_100g} kcal/100g`
                : "-",
            },
            {
              label: "조단백",
              value: foodInfo?.protein_pct ? `${foodInfo.protein_pct}%` : "-",
            },
            {
              label: "조지방",
              value: foodInfo?.fat_pct ? `${foodInfo.fat_pct}%` : "-",
            },
            {
              label: "원재료",
              value: foodInfo?.main_ingredients
                ? foodInfo.main_ingredients.join(", ")
                : "-",
            },
          ].map((item) => (
            <View key={item.label} style={styles.row}>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={[styles.value, { flex: 1, textAlign: "right", marginLeft: 8 }]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>추천/주의 사항</Text>
          <Text style={styles.desc}>
            • 1일 권장 급여량: {feeding?.daily_grams}g (1회{" "}
            {feeding?.grams_per_meal}g, {feeding?.meals_per_day}회)
          </Text>
          <Text style={styles.desc}>
            • {feeding?.recommendation}
          </Text>
          {feeding?.ingredient_warnings &&
          feeding.ingredient_warnings.length > 0 ? (
            feeding.ingredient_warnings.map((warning, index) => (
              <Text key={index} style={{ fontSize: 13, color: "#D64545", lineHeight: 21, marginBottom: 6 }}>
                • {warning}
              </Text>
            ))
          ) : (
            <Text style={styles.desc}>• 위험 성분이 없습니다.</Text>
          )}
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