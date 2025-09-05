// ===== services/database-service/src/models/counter.model.ts =====
import mongoose, { Schema, Document } from 'mongoose';

export interface ICounter extends Document {
  userId: string;
  taskId: number;
}

const CounterSchema = new Schema<ICounter>({
  userId: { type: String, required: true, unique: true },
  taskId: { type: Number, default: 0 }
});

export const Counter = mongoose.model<ICounter>('Counter', CounterSchema, 'counters');