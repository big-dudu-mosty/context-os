import { DreamScheduler } from "../schedulers/dream.scheduler";

export class SchedulerService {
  private readonly dreamScheduler: DreamScheduler;

  constructor() {
    this.dreamScheduler = new DreamScheduler({
      enabled: process.env.ENABLE_SCHEDULERS !== "false",
    });
  }

  start(): void {
    console.log("Starting schedulers...");
    this.dreamScheduler.start();
  }

  stop(): void {
    console.log("Stopping schedulers...");
    this.dreamScheduler.stop();
  }

  getDreamScheduler(): DreamScheduler {
    return this.dreamScheduler;
  }
}
