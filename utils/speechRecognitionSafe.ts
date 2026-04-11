import Constants, { ExecutionEnvironment } from "expo-constants";
import { useEffect } from "react";
import { Platform } from "react-native";

/**
 * Expo Go does not ship custom native modules like expo-speech-recognition.
 * Web uses a different path; we avoid loading the native module there too.
 */
export const isSpeechRecognitionAvailable =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
  Platform.OS !== "web";

function useSpeechRecognitionEventStub(
  _eventName: string,
  _listener: (event: unknown) => void,
) {
  useEffect(() => {}, []);
}

const stubModule = {
  stop: () => {},
  abort: () => {},
  requestPermissionsAsync: async () =>
    ({ granted: false }) as { granted: boolean },
  start: (_options: Record<string, unknown>) => {},
};

let ExpoSpeechRecognitionModule: typeof stubModule;
let useSpeechRecognitionEvent: typeof useSpeechRecognitionEventStub;

if (isSpeechRecognitionAvailable) {
  const speech = require("expo-speech-recognition") as {
    ExpoSpeechRecognitionModule: typeof stubModule;
    useSpeechRecognitionEvent: typeof useSpeechRecognitionEventStub;
  };
  ExpoSpeechRecognitionModule = speech.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = speech.useSpeechRecognitionEvent;
} else {
  ExpoSpeechRecognitionModule = stubModule;
  useSpeechRecognitionEvent = useSpeechRecognitionEventStub;
}

export { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent };
