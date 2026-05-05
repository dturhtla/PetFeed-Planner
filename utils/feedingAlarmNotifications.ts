import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

export type FeedingAlarmNotificationItem = {
  id: string;
  period: "오전" | "오후";
  hour: string;
  minute: string;
  feedingType: "아침" | "점심" | "저녁";
  foodName: string;
  amount: number;
  days: string[];
  enabled: boolean;
};

const KOR_TO_WEEKDAY: Record<string, number> = {
  일: 1,
  월: 2,
  화: 3,
  수: 4,
  목: 5,
  금: 6,
  토: 7,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function to24Hour(period: "오전" | "오후", hour: string) {
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

export async function clearFeedingAlarmNotifications() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();

  for (const item of scheduled) {
    const data = item.content.data;

    if (
      data?.kind === "feeding-alarm" ||
      data?.alarmId ||
      item.content.title === "급여 알림"
    ) {
      await Notifications.cancelScheduledNotificationAsync(item.identifier);
    }
  }
}

export async function syncFeedingAlarmNotifications(
  alarms: FeedingAlarmNotificationItem[],
) {
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

export async function cleanupGhostFeedingNotifications() {
  try {
    await clearFeedingAlarmNotifications();
  } catch (error) {
    console.log("cleanupGhostFeedingNotifications error:", error);
  }
}
