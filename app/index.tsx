import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function IndexScreen() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [gender, setGender] = useState("");
  const [petType, setPetType] = useState("");

  const handleNext = async () => {
    if (!name || !age || !weight || !gender || !petType) {
      alert("모든 정보를 입력하거나 선택해주세요!");
      return;
    }

    await AsyncStorage.setItem(
      "petProfile",
      JSON.stringify({
        name,
        age,
        weight,
        gender,
        petType,
      }),
    );

    router.push("/bcs-check" as any);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>프로필 입력</Text>

        <TextInput
          placeholder="이름"
          placeholderTextColor="#777"
          style={styles.input}
          value={name}
          onChangeText={setName}
        />

        <TextInput
          placeholder="나이"
          placeholderTextColor="#777"
          style={styles.input}
          value={age}
          onChangeText={setAge}
          keyboardType="numeric"
        />

        <TextInput
          placeholder="몸무게"
          placeholderTextColor="#777"
          style={styles.input}
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
        />

        <Text style={styles.sectionLabel}>성별</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[
              styles.selectButton,
              gender === "남" && styles.selectedButton,
            ]}
            onPress={() => setGender("남")}
          >
            <Text
              style={[
                styles.selectText,
                gender === "남" && styles.selectedText,
              ]}
            >
              남
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.selectButton,
              gender === "여" && styles.selectedButton,
            ]}
            onPress={() => setGender("여")}
          >
            <Text
              style={[
                styles.selectText,
                gender === "여" && styles.selectedText,
              ]}
            >
              여
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>종</Text>
        <View style={styles.row}>
          <TouchableOpacity
            style={[
              styles.selectButton,
              petType === "강아지" && styles.selectedButton,
            ]}
            onPress={() => setPetType("강아지")}
          >
            <Text
              style={[
                styles.selectText,
                petType === "강아지" && styles.selectedText,
              ]}
            >
              강아지
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.selectButton,
              petType === "고양이" && styles.selectedButton,
            ]}
            onPress={() => setPetType("고양이")}
          >
            <Text
              style={[
                styles.selectText,
                petType === "고양이" && styles.selectedText,
              ]}
            >
              고양이
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleNext}>
          <Text style={styles.buttonText}>NEXT</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const BOX_HEIGHT = 68;

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F6F7F4",
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: 28,
    marginBottom: 30,
    textAlign: "center",
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  input: {
    width: "100%",
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 18,
    marginBottom: 14,
    paddingHorizontal: 18,
    backgroundColor: "#FFFFFF",
    fontSize: 17,
    fontFamily: "Nanum",
    color: "#222",
  },
  sectionLabel: {
    width: "100%",
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#2F6B57",
    marginBottom: 8,
    marginTop: 4,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  selectButton: {
    flex: 1,
    height: 60,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  selectedButton: {
    backgroundColor: "#2F6B57",
    borderColor: "#2F6B57",
  },
  selectText: {
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
  selectedText: {
    color: "#FFFFFF",
  },
  button: {
    width: "100%",
    height: BOX_HEIGHT,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 18,
    marginTop: 8,
  },
  buttonText: {
    color: "#fff",
    fontSize: 20,
    fontFamily: "Nanum",
  },
});
