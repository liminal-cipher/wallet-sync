import { readLocal, writeLocal } from "./localRecovery";
export const DEFAULT_REMINDERS = { enabled: true, hour: 9, minute: 0, days: [7, 3, 0] };
const listeners = new Set();
export function validateReminders(input) {
  if (!input || typeof input.enabled !== "boolean" || !Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23 ||
      !Number.isInteger(input.minute) || input.minute < 0 || input.minute > 59 || !Array.isArray(input.days) ||
      !input.days.length || input.days.some((day) => !Number.isInteger(day) || day < 0 || day > 365)) {
    throw new Error("알림 시간은 00:00~23:59, 사전 알림은 0~365일 사이로 입력해 주세요.");
  }
  return { enabled: input.enabled, hour: input.hour, minute: input.minute, days: [...new Set(input.days)].sort((a, b) => b - a) };
}
export const loadReminderSettings = async (uid) => validateReminders(await readLocal(uid, "reminders", DEFAULT_REMINDERS));
export async function saveReminderSettings(uid, input) {
  const settings = validateReminders(input);
  await writeLocal(uid, "reminders", settings);
  for (const listener of listeners) listener(uid);
  return settings;
}
export function observeReminderSettings(listener) { listeners.add(listener); return () => listeners.delete(listener); }
