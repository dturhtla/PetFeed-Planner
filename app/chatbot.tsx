import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ChatbotScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.title}>AI 챗봇</Text>

        <ScrollView contentContainerStyle={styles.chatArea}>
          <View style={styles.botBubble}>
            <Text style={styles.botText}>안녕하세요. 무엇을 도와드릴까요?</Text>
          </View>

          <View style={styles.userBubble}>
            <Text style={styles.userText}>
              오늘 급여량이 적당한지 알고 싶어요.
            </Text>
          </View>

          <View style={styles.botBubble}>
            <Text style={styles.botText}>
              반려동물 체중과 사료 종류를 알려주시면 안내해드릴게요.
            </Text>
          </View>
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput placeholder="메시지를 입력하세요" style={styles.input} />
          <TouchableOpacity style={styles.sendButton}>
            <Text style={styles.sendButtonText}>전송</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F7F4" },
  container: { flex: 1, padding: 16 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2F6B57",
    alignSelf: "center",
    marginBottom: 12,
  },
  chatArea: {
    flexGrow: 1,
    paddingVertical: 12,
  },
  botBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#E3E7E5",
    padding: 14,
    borderRadius: 14,
    maxWidth: "78%",
    marginBottom: 10,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#2F6B57",
    padding: 14,
    borderRadius: 14,
    maxWidth: "78%",
    marginBottom: 10,
  },
  botText: { color: "#333", fontSize: 14, lineHeight: 20 },
  userText: { color: "#FFF", fontSize: 14, lineHeight: 20 },
  inputRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingTop: 8,
  },
  input: {
    flex: 1,
    height: 46,
    backgroundColor: "#FFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C9D8D1",
    paddingHorizontal: 14,
  },
  sendButton: {
    width: 70,
    height: 46,
    backgroundColor: "#2F6B57",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonText: { color: "#FFF", fontWeight: "700" },
});
