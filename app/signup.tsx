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

export default function SignupScreen() {
  const router = useRouter();

  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  const handleSignup = async () => {
    try {
      const trimmedId = id.trim();
      const trimmedEmail = email.trim().toLowerCase();

      if (!trimmedId) {
        Alert.alert("회원가입 실패", "아이디를 입력해주세요.");
        return;
      }

      if (!trimmedEmail) {
        Alert.alert("회원가입 실패", "이메일을 입력해주세요.");
        return;
      }

      if (!isValidEmail(trimmedEmail)) {
        Alert.alert("회원가입 실패", "올바른 이메일 형식을 입력해주세요.");
        return;
      }

      if (!password) {
        Alert.alert("회원가입 실패", "비밀번호를 입력해주세요.");
        return;
      }

      if (password.length < 8) {
        Alert.alert("회원가입 실패", "비밀번호는 8자 이상이어야 합니다.");
        return;
      }

      if (password !== passwordConfirm) {
        Alert.alert("회원가입 실패", "비밀번호 확인이 일치하지 않습니다.");
        return;
      }

      const savedUsers = await AsyncStorage.getItem("users");
      const users: User[] = savedUsers ? JSON.parse(savedUsers) : [];

      const idExists = users.some(
        (user) => user.id.toLowerCase() === trimmedId.toLowerCase(),
      );

      if (idExists) {
        Alert.alert("회원가입 실패", "이미 사용 중인 아이디입니다.");
        return;
      }

      const emailExists = users.some(
        (user) => user.email.toLowerCase() === trimmedEmail,
      );

      if (emailExists) {
        Alert.alert("회원가입 실패", "이미 사용 중인 이메일입니다.");
        return;
      }

      const newUser: User = {
        id: trimmedId,
        email: trimmedEmail,
        password,
      };

      const updatedUsers = [...users, newUser];
      await AsyncStorage.setItem("users", JSON.stringify(updatedUsers));

      Alert.alert("회원가입 완료", "회원가입이 완료되었습니다.", [
        {
          text: "확인",
          onPress: () => router.replace("/" as any),
        },
      ]);
    } catch (error) {
      console.log(error);
      Alert.alert("오류", "회원가입 중 문제가 발생했습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.title}>회원가입</Text>

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
            placeholder="비밀번호 (8자 이상)"
            placeholderTextColor="#777"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TextInput
            style={styles.input}
            placeholder="비밀번호 확인"
            placeholderTextColor="#777"
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            secureTextEntry
          />

          <TouchableOpacity style={styles.button} onPress={handleSignup}>
            <Text style={styles.buttonText}>회원가입 완료</Text>
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
    padding: 24,
    paddingTop: 80,
  },
  title: {
    fontSize: 26,
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 28,
    fontFamily: "NanumB",
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 14,
    fontSize: 16,
    color: "#222",
    fontFamily: "Nanum",
  },
  button: {
    height: 56,
    borderRadius: 16,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 18,
    fontFamily: "NanumB",
  },
});
