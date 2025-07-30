// Theme management
function initializeTheme() {
  const savedTheme = localStorage.getItem('github-checker-theme') || 'water';
  const themeSelect = document.getElementById('theme');
  themeSelect.value = savedTheme;
  changeTheme(savedTheme);
  
  // Adding event listener for theme changing
  themeSelect.addEventListener('change', (e) => {
    changeTheme(e.target.value);
    localStorage.setItem('github-checker-theme', e.target.value);
  });
}

function changeTheme(theme) {
  document.body.className = ""; // Remove existing theme
  if (theme) {
    document.body.classList.add(`${theme}-theme`); // Apply correct CSS class
  }
}


// Loading state funct to manage loading state
function showLoading() {
  const button = document.querySelector('button');
  button.disabled = true;
  button.innerHTML = '<span class="spinner"></span> Loading...';
  
  // for Clearing previous results
  document.getElementById('profile').innerHTML = '<div class="loading-skeleton"></div>';
  document.getElementById('repos').innerHTML = '<div class="loading-skeleton"></div>';
  document.getElementById('starred').innerHTML = '<div class="loading-skeleton"></div>';
}

function hideLoading() {
  const button = document.querySelector('button');
  button.disabled = false;
  button.innerHTML = 'Search';
}


async function getProfile() {
  const username = document.getElementById('username').value.trim();
  if (!username) {
    showError("Please enter a GitHub username");
    return;
  }

  // Validating username format 
  if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(username)) {
    showError("Invalid username format. GitHub usernames can only contain alphanumeric characters and hyphens.");
    return;
  }

  showLoading();

  try {
    
    const profilePromise = fetchWithTimeout(`/api/github/${username}`, 10000);
    const reposPromise = fetchWithTimeout(`/api/github/${username}/repos`, 10000);
    const starredPromise = fetchWithTimeout(`/api/github/${username}/starred`, 10000);

    const [profileRes, reposRes, starredRes] = await Promise.all([
      profilePromise,
      reposPromise,
      starredPromise
    ]);

    if (!profileRes.ok) {
      throw new Error(profileRes.status === 404 ? "User not found" : "Failed to fetch profile");
    }

    const [profileData, reposData, starredData] = await Promise.all([
      profileRes.json(),
      reposRes.json(),
      starredRes.json()
    ]);

    displayProfile(profileData);
    displayRepositories(reposData);
    displayStarredRepos(starredData);
    
    // Saving of the last searched name for just to check
    localStorage.setItem('github-checker-last-user', username);
    
  } catch (err) {
    console.error('Error fetching GitHub data:', err);
    showError(err.message || "Network error. Please try again.");
    clearResults();
  } finally {
    hideLoading();
  }
}

// setting timeout because why not
async function fetchWithTimeout(url, timeout = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { 
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      }
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout. Please try again.');
    }
    throw error;
  }
}

// a profile display taken idea from some web's
function displayProfile(data) {
  const joinDate = new Date(data.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long'
  });

  document.getElementById('profile').innerHTML = `
    <div class="profile-header">
      <img src="${data.avatar_url}" alt="${data.login}'s avatar" width="100" loading="lazy">
      <div class="profile-info">
        <h2>${data.name || data.login}</h2>
        <p class="username">@${data.login}</p>
        ${data.bio ? `<p class="bio">${escapeHtml(data.bio)}</p>` : ''}
        ${data.location ? `<p class="location"> ${escapeHtml(data.location)}</p>` : ''}
        <p class="join-date"> Joined ${joinDate}</p>
      </div>
    </div>
    
    <div class="profile-stats">
      <div class="stat">
        <span class="stat-number">${formatNumber(data.followers)}</span>
        <span class="stat-label">Followers</span>
      </div>
      <div class="stat">
        <span class="stat-number">${formatNumber(data.following)}</span>
        <span class="stat-label">Following</span>
      </div>
      <div class="stat">
        <span class="stat-number">${formatNumber(data.public_repos)}</span>
        <span class="stat-label">Repositories</span>
      </div>
    </div>
    
    <div class="profile-links">
      <a href="${data.html_url}" target="_blank" rel="noopener noreferrer" class="github-link">
        View on GitHub 
      </a>
      ${data.blog ? `<a href="${data.blog.startsWith('http') ? data.blog : 'https://' + data.blog}" target="_blank" rel="noopener noreferrer" class="website-link">Website 🌐</a>` : ''}
    </div>
  `;
}

// complete 10 repositories display
function displayRepositories(repos) {
  if (!repos || repos.length === 0) {
    document.getElementById('repos').innerHTML = `
      <h2> Repositories</h2>
      <p class="empty-state">No public repositories found.</p>
    `;
    return;
  }

  // Sorting command for repos by stars and update time
  const sortedRepos = repos
    .sort((a, b) => {
      if (b.stargazers_count !== a.stargazers_count) {
        return b.stargazers_count - a.stargazers_count;
      }
      return new Date(b.updated_at) - new Date(a.updated_at);
    })
    .slice(0, 10); // only ten reposi can increase by changing num

  const reposList = sortedRepos.map(repo => {
    const lastUpdated = new Date(repo.updated_at).toLocaleDateString();
    return `
      <li class="repo-item">
        <div class="repo-header">
          <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="repo-name">
            ${escapeHtml(repo.name)}
          </a>
          <div class="repo-stats">
            ${repo.stargazers_count > 0 ? `<span class="stars"> ${formatNumber(repo.stargazers_count)}</span>` : ''}
            ${repo.forks_count > 0 ? `<span class="forks">🍴 ${formatNumber(repo.forks_count)}</span>` : ''}
          </div>
        </div>
        ${repo.description ? `<p class="repo-description">${escapeHtml(repo.description)}</p>` : ''}
        <div class="repo-meta">
          ${repo.language ? `<span class="language">${repo.language}</span>` : ''}
          <span class="updated">Updated ${lastUpdated}</span>
        </div>
      </li>
    `;
  }).join('');

  document.getElementById('repos').innerHTML = `
    <h2> Repositories <span class="count">(${repos.length})</span></h2>
    <ul class="repos-list">${reposList}</ul>
    ${repos.length > 10 ? `<p class="show-more">Showing top 10 repositories</p>` : ''}
  `;
}

// Enhanced starred repositories display
function displayStarredRepos(starred) {
  if (!starred || starred.length === 0) {
    document.getElementById('starred').innerHTML = `
      <h2> Starred Repositories</h2>
      <p class="empty-state">No starred repositories found.</p>
    `;
    return;
  }

  const starredList = starred.slice(0, 10).map(repo => `
    <li class="starred-item">
      <a href="${repo.html_url}" target="_blank" rel="noopener noreferrer" class="starred-name">
        ${escapeHtml(repo.full_name)}
      </a>
      ${repo.description ? `<p class="starred-description">${escapeHtml(repo.description)}</p>` : ''}
      <div class="starred-meta">
        ${repo.language ? `<span class="language">${repo.language}</span>` : ''}
        <span class="stars"> ${formatNumber(repo.stargazers_count)}</span>
      </div>
    </li>
  `).join('');

  document.getElementById('starred').innerHTML = `
    <h2> Starred Repositories <span class="count">(${starred.length})</span></h2>
    <ul class="starred-list">${starredList}</ul>
    ${starred.length > 10 ? `<p class="show-more">Showing 10 of ${starred.length} starred repositories</p>` : ''}
  `;
}

// Utility functionality
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatNumber(num) {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num.toString();
}

function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.textContent = message;
  
  // Remove  the existing error message
  const existingError = document.querySelector('.error-message');
  if (existingError) {
    existingError.remove();
  }
  
  // Inserting error message because no code runs without err
  const inputSection = document.querySelector('.input-section');
  inputSection.after(errorDiv);
  
  // Autorem error after 5 seconds
  setTimeout(() => {
    if (errorDiv.parentNode) {
      errorDiv.remove();
    }
  }, 5000);
}

function clearResults() {
  document.getElementById('profile').innerHTML = "";
  document.getElementById('repos').innerHTML = "";
  document.getElementById('starred').innerHTML = "";
}

// basic initialization
function initializeApp() {
  initializeTheme();
  
  // Loading of last searched user if available or the function worked 
  const lastUser = localStorage.getItem('github-checker-last-user');
  if (lastUser) {
    document.getElementById('username').value = lastUser;
  }
  
  // Adding click event listener for search button that every quality of button have
  document.getElementById('search-button').addEventListener('click', getProfile);
  
  // Adding enter key support for input because why not when you are learning
  document.getElementById('username').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      getProfile();
    }
  });
  
  // Focuser on input when page loads
  document.getElementById('username').focus();
}

// Initialize when DOM is loaded needed somehelp with DOM
document.addEventListener('DOMContentLoaded', initializeApp);
