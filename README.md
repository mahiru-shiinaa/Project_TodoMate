# 🤖 Chatbot Quản lý Công việc - TodoMate (Microservices)

![Node.js](https://img.shields.io/badge/Node.js-18.x-339933?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript)
![Docker](https://img.shields.io/badge/Docker-20.x-2496ED?style=for-the-badge&logo=docker)
![MongoDB](https://img.shields.io/badge/MongoDB-4479A1?style=for-the-badge&logo=mongodb)

**TodoMate** là một chatbot được xây dựng trên nền tảng **Telegram**, hỗ trợ quản lý và nhắc nhở công việc hằng ngày.  
Dự án áp dụng **kiến trúc Microservices**, giúp hệ thống dễ mở rộng, linh hoạt và dễ bảo trì.

---

## ✨ Tính năng chính

- **Thêm công việc thông minh:** Nhập lệnh tự nhiên để thêm công việc.  
  _(Ví dụ: `/add đi chợ lúc 5h chiều nay`)_
- **Quản lý công việc:** Liệt kê, cập nhật, xóa, đánh dấu hoàn thành.
- **Lọc & tìm kiếm:**  
  - Công việc chưa hoàn thành, đã hoàn thành, quá hạn.  
  - Lọc theo ngày hôm nay, ngày mai hoặc ngày cụ thể.  
  - Tìm kiếm theo từ khóa.
- **Nhắc nhở tự động:** Mỗi công việc sẽ được nhắc nhở **2 lần** (trước 30 phút và đúng giờ).
- **Hỗ trợ phân trang:** Danh sách dài sẽ được chia thành nhiều trang.

---

## 🛠️ Công nghệ sử dụng

- **Nền tảng:** Node.js, Express.js  
- **Ngôn ngữ:** TypeScript  
- **Cơ sở dữ liệu:** MongoDB (MongoDB Atlas)  
- **Triển khai & Dàn dựng:** Docker, Docker Compose  
- **Xử lý ngôn ngữ tự nhiên:** [`chrono-node`](https://github.com/wanasit/chrono)  
- **Telegram API:** [`node-telegram-bot-api`](https://github.com/yagop/node-telegram-bot-api)  
- **Lập lịch:** [`node-cron`](https://github.com/node-cron/node-cron)  

---

## 🏗️ Kiến trúc Microservices

Hệ thống được chia thành **5 service độc lập**, mỗi service có một vai trò riêng biệt:

```mermaid
flowchart LR
    User([User - Telegram]) -->|Message| Bot[1. Bot Service]
    Bot -->|"/add [text]"| NLP[2. NLP Service]
    NLP -->|{task, dueDate}| Bot
    Bot -->|API Request| Reminder[3. Reminder Service]
    Reminder -->|CRUD Ops| DB_Service[4. Database Service]
    DB_Service <--> DB[(MongoDB)]
    Scheduler[5. Scheduler Service] -->|Get Due Tasks| DB_Service
    Scheduler -->|Send Reminder| Bot
````

### Các service:

1. **Bot Service:** Cổng giao tiếp chính với người dùng qua Telegram.
2. **NLP Service:** Xử lý ngôn ngữ tự nhiên, trích xuất nội dung và thời gian công việc.
3. **Reminder Service:** Chứa logic nghiệp vụ (CRUD công việc, lọc, tìm kiếm).
4. **Database Service:** Cung cấp API để các service khác thao tác với MongoDB.
5. **Scheduler Service:** Chạy nền, kiểm tra và gửi nhắc nhở.

---

## 🚀 Hướng dẫn cài đặt & chạy dự án

### Yêu cầu tiên quyết

* [Git](https://git-scm.com/)
* [Node.js](https://nodejs.org/) (>= 18.x)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/)

### 1️⃣ Clone repository

```bash
git clone <URL-repository-cua-ban>
cd Project_TodoMate
```

### 2️⃣ Cấu hình biến môi trường

Tạo file `.env` ở thư mục gốc và copy từ `.env.example`:

```env
# Telegram Bot Token (tạo từ @BotFather)
TELEGRAM_BOT_TOKEN=YOUR_HTTP_API_TOKEN_FROM_BOTFATHER

# MongoDB Atlas Connection String
MONGO_URL=YOUR_MONGODB_ATLAS_CONNECTION_STRING

# Ports cho từng service
BOT_SERVICE_PORT=3001
NLP_SERVICE_PORT=3002
REMINDER_SERVICE_PORT=3003
DATABASE_SERVICE_PORT=3004
SCHEDULER_SERVICE_PORT=3005
```

---

### 3️⃣ Chạy dự án

#### 🐳 Cách 1: Docker Compose (Khuyến nghị)

Chạy toàn bộ hệ thống chỉ với một lệnh:

```bash
docker-compose up --build
```

Dừng hệ thống: `Ctrl + C`

---

#### 💻 Cách 2: Chạy development thủ công

Mở **5 terminal** khác nhau, mỗi terminal chạy một service.
Nhớ thêm đoạn code này vào **đầu file `index.ts`** của từng service để đọc `.env` từ thư mục gốc:

```ts
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
```

Sau đó chạy:

```bash
# Terminal 1: Database Service
cd services/database-service && npm install && npm run dev

# Terminal 2: NLP Service
cd services/nlp-service && npm install && npm run dev

# Terminal 3: Reminder Service
cd services/reminder-service && npm install && npm run dev

# Terminal 4: Scheduler Service
cd services/scheduler-service && npm install && npm run dev

# Terminal 5: Bot Service
cd services/bot-service && npm install && npm run dev
```

---

## 🤖 Cách sử dụng Bot

Sau khi hệ thống hoạt động, vào Telegram, tìm bot của bạn và thử các lệnh:

* `/start` → Khởi động bot
* `/help` → Xem tất cả lệnh
* `/add đi họp team lúc 3h chiều mai` → Thêm công việc
* `/list` → Xem tất cả công việc
* `/pending` → Xem công việc chưa hoàn thành
* `/complete 1` → Đánh dấu công việc có ID = 1 hoàn thành

---

## 👨‍💻 Tác giả

* **Tên:** hieuj2k4
* **GitHub:** [@your-github-username](https://github.com/your-github-username)



