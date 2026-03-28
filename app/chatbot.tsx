import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
// @ts-expect-error PetHealthChat is plain JSX without a .d.ts
import PetHealthChat from "../components/PetHealthChat";

export default function ChatbotScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.inner}>
        <PetHealthChat />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F6F7F4",
  },
  inner: {
    flex: 1,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
});
