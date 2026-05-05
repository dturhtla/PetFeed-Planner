import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { storageKeys } from "../utils/storageKeys";

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
  feedingType: "아침" | "점심" | "저녁";
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

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function to24Hour(period: "오전" | "오후", hour: string) {
  let h = Number(hour);

  if (period === "오전") {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }

  return h;
}

function getAlarmSortValue(alarm: AlarmItem) {
  return to24Hour(alarm.period, alarm.hour) * 60 + Number(alarm.minute);
}

function formatAlarmDisplayTime(alarm: AlarmItem) {
  const h = to24Hour(alarm.period, alarm.hour);
  return `${String(h).padStart(2, "0")}:${alarm.minute}`;
}

const show = (msg: string) => {
  ToastAndroid.show(msg, ToastAndroid.SHORT);
};

function getGramNumber(value?: string | number) {
  if (value === undefined || value === null) return 0;
  return Number(String(value).replace(/[^0-9.]/g, "")) || 0;
}

function formatDateByDot(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function parseDotDate(dateKey: string) {
  const [year, month, day] = dateKey.split(".").map(Number);
  return new Date(year, month - 1, day);
}

function isSameDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function FeedingHistoryScreen() {
  const { petId } = useLocalSearchParams<{
    petId?: string;
    petName?: string;
  }>();

  const [userEmail, setUserEmail] = useState("");
  const [alarms, setAlarms] = useState<AlarmItem[]>([]);
  const [petProfiles, setPetProfiles] = useState<PetProfileItem[]>([]);
  const [selectedPetId, setSelectedPetId] = useState(petId ?? "");
  const [records, setRecords] = useState<FeedingRecord[]>([]);

  const today = new Date();
  const todayKey = formatDateByDot(today); // ⭐ 추가
  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [selectedDate, setSelectedDate] = useState(formatDateByDot(new Date()));

  const selectedPet = useMemo(() => {
    return petProfiles.find((pet) => pet.id === selectedPetId);
  }, [petProfiles, selectedPetId]);

  const renderPetIcon = (petType?: string, size = 14) => {
    if (petType === "고양이") {
      return <Ionicons name="logo-octocat" size={size} color="#111" />;
    }

    return <Ionicons name="paw" size={size} color="#111" />;
  };

  const loadData = useCallback(async () => {
    try {
      const savedUser = await AsyncStorage.getItem(storageKeys.loggedInUser);

      if (!savedUser) return;

      const parsedUser = JSON.parse(savedUser);
      const email = parsedUser.email;
      setUserEmail(email);

      const savedRecords = await AsyncStorage.getItem(
        storageKeys.feedingRecords(email),
      );

      const serverUserId = parsedUser.serverUserId;

      let loadedProfiles: PetProfileItem[] = [];

      if (serverUserId) {
        const petsResponse = await fetch(
          `https://preirrigational-concha-prealphabetically.ngrok-free.dev/api/v1/users/${serverUserId}/pets`,
          {
            headers: {
              "ngrok-skip-browser-warning": "true",
            },
          },
        );

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
                    : pet.petType || "",
            }))
            .sort(
              (a: PetProfileItem, b: PetProfileItem) =>
                Number(a.id) - Number(b.id),
            );
        }
      }

      setPetProfiles(loadedProfiles);

      const nextSelectedPetId =
        petId && loadedProfiles.some((pet) => pet.id === petId)
          ? petId
          : loadedProfiles[0]?.id || "";

      setSelectedPetId(nextSelectedPetId);

      if (savedRecords) {
        const parsedRecords = JSON.parse(savedRecords);
        setRecords(Array.isArray(parsedRecords) ? parsedRecords : []);
      }
    } catch (error) {
      console.log(error);
    }
  }, [petId]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  useFocusEffect(
    useCallback(() => {
      const loadAlarms = async () => {
        if (!userEmail || !selectedPetId) {
          setAlarms([]);
          return;
        }

        const savedAlarms = await AsyncStorage.getItem(
          storageKeys.feedingAlarms(userEmail, selectedPetId),
        );

        const parsedAlarms = savedAlarms ? JSON.parse(savedAlarms) : [];
        setAlarms(Array.isArray(parsedAlarms) ? parsedAlarms : []);
      };

      loadAlarms();
    }, [userEmail, selectedPetId]),
  );

  const selectedDateRecords = useMemo(() => {
    return records.filter(
      (record) =>
        record.petId === selectedPetId && record.date === selectedDate,
    );
  }, [records, selectedPetId, selectedDate]);

  const selectedDateAlarms = useMemo(() => {
    const selectedDateObj = parseDotDate(selectedDate);
    const dayKor = DAYS[selectedDateObj.getDay()];

    return alarms
      .filter((alarm) => alarm.enabled && alarm.days?.includes(dayKor))
      .sort((a, b) => getAlarmSortValue(a) - getAlarmSortValue(b));
  }, [alarms, selectedDate]);

  const missedAlarms = useMemo(() => {
    return selectedDateAlarms.filter((alarm) => {
      const hasRecord = selectedDateRecords.some(
        (record) => record.source === "alarm" && record.alarmId === alarm.id,
      );

      if (hasRecord) return false;

      const alarmDate = parseDotDate(selectedDate);
      alarmDate.setHours(to24Hour(alarm.period, alarm.hour));
      alarmDate.setMinutes(Number(alarm.minute));
      alarmDate.setSeconds(0);
      alarmDate.setMilliseconds(0);

      const missedBase = new Date(alarmDate);
      missedBase.setHours(missedBase.getHours() + 2);

      return missedBase < new Date();
    });
  }, [selectedDateAlarms, selectedDateRecords, selectedDate]);

  const dailyStats = useMemo(() => {
    const fedAmount = selectedDateRecords.reduce(
      (sum, record) => sum + getGramNumber(record.amount),
      0,
    );

    const missedAmount = missedAlarms.reduce(
      (sum, alarm) => sum + alarm.amount,
      0,
    );

    const targetAmount = fedAmount + missedAmount;

    const eatenAmount = selectedDateRecords.reduce(
      (sum, record) => sum + getGramNumber(record.eatenAmount ?? record.amount),
      0,
    );

    const remainAmount = Math.max(targetAmount - eatenAmount, 0);

    const intakeRate =
      targetAmount > 0 ? Math.round((eatenAmount / targetAmount) * 100) : 0;

    const iotAmount = selectedDateRecords
      .filter((record) => record.source === "alarm")
      .reduce((sum, record) => sum + getGramNumber(record.amount), 0);

    const manualAmount = selectedDateRecords
      .filter((record) => record.source === "manual")
      .reduce((sum, record) => sum + getGramNumber(record.amount), 0);

    return {
      totalAmount: targetAmount,
      fedAmount,
      eatenAmount,
      remainAmount,
      intakeRate,
      iotAmount,
      manualAmount,
      missedCount: missedAlarms.length,
      completedCount: selectedDateRecords.length,
      targetCount: selectedDateRecords.length + missedAlarms.length,
    };
  }, [selectedDateRecords, missedAlarms]);

  const timelineItems = useMemo(() => {
    const recordItems = selectedDateRecords.map((record) => {
      const [h, m] = record.time.split(":");

      return {
        id: `record-${record.id}`,
        type: "record" as const,
        sortMinutes: Number(h) * 60 + Number(m),
        record,
      };
    });

    const missedItems = missedAlarms.map((alarm) => ({
      id: `missed-${alarm.id}`,
      type: "missed" as const,
      sortMinutes: getAlarmSortValue(alarm),
      alarm,
    }));

    return [...recordItems, ...missedItems].sort(
      (a, b) => a.sortMinutes - b.sortMinutes,
    );
  }, [selectedDateRecords, missedAlarms]);

  const getRateColor = (rate: number) => {
    if (rate >= 90) return "#2F6B57";
    if (rate >= 70) return "#D9822B";
    return "#D14A3A";
  };

  const getDateIntakeRate = (date: Date) => {
    const dateKey = formatDateByDot(date);

    const dayRecords = records.filter(
      (r) => r.petId === selectedPetId && r.date === dateKey,
    );

    const dateObj = parseDotDate(dateKey);
    const dayKor = DAYS[dateObj.getDay()];

    const dayAlarms = alarms.filter(
      (alarm) => alarm.enabled && alarm.days?.includes(dayKor),
    );

    const missed = dayAlarms.filter((alarm) => {
      const hasRecord = dayRecords.some(
        (r) => r.source === "alarm" && r.alarmId === alarm.id,
      );

      return !hasRecord;
    });

    const fedAmount = dayRecords.reduce(
      (sum, r) => sum + getGramNumber(r.amount),
      0,
    );

    const missedAmount = missed.reduce((sum, alarm) => sum + alarm.amount, 0);
    const targetAmount = fedAmount + missedAmount;

    const eatenAmount = dayRecords.reduce(
      (sum, r) => sum + getGramNumber(r.eatenAmount ?? r.amount),
      0,
    );

    return targetAmount > 0
      ? Math.round((eatenAmount / targetAmount) * 100)
      : 0;
  };

  const getDotColor = (date: Date) => {
    const rate = getDateIntakeRate(date);

    if (rate === null) return null;

    return getRateColor(rate);
  };

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();

    const firstDate = new Date(year, month, 1);
    const lastDate = new Date(year, month + 1, 0);
    const startDay = firstDate.getDay();
    const totalDays = lastDate.getDate();
    const prevLastDate = new Date(year, month, 0).getDate();

    const days: { date: Date; day: number; isCurrentMonth: boolean }[] = [];

    for (let i = startDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevLastDate - i),
        day: prevLastDate - i,
        isCurrentMonth: false,
      });
    }

    for (let i = 1; i <= totalDays; i++) {
      days.push({
        date: new Date(year, month, i),
        day: i,
        isCurrentMonth: true,
      });
    }

    while (days.length % 7 !== 0) {
      const nextDay = days.length - (startDay + totalDays) + 1;

      days.push({
        date: new Date(year, month + 1, nextDay),
        day: nextDay,
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentMonth]);

  const moveMonth = (direction: "prev" | "next") => {
    setCurrentMonth((prev) => {
      const next =
        direction === "prev"
          ? new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
          : new Date(prev.getFullYear(), prev.getMonth() + 1, 1);

      return next;
    });
  };

  const handlePressDate = (date: Date) => {
    if (date > today) {
      show("미래 날짜는 선택할 수 없습니다");
      return;
    }

    const dateKey = formatDateByDot(date);
    setSelectedDate(dateKey);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={28} color="#2F6B57" />
        </TouchableOpacity>

        <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
          {selectedPet?.name ?? "반려동물"}의 급여 히스토리
        </Text>

        <View style={styles.headerPlaceholder} />
      </View>

      <View style={styles.line} />

      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <FlatList
          data={petProfiles}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.petList}
          renderItem={({ item }) => {
            const isSelected = item.id === selectedPetId;

            return (
              <TouchableOpacity
                style={[styles.petChip, isSelected && styles.petChipSelected]}
                activeOpacity={0.85}
                onPress={() => setSelectedPetId(item.id)}
              >
                <View style={styles.petIconCircle}>
                  {renderPetIcon(item.petType, 14)}
                </View>

                <Text
                  style={[
                    styles.petChipText,
                    isSelected && styles.petChipTextSelected,
                  ]}
                >
                  {item.name}
                </Text>
              </TouchableOpacity>
            );
          }}
        />

        <View style={styles.monthRow}>
          <TouchableOpacity
            style={styles.monthButton}
            onPress={() => moveMonth("prev")}
          >
            <Ionicons name="chevron-back" size={18} color="#555" />
          </TouchableOpacity>

          <Text style={styles.monthTitle}>
            {currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월
          </Text>

          <TouchableOpacity
            style={styles.monthButton}
            onPress={() => moveMonth("next")}
          >
            <Ionicons name="chevron-forward" size={18} color="#555" />
          </TouchableOpacity>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.weekRow}>
            {DAYS.map((day, index) => (
              <Text
                key={day}
                style={[
                  styles.weekText,
                  index === 0 && styles.sundayText,
                  index === 6 && styles.saturdayText,
                ]}
              >
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.daysWrap}>
            {calendarDays.map((item, index) => {
              const isSelected = formatDateByDot(item.date) === selectedDate;
              const isToday = isSameDate(item.date, today);
              const isFuture = item.date > today;
              const dotColor =
                item.isCurrentMonth && !isFuture
                  ? getDotColor(item.date)
                  : null;

              return (
                <TouchableOpacity
                  key={formatDateByDot(item.date)}
                  style={styles.dayCell}
                  activeOpacity={isFuture ? 1 : 0.75}
                  onPress={() => handlePressDate(item.date)}
                >
                  <View style={styles.dayCircleOuter}>
                    <View
                      style={[
                        styles.dayCircleInner,
                        isSelected && styles.dayCircleSelected,
                        isToday && !isSelected && styles.dayCircleToday,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayText,
                          !item.isCurrentMonth && styles.otherMonthText,
                          isFuture && styles.futureText,
                          isSelected && styles.dayTextSelected,
                        ]}
                      >
                        {item.day}
                      </Text>
                    </View>
                  </View>

                  {dotColor ? (
                    <Text style={[styles.dayDotText, { color: dotColor }]}>
                      ●
                    </Text>
                  ) : (
                    <Text style={styles.dayDotText}> </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.legendRow}>
          <View style={[styles.legendDot, { backgroundColor: "#2F6B57" }]} />
          <Text style={styles.legendText}>90% 이상</Text>

          <View style={[styles.legendDot, { backgroundColor: "#D9822B" }]} />
          <Text style={styles.legendText}>89~70%</Text>

          <View style={[styles.legendDot, { backgroundColor: "#D14A3A" }]} />
          <Text style={styles.legendText}>70% 미만</Text>
        </View>

        {timelineItems.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>
              {selectedDate === todayKey
                ? "아직 급여 기록이 없어요"
                : "급여 기록이 없어요"}
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {Number(selectedDate.split(".")[1])}월{" "}
                {Number(selectedDate.split(".")[2])}일 급여 요약
              </Text>

              <Text
                style={[
                  styles.intakeRateText,
                  { color: getRateColor(dailyStats.intakeRate) },
                ]}
              >
                섭취율: {dailyStats.intakeRate}%
              </Text>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>준 양</Text>
                <Text style={styles.statValue}>{dailyStats.totalAmount}g</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>먹은 양</Text>
                <Text style={styles.statValue}>{dailyStats.eatenAmount}g</Text>
              </View>

              <View style={styles.statRowLast}>
                <Text style={styles.statLabel}>남은 양</Text>
                <Text style={styles.orangeValue}>
                  {dailyStats.remainAmount}g
                </Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>시간대별 타임라인</Text>

              {timelineItems.map((item, index) => {
                if (item.type === "missed") {
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.timelineRow,
                        index === timelineItems.length - 1 &&
                          styles.timelineRowLast,
                      ]}
                    >
                      <View style={styles.timelineLeft}>
                        <Text style={styles.timeText}>
                          {formatAlarmDisplayTime(item.alarm)}
                        </Text>
                        <Text style={styles.missedBadge}>미지급</Text>
                      </View>

                      <Text style={styles.timelineAmount}>
                        {item.alarm.feedingType}식사 / {item.alarm.amount}g
                      </Text>
                    </View>
                  );
                }

                return (
                  <View
                    key={item.id}
                    style={[
                      styles.timelineRow,
                      index === timelineItems.length - 1 &&
                        styles.timelineRowLast,
                    ]}
                  >
                    <View style={styles.timelineLeft}>
                      <Text style={styles.timeText}>{item.record.time}</Text>
                      <Text
                        style={[
                          styles.sourceBadge,
                          item.record.source === "manual" && styles.manualBadge,
                        ]}
                      >
                        {item.record.source === "alarm"
                          ? "IoT 급여"
                          : "수동 급여"}
                      </Text>
                    </View>

                    <Text style={styles.timelineAmount}>
                      {item.record.amount}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>상세 통계</Text>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>IoT 급여량</Text>
                <Text style={styles.greenValue}>{dailyStats.iotAmount}g</Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>수동 급여량</Text>
                <Text style={styles.statValue}>{dailyStats.manualAmount}g</Text>
              </View>

              {dailyStats.missedCount > 0 && (
                <View style={styles.statRow}>
                  <Text style={styles.statLabel}>미지급 횟수</Text>
                  <Text style={styles.missedValue}>
                    {dailyStats.missedCount}회
                  </Text>
                </View>
              )}

              <View style={styles.statRowLast}>
                <Text style={styles.statLabel}>급여 상태</Text>
                <Text style={styles.statValue}>
                  {dailyStats.completedCount}회
                  <Text style={styles.targetText}>
                    /목표 {dailyStats.targetCount}회
                  </Text>
                </Text>
              </View>
            </View>
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
  },
  headerTitle: {
    flex: 1, // ⭐ 추가
    fontSize: 18,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  headerPlaceholder: {
    width: 36,
  },
  line: {
    height: 1,
    backgroundColor: "#777",
    opacity: 0.5,
    marginTop: -4,
  },
  container: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 50,
  },
  petList: {
    gap: 8,
    paddingBottom: 14,
  },
  petChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCDCDC",
  },
  petChipSelected: {
    backgroundColor: "#E8F4EE",
    borderColor: "#2F6B57",
  },
  petIconCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    justifyContent: "center",
    alignItems: "center",
  },
  petChipText: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#333",
  },
  petChipTextSelected: {
    color: "#2F6B57",
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  monthButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DCDCDC",
    justifyContent: "center",
    alignItems: "center",
  },
  monthTitle: {
    fontSize: 17,
    fontFamily: "NanumB",
    color: "#333",
  },
  calendarCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E5E5",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    marginTop: 4, // ⭐ 추가 (전체 아래로 이동)
  },
  weekText: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#777",
  },
  sundayText: {
    color: "#D14A3A",
  },
  saturdayText: {
    color: "#2F6B57",
  },

  daysWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  dayCell: {
    width: `${100 / 7}%`,
    height: 50, // 46 → 50으로
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 6,
  },
  dayCircleOuter: {
    width: 28,
    height: 28,
    borderRadius: 14, // 이것도 있어야 함
    alignItems: "center",
    justifyContent: "center",
  },

  dayCircleInner: {
    width: 28,
    height: 28,
    borderRadius: 14, // 이게 있어야 동그라미
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },

  dayCircleSelected: {
    backgroundColor: "#2F6B57",
    borderRadius: 14, // 추가
    elevation: 0,
  },

  dayCircleToday: {
    borderWidth: 1.5,
    borderColor: "#2F6B57",
    backgroundColor: "#FFFFFF",
  },
  dayText: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#333",
    includeFontPadding: false,
    textAlignVertical: "center",
    zIndex: 10,
    elevation: 10,
  },
  dayTextSelected: {
    color: "#FFFFFF",
  },

  otherMonthText: {
    color: "#B9B9B9",
  },
  futureText: {
    color: "#CFCFCF",
  },
  dayDotText: {
    height: 10,
    marginTop: 1,
    fontSize: 9,
    lineHeight: 10,
    textAlign: "center",
    includeFontPadding: false,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 10,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 4,
  },
  legendText: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#333",
    marginRight: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 15,
    borderWidth: 1,
    borderColor: "#E3E3E3",
    marginTop: 10,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "NanumB",
    color: "#333",
    marginBottom: 10,
  },
  intakeRateText: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#2F6B57",
    marginBottom: 8,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  statRowLast: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 7,
  },
  statLabel: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#666",
  },
  statValue: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#333",
  },
  greenValue: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#2F6B57",
  },
  orangeValue: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#D06B33",
  },
  timelineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: "#EEEEEE",
  },
  timeText: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#333",
  },
  timelineSub: {
    fontSize: 11,
    fontFamily: "Nanum",
    color: "#777",
    marginTop: 3,
  },
  timelineAmount: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#333",
  },
  emptyWrap: {
    minHeight: 220,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Nanum",
    color: "#4B4B4B",
  },
  timelineLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  sourceBadge: {
    fontSize: 11,
    fontFamily: "NanumB",
    color: "#2F6B57",
    backgroundColor: "#E8F4EE",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  manualBadge: {
    color: "#8A6A3D",
    backgroundColor: "#F4F1EA",
  },

  missedBadge: {
    fontSize: 11,
    fontFamily: "NanumB",
    color: "#D14A3A",
    backgroundColor: "#FCEDEA",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  missedValue: {
    fontSize: 12,
    fontFamily: "NanumB",
    color: "#D14A3A",
  },

  targetText: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#9A9A9A",
  },
  timelineRowLast: {
    borderBottomWidth: 0,
  },
});
