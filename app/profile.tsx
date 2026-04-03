import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  BackHandler,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type GenderType = "남" | "여" | "중성화" | "";
type PetType = "강아지" | "고양이" | "";
type BcsLabel = "심한 저체중" | "저체중" | "정상" | "과체중" | "비만" | "";
type PickerType = "year" | "month" | null;

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
  diseases?: string[];
};

type FieldErrors = {
  name?: string;
  age?: string;
  weight?: string;
  gender?: string;
  petType?: string;
  bcs?: string;
  diseases?: string;
};

const FIRST_BOX_HEIGHT = 64;
const BOX_HEIGHT = 56;
const NAME_MAX_LENGTH = 20;

const YEAR_OPTIONS = Array.from({ length: 21 }, (_, i) => String(i));
const MONTH_OPTIONS = [
  "-",
  ...Array.from({ length: 11 }, (_, i) => String(i + 1)),
];

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const forceInputMode = params?.forceInput === "true";

  const returnedSelectedBcs = useMemo(() => {
    return typeof params?.selectedBcs === "string"
      ? (params.selectedBcs as BcsLabel)
      : "";
  }, [params?.selectedBcs]);

  const returnedFromBcsEdit = useMemo(() => {
    return params?.fromBcsEdit === "true";
  }, [params?.fromBcsEdit]);

  const returnedSelectedDiseases = useMemo(() => {
    if (typeof params?.selectedDiseases !== "string") return [];
    try {
      return JSON.parse(params.selectedDiseases) as string[];
    } catch {
      return [];
    }
  }, [params?.selectedDiseases]);

  const returnedFromDiseaseEdit = useMemo(() => {
    return params?.fromDiseaseEdit === "true";
  }, [params?.fromDiseaseEdit]);

  const returnedEditIndex = useMemo(() => {
    return typeof params?.editIndex === "string"
      ? Number(params.editIndex)
      : null;
  }, [params?.editIndex]);

  const [isLoaded, setIsLoaded] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  const [profiles, setProfiles] = useState<ProfileData[]>([]);
  const [isFirstInputMode, setIsFirstInputMode] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [selectedProfileIndex, setSelectedProfileIndex] = useState<
    number | null
  >(null);

  const [name, setName] = useState("");
  const [ageYears, setAgeYears] = useState("");
  const [ageMonths, setAgeMonths] = useState("-");
  const [weight, setWeight] = useState("");
  const [gender, setGender] = useState<GenderType>("");
  const [petType, setPetType] = useState<PetType>("");
  const [bcs, setBcs] = useState<BcsLabel>("");
  const [diseases, setDiseases] = useState<string[]>([]);

  const [errors, setErrors] = useState<FieldErrors>({});
  const [openPicker, setOpenPicker] = useState<PickerType>(null);

  const getDraftKey = (email: string) => `petProfileDraft_${email}`;
  const getProfileKey = (email: string) => `petProfile_${email}`;
  const getProfilesKey = (email: string) => `petProfiles_${email}`;
  const getCompletedKey = (email: string) => `profileCompleted_${email}`;

  const normalizeName = (value: string) => value.trim();
  const isValidName = (value: string) => /^[a-zA-Z가-힣\s]+$/.test(value);
  const filterNameInput = (value: string) =>
    value.replace(/[^a-zA-Z가-힣\s]/g, "");

  const filterWeightInput = (value: string) => {
    let filtered = value.replace(/[^0-9.]/g, "");

    const dotCount = (filtered.match(/\./g) || []).length;
    if (dotCount > 1) {
      const firstDotIndex = filtered.indexOf(".");
      filtered =
        filtered.slice(0, firstDotIndex + 1) +
        filtered.slice(firstDotIndex + 1).replace(/\./g, "");
    }

    const parts = filtered.split(".");

    if (parts.length === 1) {
      filtered = parts[0].slice(0, 3);
    }

    if (parts.length === 2) {
      const integerPart = parts[0].slice(0, 3);
      const decimalPart = parts[1].slice(0, 1);
      filtered = `${integerPart}.${decimalPart}`;
    }

    return filtered;
  };

  const formatWeightForSave = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return "";

    const weightNumber = Number(trimmed);
    if (isNaN(weightNumber)) return trimmed;

    return weightNumber.toFixed(1);
  };

  const formatAgeForSave = () => {
    const hasYear = ageYears !== "";
    const hasMonth = ageMonths !== "-";

    if (!hasYear && !hasMonth) return "";
    if (ageYears === "0" && hasMonth) return `${ageMonths}개월`;
    if (hasYear && hasMonth) return `${ageYears}년 ${ageMonths}개월`;
    if (hasYear) return `${ageYears}년`;

    return "";
  };

  const parseAgeString = (value?: string) => {
    if (!value) {
      setAgeYears("");
      setAgeMonths("-");
      return;
    }

    const yearMatch = value.match(/(\d+)\s*년/);
    const monthMatch = value.match(/(\d+)\s*개월/);

    setAgeYears(yearMatch ? yearMatch[1] : "");
    setAgeMonths(monthMatch ? monthMatch[1] : "-");
  };

  const applyProfileData = useCallback((data?: Partial<ProfileData>) => {
    setName(data?.name || "");
    parseAgeString(data?.age || "");
    setWeight(data?.weight || "");
    setGender((data?.gender as GenderType) || "");
    setPetType((data?.petType as PetType) || "");
    setBcs((data?.bcs as BcsLabel) || "");
    setDiseases(data?.diseases || []);
  }, []);

  const clearFieldError = (field: keyof FieldErrors) => {
    setErrors((prev) => ({
      ...prev,
      [field]: undefined,
    }));
  };

  const resetForm = () => {
    setName("");
    setAgeYears("");
    setAgeMonths("-");
    setWeight("");
    setGender("");
    setPetType("");
    setBcs("");
    setDiseases([]);
    setErrors({});
    setOpenPicker(null);
  };

  const validateAge = () => {
    const hasYear = ageYears !== "";
    const hasMonth = ageMonths !== "-";

    if (!hasYear && !hasMonth) {
      return "나이를 선택해주세요.";
    }

    if (!hasYear && hasMonth) {
      return "개월을 선택하려면 년을 먼저 선택해주세요.";
    }

    return undefined;
  };

  const validateBasicFields = () => {
    const newErrors: FieldErrors = {};
    const trimmedName = normalizeName(filterNameInput(name));
    const trimmedWeight = weight.trim();
    const ageError = validateAge();

    if (!trimmedName) {
      newErrors.name = "이름을 입력해주세요.";
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      newErrors.name = "이름은 20자까지만 입력 가능합니다.";
    } else if (!isValidName(trimmedName)) {
      newErrors.name = "이름은 한글, 영어, 공백만 입력 가능합니다.";
    }

    if (ageError) {
      newErrors.age = ageError;
    }

    if (!trimmedWeight) {
      newErrors.weight = "몸무게를 입력해주세요.";
    } else if (trimmedWeight.endsWith(".")) {
      newErrors.weight = "몸무게 형식이 올바르지 않습니다.";
    } else {
      const weightNumber = Number(trimmedWeight);
      if (isNaN(weightNumber) || weightNumber <= 0) {
        newErrors.weight = "몸무게는 0보다 큰 숫자만 입력해주세요.";
      }
    }

    if (!gender) {
      newErrors.gender = "성별을 선택해주세요.";
    }

    if (!petType) {
      newErrors.petType = "종을 선택해주세요.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateAllFields = () => {
    const newErrors: FieldErrors = {};
    const trimmedName = normalizeName(filterNameInput(name));
    const trimmedWeight = weight.trim();
    const ageError = validateAge();

    if (!trimmedName) {
      newErrors.name = "이름을 입력해주세요.";
    } else if (trimmedName.length > NAME_MAX_LENGTH) {
      newErrors.name = "이름은 20자까지만 입력 가능합니다.";
    } else if (!isValidName(trimmedName)) {
      newErrors.name = "이름은 한글, 영어, 공백만 입력 가능합니다.";
    }

    if (ageError) {
      newErrors.age = ageError;
    }

    if (!trimmedWeight) {
      newErrors.weight = "몸무게를 입력해주세요.";
    } else if (trimmedWeight.endsWith(".")) {
      newErrors.weight = "몸무게 형식이 올바르지 않습니다.";
    } else {
      const weightNumber = Number(trimmedWeight);
      if (isNaN(weightNumber) || weightNumber <= 0) {
        newErrors.weight = "몸무게는 0보다 큰 숫자만 입력해주세요.";
      }
    }

    if (!gender) {
      newErrors.gender = "성별을 선택해주세요.";
    }

    if (!petType) {
      newErrors.petType = "종을 선택해주세요.";
    }

    if (!bcs) {
      newErrors.bcs = "BCS를 선택해주세요.";
    }

    if (!diseases || diseases.length === 0) {
      newErrors.diseases = "질병을 선택해주세요.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const saveDraft = async () => {
    if (!userEmail) return;

    const draft: ProfileData = {
      name: normalizeName(filterNameInput(name)),
      age: formatAgeForSave(),
      weight: weight.trim(),
      gender,
      petType,
      bcs,
      diseases,
    };

    await AsyncStorage.setItem(getDraftKey(userEmail), JSON.stringify(draft));
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
      const savedProfiles = await AsyncStorage.getItem(getProfilesKey(email));

      const parsedProfile = savedProfile ? JSON.parse(savedProfile) : null;
      const parsedDraft = savedDraft ? JSON.parse(savedDraft) : null;
      const parsedProfiles: ProfileData[] = savedProfiles
        ? JSON.parse(savedProfiles)
        : parsedProfile
          ? [parsedProfile]
          : [];

      setProfiles(parsedProfiles);

      if (forceInputMode || parsedProfiles.length === 0) {
        resetForm();
        setIsFirstInputMode(true);
        setIsEditMode(false);
        setSelectedProfileIndex(null);
        return;
      }

      if (returnedFromBcsEdit || returnedFromDiseaseEdit) {
        const editingProfile =
          returnedEditIndex !== null && parsedProfiles[returnedEditIndex]
            ? parsedProfiles[returnedEditIndex]
            : parsedDraft || parsedProfile;

        applyProfileData(editingProfile || undefined);

        if (returnedSelectedBcs) {
          setBcs(returnedSelectedBcs);
        }

        if (returnedFromDiseaseEdit) {
          setDiseases(returnedSelectedDiseases);
        }

        setSelectedProfileIndex(returnedEditIndex);
        setIsFirstInputMode(false);
        setIsEditMode(true);
        setErrors({});
        return;
      }

      setIsFirstInputMode(false);
      setIsEditMode(false);
      setSelectedProfileIndex(null);
      setErrors({});
    } catch (error) {
      console.log(error);
      setIsFirstInputMode(false);
      setIsEditMode(false);
    } finally {
      setIsLoaded(true);
    }
  }, [
    applyProfileData,
    forceInputMode,
    returnedEditIndex,
    returnedFromBcsEdit,
    returnedFromDiseaseEdit,
    returnedSelectedBcs,
    returnedSelectedDiseases,
    router,
  ]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile]),
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (openPicker) {
          setOpenPicker(null);
          return true;
        }

        if (isEditMode || isFirstInputMode) {
          setIsEditMode(false);
          setIsFirstInputMode(false);
          setSelectedProfileIndex(null);
          setErrors({});
          return true;
        }

        router.replace("/home" as any);
        return true;
      };

      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );

      return () => subscription.remove();
    }, [router, isEditMode, isFirstInputMode, openPicker]),
  );

  const handleNextToBcs = async () => {
    if (!userEmail) {
      router.replace("/" as any);
      return;
    }

    if (!validateBasicFields()) {
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

    if (!validateBasicFields()) {
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
          editIndex:
            selectedProfileIndex !== null ? String(selectedProfileIndex) : "",
        },
      } as any);
    } catch (error) {
      console.log(error);
    }
  };

  const handleDiseaseEditPress = async () => {
    if (!userEmail) {
      router.replace("/" as any);
      return;
    }

    if (!validateBasicFields() || !bcs) {
      setErrors((prev) => ({
        ...prev,
        bcs: !bcs ? "BCS를 선택해주세요." : prev.bcs,
      }));
      return;
    }

    try {
      await saveDraft();

      router.push({
        pathname: "/disease-check",
        params: {
          from: "profile",
          selectedDiseases: JSON.stringify(diseases),
          editIndex:
            selectedProfileIndex !== null ? String(selectedProfileIndex) : "",
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

      if (!validateAllFields()) {
        return;
      }

      const formattedWeight = formatWeightForSave(weight);
      const normalizedName = normalizeName(filterNameInput(name));

      const finalProfile: ProfileData = {
        name: normalizedName,
        age: formatAgeForSave(),
        weight: formattedWeight,
        gender,
        petType,
        bcs,
        diseases,
      };

      const updatedProfiles = [...profiles];

      if (selectedProfileIndex !== null) {
        updatedProfiles[selectedProfileIndex] = finalProfile;
      } else {
        updatedProfiles.push(finalProfile);
      }

      await AsyncStorage.setItem(
        getProfilesKey(userEmail),
        JSON.stringify(updatedProfiles),
      );
      await AsyncStorage.setItem(
        getProfileKey(userEmail),
        JSON.stringify(finalProfile),
      );
      await AsyncStorage.setItem(getCompletedKey(userEmail), "true");

      setProfiles(updatedProfiles);
      setIsEditMode(false);
      setIsFirstInputMode(false);
      setSelectedProfileIndex(null);
      setErrors({});
    } catch (error) {
      console.log(error);
    }
  };

  const handleDeleteProfile = async () => {
    if (!userEmail || selectedProfileIndex === null) return;

    Alert.alert("삭제", "이 프로필을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          const updatedProfiles = profiles.filter(
            (_, index) => index !== selectedProfileIndex,
          );

          await AsyncStorage.setItem(
            getProfilesKey(userEmail),
            JSON.stringify(updatedProfiles),
          );

          if (updatedProfiles.length === 0) {
            await AsyncStorage.removeItem(getProfileKey(userEmail));
            await AsyncStorage.removeItem(getDraftKey(userEmail));
            await AsyncStorage.removeItem(getCompletedKey(userEmail));

            setProfiles([]);
            resetForm();
            setIsFirstInputMode(true);
            setIsEditMode(false);
            setSelectedProfileIndex(null);
            return;
          }

          await AsyncStorage.setItem(
            getProfileKey(userEmail),
            JSON.stringify(updatedProfiles[0]),
          );

          setProfiles(updatedProfiles);
          setIsEditMode(false);
          setSelectedProfileIndex(null);
          setErrors({});
        },
      },
    ]);
  };

  const handleProfileCardPress = (profile: ProfileData, index: number) => {
    applyProfileData(profile);
    setSelectedProfileIndex(index);
    setIsEditMode(true);
    setIsFirstInputMode(false);
    setErrors({});
  };

  const handleAddProfile = async () => {
    if (!userEmail) return;

    await AsyncStorage.removeItem(getProfileKey(userEmail));
    await AsyncStorage.removeItem(getDraftKey(userEmail));

    resetForm();
    setIsFirstInputMode(true);
    setIsEditMode(false);
    setSelectedProfileIndex(null);
  };

  const renderProfileIcon = (type?: PetType) => {
    if (type === "고양이") {
      return <Ionicons name="logo-octocat" size={52} color="#111" />;
    }

    return <Ionicons name="paw" size={52} color="#111" />;
  };

  const renderCardIcon = (type?: PetType) => {
    if (type === "고양이") {
      return <Ionicons name="logo-octocat" size={24} color="#111" />;
    }

    return <Ionicons name="paw" size={24} color="#111" />;
  };

  const getDiseaseText = (items?: string[]) => {
    if (!items || items.length === 0) return "없음";
    return items.join(", ");
  };

  const handleNameChange = (text: string) => {
    setName(text);

    const normalized = normalizeName(text);
    if (!normalized) {
      setErrors((prev) => ({ ...prev, name: undefined }));
      return;
    }

    if (normalized.length > NAME_MAX_LENGTH) {
      setErrors((prev) => ({
        ...prev,
        name: "이름은 20자까지만 입력 가능합니다.",
      }));
      return;
    }

    if (!isValidName(normalized)) {
      setErrors((prev) => ({
        ...prev,
        name: "이름은 한글, 영어, 공백만 입력 가능합니다.",
      }));
      return;
    }

    clearFieldError("name");
  };

  const sanitizeNameOnBlur = () => {
    const filtered = filterNameInput(name);
    const normalized = normalizeName(filtered);
    const sliced = normalized.slice(0, NAME_MAX_LENGTH);

    setName(sliced);

    if (!sliced) {
      setErrors((prev) => ({ ...prev, name: undefined }));
      return;
    }

    if (normalized.length > NAME_MAX_LENGTH) {
      setErrors((prev) => ({
        ...prev,
        name: "이름은 20자까지만 입력 가능합니다.",
      }));
      return;
    }

    if (name !== filtered) {
      setErrors((prev) => ({
        ...prev,
        name: "이름은 한글, 영어, 공백만 입력 가능합니다.",
      }));
      return;
    }

    clearFieldError("name");
  };

  const handleSelectPickerItem = useCallback(
    (item: string) => {
      if (openPicker === "year") {
        setAgeYears(item);
      } else if (openPicker === "month") {
        setAgeMonths(item);
      }
      clearFieldError("age");
      setOpenPicker(null);
    },
    [openPicker],
  );

  const renderPickerItem = useCallback(
    ({ item }: { item: string }) => (
      <TouchableOpacity
        style={styles.modalItem}
        onPress={() => handleSelectPickerItem(item)}
      >
        <Text style={styles.modalItemText}>
          {openPicker === "year"
            ? `${item}년`
            : item === "-"
              ? "-"
              : `${item}개월`}
        </Text>
      </TouchableOpacity>
    ),
    [handleSelectPickerItem, openPicker],
  );

  const renderPickerModal = () => {
    if (!openPicker) return null;

    const options = openPicker === "year" ? YEAR_OPTIONS : MONTH_OPTIONS;

    return (
      <Modal
        transparent
        visible={openPicker !== null}
        animationType="fade"
        onRequestClose={() => setOpenPicker(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setOpenPicker(null)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {openPicker === "year" ? "년 선택" : "개월 선택"}
            </Text>

            <FlatList
              data={options}
              keyExtractor={(item) => `${openPicker}-${item}`}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
              renderItem={renderPickerItem}
            />

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setOpenPicker(null)}
            >
              <Text style={styles.modalCloseButtonText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  const renderAgeSelector = (isFirstScreen: boolean) => {
    const boxStyle = isFirstScreen ? styles.firstAgeBox : styles.ageBox;
    const textStyle = isFirstScreen
      ? styles.firstAgeValueText
      : styles.ageValueText;
    const rowStyle = isFirstScreen ? styles.firstAgeRow : styles.ageRow;
    const labelStyle = isFirstScreen
      ? styles.firstSectionLabel
      : styles.sectionLabel;

    return (
      <>
        <Text style={labelStyle}>나이</Text>
        <View style={styles.ageSection}>
          <View style={rowStyle}>
            <TouchableOpacity
              style={[boxStyle, errors.age && styles.inputErrorBorder]}
              onPress={() => setOpenPicker("year")}
            >
              <Text
                style={[textStyle, ageYears === "" && styles.placeholderText]}
              >
                {ageYears === "" ? "년" : `${ageYears}년`}
              </Text>
              <Ionicons name="caret-down" size={20} color="#2F6B57" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[boxStyle, errors.age && styles.inputErrorBorder]}
              onPress={() => {
                if (!ageYears) {
                  setErrors((prev) => ({
                    ...prev,
                    age: "개월을 선택하려면 년을 먼저 선택해주세요.",
                  }));
                  return;
                }
                setOpenPicker("month");
              }}
            >
              <Text
                style={[textStyle, ageMonths === "-" && styles.placeholderText]}
              >
                {ageMonths === "-" ? "개월" : `${ageMonths}개월`}
              </Text>
              <Ionicons name="caret-down" size={20} color="#2F6B57" />
            </TouchableOpacity>
          </View>
        </View>

        {errors.age ? <Text style={styles.errorText}>{errors.age}</Text> : null}
      </>
    );
  };

  if (!isLoaded) {
    return <SafeAreaView style={styles.safe} />;
  }

  if (isFirstInputMode) {
    return (
      <SafeAreaView style={styles.safe}>
        {renderPickerModal()}
        <ScrollView
          contentContainerStyle={styles.firstContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.firstTitle}>프로필 입력</Text>

          <TextInput
            placeholder="이름"
            placeholderTextColor="#8A8A8A"
            style={[styles.firstInput, errors.name && styles.inputErrorBorder]}
            value={name}
            onChangeText={handleNameChange}
            onBlur={sanitizeNameOnBlur}
            onEndEditing={sanitizeNameOnBlur}
          />
          {errors.name ? (
            <Text style={styles.errorText}>{errors.name}</Text>
          ) : null}

          <TextInput
            placeholder="몸무게"
            placeholderTextColor="#8A8A8A"
            style={[
              styles.firstInput,
              errors.weight && styles.inputErrorBorder,
            ]}
            value={weight}
            onChangeText={(text) => {
              const filtered = filterWeightInput(text);
              setWeight(filtered);

              if (text !== filtered) {
                setErrors((prev) => ({
                  ...prev,
                  weight:
                    "몸무게는 정수 3자리까지, 소수는 1자리까지 입력 가능합니다.",
                }));
                return;
              }

              clearFieldError("weight");
            }}
            keyboardType="decimal-pad"
            maxLength={5}
          />
          {errors.weight ? (
            <Text style={styles.errorText}>{errors.weight}</Text>
          ) : null}

          {renderAgeSelector(true)}

          <Text style={styles.firstSectionLabel}>성별</Text>
          <View style={styles.firstGenderRow}>
            {(["남", "여", "중성화"] as GenderType[]).map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.firstGenderButton,
                  gender === item && styles.firstSelectedButton,
                  errors.gender && styles.inputErrorBorder,
                ]}
                onPress={() => {
                  setGender(item);
                  clearFieldError("gender");
                }}
              >
                <Text
                  style={[
                    styles.firstSelectButtonText,
                    gender === item && styles.firstSelectedButtonText,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.gender ? (
            <Text style={styles.errorText}>{errors.gender}</Text>
          ) : null}

          <Text style={styles.firstSectionLabel}>종</Text>
          <View style={styles.firstRow}>
            <TouchableOpacity
              style={[
                styles.firstSelectButton,
                petType === "강아지" && styles.firstSelectedButton,
                errors.petType && styles.inputErrorBorder,
              ]}
              onPress={() => {
                setPetType("강아지");
                clearFieldError("petType");
              }}
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
                errors.petType && styles.inputErrorBorder,
              ]}
              onPress={() => {
                setPetType("고양이");
                clearFieldError("petType");
              }}
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
          {errors.petType ? (
            <Text style={styles.errorText}>{errors.petType}</Text>
          ) : null}

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
      {renderPickerModal()}

      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (isEditMode) {
              setIsEditMode(false);
              setSelectedProfileIndex(null);
              setErrors({});
              return;
            }
            router.replace("/home" as any);
          }}
        >
          <Ionicons name="chevron-back" size={24} color="#2F6B57" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {isEditMode ? "프로필 수정" : "프로필"}
        </Text>

        {isEditMode ? (
          <TouchableOpacity
            style={styles.deleteHeaderButton}
            onPress={handleDeleteProfile}
          >
            <Text style={styles.deleteHeaderButtonText}>삭제</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}
      </View>

      <View style={styles.line} />

      {!isEditMode ? (
        <ScrollView
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.listTitle}>내 반려동물</Text>

          {profiles.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.profileCard}
              activeOpacity={0.85}
              onPress={() => handleProfileCardPress(item, index)}
            >
              <View style={styles.profileCardAvatar}>
                {renderCardIcon(item.petType)}
              </View>

              <View style={styles.profileCardTextWrap}>
                <Text style={styles.profileCardName}>{item.name}</Text>
                <Text style={styles.profileCardInfo}>
                  {item.age || "-"} / {item.weight ? `${item.weight}kg` : "-"} /{" "}
                  {item.gender || "-"} / {item.bcs || "-"} /{" "}
                  {getDiseaseText(item.diseases)}
                </Text>
              </View>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.addProfileButton}
            onPress={handleAddProfile}
          >
            <Text style={styles.addProfileButtonText}>⊕ 프로필 추가하기</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={styles.editContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.editAvatar}>{renderProfileIcon(petType)}</View>

          <TextInput
            placeholder="이름"
            placeholderTextColor="#777"
            style={[styles.input, errors.name && styles.inputErrorBorder]}
            value={name}
            onChangeText={handleNameChange}
            onBlur={sanitizeNameOnBlur}
            onEndEditing={sanitizeNameOnBlur}
          />
          {errors.name ? (
            <Text style={styles.errorText}>{errors.name}</Text>
          ) : null}

          <TextInput
            placeholder="몸무게(kg)"
            placeholderTextColor="#777"
            style={[styles.input, errors.weight && styles.inputErrorBorder]}
            value={weight}
            onChangeText={(text) => {
              const filtered = filterWeightInput(text);
              setWeight(filtered);

              if (text !== filtered) {
                setErrors((prev) => ({
                  ...prev,
                  weight:
                    "몸무게는 정수 3자리까지, 소수는 1자리까지 입력 가능합니다.",
                }));
                return;
              }

              clearFieldError("weight");
            }}
            keyboardType="decimal-pad"
            maxLength={5}
          />
          {errors.weight ? (
            <Text style={styles.errorText}>{errors.weight}</Text>
          ) : null}

          {renderAgeSelector(false)}

          <Text style={styles.sectionLabel}>성별</Text>
          <View style={styles.genderRow}>
            {(["남", "여", "중성화"] as GenderType[]).map((item) => (
              <TouchableOpacity
                key={item}
                style={[
                  styles.genderButton,
                  gender === item && styles.selectedButton,
                  errors.gender && styles.inputErrorBorder,
                ]}
                onPress={() => {
                  setGender(item);
                  clearFieldError("gender");
                }}
              >
                <Text
                  style={[
                    styles.selectButtonText,
                    gender === item && styles.selectedButtonText,
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {errors.gender ? (
            <Text style={styles.errorText}>{errors.gender}</Text>
          ) : null}

          <Text style={styles.sectionLabel}>종</Text>
          <View style={styles.row}>
            <TouchableOpacity
              style={[
                styles.selectButton,
                petType === "강아지" && styles.selectedButton,
                errors.petType && styles.inputErrorBorder,
              ]}
              onPress={() => {
                setPetType("강아지");
                clearFieldError("petType");
              }}
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
                errors.petType && styles.inputErrorBorder,
              ]}
              onPress={() => {
                setPetType("고양이");
                clearFieldError("petType");
              }}
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
          {errors.petType ? (
            <Text style={styles.errorText}>{errors.petType}</Text>
          ) : null}

          <Text style={styles.sectionLabel}>BCS</Text>
          <View style={styles.bcsRow}>
            <View
              style={[
                styles.bcsValueBox,
                errors.bcs && styles.inputErrorBorder,
              ]}
            >
              <Text style={styles.bcsValueText}>{bcs || "선택 안됨"}</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.bcsEditButton,
                errors.bcs && styles.inputErrorBorder,
              ]}
              onPress={handleBcsEditPress}
            >
              <Text style={styles.bcsEditButtonText}>수정</Text>
            </TouchableOpacity>
          </View>
          {errors.bcs ? (
            <Text style={styles.errorText}>{errors.bcs}</Text>
          ) : null}

          <Text style={styles.sectionLabel}>질병</Text>
          <View style={styles.bcsRow}>
            <View
              style={[
                styles.bcsValueBox,
                errors.diseases && styles.inputErrorBorder,
              ]}
            >
              <Text style={styles.bcsValueText}>
                {diseases.length > 0 ? diseases.join(", ") : "선택 안됨"}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.bcsEditButton,
                errors.diseases && styles.inputErrorBorder,
              ]}
              onPress={handleDiseaseEditPress}
            >
              <Text style={styles.bcsEditButtonText}>수정</Text>
            </TouchableOpacity>
          </View>
          {errors.diseases ? (
            <Text style={styles.errorText}>{errors.diseases}</Text>
          ) : null}

          <TouchableOpacity
            style={styles.singleSaveButton}
            onPress={handleSave}
          >
            <Text style={styles.singleSaveButtonText}>저장</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
    paddingTop: 92,
    paddingBottom: 42,
  },
  firstTitle: {
    fontSize: 28,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 36,
  },
  firstInput: {
    width: "100%",
    height: FIRST_BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#B6CEC4",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: "Nanum",
    color: "#222",
    marginBottom: 6,
  },
  firstSectionLabel: {
    width: "100%",
    fontSize: 15,
    fontFamily: "NanumB",
    color: "#2F6B57",
    marginTop: 4,
    marginBottom: 10,
    paddingLeft: 2,
  },
  firstRow: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
    marginBottom: 6,
  },
  firstAgeRow: {
    width: "100%",
    flexDirection: "row",
    gap: 12,
    marginBottom: 0,
  },
  firstSelectButton: {
    flex: 1,
    height: FIRST_BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#B6CEC4",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  firstGenderRow: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginBottom: 6,
  },
  firstGenderButton: {
    flex: 1,
    height: FIRST_BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#B6CEC4",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  firstAgeBox: {
    flex: 1,
    height: FIRST_BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#B6CEC4",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  firstAgeValueText: {
    fontSize: 15,
    fontFamily: "Nanum",
    color: "#222",
  },
  firstSelectedButton: {
    backgroundColor: "#2F6B57",
    borderColor: "#2F6B57",
  },
  firstSelectButtonText: {
    fontSize: 15,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  firstSelectedButtonText: {
    color: "#FFFFFF",
  },
  firstNextButton: {
    width: "100%",
    height: FIRST_BOX_HEIGHT,
    borderRadius: 18,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 20,
  },
  firstNextButtonText: {
    color: "#FFFFFF",
    fontSize: 20,
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
  deleteHeaderButton: {
    minWidth: 36,
    alignItems: "flex-end",
  },
  deleteHeaderButtonText: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#C24848",
  },
  line: {
    height: 1,
    backgroundColor: "#777",
    opacity: 0.5,
  },

  listContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  listTitle: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#2F6B57",
    marginBottom: 12,
  },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF3EF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  profileCardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#D4E4DC",
  },
  profileCardTextWrap: {
    flex: 1,
  },
  profileCardName: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#111111",
    marginBottom: 4,
  },
  profileCardInfo: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#666666",
    lineHeight: 18,
  },
  addProfileButton: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#2F6B57",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 6,
  },
  addProfileButtonText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },

  editContainer: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
    alignItems: "center",
  },
  editAvatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 2,
    borderColor: "#2F6B57",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 18,
    alignSelf: "center",
  },

  input: {
    width: "100%",
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#222",
    marginBottom: 6,
  },
  sectionLabel: {
    width: "100%",
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#2F6B57",
    marginTop: 2,
    marginBottom: 8,
    paddingLeft: 4,
  },
  row: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginBottom: 6,
  },
  ageSection: {
    width: "100%",
    marginBottom: 6,
  },
  ageRow: {
    width: "100%",
    flexDirection: "row",
    gap: 10,
    marginBottom: 0,
  },
  ageBox: {
    flex: 1,
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ageValueText: {
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#222",
  },
  placeholderText: {
    color: "#8A8A8A",
  },

  genderRow: {
    width: "100%",
    flexDirection: "row",
    gap: 8,
    marginBottom: 6,
  },
  genderButton: {
    flex: 1,
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
  },
  selectedButton: {
    backgroundColor: "#2F6B57",
    borderColor: "#2F6B57",
  },
  selectButton: {
    flex: 1,
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  selectButtonText: {
    fontSize: 15,
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
    marginBottom: 6,
  },
  bcsValueBox: {
    flex: 1,
    minHeight: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bcsValueText: {
    fontSize: 17,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },
  bcsEditButton: {
    width: 80,
    height: BOX_HEIGHT,
    borderRadius: 16,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#2F6B57",
  },
  bcsEditButtonText: {
    fontSize: 17,
    fontFamily: "Nanum",
    color: "#FFFFFF",
  },

  singleSaveButton: {
    width: "100%",
    height: 50,
    borderRadius: 16,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 16,
  },
  singleSaveButtonText: {
    color: "#FFF",
    fontSize: 19,
    fontFamily: "Nanum",
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.30)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalBackdrop: {
    position: "absolute",
    width: "100%",
    height: "100%",
  },
  modalCard: {
    width: "88%",
    maxWidth: 320,
    height: "55%",
    maxHeight: 500,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    paddingTop: 28,
    paddingHorizontal: 22,
    paddingBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 10,
    letterSpacing: -0.4,
  },
  modalList: {
    flexGrow: 0,
    maxHeight: 360,
  },
  modalListContent: {
    paddingBottom: 2,
    paddingTop: 0,
  },
  modalItem: {
    height: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  modalItemText: {
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#222222",
    letterSpacing: -0.3,
  },
  modalCloseButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  modalCloseButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontFamily: "NanumB",
  },

  errorText: {
    width: "100%",
    color: "#D64545",
    fontSize: 13,
    fontFamily: "Nanum",
    marginTop: 2,
    marginBottom: 8,
    paddingLeft: 4,
  },
  inputErrorBorder: {
    borderColor: "#D64545",
  },
});
