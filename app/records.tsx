import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Modal,
  PanResponder,
  Platform,
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

type FoodItem = {
  id: string;
  name: string;
  subLabel: string;
  gramLabel: string;
  isCustom?: boolean;
};

type AlarmItem = {
  id: string;
  period: "오전" | "오후";
  hour: string;
  minute: string;
  feedingType: "아침" | "점심" | "저녁";
  foodName: string;
  foodSubLabel: string;
  amount: number;
  days: string[];
  enabled: boolean;
};

const DEFAULT_FOOD_LIBRARY: FoodItem[] = [
  {
    id: "1",
    name: "로얄캐닌 키튼",
    subLabel: "육묘용 50g",
    gramLabel: "50g",
  },
  {
    id: "2",
    name: "힐스 사이언스 다이어트",
    subLabel: "40g",
    gramLabel: "40g",
  },
  {
    id: "3",
    name: "캐니노 프로플랜",
    subLabel: "45g",
    gramLabel: "45g",
  },
  {
    id: "4",
    name: "네추럴발란스",
    subLabel: "35g",
    gramLabel: "35g",
  },
  {
    id: "5",
    name: "오리젠 키튼",
    subLabel: "30g",
    gramLabel: "30g",
  },
];

const getAlarmKey = (email: string) => `feeding_alarms_${email}`;
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function createInitialTime() {
  const date = new Date();
  date.setHours(0);
  date.setMinutes(0);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
}

function to24Hour(period: "오전" | "오후", hour: string) {
  let h = Number(hour);

  if (period === "오전") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }

  return h;
}

function formatAlarmDisplayTime(alarm: AlarmItem) {
  const h = to24Hour(alarm.period, alarm.hour);
  return `${String(h).padStart(2, "0")}:${alarm.minute}`;
}

function matchesDay(alarm: AlarmItem, dayKor: string) {
  if (!alarm.days || alarm.days.length === 0) return false;
  return alarm.days.includes(dayKor);
}

function getNearestUpcomingAlarm(alarms: AlarmItem[]) {
  const now = new Date();
  const enabledAlarms = alarms.filter((alarm) => alarm.enabled);

  if (enabledAlarms.length === 0) return null;

  let nearest: { alarm: AlarmItem; at: Date } | null = null;

  for (const alarm of enabledAlarms) {
    for (let addDay = 0; addDay < 7; addDay++) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + addDay);

      const dayKor = DAYS[candidate.getDay()];
      if (!matchesDay(alarm, dayKor)) continue;

      candidate.setHours(to24Hour(alarm.period, alarm.hour));
      candidate.setMinutes(Number(alarm.minute));
      candidate.setSeconds(0);
      candidate.setMilliseconds(0);

      if (candidate <= now) continue;

      if (!nearest || candidate < nearest.at) {
        nearest = { alarm, at: candidate };
      }
      break;
    }
  }

  return nearest?.alarm ?? null;
}

export default function RecordsScreen() {
  const insets = useSafeAreaInsets();

  const [userEmail, setUserEmail] = useState("");
  const [petProfiles, setPetProfiles] = useState<PetProfileItem[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string>("");

  const [records, setRecords] = useState<FeedingRecord[]>([]);

  const [nearestAlarm, setNearestAlarm] = useState<AlarmItem | null>(null);
  const [hasAnyEnabledAlarm, setHasAnyEnabledAlarm] = useState(false);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isFoodSheetVisible, setIsFoodSheetVisible] = useState(false);
  const [isTimePickerVisible, setIsTimePickerVisible] = useState(false);
  const [isAddFoodFormVisible, setIsAddFoodFormVisible] = useState(false);

  const [foodLibrary, setFoodLibrary] =
    useState<FoodItem[]>(DEFAULT_FOOD_LIBRARY);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [tempSelectedFood, setTempSelectedFood] = useState<FoodItem | null>(
    null,
  );

  const [newFoodName, setNewFoodName] = useState("");
  const [newFoodGram, setNewFoodGram] = useState("");

  const [amount, setAmount] = useState("0");
  const [selectedTime, setSelectedTime] = useState<Date>(createInitialTime());

  const getRecordsKey = (email: string) => `feedingRecords_${email}`;

  const formatDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    const day = `${now.getDate()}`.padStart(2, "0");
    return `${year}.${month}.${day}`;
  };

  const formatDisplayTime = (date: Date) => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const isPM = hours >= 12;
    const period = isPM ? "PM" : "AM";
    const displayHour = hours % 12 === 0 ? 12 : hours % 12;

    return `${String(displayHour).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0",
    )} ${period}`;
  };

  const resetAddForm = useCallback(() => {
    setSelectedFood(null);
    setTempSelectedFood(null);
    setAmount("0");
    setSelectedTime(createInitialTime());
    setIsFoodSheetVisible(false);
    setIsTimePickerVisible(false);
    setIsAddFoodFormVisible(false);
    setNewFoodName("");
    setNewFoodGram("");
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
          if (
            gestureState.dy > 45 &&
            !isFoodSheetVisible &&
            !isTimePickerVisible
          ) {
            closeAddModal();
          }
        },
      }),
    [closeAddModal, isFoodSheetVisible, isTimePickerVisible],
  );

  const foodSheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return gestureState.dy > 6;
        },
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy > 45) {
            setIsFoodSheetVisible(false);
            setIsAddFoodFormVisible(false);
          }
        },
      }),
    [],
  );

  const loadProfilesAndRecords = useCallback(async () => {
    try {
      const savedUser = await AsyncStorage.getItem("loggedInUser");

      if (!savedUser) {
        setUserEmail("");
        setPetProfiles([]);
        setSelectedPetId("");
        setRecords([]);
        setNearestAlarm(null);
        setHasAnyEnabledAlarm(false);
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
      const savedAlarms = await AsyncStorage.getItem(getAlarmKey(email));

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

      const parsedAlarms: AlarmItem[] = savedAlarms
        ? JSON.parse(savedAlarms)
        : [];
      const enabledAlarms = Array.isArray(parsedAlarms)
        ? parsedAlarms.filter((alarm) => alarm.enabled)
        : [];

      setHasAnyEnabledAlarm(enabledAlarms.length > 0);
      setNearestAlarm(getNearestUpcomingAlarm(enabledAlarms));
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
    if (!selectedFood) return;
    if (!amount.trim()) return;

    try {
      const newRecord: FeedingRecord = {
        id: `${Date.now()}`,
        petId: selectedPetId,
        date: formatDate(),
        foodName: selectedFood.name,
        amount: `${amount}g`,
        time: formatDisplayTime(selectedTime),
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

  const openFoodSheet = () => {
    setTempSelectedFood(selectedFood);
    setIsAddFoodFormVisible(false);
    setNewFoodName("");
    setNewFoodGram("");
    setIsFoodSheetVisible(true);
  };

  const handleCompleteFoodSelection = () => {
    setSelectedFood(tempSelectedFood);
    setIsFoodSheetVisible(false);
    setIsAddFoodFormVisible(false);
    setNewFoodName("");
    setNewFoodGram("");
  };

  const handleTimeChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === "android") {
      setIsTimePickerVisible(false);

      if (event.type === "set" && date) {
        setSelectedTime(date);
      }
      return;
    }

    if (date) {
      setSelectedTime(date);
    }
  };

  const handleAddNewFood = () => {
    const trimmedName = newFoodName.trim();
    const trimmedGram = newFoodGram.trim();

    if (!trimmedName || !trimmedGram) return;

    const gramOnly = trimmedGram.replace(/[^0-9]/g, "");
    if (!gramOnly) return;

    const newItem: FoodItem = {
      id: `custom-${Date.now()}`,
      name: trimmedName,
      subLabel: `${gramOnly}g`,
      gramLabel: `${gramOnly}g`,
      isCustom: true,
    };

    setFoodLibrary((prev) => [newItem, ...prev]);
    setTempSelectedFood(newItem);
    setIsAddFoodFormVisible(false);
    setNewFoodName("");
    setNewFoodGram("");
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

        {!hasAnyEnabledAlarm || !nearestAlarm ? (
          <TouchableOpacity
            style={styles.noticeBox}
            activeOpacity={0.85}
            onPress={() => router.push("/feeding-alarm")}
          >
            <View style={styles.noticeLeft}>
              <Ionicons
                name="notifications-outline"
                size={16}
                color="#D58A3A"
              />
              <Text style={styles.noticeText}>급여 알림을 등록해주세요</Text>
            </View>

            <View style={styles.noticeRight}>
              <Text style={styles.noticeLink}>입력</Text>
              <Ionicons name="chevron-forward" size={16} color="#D06B33" />
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.alarmPreviewBox}
            activeOpacity={0.85}
            onPress={() => router.push("/feeding-alarm")}
          >
            <View style={styles.alarmPreviewLeft}>
              <Ionicons
                name="notifications-outline"
                size={18}
                color="#D2A11D"
                style={styles.alarmBellIcon}
              />

              <Text style={styles.alarmPreviewTime}>
                {formatAlarmDisplayTime(nearestAlarm)}
              </Text>

              <View style={styles.alarmPreviewTextWrap}>
                <Text style={styles.alarmPreviewMeta}>
                  {nearestAlarm.feedingType}{" "}
                  {nearestAlarm.days?.length
                    ? nearestAlarm.days.join(" / ")
                    : "매일"}
                </Text>
                <Text style={styles.alarmPreviewFood}>
                  {nearestAlarm.foodName} {nearestAlarm.amount}g
                </Text>
              </View>
            </View>

            <View style={styles.alarmPreviewEditWrap}>
              <Text style={styles.alarmPreviewEditText}>편집</Text>
              <Ionicons name="chevron-forward" size={16} color="#D06B33" />
            </View>
          </TouchableOpacity>
        )}

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
                <TouchableOpacity
                  style={styles.inputBox}
                  activeOpacity={0.85}
                  onPress={openFoodSheet}
                >
                  {selectedFood ? (
                    <View style={styles.selectedFoodInline}>
                      <View style={styles.selectedFoodIconWrap}>
                        <MaterialCommunityIcons
                          name="food-drumstick"
                          size={18}
                          color="#5A9EDB"
                        />
                      </View>

                      <View style={styles.selectedFoodTextWrap}>
                        <Text style={styles.selectedFoodName}>
                          {selectedFood.name}
                        </Text>
                        <Text style={styles.selectedFoodSub}>
                          {selectedFood.subLabel}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <Text style={[styles.inputText, styles.placeholderText]}>
                      사료 선택하기
                    </Text>
                  )}

                  <Ionicons name="chevron-down" size={18} color="#2F6B57" />
                </TouchableOpacity>
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
                  onPress={() => setIsTimePickerVisible(true)}
                >
                  <Text style={styles.inputText}>
                    시간 {formatDisplayTime(selectedTime)}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color="#2F6B57" />
                </TouchableOpacity>
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

        <Modal
          visible={isFoodSheetVisible}
          transparent
          animationType="slide"
          onRequestClose={() => {
            setIsFoodSheetVisible(false);
            setIsAddFoodFormVisible(false);
          }}
        >
          <View style={styles.nestedModalOverlay}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => {
                setIsFoodSheetVisible(false);
                setIsAddFoodFormVisible(false);
              }}
            />

            <View
              {...foodSheetPanResponder.panHandlers}
              style={[styles.foodSheet, { paddingBottom: insets.bottom + 12 }]}
            >
              <View style={styles.sheetHandle} />

              <Text style={styles.foodSheetTitle}>사료 선택</Text>

              <ScrollView
                style={styles.foodList}
                contentContainerStyle={styles.foodListContent}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {foodLibrary.map((item) => {
                  const isSelected = tempSelectedFood?.id === item.id;

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.foodRow,
                        isSelected && styles.foodRowSelected,
                      ]}
                      activeOpacity={0.85}
                      onPress={() => setTempSelectedFood(item)}
                    >
                      <View style={styles.foodRowLeft}>
                        <View
                          style={[
                            styles.foodRadio,
                            isSelected && styles.foodRadioSelected,
                          ]}
                        />
                        <View>
                          <Text
                            style={[
                              styles.foodRowName,
                              isSelected && styles.foodRowNameSelected,
                            ]}
                          >
                            {item.name}
                          </Text>
                          <Text style={styles.foodRowSub}>{item.subLabel}</Text>
                        </View>
                      </View>

                      <View style={styles.foodRowRight}>
                        <Text style={styles.foodGram}>{item.gramLabel}</Text>
                        {isSelected ? (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color="#57A88C"
                          />
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {!isAddFoodFormVisible ? (
                  <TouchableOpacity
                    style={styles.addNewFoodButton}
                    activeOpacity={0.85}
                    onPress={() => setIsAddFoodFormVisible(true)}
                  >
                    <Ionicons name="add" size={16} color="#5D8A77" />
                    <Text style={styles.addNewFoodText}>새 사료 추가하기</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.addFoodForm}>
                    <Text style={styles.addFoodFormTitle}>새 사료 입력</Text>

                    <TextInput
                      style={styles.addFoodInput}
                      placeholder="사료 이름 입력"
                      placeholderTextColor="#A1AAA6"
                      value={newFoodName}
                      onChangeText={setNewFoodName}
                    />

                    <TextInput
                      style={styles.addFoodInput}
                      placeholder="권장 급여량 입력 (예: 40)"
                      placeholderTextColor="#A1AAA6"
                      value={newFoodGram}
                      onChangeText={(text) =>
                        setNewFoodGram(text.replace(/[^0-9]/g, ""))
                      }
                      keyboardType="numeric"
                    />

                    <View style={styles.addFoodButtonRow}>
                      <TouchableOpacity
                        style={styles.addFoodCancelButton}
                        activeOpacity={0.85}
                        onPress={() => {
                          setIsAddFoodFormVisible(false);
                          setNewFoodName("");
                          setNewFoodGram("");
                        }}
                      >
                        <Text style={styles.addFoodCancelButtonText}>취소</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.addFoodSaveButton}
                        activeOpacity={0.85}
                        onPress={handleAddNewFood}
                      >
                        <Text style={styles.addFoodSaveButtonText}>추가</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity
                style={styles.completeButton}
                activeOpacity={0.9}
                onPress={handleCompleteFoodSelection}
              >
                <Text style={styles.completeButtonText}>선택 완료</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {Platform.OS === "android" ? (
          isTimePickerVisible ? (
            <DateTimePicker
              value={selectedTime}
              mode="time"
              display="spinner"
              onChange={handleTimeChange}
            />
          ) : null
        ) : (
          <Modal
            visible={isTimePickerVisible}
            transparent
            animationType="slide"
            onRequestClose={() => setIsTimePickerVisible(false)}
          >
            <View style={styles.nestedModalOverlay}>
              <Pressable
                style={styles.modalBackdrop}
                onPress={() => setIsTimePickerVisible(false)}
              />

              <View
                style={[
                  styles.timePickerSheet,
                  { paddingBottom: insets.bottom + 10 },
                ]}
              >
                <View style={styles.sheetHandle} />
                <Text style={styles.foodSheetTitle}>시간 선택</Text>

                <DateTimePicker
                  value={selectedTime}
                  mode="time"
                  display="spinner"
                  onChange={handleTimeChange}
                  style={styles.iosPicker}
                />

                <TouchableOpacity
                  style={styles.completeButton}
                  activeOpacity={0.9}
                  onPress={() => setIsTimePickerVisible(false)}
                >
                  <Text style={styles.completeButtonText}>선택 완료</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        )}
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
  noticeRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  noticeLink: {
    fontSize: 15,
    fontFamily: "Nanum",
    color: "#D06B33",
    marginRight: 2,
  },

  alarmPreviewBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F1F0F0",
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 30,
  },
  alarmBellIcon: {
    marginRight: 10,
  },
  alarmPreviewLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  alarmPreviewTime: {
    width: 78,
    fontSize: 22,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  alarmPreviewTextWrap: {
    flex: 1,
  },
  alarmPreviewMeta: {
    fontSize: 11,
    fontFamily: "Nanum",
    color: "#7C7C7C",
    marginBottom: 2,
  },
  alarmPreviewFood: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#222222",
  },
  alarmPreviewEditWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginLeft: 12,
  },
  alarmPreviewEditText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#D06B33",
    marginRight: 2,
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
  nestedModalOverlay: {
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
  foodSheet: {
    height: 520,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 14,
    paddingHorizontal: 16,
  },
  timePickerSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 14,
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
  foodSheetTitle: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#222222",
    marginBottom: 14,
  },

  fieldGroup: {
    marginBottom: 10,
  },
  inputBox: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: "#2F6B57",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
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

  selectedFoodInline: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 8,
  },
  selectedFoodIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#EAF4FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  selectedFoodTextWrap: {
    flex: 1,
  },
  selectedFoodName: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#2E6955",
  },
  selectedFoodSub: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Nanum",
    color: "#98A39D",
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

  foodList: {
    flex: 1,
  },
  foodListContent: {
    paddingBottom: 12,
  },
  foodRow: {
    minHeight: 58,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
  },
  foodRowSelected: {
    backgroundColor: "#EEF7F3",
    borderWidth: 1,
    borderColor: "#9CC8B6",
  },
  foodRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  foodRadio: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#D2D7D5",
    marginRight: 10,
  },
  foodRadioSelected: {
    backgroundColor: "#3D8B70",
  },
  foodRowName: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#333333",
  },
  foodRowNameSelected: {
    color: "#2F6B57",
  },
  foodRowSub: {
    marginTop: 3,
    fontSize: 11,
    fontFamily: "Nanum",
    color: "#9CA4A0",
  },
  foodRowRight: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 10,
  },
  foodGram: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#A3AAA7",
    marginRight: 8,
  },

  addNewFoodButton: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#C8D8D1",
    backgroundColor: "#FBFCFC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  addNewFoodText: {
    marginLeft: 6,
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#5D8A77",
  },

  addFoodForm: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#DCE7E1",
    backgroundColor: "#F9FCFA",
    padding: 14,
  },
  addFoodFormTitle: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#2F6B57",
    marginBottom: 12,
  },
  addFoodInput: {
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D8E2DD",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: "Nanum",
    color: "#222222",
    marginBottom: 10,
  },
  addFoodButtonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  addFoodCancelButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#D9D9D9",
    justifyContent: "center",
    alignItems: "center",
  },
  addFoodCancelButtonText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#333333",
  },
  addFoodSaveButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
  },
  addFoodSaveButtonText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#FFFFFF",
  },

  completeButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#2F7A5F",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  completeButtonText: {
    fontSize: 15,
    fontFamily: "NanumB",
    color: "#FFFFFF",
  },
  iosPicker: {
    alignSelf: "center",
  },
});
