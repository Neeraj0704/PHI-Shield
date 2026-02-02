// Get form + inputs
const loginForm = document.getElementById("login-form");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const complianceBtn = document.querySelector(".compliance-btn");
if (!loginForm || !usernameInput || !passwordInput) {
    console.error("Login form elements missing from DOM.");
}
else {
    loginForm.addEventListener("submit", (event) => {
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
        let redirectUrl;
        if (username === "doctorJane@doctor.com") {
            redirectUrl = "pages/chatbot.html";
        }
        else if (username === "complianceDave@compliance.com") {
            redirectUrl = "pages/compliance.html";
        }
        else {
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
complianceBtn === null || complianceBtn === void 0 ? void 0 : complianceBtn.addEventListener("click", (e) => {
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
export {};
//# sourceMappingURL=main.js.map