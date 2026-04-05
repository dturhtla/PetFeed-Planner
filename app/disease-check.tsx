import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type GenderType = "남" | "여" | "중성화" | "";
type PetType = "강아지" | "고양이" | "";
type BcsLabel = "심한 저체중" | "저체중" | "정상" | "과체중" | "비만" | "";

type LoggedInUser = {
  id: string;
  email: string;
  password: string;
};

type ProfileData = {
  name?: string;
  age?: string;
  weight?: string;
  gender?: GenderType;
  petType?: PetType;
  bcs?: BcsLabel;
  diseases?: string[];
};

const DISEASE_OPTIONS = [
  "없음",
  "당뇨",
  "신장 질환",
  "심장 질환",
  "췌장염",
  "관절염",
  "갑상선 기능 저하증",
  "갑상선 기능 항진증",
  "요로 질환",
];

export default function DiseaseCheckScreen() {
  const params = useLocalSearchParams();

  const [selectedDiseases, setSelectedDiseases] = useState<string[]>(
    (() => {
      if (typeof params?.selectedDiseases === "string") {
        try {
          return JSON.parse(params.selectedDiseases);
        } catch {
          return [];
        }
      }
      return [];
    })(),
  );

  const toggleDisease = (item: string) => {
    if (item === "없음") {
      if (selectedDiseases.includes("없음")) {
        setSelectedDiseases([]);
      } else {
        setSelectedDiseases(["없음"]);
      }
      return;
    }

    setSelectedDiseases((prev) => {
      const withoutNone = prev.filter((value) => value !== "없음");

      if (withoutNone.includes(item)) {
        return withoutNone.filter((value) => value !== item);
      }

      return [...withoutNone, item];
    });
  };

  const handleSave = async () => {
    try {
      if (selectedDiseases.length === 0) {
        Alert.alert("알림", "질병 항목을 하나 이상 선택해주세요.");
        return;
      }

      const savedUser = await AsyncStorage.getItem("loggedInUser");
      const parsedUser: LoggedInUser | null = savedUser
        ? JSON.parse(savedUser)
        : null;

      if (!parsedUser?.email) {
        router.replace("/" as any);
        return;
      }

      const email = parsedUser.email;

      const draftKey = `petProfileDraft_${email}`;
      const profileKey = `petProfile_${email}`;
      const profilesKey = `petProfiles_${email}`;
      const completedKey = `profileCompleted_${email}`;

      const savedProfile = await AsyncStorage.getItem(profileKey);
      const savedDraft = await AsyncStorage.getItem(draftKey);

      const parsedProfile: ProfileData = savedProfile
        ? JSON.parse(savedProfile)
        : {};
      const parsedDraft: ProfileData = savedDraft ? JSON.parse(savedDraft) : {};

      const baseProfile: ProfileData =
        Object.keys(parsedProfile).length > 0 ? parsedProfile : parsedDraft;

      if (
        !baseProfile.name ||
        !baseProfile.age ||
        !baseProfile.weight ||
        !baseProfile.gender ||
        !baseProfile.petType ||
        !baseProfile.bcs
      ) {
        Alert.alert("알림", "프로필 정보가 완전하지 않습니다.");
        router.replace("/profile-complete" as any);
        return;
      }

      const finalProfile: ProfileData = {
        ...baseProfile,
        diseases: selectedDiseases,
      };

      // 프로필 수정 화면에서 질병 수정으로 들어온 경우
      // draft만 갱신하고 profile 수정 화면으로 복귀
      if (params?.from === "profile") {
        await AsyncStorage.setItem(draftKey, JSON.stringify(finalProfile));

        router.replace({
          pathname: "/profile",
          params: {
            fromDiseaseEdit: "true",
            selectedDiseases: JSON.stringify(selectedDiseases),
            editIndex:
              typeof params?.editIndex === "string" ? params.editIndex : "",
          },
        } as any);
        return;
      }

      // 새 프로필 추가 흐름인 경우
      const savedProfiles = await AsyncStorage.getItem(profilesKey);
      const parsedProfiles: ProfileData[] = savedProfiles
        ? JSON.parse(savedProfiles)
        : [];

      const updatedProfiles = [...parsedProfiles, finalProfile];

      await AsyncStorage.setItem(profileKey, JSON.stringify(finalProfile));
      await AsyncStorage.setItem(draftKey, JSON.stringify(finalProfile));
      await AsyncStorage.setItem(profilesKey, JSON.stringify(updatedProfiles));
      await AsyncStorage.setItem(completedKey, "true");

      router.replace("/profile-complete" as any);
    } catch (error) {
      console.log(error);
      Alert.alert("오류", "질병 정보 저장 중 오류가 발생했습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>질병체크</Text>

        <View style={styles.grid}>
          {DISEASE_OPTIONS.map((item) => {
            const isSelected = selectedDiseases.includes(item);

            return (
              <TouchableOpacity
                key={item}
                style={[
                  styles.optionButton,
                  isSelected && styles.selectedButton,
                ]}
                onPress={() => toggleDisease(item)}
              >
                <Text
                  style={[styles.optionText, isSelected && styles.selectedText]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[
            styles.saveButton,
            selectedDiseases.length === 0 && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={selectedDiseases.length === 0}
        >
          <Text style={styles.saveButtonText}>저장</Text>
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
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 100,
    paddingBottom: 36,
    justifyContent: "space-between",
  },
  title: {
    fontSize: 28,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 36,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  optionButton: {
    width: "47%",
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: "#2F6B57",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  selectedButton: {
    backgroundColor: "#2F6B57",
  },
  optionText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#2F6B57",
    textAlign: "center",
  },
  selectedText: {
    color: "#FFFFFF",
  },
  saveButton: {
    width: "100%",
    height: 54,
    borderRadius: 14,
    backgroundColor: "#1F5F43",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: "#FFF",
    fontSize: 22,
    fontFamily: "Nanum",
  },
});
