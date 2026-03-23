import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type PetType = "강아지" | "고양이" | "";
type BcsLabel = "심한 저체중" | "저체중" | "정상" | "과체중" | "비만" | "";

const dogBcsList = [
  {
    label: "심한 저체중",
    text: "갈비뼈, 엉덩이뼈가 쉽게 관찰됨\n지방이 피부아래 보이거나 느껴지지 않음\n극도의 허리와 복부(Tuck)가 있음",
  },
  {
    label: "저체중",
    text: "갈비뼈, 엉덩이뼈가가 쉽게 느껴지고 선명함\n지방이 피부아래 보이거나 느껴지지 않음\n명백한 허리와 복부(Tuck)가 있음",
  },
  {
    label: "정상",
    text: "갈비뼈, 엉덩이뼈가 쉽게 만져지고 눈으로 확인됨\n지방이 갈비뼈, 척추, 고관절 주변에서 느껴짐\n위/옆에서 관찰시, 허리와 복부(Tuck)가 관찰됨",
  },
  {
    label: "과체중",
    text: "갈비뼈, 엉덩이뼈를 느끼기 어렵고 보이지 않음\n과도한 지방이 갈비뼈, 척추, 고관절 주변에서 느껴짐\n허리와 복부 주름이 최소이거나 없음",
  },
  {
    label: "비만",
    text: "갈비뼈, 엉덩이뼈는 지방층 아래에서 느끼기 어려움\n위/옆에서 관찰시, 허리와 복부가 부풀어 오름\n척추, 목, 가슴에 걸쳐 지방축척물이 눈에 띔",
  },
];

const catBcsList = [
  {
    label: "심한 저체중",
    text: "육안으로 갈비뼈, 등뼈, 엉덩이뼈가 두드러질 정도로 매우 잘 보이며, 지방이 거의 없음\n배에 지방이 전혀 없으며 매우 홀쭉함",
  },
  {
    label: "저체중",
    text: "최소한의 지방만 있으며 갈비뼈, 등뼈가 쉽게 보이고 손으로 만졌을때 뼈가 쉽게 만져짐\n허리 라인이 눈에 띄고 매우 적은 양의 복부지방을 가짐",
  },
  {
    label: "정상",
    text: "육안으로 뼈가 잘 보이지 않지만 만졌을때에는 등뼈와 갈비뼈가 만져짐\n적당량의 지방이 덮힌 배, 날씬한 허리라인을 가짐",
  },
  {
    label: "과체중",
    text: "두꺼운 지방으로 덮혀 있어 뼈가 거의 보이지 않고 만졌을 때 갈비뼈를 만지기 어려움\n움질일 때마다 지방이 출렁거리고 아래로 쳐짐",
  },
  {
    label: "비만",
    text: "심한 지방층으로 덮혀 있어 등뼈, 갈비뼈가 만져지지 않거나 육안으로 확인 어려움\n지방으로 인해 허리라인이 바깥으로 볼록하게 돌출",
  },
];

export default function BcsCheckScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [petType, setPetType] = useState<PetType>("");
  const [selectedBcs, setSelectedBcs] = useState<BcsLabel | "">("");

  useEffect(() => {
    const loadData = async () => {
      try {
        const savedProfile = await AsyncStorage.getItem("petProfile");
        const parsed = savedProfile ? JSON.parse(savedProfile) : {};

        if (params?.petType && typeof params.petType === "string") {
          setPetType(params.petType as PetType);
        } else {
          setPetType(parsed.petType || "");
        }

        if (params?.selectedBcs && typeof params.selectedBcs === "string") {
          setSelectedBcs(params.selectedBcs as BcsLabel);
        } else {
          setSelectedBcs(parsed.bcs || "");
        }
      } catch (error) {
        console.log(error);
      }
    };

    loadData();
  }, [params?.petType, params?.selectedBcs]);

  const list = petType === "고양이" ? catBcsList : dogBcsList;
  const title =
    petType === "고양이" ? "고양이 비만도 체크" : "강아지 비만도 체크";

  const handleDone = async () => {
    if (!selectedBcs) {
      Alert.alert("알림", "비만도를 하나 선택해주세요.");
      return;
    }

    if (params?.from === "profile") {
      router.replace({
        pathname: "/profile",
        params: {
          selectedBcs,
          fromBcsEdit: "true",
        },
      } as any);
      return;
    }

    try {
      const savedProfile = await AsyncStorage.getItem("petProfile");
      const parsed = savedProfile ? JSON.parse(savedProfile) : {};

      await AsyncStorage.setItem(
        "petProfile",
        JSON.stringify({
          ...parsed,
          bcs: selectedBcs,
        }),
      );

      await AsyncStorage.setItem("profileCompleted", "true");
      router.replace("/home" as any);
    } catch (error) {
      console.log(error);
      Alert.alert("오류", "저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.logo}>PetFeed Planner</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.guideText}>
          *반려동물의 몸을 육안으로 확인하시고 직접 만져보시고 선택해주세요*
        </Text>

        {list.map((item) => {
          const isSelected = selectedBcs === item.label;

          return (
            <TouchableOpacity
              key={item.label}
              style={[styles.bcsCard, isSelected && styles.selectedCard]}
              onPress={() => setSelectedBcs(item.label as BcsLabel)}
            >
              <Text style={[styles.bcsText, isSelected && styles.selectedText]}>
                {item.text}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>DONE</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F6F7F4",
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  logo: {
    fontSize: 28,
    fontFamily: "KCC",
    color: "#2F6B57",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontFamily: "NanumB",
    color: "#2F6B57",
    marginBottom: 8,
  },
  guideText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#f00",
    marginBottom: 14,
  },
  bcsCard: {
    borderWidth: 1.5,
    borderColor: "#2F6B57",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    padding: 14,
    marginBottom: 14,
  },
  selectedCard: {
    backgroundColor: "#2F6B57",
  },
  bcsText: {
    fontSize: 14,
    lineHeight: 22,
    color: "#222",
  },
  selectedText: {
    color: "#FFFFFF",
  },
  doneButton: {
    height: 54,
    backgroundColor: "#1F5F43",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  doneButtonText: {
    color: "#FFF",
    fontSize: 22,
    fontFamily: "Nanum",
  },
});
