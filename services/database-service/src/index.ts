// ===== services/database-service/src/index.ts - FIXED OVERDUE VERSION =====
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

// Hàm lấy thời gian hiện tại theo giờ Việt Nam
const getVietnamTime = (): Date => {
  const now = new Date();
  const vietnamOffset = 7 * 60; // +7 giờ = 420 phút
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcTime + (vietnamOffset * 60000));
};

// Hàm chuyển đổi từ UTC sang giờ Việt Nam (+7)
const convertToVietnamTime = (utcDate: Date): Date => {
  const vietnamOffset = 7 * 60; // +7 giờ = 420 phút
  const utcTime = utcDate.getTime() + (utcDate.getTimezoneOffset() * 60000);
  return new Date(utcTime + (vietnamOffset * 60000));
};

// Hàm chuyển đổi từ giờ Việt Nam sang UTC để lưu database
const convertToUTC = (vietnamDate: Date): Date => {
  const vietnamOffset = 7 * 60; // +7 giờ = 420 phút
  return new Date(vietnamDate.getTime() - (vietnamOffset * 60000));
};

// API tạo task mới
app.post('/tasks', async (req, res) => {
  try {
    const { userId, chatId, taskContent, dueDate, reminders } = req.body;
    
    const taskId = await getNextTaskId(userId);
    
    // Chuyển đổi dueDate từ giờ Việt Nam sang UTC để lưu database
    const dueDateUTC = convertToUTC(new Date(dueDate));
    
    const task = new Task({
      taskId,
      userId,
      chatId,
      taskContent,
      dueDate: dueDateUTC,
      reminders: reminders.map((r: any) => ({
        type: r.type,
        reminderTime: convertToUTC(new Date(r.reminderTime)),
        sent: false
      }))
    });
    
    await task.save();
    
    // Sử dụng .lean() để lấy plain object
    const savedTask = await Task.findOne({ taskId, userId }).lean();
    
    if (savedTask) {
      // Trả về với timezone Việt Nam
      const response = {
        ...savedTask,
        dueDate: convertToVietnamTime(savedTask.dueDate),
        reminders: savedTask.reminders.map((r: any) => ({
          ...r,
          reminderTime: convertToVietnamTime(r.reminderTime)
        }))
      };
      
      res.status(201).json(response);
    } else {
      res.status(500).json({ error: 'Failed to retrieve saved task' });
    }
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API lấy danh sách tasks với query parameters phức tạp - FIXED VERSION
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
    
    // SỬ DỤNG VIETNAM TIME ĐỂ SO SÁNH
    const nowVN = getVietnamTime(); // Giờ hiện tại theo giờ Việt Nam
    const nowUTC = convertToUTC(nowVN); // Chuyển sang UTC để query database
    const todayVN = new Date(nowVN.getFullYear(), nowVN.getMonth(), nowVN.getDate());
    const todayUTC = convertToUTC(todayVN);
    const tomorrowUTC = new Date(todayUTC);
    tomorrowUTC.setDate(tomorrowUTC.getDate() + 1);
    
    // FIXED: Xử lý filter overdue chính xác
    if (filter === 'overdue') {
      console.log('🔍 Filtering overdue tasks...');
      console.log('Current Vietnam time:', nowVN.toISOString());
      console.log('Current UTC for query:', nowUTC.toISOString());
      query.dueDate = { $lt: nowUTC };
      query.status = 'pending'; // Chỉ lấy tasks pending và đã quá hạn
    } else if (filter === 'today') {
      query.dueDate = {
        $gte: todayUTC,
        $lt: tomorrowUTC
      };
    } else if (filter === 'tomorrow') {
      const dayAfterTomorrowUTC = new Date(tomorrowUTC);
      dayAfterTomorrowUTC.setDate(dayAfterTomorrowUTC.getDate() + 1);
      query.dueDate = {
        $gte: tomorrowUTC,
        $lt: dayAfterTomorrowUTC
      };
    } else if (date) {
      // Chuyển đổi date input từ giờ VN sang UTC
      const targetDateVN = new Date(date as string);
      const targetDateUTC = convertToUTC(targetDateVN);
      const nextDayUTC = new Date(targetDateUTC);
      nextDayUTC.setDate(nextDayUTC.getDate() + 1);
      query.dueDate = {
        $gte: targetDateUTC,
        $lt: nextDayUTC
      };
    }
    
    // Search in task content
    if (search) {
      query.taskContent = { $regex: search, $options: 'i' };
    }
    
    console.log('📝 Database query:', JSON.stringify(query, null, 2));
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;
    
    // Sorting - FIXED: Ưu tiên hiển thị overdue trước
    let sortCriteria: any = {};
    
    if (filter === 'overdue') {
      sortCriteria = { dueDate: 1 }; // Sắp xếp theo thời gian, task quá hạn lâu nhất lên đầu
    } else if (filter === 'today' || filter === 'tomorrow') {
      sortCriteria = { status: 1, dueDate: 1 };
    } else if (status === 'pending') {
      sortCriteria = { dueDate: 1 };
    } else if (status === 'completed') {
      sortCriteria = { updatedAt: -1 };
    } else {
      // Cho /list và các trường hợp khác: hiển thị overdue trước
      sortCriteria = { 
        status: 1,  // pending trước completed
        dueDate: 1  // sắp xếp theo thời gian
      };
    }
    
    // Sử dụng .lean() để lấy plain objects
    const tasks = await Task.find(query)
      .sort(sortCriteria)
      .skip(skip)
      .limit(limitNum)
      .lean();
    
    console.log(`📊 Found ${tasks.length} tasks matching criteria`);
    
    const total = await Task.countDocuments(query);
    const totalPages = Math.ceil(total / limitNum);
    
    // Chuyển đổi timezone trong response và thêm overdue flag
    const tasksWithVNTime = tasks.map(task => {
      const taskVNTime = convertToVietnamTime(task.dueDate);
      const isOverdue = taskVNTime < nowVN && task.status === 'pending';
      
      return {
        ...task,
        dueDate: taskVNTime,
        isOverdue, // Thêm flag để frontend dễ xử lý
        reminders: task.reminders.map((r: any) => ({
          ...r,
          reminderTime: convertToVietnamTime(r.reminderTime)
        }))
      };
    });
    
    res.json({
      tasks: tasksWithVNTime,
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
    
    // Chuyển đổi timezone nếu có cập nhật dueDate
    if (updates.dueDate) {
      updates.dueDate = convertToUTC(new Date(updates.dueDate));
    }
    
    // Chuyển đổi timezone cho reminders nếu có
    if (updates.reminders) {
      updates.reminders = updates.reminders.map((r: any) => ({
        ...r,
        reminderTime: convertToUTC(new Date(r.reminderTime))
      }));
    }
    
    // Sử dụng .lean() để lấy plain object
    const task = await Task.findOneAndUpdate(
      { taskId: parseInt(taskId), userId },
      updates,
      { new: true }
    ).lean();
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Trả về với timezone Việt Nam
    const response = {
      ...task,
      dueDate: convertToVietnamTime(task.dueDate),
      reminders: task.reminders.map((r: any) => ({
        ...r,
        reminderTime: convertToVietnamTime(r.reminderTime)
      }))
    };
    
    res.json(response);
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
    
    // Sử dụng .lean() để lấy plain object
    const task = await Task.findOneAndDelete({
      taskId: parseInt(taskId),
      userId
    }).lean();
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Trả về với timezone Việt Nam
    const response = {
      ...task,
      dueDate: convertToVietnamTime(task.dueDate)
    };
    
    res.json({ message: 'Task deleted successfully', task: response });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// API lấy reminders đã đến hạn - FIXED VERSION
app.get('/tasks/due', async (req, res) => {
  try {
    const nowUTC = new Date(); // Server time (UTC)
    
    console.log('🔍 Checking for due reminders at:', nowUTC.toISOString());
    
    // Sử dụng .lean() để lấy plain objects
    // QUAN TRỌNG: Chỉ lấy các task có status = 'pending'
    const tasks = await Task.find({
      'reminders.reminderTime': { $lte: nowUTC },
      'reminders.sent': false,
      'status': 'pending' // ← THÊM ĐIỀU KIỆN NÀY
    }).lean();
    
    console.log(`📋 Found ${tasks.length} tasks with potential due reminders`);
    
    const dueReminders = [];
    
    for (const task of tasks) {
      // Chỉ xử lý nếu task vẫn đang pending
      if (task.status === 'pending') {
        for (const reminder of task.reminders) {
          if (reminder.reminderTime <= nowUTC && !reminder.sent) {
            dueReminders.push({
              taskId: task.taskId,
              userId: task.userId,
              chatId: task.chatId,
              taskContent: task.taskContent,
              dueDate: convertToVietnamTime(task.dueDate), // Trả về giờ VN
              reminderType: reminder.type,
              reminderId: reminder._id
            });
          }
        }
      }
    }
    
    console.log(`📬 ${dueReminders.length} due reminders ready to send`);
    
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
    console.log(`🌏 Using Vietnam timezone (UTC+7)`);
    console.log(`⏰ Current Vietnam time: ${getVietnamTime().toISOString()}`);
  });
});