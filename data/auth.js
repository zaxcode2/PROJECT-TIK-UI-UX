(() => {
  const TOKEN_KEY = "arcade_auth_token";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  async function requireAuth() {
    const token = getToken();
    if (!token) {
      window.location.replace("login.html");
      return null;
    }

    try {
      const data = await api("/api/auth/me");
      return data.user;
    } catch {
      clearToken();
      window.location.replace("login.html");
      return null;
    }
  }

  function bindLogout(btnId = "logoutBtn") {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener("click", () => {
      clearToken();
      window.location.replace("login.html");
    });
  }

  window.Auth = {
    api,
    getToken,
    setToken,
    clearToken,
    requireAuth,
    bindLogout
  };
})();
