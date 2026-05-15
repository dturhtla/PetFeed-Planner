import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { storageKeys } from "../utils/storageKeys";

export default function SettingsScreen() {
  const router = useRouter();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSound = await AsyncStorage.getItem(
          storageKeys.feedingNotificationSoundEnabled,
        );

        const savedVibration = await AsyncStorage.getItem(
          storageKeys.feedingNotificationVibrationEnabled,
        );

        if (savedSound !== null) {
          setSoundEnabled(savedSound === "true");
        }

        if (savedVibration !== null) {
          setVibrationEnabled(savedVibration === "true");
        }
      } catch (error) {
        console.log(error);
      }
    };

    loadSettings();
  }, []);

  const toggleSound = async (value: boolean) => {
    try {
      setSoundEnabled(value);

      await AsyncStorage.setItem(
        storageKeys.feedingNotificationSoundEnabled,
        String(value),
      );
    } catch (error) {
      console.log(error);
    }
  };

  const toggleVibration = async (value: boolean) => {
    try {
      setVibrationEnabled(value);

      await AsyncStorage.setItem(
        storageKeys.feedingNotificationVibrationEnabled,
        String(value),
      );
    } catch (error) {
      console.log(error);
    }
  };

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
        <View style={styles.settingCard}>
          <Text style={styles.settingTitle}>알림 설정</Text>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>급여 알림 소리</Text>

            <Switch
              value={soundEnabled}
              onValueChange={toggleSound}
              trackColor={{ false: "#D9D9D9", true: "#8DB7A3" }}
              thumbColor={soundEnabled ? "#2F6B57" : "#F4F3F4"}
            />
          </View>

          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>급여 알림 진동</Text>

            <Switch
              value={vibrationEnabled}
              onValueChange={toggleVibration}
              trackColor={{ false: "#D9D9D9", true: "#8DB7A3" }}
              thumbColor={vibrationEnabled ? "#2F6B57" : "#F4F3F4"}
            />
          </View>
        </View>

        <TouchableOpacity
          style={styles.menuButton}
          onPress={() =>
            Alert.alert(
              "안내",
              "비밀번호 변경 기능은 서버 API 연동 후 사용할 수 있습니다.",
            )
          }
        >
          <Ionicons name="lock-closed-outline" size={22} color="#2F6B57" />
          <Text style={styles.menuText}>비밀번호 변경</Text>
        </TouchableOpacity>

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

  settingCard: {
    width: "100%",
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },

  settingTitle: {
    fontSize: 18,
    fontFamily: "NanumB",
    color: "#2F6B57",
    marginBottom: 12,
  },

  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },

  settingLabel: {
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#222",
  },
});
