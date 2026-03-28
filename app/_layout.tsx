import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { Text, View } from "react-native";

export default function RootLayout() {
  const [loaded, error] = useFonts({
    KCC: require("../assets/fonts/KCC-Ganpan.ttf"),
    Nanum: require("../assets/fonts/NanumSquareRoundB.ttf"),
    NanumB: require("../assets/fonts/NanumSquareRoundEB.ttf"),
  });

  if (error) {
    console.log("로딩 에러:", error);
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>로딩 에러</Text>
      </View>
    );
  }

  if (!loaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>로딩 중...</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="find-id" />
      <Stack.Screen name="find-password" />
      <Stack.Screen name="bcs-check" />
      <Stack.Screen name="home" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="camera-upload" />
      <Stack.Screen name="analysis-guide" />
      <Stack.Screen name="analysis-result" />
      <Stack.Screen name="chatbot" />
      <Stack.Screen name="records" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="delete-account" />
      <Stack.Screen name="modal" />
    </Stack>
  );
}
