import { DateTime } from "luxon";

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const TARGET_MINUTES = {
  High: 60,
  Medium: 240,
  Low: 480,
};

function localClock(day, clock, timezone) {
  return DateTime.fromISO(`${day.toISODate()}T${clock}`, { zone: timezone });
}

export function calculateBusinessMinutes({
  createdAt,
  responseEpoch,
  timezone,
  businessHours,
  holidays = new Set(),
}) {
  const start = DateTime.fromISO(createdAt, { zone: "utc" });
  const end = DateTime.fromSeconds(Number(responseEpoch), { zone: "utc" });

  if (!start.isValid || !end.isValid) {
    throw new Error("Cannot calculate SLA with an invalid timestamp");
  }
  if (end <= start) return 0;

  let day = start.setZone(timezone).startOf("day");
  const lastDay = end.setZone(timezone).startOf("day");
  let seconds = 0;

  while (day <= lastDay) {
    const schedule = businessHours[WEEKDAYS[day.weekday - 1]];
    if (schedule && !holidays.has(day.toISODate())) {
      const opening = localClock(day, schedule.open, timezone).toUTC();
      const closing = localClock(day, schedule.close, timezone).toUTC();
      const intervalStart = start > opening ? start : opening;
      const intervalEnd = end < closing ? end : closing;

      if (intervalEnd > intervalStart) {
        seconds += intervalEnd.diff(intervalStart, "seconds").seconds;
      }
    }
    day = day.plus({ days: 1 });
  }

  return Math.floor(seconds / 60);
}

export function calculateSlaRow({ request, events, site, holidays, staff }) {
  if (
    request.status === "canceled" ||
    request.deleted_at != null ||
    request.merged_into_id != null
  ) {
    return null;
  }

  const undoneEventIds = new Set();
  for (const event of events) {
    if (event.reverts_id != null) {
      undoneEventIds.add(Number(event.id));
      undoneEventIds.add(Number(event.reverts_id));
    }
  }

  const activeEvents = events
    .filter((event) => !undoneEventIds.has(Number(event.id)))
    .sort(
      (left, right) =>
        Number(left.at) - Number(right.at) || Number(left.id) - Number(right.id),
    );

  const firstResponse = activeEvents.find(
    (event) => event.status === "processing" && event.actor_id != null,
  );

  const responseBusinessMinutes = firstResponse
    ? calculateBusinessMinutes({
        createdAt: request.created_at,
        responseEpoch: firstResponse.at,
        timezone: site.timezone,
        businessHours: site.business_hours,
        holidays,
      })
    : null;

  const target = TARGET_MINUTES[request.priority] ?? 480;
  const withinTarget =
    responseBusinessMinutes == null
      ? null
      : responseBusinessMinutes <= target;

  const completed = activeEvents.findLast(
    (event) => event.status === "complete",
  );
  const deadlineEvent = activeEvents.findLast((event) => event.due_at != null);
  let completedLate = null;

  if (completed && deadlineEvent) {
    const deadline = DateTime.fromFormat(
      deadlineEvent.due_at,
      "dd/MM/yyyy HH:mm",
      { zone: site.timezone },
    );
    if (!deadline.isValid) throw new Error("Cannot calculate SLA with an invalid deadline");
    completedLate = Number(completed.at) > deadline.toSeconds();
  }

  const responderId = firstResponse ? Number(firstResponse.actor_id) : null;
  const createdLocalDate = DateTime.fromISO(request.created_at, { zone: "utc" })
    .setZone(site.timezone)
    .toISODate();

  return {
    request_id: Number(request.id),
    site_id: Number(request.site_id),
    responder_id: responderId,
    responder: responderId == null ? null : (staff.get(responderId) ?? null),
    response_business_minutes: responseBusinessMinutes,
    within_target: withinTarget,
    completed_late: completedLate,
    created_local_date: createdLocalDate,
  };
}
