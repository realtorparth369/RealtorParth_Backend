import mongoose from "mongoose";

const SelectedPropertiesSchema = new mongoose.Schema({
  selected: {
    type: [String],
    default: [],
  }
});

export default mongoose.model(
  "SelectedProperties",
  SelectedPropertiesSchema,
  "selected_properties"
);