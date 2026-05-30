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
import { to24Hour } from "../utils/timeUtils";

type PetProfileItem = {
  id: string;
  name: string;
  petType?: string;
  createdAt?: string;
};

type FeedingRecord = {
  id: string;
  petId: string;
  date: string;
  foodName: string;
  foodId?: number;
  amount: string;
  eatenAmount?: string;
  time: string;
  sortKey?: number;
  source?: "alarm" | "manual" | "iot" | "server";
  alarmId?: string;
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

const API_BASE_URL = process.env.EXPO_PUBLIC_GO_SERVER_URL;
const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function getAlarmSortValue(alarm: AlarmItem) {
  return to24Hour(alarm.period, alarm.hour) * 60 + Number(alarm.minute);
}

function formatAlarmDisplayTime(alarm: AlarmItem) {
  const h = to24Hour(alarm.period, alarm.hour);
  const m = String(alarm.minute).padStart(2, "0");

  return `${String(h).padStart(2, "0")}:${m}`;
}

const show = (msg: string) => {
  ToastAndroid.show(msg, ToastAndroid.SHORT);
};

function formatDateByDot(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function formatDateByHyphen(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

function getGramNumber(value?: string | number) {
  if (value === undefined || value === null) return 0;
  return Number(String(value).replace(/[^0-9.]/g, "")) || 0;
}

function getRecordSortMinutes(record: FeedingRecord) {
  const [h, m] = record.time.split(":").map(Number);
  return h * 60 + m;
}

function normalizeFoodName(name?: string) {
  return String(name ?? "")
    .trim()
    .toLowerCase();
}

function isSameFoodRecord(a: FeedingRecord, b: FeedingRecord) {
  if (a.foodId && b.foodId) {
    return Number(a.foodId) === Number(b.foodId);
  }

  return normalizeFoodName(a.foodName) === normalizeFoodName(b.foodName);
}

function isAutoCorrectionRecord(prev: FeedingRecord, current: FeedingRecord) {
  if (prev.petId !== current.petId) return false;
  if (prev.date !== current.date) return false;
  if (prev.source !== "iot" || current.source !== "iot") return false;
  if (!isSameFoodRecord(prev, current)) return false;

  const timeDiff = Math.abs(
    getRecordSortMinutes(prev) - getRecordSortMinutes(current),
  );

  const prevAmount = getGramNumber(prev.amount);
  const prevEaten = getGramNumber(prev.eatenAmount);
  const currentAmount = getGramNumber(current.amount);
  const currentEaten = getGramNumber(current.eatenAmount);

  const prevRemaining = Math.max(prevAmount - prevEaten, 0);

  return (
    timeDiff <= 5 &&
    currentAmount > 0 &&
    currentAmount === currentEaten &&
    Math.abs(prevRemaining - currentAmount) <= 1
  );
}

function removeAutoCorrectionRecords(records: FeedingRecord[]) {
  const sortedRecords = records
    .slice()
    .sort((a, b) => getRecordSortMinutes(a) - getRecordSortMinutes(b));

  const correctionIds = new Set<string>();

  for (let i = 1; i < sortedRecords.length; i++) {
    const prev = sortedRecords[i - 1];
    const current = sortedRecords[i];

    if (isAutoCorrectionRecord(prev, current)) {
      correctionIds.add(current.id);
    }
  }

  return records.filter((record) => !correctionIds.has(record.id));
}

function getFoodKey(record: FeedingRecord) {
  return record.foodId
    ? `foodId:${record.foodId}`
    : `foodName:${normalizeFoodName(record.foodName)}`;
}

function calculateAdjustedDailyTotals(records: FeedingRecord[]) {
  let totalFed = 0;
  let totalConsumption = 0;
  let totalRemaining = 0;

  const iotGroups = new Map<string, FeedingRecord[]>();

  records.forEach((record) => {
    const amount = getGramNumber(record.amount);
    const eaten = getGramNumber(record.eatenAmount);

    if (record.source !== "iot") {
      totalFed += amount;
      totalConsumption += eaten;
      totalRemaining += Math.max(amount - eaten, 0);
      return;
    }

    const key = `${record.petId}-${record.date}-${getFoodKey(record)}`;
    const group = iotGroups.get(key) ?? [];
    group.push(record);
    iotGroups.set(key, group);
  });

  iotGroups.forEach((group) => {
    const sorted = group
      .slice()
      .sort((a, b) => getRecordSortMinutes(a) - getRecordSortMinutes(b));

    sorted.forEach((record, index) => {
      const amount = getGramNumber(record.amount);
      const eaten = getGramNumber(record.eatenAmount);
      const remaining = Math.max(amount - eaten, 0);

      if (index === 0) {
        totalFed += amount;
      } else {
        const prev = sorted[index - 1];
        const prevAmount = getGramNumber(prev.amount);
        const prevEaten = getGramNumber(prev.eatenAmount);
        const prevRemaining = Math.max(prevAmount - prevEaten, 0);

        totalFed += Math.max(amount - prevRemaining, 0);
      }

      totalConsumption += eaten;
      totalRemaining += remaining;
    });
  });

  const consumptionRate =
    totalFed > 0 ? Math.round((totalConsumption / totalFed) * 10000) / 100 : 0;

  return {
    totalFed,
    totalConsumption,
    totalRemaining,
    consumptionRate,
  };
}

function isRecordMatchedToAlarm(record: FeedingRecord, alarm: AlarmItem) {
  const recordAmount = getGramNumber(record.amount);
  const alarmAmount = Number(alarm.amount);

  if (recordAmount <= 0 || alarmAmount <= 0) return false;

  const alarmMinutes = getAlarmSortValue(alarm);
  const recordMinutes = getRecordSortMinutes(record);

  return (
    Math.abs(recordMinutes - alarmMinutes) <= 30 &&
    Math.abs(recordAmount - alarmAmount) <= 5
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
  const [, setRecords] = useState<FeedingRecord[]>([]);
  const [serverSessionRecords, setServerSessionRecords] = useState<
    FeedingRecord[]
  >([]);

  const [monthlyConsumptionMap, setMonthlyConsumptionMap] = useState<
    Record<string, string>
  >({});

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => formatDateByDot(today), [today]);
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

      if (serverUserId && API_BASE_URL) {
        const petsResponse = await fetch(
          `${API_BASE_URL}/api/v1/users/${serverUserId}/pets`,
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

          console.log("serverPets:", serverPets);

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
              createdAt:
                pet.created_at ??
                pet.createdAt ??
                pet.created_date ??
                pet.createdDate ??
                "",
            }))
            .sort(
              (a: PetProfileItem, b: PetProfileItem) =>
                Number(a.id) - Number(b.id),
            );
        }
      }

      if (loadedProfiles.length === 0) {
        const savedProfiles = await AsyncStorage.getItem(
          storageKeys.petProfiles(email),
        );

        let localProfiles = [];

        try {
          localProfiles = savedProfiles ? JSON.parse(savedProfiles) : [];
        } catch {
          localProfiles = [];
        }

        loadedProfiles = localProfiles.map((profile: any) => ({
          id: String(profile.serverPetId ?? profile.id),
          name: profile.name,
          petType: profile.petType,
          createdAt:
            profile.createdAt ??
            profile.created_at ??
            profile.createdDate ??
            profile.created_date ??
            "",
        }));
      }

      setPetProfiles(loadedProfiles);
      const savedPetId = await AsyncStorage.getItem(
        storageKeys.selectedPetId(email),
      );

      const nextSelectedPetId =
        petId && loadedProfiles.some((pet) => pet.id === petId)
          ? petId
          : savedPetId && loadedProfiles.some((pet) => pet.id === savedPetId)
            ? savedPetId
            : loadedProfiles[0]?.id || "";

      setSelectedPetId(nextSelectedPetId);

      if (nextSelectedPetId) {
        await AsyncStorage.setItem(
          storageKeys.selectedPetId(email),
          nextSelectedPetId,
        );
      }

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

  const loadServerSessions = useCallback(
    async (targetPetId: string, targetDate: string) => {
      if (!API_BASE_URL || !targetPetId) return;

      try {
        const serverDate = targetDate.replace(/\./g, "-");

        const response = await fetch(
          `${API_BASE_URL}/api/v1/pets/${targetPetId}/sessions?date=${serverDate}`,
          {
            headers: {
              "ngrok-skip-browser-warning": "true",
            },
          },
        );

        if (!response.ok) {
          console.log("sessions 조회 실패:", response.status);
          setServerSessionRecords([]);
          return;
        }

        const result = await response.json();
        const sessions = Array.isArray(result?.sessions) ? result.sessions : [];

        const serverRecords: FeedingRecord[] = sessions.map(
          (session: any, index: number) => {
            const feedingTime = String(session.feeding_time ?? "");
            const timeText = feedingTime.includes("T")
              ? feedingTime.slice(11, 16)
              : feedingTime.includes(" ")
                ? feedingTime.slice(11, 16)
                : feedingTime.slice(0, 5);

            return {
              id: `server-${targetPetId}-${serverDate}-${index}`,
              petId: targetPetId,
              date: targetDate,
              foodId: session.current_food_id ?? session.food_id,
              foodName: session.food_name ?? "사료",
              amount: `${Number(session.fed_amount ?? 0)}g`,
              eatenAmount: `${Number(session.consumed_amount ?? 0)}g`,
              time: timeText || "00:00",
              sortKey:
                new Date(feedingTime.replace(" ", "T")).getTime() || index,
              source:
                session.feed_type === "MANUAL" || session.feed_type === "manual"
                  ? "manual"
                  : "iot",
            };
          },
        );
        setServerSessionRecords(removeAutoCorrectionRecords(serverRecords));
      } catch (error) {
        console.log("loadServerSessions error:", error);
        setServerSessionRecords([]);
      }
    },
    [],
  );
  useFocusEffect(
    useCallback(() => {
      if (selectedPetId && selectedDate) {
        loadServerSessions(selectedPetId, selectedDate);
      }
    }, [selectedPetId, selectedDate, loadServerSessions]),
  );

  const loadMonthlySessions = useCallback(
    async (targetPetId: string, targetMonth: Date) => {
      if (!API_BASE_URL || !targetPetId) return;

      const year = targetMonth.getFullYear();
      const month = targetMonth.getMonth();
      const lastDate = new Date(year, month + 1, 0).getDate();

      const targetDates = Array.from({ length: lastDate }, (_, index) => {
        const dateObj = new Date(year, month, index + 1);
        return dateObj;
      }).filter((dateObj) => dateObj <= today);

      const results = await Promise.all(
        targetDates.map(async (dateObj) => {
          const dotDate = formatDateByDot(dateObj);
          const hyphenDate = formatDateByHyphen(dateObj);

          try {
            const response = await fetch(
              `${API_BASE_URL}/api/v1/pets/${targetPetId}/sessions?date=${hyphenDate}`,
              {
                headers: {
                  "ngrok-skip-browser-warning": "true",
                },
              },
            );

            if (!response.ok) return null;

            const result = await response.json();
            const sessions = Array.isArray(result?.sessions)
              ? result.sessions
              : [];

            const dayRecords: FeedingRecord[] = sessions
              .map((session: any, index: number): FeedingRecord => {
                const feedingTime = String(session.feeding_time ?? "");
                const timeText = feedingTime.includes("T")
                  ? feedingTime.slice(11, 16)
                  : feedingTime.includes(" ")
                    ? feedingTime.slice(11, 16)
                    : feedingTime.slice(0, 5);

                return {
                  id: `month-${targetPetId}-${hyphenDate}-${index}`,
                  petId: targetPetId,
                  date: dotDate,
                  foodId: session.current_food_id ?? session.food_id,
                  foodName: session.food_name ?? "사료",
                  amount: `${Number(session.fed_amount ?? 0)}g`,
                  eatenAmount: `${Number(session.consumed_amount ?? 0)}g`,
                  time: timeText || "00:00",
                  source:
                    session.feed_type === "MANUAL" ||
                    session.feed_type === "manual"
                      ? "manual"
                      : "iot",
                };
              })
              .filter(
                (record: FeedingRecord) => getGramNumber(record.amount) > 0,
              );

            const cleanedDayRecords = removeAutoCorrectionRecords(dayRecords);

            const dayKor = DAYS[dateObj.getDay()];
            const dayAlarms = alarms
              .filter((alarm) => alarm.enabled && alarm.days?.includes(dayKor))
              .sort((a, b) => getAlarmSortValue(a) - getAlarmSortValue(b));

            const usedRecordIds = new Set<string>();
            const completedRecords: FeedingRecord[] = [];

            dayAlarms.forEach((alarm) => {
              const alarmMinutes = getAlarmSortValue(alarm);

              const matchedRecord = cleanedDayRecords
                .filter((record) => !usedRecordIds.has(record.id))
                .filter((record) => isRecordMatchedToAlarm(record, alarm))
                .sort((a, b) => {
                  if (a.source === "iot" && b.source !== "iot") return -1;
                  if (a.source !== "iot" && b.source === "iot") return 1;

                  return (
                    Math.abs(getRecordSortMinutes(a) - alarmMinutes) -
                    Math.abs(getRecordSortMinutes(b) - alarmMinutes)
                  );
                })[0];

              if (matchedRecord) {
                completedRecords.push(matchedRecord);

                cleanedDayRecords
                  .filter((record) => !usedRecordIds.has(record.id))
                  .filter((record) => {
                    const timeDiff = Math.abs(
                      getRecordSortMinutes(record) - alarmMinutes,
                    );

                    return (
                      timeDiff <= 30 &&
                      getGramNumber(record.amount) > 0 &&
                      Math.abs(
                        getGramNumber(record.amount) -
                          getGramNumber(matchedRecord.amount),
                      ) <= 5
                    );
                  })
                  .forEach((record) => usedRecordIds.add(record.id));
              }
            });

            cleanedDayRecords
              .filter((record) => !usedRecordIds.has(record.id))
              .forEach((record) => completedRecords.push(record));

            if (completedRecords.length === 0) return null;

            const adjustedTotals =
              calculateAdjustedDailyTotals(completedRecords);

            const rate = adjustedTotals.consumptionRate;

            if (rate >= 90) return [hyphenDate, "green"] as const;
            if (rate >= 70) return [hyphenDate, "orange"] as const;
            return [hyphenDate, "red"] as const;
          } catch (error) {
            console.log("월간 sessions 조회 실패:", hyphenDate, error);
            return null;
          }
        }),
      );

      const nextMap: Record<string, string> = {};

      results.forEach((item) => {
        if (!item) return;
        const [date, color] = item;
        nextMap[date] = color;
      });

      setMonthlyConsumptionMap(nextMap);
    },
    [alarms, today],
  );

  useFocusEffect(
    useCallback(() => {
      if (selectedPetId) {
        loadMonthlySessions(selectedPetId, currentMonth);
      }
    }, [selectedPetId, currentMonth, loadMonthlySessions]),
  );

  const selectedDateRecords = useMemo(() => {
    return serverSessionRecords.filter(
      (record) =>
        record.petId === selectedPetId &&
        record.date === selectedDate &&
        getGramNumber(record.amount) > 0,
    );
  }, [serverSessionRecords, selectedPetId, selectedDate]);

  const selectedDateAlarms = useMemo(() => {
    const selectedDateObj = parseDotDate(selectedDate);
    const dayKor = DAYS[selectedDateObj.getDay()];

    return alarms
      .filter((alarm) => alarm.enabled && alarm.days?.includes(dayKor))
      .sort((a, b) => getAlarmSortValue(a) - getAlarmSortValue(b));
  }, [alarms, selectedDate]);

  const matchedAlarmIds = useMemo(() => {
    const usedRecordIds = new Set<string>();
    const matchedIds = new Set<string>();

    selectedDateAlarms.forEach((alarm) => {
      const alarmMinutes = getAlarmSortValue(alarm);

      const matchedRecord = selectedDateRecords
        .filter((record) => !usedRecordIds.has(record.id))
        .filter((record) => isRecordMatchedToAlarm(record, alarm))
        .sort((a, b) => {
          if (a.source === "iot" && b.source !== "iot") return -1;
          if (a.source !== "iot" && b.source === "iot") return 1;

          return (
            Math.abs(getRecordSortMinutes(a) - alarmMinutes) -
            Math.abs(getRecordSortMinutes(b) - alarmMinutes)
          );
        })[0];

      if (matchedRecord) {
        selectedDateRecords
          .filter((record) => !usedRecordIds.has(record.id))
          .filter((record) => {
            const timeDiff = Math.abs(
              getRecordSortMinutes(record) - alarmMinutes,
            );

            return (
              timeDiff <= 30 &&
              getGramNumber(record.amount) > 0 &&
              Math.abs(
                getGramNumber(record.amount) -
                  getGramNumber(matchedRecord.amount),
              ) <= 5
            );
          })
          .forEach((record) => usedRecordIds.add(record.id));

        matchedIds.add(alarm.id);
      }
    });

    return matchedIds;
  }, [selectedDateAlarms, selectedDateRecords]);

  const missedAlarms = useMemo(() => {
    return selectedDateAlarms.filter((alarm) => {
      if (matchedAlarmIds.has(alarm.id)) return false;

      const alarmDate = parseDotDate(selectedDate);
      alarmDate.setHours(to24Hour(alarm.period, alarm.hour));
      alarmDate.setMinutes(Number(alarm.minute));
      alarmDate.setSeconds(0);
      alarmDate.setMilliseconds(0);

      const missedBase = new Date(alarmDate);
      missedBase.setHours(missedBase.getHours() + 2);

      return missedBase < new Date();
    });
  }, [selectedDateAlarms, matchedAlarmIds, selectedDate]);

  const insightMessages = useMemo(() => {
    const messages: string[] = [];

    const getRateFromStatus = (status: string): number | null => {
      if (status === "green" || status === "초록") return 95;
      if (status === "orange" || status === "주황" || status === "노랑")
        return 80;
      if (status === "red" || status === "빨강" || status === "빨간") return 60;
      return null;
    };

    const rates = Object.values(monthlyConsumptionMap)
      .filter((v): v is string => typeof v === "string")
      .map(getRateFromStatus)
      .filter((v): v is number => v !== null);

    if (rates.length >= 14) {
      const recent7 = rates.slice(-7);
      const prev7 = rates.slice(-14, -7);

      const recentAvg = recent7.reduce((a, b) => a + b, 0) / recent7.length;
      const prevAvg = prev7.reduce((a, b) => a + b, 0) / prev7.length;

      const diff = Math.round(recentAvg - prevAvg);

      if (Math.abs(diff) >= 5) {
        messages.push(
          diff > 0
            ? `최근 7일 섭취율이 이전 기간보다 ${diff}% 증가했어요.`
            : `최근 7일 섭취율이 이전 기간보다 ${Math.abs(diff)}% 감소했어요.`,
        );
      }
    }

    const statuses = Object.values(monthlyConsumptionMap).filter(
      (v): v is string => typeof v === "string",
    );

    const redDays = statuses.filter(
      (v) => v === "red" || v === "빨강" || v === "빨간",
    ).length;

    const orangeDays = statuses.filter(
      (v) => v === "orange" || v === "주황" || v === "노랑",
    ).length;

    if (missedAlarms.length >= 2) {
      messages.push("최근 미급여 발생 빈도가 증가하고 있어요.");
    }

    if (redDays >= 3) {
      messages.push("최근 섭취율이 낮은 날이 반복되고 있어요.");
    } else if (redDays >= 1) {
      messages.push("일부 날짜에서 섭취율 저하가 확인돼요.");
    } else if (orangeDays >= 2) {
      messages.push("최근 섭취율이 보통 수준으로 유지되고 있어요.");
    } else {
      messages.push("최근 섭취 패턴이 안정적으로 유지되고 있어요.");
    }

    return messages;
  }, [monthlyConsumptionMap, missedAlarms.length]);

  const timelineItems = useMemo(() => {
    const usedRecordIds = new Set<string>();

    const alarmItems = selectedDateAlarms.map((alarm) => {
      const alarmMinutes = getAlarmSortValue(alarm);

      const matchedRecord = selectedDateRecords
        .filter((record) => !usedRecordIds.has(record.id))
        .filter((record) => isRecordMatchedToAlarm(record, alarm))
        .sort((a, b) => {
          if (a.source === "iot" && b.source !== "iot") return -1;
          if (a.source !== "iot" && b.source === "iot") return 1;

          return (
            Math.abs(getRecordSortMinutes(a) - alarmMinutes) -
            Math.abs(getRecordSortMinutes(b) - alarmMinutes)
          );
        })[0];

      if (matchedRecord) {
        selectedDateRecords
          .filter((record) => !usedRecordIds.has(record.id))
          .filter((record) => {
            const timeDiff = Math.abs(
              getRecordSortMinutes(record) - alarmMinutes,
            );

            return (
              timeDiff <= 30 &&
              getGramNumber(record.amount) > 0 &&
              Math.abs(
                getGramNumber(record.amount) -
                  getGramNumber(matchedRecord.amount),
              ) <= 5
            );
          })
          .forEach((record) => usedRecordIds.add(record.id));
      }

      return {
        id: `alarm-${alarm.id}`,
        type: matchedRecord ? ("record" as const) : ("missed" as const),
        sortMinutes: alarmMinutes,
        alarm,
        record: matchedRecord,
      };
    });

    const recordItems = selectedDateRecords
      .filter((record) => !usedRecordIds.has(record.id))
      .map((record) => ({
        id: `record-${record.id}`,
        type: "record" as const,
        sortMinutes: getRecordSortMinutes(record),
        record,
      }));

    return [...alarmItems, ...recordItems]
      .filter(
        (item) =>
          item.type === "record" ||
          missedAlarms.some((missed) => `alarm-${missed.id}` === item.id),
      )
      .sort((a, b) => a.sortMinutes - b.sortMinutes);
  }, [selectedDateAlarms, selectedDateRecords, missedAlarms]);

  const dailyStats = useMemo(() => {
    const completedCount = timelineItems.filter(
      (item) => item.type === "record",
    ).length;

    const missedCount = missedAlarms.length;

    const isToday = selectedDate === todayKey;

    const remainingAlarmCount = selectedDateAlarms.filter(
      (alarm) => !matchedAlarmIds.has(alarm.id),
    ).length;

    const targetCount = isToday
      ? completedCount + remainingAlarmCount
      : completedCount + missedCount;

    return {
      targetCount,
      completedCount,
      missedCount,
    };
  }, [
    timelineItems,
    missedAlarms,
    selectedDate,
    todayKey,
    selectedDateAlarms,
    matchedAlarmIds,
  ]);

  const displayDailyConsumption = useMemo(() => {
    const records = timelineItems
      .filter((item) => item.type === "record")
      .map((item) => item.record);

    return calculateAdjustedDailyTotals(records);
  }, [timelineItems]);

  const hasMissedAlarmOnDate = (date: Date) => {
    const dateKey = formatDateByDot(date);
    const dayKor = DAYS[date.getDay()];

    const targetAlarms = alarms.filter(
      (alarm) => alarm.enabled && alarm.days?.includes(dayKor),
    );

    return targetAlarms.some((alarm) => {
      const alarmDate = parseDotDate(dateKey);

      alarmDate.setHours(to24Hour(alarm.period, alarm.hour));
      alarmDate.setMinutes(Number(alarm.minute));
      alarmDate.setSeconds(0);
      alarmDate.setMilliseconds(0);

      const missedBase = new Date(alarmDate);
      missedBase.setHours(missedBase.getHours() + 2);

      return missedBase < new Date();
    });
  };

  const getFirstMonthlyDataDate = () => {
    const dates = Object.keys(monthlyConsumptionMap).sort();
    if (dates.length === 0) return null;

    return new Date(dates[0]);
  };

  const isBeforeFirstMonthlyDataDate = (date: Date) => {
    const firstDate = getFirstMonthlyDataDate();
    if (!firstDate) return false;

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    firstDate.setHours(0, 0, 0, 0);

    return targetDate < firstDate;
  };

  const isSelectedDateBeforeStart = isBeforeFirstMonthlyDataDate(
    parseDotDate(selectedDate),
  );

  const getDotColor = (date: Date) => {
    // 오늘은 아직 하루가 끝나지 않았으므로 점 없음
    if (isSameDate(date, today)) return null;

    // 첫 월별 데이터 이전 날짜는 점 없음
    if (isBeforeFirstMonthlyDataDate(date)) return null;

    const dateKey = formatDateByHyphen(date);
    const statusColor = monthlyConsumptionMap[dateKey];

    // 서버 데이터가 있으면 서버 색상 우선
    if (statusColor) {
      if (statusColor === "green" || statusColor === "초록") return "#2F6B57";

      if (
        statusColor === "orange" ||
        statusColor === "주황" ||
        statusColor === "노랑"
      ) {
        return "#D9822B";
      }

      if (
        statusColor === "red" ||
        statusColor === "빨강" ||
        statusColor === "빨간"
      ) {
        return "#D14A3A";
      }
    }

    // 서버 데이터는 없지만, 첫 데이터 이후 과거 날짜에 미지급 알람이 있으면 빨간 점
    if (hasMissedAlarmOnDate(date)) {
      return "#D14A3A";
    }

    return null;
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

  const handleSelectPet = async (pet: PetProfileItem) => {
    setSelectedPetId(pet.id);

    if (userEmail) {
      await AsyncStorage.setItem(storageKeys.selectedPetId(userEmail), pet.id);
    }
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
                onPress={() => handleSelectPet(item)}
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

        <View style={styles.insightBox}>
          <Text style={styles.insightTitle}>
            📊 {currentMonth.getMonth() + 1}월 급여 인사이트
          </Text>

          {insightMessages.map((message, index) => (
            <Text key={index} style={styles.insightText}>
              • {message}
            </Text>
          ))}
        </View>

        {isSelectedDateBeforeStart ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>급여 기록이 없어요</Text>
          </View>
        ) : timelineItems.length === 0 ? (
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
                  {
                    color:
                      displayDailyConsumption.consumptionRate >= 90
                        ? "#2F6B57"
                        : displayDailyConsumption.consumptionRate >= 70
                          ? "#D9822B"
                          : "#D14A3A",
                  },
                ]}
              >
                섭취율: {displayDailyConsumption.consumptionRate}%
              </Text>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>급여량</Text>
                <Text style={styles.statValue}>
                  {displayDailyConsumption.totalFed}g
                </Text>
              </View>

              <View style={styles.statRow}>
                <Text style={styles.statLabel}>섭취량</Text>
                <Text style={styles.statValue}>
                  {displayDailyConsumption.totalConsumption}g
                </Text>
              </View>

              <View style={styles.statRowLast}>
                <Text style={styles.statLabel}>미섭취량</Text>
                <Text style={styles.orangeValue}>
                  {displayDailyConsumption.totalRemaining}g
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
                        {item.alarm.amount}g
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
                    </View>

                    <Text style={styles.timelineAmount}>
                      {item.record.eatenAmount} / {item.record.amount}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>상세 통계</Text>

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
    position: "absolute",
    left: 60,
    right: 60,
    textAlign: "center",
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
  insightBox: {
    backgroundColor: "#FFF5CC",
    borderWidth: 1,
    borderColor: "#E6B800",
    borderStyle: "dashed",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 4,
    marginBottom: 10,
  },

  insightTitle: {
    fontSize: 13,
    fontFamily: "NanumB",
    color: "#333",
    marginBottom: 8,
  },

  insightText: {
    fontSize: 12,
    fontFamily: "Nanum",
    color: "#333",
    lineHeight: 19,
    marginBottom: 3,
  },
});
