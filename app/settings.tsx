import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert("로그아웃", "정말 로그아웃하시겠습니까?", [
      {
        text: "취소",
        style: "cancel",
      },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.removeItem("loggedInUser");

            router.replace("/" as any); // 바로 이동
          } catch (error) {
            console.log(error);
            Alert.alert("오류", "로그아웃 중 문제가 발생했습니다.");
          }
        },
      },
    ]);
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

        <Text style={styles.headerTitle}>설정</Text>

        <View style={{ width: 24 }} />
      </View>

      <View style={styles.line} />

      <View style={styles.container}>
        <TouchableOpacity style={styles.menuButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={22} color="#2F6B57" />
          <Text style={styles.menuText}>로그아웃</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.menuButton, styles.deleteButton]}
          onPress={() => router.push("/delete-account" as any)}
        >
          <Ionicons name="person-remove-outline" size={22} color="#C24848" />
          <Text style={styles.deleteText}>탈퇴하기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F6F7F4",
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
    paddingTop: 32,
    gap: 16,
  },
  menuButton: {
    width: "100%",
    height: 64,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 10,
  },
  menuText: {
    fontSize: 18,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
  deleteButton: {
    borderColor: "#E3B5B5",
  },
  deleteText: {
    fontSize: 18,
    fontFamily: "Nanum",
    color: "#C24848",
  },
});
