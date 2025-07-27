async function getProfile() {
  const username = document.getElementById('username').value;
  const result = document.getElementById('result');
  result.innerHTML = 'Loading...';

  try {
    const res = await fetch(`/api/github/${username}`);
    const data = await res.json();

    if (data.error) {
      result.innerHTML = `<p>${data.error}</p>`;
    } else {
      result.innerHTML = `
        <img src="${data.avatar_url}" alt="Avatar" />
        <h2>${data.name || data.login}</h2>
        <p>${data.bio || "No bio available"}</p>
        <p><strong>Repos:</strong> ${data.public_repos}</p>
        <a href="${data.html_url}" target="_blank">View Profile</a>
      `;
    }
  } catch (err) {
    result.innerHTML = `<p>Error: ${err.message}</p>`;
  }
}
