// ===== services/reminder-service/src/index.ts =====
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { subMinutes } from 'date-fns';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.REMINDER_SERVICE_PORT || 3003;
const DATABASE_SERVICE_URL = process.env.DATABASE_SERVICE_URL || 'http://database-service:3004';

// API tạo task mới
app.post('/tasks', async (req, res) => {
  try {
    const { userId, chatId, taskContent, dueDate } = req.body;
    
    if (!userId || !chatId || !taskContent || !dueDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const dueDateObj = new Date(dueDate);
    
    // Tạo 2 reminders: 30 phút trước và đúng giờ
    const reminders = [
      {
        type: '30_minutes',
        reminderTime: subMinutes(dueDateObj, 30)
      },
      {
        type: 'exact_time',
        reminderTime: dueDateObj
      }
    ];
    
    // Gửi đến database service
    const response = await axios.post(`${DATABASE_SERVICE_URL}/tasks`, {
      userId,
      chatId,
      taskContent,
      dueDate,
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

// API cập nhật task
app.patch('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { userId, field, value } = req.body;
    
    let updates: any = {};
    
    if (field === 'content') {
      updates.taskContent = value;
    } else if (field === 'deadline') {
      const newDueDate = new Date(value);
      updates.dueDate = newDueDate;
      
      // Cập nhật lại reminders khi thay đổi deadline
      updates.reminders = [
        {
          type: '30_minutes',
          reminderTime: subMinutes(newDueDate, 30),
          sent: false
        },
        {
          type: 'exact_time',
          reminderTime: newDueDate,
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
});