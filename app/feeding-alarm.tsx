import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

type LoggedInUser = {
  id: string;
  email: string;
  password: string;
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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const PERIOD_OPTIONS = ["오전", "오후"] as const;
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) =>
  String(i).padStart(2, "0"),
);

const FEEDING_TYPE_OPTIONS = [
  { key: "아침", icon: "weather-sunset-up" as const },
  { key: "점심", icon: "white-balance-sunny" as const },
  { key: "저녁", icon: "weather-night" as const },
] as const;

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];

const DEFAULT_FOOD_LIBRARY: FoodItem[] = [
  { id: "1", name: "로얄캐닌 키튼", subLabel: "육묘용 50g", gramLabel: "50g" },
  {
    id: "2",
    name: "힐스 사이언스 다이어트",
    subLabel: "40g",
    gramLabel: "40g",
  },
  { id: "3", name: "캐니노 프로플랜", subLabel: "45g", gramLabel: "45g" },
  { id: "4", name: "네추럴발란스", subLabel: "35g", gramLabel: "35g" },
  { id: "5", name: "오리젠 키튼", subLabel: "30g", gramLabel: "30g" },
];

const ITEM_HEIGHT = 34;
const WHEEL_VISIBLE_ROWS = 3;
const LOOP_REPEAT = 7;

const KOR_TO_WEEKDAY: Record<string, number> = {
  일: 1,
  월: 2,
  화: 3,
  수: 4,
  목: 5,
  금: 6,
  토: 7,
};

function getAlarmsKey(email: string, petId: string) {
  return `feeding_alarms_${email}_${petId}`;
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

async function ensureNotificationPermission() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === "granted";
}

async function ensureAndroidChannel() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("feeding-alarm", {
    name: "급여 알림",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#2F6B57",
  });
}

async function clearFeedingAlarmNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  const feedingOnly = scheduled.filter(
    (item) => item.content.data?.kind === "feeding-alarm",
  );

  for (const item of feedingOnly) {
    await Notifications.cancelScheduledNotificationAsync(item.identifier);
  }
}

async function syncFeedingAlarmNotifications(alarms: AlarmItem[]) {
  const granted = await ensureNotificationPermission();
  if (!granted) return;

  await ensureAndroidChannel();
  await clearFeedingAlarmNotifications();

  const enabledAlarms = alarms.filter(
    (alarm) => alarm.enabled && alarm.days && alarm.days.length > 0,
  );

  for (const alarm of enabledAlarms) {
    const hour24 = to24Hour(alarm.period, alarm.hour);

    for (const day of alarm.days) {
      const weekday = KOR_TO_WEEKDAY[day];
      if (!weekday) continue;

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "급여 알림",
          body: `${alarm.foodName} ${alarm.amount}g 급여할 시간이에요.`,
          sound: true,
          data: {
            kind: "feeding-alarm",
            alarmId: alarm.id,
            feedingType: alarm.feedingType,
          },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour: hour24,
          minute: Number(alarm.minute),
          channelId: "feeding-alarm",
        },
      });
    }
  }
}

function buildLoopedData(base: string[]) {
  return Array.from({ length: LOOP_REPEAT }, () => base).flat();
}

const LOOPED_HOURS = buildLoopedData(HOUR_OPTIONS);
const LOOPED_MINUTES = buildLoopedData(MINUTE_OPTIONS);

function getMiddleIndex(base: string[], value: string) {
  const baseIndex = Math.max(0, base.indexOf(value));
  return Math.floor(LOOP_REPEAT / 2) * base.length + baseIndex;
}

function getDayLabel(days: string[]) {
  if (days.length === 0) return "반복 없음";
  if (days.length === 7) return "매일";

  const weekday = ["월", "화", "수", "목", "금"];
  const weekend = ["토", "일"];

  const isWeekday = weekday.every((d) => days.includes(d)) && days.length === 5;
  const isWeekend = weekend.every((d) => days.includes(d)) && days.length === 2;

  if (isWeekday) return "평일";
  if (isWeekend) return "주말";

  return days.join(" / ");
}

function formatDisplayTime(period: string, hour: string, minute: string) {
  let hourNum = Number(hour);

  if (period === "오전") {
    if (hourNum === 12) hourNum = 0;
  } else {
    if (hourNum !== 12) hourNum += 12;
  }

  return `${String(hourNum).padStart(2, "0")}:${minute}`;
}

type EditableTimeWheelProps = {
  value: string;
  loopedOptions: string[];
  scrollRef: React.RefObject<ScrollView | null>;
  isEditing: boolean;
  inputValue: string;
  onInputChange: (text: string) => void;
  onSaveInput: () => void;
  onWheelEnd: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onDoubleTap: () => void;
};

function EditableTimeWheel({
  value,
  loopedOptions,
  scrollRef,
  isEditing,
  inputValue,
  onInputChange,
  onSaveInput,
  onWheelEnd,
  onDoubleTap,
}: EditableTimeWheelProps) {
  const lastTapRef = useRef(0);

  const handleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      onDoubleTap();
    }
    lastTapRef.current = now;
  };

  if (isEditing) {
    return (
      <View style={styles.manualTimeInputWrap}>
        <TextInput
          style={styles.manualTimeInput}
          value={inputValue}
          onChangeText={onInputChange}
          keyboardType="numeric"
          maxLength={2}
          autoFocus
          onBlur={onSaveInput}
          onSubmitEditing={onSaveInput}
        />
      </View>
    );
  }

  return (
    <View style={styles.timeWheelContainer}>
      <ScrollView
        ref={scrollRef}
        style={styles.timeWheel}
        contentContainerStyle={styles.wheelScrollContent}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        bounces={false}
        nestedScrollEnabled
        onMomentumScrollEnd={onWheelEnd}
      >
        {loopedOptions.map((item, index) => (
          <TouchableOpacity
            key={`${item}-${index}`}
            activeOpacity={1}
            onPress={handleTap}
            style={styles.wheelItem}
          >
            <Text
              style={[
                styles.wheelText,
                item === value && styles.wheelTextSelected,
              ]}
            >
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export default function FeedingAlarmScreen() {
  const insets = useSafeAreaInsets();
  const { petId, petName } = useLocalSearchParams<{
    petId?: string;
    petName?: string;
  }>();

  const periodRef = useRef<ScrollView>(null);
  const hourRef = useRef<ScrollView>(null);
  const minuteRef = useRef<ScrollView>(null);

  const [userEmail, setUserEmail] = useState("");

  const [foodLibrary, setFoodLibrary] =
    useState<FoodItem[]>(DEFAULT_FOOD_LIBRARY);

  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingAlarmId, setEditingAlarmId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedAlarmIds, setSelectedAlarmIds] = useState<string[]>([]);

  const [selectedPeriod, setSelectedPeriod] = useState<"오전" | "오후">("오후");
  const [selectedHour, setSelectedHour] = useState("05");
  const [selectedMinute, setSelectedMinute] = useState("15");
  const [selectedFeedingType, setSelectedFeedingType] = useState<
    "아침" | "점심" | "저녁"
  >("저녁");
  const [selectedFood, setSelectedFood] = useState<FoodItem>(
    DEFAULT_FOOD_LIBRARY[0],
  );
  const [tempSelectedFood, setTempSelectedFood] = useState<FoodItem>(
    DEFAULT_FOOD_LIBRARY[0],
  );
  const [amount, setAmount] = useState(50);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [isFoodSheetVisible, setIsFoodSheetVisible] = useState(false);
  const [isAddFoodFormVisible, setIsAddFoodFormVisible] = useState(false);
  const [newFoodName, setNewFoodName] = useState("");
  const [newFoodGram, setNewFoodGram] = useState("");

  const [editingTimeField, setEditingTimeField] = useState<
    "hour" | "minute" | null
  >(null);
  const [hourInput, setHourInput] = useState("");
  const [minuteInput, setMinuteInput] = useState("");

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

  useEffect(() => {
    const loadUserAndAlarms = async () => {
      try {
        setIsLoaded(false);

        const savedUser = await AsyncStorage.getItem("loggedInUser");
        const parsedUser: LoggedInUser | null = savedUser
          ? JSON.parse(savedUser)
          : null;

        if (!parsedUser?.email || !petId || typeof petId !== "string") {
          setUserEmail("");
          setAlarms([]);
          return;
        }

        const email = parsedUser.email;
        setUserEmail(email);

        const alarmsKey = getAlarmsKey(email, petId);
        const saved = await AsyncStorage.getItem(alarmsKey);

        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setAlarms(parsed);
          } else {
            setAlarms([]);
          }
        } else {
          setAlarms([]);
        }
      } catch (error) {
        console.log(error);
      } finally {
        setIsLoaded(true);
      }
    };

    loadUserAndAlarms();
  }, [petId]);

  useEffect(() => {
    const onBackPress = () => {
      if (isDeleteMode) {
        exitDeleteMode();
        return true;
      }

      if (isFoodSheetVisible) {
        setIsFoodSheetVisible(false);
        setIsAddFoodFormVisible(false);
        return true;
      }

      if (isFormVisible) {
        closeForm();
        return true;
      }

      return false;
    };

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      onBackPress,
    );

    return () => subscription.remove();
  }, [isDeleteMode, isFoodSheetVisible, isFormVisible]);

  useEffect(() => {
    if (!isLoaded || !userEmail || !petId || typeof petId !== "string") return;

    const saveAndSync = async () => {
      try {
        const alarmsKey = getAlarmsKey(userEmail, petId);
        await AsyncStorage.setItem(alarmsKey, JSON.stringify(alarms));
        await syncFeedingAlarmNotifications(alarms);
      } catch (error) {
        console.log(error);
      }
    };

    saveAndSync();
  }, [alarms, isLoaded, userEmail, petId]);

  useEffect(() => {
    if (!isFormVisible || editingTimeField !== null) return;

    requestAnimationFrame(() => {
      periodRef.current?.scrollTo({
        y: selectedPeriod === "오전" ? 0 : ITEM_HEIGHT,
        animated: false,
      });

      hourRef.current?.scrollTo({
        y: getMiddleIndex(HOUR_OPTIONS, selectedHour) * ITEM_HEIGHT,
        animated: false,
      });

      minuteRef.current?.scrollTo({
        y: getMiddleIndex(MINUTE_OPTIONS, selectedMinute) * ITEM_HEIGHT,
        animated: false,
      });
    });
  }, [
    isFormVisible,
    selectedPeriod,
    selectedHour,
    selectedMinute,
    editingTimeField,
  ]);

  const resetForm = () => {
    const firstFood = foodLibrary[0] || DEFAULT_FOOD_LIBRARY[0];

    setSelectedPeriod("오후");
    setSelectedHour("05");
    setSelectedMinute("15");
    setSelectedFeedingType("저녁");
    setSelectedFood(firstFood);
    setTempSelectedFood(firstFood);
    setAmount(50);
    setSelectedDays([]);
    setEditingAlarmId(null);
    setEditingTimeField(null);
    setHourInput("");
    setMinuteInput("");
  };

  const openCreateForm = () => {
    resetForm();
    setIsDeleteMode(false);
    setSelectedAlarmIds([]);
    setIsFormVisible(true);
  };

  const closeForm = () => {
    setIsFormVisible(false);
    setEditingAlarmId(null);
    setEditingTimeField(null);
    setHourInput("");
    setMinuteInput("");
    setIsFoodSheetVisible(false);
    setIsAddFoodFormVisible(false);
  };

  const openFoodSheet = () => {
    setTempSelectedFood(selectedFood);
    setIsAddFoodFormVisible(false);
    setNewFoodName("");
    setNewFoodGram("");
    setIsFoodSheetVisible(true);
  };

  const completeFoodSelection = () => {
    setSelectedFood(tempSelectedFood);
    setIsFoodSheetVisible(false);
    setIsAddFoodFormVisible(false);
  };

  const handleDecreaseAmount = () => {
    setAmount((prev) => Math.max(0, prev - 5));
  };

  const handleIncreaseAmount = () => {
    setAmount((prev) => prev + 5);
  };

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day],
    );
  };

  const recenterWheel = (
    ref: React.RefObject<ScrollView | null>,
    baseOptions: string[],
    selectedValue: string,
  ) => {
    const targetIndex = getMiddleIndex(baseOptions, selectedValue);
    requestAnimationFrame(() => {
      ref.current?.scrollTo({
        y: targetIndex * ITEM_HEIGHT,
        animated: false,
      });
    });
  };

  const handleHourMinuteWheelEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>,
    type: "hour" | "minute",
  ) => {
    if (editingTimeField !== null) return;

    const rawIndex = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);

    if (type === "hour") {
      const value = LOOPED_HOURS[rawIndex] || HOUR_OPTIONS[0];
      setSelectedHour(value);
      recenterWheel(hourRef, HOUR_OPTIONS, value);
      return;
    }

    const value = LOOPED_MINUTES[rawIndex] || MINUTE_OPTIONS[0];
    setSelectedMinute(value);
    recenterWheel(minuteRef, MINUTE_OPTIONS, value);
  };

  const handlePeriodWheelEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (editingTimeField !== null) return;

    const rawIndex = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);

    if (rawIndex <= 0) {
      setSelectedPeriod("오전");
      periodRef.current?.scrollTo({
        y: 0,
        animated: true,
      });
      return;
    }

    setSelectedPeriod("오후");
    periodRef.current?.scrollTo({
      y: ITEM_HEIGHT,
      animated: true,
    });
  };

  const startManualTimeEdit = (field: "hour" | "minute") => {
    setEditingTimeField(field);
    if (field === "hour") {
      setHourInput(selectedHour);
    } else {
      setMinuteInput(selectedMinute);
    }
  };

  const saveManualHour = () => {
    const numeric = Number(hourInput);
    if (!Number.isNaN(numeric) && numeric >= 1 && numeric <= 12) {
      setSelectedHour(String(numeric).padStart(2, "0"));
    }
    setEditingTimeField(null);
    setHourInput("");
  };

  const saveManualMinute = () => {
    const numeric = Number(minuteInput);
    if (!Number.isNaN(numeric) && numeric >= 0 && numeric <= 59) {
      setSelectedMinute(String(numeric).padStart(2, "0"));
    }
    setEditingTimeField(null);
    setMinuteInput("");
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
    setSelectedFood(newItem);
    setIsAddFoodFormVisible(false);
    setNewFoodName("");
    setNewFoodGram("");
  };

  const handleSaveAlarm = () => {
    if (!selectedPeriod || !selectedHour || !selectedMinute) {
      Alert.alert("알림", "급여 시간을 설정해주세요.");
      return;
    }

    if (!selectedFeedingType) {
      Alert.alert("알림", "급여 종류를 선택해주세요.");
      return;
    }

    if (!selectedFood?.name) {
      Alert.alert("알림", "사료를 선택해주세요.");
      return;
    }

    if (!amount || amount <= 0) {
      Alert.alert("알림", "급여량을 입력해주세요.");
      return;
    }

    if (!selectedDays || selectedDays.length === 0) {
      Alert.alert("알림", "반복 요일을 선택해주세요.");
      return;
    }

    const payload: AlarmItem = {
      id: editingAlarmId ?? `${Date.now()}`,
      period: selectedPeriod,
      hour: selectedHour,
      minute: selectedMinute,
      feedingType: selectedFeedingType,
      foodName: selectedFood.name,
      foodSubLabel: selectedFood.subLabel,
      amount,
      days: selectedDays,
      enabled: editingAlarmId
        ? (alarms.find((item) => item.id === editingAlarmId)?.enabled ?? true)
        : true,
    };

    if (editingAlarmId) {
      setAlarms((prev) =>
        prev.map((alarm) => (alarm.id === editingAlarmId ? payload : alarm)),
      );
    } else {
      setAlarms((prev) => [...prev, payload]);
    }

    closeForm();
  };

  const toggleAlarmEnabled = (id: string) => {
    setAlarms((prev) =>
      prev.map((alarm) =>
        alarm.id === id ? { ...alarm, enabled: !alarm.enabled } : alarm,
      ),
    );
  };

  const handleEditAlarm = (alarm: AlarmItem) => {
    setEditingAlarmId(alarm.id);
    setSelectedPeriod(alarm.period);
    setSelectedHour(alarm.hour);
    setSelectedMinute(alarm.minute);
    setSelectedFeedingType(alarm.feedingType);

    const foundFood = foodLibrary.find(
      (item) => item.name === alarm.foodName,
    ) || {
      id: `temp-${alarm.id}`,
      name: alarm.foodName,
      subLabel: alarm.foodSubLabel,
      gramLabel:
        alarm.foodSubLabel.replace(/[^0-9g]/g, "") || alarm.foodSubLabel,
    };

    setSelectedFood(foundFood);
    setTempSelectedFood(foundFood);
    setAmount(alarm.amount);
    setSelectedDays(alarm.days);
    setEditingTimeField(null);
    setHourInput("");
    setMinuteInput("");
    setIsFormVisible(true);
  };

  const toggleAlarmSelection = (id: string) => {
    setSelectedAlarmIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const enterDeleteMode = (alarmId: string) => {
    setIsDeleteMode(true);
    setSelectedAlarmIds([alarmId]);
  };

  const exitDeleteMode = () => {
    setIsDeleteMode(false);
    setSelectedAlarmIds([]);
  };

  const handleDeleteSelectedAlarms = () => {
    if (selectedAlarmIds.length === 0) return;

    setAlarms((prev) =>
      prev.filter((alarm) => !selectedAlarmIds.includes(alarm.id)),
    );
    setSelectedAlarmIds([]);
    setIsDeleteMode(false);
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateWrap}>
      <TouchableOpacity
        style={styles.addAlarmButton}
        activeOpacity={0.85}
        onPress={openCreateForm}
      >
        <Ionicons name="add-circle" size={18} color="#2F6B57" />
        <Text style={styles.addAlarmButtonText}>알림 추가하기</Text>
      </TouchableOpacity>
    </View>
  );

  const renderAlarmList = () => (
    <ScrollView
      contentContainerStyle={[
        styles.listContainer,
        { paddingBottom: insets.bottom + 20 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      {alarms.map((alarm) => {
        const isSelected = selectedAlarmIds.includes(alarm.id);

        return (
          <TouchableOpacity
            key={alarm.id}
            activeOpacity={0.9}
            onPress={() => {
              if (isDeleteMode) {
                toggleAlarmSelection(alarm.id);
                return;
              }
              handleEditAlarm(alarm);
            }}
            onLongPress={() => enterDeleteMode(alarm.id)}
            style={[
              styles.alarmCard,
              !alarm.enabled && styles.alarmCardDisabled,
            ]}
          >
            {isDeleteMode ? (
              <TouchableOpacity
                style={[
                  styles.selectionOval,
                  isSelected && styles.selectionOvalSelected,
                ]}
                activeOpacity={0.85}
                onPress={() => toggleAlarmSelection(alarm.id)}
              >
                {isSelected ? (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                ) : null}
              </TouchableOpacity>
            ) : null}

            <View style={styles.alarmLeft}>
              <Text
                style={[
                  styles.alarmTime,
                  !alarm.enabled && styles.alarmTimeDisabled,
                ]}
              >
                {formatDisplayTime(alarm.period, alarm.hour, alarm.minute)}
              </Text>

              <View style={styles.alarmInfoWrap}>
                <Text
                  style={[
                    styles.alarmMeta,
                    !alarm.enabled && styles.alarmMetaDisabled,
                  ]}
                >
                  {alarm.feedingType} {getDayLabel(alarm.days)}
                </Text>
                <Text
                  style={[
                    styles.alarmFood,
                    !alarm.enabled && styles.alarmFoodDisabled,
                  ]}
                >
                  {alarm.foodName}{" "}
                  <Text style={styles.alarmAmountText}>{alarm.amount}g</Text>
                </Text>
              </View>
            </View>

            {!isDeleteMode ? (
              <Switch
                value={alarm.enabled}
                onValueChange={() => toggleAlarmEnabled(alarm.id)}
                trackColor={{ false: "#D7D7D7", true: "#6E8F7F" }}
                thumbColor="#FFFFFF"
                ios_backgroundColor="#D7D7D7"
              />
            ) : null}
          </TouchableOpacity>
        );
      })}

      {!isDeleteMode ? (
        <TouchableOpacity
          style={styles.addAlarmButton}
          activeOpacity={0.85}
          onPress={openCreateForm}
        >
          <Ionicons name="add-circle" size={18} color="#2F6B57" />
          <Text style={styles.addAlarmButtonText}>알림 추가하기</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.deleteBar}>
          <TouchableOpacity
            style={styles.deleteCancelButton}
            activeOpacity={0.85}
            onPress={exitDeleteMode}
          >
            <Text style={styles.deleteCancelButtonText}>취소</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.deleteButton,
              selectedAlarmIds.length === 0 && styles.deleteButtonDisabled,
            ]}
            activeOpacity={0.85}
            onPress={handleDeleteSelectedAlarms}
            disabled={selectedAlarmIds.length === 0}
          >
            <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
            <Text style={styles.deleteButtonText}>삭제</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );

  const renderForm = () => (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        { paddingBottom: insets.bottom + 16 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.sectionBlock}>
        <Text style={[styles.sectionTitle, { marginTop: 12 }]}>급여 시간</Text>

        <View style={styles.timeSection}>
          <View style={styles.wheelHighlight} />

          <ScrollView
            ref={periodRef}
            style={styles.periodWheel}
            contentContainerStyle={styles.periodWheelContent}
            showsVerticalScrollIndicator={false}
            snapToInterval={ITEM_HEIGHT}
            decelerationRate="fast"
            bounces={false}
            nestedScrollEnabled
            onMomentumScrollEnd={handlePeriodWheelEnd}
          >
            {PERIOD_OPTIONS.map((item, index) => (
              <View key={`period-${item}-${index}`} style={styles.wheelItem}>
                <Text
                  style={[
                    styles.wheelText,
                    item === selectedPeriod && styles.wheelTextSelected,
                  ]}
                >
                  {item}
                </Text>
              </View>
            ))}
          </ScrollView>

          <EditableTimeWheel
            value={selectedHour}
            loopedOptions={LOOPED_HOURS}
            scrollRef={hourRef}
            isEditing={editingTimeField === "hour"}
            inputValue={hourInput}
            onInputChange={(text) =>
              setHourInput(text.replace(/[^0-9]/g, "").slice(0, 2))
            }
            onSaveInput={saveManualHour}
            onWheelEnd={(e) => handleHourMinuteWheelEnd(e, "hour")}
            onDoubleTap={() => startManualTimeEdit("hour")}
          />

          <Text style={styles.timeColon}>:</Text>

          <EditableTimeWheel
            value={selectedMinute}
            loopedOptions={LOOPED_MINUTES}
            scrollRef={minuteRef}
            isEditing={editingTimeField === "minute"}
            inputValue={minuteInput}
            onInputChange={(text) =>
              setMinuteInput(text.replace(/[^0-9]/g, "").slice(0, 2))
            }
            onSaveInput={saveManualMinute}
            onWheelEnd={(e) => handleHourMinuteWheelEnd(e, "minute")}
            onDoubleTap={() => startManualTimeEdit("minute")}
          />
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>급여 종류</Text>
        <View style={styles.feedingTypeRow}>
          {FEEDING_TYPE_OPTIONS.map((item) => {
            const isSelected = selectedFeedingType === item.key;

            return (
              <TouchableOpacity
                key={item.key}
                style={[styles.typeChip, isSelected && styles.typeChipSelected]}
                activeOpacity={0.85}
                onPress={() => setSelectedFeedingType(item.key)}
              >
                <MaterialCommunityIcons
                  name={item.icon}
                  size={15}
                  color={isSelected ? "#2F6B57" : "#7A7A7A"}
                />
                <Text
                  style={[
                    styles.typeChipText,
                    isSelected && styles.typeChipTextSelected,
                  ]}
                >
                  {item.key}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>사료 선택</Text>
        <TouchableOpacity
          style={styles.foodSelector}
          activeOpacity={0.85}
          onPress={openFoodSheet}
        >
          <View style={styles.foodSelectorLeft}>
            <View style={styles.foodIconWrap}>
              <MaterialCommunityIcons
                name="food-drumstick"
                size={18}
                color="#5A9EDB"
              />
            </View>

            <View>
              <Text style={styles.foodName}>{selectedFood.name}</Text>
              <Text style={styles.foodSub}>{selectedFood.subLabel}</Text>
            </View>
          </View>

          <Ionicons name="chevron-down" size={18} color="#2F6B57" />
        </TouchableOpacity>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>급여량 (g)</Text>
        <View style={styles.amountBox}>
          <Text style={styles.amountLabel}>급여량</Text>

          <View style={styles.amountRight}>
            <TouchableOpacity
              style={styles.amountCircleButton}
              activeOpacity={0.85}
              onPress={handleDecreaseAmount}
            >
              <Ionicons name="remove" size={14} color="#FFFFFF" />
            </TouchableOpacity>

            <Text style={styles.amountValue}>{amount}g</Text>

            <TouchableOpacity
              style={styles.amountCircleButton}
              activeOpacity={0.85}
              onPress={handleIncreaseAmount}
            >
              <Ionicons name="add" size={14} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionTitle}>요일</Text>
        <View style={styles.dayRow}>
          {DAYS.map((day) => {
            const isSelected = selectedDays.includes(day);

            return (
              <TouchableOpacity
                key={day}
                style={[
                  styles.dayButton,
                  isSelected && styles.dayButtonSelected,
                ]}
                activeOpacity={0.85}
                onPress={() => toggleDay(day)}
              >
                <Text
                  style={[
                    styles.dayButtonText,
                    isSelected && styles.dayButtonTextSelected,
                  ]}
                >
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.formButtonRow}>
        <TouchableOpacity
          style={styles.cancelButton}
          activeOpacity={0.9}
          onPress={closeForm}
        >
          <Text style={styles.cancelButtonText}>취소</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.saveButton}
          activeOpacity={0.9}
          onPress={handleSaveAlarm}
        >
          <Text style={styles.saveButtonText}>저장</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  const shouldShowForm = isFormVisible;
  const hasAlarms = alarms.length > 0;

  if (!isLoaded) {
    return <SafeAreaView style={styles.safe} />;
  }

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

            if (isFormVisible) {
              closeForm();
              return;
            }

            router.back();
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={24} color="#2F6B57" />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>
          {petName && typeof petName === "string" ? `${petName} 알람` : "알람"}
        </Text>

        <View style={styles.headerRight}>
          <View style={styles.headerPlaceholder} />
        </View>
      </View>

      <View style={styles.line} />

      {shouldShowForm
        ? renderForm()
        : hasAlarms
          ? renderAlarmList()
          : renderEmptyState()}

      <Modal
        visible={isFoodSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setIsFoodSheetVisible(false);
          setIsAddFoodFormVisible(false);
        }}
      >
        <View style={styles.modalOverlay}>
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
                const isSelected = tempSelectedFood.id === item.id;

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
                        <Ionicons name="checkmark" size={18} color="#57A88C" />
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
                  <Text style={styles.addNewFoodText}>직접 입력하기</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.addFoodForm}>
                  <Text style={styles.addFoodFormTitle}>사료 직접 입력</Text>

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
              onPress={completeFoodSelection}
            >
              <Text style={styles.completeButtonText}>선택 완료</Text>
            </TouchableOpacity>
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
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F7F4",
    position: "relative",
  },
  backButton: {
    position: "absolute",
    left: 18,
    top: 14,
    zIndex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "NanumB",
    color: "#2F6B57",
    textAlign: "center",
  },
  headerRight: {
    position: "absolute",
    right: 18,
    top: 14,
  },
  headerPlaceholder: {
    width: 24,
    height: 24,
  },
  line: {
    height: 1,
    backgroundColor: "#777",
    opacity: 0.5,
  },

  emptyStateWrap: {
    paddingTop: 18,
    paddingHorizontal: 22,
  },

  listContainer: {
    paddingHorizontal: 22,
    paddingTop: 16,
  },
  alarmCard: {
    minHeight: 88,
    backgroundColor: "#F1F0F0",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  alarmCardDisabled: {
    opacity: 0.55,
  },
  alarmLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  alarmTime: {
    width: 72,
    fontSize: 18,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  alarmTimeDisabled: {
    color: "#A9A9A9",
  },
  alarmInfoWrap: {
    flex: 1,
  },
  alarmMeta: {
    fontSize: 11,
    fontFamily: "Nanum",
    color: "#777777",
    marginBottom: 4,
  },
  alarmMetaDisabled: {
    color: "#B0B0B0",
  },
  alarmFood: {
    fontSize: 17,
    fontFamily: "NanumB",
    color: "#222222",
  },
  alarmFoodDisabled: {
    color: "#9A9A9A",
  },
  alarmAmountText: {
    fontFamily: "Nanum",
    color: "#8A8A8A",
  },
  selectionOval: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#C8C8C8",
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  selectionOvalSelected: {
    backgroundColor: "#2F6B57",
    borderColor: "#2F6B57",
  },
  addAlarmButton: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#2F8B73",
    backgroundColor: "#F5FBF8",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  addAlarmButtonText: {
    marginLeft: 6,
    fontSize: 15,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  deleteBar: {
    flexDirection: "row",
    gap: 12,
    marginTop: 14,
    marginBottom: 4,
  },
  deleteCancelButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#D9D9D9",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteCancelButtonText: {
    fontSize: 15,
    fontFamily: "NanumB",
    color: "#333333",
  },
  deleteButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#C94F4F",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButtonDisabled: {
    backgroundColor: "#D9A8A8",
  },
  deleteButtonText: {
    marginLeft: 6,
    fontSize: 15,
    fontFamily: "NanumB",
    color: "#FFFFFF",
  },

  container: {
    paddingTop: 12,
    paddingHorizontal: 18,
  },
  sectionBlock: {
    marginBottom: 18,
  },
  sectionTitle: {
    marginBottom: 24,
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#2F2F2F",
  },

  timeSection: {
    height: ITEM_HEIGHT * WHEEL_VISIBLE_ROWS,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
  },
  wheelHighlight: {
    position: "absolute",
    left: 8,
    right: 8,
    top: ITEM_HEIGHT,
    height: ITEM_HEIGHT,
    borderRadius: 12,
    backgroundColor: "#DDEAE5",
  },
  wheelScrollContent: {
    paddingVertical: ITEM_HEIGHT,
  },
  periodWheelContent: {
    paddingTop: ITEM_HEIGHT,
    paddingBottom: ITEM_HEIGHT,
  },
  periodWheel: {
    width: 72,
    height: ITEM_HEIGHT * WHEEL_VISIBLE_ROWS,
  },
  timeWheelContainer: {
    width: 72,
    height: ITEM_HEIGHT * WHEEL_VISIBLE_ROWS,
    position: "relative",
  },
  timeWheel: {
    width: 72,
    height: ITEM_HEIGHT * WHEEL_VISIBLE_ROWS,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  wheelText: {
    fontSize: 17,
    fontFamily: "Nanum",
    color: "#C4C4C4",
  },
  wheelTextSelected: {
    color: "#2F2F2F",
    fontFamily: "NanumB",
  },
  timeColon: {
    marginHorizontal: 6,
    fontSize: 26,
    fontFamily: "NanumB",
    color: "#2D2D2D",
    marginTop: -2,
  },
  manualTimeInputWrap: {
    width: 72,
    height: ITEM_HEIGHT * WHEEL_VISIBLE_ROWS,
    justifyContent: "center",
    alignItems: "center",
  },
  manualTimeInput: {
    width: 56,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2F6B57",
    textAlign: "center",
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#2F2F2F",
    paddingVertical: 0,
  },
  feedingTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 8,
  },
  typeChip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: 88,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.3,
    borderColor: "#D7D7D7",
  },
  typeChipSelected: {
    backgroundColor: "#EEF7F3",
    borderColor: "#2F6B57",
  },
  typeChipText: {
    marginLeft: 5,
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#777777",
  },
  typeChipTextSelected: {
    color: "#2F6B57",
  },

  foodSelector: {
    height: 62,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCDCDC",
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  foodSelectorLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  foodIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EAF4FF",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  foodName: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#2E6955",
  },
  foodSub: {
    marginTop: 2,
    fontSize: 11,
    fontFamily: "Nanum",
    color: "#98A39D",
  },

  amountBox: {
    height: 58,
    borderRadius: 16,
    backgroundColor: "#ECECEC",
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  amountLabel: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#2F2F2F",
  },
  amountRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  amountCircleButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
  },
  amountValue: {
    marginHorizontal: 12,
    fontSize: 16,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },

  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dayButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1.2,
    borderColor: "#D8D8D8",
    justifyContent: "center",
    alignItems: "center",
  },
  dayButtonSelected: {
    backgroundColor: "#2F6B57",
    borderColor: "#2F6B57",
  },
  dayButtonText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#A2A2A2",
  },
  dayButtonTextSelected: {
    color: "#FFFFFF",
  },

  saveButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#2F6B57",
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 17,
    fontFamily: "NanumB",
    color: "#FFFFFF",
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  foodSheet: {
    height: 520,
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
  formButtonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
  },
  cancelButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#D9D9D9",
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButtonText: {
    fontSize: 17,
    fontFamily: "NanumB",
    color: "#333333",
  },
});
