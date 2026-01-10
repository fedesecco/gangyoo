import type { I18n } from "@grammyjs/i18n";
import type { Bot } from "grammy";
import type { DbClient } from "../db.js";
import type { BotContext } from "../types.js";
import { runLoserOfDayJob } from "./loserOfDay.js";

export type JobDeps = {
  bot: Bot<BotContext>;
  db: DbClient;
  i18n: I18n;
};

export type CronJob = {
  id: string;
  run: (deps: JobDeps) => Promise<void>;
};

const jobs: CronJob[] = [
  {
    id: "loser-of-day",
    run: runLoserOfDayJob
  }
];

export function getCronJob(id: string): CronJob | null {
  return jobs.find((job) => job.id === id) ?? null;
}
