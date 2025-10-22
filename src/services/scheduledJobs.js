// src/services/scheduledJobs.js - Scheduled Jobs Service
import cron from "node-cron";
import assignmentService from "./assignmentService.js";
import { logger } from "../utils/logger.js";

class ScheduledJobsService {
  constructor() {
    this.jobs = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize all scheduled jobs
   */
  async initialize() {
    try {
      logger.info("🕒 Initializing scheduled jobs...", {});

      // Schedule round-robin reset daily between 5:00-6:00 AM
      this.scheduleRoundRobinReset();

      this.isInitialized = true;
      logger.info("✅ Scheduled jobs initialized successfully", {});
    } catch (error) {
      logger.error("❌ Failed to initialize scheduled jobs:", error);
      throw error;
    }
  }

  /**
   * Schedule automatic round-robin reset daily at random time between 5:00-6:00 AM
   */
  scheduleRoundRobinReset() {
    // Generate random time between 5:00-6:00 AM
    const randomMinute = Math.floor(Math.random() * 60); // 0-59 minutes
    const randomSecond = Math.floor(Math.random() * 60); // 0-59 seconds

    // Cron pattern: "second minute hour day month weekday"
    // This runs at 5:XX:XX AM every day (random minute and second)
    const cronPattern = `${randomSecond} ${randomMinute} 5 * * *`;

    logger.info(
      `📅 Scheduling round-robin reset for 05:${randomMinute
        .toString()
        .padStart(2, "0")}:${randomSecond.toString().padStart(2, "0")} daily`,
      {}
    );

    const job = cron.schedule(
      cronPattern,
      async () => {
        try {
          logger.info("🔄 Starting automatic round-robin reset...", {});

          // Reset round-robin for all branches
          await this.performRoundRobinReset();

          logger.info(
            "✅ Automatic round-robin reset completed successfully",
            {}
          );
        } catch (error) {
          logger.error(
            "❌ Failed to perform automatic round-robin reset:",
            error
          );
        }
      },
      {
        scheduled: true,
        timezone: "Asia/Kolkata", // Indian Standard Time
      }
    );

    this.jobs.set("roundRobinReset", job);

    // Log next execution time
    const now = new Date();
    const tomorrow5AM = new Date();
    tomorrow5AM.setHours(5, randomMinute, randomSecond, 0);
    if (tomorrow5AM <= now) {
      tomorrow5AM.setDate(tomorrow5AM.getDate() + 1);
    }

    logger.info(
      `⏰ Next round-robin reset scheduled for: ${tomorrow5AM.toLocaleString(
        "en-IN",
        { timeZone: "Asia/Kolkata" }
      )}`,
      {}
    );
  }

  /**
   * Perform round-robin reset for all hotels and branches
   */
  async performRoundRobinReset() {
    try {
      // Reset for all hotels and branches (null, null means global reset)
      assignmentService.resetRoundRobin(null, null);

      // Log the reset activity
      logger.info("🔄 Round-robin counters reset for all hotels and branches", {
        timestamp: new Date().toISOString(),
        reason: "scheduled_daily_reset",
      });

      // You can add more cleanup tasks here if needed
      // For example: cleanup old assignment logs, reset daily statistics, etc.
    } catch (error) {
      logger.error("Failed to perform round-robin reset:", error);
      throw error;
    }
  }

  /**
   * Schedule a one-time round-robin reset for testing
   * @param {Date} date - When to execute the reset
   */
  scheduleOneTimeReset(date) {
    const cronPattern = `${date.getSeconds()} ${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${
      date.getMonth() + 1
    } *`;

    logger.info(
      `🧪 Scheduling one-time round-robin reset for: ${date.toLocaleString(
        "en-IN",
        { timeZone: "Asia/Kolkata" }
      )}`,
      {}
    );

    const job = cron.schedule(
      cronPattern,
      async () => {
        try {
          logger.info("🔄 Executing one-time round-robin reset...", {});
          await this.performRoundRobinReset();
          logger.info("✅ One-time round-robin reset completed", {});

          // Destroy the job after execution
          job.destroy();
        } catch (error) {
          logger.error(
            "❌ Failed to perform one-time round-robin reset:",
            error
          );
        }
      },
      {
        scheduled: true,
        timezone: "Asia/Kolkata",
      }
    );

    return job;
  }

  /**
   * Get status of all scheduled jobs
   */
  getJobsStatus() {
    const status = {};

    for (const [jobName, job] of this.jobs.entries()) {
      status[jobName] = {
        running: job.running || false,
        scheduled: true,
        lastExecution: job.lastExecution || null,
        nextExecution: job.nextDates
          ? job.nextDates().format("YYYY-MM-DD HH:mm:ss")
          : null,
      };
    }

    return {
      initialized: this.isInitialized,
      totalJobs: this.jobs.size,
      jobs: status,
      timezone: "Asia/Kolkata",
    };
  }

  /**
   * Stop a specific job
   * @param {string} jobName - Name of the job to stop
   */
  stopJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.stop();
      logger.info(`⏸️ Stopped scheduled job: ${jobName}`, {});
      return true;
    }
    return false;
  }

  /**
   * Start a specific job
   * @param {string} jobName - Name of the job to start
   */
  startJob(jobName) {
    const job = this.jobs.get(jobName);
    if (job) {
      job.start();
      logger.info(`▶️ Started scheduled job: ${jobName}`, {});
      return true;
    }
    return false;
  }

  /**
   * Stop all scheduled jobs
   */
  stopAllJobs() {
    for (const [jobName, job] of this.jobs.entries()) {
      job.stop();
      logger.info(`⏸️ Stopped scheduled job: ${jobName}`, {});
    }
    logger.info("⏸️ All scheduled jobs stopped", {});
  }

  /**
   * Destroy all scheduled jobs
   */
  destroyAllJobs() {
    for (const [jobName, job] of this.jobs.entries()) {
      job.destroy();
      logger.info(`🗑️ Destroyed scheduled job: ${jobName}`, {});
    }
    this.jobs.clear();
    this.isInitialized = false;
    logger.info("🗑️ All scheduled jobs destroyed", {});
  }
}

// Export singleton instance
const scheduledJobsService = new ScheduledJobsService();
export default scheduledJobsService;
