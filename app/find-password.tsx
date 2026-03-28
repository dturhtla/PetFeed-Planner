import { Ionicons } from "@expo/vector-icons";
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
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type User = {
  id: string;
  email: string;
  password: string;
};

type FieldErrors = {
  id?: string;
  email?: string;
  newPassword?: string;
  newPasswordConfirm?: string;
};

const BOX_HEIGHT = 60;

const isValidEmail = (value: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const hasAllowedPasswordChars = (value: string) => {
  return /^[a-zA-Z0-9!@#$%^&*()_+=[\]{};':"\\|,.<>/?-]*$/.test(value);
};

const validateNewPassword = (value: string) => {
  if (!value) {
    return "새 비밀번호를 입력해주세요.";
  }

  if (!hasAllowedPasswordChars(value)) {
    return "영문, 숫자, 특수문자만 입력 가능합니다.";
  }

  if (value.length < 8) {
    return "새 비밀번호는 8자 이상이어야 합니다.";
  }

  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return "새 비밀번호는 영문과 숫자를 모두 포함해야 합니다.";
  }

  return undefined;
};

const validateNewPasswordConfirm = (
  passwordValue: string,
  confirmValue: string,
) => {
  if (!confirmValue) {
    return "새 비밀번호 확인을 입력해주세요.";
  }

  if (passwordValue !== confirmValue) {
    return "비밀번호가 일치하지 않습니다.";
  }

  return undefined;
};

export default function FindPasswordScreen() {
  const router = useRouter();

  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showNewPasswordConfirm, setShowNewPasswordConfirm] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const handleIdChange = (text: string) => {
    setId(text);

    if (!text.trim()) {
      setErrors((prev) => ({
        ...prev,
        id: undefined,
      }));
      return;
    }

    setErrors((prev) => ({
      ...prev,
      id: undefined,
    }));
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);

    const trimmed = text.trim().toLowerCase();

    if (!trimmed) {
      setErrors((prev) => ({
        ...prev,
        email: undefined,
      }));
      return;
    }

    if (!isValidEmail(trimmed)) {
      setErrors((prev) => ({
        ...prev,
        email: "올바른 이메일 형식을 입력해주세요.",
      }));
      return;
    }

    setErrors((prev) => ({
      ...prev,
      email: undefined,
    }));
  };

  const handleNewPasswordChange = (text: string) => {
    const filtered = text.replace(
      /[^a-zA-Z0-9!@#$%^&*()_+=[\]{};':"\\|,.<>/?-]/g,
      "",
    );

    setNewPassword(filtered);

    if (text !== filtered) {
      setErrors((prev) => ({
        ...prev,
        newPassword: "영문, 숫자, 특수문자만 입력 가능합니다.",
      }));
      return;
    }

    const passwordError = validateNewPassword(filtered);
    const confirmError = validateNewPasswordConfirm(
      filtered,
      newPasswordConfirm,
    );

    setErrors((prev) => ({
      ...prev,
      newPassword: passwordError,
      newPasswordConfirm: newPasswordConfirm
        ? confirmError
        : prev.newPasswordConfirm,
    }));
  };

  const handleNewPasswordConfirmChange = (text: string) => {
    const filtered = text.replace(
      /[^a-zA-Z0-9!@#$%^&*()_+=[\]{};':"\\|,.<>/?-]/g,
      "",
    );

    setNewPasswordConfirm(filtered);

    if (text !== filtered) {
      setErrors((prev) => ({
        ...prev,
        newPasswordConfirm: "영문, 숫자, 특수문자만 입력 가능합니다.",
      }));
      return;
    }

    const confirmError = validateNewPasswordConfirm(newPassword, filtered);

    setErrors((prev) => ({
      ...prev,
      newPasswordConfirm: confirmError,
    }));
  };

  const validateFields = () => {
    const trimmedId = id.trim();
    const trimmedEmail = email.trim().toLowerCase();

    const newErrors: FieldErrors = {};

    if (!trimmedId) {
      newErrors.id = "아이디를 입력해주세요.";
    }

    if (!trimmedEmail) {
      newErrors.email = "이메일을 입력해주세요.";
    } else if (!isValidEmail(trimmedEmail)) {
      newErrors.email = "올바른 이메일 형식을 입력해주세요.";
    }

    newErrors.newPassword = validateNewPassword(newPassword);
    newErrors.newPasswordConfirm = validateNewPasswordConfirm(
      newPassword,
      newPasswordConfirm,
    );

    setErrors(newErrors);

    return !Object.values(newErrors).some(Boolean);
  };

  const handleResetPassword = async () => {
    try {
      const trimmedId = id.trim();
      const trimmedEmail = email.trim().toLowerCase();

      if (!validateFields()) {
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

      if (users[targetIndex].password === newPassword) {
        Alert.alert("비밀번호 찾기", "이전에 사용하던 비밀번호와 동일합니다.");
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
            style={[styles.input, errors.id && styles.inputErrorBorder]}
            placeholder="아이디"
            placeholderTextColor="#777"
            value={id}
            onChangeText={handleIdChange}
            autoCapitalize="none"
          />
          {errors.id ? <Text style={styles.errorText}>{errors.id}</Text> : null}

          <TextInput
            style={[styles.input, errors.email && styles.inputErrorBorder]}
            placeholder="이메일"
            placeholderTextColor="#777"
            value={email}
            onChangeText={handleEmailChange}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          {errors.email ? (
            <Text style={styles.errorText}>{errors.email}</Text>
          ) : null}

          <View
            style={[
              styles.passwordWrapper,
              errors.newPassword && styles.inputErrorBorder,
            ]}
          >
            <TextInput
              style={styles.passwordInput}
              placeholder="새 비밀번호 (8자 이상)"
              placeholderTextColor="#777"
              value={newPassword}
              onChangeText={handleNewPasswordChange}
              secureTextEntry={!showNewPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowNewPassword((prev) => !prev)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showNewPassword ? "eye-off" : "eye"}
                size={22}
                color="#666"
              />
            </TouchableOpacity>
          </View>
          {errors.newPassword ? (
            <Text style={styles.errorText}>{errors.newPassword}</Text>
          ) : null}

          <View
            style={[
              styles.passwordWrapper,
              errors.newPasswordConfirm && styles.inputErrorBorder,
            ]}
          >
            <TextInput
              style={styles.passwordInput}
              placeholder="새 비밀번호 확인"
              placeholderTextColor="#777"
              value={newPasswordConfirm}
              onChangeText={handleNewPasswordConfirmChange}
              secureTextEntry={!showNewPasswordConfirm}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowNewPasswordConfirm((prev) => !prev)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showNewPasswordConfirm ? "eye-off" : "eye"}
                size={22}
                color="#666"
              />
            </TouchableOpacity>
          </View>
          {errors.newPasswordConfirm ? (
            <Text style={styles.errorText}>{errors.newPasswordConfirm}</Text>
          ) : null}

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
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#B6CEC4",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#222",
    marginBottom: 6,
  },
  passwordWrapper: {
    width: "100%",
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#B6CEC4",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  passwordInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#222",
  },
  eyeButton: {
    paddingLeft: 12,
  },
  button: {
    width: "100%",
    height: BOX_HEIGHT,
    borderRadius: 18,
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
  errorText: {
    color: "#D64545",
    fontSize: 13,
    fontFamily: "Nanum",
    marginTop: 2,
    marginBottom: 10,
    paddingLeft: 4,
  },
  inputErrorBorder: {
    borderColor: "#D64545",
  },
});
