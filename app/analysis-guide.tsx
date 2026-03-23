import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>프로필</Text>

        <View style={styles.avatar} />

        <TextInput placeholder="이름" style={styles.input} />
        <TextInput placeholder="나이" style={styles.input} />
        <TextInput placeholder="체중(kg)" style={styles.input} />
        <TextInput placeholder="종류(강아지/고양이)" style={styles.input} />

        <TouchableOpacity style={styles.button}>
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
  buttonText: { color: "#FFF", fontSize: 15, fontWeight: "700" },
});
