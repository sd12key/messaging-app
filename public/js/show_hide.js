// show/hide button click handler
document
  .getElementById("show_hide_pwd")
  ?.addEventListener("click", function () {
    const password_input = document.getElementById("password");
    const reenter_password_input = document.getElementById("reenter_password");
    const toggle_button = document.getElementById("show_hide_pwd");

    // toggle the main password field (if it exists)
    if (password_input) {
      if (password_input.type === "password") {
        password_input.type = "text";
        toggle_button.textContent = "Hide";
      } else {
        password_input.type = "password";
        toggle_button.textContent = "Show";
      }

      // toggle reenter password field (if it exists)
      if (reenter_password_input) {
        // same as the main password field
        reenter_password_input.type = password_input.type;
      }
    }
  });

document.addEventListener("DOMContentLoaded", () => {
  // Your existing error message handling
  const errorMessage = document.getElementById("auth_error_message");
  if (errorMessage) {
    errorMessage.addEventListener("animationend", () => {
      errorMessage.style.display = "none";
    });
  }
});

// disable login or signup button after the form is submitted
// trying to prevent double-posting
document.getElementById("auth_form").addEventListener("submit", function () {
  document.getElementById("submit_button").disabled = true;
});
