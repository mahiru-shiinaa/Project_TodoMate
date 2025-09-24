// ===== services/bot-service/src/index.ts - FIXED OVERDUE VERSION =====
import TelegramBot from 'node-telegram-bot-api';
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { format, startOfDay, endOfDay, isToday, isTomorrow, isYesterday } from 'date-fns';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.BOT_SERVICE_PORT || 3001;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || 'http://nlp-service:3002';
const REMINDER_SERVICE_URL = process.env.REMINDER_SERVICE_URL || 'http://reminder-service:3003';

// Khởi tạo bot
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

// Hàm lấy thời gian hiện tại theo giờ Việt Nam
const getVietnamTime = (): Date => {
  const now = new Date();
  const vietnamOffset = 7 * 60; // +7 giờ = 420 phút
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcTime + (vietnamOffset * 60000));
};

// Format task display - FIXED VERSION
const formatTask = (task: any) => {
  const formattedDate = format(new Date(task.dueDate), 'HH:mm dd-MM-yyyy');
  const now = getVietnamTime(); // Sử dụng giờ Việt Nam
  const dueDate = new Date(task.dueDate);
  
  // FIXED: Xác định trạng thái chính xác
  let statusIcon = '⏳';
  let statusText = 'Pending';
  
  if (task.status === 'completed') {
    statusIcon = '🥳';
    statusText = 'Done';
  } else if (dueDate < now && task.status === 'pending') {
    statusIcon = '🔴';
    statusText = 'Overdue';
  } else if (task.status === 'pending') {
    statusIcon = '⏳';
    statusText = 'Pending';
  }
  
  return `[${task.taskId}] 📝 ${task.taskContent}\n📅 ${formattedDate}\n${statusIcon} Trạng thái: ${statusText}`;
};

// Group tasks by date and status - FIXED VERSION
const groupTasksByDateAndStatus = (tasks: any[]) => {
  const grouped: { [date: string]: { pending: any[], overdue: any[], completed: any[] } } = {};
  const now = getVietnamTime(); // Sử dụng giờ Việt Nam
  
  tasks.forEach(task => {
    const taskDate = format(new Date(task.dueDate), 'dd-MM-yyyy');
    
    if (!grouped[taskDate]) {
      grouped[taskDate] = { pending: [], overdue: [], completed: [] };
    }
    
    const dueDate = new Date(task.dueDate);
    
    if (task.status === 'completed') {
      grouped[taskDate].completed.push(task);
    } else if (dueDate < now && task.status === 'pending') {
      // FIXED: Đánh dấu rõ ràng là overdue
      grouped[taskDate].overdue.push({...task, isOverdue: true});
    } else {
      grouped[taskDate].pending.push(task);
    }
  });
  
  return grouped;
};

// Format grouped task list - UPDATED VERSION
const formatGroupedTaskList = (data: any, title: string) => {
  if (!data.tasks || data.tasks.length === 0) {
    return `${title}:\n(Không có công việc nào được tìm thấy)`;
  }

  const grouped = groupTasksByDateAndStatus(data.tasks);
  const dates = Object.keys(grouped).sort();
  
  let message = `${title} (Trang ${data.pagination.currentPage}/${data.pagination.totalPages}):\n\n`;
  
  dates.forEach((dateStr, index) => {
    const dateObj = new Date(dateStr.split('-').reverse().join('-'));
    let dateLabel = `📅 Ngày: ${dateStr}`;
    
    if (isToday(dateObj)) {
      dateLabel = `🌤️ Ngày: ${dateStr} (Hôm nay)`;
    } else if (isTomorrow(dateObj)) {
      dateLabel = `🌅 Ngày: ${dateStr} (Ngày mai)`;
    } else if (isYesterday(dateObj)) {
      dateLabel = `🌆 Ngày: ${dateStr} (Hôm qua)`;
    }
    
    message += `${dateLabel}\n\n`;
    
    const dayTasks = grouped[dateStr];
    
    // Quá hạn - HIỂN THỊ TRƯỚC
    if (dayTasks.overdue.length > 0) {
      message += `🔴 QUÁ HẠN:\n\n`;
      dayTasks.overdue.forEach(task => {
        message += formatTask(task) + '\n\n';
      });
      message += '~~~~~~~~~~~~~~~~~~\n';
    }
    
    // Chưa hoàn thành
    if (dayTasks.pending.length > 0) {
      message += `💼 CHƯA HOÀN THÀNH:\n\n`;
      dayTasks.pending.forEach(task => {
        message += formatTask(task) + '\n\n';
      });
      message += '~~~~~~~~~~~~~~~~~~\n';
    }
    
    // Hoàn thành
    if (dayTasks.completed.length > 0) {
      message += `✅ HOÀN THÀNH:\n\n`;
      dayTasks.completed.forEach(task => {
        message += formatTask(task) + '\n\n';
      });
      message += '~~~~~~~~~~~~~~~~~~\n';
    }
    
    if (index < dates.length - 1) {
      message += `---------------------------------------------\n`;
    }
  });

  if (data.pagination.totalPages > 1) {
    message += `\n📄 Trang ${data.pagination.currentPage}/${data.pagination.totalPages} - Tổng: ${data.pagination.total} công việc`;
  }

  return message;
};

// Command handlers
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `Xin chào 👋! Tôi là TaskReminder Bot.
Tôi sẽ giúp bạn quản lý và nhắc nhở công việc hằng ngày.
👉 Gõ /help để xem danh sách lệnh.`;
  
  bot.sendMessage(chatId, welcomeMessage);
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `📌 Các lệnh bạn có thể dùng:
/add [nội dung] - Thêm công việc mới bằng ngôn ngữ tự nhiên.
/list [số trang] - Liệt kê tất cả công việc.
/pending [số trang] - Xem công việc chưa hoàn thành.
/done [số trang] - Xem công việc đã hoàn thành.
/overdue [số trang] - Xem công việc quá hạn.
/today - Công việc hôm nay.
/tomorrow - Công việc ngày mai.
/date [DD-MM-YYYY] - Lọc công việc theo ngày cụ thể.
/search [từ khóa] - Tìm công việc.
/update [id] [trường]=[giá trị mới] - Cập nhật công việc.
/complete [id] - Đánh dấu hoàn thành.
/delete [id] - Xóa công việc.
/instruct - Hướng dẫn chi tiết cách sử dụng.`;

  bot.sendMessage(chatId, helpMessage);
});

bot.onText(/\/instruct/, (msg) => {
  const chatId = msg.chat.id;
  const instructMessage = `📖 HƯỚNG DẪN CHI TIẾT:

🆕 THÊM CÔNG VIỆC (/add):
• /add nhắc tôi đi ngủ lúc 23:30 ngày 06/09/2025
• /add học bài lúc 15 giờ hôm nay  
• /add họp team sau 30 phút
• /add mua sắm 2 giờ nữa
• /add làm bài tập sáng nay
• /add đi tắm tối mai
• /add học bài trưa hôm sau

✏️ CẬP NHẬT CÔNG VIỆC (/update):
• /update 1 content=Đi ngủ sớm hơn
• /update 2 deadline=2025-09-07T20:00:00.000Z
• /update 3 status=completed

✅ ĐÁNH DẤU HOÀN THÀNH:
• /complete 1
• /complete 5

🗑️ XÓA CÔNG VIỆC:
• /delete 1
• /delete 3

🔍 TÌM KIẾM:
• /search đi ngủ
• /search học bài
• /search họp

📅 LỌC THEO NGÀY:
• /date 06-09-2025
• /today (hôm nay)
• /tomorrow (ngày mai)

📋 XEM DANH SÁCH:
• /list (tất cả)
• /pending (chưa làm)
• /done (đã làm)  
• /overdue (quá hạn)

💡 Mẹo: Bot hiểu tiếng Việt tự nhiên! Chỉ cần gõ /add + mô tả công việc + thời gian.`;

  bot.sendMessage(chatId, instructMessage);
});

bot.onText(/\/add (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';
  const text = match![1];

  try {
    // Gửi đến NLP service để xử lý
    const nlpResponse = await axios.post(`${NLP_SERVICE_URL}/process`, {
      text,
      refDate: getVietnamTime().toISOString() // Sử dụng giờ Việt Nam
    });

    const { taskContent, dueDate } = nlpResponse.data;

    // Gửi đến reminder service để tạo task
    const reminderResponse = await axios.post(`${REMINDER_SERVICE_URL}/tasks`, {
      userId,
      chatId: chatId.toString(),
      taskContent,
      dueDate
    });

    const task = reminderResponse.data;
    const formattedDate = format(new Date(dueDate), 'HH:mm dd-MM-yyyy');

    const successMessage = `✅ Đã thêm task mới:
📝 ${taskContent}
📅 Deadline: ${formattedDate}
🔔 Tôi sẽ nhắc bạn trước 30 phút và đúng giờ.
(Task ID: ${task.taskId})`;

    bot.sendMessage(chatId, successMessage);
  } catch (error: any) {
    console.error('Error adding task:', error.response?.data || error.message);
    bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi thêm công việc. Vui lòng thử lại.');
  }
});

bot.onText(/\/list(\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';
  const page = match?.[2] || '1';

  try {
    const response = await axios.get(`${REMINDER_SERVICE_URL}/tasks/user/${userId}?page=${page}&limit=10`);
    const message = formatGroupedTaskList(response.data, '📋 Tất cả công việc');
    bot.sendMessage(chatId, message);
  } catch (error: any) {
    console.error('Error fetching tasks:', error.response?.data || error.message);
    bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi lấy danh sách công việc.');
  }
});

bot.onText(/\/pending(\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';
  const page = match?.[2] || '1';

  try {
    const response = await axios.get(`${REMINDER_SERVICE_URL}/tasks/user/${userId}?status=pending&page=${page}&limit=10`);
    const message = formatGroupedTaskList(response.data, '📋 Công việc chưa hoàn thành');
    bot.sendMessage(chatId, message);
  } catch (error: any) {
    console.error('Error fetching pending tasks:', error.response?.data || error.message);
    bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi lấy danh sách công việc chưa hoàn thành.');
  }
});

bot.onText(/\/done(\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';
  const page = match?.[2] || '1';

  try {
    const response = await axios.get(`${REMINDER_SERVICE_URL}/tasks/user/${userId}?status=completed&page=${page}&limit=10`);
    const message = formatGroupedTaskList(response.data, '📋 Công việc đã hoàn thành');
    bot.sendMessage(chatId, message);
  } catch (error: any) {
    console.error('Error fetching completed tasks:', error.response?.data || error.message);
    bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi lấy danh sách công việc đã hoàn thành.');
  }
});

bot.onText(/\/overdue(\s+(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';
  const page = match?.[2] || '1';

  try {
    const response = await axios.get(`${REMINDER_SERVICE_URL}/tasks/user/${userId}?filter=overdue&page=${page}&limit=10`);
    const message = formatGroupedTaskList(response.data, '📋 Công việc quá hạn');
    bot.sendMessage(chatId, message);
  } catch (error: any) {
    console.error('Error fetching overdue tasks:', error.response?.data || error.message);
    bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi lấy danh sách công việc quá hạn.');
  }
});

bot.onText(/\/today/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';

  try {
    const response = await axios.get(`${REMINDER_SERVICE_URL}/tasks/user/${userId}?filter=today`);
    const currentDate = format(getVietnamTime(), 'dd-MM-yyyy');
    const message = formatGroupedTaskList(response.data, `📅 Công việc hôm nay (${currentDate})`);
    bot.sendMessage(chatId, message);
  } catch (error: any) {
    console.error('Error fetching today tasks:', error.response?.data || error.message);
    bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi lấy công việc hôm nay.');
  }
});

bot.onText(/\/tomorrow/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';

  try {
    const response = await axios.get(`${REMINDER_SERVICE_URL}/tasks/user/${userId}?filter=tomorrow`);
    const tomorrow = new Date(getVietnamTime());
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDate = format(tomorrow, 'dd-MM-yyyy');
    const message = formatGroupedTaskList(response.data, `📅 Công việc ngày mai (${tomorrowDate})`);
    bot.sendMessage(chatId, message);
  } catch (error: any) {
    console.error('Error fetching tomorrow tasks:', error.response?.data || error.message);
    bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi lấy công việc ngày mai.');
  }
});

bot.onText(/\/date\s+(\d{2}-\d{2}-\d{4})/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';
  const dateStr = match![1];

  try {
    // Convert DD-MM-YYYY to YYYY-MM-DD format for API
    const [day, month, year] = dateStr.split('-');
    const apiDate = `${year}-${month}-${day}`;
    
    const response = await axios.get(`${REMINDER_SERVICE_URL}/tasks/user/${userId}?date=${apiDate}`);
    const message = formatGroupedTaskList(response.data, `📅 Công việc ngày ${dateStr}`);
    bot.sendMessage(chatId, message);
  } catch (error: any) {
    console.error('Error fetching tasks by date:', error.response?.data || error.message);
    bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi lấy công việc theo ngày. Định dạng: /date DD-MM-YYYY');
  }
});

bot.onText(/\/search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';
  const keyword = match![1];

  try {
    const response = await axios.get(`${REMINDER_SERVICE_URL}/tasks/user/${userId}?search=${encodeURIComponent(keyword)}`);
    const message = formatGroupedTaskList(response.data, `🔍 Kết quả tìm kiếm cho "${keyword}"`);
    bot.sendMessage(chatId, message);
  } catch (error: any) {
    console.error('Error searching tasks:', error.response?.data || error.message);
    bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi tìm kiếm công việc.');
  }
});

bot.onText(/\/update\s+(\d+)\s+(\w+)=(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';
  const taskId = match![1];
  const field = match![2];
  const value = match![3];

  try {
    const response = await axios.patch(`${REMINDER_SERVICE_URL}/tasks/${taskId}`, {
      userId,
      field,
      value
    });

    let successMessage = '';
    if (field === 'content') {
      successMessage = `📄 Task [${taskId}] đã được cập nhật nội dung:\n📝 ${value}`;
    } else if (field === 'deadline') {
      const formattedDate = format(new Date(value), 'HH:mm dd-MM-yyyy');
      successMessage = `📄 Task [${taskId}] đã được cập nhật deadline:\n📅 ${formattedDate}`;
    }

    bot.sendMessage(chatId, successMessage);
  } catch (error: any) {
    console.error('Error updating task:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      bot.sendMessage(chatId, `❌ Không tìm thấy task với ID ${taskId}.`);
    } else {
      bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi cập nhật công việc.');
    }
  }
});

bot.onText(/\/complete\s+(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';
  const taskId = match![1];

  try {
    const response = await axios.patch(`${REMINDER_SERVICE_URL}/tasks/${taskId}`, {
      userId,
      field: 'status',
      value: 'completed'
    });

    const task = response.data;
    bot.sendMessage(chatId, `🎉 Task [${taskId}] "${task.taskContent}" đã được đánh dấu là DONE.`);
  } catch (error: any) {
    console.error('Error completing task:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      bot.sendMessage(chatId, `❌ Không tìm thấy task với ID ${taskId}.`);
    } else {
      bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi đánh dấu hoàn thành công việc.');
    }
  }
});

bot.onText(/\/delete\s+(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id.toString() || '';
  const taskId = match![1];

  try {
    const response = await axios.delete(`${REMINDER_SERVICE_URL}/tasks/${taskId}?userId=${userId}`);
    const task = response.data.task;
    bot.sendMessage(chatId, `🗑️ Task [${taskId}] "${task.taskContent}" đã bị xóa khỏi danh sách.`);
  } catch (error: any) {
    console.error('Error deleting task:', error.response?.data || error.message);
    if (error.response?.status === 404) {
      bot.sendMessage(chatId, `❌ Không tìm thấy task với ID ${taskId}.`);
    } else {
      bot.sendMessage(chatId, '❌ Có lỗi xảy ra khi xóa công việc.');
    }
  }
});

// API endpoint để scheduler gửi reminders
app.post('/send-reminder', async (req, res) => {
  try {
    const { chatId, message } = req.body;
    
    await bot.sendMessage(chatId, message);
    res.json({ success: true, message: 'Reminder sent successfully' });
  } catch (error: any) {
    console.error('Error sending reminder:', error.message);
    res.status(500).json({ error: 'Failed to send reminder' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Bot Service' });
});

// Handle errors
bot.on('polling_error', (error) => {
  console.error('Telegram polling error:', error);
});

app.listen(PORT, () => {
  console.log(`🤖 Bot Service running on port ${PORT}`);
  console.log('🚀 Telegram bot is ready!');
});