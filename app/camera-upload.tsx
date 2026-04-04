import { Ionicons } from "@expo/vector-icons";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const FRAME_WIDTH = SCREEN_WIDTH * 0.78;
const FRAME_HEIGHT = FRAME_WIDTH / 0.78;

export default function CameraUploadScreen() {
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);

  const [facing, setFacing] = useState<CameraType>("back");
  const [isTakingPhoto, setIsTakingPhoto] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (!permission) return;
    if (!permission.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);
  
  //가이드 박스 부분 이미지 크롭 
  const cropToFrame = async (uri: string) => {
    const image = await ImageManipulator.manipulateAsync(uri, []);
    const { width: imgWidth, height: imgHeight } = image;

    const scaleX = imgWidth / SCREEN_WIDTH;
    const scaleY = imgHeight / SCREEN_HEIGHT;

    const frameLeft = (SCREEN_WIDTH - FRAME_WIDTH) / 2;
    const frameTop = (SCREEN_HEIGHT - FRAME_HEIGHT) / 2;

    const cropX = frameLeft * scaleX;
    const cropY = frameTop * scaleY;
    const cropWidth = FRAME_WIDTH * scaleX;
    const cropHeight = FRAME_HEIGHT * scaleY;

    const cropped = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          crop: {
            originX: cropX,
            originY: cropY,
            width: cropWidth,
            height: cropHeight,
          },
        },
      ],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    return cropped.uri;
  };

  const handleTakePhoto = async () => {
    if (!cameraRef.current || isTakingPhoto) return;

    try {
      setIsTakingPhoto(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      if (!photo?.uri) return;

      const croppedUri = await cropToFrame(photo.uri);

      router.push({
        pathname: "/analysis-result",
        params: { imageUri: croppedUri },
      });
    } catch (error) {
      console.log(error);
    } finally {
      setIsTakingPhoto(false);
    }
  };

  const handleFlipCamera = () => {
    setFacing((prev) => (prev === "back" ? "front" : "back"));
  };

  const handleOpenGallery = async () => {
    try {
      const galleryPermission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!galleryPermission.granted) {
        alert("갤러리 접근 권한이 필요합니다.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.8,
      });

      if (result.canceled) return;

      const selectedImage = result.assets?.[0];
      if (!selectedImage?.uri) return;

      router.push({
        pathname: "/analysis-result",
        params: { imageUri: selectedImage.uri },
      } as any);
    } catch (error) {
      console.log(error);
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#ffffff" />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>카메라 권한이 필요합니다</Text>
        <Text style={styles.permissionText}>
          사료 이미지를 촬영해서 분석하려면 카메라 접근을 허용해주세요.
        </Text>

        <TouchableOpacity
          style={styles.permissionButton}
          onPress={requestPermission}
        >
          <Text style={styles.permissionButtonText}>권한 허용하기</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backButtonOnly}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonOnlyText}>뒤로가기</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        <SafeAreaView style={styles.overlay}>
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => router.back()}
            >
              <Ionicons name="arrow-back" size={28} color="#fff" />
            </TouchableOpacity>

            <Text style={styles.title}>사료 분석</Text>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleFlipCamera}
            >
              <Ionicons name="camera-reverse-outline" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={styles.guideWrap}>
            <View style={styles.guideBox}>
              <Text style={styles.guideText}>
                사료 포장지 정면이 잘 보이게 맞춰주세요
              </Text>
            </View>
          </View>

          <View style={styles.focusFrame} />

          <View style={styles.bottomArea}>
            <TouchableOpacity
              style={styles.galleryButton}
              onPress={handleOpenGallery}
            >
              <Ionicons name="images-outline" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.captureOuter}
              onPress={handleTakePhoto}
              disabled={isTakingPhoto}
            >
              <View style={styles.captureInner}>
                {isTakingPhoto && (
                  <ActivityIndicator size="small" color="#2F6B57" />
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.emptySpace} />
          </View>
        </SafeAreaView>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    backgroundColor: "transparent",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 21,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "800",
  },
  guideWrap: {
    alignItems: "center",
    marginTop: 8,
  },
  guideBox: {
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  guideText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  focusFrame: {
    width: "78%",
    aspectRatio: 0.78,
    alignSelf: "center",
    borderWidth: 2.5,
    borderColor: "#ffffff",
    borderRadius: 24,
    backgroundColor: "transparent",
  },
  bottomArea: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 34,
    paddingBottom: 28,
  },
  galleryButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureOuter: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: "rgba(255,255,255,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  captureInner: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  emptySpace: {
    width: 54,
    height: 54,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: "#F6F7F4",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#2F6B57",
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 15,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  permissionButton: {
    width: "100%",
    height: 56,
    backgroundColor: "#2F6B57",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  permissionButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
  backButtonOnly: {
    width: "100%",
    height: 56,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  backButtonOnlyText: {
    color: "#2F6B57",
    fontSize: 17,
    fontWeight: "700",
  },
});