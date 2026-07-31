# 公考学习助手 — 数据层设计文档

## 1. 总体架构

```
┌─────────────────────────────────────────────────┐
│                  PWA 单 HTML 文件                 │
│                                                   │
│  ┌─────────────┐    ┌──────────────────────────┐  │
│  │  UI 渲染层   │◄──►│     DataLayer (全局)      │  │
│  └─────────────┘    │                          │  │
│                     │  ┌─ LocalStore (localStorage)│
│                     │  │                       │  │
│                     │  ├─ CloudStore (Supabase)│  │
│                     │  │   REST API fetch()    │  │
│                     │  └─ Sync (策略协调器)    │  │
│                     └──────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**核心原则：本地为主、云端为辅。** 所有读写操作优先操作 localStorage，同步操作由用户手动触发（或关键写入后自动 push）。

---

## 2. localStorage 键名设计

所有键统一前缀 `gk_`，避免与其他应用冲突。

| 键名 | 存储内容 | 格式 |
|------|---------|------|
| `gk_tasks` | 全部任务数组 | `JSON.stringify(Task[])` |
| `gk_mistakes` | 全部错题数组 | `JSON.stringify(Mistake[])` |
| `gk_exams` | 全部套卷数组 | `JSON.stringify(Exam[])` |
| `gk_weakpoints` | 全部易错考点数组 | `JSON.stringify(Weakpoint[])` |
| `gk_materials` | 全部申论素材数组 | `JSON.stringify(Material[])` |
| `gk_checkins` | 全部打卡记录数组 | `JSON.stringify(Checkin[])` |
| `gk_profile` | 用户资料（单对象） | `JSON.stringify(Profile)` |
| `gk_study_logs` | 学习日志数组 | `JSON.stringify(StudyLog[])` |
| `gk_last_sync` | 上次同步时间戳 | `string (Date.now())` |
| `gk_user_id` | Supabase 用户标识 | `string` |

> **设计说明**：每个实体用一个数组键存储，而非逐条存储。对于 PWA 本场景数据量（通常 < 500 条），整体读写性能足够，且代码简洁。profile 为单对象，直接存储。

---

## 3. Supabase 表映射

云端固定表 `notes` 结构：

| 列名 | 类型 | 说明 |
|------|------|------|
| `id` | TEXT | 本地生成 UUID |
| `type` | TEXT | 实体类型标识 |
| `title` | TEXT | 实体主标题 |
| `content` | TEXT | **JSON 字符串**，存放所有扩展字段 |
| `category` | TEXT | 一级分类 |
| `done` | BOOLEAN | 完成状态 |
| `due_date` | TEXT | 到期/复习日期 (ISO date) |
| `created_at` | BIGINT | 创建时间戳 |
| `updated_at` | BIGINT | 更新时间戳 |
| `user_id` | TEXT | 用户标识 |

### type 值映射

| 实体 | type 值 | title 取值 | category 取值 | due_date 取值 | done 取值 |
|------|---------|-----------|--------------|--------------|-----------|
| 任务 | `task` | 任务名称 | 任务分类 | 任务截止日期 | 是否完成 |
| 错题 | `mistake` | 错题标题 | 科目 | 下次复习日期 | 是否已掌握 |
| 套卷 | `exam` | 套卷名称 | 分类 | 考试日期 | — (false) |
| 易错考点 | `weakpoint` | 考点名称 | 分类 | — (null) | 是否已掌握 |
| 申论素材 | `material` | 素材标题 | 分类 | — (null) | 今日是否背诵 |
| 打卡 | `checkin` | 日期字符串 (如 "2026-07-31") | "checkin" | 日期 | — (false) |
| 学习日志 | `study_log` | 日期字符串 | "study_log" | 日期 | — (false) |
| 用户资料 | `profile` | "my_profile" | "profile" | — (null) | — (false) |

---

## 4. 实体数据模型

### 4.1 Task（任务）

```javascript
// 本地对象
const Task = {
  id: "uuid-xxx",              // 主键，本地生成
  type: "task",                // 实体类型标识
  title: "行测言语理解专项练习", // 任务名称
  category: "行测",            // 分类
  done: false,                 // 是否完成
  dueDate: "2026-08-05",       // 截止日期 (ISO date 或 null)

  // —— 以下存入 Supabase content JSON ——
  goalType: "count",           // 目标类型: "count" | "duration"
  goalCount: 100,              // 目标数量 (题数 或 分钟数)
  doneCount: 35,               // 已完成数量
  priority: 2,                 // 优先级: 0=普通, 1=重要, 2=紧急
  remark: "",                  // 备注
  focusMinutes: 0,             // 番茄钟专注总分钟数
  pomodoroCount: 0,            // 完成番茄数
  sort: 0,                     // 排序值（升序）

  // —— 元数据 ——
  createdAt: 1785479479000,    // 创建时间戳
  updatedAt: 1785479479000,     // 更新时间戳
};

// 存入 Supabase 的 content JSON
const taskContentJSON = {
  goalType: "count",
  goalCount: 100,
  doneCount: 35,
  priority: 2,
  remark: "",
  focusMinutes: 0,
  pomodoroCount: 0,
  sort: 0,
};
```

### 4.2 Mistake（错题）

```javascript
const Mistake = {
  id: "uuid-xxx",
  type: "mistake",
  title: "类比推理-对应关系题",
  category: "判断推理",          // 科目
  done: false,                  // 是否已掌握
  dueDate: "2026-08-02",        // 下次复习日期

  // —— content JSON ——
  tags: ["类比推理", "对应关系"],  // 标签数组
  masteryStatus: "need_review", // 掌握状态: "mastered" | "need_review"
  reviewDates: [                // 艾宾浩斯复习日期数组
    "2026-07-31",  // +1天
    "2026-08-02",  // +2天 (距上次4天)
    "2026-08-05",  // +4天
    "2026-08-08",  // +7天
    "2026-08-16",  // +15天
    "2026-08-31",  // +30天
  ],
  lastReviewAt: 1785479479000,  // 上次复习时间戳
  errorCount: 2,                // 错误次数
  analysis: "A→B 为工具与工作对象关系，C→D 也是...", // 解析
  question: "",                 // 题目原文 (可选)
  answer: "",                   // 正确答案 (可选)

  createdAt: 1785479479000,
  updatedAt: 1785479479000,
};

const mistakeContentJSON = {
  tags: ["类比推理", "对应关系"],
  masteryStatus: "need_review",
  reviewDates: ["2026-07-31","2026-08-02","2026-08-05","2026-08-08","2026-08-16","2026-08-31"],
  lastReviewAt: 1785479479000,
  errorCount: 2,
  analysis: "...",
  question: "",
  answer: "",
};
```

### 4.3 Exam（套卷）

```javascript
const Exam = {
  id: "uuid-xxx",
  type: "exam",
  title: "2024国考行测真题卷",
  category: "行测",
  done: false,                  // 固定 false（套卷无完成态）
  dueDate: "2026-07-20",        // 考试日期

  // —— content JSON ——
  totalScore: 100,              // 总分
  score: 78,                    // 得分
  duration: 120,                // 时长 (分钟)
  sectionScores: [              // 各板块得分数组
    { name: "言语理解", score: 18, fullScore: 20 },
    { name: "数量关系", score: 8, fullScore: 15 },
    { name: "判断推理", score: 22, fullScore: 25 },
    { name: "资料分析", score: 18, fullScore: 20 },
    { name: "常识判断", score: 12, fullScore: 20 },
  ],
  analysis: "数量关系薄弱，需加强排列组合...", // 分析

  createdAt: 1785479479000,
  updatedAt: 1785479479000,
};

const examContentJSON = {
  totalScore: 100,
  score: 78,
  duration: 120,
  sectionScores: [
    { name: "言语理解", score: 18, fullScore: 20 },
    { name: "数量关系", score: 8, fullScore: 15 },
    { name: "判断推理", score: 22, fullScore: 25 },
    { name: "资料分析", score: 18, fullScore: 20 },
    { name: "常识判断", score: 12, fullScore: 20 },
  ],
  analysis: "...",
};
```

### 4.4 Weakpoint（易错考点）

```javascript
const Weakpoint = {
  id: "uuid-xxx",
  type: "weakpoint",
  title: "排列组合-插空法",
  category: "数量关系",
  done: false,                  // 是否已掌握

  // —— content JSON ——
  masteryStatus: "need_review", // 掌握状态: "mastered" | "need_review"
  reviewCount: 0,                // 复习次数
  tags: ["排列组合", "插空法"],   // 标签数组
  relatedMistakeIds: ["uuid-1","uuid-2"], // 关联错题 ID (可选)

  dueDate: null,
  createdAt: 1785479479000,
  updatedAt: 1785479479000,
};

const weakpointContentJSON = {
  masteryStatus: "need_review",
  reviewCount: 0,
  tags: ["排列组合", "插空法"],
  relatedMistakeIds: ["uuid-1","uuid-2"],
};
```

### 4.5 Material（申论素材）

```javascript
const Material = {
  id: "uuid-xxx",
  type: "material",
  title: "人民至上——以人民为中心的发展思想",
  category: "执政理念",
  done: false,                  // 今日是否背诵

  // —— content JSON ——
  content: "江山就是人民，人民就是江山...",  // 素材正文内容
  source: "人民日报评论员文章",               // 来源
  sourceUrl: "https://...",                  // 原文链接
  tags: ["以人民为中心", "执政理念"],          // 标签
  memorizedToday: false,                     // 今日背诵标记 (与 done 同步)
  lastMemorizedDate: "2026-07-30",            // 上次背诵日期

  dueDate: null,
  createdAt: 1785479479000,
  updatedAt: 1785479479000,
};

const materialContentJSON = {
  content: "江山就是人民，人民就是江山...",
  source: "人民日报评论员文章",
  sourceUrl: "https://...",
  tags: ["以人民为中心", "执政理念"],
  memorizedToday: false,
  lastMemorizedDate: "2026-07-30",
};
```

### 4.6 Checkin（学习打卡）

```javascript
const Checkin = {
  id: "uuid-xxx",
  type: "checkin",
  title: "2026-07-31",           // 日期字符串
  category: "checkin",
  done: false,

  // —— content JSON ——
  studyHours: 4.5,               // 学习小时数
  date: "2026-07-31",            // 日期 (与 title 一致，便于 content 内自包含)

  dueDate: "2026-07-31",
  createdAt: 1785479479000,
  updatedAt: 1785479479000,
};

const checkinContentJSON = {
  studyHours: 4.5,
  date: "2026-07-31",
};
```

### 4.7 Profile（用户资料）

```javascript
const Profile = {
  id: "uuid-xxx",                // 单条记录，固定 id
  type: "profile",
  title: "my_profile",
  category: "profile",
  done: false,

  // —— content JSON ——
  nickname: "考生小李",           // 昵称
  stage: "强化冲刺",              // 阶段: "基础学习" | "专项提升" | "强化冲刺" | "考前模拟"
  streakDays: 7,                  // 连续打卡天数
  totalStudyDays: 30,             // 总学习天数
  sports: ["跑步", "俯卧撑"],     // 运动项目数组
  examDate: "2026-11-30",        // 目标考试日期 (可选)

  dueDate: null,
  createdAt: 1785479479000,
  updatedAt: 1785479479000,
};

const profileContentJSON = {
  nickname: "考生小李",
  stage: "强化冲刺",
  streakDays: 7,
  totalStudyDays: 30,
  sports: ["跑步", "俯卧撑"],
  examDate: "2026-11-30",
};
```

### 4.8 StudyLog（学习日志）

```javascript
const StudyLog = {
  id: "uuid-xxx",
  type: "study_log",
  title: "2026-07-31",           // 日期字符串
  category: "study_log",
  done: false,

  // —— content JSON ——
  date: "2026-07-31",
  completedTaskCount: 3,          // 完成任务数
  reviewedMistakeCount: 5,        // 复习错题数
  completedExamCount: 1,          // 做套卷数
  studyDuration: 240,             // 学习时长 (分钟)

  dueDate: "2026-07-31",
  createdAt: 1785479479000,
  updatedAt: 1785479479000,
};

const studyLogContentJSON = {
  date: "2026-07-31",
  completedTaskCount: 3,
  reviewedMistakeCount: 5,
  completedExamCount: 1,
  studyDuration: 240,
};
```

---

## 5. 增删改查函数签名

### 5.1 通用 CRUD（泛型）

所有实体共享同一套 CRUD 逻辑，通过 `entityType` 区分。

```javascript
/**
 * 读取本地某实体的全部数据
 * @param {string} entityType - "task"|"mistake"|"exam"|"weakpoint"|"material"|"checkin"|"study_log"
 * @returns {Array} 本地数组
 */
function getLocalAll(entityType)

/**
 * 读取本地单条
 * @param {string} entityType
 * @param {string} id
 * @returns {Object|null}
 */
function getLocalById(entityType, id)

/**
 * 创建/更新本地数据（upsert）
 * 写入 localStorage 并自动 push 到云端
 * @param {string} entityType
 * @param {Object} data - 完整实体对象
 * @returns {Object} 保存后的对象 (含 id/createdAt/updatedAt)
 */
function upsertLocal(entityType, data)

/**
 * 删除本地单条 + 云端
 * @param {string} entityType
 * @param {string} id
 * @returns {boolean}
 */
function deleteLocal(entityType, id)

/**
 * 按条件查询本地数据
 * @param {string} entityType
 * @param {Object} filters - 键值对，如 { category: "行测", done: false }
 * @returns {Array}
 */
function queryLocal(entityType, filters)
```

### 5.2 各实体特化函数

```javascript
// ====== Task ======
function getTasks()                         // 获取所有任务（按 sort 排序）
function getTaskById(id)
function createTask({ title, category, goalType, goalCount, priority, remark, dueDate })
function updateTask(id, { title, category, goalType, goalCount, doneCount, priority, remark, focusMinutes, pomodoroCount, sort, done, dueDate })
function deleteTask(id)
function incrementTaskProgress(id, count)   // 增加 doneCount，检查是否完成
function addPomodoro(id, minutes)            // 累加番茄钟时长与数量

// ====== Mistake ======
function getMistakes()
function getMistakeById(id)
function createMistake({ title, category, tags, analysis, question, answer })
function updateMistake(id, fields)
function deleteMistake(id)
function reviewMistake(id)                   // 执行复习：推进复习日期数组，更新状态
function getTodayReviewMistakes()            // 获取今日待复习错题

// ====== Exam ======
function getExams()
function getExamById(id)
function createExam({ title, category, totalScore, score, duration, sectionScores, examDate, analysis })
function updateExam(id, fields)
function deleteExam(id)

// ====== Weakpoint ======
function getWeakpoints()
function getWeakpointById(id)
function createWeakpoint({ title, category, tags })
function updateWeakpoint(id, fields)
function deleteWeakpoint(id)
function incrementWeakpointReview(id)        // 复习次数+1

// ====== Material ======
function getMaterials()
function getMaterialById(id)
function createMaterial({ title, content, source, sourceUrl, category, tags })
function updateMaterial(id, fields)
function deleteMaterial(id)
function toggleMaterialMemorizedToday(id)    // 切换今日背诵标记
function getTodayMemorizedMaterials()        // 今日已背素材

// ====== Checkin ======
function getCheckins()
function getCheckinByDate(dateStr)           // 按日期查
function upsertCheckin(dateStr, studyHours)  // 打卡/更新打卡
function deleteCheckin(id)
function getStreakDays()                     // 计算连续打卡天数

// ====== Profile ======
function getProfile()
function updateProfile(fields)               // 更新用户资料
function addSport(sportName)
function removeSport(sportName)

// ====== StudyLog ======
function getStudyLogs()
function getStudyLogByDate(dateStr)
function upsertStudyLog(dateStr, { completedTaskCount, reviewedMistakeCount, completedExamCount, studyDuration })
function deleteStudyLog(id)
function getStudyLogsInRange(startDate, endDate) // 区间查询
```

---

## 6. Supabase 同层操作函数签名

```javascript
const SUPABASE_URL = "https://xdlsoutzjkqjbskiahbp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhkbHNvdXR6amtxamJza2lhaGJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Nzk0NzksImV4cCI6MjEwMTA1NTQ3OX0.csWw_sziawwlzWZ4ZlS0Wvyt4a9w1uoxN5x3fzQ3X2U";
const TABLE_NAME = "notes";

/**
 * 将本地实体对象转换为 Supabase notes 行
 * @param {Object} entity - 本地实体
 * @returns {Object} Supabase 行结构
 */
function toSupabaseRow(entity)

/**
 * 将 Supabase notes 行还原为本地实体对象
 * @param {Object} row - Supabase 行
 * @returns {Object} 本地实体
 */
function fromSupabaseRow(row)

/**
 * 推送单条到云端 (POST 新增 / PATCH 更新)
 * @param {Object} entity
 * @returns {Promise<Object>} 云端返回行
 */
async function pushOne(entity)

/**
 * 从云端删除单条
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteFromCloud(id)

/**
 * 从云端拉取某类型全部数据
 * @param {string} entityType
 * @returns {Promise<Array>}
 */
async function pullByType(entityType)

/**
 * 从云端拉取全部类型数据
 * @returns {Promise<Object>} { tasks: [], mistakes: [], ... }
 */
async function pullAll()

/**
 * 手动全量同步：拉取云端 → 合并本地 → 推送本地新增/修改
 * @returns {Promise<{ pulled: number, pushed: number, deleted: number }>}
 */
async function syncAll()
```

---

## 7. Supabase REST API 调用细节

### 7.1 请求头

```javascript
const headers = {
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation",
};
```

### 7.2 行转换逻辑

```javascript
function toSupabaseRow(entity) {
  // 将扩展字段打包进 content JSON
  const contentFields = { ...entity };
  // 移除映射到 notes 列的字段
  delete contentFields.id;
  delete contentFields.type;
  delete contentFields.title;
  delete contentFields.category;
  delete contentFields.done;
  delete contentFields.dueDate;
  delete contentFields.createdAt;
  delete contentFields.updatedAt;

  return {
    id: entity.id,
    type: entity.type,
    title: entity.title,
    content: JSON.stringify(contentFields),
    category: entity.category || null,
    done: entity.done || false,
    due_date: entity.dueDate || null,
    created_at: entity.createdAt,
    updated_at: entity.updatedAt,
    user_id: localStorage.getItem("gk_user_id") || "anonymous",
  };
}

function fromSupabaseRow(row) {
  const extra = row.content ? JSON.parse(row.content) : {};
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    category: row.category,
    done: row.done,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...extra,  // 扩展字段展开回来
  };
}
```

### 7.3 具体 API 端点

```javascript
// 新增
// POST {SUPABASE_URL}/rest/v1/notes
// body: toSupabaseRow(entity)
// Prefer: return=representation

// 更新
// PATCH {SUPABASE_URL}/rest/v1/notes?id=eq.{id}
// body: toSupabaseRow(entity) (不需要 id)
// Prefer: return=representation

// 删除
// DELETE {SUPABASE_URL}/rest/v1/notes?id=eq.{id}

// 按类型查询
// GET {SUPABASE_URL}/rest/v1/notes?type=eq.{entityType}&user_id=eq.{userId}&order=updated_at.desc

// 全量查询
// GET {SUPABASE_URL}/rest/v1/notes?user_id=eq.{userId}&order=updated_at.desc
```

---

## 8. 同步策略

### 8.1 策略总则

```
本地优先 (Local-First) → 手动拉取 → 删除即删云端
```

| 操作 | 本地行为 | 云端行为 |
|------|---------|---------|
| 读取 | 直接读 localStorage | 不触发云端 |
| 创建 | 写 localStorage | **自动 push** (异步，不阻塞 UI) |
| 更新 | 写 localStorage | **自动 push** (异步，不阻塞 UI) |
| 删除 | 删 localStorage | **自动 delete** (异步，不阻塞 UI) |
| 全量同步 | 拉取合并后覆盖本地 | 推送本地差异到云端 |

### 8.2 自动 Push 流程（写入时）

```javascript
async function upsertLocal(entityType, data) {
  // 1. 补充元数据
  const now = Date.now();
  if (!data.id) {
    data.id = generateUUID();
    data.createdAt = now;
  }
  data.updatedAt = now;
  data.type = entityType;

  // 2. 写入 localStorage
  const all = getLocalAll(entityType);
  const idx = all.findIndex(item => item.id === data.id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...data };
  } else {
    all.push(data);
  }
  localStorage.setItem(getStorageKey(entityType), JSON.stringify(all));

  // 3. 异步推送云端 (不阻塞 UI)
  pushOne(data).catch(err => {
    console.warn(`[Sync] push failed for ${entityType}/${data.id}:`, err.message);
    // 失败不回滚本地，用户下次手动同步时补偿
  });

  return data;
}
```

### 8.3 手动全量同步流程

```javascript
async function syncAll() {
  const userId = localStorage.getItem("gk_user_id") || "anonymous";

  // 1. 拉取云端全部数据
  const cloudRows = await pullAll(userId);

  // 2. 按 type 分组
  const cloudByType = groupBy(cloudRows, "type");

  // 3. 逐类型合并
  for (const [entityType, cloudItems] of Object.entries(cloudByType)) {
    const localItems = getLocalAll(entityType);
    const localMap = new Map(localItems.map(i => [i.id, i]));
    const merged = [];

    for (const cloudItem of cloudItems) {
      const entity = fromSupabaseRow(cloudItem);
      const localItem = localMap.get(entity.id);

      if (!localItem) {
        // 云端有、本地无 → 拉取到本地
        merged.push(entity);
      } else {
        // 两端都有 → 按 updatedAt 取较新的
        merged.push(entity.updatedAt >= localItem.updatedAt ? entity : localItem);
        localMap.delete(entity.id);
      }
    }

    // 本地有、云端无 → 推送到云端
    for (const localOnly of localMap.values()) {
      merged.push(localOnly);
      pushOne(localOnly).catch(() => {});
    }

    // 写回 localStorage
    localStorage.setItem(getStorageKey(entityType), JSON.stringify(merged));
  }

  // 4. 处理本地已删除但云端仍有的记录
  //    (需要额外维护一个 deletedIds 列表，见 8.4)
  await syncDeletes(userId);

  // 5. 更新同步时间
  localStorage.setItem("gk_last_sync", String(Date.now()));

  return { pulled: cloudRows.length, pushed: 0, deleted: 0 };
}
```

### 8.4 删除同步

```javascript
// 删除时同时通知云端，无需额外维护 deletedIds
async function deleteLocal(entityType, id) {
  // 1. 删本地
  const all = getLocalAll(entityType).filter(item => item.id !== id);
  localStorage.setItem(getStorageKey(entityType), JSON.stringify(all));

  // 2. 异步删云端
  deleteFromCloud(id).catch(err => {
    console.warn(`[Sync] delete failed for ${id}:`, err.message);
    // 失败不阻塞，下次手动同步时可检测差异
  });

  return true;
}
```

### 8.5 冲突解决规则

| 情况 | 解决方式 |
|------|---------|
| 本地和云端都有，updatedAt 不同 | **Last-Write-Wins**：取 updatedAt 较大者 |
| 本地有，云端无 | 推送到云端 |
| 云端有，本地无 | 拉取到本地 |
| 本地已删除，云端仍有 | **删除即删云端**：同步时检测到云端有但本地无的记录，从云端删除 |

### 8.6 边界情况处理

```
- 首次使用（无本地数据）：拉取云端 → 写入本地。若云端也无 → 初始化示例数据
- 离线模式：所有操作仅写本地，push 失败静默忽略，下次联网手动同步
- 网络超时：3 秒超时，本地操作不受影响
- content JSON 解析失败：catch 并返回空对象 {}，不崩溃
- localStorage 空间不足：catch QUOTA_EXCEEDED，提示用户清理
```

---

## 9. UUID 生成（无外部库）

```javascript
function generateUUID() {
  // 借用 crypto.randomUUID（iOS Safari 15.4+ 支持）
  if (crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // 降级方案
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
```

---

## 10. localStorage 存储键映射函数

```javascript
const STORAGE_KEY_MAP = {
  task:       "gk_tasks",
  mistake:    "gk_mistakes",
  exam:       "gk_exams",
  weakpoint:  "gk_weakpoints",
  material:   "gk_materials",
  checkin:    "gk_checkins",
  study_log:  "gk_study_logs",
};

function getStorageKey(entityType) {
  if (entityType === "profile") return "gk_profile";
  return STORAGE_KEY_MAP[entityType];
}
```

---

## 11. 示例初始化数据

```javascript
const INITIAL_DATA = {
  profile: {
    id: "profile-001",
    type: "profile",
    title: "my_profile",
    category: "profile",
    done: false,
    dueDate: null,
    nickname: "考生小李",
    stage: "强化冲刺",
    streakDays: 0,
    totalStudyDays: 0,
    sports: ["跑步"],
    examDate: "2026-11-30",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },

  tasks: [
    {
      id: "task-001",
      type: "task",
      title: "行测言语理解 40 题专项",
      category: "行测",
      done: false,
      dueDate: null,
      goalType: "count",
      goalCount: 40,
      doneCount: 0,
      priority: 1,
      remark: "限时 35 分钟",
      focusMinutes: 0,
      pomodoroCount: 0,
      sort: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: "task-002",
      type: "task",
      title: "申论大作文写作练习",
      category: "申论",
      done: false,
      dueDate: null,
      goalType: "duration",
      goalCount: 60,
      doneCount: 0,
      priority: 2,
      remark: "",
      focusMinutes: 0,
      pomodoroCount: 0,
      sort: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],

  mistakes: [
    {
      id: "mistake-001",
      type: "mistake",
      title: "类比推理 - 对应关系",
      category: "判断推理",
      done: false,
      dueDate: getNextDate(1),
      tags: ["类比推理", "对应关系"],
      masteryStatus: "need_review",
      reviewDates: generateReviewDates(),
      lastReviewAt: Date.now(),
      errorCount: 1,
      analysis: "A→B 为工具与对象关系，需区分对应方向",
      question: "",
      answer: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],

  exams: [
    {
      id: "exam-001",
      type: "exam",
      title: "2024 国考行测真题",
      category: "行测",
      done: false,
      dueDate: "2026-07-20",
      totalScore: 100,
      score: 72,
      duration: 120,
      sectionScores: [
        { name: "言语理解", score: 16, fullScore: 20 },
        { name: "数量关系", score: 6, fullScore: 15 },
        { name: "判断推理", score: 20, fullScore: 25 },
        { name: "资料分析", score: 16, fullScore: 20 },
        { name: "常识判断", score: 14, fullScore: 20 },
      ],
      analysis: "数量关系得分率最低，需加强排列组合与概率",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],

  weakpoints: [
    {
      id: "weakpoint-001",
      type: "weakpoint",
      title: "排列组合 - 插空法",
      category: "数量关系",
      done: false,
      dueDate: null,
      masteryStatus: "need_review",
      reviewCount: 0,
      tags: ["排列组合", "插空法"],
      relatedMistakeIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],

  materials: [
    {
      id: "material-001",
      type: "material",
      title: "人民至上 — 以人民为中心的发展思想",
      category: "执政理念",
      done: false,
      dueDate: null,
      content: "江山就是人民，人民就是江山。中国共产党领导人民打江山、守江山，守的是人民的心。",
      source: "党的二十大报告",
      sourceUrl: "",
      tags: ["以人民为中心", "执政理念"],
      memorizedToday: false,
      lastMemorizedDate: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],

  checkins: [],

  study_logs: [],
};

// 艾宾浩斯复习日期生成辅助
function getNextDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function generateReviewDates() {
  const intervals = [1, 2, 4, 7, 15, 30];
  return intervals.map(d => getNextDate(d));
}
```

---

## 12. 数据流时序图

```
用户操作           UI 层              DataLayer              localStorage        Supabase
  │                 │                    │                      │                   │
  │── 查看任务列表 ─►│                    │                      │                   │
  │                 │── getTasks() ────►│── getItem("gk_tasks")│                   │
  │                 │◄── 返回数组 ──────│◄─────────────────────│                   │
  │◄── 渲染列表 ────│                    │                      │                   │
  │                 │                    │                      │                   │
  │── 新增任务 ────►│                    │                      │                   │
  │                 │── createTask() ─►│── setItem(...)         │                   │
  │                 │◄── 返回新对象 ────│                      │── pushOne() ────►│
  │◄── 刷新列表 ────│                    │   (不阻塞)            │   POST /notes     │
  │                 │                    │                      │◄── 201 OK ───────│
  │                 │                    │                      │                   │
  │── 删除任务 ────►│                    │                      │                   │
  │                 │── deleteTask() ─►│── setItem(...)         │                   │
  │                 │◄── 返回 true ─────│                      │── deleteFromCloud│
  │◄── 刷新列表 ────│                    │   (不阻塞)            │   DELETE /notes  │
  │                 │                    │                      │◄── 204 ──────────│
  │                 │                    │                      │                   │
  │── 手动同步 ────►│                    │                      │                   │
  │                 │── syncAll() ────►│                      │── GET /notes ───►│
  │                 │                   │◄── 合并结果 ─────────│◄── 200 + rows ───│
  │                 │                   │── setItem(all) ──────│                   │
  │                 │                   │── pushOne(新增) ─────│── POST/PATCH ───►│
  │                 │◄── 返回统计 ──────│                      │                   │
  │◄── 显示同步结果 │                    │                      │                   │
```

---

## 13. 关键注意事项

1. **Content JSON 大小**：Supabase 的 `content` 列为 TEXT 类型，理论上无大小限制。但素材正文可能较长，建议单条 < 50KB。
2. **时区一致性**：所有日期字符串统一使用 `YYYY-MM-DD` 格式，时间戳统一使用 `Date.now()` 毫秒数。
3. **幂等性**：`upsertLocal` 基于 id 做存在判断，重复调用安全。
4. **并发写入**：PWA 单用户单设备场景，无并发问题。多设备场景通过手动同步解决。
5. **Profile 唯一性**：Profile 固定 id `profile-001`，`upsertLocal("profile", data)` 更新而非新增。
6. **iOS Safari 兼容**：`crypto.randomUUID()` 需 iOS 15.4+，已提供降级方案。`fetch` 需 iOS 10.1+，满足要求。
7. **Supabase RLS**：当前使用 anon key + `user_id` 字段做数据隔离。生产环境建议配置 Row Level Security 策略，但本设计中 user_id 为本地标识，非 Supabase Auth 用户。
