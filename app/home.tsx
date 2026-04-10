import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef } from "react";
import {
  BackHandler,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const menuList = [
  { title: "프로필", icon: "person-outline", route: "/profile" },
  { title: "사료 분석", icon: "nutrition-outline", route: "/camera-upload" },
  { title: "급여 기록", icon: "clipboard-outline", route: "/records" },
  { title: "AI 챗봇", icon: "chatbubble-ellipses-outline", route: "/chatbot" },
];

export default function HomeScreen() {
  const router = useRouter();
  const lastBackPress = useRef(0);

  useFocusEffect(
    useCallback(() => {
      console.log("HOME SCREEN FOCUS");

      const onBackPress = () => {
        const now = Date.now();

        if (now - lastBackPress.current < 2000) {
          BackHandler.exitApp();
          return true;
        }

        lastBackPress.current = now;
        ToastAndroid.show("한 번 더 누르면 종료됩니다", ToastAndroid.SHORT);
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );

      return () => subscription.remove();
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <TouchableOpacity
          style={styles.settingButton}
          onPress={() => router.push("/settings" as any)}
        >
          <Ionicons name="settings-outline" size={22} color="#2F6B57" />
        </TouchableOpacity>
      </View>

      <View style={styles.container}>
        <Text style={styles.logo}>PetFeed Planner</Text>

        <View style={styles.menuWrap}>
          {menuList.map((item) => (
            <TouchableOpacity
              key={item.title}
              style={styles.menuButton}
              onPress={() => router.push(item.route as any)}
            >
              <Ionicons name={item.icon as any} size={24} color="#2F6B57" />
              <Text style={styles.menuText}>{item.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
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
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 4,
  },
  headerSpacer: {
    flex: 1,
  },
  settingButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  logo: {
    fontSize: 28,
    fontFamily: "KCC",
    color: "#2F6B57",
    marginBottom: 42,
  },
  menuWrap: {
    width: "100%",
    gap: 22,
  },
  menuButton: {
    width: "100%",
    height: 88,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
  },
  menuText: {
    fontSize: 18,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
});
