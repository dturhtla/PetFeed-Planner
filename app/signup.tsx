import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
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

const GO_SERVER_URL =
  "https://preirrigational-concha-prealphabetically.ngrok-free.dev";

type User = {
  id: string; // 로그인 아이디
  email: string;
  password: string;
  serverUserId?: number; // 서버 DB user_id
};

type FieldErrors = {
  id?: string;
  email?: string;
  password?: string;
  passwordConfirm?: string;
};

const BOX_HEIGHT = 60;

const isValidEmail = (value: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const isValidId = (value: string) => {
  const hasOnlyLettersAndNumbers = /^[a-zA-Z0-9]+$/.test(value);
  const hasLetter = /[a-zA-Z]/.test(value);
  const hasNumber = /[0-9]/.test(value);

  return hasOnlyLettersAndNumbers && hasLetter && hasNumber;
};

const hasAllowedPasswordChars = (value: string) => {
  return /^[a-zA-Z0-9!@#$%^&*()_+=[\]{};':"\\|,.<>/?-]*$/.test(value);
};

export default function SignupScreen() {
  const router = useRouter();

  const [id, setId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [users, setUsers] = useState<User[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const savedUsers = await AsyncStorage.getItem("users");
        const parsedUsers: User[] = savedUsers ? JSON.parse(savedUsers) : [];
        setUsers(parsedUsers);
      } catch (error) {
        console.log(error);
      }
    };

    loadUsers();
  }, []);

  const validateIdInput = (value: string) => {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return "아이디를 입력해주세요.";
    }

    if (trimmedValue.length < 4 || trimmedValue.length > 20) {
      return "아이디는 4~20자로 입력해주세요.";
    }

    if (!isValidId(trimmedValue)) {
      return "아이디는 영문과 숫자를 모두 포함해야 합니다.";
    }

    const idExists = users.some(
      (user) => user.id.toLowerCase() === trimmedValue.toLowerCase(),
    );

    if (idExists) {
      return "이미 사용 중인 아이디입니다.";
    }

    return undefined;
  };

  const validateEmailInput = (value: string) => {
    const trimmedValue = value.trim().toLowerCase();

    if (!trimmedValue) {
      return "이메일을 입력해주세요.";
    }

    if (!isValidEmail(trimmedValue)) {
      return "올바른 이메일 형식을 입력해주세요.";
    }

    const emailExists = users.some(
      (user) => user.email.toLowerCase() === trimmedValue,
    );

    if (emailExists) {
      return "이미 사용 중인 이메일입니다.";
    }

    return undefined;
  };

  const validatePasswordInput = (value: string) => {
    if (!value) {
      return "비밀번호를 입력해주세요.";
    }

    if (!hasAllowedPasswordChars(value)) {
      return "영문, 숫자, 특수문자만 입력 가능합니다.";
    }

    if (value.length < 8) {
      return "비밀번호는 8자 이상이어야 합니다.";
    }

    if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
      return "비밀번호는 영문과 숫자를 모두 포함해야 합니다.";
    }

    return undefined;
  };

  const validatePasswordConfirmInput = (
    passwordValue: string,
    confirmValue: string,
  ) => {
    if (!confirmValue) {
      return "비밀번호 확인을 입력해주세요.";
    }

    if (passwordValue !== confirmValue) {
      return "비밀번호 확인이 일치하지 않습니다.";
    }

    return undefined;
  };

  const isFormValid =
    !validateIdInput(id) &&
    !validateEmailInput(email) &&
    !validatePasswordInput(password) &&
    !validatePasswordConfirmInput(password, passwordConfirm);

  const handleIdChange = (text: string) => {
    const filtered = text.replace(/[^a-zA-Z0-9]/g, "");
    setId(filtered);

    if (text !== filtered) {
      setErrors((prev) => ({
        ...prev,
        id: "영어와 숫자만 입력 가능합니다.",
      }));
      return;
    }

    const idError = validateIdInput(filtered);

    setErrors((prev) => ({
      ...prev,
      id: idError,
    }));
  };

  const handleEmailChange = (text: string) => {
    setEmail(text);

    const emailError = validateEmailInput(text);

    setErrors((prev) => ({
      ...prev,
      email: emailError,
    }));
  };

  const handlePasswordChange = (text: string) => {
    const filtered = text.replace(
      /[^a-zA-Z0-9!@#$%^&*()_+=[\]{};':"\\|,.<>/?-]/g,
      "",
    );

    setPassword(filtered);

    if (text !== filtered) {
      setErrors((prev) => ({
        ...prev,
        password: "영문, 숫자, 특수문자만 입력 가능합니다.",
      }));
      return;
    }

    const passwordError = validatePasswordInput(filtered);
    const passwordConfirmError = validatePasswordConfirmInput(
      filtered,
      passwordConfirm,
    );

    setErrors((prev) => ({
      ...prev,
      password: passwordError,
      passwordConfirm: passwordConfirm
        ? passwordConfirmError
        : prev.passwordConfirm,
    }));
  };

  const handlePasswordConfirmChange = (text: string) => {
    const filtered = text.replace(
      /[^a-zA-Z0-9!@#$%^&*()_+=[\]{};':"\\|,.<>/?-]/g,
      "",
    );

    setPasswordConfirm(filtered);

    if (text !== filtered) {
      setErrors((prev) => ({
        ...prev,
        passwordConfirm: "영문, 숫자, 특수문자만 입력 가능합니다.",
      }));
      return;
    }

    const passwordConfirmError = validatePasswordConfirmInput(
      password,
      filtered,
    );

    setErrors((prev) => ({
      ...prev,
      passwordConfirm: passwordConfirmError,
    }));
  };

  const validateFields = () => {
    const trimmedId = id.trim();
    const trimmedEmail = email.trim().toLowerCase();

    const newErrors: FieldErrors = {
      id: validateIdInput(trimmedId),
      email: validateEmailInput(trimmedEmail),
      password: validatePasswordInput(password),
      passwordConfirm: validatePasswordConfirmInput(password, passwordConfirm),
    };

    setErrors(newErrors);

    const hasError = Object.values(newErrors).some((value) => !!value);
    return !hasError;
  };

  const handleSignup = async () => {
    try {
      const trimmedId = id.trim();
      const trimmedEmail = email.trim().toLowerCase();

      if (!validateFields()) {
        return;
      }

      // Go 서버에 회원가입 요청
      const registerResponse = await fetch(
        `${GO_SERVER_URL}/api/v1/auth/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({
            email: trimmedEmail,
            password,
          }),
        },
      );

      console.log("회원가입 응답 상태:", registerResponse.status);

      const responseText = await registerResponse.text();
      console.log("회원가입 응답 text:", responseText);

      const serverUser = responseText ? JSON.parse(responseText) : null;

      if (!registerResponse.ok) {
        console.log("회원가입 실패:", responseText);
        Alert.alert("오류", responseText);
        return;
      }

      const serverUserId =
        serverUser?.id ??
        serverUser?.user_id ??
        serverUser?.userId ??
        serverUser?.data?.id ??
        serverUser?.data?.user_id;

      if (!serverUserId) {
        Alert.alert("회원가입 실패", "서버 사용자 ID를 받을 수 없습니다.");
        return;
      }

      const newUser: User = {
        id: trimmedId,
        email: trimmedEmail,
        password,
        serverUserId: Number(serverUserId),
      };

      // 로컬에 저장
      const savedUsers = await AsyncStorage.getItem("users");
      const parsedUsers: User[] = savedUsers ? JSON.parse(savedUsers) : [];
      const updatedUsers = [...parsedUsers, newUser];
      await AsyncStorage.setItem("users", JSON.stringify(updatedUsers));

      // 서버 user_id를 loggedInUser에 저장
      await AsyncStorage.setItem(
        "loggedInUser",
        JSON.stringify({
          id: trimmedId,
          email: trimmedEmail,
          password,
          serverUserId: Number(serverUserId),
        }),
      );

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
            style={[styles.input, errors.id && styles.inputErrorBorder]}
            placeholder="아이디"
            placeholderTextColor="#777"
            value={id}
            onChangeText={handleIdChange}
            autoCapitalize="none"
            maxLength={20}
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
              errors.password && styles.inputErrorBorder,
            ]}
          >
            <TextInput
              style={styles.passwordInput}
              placeholder="비밀번호 (8자 이상)"
              placeholderTextColor="#777"
              value={password}
              onChangeText={handlePasswordChange}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
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
          {errors.password ? (
            <Text style={styles.errorText}>{errors.password}</Text>
          ) : null}

          <View
            style={[
              styles.passwordWrapper,
              errors.passwordConfirm && styles.inputErrorBorder,
            ]}
          >
            <TextInput
              style={styles.passwordInput}
              placeholder="비밀번호 확인"
              placeholderTextColor="#777"
              value={passwordConfirm}
              onChangeText={handlePasswordConfirmChange}
              secureTextEntry={!showPasswordConfirm}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={() => setShowPasswordConfirm((prev) => !prev)}
              style={styles.eyeButton}
            >
              <Ionicons
                name={showPasswordConfirm ? "eye-off" : "eye"}
                size={22}
                color="#666"
              />
            </TouchableOpacity>
          </View>
          {errors.passwordConfirm ? (
            <Text style={styles.errorText}>{errors.passwordConfirm}</Text>
          ) : null}

          <TouchableOpacity
            style={[styles.button, !isFormValid && styles.buttonDisabled]}
            onPress={handleSignup}
            disabled={!isFormValid}
          >
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
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 6,
    fontSize: 16,
    color: "#222",
    fontFamily: "Nanum",
  },
  passwordWrapper: {
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    backgroundColor: "#FFF",
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 6,
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
    paddingVertical: 4,
  },
  button: {
    height: BOX_HEIGHT,
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
  buttonDisabled: {
    backgroundColor: "#C9C9C9",
  },
});
