(() => {
  const PROFILE_STORAGE_KEY = "arcade_profile_v1";
  const form = document.getElementById("profileForm");
  const usernameInput = document.getElementById("profileUsername");
  const emailInput = document.getElementById("profileEmail");
  const avatarInput = document.getElementById("profileAvatar");
  const bioInput = document.getElementById("profileBio");

  const savedLabel = document.getElementById("profileSaved");
  const message = document.getElementById("profileMessage");

  const avatarPreview = document.getElementById("avatarPreview");
  const previewName = document.getElementById("previewName");
  const previewEmail = document.getElementById("previewEmail");
  const previewBio = document.getElementById("previewBio");

  const fallbackAvatar =
    "data:image/svg+xml;utf8," +
    encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="100%" height="100%" fill="#191919"/><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" fill="#bdbdbd" font-family="Arial" font-size="18">No Avatar</text></svg>');

  function applyPreview() {
    const name = usernameInput.value.trim() || "Your Name";
    const email = emailInput.value.trim() || "email@example.com";
    const bio = bioInput.value.trim() || "No bio yet.";
    const avatar = avatarInput.value.trim();

    previewName.textContent = name;
    previewEmail.textContent = email;
    previewBio.textContent = bio;
    avatarPreview.src = avatar || fallbackAvatar;
  }

  function loadLocalProfile() {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return;

    try {
      const profile = JSON.parse(raw);
      usernameInput.value = profile.username || "";
      emailInput.value = profile.email || "";
      avatarInput.value = profile.avatar_url || "";
      bioInput.value = profile.bio || "";
    } catch {
      // Ignore invalid profile data and keep defaults.
    }

    applyPreview();
  }

  [usernameInput, emailInput, avatarInput, bioInput].forEach((el) => {
    el.addEventListener("input", applyPreview);
  });

  avatarPreview.addEventListener("error", () => {
    avatarPreview.src = fallbackAvatar;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    message.textContent = "";
    savedLabel.textContent = "";

    const payload = {
      username: usernameInput.value.trim(),
      email: emailInput.value.trim(),
      avatar_url: avatarInput.value.trim(),
      bio: bioInput.value.trim()
    };

    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(payload));

    savedLabel.textContent = "Saved";
    message.textContent = "Profile saved locally in this browser.";
    applyPreview();
  });

  loadLocalProfile();
})();
