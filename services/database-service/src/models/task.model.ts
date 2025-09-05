// ===== services/database-service/src/models/task.model.ts =====
import mongoose, { Schema, Document } from "mongoose";

export interface ITask extends Document {
  taskId: number;
  userId: string;
  chatId: string;
  taskContent: string;
  dueDate: Date;
  status: "pending" | "completed";
  reminders: (mongoose.Types.Subdocument & {
    type: "30_minutes" | "exact_time";
    reminderTime: Date;
    sent: boolean;
  })[];
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    taskId: { type: Number, required: true },
    userId: { type: String, required: true },
    chatId: { type: String, required: true },
    taskContent: { type: String, required: true },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "completed"],
      default: "pending",
    },
    reminders: [
      {
        type: {
          type: String,
          enum: ["30_minutes", "exact_time"],
          required: true,
        },
        reminderTime: { type: Date, required: true },
        sent: { type: Boolean, default: false },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Tạo compound index để tìm kiếm nhanh hơn
TaskSchema.index({ userId: 1, taskId: 1 });
TaskSchema.index({ userId: 1, status: 1 });
TaskSchema.index({ userId: 1, dueDate: 1 });
TaskSchema.index({ "reminders.reminderTime": 1, "reminders.sent": 1 });

export const Task = mongoose.model<ITask>("Task", TaskSchema, "tasks");
