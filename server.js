
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url'; 


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;


app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.get('/api/github/:username', async (req, res) => {
  const username = req.params.username;
  const url = `https://api.github.com/users/${username}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('User not found');
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/github/:username/repos', async (req, res) => {
  const username = req.params.username;
  const url = `https://api.github.com/users/${username}/repos?per_page=100&sort=updated`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Repositories not found');
    const repos = await response.json();
    res.json(repos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/github/:username/starred', async (req, res) => {
  const username = req.params.username;
  const url = `https://api.github.com/users/${username}/starred`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Starred repos not found');
    const starred = await response.json();
    res.json(starred);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/github/rate-limit', async (req, res) => {
  const url = `https://api.github.com/rate_limit`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data.rate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search/users', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing search query' });
  const url = `https://api.github.com/search/users?q=${query}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data.items); 
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get('/api/message', (req, res) => {
  res.json({ msg: 'Hello from the backend!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server is running on http://localhost:${PORT}`);
});
