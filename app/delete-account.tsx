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

type User = {
  id: string;
  email: string;
  password: string;
};

export default function DeleteAccountScreen() {
  const router = useRouter();
  const [password, setPassword] = useState("");

  const executeDelete = async () => {
    try {
      const savedLoggedInUser = await AsyncStorage.getItem("loggedInUser");

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
          !(
            user.id === currentUser.id &&
            user.email === currentUser.email &&
            user.password === currentUser.password
          ),
      );

      await AsyncStorage.setItem("users", JSON.stringify(updatedUsers));

      await AsyncStorage.removeItem("loggedInUser");
      await AsyncStorage.removeItem(`petProfile_${currentUser.email}`);
      await AsyncStorage.removeItem(`petProfileDraft_${currentUser.email}`);
      await AsyncStorage.removeItem(`profileCompleted_${currentUser.email}`);
      await AsyncStorage.removeItem(`petProfiles_${currentUser.email}`);

      Alert.alert("탈퇴 완료", "계정이 삭제되었습니다.", [
        {
          text: "확인",
          onPress: () => router.replace("/" as any),
        },
      ]);
    } catch (error) {
      console.log(error);
      Alert.alert("오류", "탈퇴 처리 중 문제가 발생했습니다.");
    }
  };

  const handleDeleteAccount = async () => {
    try {
      const savedLoggedInUser = await AsyncStorage.getItem("loggedInUser");

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

      if (currentUser.password !== password) {
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
          <Ionicons name="chevron-back" size={24} color="#2F6B57" />
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
            style={styles.deleteButton}
            onPress={handleDeleteAccount}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backButton: {
    width: 24,
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
  line: {
    height: 1,
    backgroundColor: "#777",
    opacity: 0.5,
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
});
