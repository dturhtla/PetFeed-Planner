import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const show = (msg: string) => {
  ToastAndroid.show(msg, ToastAndroid.SHORT);
};

export default function ProfileScreen() {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [petType, setPetType] = useState("");

  const isFormValid =
    name.trim() !== "" &&
    age.trim() !== "" &&
    !isNaN(Number(age)) &&
    Number(age) > 0 &&
    weight.trim() !== "" &&
    !isNaN(Number(weight)) &&
    Number(weight) > 0 &&
    (petType.trim() === "강아지" || petType.trim() === "고양이");

  const handleSaveProfile = async () => {
    if (!name.trim()) {
      Alert.alert("알림", "이름을 입력해주세요.");
      return;
    }

    if (!age.trim() || isNaN(Number(age)) || Number(age) <= 0) {
      Alert.alert("알림", "나이를 올바르게 입력해주세요.");
      return;
    }

    if (!weight.trim() || isNaN(Number(weight)) || Number(weight) <= 0) {
      Alert.alert("알림", "체중을 올바르게 입력해주세요.");
      return;
    }

    if (petType.trim() !== "강아지" && petType.trim() !== "고양이") {
      Alert.alert("알림", "종류는 강아지 또는 고양이로 입력해주세요.");
      return;
    }

    try {
      const savedUser = await AsyncStorage.getItem("loggedInUser");
      const parsedUser = savedUser ? JSON.parse(savedUser) : null;

      if (!parsedUser?.email) {
        Alert.alert("오류", "로그인 정보가 없습니다.");
        return;
      }

      const email = parsedUser.email;

      const profile = {
        id: `${Date.now()}`,
        name: name.trim(),
        age: age.trim(),
        weight: weight.trim(),
        petType: petType.trim(),
      };

      const profilesKey = `petProfiles_${email}`;
      const savedProfiles = await AsyncStorage.getItem(profilesKey);
      const parsedProfiles = savedProfiles ? JSON.parse(savedProfiles) : [];

      const updatedProfiles = Array.isArray(parsedProfiles)
        ? [...parsedProfiles, profile]
        : [profile];

      await AsyncStorage.setItem(profilesKey, JSON.stringify(updatedProfiles));
      await AsyncStorage.setItem(`profileCompleted_${email}`, "true");

      show("프로필이 저장되었습니다.");

      setTimeout(() => {
        router.replace("/profile-complete" as any);
      }, 500);
    } catch (error) {
      console.log("handleSaveProfile error:", error);
      Alert.alert("오류", "프로필 저장 중 문제가 발생했습니다.");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>프로필</Text>

        <View style={styles.avatar} />

        <TextInput
          placeholder="이름"
          style={styles.input}
          value={name}
          onChangeText={setName}
        />

        <TextInput
          placeholder="나이"
          style={styles.input}
          value={age}
          onChangeText={(text) => setAge(text.replace(/[^0-9]/g, ""))}
          keyboardType="numeric"
        />

        <TextInput
          placeholder="체중(kg)"
          style={styles.input}
          value={weight}
          onChangeText={(text) => setWeight(text.replace(/[^0-9.]/g, ""))}
          keyboardType="numeric"
        />

        <TextInput
          placeholder="종류(강아지/고양이)"
          style={styles.input}
          value={petType}
          onChangeText={setPetType}
        />

        <TouchableOpacity
          style={[styles.button, !isFormValid && styles.buttonDisabled]}
          onPress={handleSaveProfile}
          disabled={!isFormValid}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>저장</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F7F4" },
  container: { flex: 1, padding: 24, alignItems: "center" },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2F6B57",
    marginBottom: 28,
  },
  avatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: "#DCE8E2",
    marginBottom: 24,
  },
  input: {
    width: "100%",
    height: 48,
    borderWidth: 1,
    borderColor: "#B8CEC4",
    borderRadius: 12,
    backgroundColor: "#FFF",
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  button: {
    width: "100%",
    height: 50,
    backgroundColor: "#2F6B57",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: "#C9C9C9",
  },
  buttonText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
