import sqlite3 from 'sqlite3';
import path from 'path';

const DB_PATH = process.env.DATABASE_URL || './data/local.db';

let db: sqlite3.Database;

interface Task {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  created_at: string;
}

export const initDatabase = (): void => {
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      return;
    }
    console.log('Connected to SQLite database');
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      completed BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

export const getTasks = (): Task[] => {
  const tasks: Task[] = [];

  db.all('SELECT * FROM tasks ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Error fetching tasks:', err);
      return;
    }
    tasks.push(...(rows as Task[]));
  });

  return tasks;
};

export const createTask = (title: string, description?: string): Task => {
  let newTask: Task | null = null;

  db.run(
    'INSERT INTO tasks (title, description) VALUES (?, ?)',
    [title, description || null],
    function (err) {
      if (err) {
        console.error('Error creating task:', err);
        return;
      }

      db.get('SELECT * FROM tasks WHERE id = ?', [this.lastID], (err, row) => {
        if (!err && row) {
          newTask = row as Task;
        }
      });
    }
  );

  return newTask!;
};

export const updateTask = (
  id: number,
  updates: { title?: string; description?: string; completed?: boolean }
): Task | null => {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.completed !== undefined) {
    fields.push('completed = ?');
    values.push(updates.completed ? 1 : 0);
  }

  if (fields.length === 0) return null;

  values.push(id);

  let updatedTask: Task | null = null;

  db.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values, (err) => {
    if (err) {
      console.error('Error updating task:', err);
      return;
    }

    db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
      if (!err && row) {
        updatedTask = row as Task;
      }
    });
  });

  return updatedTask;
};

export const deleteTask = (id: number): boolean => {
  let success = false;

  db.run('DELETE FROM tasks WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('Error deleting task:', err);
      return;
    }
    success = this.changes > 0;
  });

  return success;
};
