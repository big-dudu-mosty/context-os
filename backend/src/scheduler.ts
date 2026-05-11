import { config } from "dotenv";
import { SchedulerService } from "./services/scheduler.service";

config({ override: true });

const schedulerService = new SchedulerService();

schedulerService.start();

function shutdown(signal: string): void {
  console.log(`Received ${signal}, shutting down...`);
  schedulerService.stop();
}

process.once("SIGINT", () => {
  shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});

console.log("Scheduler service started");
