import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type GenderType = "남" | "여" | "";
type PetType = "강아지" | "고양이" | "";
type BcsLabel = "심한 저체중" | "저체중" | "정상" | "과체중" | "비만" | "";

type LoggedInUser = {
  id: string;
  email: string;
  password: string;
};

type ProfileData = {
  name: string;
  age: string;
  weight: string;
  gender: GenderType;
  petType: PetType;
  bcs: BcsLabel;
};

const FIRST_BOX_HEIGHT = 74;
const BOX_HEIGHT = 64;

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const returnedSelectedBcs = useMemo(() => {
    return typeof params?.selectedBcs === "string"
      ? (params.selectedBcs as BcsLabel)
      : "";
  }, [params?.selectedBcs]);

  const returnedFromBcsEdit = useMemo(() => {
    return params?.fromBcsEdit === "true";
  }, [params?.fromBcsEdit]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [hasCompletedProfile, setHasCompletedProfile] = useState(false);

  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [gender, setGender] = useState<GenderType>("");
  const [petType, setPetType] = useState<PetType>("");
  const [bcs, setBcs] = useState<BcsLabel>("");

  const getDraftKey = (email: string) => `petProfileDraft_${email}`;
  const getProfileKey = (email: string) => `petProfile_${email}`;
  const getCompletedKey = (email: string) => `profileCompleted_${email}`;

  const applyProfileData = (data?: Partial<ProfileData>) => {
    setName(data?.name || "");
    setAge(data?.age || "");
    setWeight(data?.weight || "");
    setGender((data?.gender as GenderType) || "");
    setPetType((data?.petType as PetType) || "");
    setBcs((data?.bcs as BcsLabel) || "");
  };

  const loadProfile = useCallback(async () => {
    try {
      const savedUser = await AsyncStorage.getItem("loggedInUser");

      if (!savedUser) {
        router.replace("/" as any);
        return;
      }

      const parsedUser: LoggedInUser = JSON.parse(savedUser);
      const email = parsedUser.email;
      setUserEmail(email);

      const savedProfile = await AsyncStorage.getItem(getProfileKey(email));
      const savedDraft = await AsyncStorage.getItem(getDraftKey(email));
      const completed = await AsyncStorage.getItem(getCompletedKey(email));

      const isCompleted = completed === "true";
      setHasCompletedProfile(isCompleted);

      const parsedProfile = savedProfile ? JSON.parse(savedProfile) : null;
      const parsedDraft = savedDraft ? JSON.parse(savedDraft) : null;

      if (returnedFromBcsEdit) {
        if (parsedDraft) {
          applyProfileData(parsedDraft);
        } else if (parsedProfile) {
          applyProfileData(parsedProfile);
        } else {
          applyProfileData();
        }

        if (returnedSelectedBcs) {
          setBcs(returnedSelectedBcs);
        }

        setIsEditMode(true);
      } else {
        if (parsedProfile) {
          applyProfileData(parsedProfile);
        } else {
          applyProfileData();
        }

        setIsEditMode(!isCompleted);
      }
    } catch (error) {
      console.log(error);
      setIsEditMode(true);
    } finally {
      setIsLoaded(true);
    }
  }, [returnedFromBcsEdit, returnedSelectedBcs, router]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.replace("/home" as any);
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );

      return () => subscription.remove();
    }, [router]),
  );

  const saveDraft = async () => {
    if (!userEmail) return;

    const draft: ProfileData = {
      name,
      age,
      weight,
      gender,
      petType,
      bcs,
    };

    await AsyncStorage.setItem(getDraftKey(userEmail), JSON.stringify(draft));
  };

  const clearDraft = async () => {
    if (!userEmail) return;
    await AsyncStorage.removeItem(getDraftKey(userEmail));
  };

  const handleNextToBcs = async () => {
    if (!userEmail) {
      router.replace("/" as any);
      return;
    }

    try {
      await saveDraft();

      router.push({
        pathname: "/bcs-check",
        params: {
          petType,
        },
      } as any);
    } catch (error) {
      console.log(error);
    }
  };

  const handleBcsEditPress = async () => {
    if (!userEmail) {
      router.replace("/" as any);
      return;
    }

    try {
      await saveDraft();

      router.push({
        pathname: "/bcs-check",
        params: {
          from: "profile",
          selectedBcs: bcs,
          petType,
        },
      } as any);
    } catch (error) {
      console.log(error);
    }
  };

  const handleSave = async () => {
    try {
      if (!userEmail) {
        router.replace("/" as any);
        return;
      }

      const alreadyCompleted = await AsyncStorage.getItem(
        getCompletedKey(userEmail),
      );

      const finalProfile: ProfileData = {
        name,
        age,
        weight,
        gender,
        petType,
        bcs,
      };

      await AsyncStorage.setItem(
        getProfileKey(userEmail),
        JSON.stringify(finalProfile),
      );

      await AsyncStorage.setItem(getCompletedKey(userEmail), "true");
      await clearDraft();

      setHasCompletedProfile(true);
      setIsEditMode(false);

      if (alreadyCompleted !== "true") {
        router.replace("/home" as any);
        return;
      }

      router.replace("/home" as any);
      setTimeout(() => {
        router.push("/profile" as any);
      }, 0);
    } catch (error) {
      console.log(error);
    }
  };

  const handleStartEdit = async () => {
    try {
      setIsEditMode(true);
      await saveDraft();
    } catch (error) {
      console.log(error);
      setIsEditMode(true);
    }
  };

  const renderProfileIcon = () => {
    if (petType === "고양이") {
      return <Ionicons name="logo-octocat" size={58} color="#111" />;
    }

    return <Ionicons name="paw" size={58} color="#111" />;
  };

  if (!isLoaded) {
    return <SafeAreaView style={styles.safe} />;
  }

  const showInputFirstScreen = !hasCompletedProfile && isEditMode;

  if (showInputFirstScreen) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.firstContainer}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.firstTitle}>프로필 입력</Text>

          <TextInput
            placeholder="이름"
            placeholderTextColor="#8A8A8A"
            style={styles.firstInput}
            value={name}
            onChangeText={setName}
          />

          <TextInput
            placeholder="나이"
            placeholderTextColor="#8A8A8A"
            style={styles.firstInput}
            value={age}
            onChangeText={setAge}
            keyboardType="numeric"
          />

          <TextInput
            placeholder="몸무게"
            placeholderTextColor="#8A8A8A"
            style={styles.firstInput}
            value={weight}
            onChangeText={setWeight}
            keyboardType="numeric"
          />

          <Text style={styles.firstSectionLabel}>성별</Text>
          <View style={styles.firstRow}>
            <TouchableOpacity
              style={[
                styles.firstSelectButton,
                gender === "남" && styles.firstSelectedButton,
              ]}
              onPress={() => setGender("남")}
            >
              <Text
                style={[
                  styles.firstSelectButtonText,
                  gender === "남" && styles.firstSelectedButtonText,
                ]}
              >
                남
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.firstSelectButton,
                gender === "여" && styles.firstSelectedButton,
              ]}
              onPress={() => setGender("여")}
            >
              <Text
                style={[
                  styles.firstSelectButtonText,
                  gender === "여" && styles.firstSelectedButtonText,
                ]}
              >
                여
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.firstSectionLabel}>종</Text>
          <View style={styles.firstRow}>
            <TouchableOpacity
              style={[
                styles.firstSelectButton,
                petType === "강아지" && styles.firstSelectedButton,
              ]}
              onPress={() => setPetType("강아지")}
            >
              <Text
                style={[
                  styles.firstSelectButtonText,
                  petType === "강아지" && styles.firstSelectedButtonText,
                ]}
              >
                강아지
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.firstSelectButton,
                petType === "고양이" && styles.firstSelectedButton,
              ]}
              onPress={() => setPetType("고양이")}
            >
              <Text
                style={[
                  styles.firstSelectButtonText,
                  petType === "고양이" && styles.firstSelectedButtonText,
                ]}
              >
                고양이
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.firstNextButton}
            onPress={handleNextToBcs}
          >
            <Text style={styles.firstNextButtonText}>NEXT</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.replace("/home" as any)}
        >
          <Ionicons name="chevron-back" size={24} color="#2F6B57" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>프로필</Text>

        <View style={{ width: 24 }} />
      </View>

      <View style={styles.line} />

      <ScrollView contentContainerStyle={styles.container}>
        {!isEditMode ? (
          <>
            <TouchableOpacity onPress={handleStartEdit}>
              <Text style={styles.editText}>정보 수정하기</Text>
            </TouchableOpacity>

            <View style={styles.avatar}>{renderProfileIcon()}</View>

            <View style={styles.infoList}>
              <View style={styles.infoItem}>
                <Text style={styles.infoValue}>
                  <Text style={styles.label}>이름: </Text>
                  {name || "-"}
                </Text>
                <View style={styles.underline} />
              </View>

              <View style={styles.infoItem}>
                <Text style={styles.infoValue}>
                  <Text style={styles.label}>나이: </Text>
                  {age ? `${age}살` : "-"}
                </Text>
                <View style={styles.underline} />
              </View>

              <View style={styles.infoItem}>
                <Text style={styles.infoValue}>
                  <Text style={styles.label}>성별: </Text>
                  {gender || "-"}
                </Text>
                <View style={styles.underline} />
              </View>

              <View style={styles.infoItem}>
                <Text style={styles.infoValue}>
                  <Text style={styles.label}>몸무게: </Text>
                  {weight ? `${weight}kg` : "-"}
                </Text>
                <View style={styles.underline} />
              </View>

              <View style={styles.infoItem}>
                <Text style={styles.infoValue}>
                  <Text style={styles.label}>비만도: </Text>
                  {bcs || "-"}
                </Text>
                <View style={styles.underline} />
              </View>
            </View>
          </>
        ) : (
          <>
            <View style={styles.editAvatar}>{renderProfileIcon()}</View>

            <TextInput
              placeholder="이름"
              placeholderTextColor="#777"
              style={styles.input}
              value={name}
              onChangeText={setName}
            />

            <TextInput
              placeholder="나이"
              placeholderTextColor="#777"
              style={styles.input}
              value={age}
              onChangeText={setAge}
              keyboardType="numeric"
            />

            <TextInput
              placeholder="몸무게(kg)"
              placeholderTextColor="#777"
              style={styles.input}
              value={weight}
              onChangeText={setWeight}
              keyboardType="numeric"
            />

            <Text style={styles.sectionLabel}>성별</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[
                  styles.selectButton,
                  gender === "남" && styles.selectedButton,
                ]}
                onPress={() => setGender("남")}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    gender === "남" && styles.selectedButtonText,
                  ]}
                >
                  남자
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.selectButton,
                  gender === "여" && styles.selectedButton,
                ]}
                onPress={() => setGender("여")}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    gender === "여" && styles.selectedButtonText,
                  ]}
                >
                  여자
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>종</Text>
            <View style={styles.row}>
              <TouchableOpacity
                style={[
                  styles.selectButton,
                  petType === "강아지" && styles.selectedButton,
                ]}
                onPress={() => setPetType("강아지")}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    petType === "강아지" && styles.selectedButtonText,
                  ]}
                >
                  강아지
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.selectButton,
                  petType === "고양이" && styles.selectedButton,
                ]}
                onPress={() => setPetType("고양이")}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    petType === "고양이" && styles.selectedButtonText,
                  ]}
                >
                  고양이
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>BCS</Text>
            <View style={styles.bcsRow}>
              <View style={styles.bcsValueBox}>
                <Text style={styles.bcsValueText}>{bcs || "선택 안됨"}</Text>
              </View>

              <TouchableOpacity
                style={styles.bcsEditButton}
                onPress={handleBcsEditPress}
              >
                <Text style={styles.bcsEditButtonText}>수정</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.singleSaveButton}
              onPress={handleSave}
            >
              <Text style={styles.singleSaveButtonText}>저장</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F6F7F4",
  },

  firstContainer: {
    paddingHorizontal: 24,
    paddingTop: 110,
    paddingBottom: 50,
  },
  firstTitle: {
    fontSize: 30,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 46,
  },
  firstInput: {
    width: "100%",
    height: FIRST_BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#B6CEC4",
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#222",
    marginBottom: 18,
  },
  firstSectionLabel: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#2F6B57",
    marginTop: 6,
    marginBottom: 12,
    paddingLeft: 2,
  },
  firstRow: {
    width: "100%",
    flexDirection: "row",
    gap: 14,
    marginBottom: 28,
  },
  firstSelectButton: {
    flex: 1,
    height: FIRST_BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#B6CEC4",
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  firstSelectedButton: {
    backgroundColor: "#2F6B57",
    borderColor: "#2F6B57",
  },
  firstSelectButtonText: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  firstSelectedButtonText: {
    color: "#FFFFFF",
  },
  firstNextButton: {
    width: "100%",
    height: 86,
    borderRadius: 24,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  firstNextButtonText: {
    color: "#FFFFFF",
    fontSize: 24,
    fontFamily: "NanumB",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backButton: {
    width: 24,
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
  line: {
    height: 1,
    backgroundColor: "#777",
    opacity: 0.5,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
    alignItems: "center",
  },
  editText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#666",
    marginBottom: 16,
  },
  avatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2,
    borderColor: "#2F6B57",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 26,
  },
  editAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: "#2F6B57",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 22,
    alignSelf: "center",
  },
  infoList: {
    width: "100%",
    alignItems: "center",
  },
  infoItem: {
    width: "78%",
    alignItems: "center",
    marginBottom: 18,
  },
  infoValue: {
    fontSize: 22,
    fontFamily: "Nanum",
    color: "#777",
    marginBottom: 6,
  },
  label: {
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
  underline: {
    width: "100%",
    height: 2,
    backgroundColor: "#2F6B57",
  },
  input: {
    width: "100%",
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 18,
    fontSize: 17,
    fontFamily: "Nanum",
    color: "#222",
    marginBottom: 14,
  },
  sectionLabel: {
    width: "100%",
    fontSize: 15,
    fontFamily: "Nanum",
    color: "#2F6B57",
    marginTop: 2,
    marginBottom: 10,
    paddingLeft: 4,
  },
  row: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  selectButton: {
    flex: 1,
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  selectedButton: {
    backgroundColor: "#2F6B57",
    borderColor: "#2F6B57",
  },
  selectButtonText: {
    fontSize: 17,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
  selectedButtonText: {
    color: "#FFFFFF",
  },
  bcsRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  bcsValueBox: {
    flex: 1,
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  bcsValueText: {
    fontSize: 18,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
  bcsEditButton: {
    width: 88,
    height: BOX_HEIGHT,
    borderRadius: 18,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
  },
  bcsEditButtonText: {
    fontSize: 18,
    fontFamily: "Nanum",
    color: "#FFFFFF",
  },
  singleSaveButton: {
    width: "100%",
    height: 54,
    borderRadius: 18,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 18,
  },
  singleSaveButtonText: {
    color: "#FFF",
    fontSize: 20,
    fontFamily: "Nanum",
  },
});
