import type { Conversation } from "@grammyjs/conversations";
import type { TranslationVariables } from "@grammyjs/i18n";
import { InlineKeyboard } from "grammy";
import type { DbClient } from "./db.js";
import { DEFAULT_LANG } from "./i18n.js";
import type { BotContext, ConversationContext } from "./types.js";

const CANCEL_COMMAND = "/cancel";
const CALLBACK_PREFIX = "event";
const CALLBACK_CANCEL = `${CALLBACK_PREFIX}:cancel`;
const DEFAULT_CLOSE_HOURS = 24;
const MAX_POLL_NAME_LENGTH = 100;
const MIN_POLL_CLOSE_LEAD_MS = 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;
const MINUTE_STEP = 5;
const YEAR_RANGE = 3;

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type TimeParts = {
  hour: number;
  minute: number;
};

type EventConversation = Conversation<BotContext, ConversationContext>;

export function createEventConversation(db: DbClient | null) {
  return async function eventConversation(
    conversation: EventConversation,
    ctx: ConversationContext
  ) {
    const creatorId = ctx.from?.id;
    if (!creatorId) return;

    const labelEventDate = t(ctx, "event_label_date");
    const labelEventTime = t(ctx, "event_label_time");
    const labelCloseDate = t(ctx, "event_label_close_date");
    const labelCloseTime = t(ctx, "event_label_close_time");

    const name = await promptForValue(
      conversation,
      ctx,
      creatorId,
      t(ctx, "event_name_prompt"),
      parseName,
      t(ctx, "event_name_invalid")
    );
    if (!name) return;

    let eventDate: Date;
    let dateLabel = "";
    let timeLabel = "";

    while (true) {
      const date = await selectDate(
        conversation,
        ctx,
        creatorId,
        labelEventDate
      );
      if (!date) return;

      const time = await selectTime(
        conversation,
        ctx,
        creatorId,
        labelEventTime
      );
      if (!time) return;

      eventDate = new Date(
        date.year,
        date.month - 1,
        date.day,
        time.hour,
        time.minute,
        0,
        0
      );

      const now = await conversation.now();
      if (eventDate.getTime() <= now + MIN_POLL_CLOSE_LEAD_MS) {
        await ctx.reply(t(ctx, "event_time_too_soon"));
        continue;
      }

      dateLabel = formatDateLabel(date);
      timeLabel = formatTimeLabel(time);
      break;
    }

    const closeDate = await selectCloseDate(
      conversation,
      ctx,
      creatorId,
      eventDate,
      labelCloseDate,
      labelCloseTime
    );
    if (!closeDate) return;

    const closeLabel = formatDateTime(closeDate);
    const closeHours =
      (eventDate.getTime() - closeDate.getTime()) / MS_PER_HOUR;

    const summary = t(ctx, "event_summary", {
      name,
      date: dateLabel,
      time: timeLabel,
      close: closeLabel,
      offset: formatHours(closeHours)
    });

    await ctx.reply(summary);

    const pollQuestion = buildPollQuestion(ctx, name, dateLabel, timeLabel);
    await ctx.replyWithPoll(pollQuestion, ["Yes", "No"], {
      is_anonymous: false,
      close_date: Math.floor(closeDate.getTime() / 1000)
    });

    await persistEvent(db, ctx, name, eventDate, closeDate);
  };
}

async function persistEvent(
  db: DbClient | null,
  ctx: ConversationContext,
  name: string,
  eventDate: Date,
  reminderDate: Date
) {
  if (!db) return;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  try {
    await db.ensureChat(chatId, DEFAULT_LANG);
    // Use the poll close time as reminder_date until a separate reminder is collected.
    await db.createEvent({
      chatId,
      name,
      eventDate,
      reminderDate,
      participants: []
    });
  } catch (err) {
    console.error("Event save error", err);
  }
}

async function promptForValue<T>(
  conversation: EventConversation,
  ctx: ConversationContext,
  creatorId: number,
  prompt: string,
  parser: (text: string) => T | null,
  invalidMessage: string
): Promise<T | null> {
  await ctx.reply(prompt);
  while (true) {
    const text = await waitForCreatorText(conversation, creatorId);
    if (text === null) return null;
    const parsed = parser(text);
    if (parsed !== null) return parsed;
    await ctx.reply(invalidMessage);
  }
}

async function waitForCreatorText(
  conversation: EventConversation,
  creatorId: number
): Promise<string | null> {
  const responseCtx = await conversation
    .waitFrom(creatorId, { next: true })
    .andFor("message:text", {
      otherwise: (ctx) => ctx.reply(t(ctx, "event_text_required")),
      next: true
    });
  const text = responseCtx.message.text.trim();
  if (isCancelCommand(text)) {
    await responseCtx.reply(t(responseCtx, "event_cancelled"));
    return null;
  }
  return text;
}

async function selectDate(
  conversation: EventConversation,
  ctx: ConversationContext,
  creatorId: number,
  label: string
): Promise<DateParts | null> {
  while (true) {
    await ctx.reply(t(ctx, "event_pick_day", { label }), {
      reply_markup: buildDayKeyboard(ctx)
    });
    const day = await waitForSelectionNumber(conversation, creatorId, "day");
    if (day === null) return null;

    await ctx.reply(t(ctx, "event_pick_month", { label }), {
      reply_markup: buildMonthKeyboard(ctx)
    });
    const month = await waitForSelectionNumber(conversation, creatorId, "month");
    if (month === null) return null;

    await ctx.reply(t(ctx, "event_pick_year", { label }), {
      reply_markup: buildYearKeyboard(ctx)
    });
    const year = await waitForSelectionNumber(conversation, creatorId, "year");
    if (year === null) return null;

    if (!isValidDate(year, month, day)) {
      await ctx.reply(t(ctx, "event_invalid_date"));
      continue;
    }

    return { year, month, day };
  }
}

async function selectTime(
  conversation: EventConversation,
  ctx: ConversationContext,
  creatorId: number,
  label: string
): Promise<TimeParts | null> {
  await ctx.reply(t(ctx, "event_pick_hour", { label }), {
    reply_markup: buildHourKeyboard(ctx)
  });
  const hour = await waitForSelectionNumber(conversation, creatorId, "hour");
  if (hour === null) return null;

  await ctx.reply(t(ctx, "event_pick_minute", { label, step: MINUTE_STEP }), {
    reply_markup: buildMinuteKeyboard(ctx)
  });
  const minute = await waitForSelectionNumber(conversation, creatorId, "minute");
  if (minute === null) return null;

  return { hour, minute };
}

async function selectCloseDate(
  conversation: EventConversation,
  ctx: ConversationContext,
  creatorId: number,
  eventDate: Date,
  labelCloseDate: string,
  labelCloseTime: string
): Promise<Date | null> {
  while (true) {
    await ctx.reply(t(ctx, "event_close_prompt"), {
      reply_markup: buildCloseKeyboard(ctx)
    });
    const choice = await waitForSelection(conversation, creatorId, "close", (value) => {
      if (value === "custom") return value;
      const hours = Number(value);
      if (!Number.isFinite(hours) || hours < 0) return null;
      return hours;
    });
    if (choice === null) return null;

    if (choice === "custom") {
      const customDate = await selectCustomCloseDate(
        conversation,
        ctx,
        creatorId,
        eventDate,
        labelCloseDate,
        labelCloseTime
      );
      if (!customDate) return null;
      return customDate;
    }

    if (typeof choice !== "number") {
      await ctx.reply(t(ctx, "event_buttons_only"));
      continue;
    }

    const closeDate = new Date(eventDate.getTime() - choice * MS_PER_HOUR);
    const now = await conversation.now();
    if (closeDate.getTime() <= now + MIN_POLL_CLOSE_LEAD_MS) {
      await ctx.reply(t(ctx, "event_close_too_soon"));
      continue;
    }

    return closeDate;
  }
}

async function selectCustomCloseDate(
  conversation: EventConversation,
  ctx: ConversationContext,
  creatorId: number,
  eventDate: Date,
  labelCloseDate: string,
  labelCloseTime: string
): Promise<Date | null> {
  while (true) {
    const date = await selectDate(
      conversation,
      ctx,
      creatorId,
      labelCloseDate
    );
    if (!date) return null;

    const time = await selectTime(
      conversation,
      ctx,
      creatorId,
      labelCloseTime
    );
    if (!time) return null;

    const closeDate = new Date(
      date.year,
      date.month - 1,
      date.day,
      time.hour,
      time.minute,
      0,
      0
    );
    const now = await conversation.now();
    if (closeDate.getTime() <= now + MIN_POLL_CLOSE_LEAD_MS) {
      await ctx.reply(t(ctx, "event_close_time_future"));
      continue;
    }
    if (closeDate.getTime() >= eventDate.getTime()) {
      await ctx.reply(t(ctx, "event_close_time_before_event"));
      continue;
    }
    return closeDate;
  }
}

async function waitForSelectionNumber(
  conversation: EventConversation,
  creatorId: number,
  action: string
): Promise<number | null> {
  return waitForSelection(conversation, creatorId, action, (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  });
}

async function waitForSelection<T>(
  conversation: EventConversation,
  creatorId: number,
  action: string,
  parser: (value: string) => T | null
): Promise<T | null> {
  const actionPattern = escapeRegex(action);
  const pattern = new RegExp(
    `^${CALLBACK_PREFIX}:${actionPattern}:(.+)$|^${CALLBACK_PREFIX}:cancel$`
  );

  const responseCtx = await conversation
    .waitForCallbackQuery(pattern, {
      next: true,
      otherwise: (ctx) => answerUnexpectedCallback(ctx)
    })
    .andFrom(creatorId, {
      next: true,
      otherwise: (ctx) => answerNotCreator(ctx)
    });

  const data = responseCtx.callbackQuery.data;
  if (!data) {
    return waitForSelection(conversation, creatorId, action, parser);
  }

  if (data === CALLBACK_CANCEL) {
    await responseCtx.answerCallbackQuery();
    await clearInlineKeyboard(responseCtx);
    await responseCtx.reply(t(responseCtx, "event_cancelled"));
    return null;
  }

  const rawValue = data.split(":").slice(2).join(":");
  const parsed = parser(rawValue);
  await responseCtx.answerCallbackQuery();
  await clearInlineKeyboard(responseCtx);
  if (parsed === null) {
    await responseCtx.reply(t(responseCtx, "event_buttons_only"));
    return waitForSelection(conversation, creatorId, action, parser);
  }
  return parsed;
}

function buildDayKeyboard(ctx: ConversationContext): InlineKeyboard {
  const values = Array.from({ length: 31 }, (_, idx) => idx + 1);
  return buildNumberKeyboard(values, 7, "day", t(ctx, "event_button_cancel"));
}

function buildMonthKeyboard(ctx: ConversationContext): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const labels = getMonthLabels(ctx);
  labels.forEach((label, idx) => {
    keyboard.text(label, callbackData("month", idx + 1));
    if ((idx + 1) % 3 === 0 && idx < labels.length - 1) {
      keyboard.row();
    }
  });
  keyboard.row();
  keyboard.text(t(ctx, "event_button_cancel"), CALLBACK_CANCEL);
  return keyboard;
}

function buildYearKeyboard(ctx: ConversationContext): InlineKeyboard {
  const currentYear = new Date().getFullYear();
  const values = Array.from(
    { length: YEAR_RANGE + 1 },
    (_, idx) => currentYear + idx
  );
  return buildNumberKeyboard(values, 4, "year", t(ctx, "event_button_cancel"));
}

function buildHourKeyboard(ctx: ConversationContext): InlineKeyboard {
  const values = Array.from({ length: 24 }, (_, idx) => idx);
  return buildNumberKeyboard(values, 6, "hour", t(ctx, "event_button_cancel"), pad2);
}

function buildMinuteKeyboard(ctx: ConversationContext): InlineKeyboard {
  const values: number[] = [];
  for (let minute = 0; minute < 60; minute += MINUTE_STEP) {
    values.push(minute);
  }
  return buildNumberKeyboard(
    values,
    6,
    "minute",
    t(ctx, "event_button_cancel"),
    pad2
  );
}

function buildCloseKeyboard(ctx: ConversationContext): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  keyboard
    .text(
      formatCloseHoursLabel(ctx, DEFAULT_CLOSE_HOURS, true),
      callbackData("close", DEFAULT_CLOSE_HOURS)
    )
    .row();
  keyboard
    .text(formatCloseHoursLabel(ctx, 12), callbackData("close", 12))
    .text(formatCloseHoursLabel(ctx, 6), callbackData("close", 6))
    .row();
  keyboard
    .text(formatCloseHoursLabel(ctx, 48), callbackData("close", 48))
    .text(formatCloseHoursLabel(ctx, 72), callbackData("close", 72))
    .row();
  keyboard
    .text(t(ctx, "event_button_custom_time"), callbackData("close", "custom"))
    .row();
  keyboard.text(t(ctx, "event_button_cancel"), CALLBACK_CANCEL);
  return keyboard;
}

function buildNumberKeyboard(
  values: number[],
  perRow: number,
  action: string,
  cancelLabel: string,
  labelFormatter: (value: number) => string = (value) => value.toString()
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  values.forEach((value, idx) => {
    keyboard.text(labelFormatter(value), callbackData(action, value));
    if ((idx + 1) % perRow === 0 && idx < values.length - 1) {
      keyboard.row();
    }
  });
  keyboard.row();
  keyboard.text(cancelLabel, CALLBACK_CANCEL);
  return keyboard;
}

function callbackData(action: string, value: number | string): string {
  return `${CALLBACK_PREFIX}:${action}:${value}`;
}

async function clearInlineKeyboard(ctx: ConversationContext) {
  if (!ctx.callbackQuery?.message) return;
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
  } catch (err) {
    console.warn("Failed to clear inline keyboard", err);
  }
}

function answerUnexpectedCallback(ctx: ConversationContext) {
  if (!ctx.callbackQuery?.data) return;
  if (!ctx.callbackQuery.data.startsWith(`${CALLBACK_PREFIX}:`)) return;
  return ctx.answerCallbackQuery({ text: t(ctx, "event_buttons_current") });
}

function answerNotCreator(ctx: ConversationContext) {
  if (!ctx.callbackQuery) return;
  return ctx.answerCallbackQuery({
    text: t(ctx, "event_buttons_creator_only")
  });
}

function parseName(text: string): string | null {
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isCancelCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return normalized === CANCEL_COMMAND || normalized.startsWith(`${CANCEL_COMMAND}@`);
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

function formatDateLabel(date: DateParts): string {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

function formatTimeLabel(time: TimeParts): string {
  return `${pad2(time.hour)}:${pad2(time.minute)}`;
}

function formatDateTime(date: Date): string {
  const dateLabel = formatDateLabel({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate()
  });
  const timeLabel = formatTimeLabel({
    hour: date.getHours(),
    minute: date.getMinutes()
  });
  return `${dateLabel} ${timeLabel}`;
}

function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return "0h";
  if (Number.isInteger(hours)) return `${hours}h`;
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded}h`;
}

function buildPollQuestion(
  ctx: ConversationContext,
  name: string,
  dateLabel: string,
  timeLabel: string
): string {
  const safeName = truncate(name, MAX_POLL_NAME_LENGTH);
  const question = t(ctx, "event_poll_question", {
    name: safeName,
    date: dateLabel,
    time: timeLabel
  });
  if (question.length <= 300) return question;
  const shorterName = truncate(name, 60);
  return t(ctx, "event_poll_question_short", { name: shorterName });
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function t(
  ctx: ConversationContext,
  key: string,
  params?: TranslationVariables
): string {
  return ctx.t(key, params);
}

function getMonthLabels(ctx: ConversationContext): string[] {
  return [
    t(ctx, "event_month_1"),
    t(ctx, "event_month_2"),
    t(ctx, "event_month_3"),
    t(ctx, "event_month_4"),
    t(ctx, "event_month_5"),
    t(ctx, "event_month_6"),
    t(ctx, "event_month_7"),
    t(ctx, "event_month_8"),
    t(ctx, "event_month_9"),
    t(ctx, "event_month_10"),
    t(ctx, "event_month_11"),
    t(ctx, "event_month_12")
  ];
}

function formatCloseHoursLabel(
  ctx: ConversationContext,
  hours: number,
  isDefault = false
): string {
  if (isDefault) {
    return t(ctx, "event_close_default", { hours });
  }
  return t(ctx, "event_close_hours", { hours });
}
