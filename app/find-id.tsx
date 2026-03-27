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

export default function FindIdScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  const handleFindId = async () => {
    try {
      const trimmedEmail = email.trim().toLowerCase();

      if (!trimmedEmail) {
        Alert.alert("아이디 찾기", "이메일을 입력해주세요.");
        return;
      }

      if (!isValidEmail(trimmedEmail)) {
        Alert.alert("아이디 찾기", "올바른 이메일 형식을 입력해주세요.");
        return;
      }

      const savedUsers = await AsyncStorage.getItem("users");
      const users: User[] = savedUsers ? JSON.parse(savedUsers) : [];

      const foundUser = users.find(
        (user) => user.email.toLowerCase() === trimmedEmail,
      );

      if (!foundUser) {
        Alert.alert("아이디 찾기", "일치하는 회원정보가 없습니다.");
        return;
      }

      Alert.alert("아이디 찾기 결과", `가입된 아이디: ${foundUser.id}`, [
        {
          text: "OK",
          onPress: () => router.replace("/" as any),
        },
      ]);
    } catch (error) {
      console.log(error);
      Alert.alert("오류", "아이디 찾기 중 문제가 발생했습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={styles.title}>아이디 찾기</Text>

        <TextInput
          style={styles.input}
          placeholder="이메일"
          placeholderTextColor="#777"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TouchableOpacity style={styles.button} onPress={handleFindId}>
          <Text style={styles.buttonText}>아이디 찾기</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F6F7F4",
    padding: 24,
    paddingTop: 120,
  },
  flex: {
    flex: 1,
  },
  title: {
    fontSize: 30,
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 46,
    fontFamily: "NanumB",
  },
  input: {
    height: 60,
    borderWidth: 1.5,
    borderColor: "#B6CEC4",
    backgroundColor: "#FFF",
    borderRadius: 18,
    paddingHorizontal: 16,
    marginBottom: 18,
    fontSize: 16,
    color: "#222",
    fontFamily: "Nanum",
  },
  button: {
    height: 64,
    borderRadius: 20,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    color: "#FFF",
    fontSize: 20,
    fontFamily: "NanumB",
  },
});
