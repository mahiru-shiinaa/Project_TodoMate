// ===== services/nlp-service/src/index.ts =====
import express from 'express';
import dotenv from 'dotenv';
import * as chrono from 'chrono-node';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.NLP_SERVICE_PORT || 3002;

// API xử lý ngôn ngữ tự nhiên
app.post('/process', (req, res) => {
  try {
    const { text, refDate } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    const referenceDate = refDate ? new Date(refDate) : new Date();
    
    // Sử dụng chrono-node để parse thời gian
    const parsedResults = chrono.parse(text, referenceDate);
    
    let taskContent = text;
    let dueDate = null;
    
    if (parsedResults.length > 0) {
      const chronoResult = parsedResults[0];
      dueDate = chronoResult.start.date();
      
      // Loại bỏ phần thời gian khỏi nội dung task
      const timeText = chronoResult.text;
      taskContent = text.replace(timeText, '').trim();
      
      // Loại bỏ các từ không cần thiết ở đầu
      taskContent = taskContent
        .replace(/^(nhắc tôi|nhắc|reminder|remind me|hãy nhắc tôi)\s*/i, '')
        .trim();
    } else {
      // Nếu không tìm thấy thời gian, set default là 1 giờ sau
      dueDate = new Date(referenceDate.getTime() + 60 * 60 * 1000);
    }
    
    // Làm sạch nội dung task
    if (!taskContent) {
      taskContent = 'Công việc không có tiêu đề';
    }
    
    res.json({
      taskContent: taskContent.charAt(0).toUpperCase() + taskContent.slice(1),
      dueDate: dueDate.toISOString()
    });
    
  } catch (error) {
    console.error('Error processing text:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'NLP Service' });
});

app.listen(PORT, () => {
  console.log(`🧠 NLP Service running on port ${PORT}`);
});