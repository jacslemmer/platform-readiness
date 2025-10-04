import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import { initDatabase, getTasks, createTask, updateTask, deleteTask } from './database';
import { uploadMiddleware, getFilePath } from './storage';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS - hardcoded, not platform-ready
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Initialize database
initDatabase();

// Routes
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/tasks', (req: Request, res: Response) => {
  const tasks = getTasks();
  res.json({ tasks });
});

app.post('/tasks', (req: Request, res: Response) => {
  const { title, description } = req.body;

  if (!title) {
    res.status(400).json({ error: 'Title is required' });
    return;
  }

  const task = createTask(title, description);
  res.status(201).json({ task });
});

app.put('/tasks/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { title, description, completed } = req.body;

  const task = updateTask(id, { title, description, completed });

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.json({ task });
});

app.delete('/tasks/:id', (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const success = deleteTask(id);

  if (!success) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  res.status(204).send();
});

app.post('/tasks/:id/attachment', uploadMiddleware.single('file'), (req: Request, res: Response) => {
  const id = parseInt(req.params.id);

  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const filePath = getFilePath(req.file.filename);

  res.json({
    message: 'File uploaded successfully',
    taskId: id,
    filename: req.file.filename,
    path: filePath
  });
});

// Start server - hardcoded, not platform-ready
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
