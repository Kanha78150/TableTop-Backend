/**
 * Improved counter collection for atomic ID generation
 */

import mongoose from "mongoose";

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // The counter name/key
  sequence_value: { type: Number, default: 0 },
});

export const Counter = mongoose.model("Counter", counterSchema);

/**
 * Get next sequence value atomically
 * @param {string} sequenceName - Name of the sequence (e.g., 'STF-WTR-2025')
 * @returns {Promise<number>} Next sequence value
 */
export const getNextSequence = async (sequenceName) => {
  const counter = await Counter.findOneAndUpdate(
    { _id: sequenceName },
    { $inc: { sequence_value: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  return counter.sequence_value;
};

/**
 * Reset a counter (useful for testing)
 * @param {string} sequenceName - Name of the sequence to reset
 */
export const resetCounter = async (sequenceName) => {
  await Counter.findOneAndUpdate(
    { _id: sequenceName },
    { sequence_value: 0 },
    { upsert: true }
  );
};
