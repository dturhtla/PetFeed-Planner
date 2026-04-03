import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

type StoredSinglePetProfile = {
  name?: string;
  age?: string;
  weight?: string;
  gender?: string;
  petType?: string;
  bcs?: string;
};

type PetProfileItem = {
  id: string;
  name: string;
  petType?: string;
};

type FeedingRecord = {
  id: string;
  petId: string;
  date: string;
  foodName: string;
  amount: string;
  time: string;
};

const FOOD_OPTIONS = ["로얄캐닌", "힐스", "오리젠", "나우", "사료 직접입력"];

const TIME_OPTIONS = [
  "07:00 AM",
  "08:00 AM",
  "09:00 AM",
  "12:00 PM",
  "06:00 PM",
  "08:00 PM",
  "10:00 PM",
];

export default function RecordsScreen() {
  const insets = useSafeAreaInsets();

  const [userEmail, setUserEmail] = useState("");
  const [petProfiles, setPetProfiles] = useState<PetProfileItem[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string>("");

  const [records, setRecords] = useState<FeedingRecord[]>([]);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isFoodMenuOpen, setIsFoodMenuOpen] = useState(false);
  const [isTimeMenuOpen, setIsTimeMenuOpen] = useState(false);

  const [selectedFood, setSelectedFood] = useState("");
  const [isCustomFoodInput, setIsCustomFoodInput] = useState(false);
  const [customFoodName, setCustomFoodName] = useState("");

  const [amount, setAmount] = useState("0");
  const [selectedTime, setSelectedTime] = useState("00:00 AM");

  const getRecordsKey = (email: string) => `feedingRecords_${email}`;

  const formatDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    const day = `${now.getDate()}`.padStart(2, "0");
    return `${year}.${month}.${day}`;
  };

  const filterAmountInput = (value: string) => {
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

  const resetAddForm = useCallback(() => {
    setSelectedFood("");
    setCustomFoodName("");
    setIsCustomFoodInput(false);
    setAmount("0");
    setSelectedTime("00:00 AM");
    setIsFoodMenuOpen(false);
    setIsTimeMenuOpen(false);
  }, []);

  const closeAddModal = useCallback(() => {
    setIsAddModalVisible(false);
    resetAddForm();
  }, [resetAddForm]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return gestureState.dy > 6;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 45) {
            closeAddModal();
          }
        },
      }),
    [closeAddModal],
  );

  const loadProfilesAndRecords = useCallback(async () => {
    try {
      const savedUser = await AsyncStorage.getItem("loggedInUser");

      if (!savedUser) {
        setUserEmail("");
        setPetProfiles([]);
        setSelectedPetId("");
        setRecords([]);
        return;
      }

      const parsedUser = JSON.parse(savedUser);
      const email = parsedUser.email;
      setUserEmail(email);

      const savedMultiProfiles = await AsyncStorage.getItem(
        `petProfiles_${email}`,
      );
      const savedSingleProfile = await AsyncStorage.getItem(
        `petProfile_${email}`,
      );
      const savedRecords = await AsyncStorage.getItem(getRecordsKey(email));

      let loadedProfiles: PetProfileItem[] = [];

      if (savedMultiProfiles) {
        const parsedMulti = JSON.parse(savedMultiProfiles);

        if (Array.isArray(parsedMulti)) {
          loadedProfiles = parsedMulti.map((item: any, index: number) => ({
            id: String(item.id ?? index + 1),
            name: item.name || `반려동물${index + 1}`,
            petType: item.petType || "",
          }));
        }
      } else if (savedSingleProfile) {
        const parsedSingle: StoredSinglePetProfile =
          JSON.parse(savedSingleProfile);

        loadedProfiles = [
          {
            id: "1",
            name: parsedSingle.name || "반려동물",
            petType: parsedSingle.petType || "",
          },
        ];
      }

      if (loadedProfiles.length === 0) {
        loadedProfiles = [
          {
            id: "placeholder-1",
            name: "반려동물",
            petType: "",
          },
        ];
      }

      setPetProfiles(loadedProfiles);

      setSelectedPetId((prev) => {
        if (prev && loadedProfiles.some((pet) => pet.id === prev)) {
          return prev;
        }
        return loadedProfiles[0]?.id || "";
      });

      if (savedRecords) {
        const parsedRecords = JSON.parse(savedRecords);
        setRecords(Array.isArray(parsedRecords) ? parsedRecords : []);
      } else {
        setRecords([]);
      }
    } catch (error) {
      console.log(error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadProfilesAndRecords();
    }, [loadProfilesAndRecords]),
  );

  const filteredRecords = useMemo(() => {
    return records
      .filter((record) => record.petId === selectedPetId)
      .slice()
      .reverse();
  }, [records, selectedPetId]);

  const selectedPet = useMemo(() => {
    return petProfiles.find((pet) => pet.id === selectedPetId);
  }, [petProfiles, selectedPetId]);

  const handleSaveRecord = async () => {
    if (!userEmail || !selectedPetId) return;

    const finalFoodName = isCustomFoodInput
      ? customFoodName.trim()
      : selectedFood.trim();

    if (!finalFoodName) return;
    if (!amount.trim()) return;

    try {
      const newRecord: FeedingRecord = {
        id: `${Date.now()}`,
        petId: selectedPetId,
        date: formatDate(),
        foodName: finalFoodName,
        amount: `${amount}g`,
        time: selectedTime,
      };

      const updatedRecords = [...records, newRecord];
      setRecords(updatedRecords);

      await AsyncStorage.setItem(
        getRecordsKey(userEmail),
        JSON.stringify(updatedRecords),
      );

      closeAddModal();
    } catch (error) {
      console.log(error);
    }
  };

  const handleDecreaseAmount = () => {
    const current = Number(amount || "0");
    const next = Math.max(0, current - 5);
    setAmount(String(next));
  };

  const handleIncreaseAmount = () => {
    const current = Number(amount || "0");
    const next = current + 5;
    setAmount(String(next));
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={24} color="#2F6B57" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>급여기록</Text>

        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.line} />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.profileRow}
        >
          {petProfiles.map((pet) => {
            const isSelected = pet.id === selectedPetId;

            return (
              <TouchableOpacity
                key={pet.id}
                style={styles.profileWrap}
                onPress={() => setSelectedPetId(pet.id)}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.profileCircle,
                    isSelected && styles.profileCircleSelected,
                  ]}
                >
                  <Ionicons
                    name={pet.petType === "강아지" ? "paw" : "logo-octocat"}
                    size={24}
                    color={isSelected ? "#2F6B57" : "#7C7C7C"}
                  />
                </View>

                <Text
                  style={[
                    styles.profileName,
                    isSelected && styles.profileNameSelected,
                  ]}
                  numberOfLines={1}
                >
                  {pet.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.noticeBox}>
          <View style={styles.noticeLeft}>
            <Ionicons name="notifications-outline" size={16} color="#D58A3A" />
            <Text style={styles.noticeText}>급여 알림을 등록해주세요</Text>
          </View>

          <TouchableOpacity activeOpacity={0.8}>
            <Text style={styles.noticeLink}>입력 →</Text>
          </TouchableOpacity>
        </View>

        {filteredRecords.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>아직 급여 기록이 없어요</Text>
            <Text style={styles.emptyDesc}>
              오른쪽 아래 + 버튼으로{"\n"}
              {selectedPet?.name || "반려동물"}의 급여 기록을 추가해보세요
            </Text>
          </View>
        ) : (
          <View style={styles.recordList}>
            {filteredRecords.map((record) => (
              <View key={record.id} style={styles.recordCard}>
                <View style={styles.recordTopRow}>
                  <Text style={styles.recordDate}>{record.date}</Text>
                  <Text style={styles.recordTime}>{record.time}</Text>
                </View>
                <Text style={styles.recordFood}>{record.foodName}</Text>
                <Text style={styles.recordAmount}>{record.amount}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity
        style={[
          styles.fab,
          {
            bottom: insets.bottom + 20,
          },
        ]}
        activeOpacity={0.85}
        onPress={() => setIsAddModalVisible(true)}
      >
        <Ionicons name="add" size={22} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal
        visible={isAddModalVisible}
        transparent
        animationType="slide"
        onRequestClose={closeAddModal}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={styles.modalBackdrop} onPress={closeAddModal} />

          <View
            {...panResponder.panHandlers}
            style={[styles.bottomSheet, { paddingBottom: insets.bottom + 4 }]}
          >
            <View style={styles.sheetHandle} />

            <View style={styles.contentWrap}>
              <Text style={styles.sheetTitle}>새 급여 기록하기</Text>

              <View style={styles.fieldGroup}>
                {isCustomFoodInput ? (
                  <View style={styles.customFoodRow}>
                    <TextInput
                      style={styles.customFoodInput}
                      placeholder="사료명을 직접 입력하세요"
                      placeholderTextColor="#8A8A8A"
                      value={customFoodName}
                      onChangeText={setCustomFoodName}
                    />
                    <TouchableOpacity
                      style={styles.customFoodCancelButton}
                      onPress={() => {
                        const trimmed = customFoodName.trim();
                        if (!trimmed) return;

                        setSelectedFood(trimmed);
                        setIsCustomFoodInput(false);
                        setCustomFoodName("");
                      }}
                    >
                      <Text style={styles.customFoodCancelText}>선택</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.inputBox}
                    activeOpacity={0.85}
                    onPress={() => {
                      setIsFoodMenuOpen((prev) => !prev);
                      setIsTimeMenuOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.inputText,
                        !selectedFood && styles.placeholderText,
                      ]}
                    >
                      {selectedFood || "사료 선택하기"}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color="#2F6B57" />
                  </TouchableOpacity>
                )}

                {isFoodMenuOpen && !isCustomFoodInput && (
                  <View style={styles.dropdownBox}>
                    {FOOD_OPTIONS.map((food) => (
                      <TouchableOpacity
                        key={food}
                        style={styles.dropdownItem}
                        onPress={() => {
                          if (food === "사료 직접입력") {
                            setIsCustomFoodInput(true);
                            setSelectedFood("");
                          } else {
                            setSelectedFood(food);
                          }
                          setIsFoodMenuOpen(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{food}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.amountBox}>
                <Text style={styles.amountLabel}>급여량</Text>

                <View style={styles.amountRight}>
                  <TouchableOpacity
                    onPress={handleDecreaseAmount}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="remove-circle" size={20} color="#2F6B57" />
                  </TouchableOpacity>

                  <View style={styles.amountValueWrap}>
                    <Text style={styles.amountValue}>{amount}</Text>
                    <Text style={styles.amountUnit}>g</Text>
                  </View>

                  <TouchableOpacity
                    onPress={handleIncreaseAmount}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="add-circle" size={20} color="#2F6B57" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <TouchableOpacity
                  style={styles.inputBox}
                  activeOpacity={0.85}
                  onPress={() => {
                    setIsTimeMenuOpen((prev) => !prev);
                    setIsFoodMenuOpen(false);
                  }}
                >
                  <Text style={styles.inputText}>시간 {selectedTime}</Text>
                  <Ionicons name="chevron-down" size={18} color="#2F6B57" />
                </TouchableOpacity>

                {isTimeMenuOpen && (
                  <View style={styles.dropdownBox}>
                    {TIME_OPTIONS.map((time) => (
                      <TouchableOpacity
                        key={time}
                        style={styles.dropdownItem}
                        onPress={() => {
                          setSelectedTime(time);
                          setIsTimeMenuOpen(false);
                        }}
                      >
                        <Text style={styles.dropdownItemText}>{time}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.sheetButtonRow}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={closeAddModal}
                >
                  <Text style={styles.cancelButtonText}>취소</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveRecord}
                >
                  <Text style={styles.saveButtonText}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#F6F7F4",
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
  headerPlaceholder: {
    width: 24,
  },
  line: {
    height: 1,
    backgroundColor: "#777",
    opacity: 0.5,
  },

  container: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 140,
  },

  profileRow: {
    paddingRight: 8,
    marginBottom: 22,
  },
  profileWrap: {
    alignItems: "center",
    marginRight: 10,
    width: 70,
  },
  profileCircle: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: "#D3D3D3",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E0E0",
  },
  profileCircleSelected: {
    borderColor: "#2F6B57",
    borderWidth: 2,
  },
  profileName: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: "Nanum",
    color: "#8A8A8A",
  },
  profileNameSelected: {
    color: "#2F6B57",
  },

  noticeBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFF1E7",
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#E8B68A",
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 26,
  },
  noticeLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  noticeText: {
    marginLeft: 10,
    fontSize: 15,
    fontFamily: "Nanum",
    color: "#B1722F",
  },
  noticeLink: {
    fontSize: 15,
    fontFamily: "Nanum",
    color: "#D06B33",
  },

  emptyWrap: {
    minHeight: 470,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Nanum",
    color: "#4B4B4B",
    marginBottom: 16,
  },
  emptyDesc: {
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#8B8B8B",
    textAlign: "center",
    lineHeight: 28,
  },

  recordList: {
    gap: 12,
  },
  recordCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  recordTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  recordDate: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#888888",
  },
  recordTime: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#888888",
  },
  recordFood: {
    fontSize: 16,
    fontFamily: "Nanum",
    color: "#222222",
    marginBottom: 4,
  },
  recordAmount: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#2F6B57",
  },

  fab: {
    position: "absolute",
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#2F7A5F",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  bottomSheet: {
    height: 300,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 16,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#C9C9C9",
    marginBottom: 14,
  },
  contentWrap: {
    flex: 1,
    justifyContent: "flex-start",
  },
  sheetTitle: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#222222",
    marginBottom: 14,
  },

  fieldGroup: {
    marginBottom: 10,
  },
  inputBox: {
    height: 44,
    borderWidth: 1,
    borderColor: "#2F6B57",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inputText: {
    fontSize: 13,
    fontFamily: "Nanum",
    color: "#222222",
  },
  placeholderText: {
    color: "#7F8A84",
  },

  dropdownBox: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#D6E2DC",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EEF2F0",
  },
  dropdownItemText: {
    fontSize: 13,
    fontFamily: "Nanum",
    color: "#222222",
  },

  customFoodRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  customFoodInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: "#2F6B57",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: "Nanum",
    color: "#222222",
  },
  customFoodCancelButton: {
    width: 64,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
  },
  customFoodCancelText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#FFFFFF",
  },

  amountBox: {
    height: 44,
    borderWidth: 1,
    borderColor: "#2F6B57",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  amountLabel: {
    fontSize: 13,
    fontFamily: "Nanum",
    color: "#8A8A8A",
  },
  amountRight: {
    flexDirection: "row",
    alignItems: "center",
    width: 120,
    justifyContent: "space-between",
  },
  amountValueWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 50,
  },
  amountValue: {
    fontSize: 15,
    fontFamily: "NanumB",
    color: "#222222",
    textAlign: "center",
  },
  amountUnit: {
    marginLeft: 3,
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#222222",
  },

  sheetButtonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#D4D4D4",
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#333333",
  },
  saveButton: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#FFFFFF",
  },
});
