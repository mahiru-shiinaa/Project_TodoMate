// ===== services/scheduler-service/src/index.ts =====
import express from 'express';
import * as cron from 'node-cron';
import axios from 'axios';
import dotenv from 'dotenv';
import { format } from 'date-fns';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.SCHEDULER_SERVICE_PORT || 3005;
const DATABASE_SERVICE_URL = process.env.DATABASE_SERVICE_URL || 'http://database-service:3004';
const BOT_SERVICE_URL = process.env.BOT_SERVICE_URL || 'http://bot-service:3001';

// Hàm xử lý gửi reminders
const processReminders = async () => {
  try {
    console.log('🔍 Checking for due reminders...');
    
    // Lấy danh sách reminders đã đến hạn
    const response = await axios.get(`${DATABASE_SERVICE_URL}/tasks/due`);
    const dueReminders = response.data;
    
    if (dueReminders.length === 0) {
      console.log('✅ No due reminders found');
      return;
    }
    
    console.log(`📬 Found ${dueReminders.length} due reminders`);
    
    // Xử lý từng reminder
    for (const reminder of dueReminders) {
      try {
        // Tạo nội dung thông báo
        let message = '';
        const formattedDate = format(new Date(reminder.dueDate), 'HH:mm dd-MM-yyyy');
        
        if (reminder.reminderType === '30_minutes') {
          message = `🔔 Nhắc nhở: Task [${reminder.taskId}]\n📝 ${reminder.taskContent}\n📅 Deadline: ${formattedDate}\n⏰ Còn 30 phút nữa!`;
        } else {
          message = `🔔 Nhắc nhở: Task [${reminder.taskId}]\n📝 ${reminder.taskContent}\n📅 Deadline: ${formattedDate}\n⏰ Đã đến hạn!`;
        }
        
        // Gửi thông báo qua bot service
        await axios.post(`${BOT_SERVICE_URL}/send-reminder`, {
          chatId: reminder.chatId,
          message
        });
        
        // Đánh dấu reminder đã gửi
        await axios.patch(`${DATABASE_SERVICE_URL}/tasks/reminders/sent`, {
          reminderId: reminder.reminderId
        });
        
        console.log(`✅ Sent reminder for task ${reminder.taskId} to chat ${reminder.chatId}`);
      } catch (error: any) {
        console.error(`❌ Failed to process reminder for task ${reminder.taskId}:`, error.response?.data || error.message);
      }
    }
  } catch (error: any) {
    console.error('❌ Error processing reminders:', error.response?.data || error.message);
  }
};

// Khởi chạy cron job - chạy mỗi phút
cron.schedule('* * * * *', async () => {
  await processReminders();
}, {
  timezone: 'Asia/Ho_Chi_Minh'
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Scheduler Service',
    cronStatus: 'Running'
  });
});

// Manual trigger endpoint for testing
app.post('/trigger-reminders', async (req, res) => {
  try {
    await processReminders();
    res.json({ message: 'Reminders processed successfully' });
  } catch (error) {
    console.error('Error triggering reminders:', error);
    res.status(500).json({ error: 'Failed to process reminders' });
  }
});

app.listen(PORT, () => {
  console.log(`⏱️  Scheduler Service running on port ${PORT}`);
  console.log('🔄 Cron job started - checking reminders every minute');
});