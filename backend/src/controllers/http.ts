import { Response } from "express";

export function sendSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({
    success: true,
    data,
  });
}

export function sendError(res: Response, status: number, error: unknown): void {
  res.status(status).json({
    error: error instanceof Error ? error.message : String(error),
  });
}

export function sendControllerError(res: Response, error: unknown): void {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();

  if (
    message.includes("required") ||
    message.includes("invalid date") ||
    message.includes("must be")
  ) {
    sendError(res, 400, error);
    return;
  }

  if (message.includes("not found")) {
    sendError(res, 404, error);
    return;
  }

  if (message.includes("does not belong")) {
    sendError(res, 403, error);
    return;
  }

  if (message.includes("not pending") || message.includes("duplicate key")) {
    sendError(res, 409, error);
    return;
  }

  sendError(res, 500, error);
}

export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function optionalDate(value: unknown): Date | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value !== "string") {
    throw new Error("Invalid date value");
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date value");
  }

  return date;
}

export function startOfLocalDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}
