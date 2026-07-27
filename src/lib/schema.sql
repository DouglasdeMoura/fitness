[schema.sql#C1FA]
1:-- FitTrack Database Schema
2:-- Science-backed fitness & nutrition tracker
3:
4:PRAGMA journal_mode = WAL;
5:PRAGMA foreign_keys = ON;
6:
7:CREATE TABLE IF NOT EXISTS users (
8:  id INTEGER PRIMARY KEY AUTOINCREMENT,
9:  name TEXT NOT NULL DEFAULT 'Athlete',
10:  email TEXT UNIQUE,
11:  birth_date TEXT,
12:  sex TEXT DEFAULT 'male' CHECK(sex IN ('male', 'female', 'other')),
13:  height_cm REAL,
14:  activity_level TEXT DEFAULT 'moderate'
15:    CHECK(activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
16:  goal_type TEXT DEFAULT 'build_muscle'
17:    CHECK(goal_type IN ('lose_fat', 'build_muscle', 'maintain', 'recomp')),
18:  created_at TEXT DEFAULT (datetime('now')),
19:  updated_at TEXT DEFAULT (datetime('now'))
20:);
21:
22:CREATE TABLE IF NOT EXISTS body_logs (
23:  id INTEGER PRIMARY KEY AUTOINCREMENT,
24:  user_id INTEGER NOT NULL REFERENCES users(id),
25:  date TEXT NOT NULL,
26:  weight_kg REAL,
27:  body_fat_pct REAL,
28:  muscle_mass_kg REAL,
29:  waist_cm REAL,
30:  notes TEXT,
31:  created_at TEXT DEFAULT (datetime('now')),
32:  UNIQUE(user_id, date)
33:);
34:
35:CREATE TABLE IF NOT EXISTS foods (
36:  id INTEGER PRIMARY KEY AUTOINCREMENT,
37:  name TEXT NOT NULL,
38:  brand TEXT,
39:  serving_size REAL NOT NULL DEFAULT 100,
40:  serving_unit TEXT NOT NULL DEFAULT 'g',
41:  calories_per_serving REAL NOT NULL,
42:  protein_g REAL NOT NULL DEFAULT 0,
43:  carbs_g REAL NOT NULL DEFAULT 0,
44:  fat_g REAL NOT NULL DEFAULT 0,
45:  fiber_g REAL DEFAULT 0,
46:  sugar_g REAL DEFAULT 0,
47:  sodium_mg REAL DEFAULT 0,
48:  source TEXT DEFAULT 'user',
49:  created_at TEXT DEFAULT (datetime('now'))
50:);
51:
52:CREATE INDEX IF NOT EXISTS idx_foods_name ON foods(name);
53:
54:CREATE TABLE IF NOT EXISTS food_log (
55:  id INTEGER PRIMARY KEY AUTOINCREMENT,
56:  user_id INTEGER NOT NULL REFERENCES users(id),
57:  food_id INTEGER REFERENCES foods(id),
58:  custom_name TEXT,
59:  date TEXT NOT NULL,
60:  meal_type TEXT NOT NULL DEFAULT 'snack'
61:    CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
62:  servings REAL NOT NULL DEFAULT 1,
63:  calories REAL NOT NULL,
64:  protein_g REAL NOT NULL,
65:  carbs_g REAL NOT NULL,
66:  fat_g REAL NOT NULL,
67:  notes TEXT,
68:  created_at TEXT DEFAULT (datetime('now'))
69:);
70:
71:CREATE INDEX IF NOT EXISTS idx_food_log_date ON food_log(date);
CREATE INDEX IF NOT EXISTS idx_food_log_user_date ON food_log(user_id, date DESC);
72:
73:CREATE TABLE IF NOT EXISTS exercises (
74:  id INTEGER PRIMARY KEY AUTOINCREMENT,
75:  name TEXT NOT NULL,
76:  category TEXT NOT NULL DEFAULT 'compound'
77:    CHECK(category IN ('compound', 'isolation', 'bodyweight', 'cardio', 'mobility')),
78:  muscle_group TEXT NOT NULL,
79:  equipment TEXT,
80:  instructions TEXT,
81:  created_at TEXT DEFAULT (datetime('now'))
82:);
83:
84:CREATE INDEX IF NOT EXISTS idx_exercises_muscle ON exercises(muscle_group);
85:
86:CREATE TABLE IF NOT EXISTS programs (
87:  id INTEGER PRIMARY KEY AUTOINCREMENT,
88:  user_id INTEGER NOT NULL REFERENCES users(id),
89:  name TEXT NOT NULL,
90:  description TEXT,
91:  frequency_per_week INTEGER DEFAULT 3,
92:  periodization_type TEXT NOT NULL DEFAULT 'linear'
93:    CHECK(periodization_type IN ('linear', 'dup')),
94:  progression_increment_pct REAL NOT NULL DEFAULT 2.5,
95:  is_active INTEGER NOT NULL DEFAULT 0,
96:  created_at TEXT DEFAULT (datetime('now'))
97:);
98:
99:CREATE TABLE IF NOT EXISTS program_days (
100:  id INTEGER PRIMARY KEY AUTOINCREMENT,
101:  program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
102:  day_name TEXT NOT NULL,
103:  sort_order INTEGER NOT NULL,
104:  created_at TEXT DEFAULT (datetime('now'))
105:);
106:
107:CREATE TABLE IF NOT EXISTS program_exercises (
108:  id INTEGER PRIMARY KEY AUTOINCREMENT,
109:  program_day_id INTEGER NOT NULL REFERENCES program_days(id) ON DELETE CASCADE,
110:  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
111:  target_sets INTEGER,
112:  target_reps TEXT,
113:  target_rpe INTEGER,
114:  rest_seconds INTEGER,
115:  sort_order INTEGER NOT NULL,
116:  created_at TEXT DEFAULT (datetime('now'))
117:);
118:
119:CREATE TABLE IF NOT EXISTS workout_sessions (
120:  id INTEGER PRIMARY KEY AUTOINCREMENT,
121:  user_id INTEGER NOT NULL REFERENCES users(id),
122:  date TEXT NOT NULL,
123:  name TEXT,
124:  duration_minutes INTEGER,
125:  notes TEXT,
126:  program_id INTEGER REFERENCES programs(id),
127:  program_day_id INTEGER REFERENCES program_days(id),
128:  created_at TEXT DEFAULT (datetime('now'))
129:);
130:
131:CREATE INDEX IF NOT EXISTS idx_workout_sessions_date ON workout_sessions(date);
132:
133:CREATE TABLE IF NOT EXISTS workout_sets (
134:  id INTEGER PRIMARY KEY AUTOINCREMENT,
135:  session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
136:  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
137:  set_number INTEGER NOT NULL,
138:  reps INTEGER,
139:  weight_kg REAL,
140:  rpe INTEGER DEFAULT 7,
141:  rest_seconds INTEGER,
142:  notes TEXT,
143:  created_at TEXT DEFAULT (datetime('now'))
144:);
145:
146:-- Replay log for mutations queued on-device while offline.
147:-- Every queued mutation carries a UUID minted by the client, so a sync that is
148:-- retried (flaky reconnect, two tabs, background sync firing twice) resolves to
149:-- the same row instead of duplicating a meal or a set.
150:-- temp_ref holds the client-side placeholder id for rows whose real primary key
151:-- only exists after the insert, letting a set queued offline find its session
152:-- even when the two are synced in separate batches.
153:CREATE TABLE IF NOT EXISTS sync_queue (
154:  client_id TEXT PRIMARY KEY,
155:  kind TEXT NOT NULL,
156:  payload TEXT NOT NULL,
157:  temp_ref TEXT,
158:  result_id INTEGER,
159:  status TEXT NOT NULL DEFAULT 'applied'
160:    CHECK(status IN ('applied', 'failed')),
161:  error TEXT,
162:  queued_at TEXT NOT NULL,
163:  applied_at TEXT DEFAULT (datetime('now'))
164:);
165:
166:CREATE INDEX IF NOT EXISTS idx_sync_queue_temp_ref ON sync_queue(temp_ref);
167:-- Saved meal templates (food combos / recipes)
168:CREATE TABLE IF NOT EXISTS meal_templates (
169:  id INTEGER PRIMARY KEY AUTOINCREMENT,
170:  user_id INTEGER NOT NULL REFERENCES users(id),
171:  name TEXT NOT NULL,
172:  description TEXT,
173:  default_meal_type TEXT NOT NULL DEFAULT 'lunch'
174:    CHECK(default_meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
175:  created_at TEXT DEFAULT (datetime('now'))
176:);
177:
178:CREATE INDEX IF NOT EXISTS idx_meal_templates_user ON meal_templates(user_id);
179:
180:CREATE TABLE IF NOT EXISTS meal_template_items (
181:  id INTEGER PRIMARY KEY AUTOINCREMENT,
182:  template_id INTEGER NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
183:  food_id INTEGER NOT NULL REFERENCES foods(id),
184:  servings REAL NOT NULL DEFAULT 1,
185:  sort_order INTEGER NOT NULL,
186:  created_at TEXT DEFAULT (datetime('now'))
187:);
188:
189:-- Weekly meal plan slots (assign a template to date + meal type)
190:CREATE TABLE IF NOT EXISTS meal_plans (
191:  id INTEGER PRIMARY KEY AUTOINCREMENT,
192:  user_id INTEGER NOT NULL REFERENCES users(id),
193:  date TEXT NOT NULL,
194:  meal_type TEXT NOT NULL
195:    CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
196:  template_id INTEGER NOT NULL REFERENCES meal_templates(id) ON DELETE CASCADE,
197:  created_at TEXT DEFAULT (datetime('now')),
198:  UNIQUE(user_id, date, meal_type)
199:);
200:
201:CREATE INDEX IF NOT EXISTS idx_meal_plans_date ON meal_plans(date);
202: