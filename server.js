const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Log incoming requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Route: Get GitHub user profile
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

// Route: Get GitHub user's repositories
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

// Route: Get GitHub user's starred repositories
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

// Route: Get GitHub API rate limit status
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

// Route: Search GitHub users
app.get('/api/search/users', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: 'Missing search query' });

  const url = `https://api.github.com/search/users?q=${query}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data.items); // only send users array
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test route
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
