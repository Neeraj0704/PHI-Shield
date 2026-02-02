// -------------------------------
// Types
// -------------------------------
type LoginResult = {
  success: boolean;
  message: string;
};

// Get form + inputs
const loginForm = document.getElementById("login-form") as HTMLFormElement | null;
const usernameInput = document.getElementById("username") as HTMLInputElement | null;
const passwordInput = document.getElementById("password") as HTMLInputElement | null;
const complianceBtn = document.querySelector(".compliance-btn") as HTMLAnchorElement;

if (!loginForm || !usernameInput || !passwordInput) {
  console.error("Login form elements missing from DOM.");
} else {

  loginForm.addEventListener("submit", (event: SubmitEvent) => {
    event.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    // ──────────────────────────────
    // Simple validation
    // ──────────────────────────────
    if (!username || !password) {
      alert("Please enter both username and password.");
      return;
    }

    // ──────────────────────────────
    // Validate credentials
    // ──────────────────────────────
    if (password !== "123") {
      alert("Invalid password. Password should be 123.");
      return;
    }

    // ──────────────────────────────
    // Route based on username
    // ──────────────────────────────
    let redirectUrl: string;
    
    if (username === "doctorJane@doctor.com") {
      redirectUrl = "pages/chatbot.html";
    } else if (username === "complianceDave@compliance.com") {
      redirectUrl = "pages/compliance.html";
    } else {
      alert("Invalid username. Use doctorJane@doctor.com or complianceDave@compliance.com");
      return;
    }

    // ──────────────────────────────
    // MOCK login success
    // ──────────────────────────────
    const mockSession = {
      username,
      loggedIn: true,
      timestamp: Date.now(),
    };

    // store session in localStorage
    localStorage.setItem("mockSession", JSON.stringify(mockSession));

    // Redirect user based on username
    window.location.href = redirectUrl;
  });
}

// Handle compliance tools button click
complianceBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  
  // Set a mock session for quick access
  const mockSession = {
    username: "guest",
    loggedIn: true,
    timestamp: Date.now(),
  };
  
  localStorage.setItem("mockSession", JSON.stringify(mockSession));
  
  // Redirect to compliance dashboard
  window.location.href = "pages/compliance.html";
});
