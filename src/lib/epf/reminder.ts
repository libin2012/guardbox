import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { EpfReminderSettings } from '../types';

const ID_PREFIX = 'epf-reminder';
export const EPF_IMPORT_URL = '/epf-import';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export function describeReminder(r: EpfReminderSettings): string {
  if (!r.enabled) return 'Off';
  const day = `${r.day}${ordinal(r.day)}`;
  const time = new Date(2000, 0, 1, r.hour).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return r.frequency === 'monthly' ? `On the ${day} of every month, ${time}` : `Every 3 months on the ${day}, ${time}`;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

/** Ask for notification permission. Returns true when reminders can be shown. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return next.granted;
}

/** Months (0-11) a quarterly reminder fires in, starting from the current month. */
export function quarterMonths(now = new Date()): number[] {
  const m = now.getMonth();
  return [0, 3, 6, 9].map((k) => (m + k) % 12).sort((a, b) => a - b);
}

/**
 * Replace any scheduled PF reminders with ones that match the settings.
 * Safe to call on every launch; it does nothing without permission.
 */
export async function scheduleEpfReminder(r: EpfReminderSettings): Promise<void> {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((n) => n.identifier.startsWith(ID_PREFIX)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (!r.enabled) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;

  const content: Notifications.NotificationContentInput = {
    title: 'Time to update your PF balance',
    body: 'Download your latest EPF passbook from UMANG or the EPFO portal, then share it to GuardBox.',
    data: { url: EPF_IMPORT_URL },
  };
  const day = Math.min(Math.max(1, Math.round(r.day)), 28);
  const hour = Math.min(Math.max(0, Math.round(r.hour)), 23);
  if (r.frequency === 'monthly') {
    await Notifications.scheduleNotificationAsync({
      identifier: `${ID_PREFIX}-monthly`,
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.MONTHLY, day, hour, minute: 0 },
    });
  } else {
    for (const month of quarterMonths()) {
      await Notifications.scheduleNotificationAsync({
        identifier: `${ID_PREFIX}-q${month}`,
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.YEARLY, month, day, hour, minute: 0 },
      });
    }
  }
}

/** True when a tapped notification is one of ours. */
export function isEpfReminderResponse(res: Notifications.NotificationResponse | null | undefined): boolean {
  return res?.notification.request.content.data?.url === EPF_IMPORT_URL;
}
