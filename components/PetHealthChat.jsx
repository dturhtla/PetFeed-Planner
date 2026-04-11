import { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  ExpoSpeechRecognitionModule,
  isSpeechRecognitionAvailable,
  useSpeechRecognitionEvent,
} from "../utils/speechRecognitionSafe";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BrandRecommendationCard from "./BrandRecommendationCard";
import {
  fixGluedNumberedListStarts,
  inferUserMessageLocale,
  visionAnalysisLanguageSuffix,
  visionAnalysisUserPrompt,
  wrapUserMessageForModelLanguage,
} from "../utils/chatLocale";
import { parseBrandRecommendationsFromModelText } from "../utils/brandRecommendation";

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `msg-${Date.now()}-${idCounter}`;
}

const SYSTEM_INSTRUCTION = `You are a Professional Pet Health Assistant for pets.

Scope:
- Treat any question that mentions a dog, cat, or rabbit, or clearly refers to the user's pet (health, sleep, behavior, food, environment, training, etc.) as in-scope and answer helpfully.
- If a question is clearly not about pets at all (for example: 'what is the capital of Myanmar', 'explain World War 2'), briefly refuse and say you only help with pet health, then invite a pet-related question.
- The user is discussing their pets. Tailor your advice specifically for pets.

Language (highest priority — do not ignore):
- Match ONLY the latest user message. Ignore app UI language, earlier chat turns, or assumptions about region.
- If the latest message is mostly English (Latin letters), the ENTIRE reply must be English: no Korean sentences, no Korean list labels, no Korean prices-only format. Brand names may stay as on the package.
- If the latest message is mostly Korean (Hangul), the ENTIRE reply must be Korean except common brand names.
- Never default to Korean when the user wrote in English. Never default to English when the user wrote in Korean.

Format:
- Be concise to save tokens. Use short, direct answers. Avoid long intros or repetition.
- Do NOT use markdown formatting like **bold**, lists, or headings. Respond as plain text only.
- Numbered lists: start "1." on a new line after the intro (line break only, not an extra empty line). Never glue "1." on the same line as the intro sentence or after a colon (e.g. not "profiles: 1. Item" on one line).
- For serious or urgent health concerns, recommend seeing a vet.

Pricing and cost questions:
- When the user asks about price, cost, budget, or "estimate value" of food or products, you MUST answer with helpful approximate retail ranges in the user's language and typical local currency when the region is clear (e.g. KRW for Korea, USD for US). State clearly that figures are rough estimates only: real prices change by shop, promotion, pack size, channel, and date.
- Do not refuse these questions by saying you only do health advice or cannot discuss retail pricing. Ballpark numbers with disclaimers are appropriate here.

Food and product recommendations (flash cards):
- When the user asks for food recommendations, brands, or "N good foods", and you name specific commercial dog or cat food products, you MUST enable the app's flash-card UI: after your plain-text reply, append EXACTLY one BRAND_JSON line per named product, in order, at the very end of the message. Same count as products you recommend (e.g. 6 foods → 6 BRAND_JSON lines). This is required whenever you list concrete brand/product pairs for dogs or cats — do not answer with only a numbered plain list and skip BRAND_JSON.
- Plain-text part: short numbered summary is fine; put matching nutrition and price detail in each BRAND_JSON benefits and estimatedPrice so cards are complete. Do not show incomplete JSON, code fences, or BRAND_JSON in the middle of sentences — only full lines at the end.
- Each BRAND_JSON line must be one complete valid JSON object on its own line (nothing cut off):
BRAND_JSON:{"brandName":"Brand","productName":"Product line","species":"dog","estimatedPrice":"~$60–75 (30 lb)","benefits":["protein 26% crude","fat 15%","for adult maintenance"]}
- species must be exactly "dog" or "cat" to match the animal. benefits must be short strings in the SAME language as your answer (English answer → English benefits; Korean answer → Korean benefits). estimatedPrice must match that language (e.g. USD for English, ₩/원 for Korean). Do not add the words "estimate" or "추정" in estimatedPrice—pack size in parentheses is enough.
- Only skip BRAND_JSON when you give generic advice without naming specific commercial products, or for rabbits/other species (plain text only).
- For rabbits or other species, plain text only — no BRAND_JSON.`;

/** Same model as text chat — shares your Gemini free-tier quota. Avoid gemini-2.0-flash: many keys get limit 0 on free tier for that model. */
const GEMINI_MODEL = "gemini-2.5-flash-lite";

const PET_PHOTO_ANALYSIS_INSTRUCTION = `You analyze pet photos for a Pet Health Assistant app. Reply in plain text only (no markdown, no **). Be concise.

When the image shows a pet (or you can tell it is meant to be an animal):
- Species: dog, cat, rabbit, bird, reptile, other, or unclear.
- Breed or type: best guess, or "mix", or "unclear" if not enough detail.
- Age: puppy/kitten, young, adult, senior — or an approximate range; say it is only a visual guess.
- Brief visible traits: coat, size, colors, anything notable.
- End with one short line that photo and AI guesses are not medical facts; a vet can give an accurate exam.

When the image does NOT show a pet (food, objects, people only, scenery, etc.):
- First, briefly and kindly describe what is actually in the picture (what you see — e.g. strawberries in a container, a car, a plant).
- Then clearly remind the user: this app is a Pet Health Assistant — it is meant for pet health, feeding, and behavior questions.
- Invite them to share a photo of their pet or type a question about their dog, cat, rabbit, or similar pet.
- Do not give a full pet breed/age analysis for a non-pet image.`;

function guessMimeType(uri) {
  const lower = (uri || "").toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".webp")) return "image/webp";
  if (lower.includes(".gif")) return "image/gif";
  return "image/jpeg";
}

async function imageToBase64(uri, existingBase64) {
  if (existingBase64) return existingBase64;
  const data = await FileSystem.readAsStringAsync(uri, {
    encoding: "base64",
  });
  return data;
}

function PetHealthChat() {
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const listRef = useRef(null);
  /** Text in the input when the user started voice input (prepended to transcript). */
  const speechBaseRef = useRef("");
  const chatSessionRef = useRef(null);
  const modelRef = useRef(null);
  const lastReplyLocaleRef = useRef("ko");

  const apiKey = (process.env.EXPO_PUBLIC_GEMINI_API_KEY || "").trim();

  useEffect(() => {
    return () => {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        /* not listening or native unavailable */
      }
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const getOrCreateChatSession = () => {
    if (!modelRef.current) {
      if (!apiKey || apiKey === "your_gemini_api_key_here") {
        throw new Error(
          "Gemini API key missing. Make sure EXPO_PUBLIC_GEMINI_API_KEY is set in your .env before running `npm start`.",
        );
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      modelRef.current = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: { maxOutputTokens: 2048 },
      });

      const history = messages
        .filter((m) => m.role !== "error")
        .map((m) => {
          const textForModel =
            m.content != null && m.content !== ""
              ? m.content
              : m.imageUri && m.role === "user"
                ? " "
                : "";
          return {
            role: m.role === "user" ? "user" : "model",
            parts: [{ text: textForModel }],
          };
        });

      chatSessionRef.current = modelRef.current.startChat({
        history: history.length > 0 ? history : undefined,
      });
    }

    return chatSessionRef.current;
  };

  const analyzePetPhotoWithGemini = async (base64, mimeType, replyLocale) => {
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      throw new Error(
        "Gemini API key missing. Add EXPO_PUBLIC_GEMINI_API_KEY to your .env.",
      );
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const visionInstruction =
      PET_PHOTO_ANALYSIS_INSTRUCTION +
      visionAnalysisLanguageSuffix(replyLocale);
    const parts = [
      {
        inlineData: {
          mimeType,
          data: base64,
        },
      },
      {
        text: visionAnalysisUserPrompt(replyLocale),
      },
    ];

    const tryGenerate = async (modelName) => {
      const m = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: visionInstruction,
        generationConfig: { maxOutputTokens: 600 },
      });
      const result = await m.generateContent(parts);
      return result.response.text();
    };

    try {
      return await tryGenerate(GEMINI_MODEL);
    } catch (firstErr) {
      const msg = firstErr?.message || "";
      const is429 =
        firstErr?.status === 429 ||
        msg.includes("429") ||
        msg.includes("quota");
      const isLiteVisionUnsupported =
        msg.includes("400") &&
        (msg.toLowerCase().includes("multimodal") ||
          msg.toLowerCase().includes("image") ||
          msg.toLowerCase().includes("not supported"));

      if (is429 || isLiteVisionUnsupported) {
        return await tryGenerate("gemini-2.5-flash");
      }
      throw firstErr;
    }
  };

  const imagePickerOptions = {
    mediaTypes: ["images"],
    quality: 0.75,
    base64: true,
    allowsEditing: true,
    aspect: [4, 3],
  };

  const runAnalyzeOnPickedImage = async (uri, mimeType, base64FromPicker) => {
    let b64 = base64FromPicker;
    if (!b64) {
      b64 = await imageToBase64(uri, null);
    }

    const userMsgId = nextId();
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        imageUri: uri,
      },
    ]);
    setIsLoading(true);

    try {
      const analysis = await analyzePetPhotoWithGemini(
        b64,
        mimeType,
        lastReplyLocaleRef.current,
      );
      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: analysis,
          replyLocale: lastReplyLocaleRef.current,
        },
      ]);
    } catch (err) {
      console.error("Pet photo analysis error:", err);
      const msg =
        err?.message ||
        "Could not analyze the photo. Check your API key, free-tier limits, and network.";
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "error", content: msg },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const pickFromCamera = async () => {
    try {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) {
        Alert.alert(
          "Permission needed",
          "Allow camera access to photograph your pet.",
        );
        return;
      }
      const picked = await ImagePicker.launchCameraAsync(imagePickerOptions);
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      await runAnalyzeOnPickedImage(
        asset.uri,
        asset.mimeType || guessMimeType(asset.uri),
        asset.base64,
      );
    } catch (err) {
      console.error(err);
      Alert.alert("Camera", err?.message || "Could not use the camera.");
    }
  };

  const pickFromPhotoLibrary = async () => {
    try {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        Alert.alert(
          "Permission needed",
          "Allow photo library access to choose a pet image.",
        );
        return;
      }
      const picked = await ImagePicker.launchImageLibraryAsync(imagePickerOptions);
      if (picked.canceled || !picked.assets?.[0]) return;
      const asset = picked.assets[0];
      await runAnalyzeOnPickedImage(
        asset.uri,
        asset.mimeType || guessMimeType(asset.uri),
        asset.base64,
      );
    } catch (err) {
      console.error(err);
      Alert.alert("Photo library", err?.message || "Could not open photos.");
    }
  };

  const pickFromDeviceFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const file = result.assets[0];
      await runAnalyzeOnPickedImage(
        file.uri,
        file.mimeType || guessMimeType(file.name || file.uri),
        file.base64 ?? null,
      );
    } catch (err) {
      console.error(err);
      Alert.alert("Files", err?.message || "Could not open the file picker.");
    }
  };

  const openPetImagePicker = () => {
    if (isLoading) return;

    if (Platform.OS === "web") {
      Alert.alert("Add pet photo", "Choose how to add an image.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Photo library",
          onPress: () => {
            void pickFromPhotoLibrary();
          },
        },
        {
          text: "Browse files",
          onPress: () => {
            void pickFromDeviceFiles();
          },
        },
      ]);
      return;
    }

    Alert.alert("Add pet photo", "Choose how to add an image.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Camera",
        onPress: () => {
          void pickFromCamera();
        },
      },
      {
        text: "Photo library",
        onPress: () => {
          void pickFromPhotoLibrary();
        },
      },
      {
        text: "Browse files",
        onPress: () => {
          void pickFromDeviceFiles();
        },
      },
    ]);
  };

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
  });

  useSpeechRecognitionEvent("result", (event) => {
    const t = event.results?.[0]?.transcript?.trim() ?? "";
    if (!t) return;
    const base = speechBaseRef.current.trim();
    setInput(base ? `${base} ${t}` : t);
  });

  useSpeechRecognitionEvent("error", (event) => {
    setIsListening(false);
    const code = event.error;
    if (code === "not-allowed" || code === "audio-capture") {
      Alert.alert(
        "Microphone access needed",
        "Allow microphone and speech recognition in Settings to use voice input.",
      );
      return;
    }
    if (code === "aborted" || code === "no-speech") return;
    Alert.alert(
      "Voice input",
      event.message || code || "Speech recognition failed.",
    );
  });

  const stopRecording = useCallback(() => {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (e) {
      console.error(e);
    }
    setIsListening(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (isLoading) return;
    if (isListening) {
      stopRecording();
      return;
    }
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Microphone access needed",
          "Allow microphone and speech recognition to turn your voice into text.",
        );
        return;
      }
      speechBaseRef.current = input;
      const replyLocale = inferUserMessageLocale(input);
      const lang = replyLocale === "en" ? "en-US" : "ko-KR";
      const androidApi =
        typeof Platform.Version === "number"
          ? Platform.Version
          : parseInt(String(Platform.Version), 10);
      const continuous =
        Platform.OS !== "android" ||
        (Number.isFinite(androidApi) && androidApi >= 33);
      ExpoSpeechRecognitionModule.start({
        lang,
        interimResults: true,
        continuous,
      });
    } catch (e) {
      console.error(e);
      Alert.alert(
        "Voice input",
        e?.message ?? "Could not start speech recognition.",
      );
    }
  }, [input, isLoading, isListening, stopRecording]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const replyLocale = inferUserMessageLocale(text);
    lastReplyLocaleRef.current = replyLocale;

    setInput("");
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", content: text },
    ]);
    setIsLoading(true);

    try {
      const chat = getOrCreateChatSession();
      const textForModel = wrapUserMessageForModelLanguage(text, replyLocale);
      const result = await chat.sendMessage(textForModel);
      const response = result.response;
      const aiText = response.text();

      setMessages((prev) => [
        ...prev,
        {
          id: nextId(),
          role: "assistant",
          content: aiText,
          replyLocale,
        },
      ]);
    } catch (err) {
      console.error("Gemini API error:", err);
      let errorMessage = err?.message || "Unknown error";
      if (err?.status) {
        const details = err?.errorDetails
          ? ` ${JSON.stringify(err.errorDetails)}`
          : "";
        errorMessage = `API Error ${err.status}: ${err.statusText || err.message}${details}`;
      }
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "error", content: errorMessage },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderMessage = useCallback(({ item }) => {
    if (item.role === "user") {
      return (
        <View style={[styles.messageRow, styles.messageRowUser]}>
          <View style={[styles.messageBubble, styles.messageBubbleUser]}>
            {item.imageUri ? (
              <Image
                source={{ uri: item.imageUri }}
                style={styles.userPhotoThumb}
              />
            ) : (
              <Text style={[styles.messageText, styles.messageTextUser]}>
                {item.content}
              </Text>
            )}
          </View>
        </View>
      );
    }

    if (item.role === "error") {
      return (
        <View style={[styles.messageRow, styles.messageRowAssistant]}>
          <View style={[styles.messageBubble, styles.messageBubbleError]}>
            <Text style={styles.messageText}>{item.content}</Text>
          </View>
        </View>
      );
    }

    const { caption, brands } = parseBrandRecommendationsFromModelText(
      item.content,
    );
    const captionFormatted = fixGluedNumberedListStarts(caption);

    if (brands.length > 0) {
      return (
        <View style={[styles.messageRow, styles.messageRowAssistant]}>
          <View style={styles.modelBlock}>
            {captionFormatted ? (
              <Text style={styles.modelCaption}>{captionFormatted}</Text>
            ) : null}
            {brands.map((b, i) => (
              <View key={`${b.brandName}-${i}`} style={styles.brandCardWrap}>
                <BrandRecommendationCard
                  brandName={b.brandName}
                  species={b.species}
                  benefits={b.benefits}
                  productName={b.productName}
                  estimatedPrice={b.estimatedPrice}
                  labelLocale={item.replyLocale ?? "ko"}
                />
              </View>
            ))}
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.messageRow, styles.messageRowAssistant]}>
        <View style={[styles.messageBubble, styles.messageBubbleAssistant]}>
          <Text style={styles.messageText}>{captionFormatted}</Text>
        </View>
      </View>
    );
  }, []);

  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <KeyboardAvoidingView
      style={styles.keyboardRoot}
      behavior={
        Platform.OS === "ios"
          ? "padding"
          : Platform.OS === "android"
            ? "height"
            : undefined
      }
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconOuter}>
            <View style={styles.iconInner}>
              <Text style={styles.iconEmoji}>🐾</Text>
            </View>
          </View>
          <Text style={styles.title}>Pet Health Assistant</Text>
          <Text style={styles.subtitle}>
            Ask anything about your pet health, feeding, and behavior
          </Text>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={keyExtractor}
          renderItem={renderMessage}
          onContentSizeChange={scrollToBottom}
          onLayout={scrollToBottom}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListFooterComponent={
            isLoading ? (
              <View style={[styles.messageRow, styles.messageRowAssistant]}>
                <View style={styles.typingBubble}>
                  <Text style={styles.typingDot}>● ● ●</Text>
                </View>
              </View>
            ) : (
              <View style={{ height: 8 }} />
            )
          }
        />

        <View style={styles.inputRow}>
          <TouchableOpacity
            onPress={openPetImagePicker}
            disabled={isLoading}
            accessibilityLabel="Add pet photo: camera, photo library, or files"
            style={[
              styles.sendButton,
              styles.inputRowLeadingIcon,
              isLoading && styles.sendButtonDisabled,
            ]}
          >
            <Ionicons name="images-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
          {isSpeechRecognitionAvailable ? (
            <TouchableOpacity
              onPress={startRecording}
              disabled={isLoading}
              accessibilityLabel={
                isListening ? "Stop voice input" : "Start voice input"
              }
              style={[
                styles.sendButton,
                styles.inputRowLeadingIcon,
                isListening && styles.micButtonListening,
                isLoading && styles.sendButtonDisabled,
              ]}
            >
              <Ionicons
                name={isListening ? "mic" : "mic-outline"}
                size={22}
                color={isListening ? "#FDE047" : "#ffffff"}
              />
            </TouchableOpacity>
          ) : null}
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your pet..."
            editable={!isLoading}
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            onPress={sendMessage}
            disabled={isLoading || !input.trim()}
            style={[
              styles.sendButton,
              (isLoading || !input.trim()) && styles.sendButtonDisabled,
            ]}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardRoot: {
    flex: 1,
    width: "100%",
  },
  card: {
    flex: 1,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#fdfdfa",
    borderWidth: 1,
    borderColor: "rgba(136, 185, 154, 0.2)",
  },
  header: {
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  iconOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(86, 201, 168, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  iconInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#56c9a8",
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: {
    fontSize: 24,
    color: "#ffffff",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#5a9fb8",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#88b99a",
    textAlign: "center",
  },
  messages: {
    flex: 1,
    paddingHorizontal: 16,
  },
  messagesContent: {
    paddingBottom: 16,
  },
  messageRow: {
    marginVertical: 4,
    flexDirection: "row",
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  messageRowAssistant: {
    justifyContent: "flex-start",
  },
  modelBlock: {
    maxWidth: "92%",
    alignItems: "flex-start",
  },
  brandCardWrap: {
    marginBottom: 10,
    width: "100%",
  },
  modelCaption: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
    marginBottom: 8,
  },
  messageBubble: {
    maxWidth: "85%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  messageBubbleUser: {
    backgroundColor: "#56c9a8",
    borderBottomRightRadius: 4,
    overflow: "hidden",
  },
  userPhotoThumb: {
    width: 200,
    maxWidth: "100%",
    height: 160,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignSelf: "flex-end",
  },
  messageBubbleAssistant: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(136, 185, 154, 0.3)",
    borderBottomLeftRadius: 4,
  },
  messageBubbleError: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  messageText: {
    fontSize: 14,
    color: "#1f2933",
  },
  messageTextUser: {
    color: "#ffffff",
  },
  typingBubble: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "rgba(136, 185, 154, 0.3)",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typingDot: {
    color: "#56c9a8",
    letterSpacing: 1,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(136, 185, 154, 0.2)",
    backgroundColor: "#ffffff",
  },
  input: {
    flex: 1,
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(136, 185, 154, 0.4)",
    fontSize: 14,
  },
  inputRowLeadingIcon: {
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#56c9a8",
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  micButtonListening: {
    backgroundColor: "#e85d75",
  },
  sendIcon: {
    fontSize: 18,
    color: "#ffffff",
  },
});

export default PetHealthChat;
