import mongoose from "mongoose";

const inventorySchema = new mongoose.Schema(
  {
    branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch" },
    itemName: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    threshold: { type: Number, default: 5 },
  },
  { timestamps: true }
);

export const Inventory = mongoose.model("Inventory", inventorySchema);

// Validators extracted to src/validators/inventory.validators.js
export { validateInventory } from "../validators/inventory.validators.js";
