async function getProfile() {
  const username = document.getElementById('username').value.trim();
  if (!username) return alert("Please enter a GitHub username");

  try {
    // Profile data
    const res = await fetch(`/api/github/${username}`);
    if (!res.ok) throw new Error("User not found");
    const data = await res.json();

    // Display Profile
    document.getElementById('profile').innerHTML = `
      <h2>${data.name || data.login}</h2>
      <img src="${data.avatar_url}" width="100"><br>
      <p><strong>Followers:</strong> ${data.followers}</p>
      <p><strong>Following:</strong> ${data.following}</p>
      <p><strong>Public Repos:</strong> ${data.public_repos}</p>
      <p><a href="${data.html_url}" target="_blank">Visit GitHub</a></p>
    `;

    // Repositories
    const reposRes = await fetch(`/api/github/${username}/repos`);
    const repos = await reposRes.json();
    document.getElementById('repos').innerHTML = `
      <h2>Repositories</h2>
      <ul>
        ${repos.map(repo => `<li><a href="${repo.html_url}" target="_blank">${repo.name}</a></li>`).join('')}
      </ul>
    `;

    // Starred Repositories
    const starredRes = await fetch(`/api/github/${username}/starred`);
    const starred = await starredRes.json();
    document.getElementById('starred').innerHTML = `
      <h2>Starred Repos</h2>
      <ul>
        ${starred.map(repo => `<li><a href="${repo.html_url}" target="_blank">${repo.full_name}</a></li>`).join('')}
      </ul>
    `;
  } catch (err) {
    alert("Error: " + err.message);
    document.getElementById('profile').innerHTML = "";
    document.getElementById('repos').innerHTML = "";
    document.getElementById('starred').innerHTML = "";
  }
}
