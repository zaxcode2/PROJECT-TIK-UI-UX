(() => {
  const form = document.getElementById("authForm");
  const modeLabel = document.getElementById("modeLabel");
  const submitBtn = document.getElementById("submitBtn");
  const toggleBtn = document.getElementById("toggleModeBtn");
  const usernameWrap = document.getElementById("usernameWrap");
  const usernameInput = document.getElementById("username");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const message = document.getElementById("authMessage");

  let mode = "login";

  function syncMode() {
    const isRegister = mode === "register";
    modeLabel.textContent = isRegister ? "Create Account" : "Welcome Back";
    submitBtn.textContent = isRegister ? "Create Account" : "Sign In";
    toggleBtn.textContent = isRegister ? "Have an account? Sign in" : "New here? Create account";
    usernameWrap.style.display = isRegister ? "block" : "none";
    usernameInput.required = isRegister;
    message.textContent = "";
  }

  toggleBtn.addEventListener("click", () => {
    mode = mode === "login" ? "register" : "login";
    syncMode();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";

    const payload = {
      email: emailInput.value.trim(),
      password: passwordInput.value
    };

    if (mode === "register") {
      payload.username = usernameInput.value.trim();
    }

    try {
      const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
      const data = await window.Auth.api(endpoint, {
        method: "POST",
        body: JSON.stringify(payload)
      });

      window.Auth.setToken(data.token);
      window.location.replace("index.html");
    } catch (error) {
      message.textContent = error.message;
    }
  });

  syncMode();
})();
