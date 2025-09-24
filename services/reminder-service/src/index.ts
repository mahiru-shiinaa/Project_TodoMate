// ===== services/reminder-service/src/index.ts - TIMEZONE FIXED =====
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { subMinutes } from 'date-fns';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.REMINDER_SERVICE_PORT || 3003;
const DATABASE_SERVICE_URL = process.env.DATABASE_SERVICE_URL || 'http://database-service:3004';

// Hàm chuyển đổi từ giờ Việt Nam sang UTC
const convertToUTC = (vietnamDate: Date): Date => {
  const vietnamOffset = 7 * 60; // +7 giờ = 420 phút
  return new Date(vietnamDate.getTime() - (vietnamOffset * 60000));
};

// Hàm chuyển đổi từ UTC sang giờ Việt Nam
const convertToVietnamTime = (utcDate: Date): Date => {
  const vietnamOffset = 7 * 60; // +7 giờ = 420 phút  
  const utcTime = utcDate.getTime() + (utcDate.getTimezoneOffset() * 60000);
  return new Date(utcTime + (vietnamOffset * 60000));
};

// API tạo task mới - đã sửa timezone
app.post('/tasks', async (req, res) => {
  try {
    const { userId, chatId, taskContent, dueDate } = req.body;
    
    if (!userId || !chatId || !taskContent || !dueDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // dueDate nhận vào đã là giờ Việt Nam từ NLP service
    const dueDateVN = new Date(dueDate);
    
    // Tạo 2 reminders: 30 phút trước và đúng giờ (theo giờ Việt Nam)
    const reminderTime30Min = subMinutes(dueDateVN, 30);
    const exactReminderTime = dueDateVN;
    
    const reminders = [
      {
        type: '30_minutes',
        reminderTime: reminderTime30Min
      },
      {
        type: 'exact_time', 
        reminderTime: exactReminderTime
      }
    ];
    
    // Gửi đến database service (database service sẽ tự chuyển sang UTC)
    const response = await axios.post(`${DATABASE_SERVICE_URL}/tasks`, {
      userId,
      chatId,
      taskContent,
      dueDate: dueDateVN.toISOString(), // Gửi như giờ VN
      reminders
    });
    
    res.status(201).json(response.data);
  } catch (error: any) {
    console.error('Error creating task:', error.response?.data || error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API lấy tasks với filters
app.get('/tasks/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const queryParams = new URLSearchParams(req.query as Record<string, string>);
    
    const response = await axios.get(`${DATABASE_SERVICE_URL}/tasks/user/${userId}?${queryParams}`);
    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching tasks:', error.response?.data || error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API cập nhật task - đã sửa timezone
app.patch('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId, field, value } = req.body;
    
    let updates: any = {};
    
    if (field === 'content') {
      updates.taskContent = value;
    } else if (field === 'deadline') {
      // value là giờ Việt Nam từ user input
      const newDueDateVN = new Date(value);
      updates.dueDate = newDueDateVN.toISOString();
      
      // Cập nhật lại reminders theo giờ Việt Nam
      const reminderTime30Min = subMinutes(newDueDateVN, 30);
      const exactReminderTime = newDueDateVN;
      
      updates.reminders = [
        {
          type: '30_minutes',
          reminderTime: reminderTime30Min.toISOString(),
          sent: false
        },
        {
          type: 'exact_time',
          reminderTime: exactReminderTime.toISOString(),
          sent: false
        }
      ];
    } else if (field === 'status') {
      updates.status = value;
    }
    
    const response = await axios.patch(`${DATABASE_SERVICE_URL}/tasks/${taskId}`, {
      userId,
      updates
    });
    
    res.json(response.data);
  } catch (error: any) {
    console.error('Error updating task:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API xóa task
app.delete('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId } = req.query;
    
    const response = await axios.delete(`${DATABASE_SERVICE_URL}/tasks/${taskId}?userId=${userId}`);
    res.json(response.data);
  } catch (error: any) {
    console.error('Error deleting task:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Reminder Service' });
});

app.listen(PORT, () => {
  console.log(`⏰ Reminder Service running on port ${PORT}`);
  console.log(`🌏 Using Vietnam timezone (UTC+7) for reminders`);
});