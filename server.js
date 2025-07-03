const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/github/:username', async (req, res) => {
  const username = req.params.username;

  try {
    const response = await fetch(`https://api.github.com/users/${username}`);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'GitHub user not found or API error' });
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/', (req, res) => {
  res.send('GitHub Proxy is running');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
