import { getSlaReport } from "../repositories/report.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value) {
  if (!DATE_PATTERN.test(value ?? "")) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function parseDateRange(queryParameters) {
  const { from, to } = queryParameters;
  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    const error = new Error(
      "from and to must be valid YYYY-MM-DD dates and from must not be after to",
    );
    error.status = 400;
    throw error;
  }
  return { from, to };
}

export async function slaReportController(request, response, next) {
  try {
    const { from, to } = parseDateRange(request.query);
    response.json(await getSlaReport(from, to));
  } catch (error) {
    next(error);
  }
}
