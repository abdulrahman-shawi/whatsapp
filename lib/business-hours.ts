export type BusinessHoursConfig = {
  start: string | null;
  end: string | null;
  days: string | null;
  timezone: string | null;
};

export type BusinessHoursInfo = {
  configured: boolean;
  isOpen: boolean;
  nextOpeningLabel: string | null;
};

const WEEKDAYS_AR = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

function localDayAndMinutes(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    value("weekday")
  );
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  if (day < 0 || !Number.isInteger(hour) || !Number.isInteger(minute)) {
    throw new Error(`تعذّر حساب الوقت المحلي للمنطقة الزمنية ${timezone}`);
  }
  return { day, minutes: hour * 60 + minute };
}

export function getBusinessHoursInfo(
  config: BusinessHoursConfig,
  now = new Date()
): BusinessHoursInfo {
  const configured = Boolean(config.start || config.end);
  if (!configured) {
    return { configured: false, isOpen: true, nextOpeningLabel: null };
  }

  const timezone = config.timezone?.trim() || "UTC";
  const start = Number.parseInt(config.start ?? "9", 10);
  const end = Number.parseInt(config.end ?? "17", 10);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > 23 ||
    end < 0 ||
    end > 23
  ) {
    throw new Error("ساعات العمل يجب أن تكون أرقاماً صحيحة بين 0 و23");
  }

  const allowedDays = new Set(
    (config.days ?? "")
      .split(",")
      .map((day) => Number.parseInt(day.trim(), 10))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  );
  const isAllowed = (day: number) =>
    allowedDays.size === 0 || allowedDays.has(day);
  const { day, minutes } = localDayAndMinutes(now, timezone);
  const startMinutes = start * 60;
  const endMinutes = end * 60;

  const isOpen =
    startMinutes < endMinutes
      ? isAllowed(day) && minutes >= startMinutes && minutes < endMinutes
      : startMinutes > endMinutes
        ? (isAllowed(day) && minutes >= startMinutes) ||
          (minutes < endMinutes && isAllowed((day + 6) % 7))
        : false;

  if (isOpen) {
    return { configured, isOpen, nextOpeningLabel: null };
  }

  for (let offset = 0; offset <= 7; offset++) {
    const candidateDay = (day + offset) % 7;
    if (
      isAllowed(candidateDay) &&
      (offset > 0 || minutes < startMinutes)
    ) {
      const hour12 = start % 12 || 12;
      const period = start < 12 ? "ص" : "م";
      return {
        configured,
        isOpen,
        nextOpeningLabel: `${WEEKDAYS_AR[candidateDay]} الساعة ${hour12}:00 ${period}`,
      };
    }
  }

  return { configured, isOpen, nextOpeningLabel: null };
}
