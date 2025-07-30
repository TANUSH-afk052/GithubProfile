import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Optional: Add your GitHub token for higher rate limits

// Security middleware with CSP configuration for inline scripts
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers
      imgSrc: ["'self'", "data:", "https://avatars.githubusercontent.com", "https://github.com"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      mediaSrc: ["'self'", "https://i.gifer.com", "https://i.pinimg.com"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Enable CORS with specific origins (modify for production)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com'] // Replace with your actual domain
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

// Compression middleware for better performance
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: 15 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each IP to 60 API requests per windowMs
  message: {
    error: 'Too many API requests, please try again later.',
    retryAfter: 15 * 60 * 1000
  },
});

// Apply rate limiting
app.use(generalLimiter);
app.use('/api/', apiLimiter);

// Serve static files from the "public" directory with caching
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0',
  etag: true,
  lastModified: true
}));

// Enhanced logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const ip = req.ip || req.connection.remoteAddress;
  console.log(`[${timestamp}] ${req.method} ${req.url} - ${ip}`);
  
  // Log response time
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${timestamp}] ${req.method} ${req.url} - ${res.statusCode} (${duration}ms)`);
  });
  
  next();
});

// GitHub API helper function with better error handling
async function fetchGitHubAPI(url, options = {}) {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'GitHub-Profile-Checker/1.0',
    ...options.headers
  };

  // Add GitHub token if available for higher rate limits
  if (GITHUB_TOKEN) {
    headers['Authorization'] = `token ${GITHUB_TOKEN}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Enhanced error handling based on GitHub API response codes
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      switch (response.status) {
        case 404:
          throw { status: 404, message: 'User or resource not found' };
        case 403:
          if (response.headers.get('X-RateLimit-Remaining') === '0') {
            const resetTime = response.headers.get('X-RateLimit-Reset');
            const resetDate = new Date(resetTime * 1000);
            throw { 
              status: 429, 
              message: 'GitHub API rate limit exceeded',
              retryAfter: resetDate.toISOString()
            };
          }
          throw { status: 403, message: 'Access forbidden' };
        case 422:
          throw { status: 422, message: 'Invalid request parameters' };
        case 500:
        case 502:
        case 503:
          throw { status: 503, message: 'GitHub API temporarily unavailable' };
        default:
          throw { 
            status: response.status, 
            message: errorData.message || 'GitHub API error' 
          };
      }
    }

    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw { status: 408, message: 'Request timeout' };
    }
    
    if (error.status) {
      throw error; // Re-throw GitHub API errors
    }
    
    // Network errors
    throw { status: 503, message: 'Unable to connect to GitHub API' };
  }
}

// Input validation middleware
const validateUsername = (req, res, next) => {
  const { username } = req.params;
  
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username is required' });
  }
  
  // GitHub username validation
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(username)) {
    return res.status(400).json({ 
      error: 'Invalid username format. GitHub usernames can only contain alphanumeric characters and hyphens.' 
    });
  }
  
  if (username.length > 39) {
    return res.status(400).json({ 
      error: 'Username too long. GitHub usernames cannot exceed 39 characters.' 
    });
  }
  
  next();
};

// Route: Get GitHub user profile with caching headers
app.get('/api/github/:username', validateUsername, async (req, res) => {
  const { username } = req.params;
  const url = `https://api.github.com/users/${username}`;

  try {
    const response = await fetchGitHubAPI(url);
    const data = await response.json();
    
    // Set cache headers
    res.set({
      'Cache-Control': 'public, max-age=300', // 5 minutes cache
      'ETag': response.headers.get('etag'),
      'Last-Modified': response.headers.get('last-modified')
    });
    
    // Add rate limit info to response headers
    const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
    const rateLimitReset = response.headers.get('X-RateLimit-Reset');
    
    if (rateLimitRemaining) {
      res.set('X-RateLimit-Remaining', rateLimitRemaining);
    }
    if (rateLimitReset) {
      res.set('X-RateLimit-Reset', rateLimitReset);
    }
    
    res.json(data);
  } catch (error) {
    console.error(`Error fetching profile for ${username}:`, error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Failed to fetch user profile',
      ...(error.retryAfter && { retryAfter: error.retryAfter })
    });
  }
});

// Route: Get GitHub user's repositories with pagination and sorting
app.get('/api/github/:username/repos', validateUsername, async (req, res) => {
  const { username } = req.params;
  const { 
    per_page = 100, 
    page = 1, 
    sort = 'updated', 
    direction = 'desc',
    type = 'all' 
  } = req.query;
  
  // Validate query parameters
  if (per_page > 100) {
    return res.status(400).json({ error: 'per_page cannot exceed 100' });
  }
  
  const validSorts = ['created', 'updated', 'pushed', 'full_name'];
  if (!validSorts.includes(sort)) {
    return res.status(400).json({ error: 'Invalid sort parameter' });
  }
  
  const url = `https://api.github.com/users/${username}/repos?per_page=${per_page}&page=${page}&sort=${sort}&direction=${direction}&type=${type}`;

  try {
    const response = await fetchGitHubAPI(url);
    const repos = await response.json();
    
    // Set cache headers
    res.set({
      'Cache-Control': 'public, max-age=180', // 3 minutes cache for repos
      'ETag': response.headers.get('etag')
    });
    
    // Add pagination info
    const linkHeader = response.headers.get('Link');
    if (linkHeader) {
      res.set('Link', linkHeader);
    }
    
    res.json(repos);
  } catch (error) {
    console.error(`Error fetching repositories for ${username}:`, error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Failed to fetch repositories',
      ...(error.retryAfter && { retryAfter: error.retryAfter })
    });
  }
});

// Route: Get GitHub user's starred repositories with pagination
app.get('/api/github/:username/starred', validateUsername, async (req, res) => {
  const { username } = req.params;
  const { per_page = 30, page = 1, sort = 'created' } = req.query;
  
  if (per_page > 100) {
    return res.status(400).json({ error: 'per_page cannot exceed 100' });
  }
  
  const url = `https://api.github.com/users/${username}/starred?per_page=${per_page}&page=${page}&sort=${sort}`;

  try {
    const response = await fetchGitHubAPI(url);
    const starred = await response.json();
    
    // Set cache headers
    res.set({
      'Cache-Control': 'public, max-age=300', // 5 minutes cache
      'ETag': response.headers.get('etag')
    });
    
    res.json(starred);
  } catch (error) {
    console.error(`Error fetching starred repositories for ${username}:`, error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Failed to fetch starred repositories',
      ...(error.retryAfter && { retryAfter: error.retryAfter })
    });
  }
});

// Route: Get GitHub user's events (activity feed)
app.get('/api/github/:username/events', validateUsername, async (req, res) => {
  const { username } = req.params;
  const { per_page = 30 } = req.query;
  
  const url = `https://api.github.com/users/${username}/events/public?per_page=${Math.min(per_page, 100)}`;

  try {
    const response = await fetchGitHubAPI(url);
    const events = await response.json();
    
    res.set('Cache-Control', 'public, max-age=60'); // 1 minute cache for events
    res.json(events);
  } catch (error) {
    console.error(`Error fetching events for ${username}:`, error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Failed to fetch user events' 
    });
  }
});

// Route: Get GitHub user's followers
app.get('/api/github/:username/followers', validateUsername, async (req, res) => {
  const { username } = req.params;
  const { per_page = 30, page = 1 } = req.query;
  
  const url = `https://api.github.com/users/${username}/followers?per_page=${Math.min(per_page, 100)}&page=${page}`;

  try {
    const response = await fetchGitHubAPI(url);
    const followers = await response.json();
    
    res.set('Cache-Control', 'public, max-age=300');
    res.json(followers);
  } catch (error) {
    console.error(`Error fetching followers for ${username}:`, error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Failed to fetch followers' 
    });
  }
});

// Route: Get GitHub user's following
app.get('/api/github/:username/following', validateUsername, async (req, res) => {
  const { username } = req.params;
  const { per_page = 30, page = 1 } = req.query;
  
  const url = `https://api.github.com/users/${username}/following?per_page=${Math.min(per_page, 100)}&page=${page}`;

  try {
    const response = await fetchGitHubAPI(url);
    const following = await response.json();
    
    res.set('Cache-Control', 'public, max-age=300');
    res.json(following);
  } catch (error) {
    console.error(`Error fetching following for ${username}:`, error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Failed to fetch following' 
    });
  }
});

// Route: Get GitHub API rate limit status
app.get('/api/github/rate-limit', async (req, res) => {
  const url = `https://api.github.com/rate_limit`;

  try {
    const response = await fetchGitHubAPI(url);
    const data = await response.json();
    
    res.set('Cache-Control', 'no-cache');
    res.json({
      core: data.rate,
      search: data.resources.search,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching rate limit:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Failed to fetch rate limit status' 
    });
  }
});

// Route: Search GitHub users with enhanced filtering
app.get('/api/search/users', async (req, res) => {
  const { q, sort = 'best-match', order = 'desc', per_page = 20, page = 1 } = req.query;
  
  if (!q || typeof q !== 'string' || q.trim().length === 0) {
    return res.status(400).json({ error: 'Search query is required' });
  }
  
  if (q.length > 256) {
    return res.status(400).json({ error: 'Search query too long' });
  }
  
  const validSorts = ['followers', 'repositories', 'joined', 'best-match'];
  if (!validSorts.includes(sort)) {
    return res.status(400).json({ error: 'Invalid sort parameter' });
  }
  
  const encodedQuery = encodeURIComponent(q.trim());
  const url = `https://api.github.com/search/users?q=${encodedQuery}&sort=${sort}&order=${order}&per_page=${Math.min(per_page, 100)}&page=${page}`;

  try {
    const response = await fetchGitHubAPI(url);
    const data = await response.json();
    
    res.set('Cache-Control', 'public, max-age=180'); // 3 minutes cache
    res.json({
      users: data.items || [],
      total_count: data.total_count || 0,
      incomplete_results: data.incomplete_results || false
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Failed to search users' 
    });
  }
});

// Route: Get repository details
app.get('/api/github/:username/:repo', validateUsername, async (req, res) => {
  const { username, repo } = req.params;
  
  if (!repo || !/^[a-zA-Z0-9\-_.]+$/.test(repo)) {
    return res.status(400).json({ error: 'Invalid repository name' });
  }
  
  const url = `https://api.github.com/repos/${username}/${repo}`;

  try {
    const response = await fetchGitHubAPI(url);
    const repoData = await response.json();
    
    res.set('Cache-Control', 'public, max-age=300');
    res.json(repoData);
  } catch (error) {
    console.error(`Error fetching repository ${username}/${repo}:`, error);
    res.status(error.status || 500).json({ 
      error: error.message || 'Failed to fetch repository details' 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.version
  });
});

// API status endpoint
app.get('/api/status', async (req, res) => {
  try {
    const startTime = Date.now();
    await fetchGitHubAPI('https://api.github.com/rate_limit');
    const responseTime = Date.now() - startTime;
    
    res.json({
      status: 'operational',
      github_api: 'accessible',
      response_time: `${responseTime}ms`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      github_api: 'inaccessible',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test route
app.get('/api/message', (req, res) => {
  res.json({ 
    msg: 'Hello from the enhanced backend!',
    timestamp: new Date().toISOString(),
    version: '2.0.0'
  });
});

// Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API endpoint not found',
    available_endpoints: [
      'GET /api/github/:username',
      'GET /api/github/:username/repos',
      'GET /api/github/:username/starred',
      'GET /api/github/:username/events',
      'GET /api/github/:username/followers',
      'GET /api/github/:username/following',
      'GET /api/github/:username/:repo',
      'GET /api/search/users',
      'GET /api/github/rate-limit',
      'GET /api/health',
      'GET /api/status'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// Start the server
app.listen(PORT, () => {
  console.log(`✅ Enhanced GitHub Profile Checker server is running on http://localhost:${PORT}`);
  console.log(`🔒 Security middleware enabled`);
  console.log(`⚡ Compression and caching enabled`);
  console.log(`🛡️  Rate limiting active`);
  if (GITHUB_TOKEN) {
    console.log(`🔑 GitHub token configured for higher rate limits`);
  } else {
    console.log(`⚠️  Consider adding GITHUB_TOKEN environment variable for higher rate limits`);
  }
});
