import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { storageKeys } from "../utils/storageKeys";

type User = {
  id: string;
  email: string;
  password: string;
  serverUserId?: number;
};

type PetProfile = {
  id?: string | number;
  name?: string;
  age?: string;
  weight?: string;
  gender?: string;
  petType?: string;
  bcs?: string;
  diseases?: string[];
};

const API_BASE_URL = process.env.EXPO_PUBLIC_GO_SERVER_URL;

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const executeDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);

    try {
      const savedLoggedInUser = await AsyncStorage.getItem(
        storageKeys.loggedInUser,
      );

      if (!savedLoggedInUser) {
        Alert.alert("오류", "로그인 정보가 없습니다.", [
          {
            text: "확인",
            onPress: () => router.replace("/" as any),
          },
        ]);
        return;
      }

      const currentUser: User = JSON.parse(savedLoggedInUser);

      const savedUsers = await AsyncStorage.getItem("users");
      const users: User[] = savedUsers ? JSON.parse(savedUsers) : [];

      const updatedUsers = users.filter(
        (user) =>
          !(user.id === currentUser.id && user.email === currentUser.email),
      );

      if (currentUser.serverUserId && API_BASE_URL) {
        console.log(
          "탈퇴 요청 URL:",
          `${API_BASE_URL}/users/${currentUser.serverUserId}`,
        );

        console.log("serverUserId:", currentUser.serverUserId);

        const response = await fetch(
          `${API_BASE_URL}/api/v1/users/${currentUser.serverUserId}`,
          {
            method: "DELETE",
            headers: {
              "ngrok-skip-browser-warning": "true",
            },
          },
        );

        const responseText = await response.text();

        console.log("탈퇴 응답 status:", response.status);
        console.log("탈퇴 응답 body:", responseText);

        if (!response.ok && response.status !== 404) {
          throw new Error(`서버 탈퇴 실패: ${response.status} ${responseText}`);
        }

        if (response.status === 404) {
          console.log(
            "서버에는 이미 없는 사용자라 로컬 탈퇴 처리를 계속 진행합니다.",
          );
        }
      }

      await AsyncStorage.setItem("users", JSON.stringify(updatedUsers));

      // 먼저 반려동물 목록을 읽어서 pet별 알람 key 제거
      const savedProfiles = await AsyncStorage.getItem(
        `petProfiles_${currentUser.email}`,
      );
      const parsedProfiles: PetProfile[] = savedProfiles
        ? JSON.parse(savedProfiles)
        : [];

      for (let i = 0; i < parsedProfiles.length; i++) {
        const petId = String(parsedProfiles[i].id ?? i + 1);

        await AsyncStorage.removeItem(
          storageKeys.feedingAlarms(currentUser.email, petId),
        );

        await AsyncStorage.removeItem(
          storageKeys.savedFoods(currentUser.email, petId),
        );
      }

      // 혹시 예전 구조/단일 프로필 구조에서 남아 있을 수 있는 key도 같이 제거
      await AsyncStorage.removeItem(`feeding_alarms_${currentUser.email}`);

      await AsyncStorage.removeItem(storageKeys.loggedInUser);

      await AsyncStorage.removeItem(storageKeys.petProfile(currentUser.email));

      await AsyncStorage.removeItem(
        storageKeys.petProfileDraft(currentUser.email),
      );

      await AsyncStorage.removeItem(
        storageKeys.profileCompleted(currentUser.email),
      );

      await AsyncStorage.removeItem(storageKeys.petProfiles(currentUser.email));

      await AsyncStorage.removeItem(
        storageKeys.petProfileFlowMode(currentUser.email),
      );

      await AsyncStorage.removeItem(
        storageKeys.feedingRecords(currentUser.email),
      );

      await AsyncStorage.removeItem(
        storageKeys.selectedPetId(currentUser.email),
      );

      Alert.alert("탈퇴 완료", "계정이 삭제되었습니다.", [
        {
          text: "확인",
          onPress: () => router.replace("/" as any),
        },
      ]);
    } catch (error) {
      console.log(error);
      Alert.alert("오류", "탈퇴 처리 중 문제가 발생했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const savedLoggedInUser = await AsyncStorage.getItem(
        storageKeys.loggedInUser,
      );
      if (!savedLoggedInUser) {
        Alert.alert("오류", "로그인 정보가 없습니다.", [
          {
            text: "확인",
            onPress: () => router.replace("/" as any),
          },
        ]);
        return;
      }

      const currentUser: User = JSON.parse(savedLoggedInUser);

      if (!password.trim()) {
        Alert.alert("비밀번호 확인", "비밀번호를 입력해주세요.");
        return;
      }

      const savedUsers = await AsyncStorage.getItem(storageKeys.users);
      const users: User[] = savedUsers ? JSON.parse(savedUsers) : [];

      const matchedUser = users.find(
        (user) =>
          user.id === currentUser.id &&
          user.email === currentUser.email &&
          user.password === password,
      );

      if (!matchedUser) {
        Alert.alert("오류", "비밀번호가 일치하지 않습니다.");
        return;
      }

      Alert.alert(
        "정말 탈퇴하시겠습니까?",
        "계정을 삭제하면 모든 정보가 복구되지 않습니다.",
        [
          {
            text: "취소",
            style: "cancel",
          },
          {
            text: "탈퇴",
            style: "destructive",
            onPress: executeDelete,
          },
        ],
      );
    } catch (error) {
      console.log(error);
      Alert.alert("오류", "탈퇴 처리 중 문제가 발생했습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={28} color="#2F6B57" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>탈퇴하기</Text>

        <View style={{ width: 24 }} />
      </View>

      <View style={styles.line} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.guideTitle}>비밀번호 확인</Text>
          <Text style={styles.guideText}>
            계정을 삭제하려면 현재 비밀번호를 입력해주세요.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor="#777"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[
              styles.deleteButton,
              !password.trim() && styles.deleteButtonDisabled,
            ]}
            onPress={handleDeleteAccount}
            disabled={!password.trim() || isDeleting}
          >
            <Text style={styles.deleteButtonText}>탈퇴하기</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F6F7F4",
  },
  flex: {
    flex: 1,
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "flex-start",
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  line: {
    height: 1,
    backgroundColor: "#777",
    opacity: 0.5,
    marginTop: -4,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  guideTitle: {
    fontSize: 24,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 12,
  },
  guideText: {
    fontSize: 15,
    fontFamily: "Nanum",
    color: "#666",
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 22,
  },
  input: {
    height: 60,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    backgroundColor: "#FFF",
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 18,
    fontSize: 16,
    color: "#222",
    fontFamily: "Nanum",
  },
  deleteButton: {
    height: 56,
    borderRadius: 18,
    backgroundColor: "#C24848",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  deleteButtonText: {
    color: "#FFF",
    fontSize: 18,
    fontFamily: "NanumB",
  },
  deleteButtonDisabled: {
    backgroundColor: "#C9C9C9",
  },
});
