// ===== services/database-service/src/index.ts - IMPROVED VERSION =====
import express from 'express';
import dotenv from 'dotenv';
import { connectDatabase } from './db';
import { Task, ITask } from './models/task.model';
import { Counter } from './models/counter.model';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.DATABASE_SERVICE_PORT || 3004;

// Tạo task ID tự tăng cho user
const getNextTaskId = async (userId: string): Promise<number> => {
  const counter = await Counter.findOneAndUpdate(
    { userId },
    { $inc: { taskId: 1 } },
    { upsert: true, new: true }
  );
  return counter.taskId;
};

// API tạo task mới
app.post('/tasks', async (req, res) => {
  try {
    const { userId, chatId, taskContent, dueDate, reminders } = req.body;
    
    const taskId = await getNextTaskId(userId);
    
    const task = new Task({
      taskId,
      userId,
      chatId,
      taskContent,
      dueDate: new Date(dueDate),
      reminders: reminders.map((r: any) => ({
        type: r.type,
        reminderTime: new Date(r.reminderTime),
        sent: false
      }))
    });
    
    await task.save();
    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API lấy danh sách tasks với query parameters phức tạp
app.get('/tasks/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      status, 
      filter, 
      date, 
      search, 
      page = 1, 
      limit = 10 
    } = req.query;

    let query: any = { userId };
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by date range
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (filter === 'today') {
      query.dueDate = {
        $gte: today,
        $lt: tomorrow
      };
    } else if (filter === 'tomorrow') {
      const dayAfterTomorrow = new Date(tomorrow);
      dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
      query.dueDate = {
        $gte: tomorrow,
        $lt: dayAfterTomorrow
      };
    } else if (filter === 'overdue') {
      query.dueDate = { $lt: now };
      query.status = 'pending';
    } else if (date) {
      const targetDate = new Date(date as string);
      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);
      query.dueDate = {
        $gte: targetDate,
        $lt: nextDay
      };
    }
    
    // Search in task content
    if (search) {
      query.taskContent = { $regex: search, $options: 'i' };
    }
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    
    // Improved sorting: pending tasks first (by due date), then completed tasks (by completion time)
    const sortCriteria: any = {};
    
    if (filter === 'today' || filter === 'tomorrow') {
      // For today/tomorrow, sort by status priority then by due date
      sortCriteria.status = 1; // pending first, then completed
      sortCriteria.dueDate = 1;
    } else if (status === 'pending') {
      // For pending only, sort by due date (overdue first)
      sortCriteria.dueDate = 1;
    } else if (status === 'completed') {
      // For completed only, sort by completion date (most recent first)
      sortCriteria.updatedAt = -1;
    } else {
      // For all tasks, complex sorting: pending (by due date), then completed (by update time)
      sortCriteria.status = 1;
      sortCriteria.dueDate = 1;
    }
    
    const tasks = await Task.find(query)
      .sort(sortCriteria)
      .skip(skip)
      .limit(limitNum);
    
    const total = await Task.countDocuments(query);
    const totalPages = Math.ceil(total / limitNum);
    
    res.json({
      tasks,
      pagination: {
        currentPage: pageNum,
        totalPages,
        total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API cập nhật task
app.patch('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId, updates } = req.body;
    
    const task = await Task.findOneAndUpdate(
      { taskId: parseInt(taskId), userId },
      updates,
      { new: true }
    );
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API xóa task
app.delete('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.query;
    
    const task = await Task.findOneAndDelete({
      taskId: parseInt(taskId),
      userId
    });
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json({ message: 'Task deleted successfully', task });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API lấy reminders đã đến hạn
app.get('/tasks/due', async (req, res) => {
  try {
    const now = new Date();
    
    const tasks = await Task.find({
      'reminders.reminderTime': { $lte: now },
      'reminders.sent': false
    });
    
    const dueReminders = [];
    
    for (const task of tasks) {
      for (const reminder of task.reminders) {
        if (reminder.reminderTime <= now && !reminder.sent) {
          dueReminders.push({
            taskId: task.taskId,
            userId: task.userId,
            chatId: task.chatId,
            taskContent: task.taskContent,
            dueDate: task.dueDate,
            reminderType: reminder.type,
            reminderId: reminder._id
          });
        }
      }
    }
    
    res.json(dueReminders);
  } catch (error) {
    console.error('Error fetching due reminders:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API đánh dấu reminder đã gửi
app.patch('/tasks/reminders/sent', async (req, res) => {
  try {
    const { reminderId } = req.body;
    
    await Task.updateOne(
      { 'reminders._id': reminderId },
      { $set: { 'reminders.$.sent': true } }
    );
    
    res.json({ message: 'Reminder marked as sent' });
  } catch (error) {
    console.error('Error marking reminder as sent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Database Service' });
});

// Start server
connectDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🗄️ Database Service running on port ${PORT}`);
  });
});