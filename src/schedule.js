const pad2 = (value) => String(value).padStart(2, "0");

const parseTime = (value) => {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  return { hour, minute };
};

export const scheduleHelp = [
  "*Розклад розіграшів*",
  "Налаштування доступне лише адміністраторам.",
  "",
  "*Формати*",
  "`daily HH:MM` — щодня",
  "`weekdays HH:MM` — у будні (пн-пт)",
  "`weekly mon HH:MM` — щотижня у вибраний день",
  "`every Nh` — кожні N годин",
  "`every Nd` — кожні N днів",
  "`off` — вимкнути розклад",
  "",
  "*Приклади*",
  "/configure schedule `daily 09:00`",
  "/configure schedule `weekdays 12:30`",
  "/configure schedule `weekly fri 20:00`",
  "/configure schedule `every 6h`",
  "/configure schedule `off`",
  "",
  "Розклад працює за часовим поясом `Europe/Kyiv`.",
  "Хвилинні інтервали не підтримуються."
].join("\n");

export const scheduleTimezoneDefault = "Europe/Kyiv";

export const parseScheduleInput = (input) => {
  const normalized = String(input || "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "off") return { type: "off" };

  const dailyMatch = normalized.match(/^daily\s+(\d{1,2}:\d{2})$/);
  if (dailyMatch) {
    const time = parseTime(dailyMatch[1]);
    if (!time) return null;
    return { type: "daily", ...time };
  }

  const weekdaysMatch = normalized.match(/^weekdays\s+(\d{1,2}:\d{2})$/);
  if (weekdaysMatch) {
    const time = parseTime(weekdaysMatch[1]);
    if (!time) return null;
    return { type: "weekdays", ...time };
  }

  const weeklyMatch = normalized.match(
    /^weekly\s+(mon|tue|wed|thu|fri|sat|sun)\s+(\d{1,2}:\d{2})$/
  );
  if (weeklyMatch) {
    const day = weeklyMatch[1];
    const time = parseTime(weeklyMatch[2]);
    if (!time) return null;
    return { type: "weekly", day, ...time };
  }

  const everyMatch = normalized.match(/^every\s+(\d+)\s*([hd])$/);
  if (everyMatch) {
    const value = Number(everyMatch[1]);
    const unit = everyMatch[2];
    if (!Number.isFinite(value) || value < 1) return null;
    return { type: "every", value, unit };
  }

  return null;
};

export const formatSchedule = (schedule) => {
  if (!schedule || schedule.type === "off") return "off";
  if (schedule.type === "daily") {
    return `daily ${pad2(schedule.hour)}:${pad2(schedule.minute)}`;
  }
  if (schedule.type === "weekdays") {
    return `weekdays ${pad2(schedule.hour)}:${pad2(schedule.minute)}`;
  }
  if (schedule.type === "weekly") {
    return `weekly ${schedule.day} ${pad2(schedule.hour)}:${pad2(schedule.minute)}`;
  }
  if (schedule.type === "every") {
    return `every ${schedule.value}${schedule.unit}`;
  }
  return "off";
};

export const getZonedParts = (date, timeZone) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  const parts = formatter.formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }
    return acc;
  }, {});
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour);
  const minute = Number(parts.minute);
  const weekday = String(parts.weekday || "").toLowerCase().slice(0, 3);
  const dateKey = `${pad2(year)}-${pad2(month)}-${pad2(day)}`;
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday,
    dateKey
  };
};

export const isScheduleDue = (schedule, parts) => {
  if (!schedule || schedule.type === "off") return false;
  if (schedule.type === "daily") {
    return schedule.hour === parts.hour && schedule.minute === parts.minute;
  }
  if (schedule.type === "weekdays") {
    const isWeekday = ["mon", "tue", "wed", "thu", "fri"].includes(parts.weekday);
    return isWeekday && schedule.hour === parts.hour && schedule.minute === parts.minute;
  }
  if (schedule.type === "weekly") {
    return schedule.day === parts.weekday && schedule.hour === parts.hour && schedule.minute === parts.minute;
  }
  if (schedule.type === "every" && schedule.unit === "h") {
    return parts.minute === 0 && parts.hour % schedule.value === 0;
  }
  if (schedule.type === "every" && schedule.unit === "d") {
    if (parts.hour !== 0 || parts.minute !== 0) return false;
    const dayIndex = Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000);
    return dayIndex % schedule.value === 0;
  }
  return false;
};

export const buildScheduleRunKey = (schedule, parts) => {
  if (!schedule || schedule.type === "off") return null;
  if (schedule.type === "daily" || schedule.type === "weekdays" || schedule.type === "weekly") {
    return `${parts.dateKey}-${pad2(parts.hour)}:${pad2(parts.minute)}`;
  }
  if (schedule.type === "every" && schedule.unit === "h") {
    return `${parts.dateKey}-h${pad2(parts.hour)}`;
  }
  if (schedule.type === "every" && schedule.unit === "d") {
    return `${parts.dateKey}-d${schedule.value}`;
  }
  return null;
};
