/**
 * Simple Logger Utility
 * Provides consistent logging across the application
 */

import chalk from "chalk";

const isDev = process.env.NODE_ENV === "development";

const formatMessage = (level, message) =>
  `[${new Date().toISOString()}] [${level}] ${message}`;

const logger = {
  info: (message, data = {}) => {
    const msg = formatMessage("INFO", message);
    console.log(isDev ? chalk.blue(msg) : msg, data);
  },

  error: (message, data = {}) => {
    const msg = formatMessage("ERROR", message);
    console.error(isDev ? chalk.red(msg) : msg, data);
  },

  warn: (message, data = {}) => {
    const msg = formatMessage("WARN", message);
    console.warn(isDev ? chalk.yellow(msg) : msg, data);
  },

  debug: (message, data = {}) => {
    if (isDev) {
      const msg = formatMessage("DEBUG", message);
      console.debug(chalk.gray(msg), data);
    }
  },
};

export { logger };
