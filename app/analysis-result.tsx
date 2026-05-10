import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const API_URL = "https://soulful-ouida-penetrably.ngrok-free.dev";
const GO_SERVER_URL =
  "https://preirrigational-concha-prealphabetically.ngrok-free.dev";

type ProfileData = {
  name: string;
  age: string;
  weight: string;
  gender: string;
  petType: string;
  bcs: string;
  diseases?: string[];
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
  const years = yearMatch ? parseInt(yearMatch[1], 10) : 0;
  const months = monthMatch ? parseInt(monthMatch[1], 10) : 0;
  return { years, months };
};

const getLifeStage = (
  ageStr: string,
  gender: string,
  petType: string,
  bcs: string,
) => {
  const { years, months } = parseAge(ageStr);
  const totalMonths = years * 12 + months;

  if (totalMonths < 12) {
    return petType === "강아지" ? "어린강아지" : "어린고양이";
  }

  if (years >= 8) {
    return petType === "강아지" ? "노령견" : "노령묘";
  }

  if (gender === "중성화") {
    return petType === "강아지" ? "중성화성견" : "중성화성묘";
  }

  if (bcs === "과체중" || bcs === "비만") {
    return petType === "강아지" ? "비만견" : "비만묘";
  }

  return petType === "강아지" ? "성견" : "성묘";
};

const bcsToNumber = (bcs: string): number => {
  const bcsMap: { [key: string]: number } = {
    "심한 저체중": 1,
    저체중: 3,
    정상: 5,
    과체중: 7,
    비만: 9,
  };
  return bcsMap[bcs] || 5;
};

const diseaseMapReverse: Record<string, string> = {
  kidney_disease: "신장질환",
  heart_disease: "심장질환",
  diabetes: "당뇨",
  pancreatitis: "췌장염",
  arthritis: "관절염",
  hypothyroidism: "갑상선기능저하증",
  hyperthyroidism: "갑상선기능항진증",
  urinary_disease: "비뇨기질환",
  none: "없음",
};

const mapDiseasesToKorean = (healthStatus: string): string[] => {
  if (!healthStatus || healthStatus === "none") return ["없음"];
  const korean = diseaseMapReverse[healthStatus];
  return korean ? [korean] : ["없음"];
};

export default function AnalysisResultScreen() {
  const params = useLocalSearchParams();
  const imageUri = Array.isArray(params.imageUri)
    ? params.imageUri[0]
    : params.imageUri;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [foodInfo, setFoodInfo] = useState<FoodInfo | null>(null);
  const [feeding, setFeeding] = useState<FeedingRecommendation | null>(null);
  const [analyzedPetName, setAnalyzedPetName] = useState("");

  const analyzeFood = useCallback(async () => {
    try {
      console.log("analyzeFood 시작");
      setIsLoading(true);
      setError(null);

      if (!imageUri || typeof imageUri !== "string") {
        setError("이미지를 찾을 수 없어요.");
        return;
      }

      const savedUser = await AsyncStorage.getItem("loggedInUser");
      console.log("savedUser:", savedUser);

      if (!savedUser) {
        setError("로그인 정보를 찾을 수 없어요.");
        return;
      }

      const parsedUser = JSON.parse(savedUser);
      const email = parsedUser.email;
      const serverUserId = parsedUser.serverUserId;

      console.log("email:", email);
      console.log("serverUserId:", serverUserId);

      if (!serverUserId) {
        setError("서버 사용자 ID가 없습니다. 다시 로그인해주세요.");
        return;
      }

      // 선택된 반려동물 ID 가져오기
      const savedPetId = await AsyncStorage.getItem(`selectedPetId_${email}`);
      console.log("savedPetId:", savedPetId);

      // Go 서버에서 반려동물 목록 가져오기
      const petsResponse = await fetch(
        `${GO_SERVER_URL}/api/v1/users/${serverUserId}/pets`,
        {
          headers: {
            "ngrok-skip-browser-warning": "true",
          },
        },
      );

      console.log("pets 응답 상태:", petsResponse.status);

      if (!petsResponse.ok) {
        const errText = await petsResponse.text();
        console.log("pets 응답 에러:", errText);
        setError("반려동물 정보를 불러오지 못했어요. 서버를 확인해주세요.");
        return;
      }

      const petsResult = await petsResponse.json();
      console.log("서버 반려동물 목록:", JSON.stringify(petsResult));

      const pets = Array.isArray(petsResult)
        ? petsResult
        : petsResult?.pets || [];

      const selectedPet = savedPetId
        ? pets.find(
            (pet: any) => String(pet.pet_id ?? pet.id) === String(savedPetId),
          )
        : pets[0];

      console.log("pets:", pets);
      console.log("savedPetId:", savedPetId);
      console.log("선택된 반려동물:", JSON.stringify(selectedPet));

      if (!selectedPet) {
        setError("선택한 반려동물 프로필을 찾을 수 없어요.");
        return;
      }

      const serverPetId = String(selectedPet.pet_id ?? selectedPet.id);

      const savedProfiles = await AsyncStorage.getItem(`petProfiles_${email}`);
      const localProfiles = savedProfiles ? JSON.parse(savedProfiles) : [];

      const localProfile = localProfiles.find(
        (p: any) => p.name === selectedPet.name,
      );

      const profile: ProfileData = {
        name: selectedPet.name || localProfile?.name || "",
        age: selectedPet.age || localProfile?.age || "",
        weight: String(selectedPet.weight || selectedPet.current_weight || localProfile?.weight || "0"),
        gender: selectedPet.gender || localProfile?.gender || "",
        petType:
          selectedPet.species === "Dog"
            ? "강아지"
            : selectedPet.species === "Cat"
              ? "고양이"
              : localProfile?.petType || "",
        bcs: selectedPet.bcs || localProfile?.bcs || "정상",
        diseases:
          selectedPet.diseases ||
          localProfile?.diseases ||
          mapDiseasesToKorean(selectedPet.health_status || "none"),
      };
      console.log("서버에서 프로필 가져옴:", profile);

      const { years, months } = parseAge(profile.age || "");
      const lifeStage = getLifeStage(
        profile.age || "",
        profile.gender || "",
        profile.petType || "",
        profile.bcs || "",
      );

      console.log("profile:", profile);
      console.log("lifeStage:", lifeStage);
      console.log("imageUri:", imageUri);

      const queryParams = new URLSearchParams({
        pet_name: profile.name || "",
        species: profile.petType || "",
        weight_kg: profile.weight || "0",
        age_year: String(years),
        age_month: String(months),
        life_stage: lifeStage,
        health_conditions: (profile.diseases || [])
          .filter((d) => d !== "없음")
          .join(","),
      });

      const formData = new FormData();
      formData.append("image", {
        uri: imageUri,
        type: "image/jpeg",
        name: "food.jpg",
      } as any);

      const requestUrl = `${API_URL}/food/analyze?${queryParams.toString()}`;
      console.log("현재 API_URL:", API_URL);
      console.log("API 호출 시작:", requestUrl);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      try {
        await fetch(`${API_URL}/health`, {
          headers: { "ngrok-skip-browser-warning": "true" },
        });
      } catch (_) {}

      const response = await fetch(requestUrl, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        headers: {
          "ngrok-skip-browser-warning": "true",
        },
      });

      clearTimeout(timeoutId);

      console.log("응답 상태:", response.status);

      const rawText = await response.text();
      console.log("raw 응답:", rawText);

      if (!response.ok) {
        setError(`서버 오류가 발생했어요. (${response.status})`);
        return;
      }

      let result: any;
      try {
        result = JSON.parse(rawText);
      } catch {
        setError("서버 응답 형식이 올바르지 않아요.");
        return;
      }

      console.log("결과:", result);

      if (result.status === "needs_retry") {
        setError(result.message || "다시 촬영해주세요.");
        return;
      }

      if (result.status === "success") {
        setFoodInfo(result.food_info);
        setFeeding(result.feeding_recommendation);
        setAnalyzedPetName(profile.name);

        // 1. 사료 정보 등록 먼저
        let foodId = null;
        try {
          const foodResponse = await fetch(`${GO_SERVER_URL}/api/v1/foods`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({
              fat_pct: result.food_info.fat_pct,
              kcal_per_g: result.food_info.calories_per_100g
                ? result.food_info.calories_per_100g / 100
                : null,
              product_name: result.food_info.product_name,
              protein_pct: result.food_info.protein_pct,
            }),
          });
          const foodResult = await foodResponse.json();
          foodId = foodResult.food_id;
          console.log("사료 등록 완료, food_id:", foodId);

          // 2. 사료 사진 업로드
          if (foodId && imageUri) {
            const photoFormData = new FormData();
            photoFormData.append("food_id", String(foodId));
            photoFormData.append("photo", {
              uri: imageUri,
              type: "image/jpeg",
              name: "food_photo.jpg",
            } as any);

            await fetch(`${GO_SERVER_URL}/api/v1/foods/photo`, {
              method: "POST",
              headers: {
                "ngrok-skip-browser-warning": "true",
              },
              body: photoFormData,
            });
            console.log("사료 사진 업로드 완료");
          }
        } catch (err) {
          console.log("사료 등록/사진 업로드 실패:", err);
        }

        // 3. Go 서버에 분석 결과 저장 (food_id 포함)
        try {
          await fetch(`${GO_SERVER_URL}/api/v1/pets/${serverPetId}/analysis`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "ngrok-skip-browser-warning": "true",
            },
            body: JSON.stringify({
              bcs: bcsToNumber(profile.bcs || ""),
              food_id: foodId,
              recommended_amount: result.feeding_recommendation.daily_grams,
            }),
          });
          console.log("Go 서버 저장 완료");
        } catch (err) {
          console.log("Go 서버 저장 실패:", err);
        }

        return;
      }

      setError("분석 결과를 불러오지 못했어요.");
    } catch (err: any) {
      console.log("에러 타입:", err?.name);
      console.log("에러 메시지:", err?.message);

      if (err?.name === "AbortError") {
        setError("요청 시간이 초과됐어요. (120초)");
      } else if (err?.message?.includes("Network request failed")) {
        setError("네트워크 오류예요. ngrok URL이 최신인지 확인해주세요.");
      } else {
        setError(`오류: ${err?.message || "알 수 없는 오류"}`);
      }
    } finally {
      setIsLoading(false);
    }
  }, [imageUri]);

  const handleSaveFoodToList = async () => {
    if (!foodInfo || !feeding) return;

    try {
      const savedUser = await AsyncStorage.getItem("loggedInUser");
      if (!savedUser) {
        ToastAndroid.show("로그인 정보를 찾을 수 없어요.", ToastAndroid.SHORT);
        return;
      }

      const parsedUser = JSON.parse(savedUser);
      const email = parsedUser.email;

      const savedPetId = await AsyncStorage.getItem(`selectedPetId_${email}`);
      if (!savedPetId) {
        ToastAndroid.show("반려동물을 선택해주세요.", ToastAndroid.SHORT);
        return;
      }

      const savedFoods = await AsyncStorage.getItem(
        `savedFoods_${email}_${savedPetId}`,
      );
      const foodList = savedFoods ? JSON.parse(savedFoods) : [];

      const foodName = foodInfo.product_name || foodInfo.brand || "분석된 사료";

      const isDuplicate = foodList.some((food: any) => food.name === foodName);

      if (isDuplicate) {
        ToastAndroid.show("이미 존재하는 사료입니다", ToastAndroid.SHORT);
        return;
      }

      const newFood = {
        id: `${Date.now()}`,
        name: foodName,
        subLabel: foodInfo.brand || "AI 분석 사료",
        gramLabel: `${feeding.daily_grams}g 권장`,
        recommendedAmount: feeding.daily_grams,
        petId: savedPetId,
        petName: analyzedPetName,
        isCustom: true,
      };

      await AsyncStorage.setItem(
        `savedFoods_${email}_${savedPetId}`,
        JSON.stringify([...foodList, newFood]),
      );

      ToastAndroid.show("사료목록에 추가되었습니다", ToastAndroid.SHORT);
    } catch (error) {
      console.log("사료 목록 저장 실패:", error);
      ToastAndroid.show("사료목록 저장에 실패했어요.", ToastAndroid.SHORT);
    }
  };

  useEffect(() => {
    console.log("useEffect 실행됨");
    console.log("imageUri:", imageUri);
    analyzeFood();
  }, [analyzeFood, imageUri]);

  if (!imageUri) {
    return (
      <SafeAreaView style={styles.safe}>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Text>이미지가 없습니다</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
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
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
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

        <Image source={{ uri: imageUri }} style={styles.previewImage} />

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
              value: foodInfo?.main_ingredients?.length
                ? foodInfo.main_ingredients.join(", ")
                : "-",
            },
          ].map((item) => (
            <View key={item.label} style={styles.row}>
              <Text style={styles.label}>{item.label}</Text>
              <Text
                style={[
                  styles.value,
                  { flex: 1, textAlign: "right", marginLeft: 8 },
                ]}
              >
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>추천/주의 사항</Text>
          <Text style={[styles.desc, { color: "#2F6B57", fontWeight: "800" }]}>
            • 1일 권장 급여량: {feeding?.daily_grams ?? "-"}g (1회{" "}
            {feeding?.grams_per_meal ?? "-"}g, {feeding?.meals_per_day ?? "-"}
            회)
          </Text>

          <Text style={styles.desc}>• {feeding?.recommendation ?? "-"}</Text>

          {feeding?.ingredient_warnings?.length ? (
            feeding.ingredient_warnings.map((warning, index) => (
              <Text
                key={index}
                style={{
                  fontSize: 13,
                  color: "#D64545",
                  lineHeight: 21,
                  marginBottom: 6,
                }}
              >
                • {warning}
              </Text>
            ))
          ) : (
            <Text style={styles.desc}>• 위험 성분이 없습니다.</Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.saveFoodButton}
          onPress={handleSaveFoodToList}
        >
          <Text style={styles.saveFoodButtonText}>사료 목록에 저장</Text>
        </TouchableOpacity>
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
  saveFoodButton: {
    marginTop: 10,
    backgroundColor: "#2F6B57",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveFoodButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});