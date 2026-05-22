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

const GO_SERVER_URL = process.env.EXPO_PUBLIC_GO_SERVER_URL;

type LoginResponse = {
  id?: number;
  user_id?: number;
  userId?: number;
  email?: string;
  user?: {
    id?: number;
    user_id?: number;
    userId?: number;
    email?: string;
  };
  data?: {
    id?: number;
    user_id?: number;
    userId?: number;
    email?: string;
  };
};

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const isFormValid = email.trim() && password.trim();

  const handleLogin = async () => {
    try {
      const trimmedEmail = email.trim().toLowerCase();

      if (!trimmedEmail) {
        Alert.alert("로그인 실패", "이메일을 입력해주세요.");
        return;
      }

      if (!password.trim()) {
        Alert.alert("로그인 실패", "비밀번호를 입력해주세요.");
        return;
      }

      if (!GO_SERVER_URL) {
        Alert.alert("오류", "서버 주소가 설정되지 않았습니다.");
        return;
      }

      const response = await fetch(`${GO_SERVER_URL}/api/v1/users/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
        }),
      });

      const responseText = await response.text();

      console.log("로그인 응답 원본:", responseText);

      if (!response.ok) {
        Alert.alert(
          "로그인 실패",
          responseText || "이메일 또는 비밀번호가 올바르지 않습니다.",
        );
        return;
      }

      let loginResult: LoginResponse | null = null;

      try {
        loginResult = responseText ? JSON.parse(responseText) : null;
      } catch {
        Alert.alert("오류", "서버 응답을 처리하지 못했습니다.");
        return;
      }

      const serverUserId =
        loginResult?.user?.user_id ??
        loginResult?.user?.id ??
        loginResult?.user?.userId ??
        loginResult?.user_id ??
        loginResult?.id ??
        loginResult?.userId ??
        loginResult?.data?.user_id ??
        loginResult?.data?.id ??
        loginResult?.data?.userId;

      if (!serverUserId) {
        Alert.alert("로그인 실패", "서버 사용자 ID를 받을 수 없습니다.");
        return;
      }

      await AsyncStorage.setItem(
        storageKeys.loggedInUser,
        JSON.stringify({
          email: trimmedEmail,
          serverUserId: Number(serverUserId),
        }),
      );

      const completed = await AsyncStorage.getItem(
        storageKeys.profileCompleted(trimmedEmail),
      );

      if (completed === "true") {
        router.replace("/home" as any);
      } else {
        router.replace("/profile" as any);
      }
    } catch (error) {
      console.log(error);
      Alert.alert("오류", "로그인 중 문제가 발생했습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.logo}>PetFeed Planner</Text>

          <TextInput
            style={styles.input}
            placeholder="이메일"
            placeholderTextColor="#777"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              placeholder="비밀번호"
              placeholderTextColor="#777"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((prev) => !prev)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showPassword ? "eye-off" : "eye"}
                size={22}
                color="#666"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginButton, !isFormValid && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={!isFormValid}
          >
            <Text style={styles.loginButtonText}>로그인</Text>
          </TouchableOpacity>

          <View style={styles.linkContainer}>
            <View style={styles.topLinkRow}>
              <TouchableOpacity onPress={() => router.push("/signup" as any)}>
                <Text style={styles.linkText}>회원가입</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.bottomLinkRow}>
              <TouchableOpacity
                onPress={() => router.push("/find-password" as any)}
              >
                <Text style={styles.linkText}>비밀번호 찾기</Text>
              </TouchableOpacity>
            </View>
          </View>
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
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logo: {
    fontSize: 34,
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 40,
    fontFamily: "KCC",
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    backgroundColor: "#FFF",
    borderRadius: 20,
    paddingHorizontal: 16,
    marginBottom: 14,
    fontSize: 16,
    color: "#222",
    fontFamily: "Nanum",
  },
  passwordWrapper: {
    height: 56,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    backgroundColor: "#FFF",
    borderRadius: 20,
    paddingHorizontal: 16,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    color: "#222",
    fontFamily: "Nanum",
  },
  eyeButton: {
    paddingLeft: 12,
  },
  loginButton: {
    height: 56,
    borderRadius: 20,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 26,
  },
  loginButtonText: {
    color: "#FFF",
    fontSize: 20,
    fontFamily: "NanumB",
  },
  linkContainer: {
    alignItems: "center",
  },
  topLinkRow: {
    alignItems: "center",
    marginBottom: 18,
  },
  bottomLinkRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "center",
    gap: 48,
  },
  linkText: {
    color: "#2F6B57",
    fontSize: 16,
    fontFamily: "Nanum",
    textDecorationLine: "underline",
  },
  buttonDisabled: {
    backgroundColor: "#C9C9C9",
  },
});
