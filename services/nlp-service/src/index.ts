// ===== services/nlp-service/src/index.ts - VIETNAM TIMEZONE VERSION =====
import express from 'express';
import dotenv from 'dotenv';
import * as chrono from 'chrono-node';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.NLP_SERVICE_PORT || 3002;

// Hàm lấy thời gian hiện tại theo giờ Việt Nam
const getVietnamTime = (): Date => {
  const now = new Date();
  const vietnamOffset = 7 * 60; // +7 giờ = 420 phút
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utcTime + (vietnamOffset * 60000));
};

// Custom parser cho tiếng Việt - sử dụng giờ Việt Nam
const parseVietnameseTime = (text: string, refDate: Date) => {
  const patterns = [
    // Giờ:phút + ngày/tháng/năm
    /(\d{1,2})\s*[:h]\s*(\d{1,2})\s*(?:phút)?\s*(?:ngày|vào ngày)?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
    // Giờ + ngày/tháng/năm  
    /(\d{1,2})\s*(?:giờ|h)\s*(?:ngày|vào ngày)?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
    // Chỉ có giờ:phút
    /(\d{1,2})\s*[:h]\s*(\d{1,2})\s*(?:phút)?/i,
    // Chỉ có giờ
    /(\d{1,2})\s*(?:giờ|h)/i,
    // Hôm nay/ngày mai + giờ
    /(hôm nay|ngày mai)\s*(?:lúc)?\s*(\d{1,2})\s*[:h]?\s*(\d{1,2})?\s*(?:phút|giờ)?/i,
    // Buổi trong ngày + hôm nay
    /(sáng|trưa|chiều|tối)\s*(hôm nay|nay)/i,
    // Buổi trong ngày + hôm sau/ngày mai
    /(sáng|trưa|chiều|tối)\s*(hôm sau|ngày mai|mai)/i,
    // Sau X phút/giờ
    /sau\s*(\d+)\s*(phút|giờ)/i,
    // X phút/giờ nữa
    /(\d+)\s*(phút|giờ)\s*nữa/i
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = text.match(patterns[i]);
    if (match) {
      let resultDate = new Date(refDate);
      
      switch (i) {
        case 0: // Giờ:phút + ngày/tháng/năm
          resultDate = new Date(parseInt(match[5]), parseInt(match[4]) - 1, parseInt(match[3]), 
                               parseInt(match[1]), parseInt(match[2]));
          return { date: resultDate, matchText: match[0] };
          
        case 1: // Giờ + ngày/tháng/năm
          resultDate = new Date(parseInt(match[5]), parseInt(match[3]) - 1, parseInt(match[2]), 
                               parseInt(match[1]), 0);
          return { date: resultDate, matchText: match[0] };
          
        case 2: // Chỉ có giờ:phút
          resultDate.setHours(parseInt(match[1]), parseInt(match[2]), 0, 0);
          // Nếu thời gian đã qua trong ngày, chuyển sang ngày mai
          if (resultDate <= refDate) {
            resultDate.setDate(resultDate.getDate() + 1);
          }
          return { date: resultDate, matchText: match[0] };
          
        case 3: // Chỉ có giờ
          resultDate.setHours(parseInt(match[1]), 0, 0, 0);
          if (resultDate <= refDate) {
            resultDate.setDate(resultDate.getDate() + 1);
          }
          return { date: resultDate, matchText: match[0] };
          
        case 4: // Hôm nay/ngày mai + giờ
          if (match[1].toLowerCase() === 'ngày mai') {
            resultDate.setDate(resultDate.getDate() + 1);
          }
          resultDate.setHours(parseInt(match[2]), parseInt(match[3] || '0'), 0, 0);
          return { date: resultDate, matchText: match[0] };
          
        case 5: // Buổi trong ngày + hôm nay
          const timeOfDayToday = getTimeForPeriod(match[1].toLowerCase(), refDate);
          if (timeOfDayToday.getTime() <= refDate.getTime()) {
            // Nếu buổi đó đã qua, không thể đặt nhắc nhở
            return null;
          }
          return { date: timeOfDayToday, matchText: match[0] };
          
        case 6: // Buổi trong ngày + hôm sau/ngày mai
          let targetDate = new Date(refDate);
          targetDate.setDate(targetDate.getDate() + 1);
          const timeOfDayTomorrow = getTimeForPeriod(match[1].toLowerCase(), targetDate);
          return { date: timeOfDayTomorrow, matchText: match[0] };
          
        case 7: // Sau X phút/giờ
          const afterValue = parseInt(match[1]);
          if (match[2] === 'giờ') {
            resultDate.setTime(resultDate.getTime() + afterValue * 60 * 60 * 1000);
          } else {
            resultDate.setTime(resultDate.getTime() + afterValue * 60 * 1000);
          }
          return { date: resultDate, matchText: match[0] };
          
        case 8: // X phút/giờ nữa
          const laterValue = parseInt(match[1]);
          if (match[2] === 'giờ') {
            resultDate.setTime(resultDate.getTime() + laterValue * 60 * 60 * 1000);
          } else {
            resultDate.setTime(resultDate.getTime() + laterValue * 60 * 1000);
          }
          return { date: resultDate, matchText: match[0] };
      }
    }
  }
  
  return null;
};

// Hàm xác định thời gian cho các buổi trong ngày
const getTimeForPeriod = (period: string, targetDate: Date): Date => {
  const result = new Date(targetDate);
  result.setSeconds(0, 0);
  
  switch (period) {
    case 'sáng':
      result.setHours(7, 0); // 7:00 AM
      break;
    case 'trưa':
      result.setHours(12, 0); // 12:00 PM
      break;
    case 'chiều':
      result.setHours(15, 0); // 3:00 PM
      break;
    case 'tối':
      result.setHours(19, 0); // 7:00 PM
      break;
    default:
      result.setHours(9, 0); // Mặc định 9:00 AM
  }
  
  return result;
};

// Làm sạch nội dung task
const cleanTaskContent = (text: string, timeText: string) => {
  let cleaned = text;
  
  // Loại bỏ phần thời gian được match
  if (timeText) {
    cleaned = cleaned.replace(timeText, '').trim();
  }
  
  // Loại bỏ các từ khóa đầu câu và giữa câu
  const cleanupPatterns = [
    // Từ khóa đầu câu
    /^(nhắc tôi|nhắc|reminder|remind me|hãy nhắc tôi|nhắcc tôi)\s*/i,
    /^(task|việc|công việc)\s*/i,
    
    // Từ "lúc" và các biến thể
    /\s*lúc\s*/gi,
    /\s*vào lúc\s*/gi,
    /\s*vào\s*/gi,
    
    // Các từ thời gian thừa
    /\s*ngày\s*/gi,
    /\s*giờ\s*/gi,
    /\s*phút\s*/gi,
    
    // Pattern cho ngày tháng năm còn sót lại
    /\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\s*/gi,
    /\s*\d{1,2}:\d{1,2}\s*/gi,
    /\s*\d{1,2}h\d{1,2}\s*/gi,
    
    // Các từ không cần thiết khác
    /\s*(hôm nay|ngày mai|nay|mai)\s*/gi,
    /\s*(sau|nữa)\s*/gi,
    /\s*(sáng|trưa|chiều|tối)\s*/gi,
    /\s*(hôm sau)\s*/gi,
  ];
  
  for (const pattern of cleanupPatterns) {
    cleaned = cleaned.replace(pattern, ' ').trim();
  }
  
  // Loại bỏ các ký tự đặc biệt và khoảng trắng thừa
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  // Loại bỏ các từ đơn lẻ không có nghĩa
  const meaninglessWords = ['h', 'và', 'của', 'trong', 'trên', 'dưới', 'với'];
  const words = cleaned.split(' ');
  const filteredWords = words.filter(word => 
    word.length > 1 && !meaninglessWords.includes(word.toLowerCase())
  );
  
  cleaned = filteredWords.join(' ');
  
  // Nếu không còn nội dung, trả về mặc định
  if (!cleaned || cleaned.length < 2) {
    return 'Công việc không có tiêu đề';
  }
  
  // Viết hoa chữ cái đầu
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

// API xử lý ngôn ngữ tự nhiên - SỬ DỤNG GIỜ VIỆT NAM
app.post('/process', (req, res) => {
  try {
    const { text, refDate } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    // Sử dụng giờ Việt Nam làm reference date
    const referenceDate = refDate ? new Date(refDate) : getVietnamTime();
    
    // Thử parser tiếng Việt trước
    const vietnameseResult = parseVietnameseTime(text, referenceDate);
    
    let taskContent = text;
    let dueDate = null;
    let matchText = '';
    
    if (vietnameseResult) {
      dueDate = vietnameseResult.date;
      matchText = vietnameseResult.matchText;
      taskContent = cleanTaskContent(text, matchText);
    } else {
      // Fallback sang chrono-node cho các trường hợp khác
      const parsedResults = chrono.parse(text, referenceDate);
      
      if (parsedResults.length > 0) {
        const chronoResult = parsedResults[0];
        dueDate = chronoResult.start.date();
        matchText = chronoResult.text;
        taskContent = cleanTaskContent(text, matchText);
      } else {
        // Nếu không tìm thấy thời gian, set default là 1 giờ sau (giờ Việt Nam)
        const defaultTime = new Date(referenceDate);
        defaultTime.setHours(defaultTime.getHours() + 1);
        dueDate = defaultTime;
        taskContent = cleanTaskContent(text, '');
      }
    }
    
    res.json({
      taskContent,
      dueDate: dueDate.toISOString(), // Trả về như giờ Việt Nam (sẽ được xử lý đúng ở các service khác)
      debug: {
        originalText: text,
        matchedTime: matchText,
        parsedBy: vietnameseResult ? 'vietnamese_parser' : 'chrono_node',
        vietnamTime: getVietnamTime().toISOString(),
        timezone: 'UTC+7 (Vietnam)'
      }
    });
    
  } catch (error) {
    console.error('Error processing text:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'NLP Service',
    timezone: 'UTC+7 (Vietnam)',
    currentVietnamTime: getVietnamTime().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🧠 NLP Service running on port ${PORT}`);
  console.log(`🌏 Using Vietnam timezone (UTC+7)`);
  console.log(`⏰ Current Vietnam time: ${getVietnamTime().toISOString()}`);
});