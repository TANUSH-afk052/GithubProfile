const express = require('express');
const path = require('path');

const app = express(); 
const PORT = process.env.PORT || 3000;

/
app.use(express.static(path.join(__dirname, 'public')));

// GitHub Profile API endpoint
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

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
// when v below 18 use node-fetch 
// fetch is built-in in Node.js v22
