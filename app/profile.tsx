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
};

type FieldErrors = {
  name?: string;
  age?: string;
  weight?: string;
  gender?: string;
  petType?: string;
  bcs?: string;
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
  const [ageYears, setAgeYears] = useState("");
  const [ageMonths, setAgeMonths] = useState("-");
  const [weight, setWeight] = useState("");
  const [gender, setGender] = useState<GenderType>("");
  const [petType, setPetType] = useState<PetType>("");
  const [bcs, setBcs] = useState<BcsLabel>("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [openPicker, setOpenPicker] = useState<PickerType>(null);

  const getDraftKey = (email: string) => `petProfileDraft_${email}`;
  const getProfileKey = (email: string) => `petProfile_${email}`;
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

  const getAgeDisplay = () => {
    const hasYear = ageYears !== "";
    const hasMonth = ageMonths !== "-";

    if (!hasYear && !hasMonth) return "-";

    if (ageYears === "0" && hasMonth) {
      return `${ageMonths}개월`;
    }

    if (hasYear && hasMonth) return `${ageYears}년 ${ageMonths}개월`;
    if (hasYear) return `${ageYears}년`;
    return `${ageMonths}개월`;
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

  const applyProfileData = useCallback((data?: Partial<ProfileData>) => {
    setName(data?.name || "");
    parseAgeString(data?.age || "");
    setWeight(data?.weight || "");
    setGender((data?.gender as GenderType) || "");
    setPetType((data?.petType as PetType) || "");
    setBcs((data?.bcs as BcsLabel) || "");
  }, []);

  const clearFieldError = (field: keyof FieldErrors) => {
    setErrors((prev) => ({
      ...prev,
      [field]: undefined,
    }));
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
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

      setErrors({});
    } catch (error) {
      console.log(error);
      setIsEditMode(true);
    } finally {
      setIsLoaded(true);
    }
  }, [returnedFromBcsEdit, returnedSelectedBcs, router, applyProfileData]);

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
      name: normalizeName(filterNameInput(name)),
      age: formatAgeForSave(),
      weight: weight.trim(),
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

      const alreadyCompleted = await AsyncStorage.getItem(
        getCompletedKey(userEmail),
      );

      const formattedWeight = formatWeightForSave(weight);
      const normalizedName = normalizeName(filterNameInput(name));

      const finalProfile: ProfileData = {
        name: normalizedName,
        age: formatAgeForSave(),
        weight: formattedWeight,
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
      setErrors({});
      setName(normalizedName);
      setWeight(formattedWeight);

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
      setErrors({});
      await saveDraft();
    } catch (error) {
      console.log(error);
      setIsEditMode(true);
    }
  };

  const renderProfileIcon = () => {
    if (petType === "고양이") {
      return <Ionicons name="logo-octocat" size={52} color="#111" />;
    }

    return <Ionicons name="paw" size={52} color="#111" />;
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

  const renderPickerDropdown = (
    type: "year" | "month",
    isFirstScreen: boolean,
  ) => {
    const options = type === "year" ? YEAR_OPTIONS : MONTH_OPTIONS;
    const isYear = type === "year";

    return (
      <View
        style={[
          styles.dropdownBox,
          { top: (isFirstScreen ? FIRST_BOX_HEIGHT : BOX_HEIGHT) + 8 },
          isYear ? styles.leftDropdown : styles.rightDropdown,
        ]}
      >
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {options.map((option) => (
            <TouchableOpacity
              key={`${type}-${option}`}
              style={styles.dropdownItem}
              onPress={() => {
                if (type === "year") {
                  setAgeYears(option);
                } else {
                  setAgeMonths(option);
                }
                clearFieldError("age");
                setOpenPicker(null);
              }}
            >
              <Text style={styles.dropdownItemText}>
                {type === "year"
                  ? `${option}년`
                  : option === "-"
                    ? "-"
                    : `${option}개월`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
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
              onPress={() =>
                setOpenPicker(openPicker === "year" ? null : "year")
              }
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
              onPress={() =>
                setOpenPicker(openPicker === "month" ? null : "month")
              }
            >
              <Text
                style={[textStyle, ageMonths === "-" && styles.placeholderText]}
              >
                {ageMonths === "-" ? "개월" : `${ageMonths}개월`}
              </Text>
              <Ionicons name="caret-down" size={20} color="#2F6B57" />
            </TouchableOpacity>
          </View>

          {openPicker === "year" && renderPickerDropdown("year", isFirstScreen)}
          {openPicker === "month" &&
            renderPickerDropdown("month", isFirstScreen)}
        </View>
        {errors.age ? <Text style={styles.errorText}>{errors.age}</Text> : null}
      </>
    );
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

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
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
                  <Text style={styles.label}>몸무게: </Text>
                  {weight ? `${weight}kg` : "-"}
                </Text>
                <View style={styles.underline} />
              </View>

              <View style={styles.infoItem}>
                <Text style={styles.infoValue}>
                  <Text style={styles.label}>나이: </Text>
                  {getAgeDisplay()}
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
  line: {
    height: 1,
    backgroundColor: "#777",
    opacity: 0.5,
  },
  container: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
    alignItems: "center",
  },
  editText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#666",
    marginBottom: 14,
  },
  avatar: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 2,
    borderColor: "#2F6B57",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
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
  infoList: {
    width: "100%",
    alignItems: "center",
  },
  infoItem: {
    width: "78%",
    alignItems: "center",
    marginBottom: 16,
  },
  infoValue: {
    fontSize: 21,
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
    position: "relative",
    marginBottom: 6,
    zIndex: 10,
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
    borderRadius: 16,
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
  dropdownBox: {
    position: "absolute",
    top: BOX_HEIGHT + 8,
    width: "48%",
    maxHeight: 220,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.2,
    borderColor: "#B6CEC4",
    borderRadius: 14,
    paddingVertical: 4,
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  leftDropdown: {
    left: 0,
  },
  rightDropdown: {
    right: 0,
  },
  dropdownItem: {
    height: 44,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  dropdownItemText: {
    fontSize: 15,
    fontFamily: "Nanum",
    color: "#222",
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
    height: BOX_HEIGHT,
    borderWidth: 1.5,
    borderColor: "#A9C3B7",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    paddingHorizontal: 16,
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
