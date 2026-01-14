let socket;
let oldest_timestamp = null;
let first_load = true;
console.log("Page loaded — first_load initialized as:", first_load);
console.log("Page loaded — oldest_timestamp initialized as:", oldest_timestamp);

const ERROR_MESSAGE_CONTENT_INVALID =
  "Message contains invalid characters or exceeds 499 chars.";
const ERROR_MESSAGE_CONTENT_EMPTY = "Message cannot be empty.";
const MESSAGE_REGEX = /^[\s\S]{1,499}$/;

// clear form function
function clearMessageForm() {
  document.getElementById("message_content").value = "";
}

function show_admin_error(message) {
  const errorBox = document.getElementById("admin_error_message");
  errorBox.textContent = message;
  errorBox.style.display = "block";
  errorBox.classList.add("fade_out");

  errorBox.addEventListener(
    "animationend",
    () => {
      errorBox.style.display = "none";
      errorBox.classList.remove("fade_out");
    },
    { once: true }
  );
}

function insert_message(data) {
  const container = document.getElementById("messages_container");
  if (!container) return;

  container.insertBefore(
    create_message_block(data, false),
    container.firstChild
  );
}

function update_online_user_list(users) {
  const block = document.querySelector(".online_user_block");
  if (!block) return;

  // Clear all but the <h3>
  [...block.children].forEach((child, index) => {
    if (index > 0) child.remove();
  });

  users.forEach((user) => {
    user_role = user.role.toUpperCase();
    console.log("User:", user);
    const role_class = user.role === "admin" ? "admin_role" : "user_role";
    const div = document.createElement("div");
    div.classList.add("online_user_entry");
    // if (user.count === 0) {
    //   div.classList.add("offline_username");
    // }
    // <div class="online_user_sessions">SS:${user.session_count}</div>
    div.innerHTML = `
      <div class="online_user_status">
        <div class="online_user_role ${role_class}">${user_role}</div>
        <div class="online_user_ws">WS:${user.count}</div>
      </div>
      <div class="online_username">${user.username}</div>
    `;
    block.appendChild(div);
  });
}

// update the oldest timestamp based on the last message in the container
// this is used to load older messages
function update_oldest_timestamp() {
  const messages = document.querySelectorAll(".message_block");
  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    oldest_timestamp = last.dataset.timestamp;
  }
  console.log("Oldest timestamp updated:", oldest_timestamp);
}

// handle notification form submission via adding listener to the form
window.addEventListener("DOMContentLoaded", () => {
  const ws_protocol =
    window.location.protocol === "https:" ? "wss://" : "ws://";
  socket = new WebSocket(ws_protocol + window.location.host + "/ws");

  // listen to socket messages from the server
  socket.onmessage = function (event) {
    const data = JSON.parse(event.data);
    if (data.type === "notification") {
      insert_message(data);
      update_oldest_timestamp();
    }
    if (data.type === "users") {
      update_online_user_list(data.users);
    }
  };

  // some basic error handling
  socket.onerror = function (err) {
    console.error("WebSocket error:", err);
  };

  //try page reload if socked lost
  socket.onclose = function () {
    console.warn("WebSocket closed. Trying to reconnect in 3s...");
    setTimeout(() => {
      window.location.reload();
    }, 3000);
  };

  // the form to submit notifications has #id message_form
  const form = document.getElementById("message_form");

  form?.addEventListener("submit", async (event) => {
    // prevent default form submission behavior, do not reload page
    event.preventDefault();

    const textarea = document.getElementById("message_content");
    const content = textarea.value.trim();

    // message validation
    if (!content) {
      show_admin_error(ERROR_MESSAGE_CONTENT_EMPTY);
      return;
    }
    if (!MESSAGE_REGEX.test(content)) {
      show_admin_error(ERROR_MESSAGE_CONTENT_INVALID);
      return;
    }

    try {
      // send the notification to the server via fetch api
      const response = await window.fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      // clear the textarea after sending the notification
      if (response.ok) {
        textarea.value = "";
      } else {
        const error = await response.text();
        show_admin_error(error);
      }
    } catch (err) {
      console.error("Failed to send notification:", err);
      show_admin_error("Unable to broadcast message. Please try again later.");
    }
  });

  // handle the "load older" button click event
  document
    .getElementById("load_older_btn")
    ?.addEventListener("click", async () => {
      const url = oldest_timestamp
        ? "/api/notifications?before=" + encodeURIComponent(oldest_timestamp)
        : "/api/notifications";

      console.log("first load", first_load);
      console.log("Loading older messages from:", url);

      const response = await fetch(url);
      if (response.status === 401) {
        const error = await response.text();
        show_admin_error(error);
        return;
      }

      const older = await response.json();

      older.reverse();

      if (first_load && older.length > 0) {
        console.log("first - load -> oldest timestamp", oldest_timestamp);
        if (oldest_timestamp != null) {
          console.log("First load, removing the first message.");
          older.shift();
        }
        first_load = false;
      }

      if (older.length === 0) {
        console.log("No more messages. Disabling button.");
        const load_messages_button = document.getElementById("load_older_btn");
        load_messages_button.disabled = true;
        load_messages_button.textContent = "No more messages";
        // document.getElementById("load_older_btn").style.display = "none";
        return;
      }

      const container = document.getElementById("messages_container");
      if (!container) return;

      older.forEach((data) => {
        container.appendChild(create_message_block(data, true));
      });

      update_oldest_timestamp();
    });
});

// function to create a message block element with the given data
function create_message_block(data, old = false) {
  const div = document.createElement("div");
  div.classList.add("message_block");
  if (old) {
    div.classList.add("old");
  }

  div.dataset.timestamp = data.timestamp || data.sent_at;

  const date_time = new Date(data.timestamp || data.sent_at);
  const date_string = date_time.toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const time_string = date_time.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  div.innerHTML = `
    <div class="message_header">
      <div class="message_header_left">
        <span class="username_body">${data.username}</span>
      </div>
      <div class="message_header_right">
        <span class="message_date">${date_string}</span>
        <span class="message_time">${time_string}</span>
      </div>
    </div>
    <p class="message_body">${data.content}</p>
  `;

  return div;
}
