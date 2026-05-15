import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { storageKeys } from "../utils/storageKeys";

const API_BASE_URL = process.env.EXPO_PUBLIC_GO_SERVER_URL;

type ProfileData = {
  id?: string;
  serverPetId?: number;
  name?: string;
  age?: string;
  weight?: string;
  gender?: string;
  petType?: string;
  bcs?: string;
  diseases?: string[];
};

type LoggedInUser = {
  id: string;
  email: string;
  serverUserId?: number;
};

const parseAgeToMonths = (age?: string) => {
  if (!age) return 0;

  const yearMatch = age.match(/(\d+)\s*년/);
  const monthMatch = age.match(/(\d+)\s*개월/);

  const years = yearMatch ? Number(yearMatch[1]) : 0;
  const months = monthMatch ? Number(monthMatch[1]) : 0;

  return years * 12 + months;
};

const getGenderValue = (gender?: string) => {
  if (gender?.includes("남")) return "M";
  if (gender?.includes("여")) return "F";
  return "U";
};

const diseaseMap: Record<string, string> = {
  "신장 질환": "kidney_disease",
  "심장 질환": "heart_disease",
  당뇨: "diabetes",
  췌장염: "pancreatitis",
  관절염: "arthritis",
  "갑상선 기능 저하증": "hypothyroidism",
  "갑상선 기능 항진증": "hyperthyroidism",
  "요로 질환": "urinary_disease",
  없음: "none",
};

const getBcsScore = (bcs?: string) => {
  const bcsMap: Record<string, number> = {
    "심한 저체중": 1,
    저체중: 2,
    정상: 3,
    과체중: 4,
    비만: 5,
  };

  return bcs ? bcsMap[bcs] || 3 : 3;
};

const getHealthStatusValue = (diseases?: string[]) => {
  if (!diseases || diseases.length === 0) return "none";

  const mapped = diseases.map((disease) => diseaseMap[disease]).filter(Boolean);

  return mapped[0] || "none";
};

const show = (msg: string) => {
  ToastAndroid.show(msg, ToastAndroid.SHORT);
};

export default function ProfileCompleteScreen() {
  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isFormValid = profiles.length > 0;

  const loadProfiles = useCallback(async () => {
    try {
      const savedUser = await AsyncStorage.getItem(storageKeys.loggedInUser);
      const parsedUser: LoggedInUser | null = savedUser
        ? JSON.parse(savedUser)
        : null;

      if (!parsedUser?.email) return;

      const email = parsedUser.email;

      const profilesKey = storageKeys.petProfiles(email);
      const savedProfiles = await AsyncStorage.getItem(profilesKey);

      const parsedProfiles: ProfileData[] = savedProfiles
        ? JSON.parse(savedProfiles)
        : [];

      setProfiles(parsedProfiles);
    } catch {
      show("프로필 정보를 불러오는 중 문제가 발생했어요.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfiles();
    }, [loadProfiles]),
  );

  const handleAddProfile = async () => {
    try {
      const savedUser = await AsyncStorage.getItem(storageKeys.loggedInUser);
      const parsedUser: LoggedInUser | null = savedUser
        ? JSON.parse(savedUser)
        : null;

      if (!parsedUser?.email) {
        router.replace("/" as any);
        return;
      }

      const email = parsedUser.email;

      storageKeys.petProfiles(email);
      storageKeys.petProfileDraft(email);
      storageKeys.profileCompleted(email);
      storageKeys.petProfileFlowMode(email);

      router.push({
        pathname: "/profile",
        params: {
          forceInput: "true",
          entryMode: "signup",
        },
      } as any);
    } catch (error) {
      console.log("handleAddProfile error:", error);
      show("프로필 추가 화면으로 이동하는 중 문제가 발생했어요.");
    }
  };

  const handleSaveProfile = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const savedUser = await AsyncStorage.getItem(storageKeys.loggedInUser);
      const parsedUser: LoggedInUser | null = savedUser
        ? JSON.parse(savedUser)
        : null;

      if (!parsedUser?.email) {
        console.log("profile-complete: email 없음");
        router.replace("/" as any);
        return;
      }

      const email = parsedUser.email;

      let isAllSuccess = true;

      if (!parsedUser?.serverUserId) {
        alert("로그인 정보가 없습니다. 다시 로그인해주세요.");
        return;
      }

      if (!API_BASE_URL) {
        show("서버 주소가 설정되지 않았습니다.");
        return;
      }

      for (const profile of profiles) {
        // profile.tsx에서 이미 서버에 등록된 펫은 중복 등록 방지
        if (profile.serverPetId) {
          console.log(
            "profile-complete: 이미 등록된 펫 skip:",
            profile.name,
            "serverPetId:",
            profile.serverPetId,
          );
          continue;
        }

        const petData = {
          user_id: Number(parsedUser.serverUserId),
          name: profile.name || "",
          age: parseAgeToMonths(profile.age),
          species: profile.petType === "고양이" ? "Cat" : "Dog",
          breed: "none",
          gender: getGenderValue(profile.gender),
          current_weight: Number(profile.weight) || 0,
          bcs_score: getBcsScore(profile.bcs),
          diseases: profile.diseases || [],
          health_status: getHealthStatusValue(profile.diseases),
        };

        console.log("profile-complete save petData:", petData);

        const response = await fetch(`${API_BASE_URL}/api/v1/pets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify(petData),
        });

        const responseText = await response.text();
        console.log("profile-complete pet register status:", response.status);
        console.log("profile-complete pet register response:", responseText);

        if (!response.ok) {
          show("일부 반려동물 등록 실패");
          isAllSuccess = false;
          continue;
        }

        const data = responseText ? JSON.parse(responseText) : null;

        profile.serverPetId = data?.pet_id ?? data?.id;

        console.log("반려동물 등록되었습니다.:", data);
      }

      if (isAllSuccess) {
        const updatedProfiles = [...profiles];

        setProfiles(updatedProfiles);

        await AsyncStorage.setItem(
          storageKeys.petProfiles(email),
          JSON.stringify(updatedProfiles),
        );

        await AsyncStorage.setItem(storageKeys.profileCompleted(email), "true");

        await AsyncStorage.removeItem(storageKeys.petProfileFlowMode(email));

        show("프로필이 저장되었습니다");

        setTimeout(() => {
          router.dismissAll();
          router.replace("/home");
        }, 500);
      }
    } catch (error) {
      console.log("profile-complete handleSaveProfile error:", error);
      show("서버 연결 오류가 발생했습니다");
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderProfileIcon = (petType?: string) => {
    if (petType === "고양이") {
      return <Ionicons name="logo-octocat" size={30} color="#111111" />;
    }

    return <Ionicons name="paw" size={30} color="#111111" />;
  };

  const getProfileSummary = (profile: ProfileData) => {
    const weightText = profile.weight ? `${profile.weight}kg` : "-";
    const diseaseText =
      profile.diseases && profile.diseases.length > 0
        ? profile.diseases.join(", ")
        : "없음";

    return `${profile.age || "-"} / ${weightText} / ${profile.gender || "-"} / ${
      profile.bcs || "-"
    } / ${diseaseText}`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>프로필</Text>

        {profiles.map((profile) => (
          <View key={profile.id ?? profile.name} style={styles.card}>
            <View style={styles.avatar}>
              {renderProfileIcon(profile.petType)}
            </View>

            <View style={styles.infoWrap}>
              <Text style={styles.name}>{profile.name || "이름"}</Text>
              <Text style={styles.subInfo}>{getProfileSummary(profile)}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.addButton} onPress={handleAddProfile}>
          <Text style={styles.addButtonText}>⊕ 프로필 추가하기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.doneButton,
            (!isFormValid || isSubmitting) && styles.buttonDisabled,
          ]}
          onPress={handleSaveProfile}
          disabled={!isFormValid || isSubmitting}
        >
          <Text style={styles.doneButtonText}>저장</Text>
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
    paddingHorizontal: 18,
    paddingTop: 48,
    paddingBottom: 24,
  },
  title: {
    fontSize: 28,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 24,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF3EF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1.5,
    borderColor: "#2F6B57",
    backgroundColor: "#FFFFFF",
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  infoWrap: {
    flex: 1,
  },
  name: {
    fontSize: 20,
    fontFamily: "NanumB",
    color: "#111111",
    marginBottom: 4,
  },
  subInfo: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#666666",
    lineHeight: 18,
  },
  addButton: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#2F6B57",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  addButtonText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
  doneButton: {
    marginTop: "auto",
    height: 50,
    borderRadius: 12,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
  },
  doneButtonText: {
    fontSize: 20,
    fontFamily: "NanumB",
    color: "#FFFFFF",
  },
  buttonDisabled: {
    backgroundColor: "#C9C9C9",
  },
});
