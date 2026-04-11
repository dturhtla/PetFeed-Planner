import { Ionicons } from "@expo/vector-icons";
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
  sortKey?: number;
  source?: "alarm" | "manual";
  alarmId?: string;
  feedingType: "아침" | "점심" | "저녁";
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

const FEEDING_TYPE_OPTIONS = ["아침", "점심", "저녁"] as const;
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

const getAlarmKey = (email: string, petId: string) =>
  `feeding_alarms_${email}_${petId}`;

const getFoodsKey = (email: string) => `savedFoods_${email}`;

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

function getTodayKorDay() {
  return DAYS[new Date().getDay()];
}

function getAlarmSortValue(alarm: AlarmItem) {
  return to24Hour(alarm.period, alarm.hour) * 60 + Number(alarm.minute);
}

function createDateFromAlarm(alarm: AlarmItem) {
  const date = new Date();
  date.setHours(to24Hour(alarm.period, alarm.hour));
  date.setMinutes(Number(alarm.minute));
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
}

export default function RecordsScreen() {
  const insets = useSafeAreaInsets();

  const [userEmail, setUserEmail] = useState("");
  const [petProfiles, setPetProfiles] = useState<PetProfileItem[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string>("");

  const [selectedFeedingType, setSelectedFeedingType] = useState<
    "아침" | "점심" | "저녁"
  >("아침");

  const [records, setRecords] = useState<FeedingRecord[]>([]);

  const [nearestAlarm, setNearestAlarm] = useState<AlarmItem | null>(null);
  const [hasAnyEnabledAlarm, setHasAnyEnabledAlarm] = useState(false);
  const [todayFeedingSchedules, setTodayFeedingSchedules] = useState<
    AlarmItem[]
  >([]);

  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [isFoodSheetVisible, setIsFoodSheetVisible] = useState(false);
  const [isTimePickerVisible, setIsTimePickerVisible] = useState(false);
  const [isAddFoodFormVisible, setIsAddFoodFormVisible] = useState(false);
  const [isFromAlarm, setIsFromAlarm] = useState(false);

  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedManualRecordIds, setSelectedManualRecordIds] = useState<
    string[]
  >([]);

  const [foodLibrary, setFoodLibrary] = useState<FoodItem[]>([]);
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [tempSelectedFood, setTempSelectedFood] = useState<FoodItem | null>(
    null,
  );

  const [newFoodName, setNewFoodName] = useState("");
  const [newFoodGram, setNewFoodGram] = useState("");

  const [amount, setAmount] = useState("0");
  const [selectedTime, setSelectedTime] = useState<Date>(createInitialTime());

  const [selectedAlarmId, setSelectedAlarmId] = useState<string | null>(null);

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

    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
      2,
      "0",
    )}`;
  };

  const normalizeRecordTime = (time: string) => {
    const [timePart, meridiem] = time.split(" ");

    if (!meridiem) return timePart;

    const [rawHour, rawMinute] = timePart.split(":");
    let hour = Number(rawHour);
    const minute = Number(rawMinute);

    if (meridiem === "PM" && hour !== 12) hour += 12;
    if (meridiem === "AM" && hour === 12) hour = 0;

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  };

  const resetAddForm = useCallback(() => {
    setSelectedFood(null);
    setTempSelectedFood(null);
    setAmount("0");
    setSelectedTime(createInitialTime());
    setSelectedFeedingType("아침");
    setIsFoodSheetVisible(false);
    setIsTimePickerVisible(false);
    setIsAddFoodFormVisible(false);
    setNewFoodName("");
    setNewFoodGram("");
    setIsFromAlarm(false);
    setSelectedAlarmId(null);
  }, []);

  const closeAddModal = useCallback(() => {
    setIsAddModalVisible(false);
    resetAddForm();
  }, [resetAddForm]);

  const exitDeleteMode = useCallback(() => {
    setIsDeleteMode(false);
    setSelectedManualRecordIds([]);
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 6,
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
        onMoveShouldSetPanResponder: (_, gestureState) => gestureState.dy > 6,
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
        setFoodLibrary([]);
        setNearestAlarm(null);
        setHasAnyEnabledAlarm(false);
        setTodayFeedingSchedules([]);
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
      const savedFoods = await AsyncStorage.getItem(getFoodsKey(email));

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

      if (savedFoods) {
        const parsedFoods = JSON.parse(savedFoods);
        setFoodLibrary(Array.isArray(parsedFoods) ? parsedFoods : []);
      } else {
        setFoodLibrary([]);
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

  useFocusEffect(
    useCallback(() => {
      const loadPetAlarms = async () => {
        try {
          if (!userEmail || !selectedPetId) {
            setNearestAlarm(null);
            setHasAnyEnabledAlarm(false);
            setTodayFeedingSchedules([]);
            return;
          }

          const savedAlarms = await AsyncStorage.getItem(
            getAlarmKey(userEmail, selectedPetId),
          );

          const parsedAlarms: AlarmItem[] = savedAlarms
            ? JSON.parse(savedAlarms)
            : [];

          const enabledAlarms = Array.isArray(parsedAlarms)
            ? parsedAlarms.filter((alarm) => alarm.enabled)
            : [];

          setHasAnyEnabledAlarm(enabledAlarms.length > 0);
          setNearestAlarm(getNearestUpcomingAlarm(enabledAlarms));

          const todayKor = getTodayKorDay();
          const todaySchedules = enabledAlarms
            .filter((alarm) => alarm.days?.includes(todayKor))
            .sort((a, b) => getAlarmSortValue(a) - getAlarmSortValue(b));

          setTodayFeedingSchedules(todaySchedules);
        } catch (error) {
          console.log(error);
          setNearestAlarm(null);
          setHasAnyEnabledAlarm(false);
          setTodayFeedingSchedules([]);
        }
      };

      loadPetAlarms();
    }, [userEmail, selectedPetId]),
  );

  const filteredRecords = useMemo(() => {
    return records
      .filter((record) => record.petId === selectedPetId)
      .slice()
      .sort((a, b) => {
        const aKey = a.sortKey ?? Number(a.id) ?? 0;
        const bKey = b.sortKey ?? Number(b.id) ?? 0;
        return bKey - aKey;
      });
  }, [records, selectedPetId]);

  const manualRecords = useMemo(() => {
    return filteredRecords.filter((record) => record.source === "manual");
  }, [filteredRecords]);

  const combinedTimelineItems = useMemo(() => {
    const alarmItems = todayFeedingSchedules.map((alarm) => ({
      id: `alarm-${alarm.id}`,
      type: "alarm" as const,
      sortMinutes: getAlarmSortValue(alarm),
      alarm,
    }));

    const manualItems = manualRecords.map((record) => {
      const [timePart, meridiem] = record.time.split(" ");
      const [rawHour, rawMinute] = timePart.split(":");
      let hour = Number(rawHour);
      const minute = Number(rawMinute);

      if (meridiem === "PM" && hour !== 12) {
        hour += 12;
      }
      if (meridiem === "AM" && hour === 12) {
        hour = 0;
      }

      return {
        id: `manual-${record.id}`,
        type: "manual" as const,
        sortMinutes: hour * 60 + minute,
        record,
      };
    });

    return [...alarmItems, ...manualItems].sort(
      (a, b) => a.sortMinutes - b.sortMinutes,
    );
  }, [todayFeedingSchedules, manualRecords]);

  const selectedPet = useMemo(() => {
    return petProfiles.find((pet) => pet.id === selectedPetId);
  }, [petProfiles, selectedPetId]);

  const isFedFromAlarm = useCallback(
    (alarm: AlarmItem) => {
      const today = formatDate();

      return records.some(
        (record) =>
          record.petId === selectedPetId &&
          record.date === today &&
          record.source === "alarm" &&
          record.alarmId === alarm.id,
      );
    },
    [records, selectedPetId],
  );

  const isMissedAlarm = useCallback(
    (alarm: AlarmItem) => {
      if (isFedFromAlarm(alarm)) return false;

      const now = new Date();
      const today = new Date();

      today.setHours(to24Hour(alarm.period, alarm.hour));
      today.setMinutes(Number(alarm.minute));
      today.setSeconds(0);
      today.setMilliseconds(0);

      const missedBase = new Date(today);
      missedBase.setHours(missedBase.getHours() + 2);

      return now > missedBase;
    },
    [isFedFromAlarm],
  );

  const previewAlarm = useMemo(() => {
    return nearestAlarm;
  }, [nearestAlarm]);

  const previewAlarmDayLabel = useMemo(() => {
    if (!previewAlarm) return null;

    const now = new Date();

    for (let addDay = 0; addDay < 7; addDay++) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + addDay);

      const dayKor = DAYS[candidate.getDay()];
      if (!matchesDay(previewAlarm, dayKor)) continue;

      candidate.setHours(to24Hour(previewAlarm.period, previewAlarm.hour));
      candidate.setMinutes(Number(previewAlarm.minute));
      candidate.setSeconds(0);
      candidate.setMilliseconds(0);

      if (candidate <= now) continue;

      if (addDay === 0) return "오늘";
      if (addDay === 1) return "내일";
      return `${addDay}일 후`;
    }

    return null;
  }, [previewAlarm]);

  const missedAlarmCount = useMemo(() => {
    return todayFeedingSchedules.filter((alarm) => isMissedAlarm(alarm)).length;
  }, [todayFeedingSchedules, isMissedAlarm]);

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
        sortKey: Date.now(),
        source: isFromAlarm ? "alarm" : "manual",
        alarmId: isFromAlarm ? (selectedAlarmId ?? undefined) : undefined,
        feedingType: selectedFeedingType,
      };

      const updatedRecords = [...records, newRecord];
      setRecords(updatedRecords);

      await AsyncStorage.setItem(
        getRecordsKey(userEmail),
        JSON.stringify(updatedRecords),
      );

      closeAddModal();
    } catch (error) {
      console.log("handleSaveRecord error: ", error);
    }
  };

  const handleDeleteSelectedManualRecords = async () => {
    if (!userEmail || selectedManualRecordIds.length === 0) return;

    try {
      const updatedRecords = records.filter(
        (record) => !selectedManualRecordIds.includes(record.id),
      );

      setRecords(updatedRecords);

      await AsyncStorage.setItem(
        getRecordsKey(userEmail),
        JSON.stringify(updatedRecords),
      );

      exitDeleteMode();
    } catch (error) {
      console.log("handleDeleteSelectedManualRecords error: ", error);
    }
  };

  const enterDeleteMode = (recordId: string) => {
    setIsDeleteMode(true);
    setSelectedManualRecordIds([recordId]);
  };

  const toggleManualRecordSelection = (recordId: string) => {
    setSelectedManualRecordIds((prev) =>
      prev.includes(recordId)
        ? prev.filter((id) => id !== recordId)
        : [...prev, recordId],
    );
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

  const handleAddNewFood = async () => {
    if (!userEmail) return;

    const trimmedName = newFoodName.trim();
    const trimmedGram = newFoodGram.trim();

    if (!trimmedName || !trimmedGram) return;

    const gramOnly = trimmedGram.replace(/[^0-9]/g, "");
    if (!gramOnly) return;

    try {
      const newItem: FoodItem = {
        id: `custom-${Date.now()}`,
        name: trimmedName,
        subLabel: `${gramOnly}g`,
        gramLabel: `${gramOnly}g`,
        isCustom: true,
      };

      const updatedFoods = [newItem, ...foodLibrary];
      setFoodLibrary(updatedFoods);
      setTempSelectedFood(newItem);

      await AsyncStorage.setItem(
        getFoodsKey(userEmail),
        JSON.stringify(updatedFoods),
      );

      setIsAddFoodFormVisible(false);
      setNewFoodName("");
      setNewFoodGram("");
    } catch (error) {
      console.log("handleAddNewFood error: ", error);
    }
  };

  const handleDeleteFood = async (foodId: string) => {
    if (!userEmail) return;

    try {
      const updatedFoods = foodLibrary.filter((item) => item.id !== foodId);

      setFoodLibrary(updatedFoods);

      if (selectedFood?.id === foodId) {
        setSelectedFood(null);
        setTempSelectedFood(null);
      }

      if (tempSelectedFood?.id === foodId) {
        setTempSelectedFood(null);
      }

      await AsyncStorage.setItem(
        getFoodsKey(userEmail),
        JSON.stringify(updatedFoods),
      );
    } catch (error) {
      console.log("handleDeleteFood error: ", error);
    }
  };

  const handlePressRecordFromSchedule = (alarm: AlarmItem) => {
    const foundFood = foodLibrary.find(
      (item) => item.name === alarm.foodName,
    ) ?? {
      id: `temp-${alarm.id}`,
      name: alarm.foodName,
      subLabel: alarm.foodSubLabel,
      gramLabel:
        alarm.foodSubLabel.replace(/[^0-9g]/g, "") || alarm.foodSubLabel,
    };

    setIsFromAlarm(true);
    setSelectedAlarmId(alarm.id);
    setSelectedFood(foundFood);
    setTempSelectedFood(foundFood);
    setAmount(String(alarm.amount));
    setSelectedFeedingType(alarm.feedingType);
    setSelectedTime(createDateFromAlarm(alarm));
    setIsAddModalVisible(true);
  };

  const handlePressAddButton = () => {
    resetAddForm();
    setIsFromAlarm(false);
    setSelectedAlarmId(null);
    setIsAddModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (isDeleteMode) {
              exitDeleteMode();
              return;
            }
            router.back();
          }}
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
                    color="#111111"
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

        {!hasAnyEnabledAlarm || !previewAlarm ? (
          <TouchableOpacity
            style={styles.noticeBox}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: "/feeding-alarm",
                params: {
                  petId: selectedPetId,
                  petName: selectedPet?.name ?? "",
                },
              })
            }
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
          <>
            <TouchableOpacity
              style={styles.alarmPreviewBox}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: "/feeding-alarm",
                  params: {
                    petId: selectedPetId,
                    petName: selectedPet?.name ?? "",
                  },
                })
              }
            >
              <View style={styles.alarmPreviewLeft}>
                <Ionicons
                  name="notifications-outline"
                  size={18}
                  color="#D2A11D"
                  style={styles.alarmBellIcon}
                />

                <View style={styles.alarmPreviewTimeWrap}>
                  {previewAlarmDayLabel ? (
                    <View style={styles.alarmDayBadge}>
                      <Text style={styles.alarmDayBadgeText}>
                        {previewAlarmDayLabel}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={styles.alarmPreviewTime}>
                    {formatAlarmDisplayTime(previewAlarm)}
                  </Text>
                </View>

                <View style={styles.alarmPreviewTextWrap}>
                  <Text style={styles.alarmPreviewMeta}>
                    {previewAlarm.feedingType}{" "}
                    {previewAlarm.days?.length
                      ? previewAlarm.days.join(" / ")
                      : "매일"}
                  </Text>
                  <Text style={styles.alarmPreviewFood}>
                    {previewAlarm.foodName} {previewAlarm.amount}g
                  </Text>
                </View>
              </View>

              <View style={styles.alarmPreviewEditWrap}>
                <Text style={styles.alarmPreviewEditText}>편집</Text>
                <Ionicons name="chevron-forward" size={16} color="#D06B33" />
              </View>
            </TouchableOpacity>

            {missedAlarmCount > 0 ? (
              <View style={styles.missedHintBox}>
                <Ionicons
                  name="warning-outline"
                  size={16}
                  color="#C65A2E"
                  style={styles.missedHintIcon}
                />
                <Text style={styles.missedHintText}>
                  오늘 미지급 {missedAlarmCount}건이 있어요
                </Text>
              </View>
            ) : null}
          </>
        )}

        <View style={styles.recordSectionHeader}>
          <Text style={styles.recordSectionTitle}>기록 내역</Text>
        </View>

        {combinedTimelineItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>아직 급여 기록이 없어요</Text>
            <Text style={styles.emptyDesc}>
              오른쪽 아래 + 버튼으로{"\n"}
              {selectedPet?.name || "반려동물"}의 급여 기록을 추가해보세요
            </Text>
          </View>
        ) : (
          <View style={styles.recordList}>
            {combinedTimelineItems.map((item) => {
              if (item.type === "alarm") {
                const alarm = item.alarm;
                const isDone = isFedFromAlarm(alarm);
                const isMissed = isMissedAlarm(alarm);

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.scheduleCard}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (!isDone && !isDeleteMode) {
                        handlePressRecordFromSchedule(alarm);
                      }
                    }}
                  >
                    <View
                      style={[
                        styles.scheduleBar,
                        isDone && styles.scheduleBarDone,
                        isMissed && styles.scheduleBarMissed,
                      ]}
                    />

                    <View style={styles.scheduleInnerSimple}>
                      <Text
                        style={[
                          styles.scheduleTimeSimple,
                          isDone && styles.scheduleTimeDone,
                          isMissed && styles.scheduleTimeMissed,
                        ]}
                      >
                        {formatAlarmDisplayTime(alarm)}{" "}
                        {isDone ? "완료" : isMissed ? "미지급" : "예정"}
                      </Text>

                      <Text style={styles.scheduleFoodSimple}>
                        {alarm.foodName}
                      </Text>

                      <Text style={styles.scheduleSubSimple}>
                        {alarm.amount}g / {alarm.feedingType}식사
                      </Text>
                    </View>

                    {!isDone && !isDeleteMode ? (
                      <View style={styles.scheduleActionInline}>
                        <Text style={styles.scheduleActionInlineText}>
                          급여기록하기
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={16}
                          color="#2F6B57"
                        />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              }

              const record = item.record;
              const isSelected = selectedManualRecordIds.includes(record.id);

              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.scheduleCard}
                  activeOpacity={0.9}
                  onLongPress={() => enterDeleteMode(record.id)}
                  onPress={() => {
                    if (isDeleteMode) {
                      toggleManualRecordSelection(record.id);
                    }
                  }}
                >
                  <View style={[styles.scheduleBar, styles.scheduleBarDone]} />

                  {isDeleteMode ? (
                    <TouchableOpacity
                      style={[
                        styles.recordCheckCircle,
                        isSelected && styles.recordCheckCircleSelected,
                      ]}
                      activeOpacity={0.85}
                      onPress={() => toggleManualRecordSelection(record.id)}
                    >
                      {isSelected ? (
                        <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                      ) : null}
                    </TouchableOpacity>
                  ) : null}

                  <View style={styles.scheduleInnerSimple}>
                    <Text
                      style={[
                        styles.scheduleTimeSimple,
                        styles.scheduleTimeDone,
                      ]}
                    >
                      {normalizeRecordTime(record.time)} 완료
                    </Text>

                    <Text style={styles.scheduleFoodSimple}>
                      {record.foodName}
                    </Text>

                    <Text style={styles.scheduleSubSimple}>
                      {record.amount} / {record.feedingType}식사
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {isDeleteMode ? (
        <View
          style={[
            styles.deleteBar,
            {
              bottom: insets.bottom + 20,
            },
          ]}
        >
          <TouchableOpacity
            style={styles.deleteCancelButton}
            activeOpacity={0.85}
            onPress={exitDeleteMode}
          >
            <Text style={styles.deleteCancelButtonText}>취소</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.deleteConfirmButton,
              selectedManualRecordIds.length === 0 &&
                styles.deleteConfirmButtonDisabled,
            ]}
            activeOpacity={0.85}
            onPress={handleDeleteSelectedManualRecords}
            disabled={selectedManualRecordIds.length === 0}
          >
            <Text style={styles.deleteConfirmButtonText}>삭제</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[
            styles.fab,
            {
              bottom: insets.bottom + 20,
            },
          ]}
          activeOpacity={0.85}
          onPress={handlePressAddButton}
        >
          <Ionicons name="add" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      )}

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

            <View style={styles.recordSheetContent}>
              <Text style={styles.recordSheetTitle}>
                {isFromAlarm ? "급여 기록하기" : "급여 기록 추가"}
              </Text>

              <TouchableOpacity
                style={styles.recordSelectBox}
                activeOpacity={0.85}
                onPress={openFoodSheet}
              >
                <Text
                  style={[
                    styles.recordSelectText,
                    !selectedFood && styles.recordPlaceholderText,
                  ]}
                  numberOfLines={1}
                >
                  {selectedFood ? selectedFood.name : "(사료이름)"}
                </Text>

                <Ionicons name="chevron-down" size={18} color="#2F6B57" />
              </TouchableOpacity>

              <View style={styles.recordAmountBox}>
                <Text style={styles.recordAmountLabel}>급여량</Text>

                <View style={styles.recordAmountControl}>
                  <TouchableOpacity
                    onPress={handleDecreaseAmount}
                    activeOpacity={0.8}
                    style={styles.recordAmountIconButton}
                  >
                    <Ionicons name="remove-circle" size={20} color="#2F6B57" />
                  </TouchableOpacity>

                  <Text style={styles.recordAmountValue}>{amount}g</Text>

                  <TouchableOpacity
                    onPress={handleIncreaseAmount}
                    activeOpacity={0.8}
                    style={styles.recordAmountIconButton}
                  >
                    <Ionicons name="add-circle" size={20} color="#2F6B57" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.recordTypeBox}>
                {FEEDING_TYPE_OPTIONS.map((type) => {
                  const isSelected = selectedFeedingType === type;

                  return (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.recordTypeChip,
                        isSelected && styles.recordTypeChipSelected,
                      ]}
                      activeOpacity={0.85}
                      onPress={() => setSelectedFeedingType(type)}
                    >
                      <Text
                        style={[
                          styles.recordTypeChipText,
                          isSelected && styles.recordTypeChipTextSelected,
                        ]}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={styles.recordSelectBox}
                activeOpacity={0.85}
                onPress={() => setIsTimePickerVisible(true)}
              >
                <Text style={styles.recordSelectText}>
                  시간 {formatDisplayTime(selectedTime)}
                </Text>

                <Ionicons name="chevron-down" size={18} color="#2F6B57" />
              </TouchableOpacity>

              <View style={styles.recordSheetButtonRow}>
                <TouchableOpacity
                  style={styles.recordCancelButton}
                  onPress={closeAddModal}
                  activeOpacity={0.85}
                >
                  <Text style={styles.recordCancelButtonText}>취소</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.recordSaveButton}
                  onPress={handleSaveRecord}
                  activeOpacity={0.85}
                >
                  <Text style={styles.recordSaveButtonText}>저장</Text>
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
                {foodLibrary.length > 0 ? (
                  <>
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
                              <Text style={styles.foodRowSub}>
                                {item.subLabel}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.foodRowRight}>
                            <Text style={styles.foodGram}>
                              {item.gramLabel}
                            </Text>

                            {isSelected ? (
                              <Ionicons
                                name="checkmark"
                                size={18}
                                color="#57A88C"
                                style={styles.foodCheckIcon}
                              />
                            ) : null}

                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={(e) => {
                                e.stopPropagation();
                                handleDeleteFood(item.id);
                              }}
                              style={styles.foodDeleteButton}
                            >
                              <Ionicons
                                name="trash-outline"
                                size={18}
                                color="#9A9A9A"
                              />
                            </TouchableOpacity>
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
                        <Text style={styles.addNewFoodText}>직접 입력하기</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.addFoodForm}>
                        <Text style={styles.addFoodFormTitle}>
                          새 사료 입력
                        </Text>

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
                            <Text style={styles.addFoodCancelButtonText}>
                              취소
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.addFoodSaveButton}
                            activeOpacity={0.85}
                            onPress={handleAddNewFood}
                          >
                            <Text style={styles.addFoodSaveButtonText}>
                              추가
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <View style={styles.emptyFoodWrap}>
                      <Text style={styles.emptyFoodText}>
                        등록된 사료가 없어요
                      </Text>
                    </View>

                    {!isAddFoodFormVisible ? (
                      <TouchableOpacity
                        style={styles.addNewFoodButton}
                        activeOpacity={0.85}
                        onPress={() => setIsAddFoodFormVisible(true)}
                      >
                        <Ionicons name="add" size={16} color="#5D8A77" />
                        <Text style={styles.addNewFoodText}>직접 입력하기</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.addFoodForm}>
                        <Text style={styles.addFoodFormTitle}>
                          새 사료 입력
                        </Text>

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
                            <Text style={styles.addFoodCancelButtonText}>
                              취소
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.addFoodSaveButton}
                            activeOpacity={0.85}
                            onPress={handleAddNewFood}
                          >
                            <Text style={styles.addFoodSaveButtonText}>
                              추가
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </>
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
    backgroundColor: "#FFFFFF",
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
    color: "#2F2F2F",
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
    marginBottom: 18,
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

  alarmPreviewTimeWrap: {
    flexDirection: "row",
    alignItems: "center",
    width: 120,
  },

  alarmDayBadge: {
    backgroundColor: "#E7F4EE",
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginRight: 6,
  },

  alarmDayBadgeText: {
    fontSize: 10,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },

  alarmPreviewBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#ECECEC",
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginBottom: 18,
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

  recordSectionHeader: {
    marginTop: 4,
    marginBottom: 12,
  },
  recordSectionTitle: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#2F2F2F",
  },

  scheduleList: {
    gap: 12,
    marginBottom: 22,
  },
  scheduleCard: {
    minHeight: 88,
    backgroundColor: "#ECECEC",
    borderRadius: 16,
    flexDirection: "row",
    overflow: "hidden",
    alignItems: "stretch",
  },
  scheduleBar: {
    width: 6,
    backgroundColor: "#8F8F8F",
  },
  scheduleBarDone: {
    backgroundColor: "#2F6B57",
  },
  scheduleBarMissed: {
    backgroundColor: "#D14A3A",
  },

  scheduleTimeMissed: {
    color: "#D14A3A",
    fontFamily: "NanumB",
  },
  scheduleInnerSimple: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  scheduleTimeSimple: {
    fontSize: 11,
    fontFamily: "Nanum",
    color: "#7A7A7A",
    marginBottom: 4,
  },
  scheduleTimeDone: {
    color: "#2F6B57",
    fontFamily: "NanumB",
  },
  scheduleFoodSimple: {
    fontSize: 17,
    fontFamily: "NanumB",
    color: "#222222",
    marginBottom: 4,
  },
  scheduleSubSimple: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#8A8A8A",
  },
  scheduleActionInline: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
  },
  scheduleActionInlineText: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#2F6B57",
    marginRight: 2,
  },

  recordCheckCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#B9B9B9",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginLeft: 10,
  },
  recordCheckCircleSelected: {
    backgroundColor: "#2F6B57",
    borderColor: "#2F6B57",
  },

  emptyWrap: {
    minHeight: 260,
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

  deleteBar: {
    position: "absolute",
    left: 24,
    right: 24,
    flexDirection: "row",
    gap: 12,
  },
  deleteCancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#C9C9C9",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteCancelButtonText: {
    fontSize: 15,
    fontFamily: "NanumB",
    color: "#222222",
  },
  deleteConfirmButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#C94F4F",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteConfirmButtonDisabled: {
    backgroundColor: "#E2A8A8",
  },
  deleteConfirmButtonText: {
    fontSize: 15,
    fontFamily: "NanumB",
    color: "#FFFFFF",
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
    height: 352,
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

  foodSheetTitle: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#222222",
    marginBottom: 14,
  },

  foodList: {
    flex: 1,
  },
  foodListContent: {
    paddingBottom: 12,
  },
  emptyFoodWrap: {
    minHeight: 140,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  emptyFoodText: {
    fontSize: 15,
    fontFamily: "Nanum",
    color: "#8A8A8A",
    textAlign: "center",
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

  recordSheetContent: {
    flex: 1,
    paddingTop: 4,
  },
  recordSheetTitle: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#111111",
    marginBottom: 14,
  },
  recordSelectBox: {
    height: 40,
    borderWidth: 1.2,
    borderColor: "#2F6B57",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recordSelectText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Nanum",
    color: "#222222",
    marginRight: 8,
  },
  recordPlaceholderText: {
    color: "#6B6B6B",
  },
  recordAmountBox: {
    height: 40,
    borderWidth: 1.2,
    borderColor: "#2F6B57",
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recordAmountLabel: {
    fontSize: 13,
    fontFamily: "Nanum",
    color: "#4B4B4B",
  },
  recordAmountControl: {
    flexDirection: "row",
    alignItems: "center",
  },
  recordAmountIconButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  recordAmountValue: {
    marginHorizontal: 8,
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#222222",
  },
  recordSheetButtonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    marginTop: 4,
  },
  recordCancelButton: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#C9C9C9",
    justifyContent: "center",
    alignItems: "center",
  },
  recordCancelButtonText: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#222222",
  },
  recordSaveButton: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: "#215F3E",
    justifyContent: "center",
    alignItems: "center",
  },
  recordSaveButtonText: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#FFFFFF",
  },

  recordTypeBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  recordTypeChip: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.2,
    borderColor: "#D7D7D7",
    justifyContent: "center",
    alignItems: "center",
  },
  recordTypeChipSelected: {
    borderColor: "#2F6B57",
    backgroundColor: "#EEF7F3",
  },
  recordTypeChipText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#7A7A7A",
  },
  recordTypeChipTextSelected: {
    color: "#2F6B57",
  },
  missedHintBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF4EC",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: -6,
    marginBottom: 18,
  },

  missedHintIcon: {
    marginRight: 6,
  },

  missedHintText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#C65A2E",
  },

  foodDeleteButton: {
    marginLeft: 8,
    padding: 2,
  },

  foodCheckIcon: {
    marginLeft: 4,
  },
});
