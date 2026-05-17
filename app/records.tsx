import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { storageKeys } from "../utils/storageKeys";
import { to24Hour } from "../utils/timeUtils";

const API_BASE_URL = process.env.EXPO_PUBLIC_GO_SERVER_URL;

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
  eatenAmount?: string;
  time: string;
  sortKey?: number;
  source?: "alarm" | "manual";
  alarmId?: string;
};

type FoodItem = {
  id: string;
  name: string;
  subLabel: string;
  gramLabel: string;
  recommendedAmount?: number;
  petId?: string;
  petName?: string;
  isCustom?: boolean;
};

type AlarmItem = {
  id: string;
  period: "오전" | "오후";
  hour: string;
  minute: string;
  foodName: string;
  foodSubLabel: string;
  amount: number;
  days: string[];
  enabled: boolean;
};

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function createInitialTime() {
  const date = new Date();
  date.setHours(0);
  date.setMinutes(0);
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
}

function formatAlarmDisplayTime(alarm: AlarmItem) {
  const h = to24Hour(alarm.period, alarm.hour);
  return `${String(h).padStart(2, "0")}:${alarm.minute}`;
}

function matchesDay(alarm: AlarmItem, dayKor: string) {
  if (!alarm.days || alarm.days.length === 0) return false;
  return alarm.days.includes(dayKor);
}

function formatAlarmDays(days?: string[]) {
  if (!days || days.length === 0) return "매일";

  const orderedDays = DAYS.filter((day) => days.includes(day));

  const isEveryday = orderedDays.length === 7;
  const isWeekdays =
    orderedDays.length === 5 &&
    ["월", "화", "수", "목", "금"].every((day) => orderedDays.includes(day));
  const isWeekend =
    orderedDays.length === 2 &&
    ["토", "일"].every((day) => orderedDays.includes(day));

  if (isEveryday) return "매일";
  if (isWeekdays) return "평일";
  if (isWeekend) return "주말";

  return orderedDays.join(" / ");
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

function getGramNumber(value?: string | number) {
  if (value === undefined || value === null) return 0;
  return Number(String(value).replace(/[^0-9.]/g, "")) || 0;
}

const show = (msg: string) => {
  ToastAndroid.show(msg, ToastAndroid.SHORT);
};

function formatServerDateTime(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

async function requestJson(url: string, options: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(options.headers || {}),
    },
  });

  let data: any = null;
  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(data?.detail || data?.message || `HTTP ${response.status}`);
  }

  return data;
}

export default function RecordsScreen() {
  const insets = useSafeAreaInsets();

  const petListRef = useRef<FlatList<PetProfileItem>>(null);
  const [isPetSheetVisible, setIsPetSheetVisible] = useState(false);

  const [userEmail, setUserEmail] = useState("");
  const [petProfiles, setPetProfiles] = useState<PetProfileItem[]>([]);
  const [selectedPetId, setSelectedPetId] = useState<string>("");

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

  const [quickAmount, setQuickAmount] = useState<number | null>(null);
  const [quickAmountType, setQuickAmountType] = useState<
    "recommend" | "previous" | null
  >(null);
  const [isQuickAmountSelected, setIsQuickAmountSelected] = useState(false);

  const [eatenAmount, setEatenAmount] = useState("0");

  const [isEditingAmount, setIsEditingAmount] = useState(false);
  const [isEditingEatenAmount, setIsEditingEatenAmount] = useState(false);

  const [selectedTime, setSelectedTime] = useState<Date>(createInitialTime());

  const [selectedAlarmId, setSelectedAlarmId] = useState<string | null>(null);

  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [isDeletingRecord, setIsDeletingRecord] = useState(false);
  const [isSavingFood, setIsSavingFood] = useState(false);
  const [isDeletingFood, setIsDeletingFood] = useState(false);

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

  const createDateFromRecord = (record: FeedingRecord) => {
    const [year, month, day] = record.date.split(".").map(Number);
    const [hour, minute] = normalizeRecordTime(record.time)
      .split(":")
      .map(Number);

    const date = new Date();
    date.setFullYear(year);
    date.setMonth((month || 1) - 1);
    date.setDate(day || 1);
    date.setHours(hour || 0);
    date.setMinutes(minute || 0);
    date.setSeconds(0);
    date.setMilliseconds(0);

    return date;
  };

  const resetAddForm = useCallback(() => {
    setSelectedFood(null);
    setTempSelectedFood(null);
    setAmount("0");
    setEatenAmount("0");
    setSelectedTime(createInitialTime());
    setIsFoodSheetVisible(false);
    setIsTimePickerVisible(false);
    setIsAddFoodFormVisible(false);
    setNewFoodName("");
    setNewFoodGram("");
    setIsFromAlarm(false);
    setSelectedAlarmId(null);
    setQuickAmount(null);
    setQuickAmountType(null);
    setIsQuickAmountSelected(false);
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

  const loadIoTRecords = async (
    petId: string,
    email: string,
  ): Promise<FeedingRecord[]> => {
    if (!API_BASE_URL || !petId) return [];

    const savedAlarms = await AsyncStorage.getItem(
      storageKeys.feedingAlarms(email, petId),
    );
    const parsedAlarms: AlarmItem[] = savedAlarms
      ? JSON.parse(savedAlarms)
      : [];

    const todayKor = getTodayKorDay();
    const todayAlarms = Array.isArray(parsedAlarms)
      ? parsedAlarms.filter(
          (alarm) => alarm.enabled && alarm.days?.includes(todayKor),
        )
      : [];

    const serverRecords = await Promise.all(
      todayAlarms.map(async (alarm) => {
        try {
          const feedTime = formatServerDateTime(createDateFromAlarm(alarm));

          const result = await requestJson(
            `${API_BASE_URL}/pets/meal-details`,
            {
              method: "POST",
              body: JSON.stringify({
                pet_id: Number(petId),
                feed_time: feedTime,
              }),
            },
          );

          const feedAmount = Number(result?.feed_amount ?? 0);
          const consumption = Number(result?.consumption ?? 0);
          const foodName = String(result?.food_name ?? "").trim();

          if (feedAmount <= 0 && consumption <= 0 && !foodName) return null;

          return {
            id: `server-${petId}-${feedTime}`,
            petId,
            date: formatDate(),
            foodName: foodName || alarm.foodName,
            amount: `${feedAmount || alarm.amount}g`,
            eatenAmount: `${consumption}g`,
            time: formatAlarmDisplayTime(alarm),
            sortKey: createDateFromAlarm(alarm).getTime(),
            source: "alarm" as const,
            alarmId: alarm.id,
          };
        } catch (error) {
          console.log("loadIoTRecords meal-details error:", error);
          return null;
        }
      }),
    );

    return serverRecords.filter(Boolean) as FeedingRecord[];
  };

  const loadProfilesAndRecords = useCallback(async () => {
    try {
      const savedUser = await AsyncStorage.getItem(storageKeys.loggedInUser);
      if (!savedUser) {
        /* ... */ return;
      }

      const parsedUser = JSON.parse(savedUser);
      const email = parsedUser.email;
      const serverUserId = parsedUser.serverUserId;
      if (!serverUserId) {
        show("로그인 정보가 없습니다. 다시 로그인해주세요.");
        return;
      }
      setUserEmail(email);

      // 1. 서버에서 pets 불러오기
      if (!API_BASE_URL) {
        show("서버 주소가 설정되지 않았습니다.");
        return;
      }

      const petsResponse = await fetch(
        `${API_BASE_URL}/api/v1/users/${serverUserId}/pets`,
        { headers: { "ngrok-skip-browser-warning": "true" } },
      );

      let loadedProfiles: PetProfileItem[] = [];

      if (petsResponse.ok) {
        const petsResult = await petsResponse.json();
        const serverPets = Array.isArray(petsResult)
          ? petsResult
          : petsResult?.pets || [];
        loadedProfiles = serverPets
          .map((pet: any) => ({
            id: String(pet.pet_id ?? pet.id),
            name: pet.name,
            petType:
              pet.species === "Dog"
                ? "강아지"
                : pet.species === "Cat"
                  ? "고양이"
                  : "",
          }))
          .sort(
            (a: PetProfileItem, b: PetProfileItem) =>
              Number(a.id) - Number(b.id),
          );
      }

      if (loadedProfiles.length === 0) {
        loadedProfiles = [
          { id: "placeholder-1", name: "반려동물", petType: "" },
        ];
      }

      setPetProfiles(loadedProfiles);

      // 2. 마이그레이션 (loadedProfiles 설정 후에 실행)
      const migrated = await AsyncStorage.getItem(
        storageKeys.migratedPetId(email),
      );
      if (migrated !== "true") {
        const savedRecordsRaw = await AsyncStorage.getItem(
          storageKeys.feedingRecords(email),
        );
        const savedMultiProfiles = await AsyncStorage.getItem(
          storageKeys.petProfiles(email),
        );
        const localProfiles = savedMultiProfiles
          ? JSON.parse(savedMultiProfiles)
          : [];

        if (savedRecordsRaw) {
          const parsedRecords: FeedingRecord[] = JSON.parse(savedRecordsRaw);
          const migratedRecords = parsedRecords.map((record) => {
            const localIndex = Number(record.petId);
            if (!isNaN(localIndex) && localProfiles[localIndex]) {
              const serverPet = loadedProfiles.find(
                (p) => p.name === localProfiles[localIndex].name,
              );
              if (serverPet) return { ...record, petId: serverPet.id };
            }
            return record;
          });
          await AsyncStorage.setItem(
            storageKeys.feedingRecords(email),
            JSON.stringify(migratedRecords),
          );
        }

        for (let i = 0; i < localProfiles.length; i++) {
          const serverPet = loadedProfiles.find(
            (p) => p.name === localProfiles[i].name,
          );
          if (!serverPet) continue;

          const oldFoodsKey = storageKeys.savedFoods(email, i);
          const newFoodsKey = storageKeys.savedFoods(email, serverPet.id);
          const oldFoods = await AsyncStorage.getItem(oldFoodsKey);
          if (oldFoods) {
            const existingFoods = await AsyncStorage.getItem(newFoodsKey);
            const existing = existingFoods ? JSON.parse(existingFoods) : [];
            const old = JSON.parse(oldFoods);
            const merged = [...existing];
            for (const food of old) {
              if (!merged.some((f) => f.name === food.name)) {
                merged.push({ ...food, petId: serverPet.id });
              }
            }
            await AsyncStorage.setItem(newFoodsKey, JSON.stringify(merged));
            await AsyncStorage.removeItem(oldFoodsKey);
          }

          const oldAlarmKey = storageKeys.feedingAlarms(email, i);
          const newAlarmKey = storageKeys.feedingAlarms(email, serverPet.id);
          const oldAlarms = await AsyncStorage.getItem(oldAlarmKey);
          if (oldAlarms) {
            const existingAlarms = await AsyncStorage.getItem(newAlarmKey);
            if (!existingAlarms)
              await AsyncStorage.setItem(newAlarmKey, oldAlarms);
            await AsyncStorage.removeItem(oldAlarmKey);
          }
        }

        await AsyncStorage.setItem(storageKeys.migratedPetId(email), "true");
        console.log("마이그레이션 완료!");
      }

      // 3. 이후 정상 로직
      const savedSelectedPetId = await AsyncStorage.getItem(
        storageKeys.selectedPetId(email),
      );
      const petIdForFoods =
        savedSelectedPetId &&
        loadedProfiles.some((p) => p.id === savedSelectedPetId)
          ? savedSelectedPetId
          : loadedProfiles[0]?.id || "";

      if (
        savedSelectedPetId &&
        loadedProfiles.some((p) => p.id === savedSelectedPetId)
      ) {
        setSelectedPetId(savedSelectedPetId);
      } else {
        const firstPetId = loadedProfiles[0]?.id || "";
        setSelectedPetId(firstPetId);
        if (firstPetId)
          await AsyncStorage.setItem(
            storageKeys.selectedPetId(email),
            firstPetId,
          );
      }

      const savedRecords = await AsyncStorage.getItem(
        storageKeys.feedingRecords(email),
      );

      const manualRecords: FeedingRecord[] = savedRecords
        ? JSON.parse(savedRecords)
        : [];

      const iotRecords = await loadIoTRecords(petIdForFoods, email);

      setRecords([...iotRecords, ...manualRecords]);

      const savedFoods = await AsyncStorage.getItem(
        storageKeys.savedFoods(email, petIdForFoods),
      );
      if (savedFoods) {
        const parsedFoods = JSON.parse(savedFoods);
        setFoodLibrary(Array.isArray(parsedFoods) ? parsedFoods : []);
      } else {
        setFoodLibrary([]);
      }
    } catch (error) {
      console.log("loadProfilesAndRecords error:", error);
      show("급여 기록 정보를 불러오는 중 문제가 발생했어요.");
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
            storageKeys.feedingAlarms(userEmail, selectedPetId),
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
          console.log("loadPetAlarms error:", error);
          show("급여 알림 정보를 불러오는 중 문제가 발생했어요.");
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
    const today = formatDate();

    return filteredRecords.filter(
      (record) => record.source === "manual" && record.date === today,
    );
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

  const getAlarmRecord = useCallback(
    (alarm: AlarmItem) => {
      const today = formatDate();

      return records.find(
        (record) =>
          record.petId === selectedPetId &&
          record.date === today &&
          record.source === "alarm" &&
          record.alarmId === alarm.id,
      );
    },
    [records, selectedPetId],
  );

  const isFedFromAlarm = useCallback(
    (alarm: AlarmItem) => Boolean(getAlarmRecord(alarm)),
    [getAlarmRecord],
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

  const todayStats = useMemo(() => {
    const today = formatDate();

    const todayRecords = records.filter(
      (record) => record.petId === selectedPetId && record.date === today,
    );

    const givenAmount = todayRecords.reduce(
      (sum, record) => sum + getGramNumber(record.amount),
      0,
    );

    const eatenAmount = todayRecords.reduce(
      (sum, record) => sum + getGramNumber(record.eatenAmount ?? record.amount),
      0,
    );

    const missedCount = todayFeedingSchedules.filter((alarm) =>
      isMissedAlarm(alarm),
    ).length;

    return {
      givenAmount,
      eatenAmount,
      missedCount,
    };
  }, [records, selectedPetId, todayFeedingSchedules, isMissedAlarm]);

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

  const isRecordFormValid =
    !!selectedFood?.name &&
    amount.trim() !== "" &&
    !isNaN(Number(amount)) &&
    Number(amount) > 0 &&
    Number(amount) <= 1000 &&
    eatenAmount.trim() !== "" &&
    !isNaN(Number(eatenAmount)) &&
    Number(eatenAmount) >= 0 &&
    Number(eatenAmount) <= Number(amount);

  const handleSaveRecord = async () => {
    if (isSavingRecord) return;

    if (!API_BASE_URL) {
      Alert.alert("저장 실패", "서버 주소가 설정되지 않았습니다.");
      return;
    }

    if (!selectedFood || !selectedFood.name) {
      Alert.alert("알림", "사료를 선택해주세요.");
      return;
    }

    if (!amount.trim()) {
      Alert.alert("알림", "급여량을 입력해주세요.");
      return;
    }

    if (isNaN(Number(amount))) {
      Alert.alert("알림", "급여량은 숫자만 입력해주세요.");
      return;
    }

    if (Number(amount) <= 0) {
      Alert.alert("알림", "급여량은 0보다 커야 합니다.");
      return;
    }

    if (Number(amount) > 1000) {
      Alert.alert("알림", "급여량이 너무 많습니다.");
      return;
    }

    if (!eatenAmount.trim()) {
      Alert.alert("알림", "섭취량을 입력해주세요.");
      return;
    }

    if (isNaN(Number(eatenAmount))) {
      Alert.alert("알림", "섭취량은 숫자만 입력해주세요.");
      return;
    }

    if (Number(eatenAmount) < 0) {
      Alert.alert("알림", "섭취량은 0 이상이어야 합니다.");
      return;
    }

    if (Number(eatenAmount) > Number(amount)) {
      Alert.alert("알림", "섭취량은 급여량보다 클 수 없습니다.");
      return;
    }

    setIsSavingRecord(true);

    try {
      const feedTime = formatServerDateTime(selectedTime);

      await requestJson(`${API_BASE_URL}/iot/self-manual-weight`, {
        method: "POST",
        body: JSON.stringify({
          pet_id: Number(selectedPetId),
          feed_time: feedTime,
          feed_amount: Number(amount),
          consumption: Number(eatenAmount),
        }),
      });

      const now = Date.now();
      const newRecord: FeedingRecord = {
        id: `${now}`,
        petId: selectedPetId,
        date: formatDate(),
        foodName: selectedFood.name,
        amount: `${amount}g`,
        eatenAmount: `${eatenAmount}g`,
        time: formatDisplayTime(selectedTime),
        sortKey: now,
        source: isFromAlarm ? "alarm" : "manual",
        alarmId: isFromAlarm ? (selectedAlarmId ?? undefined) : undefined,
      };

      const updatedRecords = [
        ...records.filter(
          (record) =>
            !(newRecord.alarmId && record.alarmId === newRecord.alarmId),
        ),
        newRecord,
      ];
      setRecords(updatedRecords);

      await AsyncStorage.setItem(
        storageKeys.feedingRecords(userEmail),
        JSON.stringify(updatedRecords),
      );

      show("급여 기록이 저장되었습니다.");
      closeAddModal();
    } catch (error) {
      console.log("handleSaveRecord error: ", error);
      Alert.alert(
        "저장 실패",
        "서버에 급여 기록을 저장하는 중 문제가 발생했어요. 다시 시도해주세요.",
      );
    } finally {
      setIsSavingRecord(false);
    }
  };

  const handleDeleteSelectedManualRecords = async () => {
    if (isDeletingRecord) return;

    if (!API_BASE_URL) {
      Alert.alert("삭제 실패", "서버 주소가 설정되지 않았습니다.");
      return;
    }

    if (!userEmail || selectedManualRecordIds.length === 0) return;

    try {
      setIsDeletingRecord(true);

      const recordsToDelete = records.filter((record) =>
        selectedManualRecordIds.includes(record.id),
      );

      await Promise.all(
        recordsToDelete.map((record) =>
          requestJson(`${API_BASE_URL}/iot/weight-pair`, {
            method: "DELETE",
            body: JSON.stringify({
              pet_id: Number(record.petId),
              feed_time: formatServerDateTime(createDateFromRecord(record)),
              feed_amount: getGramNumber(record.amount),
            }),
          }),
        ),
      );

      const updatedRecords = records.filter(
        (record) => !selectedManualRecordIds.includes(record.id),
      );

      setRecords(updatedRecords);

      await AsyncStorage.setItem(
        storageKeys.feedingRecords(userEmail),
        JSON.stringify(updatedRecords),
      );

      show("급여 기록이 삭제되었습니다.");

      exitDeleteMode();
    } catch (error) {
      console.log("handleDeleteSelectedManualRecords error: ", error);
      Alert.alert(
        "삭제 실패",
        "서버에서 급여 기록을 삭제하는 중 문제가 발생했어요. 다시 시도해주세요.",
      );
    } finally {
      setIsDeletingRecord(false);
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
    const next = Math.max(1, current - 1);
    setAmount(String(next));
    setIsQuickAmountSelected(false);
  };

  const applyQuickAmountForFood = (food: FoodItem | null) => {
    if (!food) {
      setQuickAmount(null);
      setQuickAmountType(null);
      setIsQuickAmountSelected(false);
      return;
    }

    if (food.recommendedAmount) {
      setQuickAmount(Number(food.recommendedAmount));
      setQuickAmountType("recommend");
      setIsQuickAmountSelected(false);
      return;
    }

    const previousRecord = records
      .filter(
        (record) =>
          record.petId === selectedPetId &&
          record.foodName === food.name &&
          getGramNumber(record.amount) > 0,
      )
      .slice()
      .sort(
        (a, b) => (b.sortKey ?? Number(b.id)) - (a.sortKey ?? Number(a.id)),
      )[0];

    if (previousRecord) {
      setQuickAmount(getGramNumber(previousRecord.amount));
      setQuickAmountType("previous");
      setIsQuickAmountSelected(false);
      return;
    }

    setQuickAmount(null);
    setQuickAmountType(null);
    setIsQuickAmountSelected(false);
  };

  const handleIncreaseAmount = () => {
    const current = Number(amount || "0");
    const next = current + 1;
    setAmount(String(next));
    setIsQuickAmountSelected(false);
  };

  const handleDecreaseEatenAmount = () => {
    const current = Number(eatenAmount || "0");
    const next = Math.max(0, current - 1);
    setEatenAmount(String(next));
  };

  const handleIncreaseEatenAmount = () => {
    const current = Number(eatenAmount || "0");
    const next = current + 1;
    setEatenAmount(String(next));
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
    applyQuickAmountForFood(tempSelectedFood);
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
    if (isSavingFood) return;

    if (!userEmail) return;

    const trimmedName = newFoodName.trim();
    const trimmedGram = newFoodGram.trim();

    if (!trimmedName || !trimmedGram) return;

    const gramOnly = trimmedGram.replace(/[^0-9]/g, "");
    if (!gramOnly) return;

    try {
      setIsSavingFood(true);

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
        storageKeys.savedFoods(userEmail, selectedPetId),
        JSON.stringify(updatedFoods),
      );

      show("사료가 추가되었습니다.");

      setIsAddFoodFormVisible(false);
      setNewFoodName("");
      setNewFoodGram("");
    } catch (error) {
      console.log("handleAddNewFood error: ", error);
      Alert.alert(
        "추가 실패",
        "사료를 추가하는 중 문제가 발생했어요. 다시 시도해주세요.",
      );
    } finally {
      setIsSavingFood(false);
    }
  };

  const handleDeleteFood = async (foodId: string) => {
    if (isDeletingFood) return;

    if (!userEmail) return;

    try {
      setIsDeletingFood(true);

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
        storageKeys.savedFoods(userEmail, selectedPetId),
        JSON.stringify(updatedFoods),
      );

      show("사료 목록에서 삭제되었습니다.");
    } catch (error) {
      console.log("handleDeleteFood error: ", error);
      Alert.alert(
        "삭제 실패",
        "사료를 삭제하는 중 문제가 발생했어요. 다시 시도해주세요.",
      );
    } finally {
      setIsDeletingFood(false);
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
    setEatenAmount(String(alarm.amount));
    setSelectedTime(createDateFromAlarm(alarm));
    setIsAddModalVisible(true);
  };

  const openPetSheet = () => {
    if (petProfiles.length <= 1) return;

    setIsPetSheetVisible(true);

    setTimeout(() => {
      const index = petProfiles.findIndex((pet) => pet.id === selectedPetId);

      if (index >= 0) {
        petListRef.current?.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5,
        });
      }
    }, 200);
  };

  const handleSelectPet = async (pet: PetProfileItem) => {
    try {
      if (!userEmail) return;

      setSelectedPetId(pet.id);
      await AsyncStorage.setItem(storageKeys.selectedPetId(userEmail), pet.id);

      // 선택된 반려동물의 사료 목록 다시 불러오기
      const savedFoods = await AsyncStorage.getItem(
        storageKeys.savedFoods(userEmail, pet.id),
      );
      if (savedFoods) {
        const parsedFoods = JSON.parse(savedFoods);
        setFoodLibrary(Array.isArray(parsedFoods) ? parsedFoods : []);
      } else {
        setFoodLibrary([]);
      }

      setIsPetSheetVisible(false);
      ToastAndroid.show(`${pet.name}으로 변경되었습니다`, ToastAndroid.SHORT);
    } catch (error) {
      console.log("handleSelectPet error:", error);
      show("반려동물 선택을 변경하는 중 문제가 발생했어요.");
    }
  };

  const renderPetIcon = (petType?: string, size = 18) => {
    if (petType === "고양이") {
      return <Ionicons name="logo-octocat" size={size} color="#111" />;
    }

    return <Ionicons name="paw" size={size} color="#111" />;
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
          <Ionicons name="chevron-back" size={28} color="#2F6B57" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.headerPetDropdown}
          activeOpacity={petProfiles.length <= 1 ? 1 : 0.75}
          onPress={openPetSheet}
        >
          <View style={styles.headerPetIconCircle}>
            {renderPetIcon(selectedPet?.petType, 18)}
          </View>

          <Text style={styles.headerTitle}>
            {selectedPet?.name ?? "반려동물"}의 급여기록
          </Text>

          <Ionicons
            name="caret-down"
            size={16}
            color={petProfiles.length <= 1 ? "#B8C7C0" : "#2F6B57"}
          />
        </TouchableOpacity>

        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.line} />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
                    {formatAlarmDays(previewAlarm.days)}
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
          </>
        )}

        <View style={styles.todaySummaryCard}>
          <Text style={styles.todaySummaryTitle}>오늘 급여 요약</Text>
          <View style={styles.todaySummaryInlineRow}>
            <Text style={styles.todaySummaryInlineText}>
              급여량 {todayStats.givenAmount}g
            </Text>

            <Text style={styles.todaySummaryInlineCenterText}>
              섭취량 {todayStats.eatenAmount}g
            </Text>

            {todayStats.missedCount > 0 ? (
              <Text style={styles.todaySummaryInlineMissedText}>
                미지급 {todayStats.missedCount}회
              </Text>
            ) : (
              <View style={styles.todaySummaryPlaceholder} />
            )}
          </View>
        </View>

        <View style={styles.recordSectionHeader}>
          <Text style={styles.recordSectionTitle}>기록 내역</Text>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() =>
              router.push({
                pathname: "/feeding-history",
                params: {
                  petId: selectedPetId,
                  petName: selectedPet?.name ?? "",
                },
              })
            }
          >
            <Text style={styles.recordDetailLink}>자세히 보기 &gt;</Text>
          </TouchableOpacity>
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
                const alarmRecord = getAlarmRecord(alarm);
                const isDone = Boolean(alarmRecord);
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
                      <View style={styles.recordHeaderRow}>
                        <Text
                          style={[
                            styles.scheduleTimeSimple,
                            isMissed && styles.scheduleTimeMissed,
                          ]}
                        >
                          {formatAlarmDisplayTime(alarm)}{" "}
                          {isDone ? "완료" : isMissed ? "미지급" : "예정"}
                          {isDone && alarmRecord
                            ? ` (${normalizeRecordTime(alarmRecord.time)} 급여)`
                            : ""}
                        </Text>
                      </View>

                      <Text style={styles.scheduleFoodSimple}>
                        {alarm.foodName}
                      </Text>

                      <Text style={styles.scheduleSubSimple}>
                        {isDone && alarmRecord
                          ? `급여량 ${alarmRecord.amount}, 섭취량 ${alarmRecord.eatenAmount ?? alarmRecord.amount}`
                          : `${alarm.amount}g`}
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
                    <View style={styles.recordHeaderRow}>
                      <Text style={styles.scheduleTimeSimple}>
                        {normalizeRecordTime(record.time)} 완료 (
                        {normalizeRecordTime(record.time)} 급여)
                      </Text>
                    </View>

                    <Text style={styles.scheduleFoodSimple}>
                      {record.foodName}
                    </Text>

                    <Text style={styles.scheduleSubSimple}>
                      급여량 {record.amount}, 섭취량{" "}
                      {record.eatenAmount ?? "측정 안 됨"}
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
            disabled={selectedManualRecordIds.length === 0 || isDeletingRecord}
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

          <View {...panResponder.panHandlers} style={styles.bottomSheet}>
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

                  {isEditingAmount ? (
                    <TextInput
                      style={styles.recordAmountInput}
                      value={amount}
                      onChangeText={(text) => {
                        setAmount(text.replace(/[^0-9]/g, ""));
                        setIsQuickAmountSelected(false);
                      }}
                      keyboardType="numeric"
                      autoFocus
                      onBlur={() => setIsEditingAmount(false)}
                      onSubmitEditing={() => setIsEditingAmount(false)}
                    />
                  ) : (
                    <TouchableOpacity onPress={() => setIsEditingAmount(true)}>
                      <Text style={styles.recordAmountValue}>{amount}g</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={handleIncreaseAmount}
                    activeOpacity={0.8}
                    style={styles.recordAmountIconButton}
                  >
                    <Ionicons name="add-circle" size={20} color="#2F6B57" />
                  </TouchableOpacity>
                </View>
              </View>

              {quickAmount !== null ? (
                <TouchableOpacity
                  style={[
                    styles.quickAmountButton,
                    isQuickAmountSelected && styles.quickAmountButtonActive,
                  ]}
                  activeOpacity={0.85}
                  onPress={() => {
                    setAmount(String(quickAmount));
                    setEatenAmount(String(quickAmount));
                    setIsQuickAmountSelected(true);
                  }}
                >
                  <Text
                    style={[
                      styles.quickAmountButtonText,
                      isQuickAmountSelected &&
                        styles.quickAmountButtonTextActive,
                    ]}
                  >
                    {quickAmountType === "recommend"
                      ? `추천 급여량 ${quickAmount}g`
                      : `이전 급여량 ${quickAmount}g`}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.recordAmountBox}>
                <Text style={styles.recordAmountLabel}>섭취량</Text>

                <View style={styles.recordAmountControl}>
                  <TouchableOpacity
                    onPress={handleDecreaseEatenAmount}
                    activeOpacity={0.8}
                    style={styles.recordAmountIconButton}
                  >
                    <Ionicons name="remove-circle" size={20} color="#2F6B57" />
                  </TouchableOpacity>

                  {isEditingEatenAmount ? (
                    <TextInput
                      style={styles.recordAmountInput}
                      value={eatenAmount}
                      onChangeText={(text) =>
                        setEatenAmount(text.replace(/[^0-9]/g, ""))
                      }
                      keyboardType="numeric"
                      autoFocus
                      onBlur={() => setIsEditingEatenAmount(false)}
                      onSubmitEditing={() => setIsEditingEatenAmount(false)}
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => setIsEditingEatenAmount(true)}
                    >
                      <Text style={styles.recordAmountValue}>
                        {eatenAmount}g
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={handleIncreaseEatenAmount}
                    activeOpacity={0.8}
                    style={styles.recordAmountIconButton}
                  >
                    <Ionicons name="add-circle" size={20} color="#2F6B57" />
                  </TouchableOpacity>
                </View>
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
                  style={[
                    styles.recordSaveButton,
                    (!isRecordFormValid || isSavingRecord) &&
                      styles.recordSaveButtonDisabled,
                  ]}
                  onPress={handleSaveRecord}
                  activeOpacity={0.85}
                  disabled={!isRecordFormValid || isSavingRecord}
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
                            disabled={isSavingFood}
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
                            disabled={isSavingFood}
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
      <Modal
        visible={isPetSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPetSheetVisible(false)}
      >
        <Pressable
          style={styles.petModalOverlay}
          onPress={() => setIsPetSheetVisible(false)}
        >
          <Pressable style={styles.petSheet}>
            <Text style={styles.petSheetTitle}>반려동물 선택</Text>

            <FlatList
              ref={petListRef}
              data={petProfiles}
              keyExtractor={(item) => item.id}
              style={styles.petList}
              showsVerticalScrollIndicator={false}
              getItemLayout={(_, index) => ({
                length: 52,
                offset: 52 * index,
                index,
              })}
              onScrollToIndexFailed={() => {}}
              renderItem={({ item }) => {
                const isSelected = item.id === selectedPetId;

                return (
                  <TouchableOpacity
                    style={[
                      styles.petItem,
                      isSelected && styles.selectedPetItem,
                    ]}
                    activeOpacity={0.85}
                    onPress={() => handleSelectPet(item)}
                  >
                    <View style={styles.petIconCircle}>
                      {renderPetIcon(item.petType, 20)}
                    </View>

                    <Text
                      style={[
                        styles.petItemText,
                        isSelected && styles.selectedPetText,
                      ]}
                    >
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                );
              }}
            />

            <TouchableOpacity
              style={styles.petSheetCloseButton}
              activeOpacity={0.9}
              onPress={() => setIsPetSheetVisible(false)}
            >
              <Text style={styles.petSheetCloseButtonText}>닫기</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
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
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
  },
  backButton: {
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "flex-start",
    marginTop: -2,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  headerPetDropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    flex: 1,
  },
  headerPetIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerPlaceholder: {
    width: 24,
  },
  line: {
    height: 1,
    backgroundColor: "#777",
    opacity: 0.5,
    marginTop: -4,
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
  summaryTopRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  summaryMiniBox: {
    flex: 1,
    backgroundColor: "#F4F4EF",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  summaryMiniLabel: {
    fontSize: 11,
    fontFamily: "Nanum",
    color: "#6F6F6F",
    marginBottom: 4,
  },
  summaryMiniValue: {
    fontSize: 22,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  summaryMiniValueBlue: {
    color: "#3A7BD5",
  },
  summaryMiniSub: {
    fontSize: 10,
    fontFamily: "Nanum",
    color: "#8A8A8A",
    marginTop: 2,
  },
  progressWrap: {
    marginBottom: 10,
  },
  progressTextRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  progressLabel: {
    fontSize: 11,
    fontFamily: "Nanum",
    color: "#6F6F6F",
  },
  progressValue: {
    fontSize: 11,
    fontFamily: "NanumB",
    color: "#2F2F2F",
  },
  progressValueBlue: {
    color: "#3A7BD5",
  },
  progressBarBg: {
    height: 7,
    borderRadius: 4,
    backgroundColor: "#E4E4E4",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#2F6B57",
  },
  progressBarFillBlue: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: "#3A7BD5",
  },
  summaryResultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  summaryResultLabel: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#555555",
  },
  summaryResultValue: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#D06B33",
  },
  detailStatsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: "#E6E6E6",
  },
  detailStatsTitle: {
    fontSize: 15,
    fontFamily: "NanumB",
    color: "#2F2F2F",
    marginBottom: 10,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  statRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#6F6F6F",
  },
  statValue: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#2F2F2F",
  },
  statTargetText: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#9A9A9A",
  },
  statMissedValue: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#D14A3A",
  },

  recordSectionHeader: {
    marginTop: 4,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recordSectionTitle: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#2F2F2F",
  },
  recordDetailLink: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#E04B4B",
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
    paddingTop: 18,
    paddingBottom: 18,
    justifyContent: "center",
    position: "relative",
  },
  scheduleTimeSimple: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#2F6B57",
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

  recordSourceBadge: {
    position: "absolute",
    top: 10,
    left: 14,
    alignSelf: "flex-start",
    backgroundColor: "#EAF3EF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  recordSourceBadgeText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  recordSourceBadgeManual: {
    backgroundColor: "#F4F1EA",
  },
  recordSourceBadgeManualText: {
    color: "#8A6A3D",
  },
  recordAmountDetailText: {
    fontSize: 11,
    fontFamily: "Nanum",
    color: "#8A8A8A",
    marginTop: 3,
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
    height: 340,
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
    fontSize: 15,
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
  recordHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 2,
  },

  recordSourceBadgeRight: {
    backgroundColor: "#EAF3EF",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  recordSaveButtonDisabled: {
    backgroundColor: "#C9C9C9",
  },

  recordSaveButtonTextDisabled: {
    color: "#FFFFFF",
  },

  petModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.22)",
    justifyContent: "center",
    alignItems: "center",
  },

  petSheet: {
    width: "82%",
    maxHeight: "70%",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },

  petSheetTitle: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
    marginBottom: 12,
  },
  petList: {
    maxHeight: 170,
  },

  petItem: {
    height: 52,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 12,
  },

  selectedPetItem: {
    backgroundColor: "#E4F5E8",
  },

  petIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },

  petItemText: {
    fontSize: 14,
    fontFamily: "Nanum",
    color: "#111",
  },

  selectedPetText: {
    fontFamily: "NanumB",
    color: "#111",
  },

  petSheetCloseButton: {
    height: 44,
    backgroundColor: "#2F6B57",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },

  petSheetCloseButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "NanumB",
  },

  quickAmountButton: {
    alignSelf: "flex-end",
    marginTop: -4,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#2F6B57",
    backgroundColor: "#FFFFFF",
  },

  quickAmountButtonActive: {
    backgroundColor: "#2F6B57",
  },

  quickAmountButtonText: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#222222",
  },

  quickAmountButtonTextActive: {
    color: "#FFFFFF",
  },

  recordAmountInput: {
    minWidth: 48,
    paddingHorizontal: 6,
    fontSize: 15,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
  },

  todaySummaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#E6E6E6",
  },

  todaySummaryTitle: {
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#111111",
    marginBottom: 18,
  },
  todaySummaryInlineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  todaySummaryInlineText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },

  todaySummaryInlineMissedText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#D14A3A",
  },
  todaySummaryInlineCenterText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },

  todaySummaryPlaceholder: {
    width: 70,
  },
});
