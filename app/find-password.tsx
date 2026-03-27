import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type User = {
  id: string;
  email: string;
  password: string;
};

const isValidEmail = (value: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

export default function FindPasswordScreen() {
  const router = useRouter();

  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");

  const handleResetPassword = async () => {
    try {
      const trimmedId = id.trim();
      const trimmedEmail = email.trim().toLowerCase();

      if (!trimmedId) {
        Alert.alert("비밀번호 찾기", "아이디를 입력해주세요.");
        return;
      }

      if (!trimmedEmail) {
        Alert.alert("비밀번호 찾기", "이메일을 입력해주세요.");
        return;
      }

      if (!isValidEmail(trimmedEmail)) {
        Alert.alert("비밀번호 찾기", "올바른 이메일 형식을 입력해주세요.");
        return;
      }

      if (!newPassword.trim()) {
        Alert.alert("비밀번호 찾기", "새 비밀번호를 입력해주세요.");
        return;
      }

      if (!newPasswordConfirm.trim()) {
        Alert.alert("비밀번호 찾기", "새 비밀번호 확인을 입력해주세요.");
        return;
      }

      if (newPassword.length < 8) {
        Alert.alert("비밀번호 찾기", "새 비밀번호는 8자 이상이어야 합니다.");
        return;
      }

      if (newPassword !== newPasswordConfirm) {
        Alert.alert(
          "비밀번호 찾기",
          "새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.",
        );
        return;
      }

      const savedUsers = await AsyncStorage.getItem("users");
      const users: User[] = savedUsers ? JSON.parse(savedUsers) : [];

      const targetIndex = users.findIndex(
        (user) =>
          user.id.toLowerCase() === trimmedId.toLowerCase() &&
          user.email.toLowerCase() === trimmedEmail,
      );

      if (targetIndex === -1) {
        Alert.alert("비밀번호 찾기", "일치하는 회원정보가 없습니다.");
        return;
      }

      users[targetIndex].password = newPassword;
      await AsyncStorage.setItem("users", JSON.stringify(users));

      await AsyncStorage.removeItem("loggedInUser");

      Alert.alert(
        "비밀번호 재설정 완료",
        "비밀번호가 변경되었습니다. 다시 로그인해주세요.",
        [
          {
            text: "확인",
            onPress: () => router.replace("/" as any),
          },
        ],
      );
    } catch (error) {
      console.log(error);
      Alert.alert("오류", "비밀번호 재설정 중 문제가 발생했습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>비밀번호 찾기</Text>

          <TextInput
            style={styles.input}
            placeholder="아이디"
            placeholderTextColor="#777"
            value={id}
            onChangeText={setId}
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="이메일"
            placeholderTextColor="#777"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TextInput
            style={styles.input}
            placeholder="새 비밀번호 (8자 이상)"
            placeholderTextColor="#777"
            value={newPassword}
            onChangeText={setNewPassword}
            secureTextEntry
          />

          <TextInput
            style={styles.input}
            placeholder="새 비밀번호 확인"
            placeholderTextColor="#777"
            value={newPasswordConfirm}
            onChangeText={setNewPasswordConfirm}
            secureTextEntry
          />

          <TouchableOpacity style={styles.button} onPress={handleResetPassword}>
            <Text style={styles.buttonText}>비밀번호 재설정</Text>
          </TouchableOpacity>
        </ScrollView>
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
  container: {
    paddingHorizontal: 24,
    paddingTop: 120,
    paddingBottom: 40,
  },
  title: {
    fontSize: 30,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 46,
  },
  input: {
    width: "100%",
    height: 60,
    borderWidth: 1.5,
    borderColor: "#B6CEC4",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#222",
    marginBottom: 18,
  },
  button: {
    width: "100%",
    height: 64,
    borderRadius: 20,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 20,
    fontFamily: "NanumB",
  },
});
