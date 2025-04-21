require("dotenv").config();
const express = require("express");
const session = require("express-session");
const expressWs = require("express-ws");
const path = require("path");
const bcrypt = require("bcrypt");
const axios = require("axios");
const cron = require("node-cron");

const SALT_ROUNDS = 10;

const app = express();
const app_ws = expressWs(app);
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: "my_secret_key",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// app constants
const ERROR_MESSAGE_AUTH = "Invalid credentials. Please try again.";
const ERROR_MESSAGE_SIGNUP_EMPTY =
  "Username or password cannot be empty. Please check your input.";
const ERROR_MESSAGE_SIGNUP_USERNAME_EXISTS =
  "Username is already in use. Please try again.";
const ERROR_MESSAGE_SIGNUP_INVALID_USERNAME =
  "Username can only contain letters, numbers, underscores, hyphens, and periods.";
const ERROR_MESSAGE_PASSWORD_NOT_SECURE =
  "Password does not meet minimum requirements: at least 8 characters, including 1 uppercase letter, 1 lowercase letter, 1 digit, no spaces, also it can contain the following special characters: @#$%^&*()-_=+{};:,<.>";
const ERROR_MESSAGE_PASSWORDS_NOT_MATCH =
  "Passwords do not match. Please try again.";
const ERROR_MESSAGE_AUTH_SESSION =
  "Unathorized access: session expired. Please, log in again.";
const ERROR_MESSAGE_LOGOUT_SESSION = "Failed to log out.";
const ERROR_DB_GENERAL = "Database error. Please try again later.";
const ERROR_MESSAGE_CONTENT_INVALID =
  "Message contains invalid characters or exceeds 499 characters.";
const ERROR_MESSAGE_CONTENT_EMPTY = "Message cannot be empty.";
const ROLES = {
  ADMIN: "admin",
  USER: "user",
};
const STATUSES = {
  ACTIVE: "active",
  BANNED: "banned",
  DELETED: "deleted",
};

const USERNAME_REGEX = /^[a-zA-Z0-9_\-.]+$/;
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d!@#$%^&*()\-_=+{};:,<.>]{8,}$/;
const MESSAGE_REGEX = /^[\s\S]{1,499}$/;

// mongodb definitions start
const MONGO_PORT = 27017;
const mongoose = require("mongoose");
const MID = "_id";
// const MONGO_DB_NAME = "notify_app";
// const MONGO_URI = `mongodb://localhost:${MONGO_PORT}/${MONGO_DB_NAME}`;
const MONGO_URI = process.env.MONGO_URI;
// console.log(MONGO_URI);

const USER_DB_MODEL_NAME = "user";
const USER_DB_SCHEMA = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: USERNAME_REGEX,
      index: true,
    },
    password_hash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: [ROLES.ADMIN, ROLES.USER],
      default: ROLES.USER,
      trim: true,
    },
    join_date: {
      type: Date,
      default: Date.now,
    },
  },
  {
    strict: true,
    versionKey: false,
    timestamps: {
      createdAt: false,
      updatedAt: false,
    },
  }
);

const NOTIFICATION_DB_MODEL_NAME = "notification";
const NOTIFICATION_DB_SCHEMA = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
      index: true,
    },
    // technically not needed, but this will serve as a snapshot
    // of the username, if original user is deleted
    username: {
      type: String,
      required: true,
      trim: true,
      match: USERNAME_REGEX,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 500,
    },
    sent_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    strict: true,
    versionKey: false,
    timestamps: {
      createdAt: false,
      updatedAt: false,
    },
  }
);

// creating models
const user = mongoose.model(USER_DB_MODEL_NAME, USER_DB_SCHEMA);
const notification = mongoose.model(
  NOTIFICATION_DB_MODEL_NAME,
  NOTIFICATION_DB_SCHEMA
);

// self-ping every 5 minutes (adjust as needed)
cron.schedule("*/5 * * * *", () => {
  console.log("Pinging self to stay awake...");
  axios
    .get("https://messaging-app-ezjt.onrender.com/")
    .then(() => console.log("Ping successful!"))
    .catch((err) => console.error("Ping failed:", err.message));
});

// logged in user (using session)
let logged_in_users = [];

// map of online users (using websockets)
const online_users = new Map();

// helper method to find user by username, including password hash
// this is needed for login, password_hash is not returned by default
// since in mongodb schema it is set to "select: false"
async function find_user(username) {
  return await user.findOne({ username }).select("+password_hash");
}

// helpr method to create a new user
async function add_user(username, password, role = ROLES.USER) {
  const password_hash = bcrypt.hashSync(password, SALT_ROUNDS);
  const new_user = await user.create({
    username,
    password_hash,
    role,
    join_date: new Date(),
  });

  const return_user = new_user.toObject();
  delete return_user.password_hash;
  return return_user;
}

// active session counter, unfortunately this is not working
// well when session is not destroyed properly
// or when remote comp crashed or rebooted
// so I removed session counter from the dashboard
function get_session_count_for_user(user_id) {
  return logged_in_users.filter((u) => u.id === user_id).length;
}

// GET / - Render index page or redirect to dashboard if logged in
app.get("/", (request, response) => {
  if (request.session.user) {
    return response.redirect("/dashboard");
  }
  response.render("index");
});

// GET /login - Render login form
app.get("/login", (request, response) => {
  // is session open? redirect to dashboard
  if (request.session.user) {
    return response.redirect("/dashboard");
  }
  response.render("login");
});

// POST /login - Allows a user to login
// I do not like the idea of sending error message through the URL
// prefer to render the page with the error message
app.post("/login", async (request, response) => {
  const { username, password } = request.body;

  // trimming is not actually needed here (but do it anyway)
  const normalized_username = username?.trim();
  const normalized_password = password?.trim();

  // basic validation - fields cannot be empty
  if (!normalized_username || !normalized_password) {
    return response.status(400).render("login", {
      auth_error: ERROR_MESSAGE_SIGNUP_EMPTY,
      username_value: normalized_username,
    });
  }

  try {
    // fetch from db
    const user_record = await find_user(normalized_username);

    // if user not found, return error
    if (!user_record) {
      console.log(`Login failed: User '${normalized_username}' not found`);
      return response.status(400).render("login", {
        auth_error: ERROR_MESSAGE_AUTH,
        username_value: normalized_username,
      });
    }

    // if password is not valid, return error
    const is_password_valid = bcrypt.compareSync(
      normalized_password,
      user_record.password_hash
    );
    if (!is_password_valid) {
      console.log(
        `Login failed: Incorrect password for '${normalized_username}'`
      );
      return response.status(400).render("login", {
        auth_error: ERROR_MESSAGE_AUTH,
        username_value: normalized_username,
      });
    }

    // open session
    request.session.user = {
      id: user_record[`${MID}`].toString(),
      username: user_record.username,
      role: user_record.role,
    };

    console.log(`User '${user_record.username}' logged in successfully`);

    // add logged in user to the list
    // this way I count sessions for each user, too
    // not only websockets
    logged_in_users.push({
      id: user_record[`${MID}`].toString(),
      username: user_record.username,
      role: user_record.role,
      session_id: request.session.id,
    });

    // console.log(logged_in_users);

    return response.redirect("/dashboard");
  } catch (error) {
    console.error("Login error:", error);
    return response.status(500).render("login", {
      auth_error: ERROR_DB_GENERAL,
      username_value: normalized_username,
    });
  }
});

// GET /signup - Render signup form
app.get("/signup", (request, response) => {
  // is session open? redirect to dashboard
  if (request.session.user) {
    return response.redirect("/dashboard");
  }
  response.render("signup");
});

// POST /signup - handle registration, if successfull redirect to dashboard
// I do not like the idea of sending error message through the URL
// prefer to render the page with the error message
app.post("/signup", async (request, response) => {
  const { username, password, reenter_password, is_admin } = request.body;

  // input sanitization
  const normalized_username = username?.trim();
  const trimmed_password = password?.trim();
  const trimmed_reenter_password = reenter_password?.trim();
  const user_role = is_admin === "on" ? ROLES.ADMIN : ROLES.USER;

  // username validation checks
  if (!normalized_username || !USERNAME_REGEX.test(normalized_username)) {
    return response.status(400).render("signup", {
      auth_error: ERROR_MESSAGE_SIGNUP_INVALID_USERNAME,
      username_value: normalized_username,
      is_admin,
    });
  }

  // password match check
  if (trimmed_password !== trimmed_reenter_password) {
    return response.status(400).render("signup", {
      auth_error: ERROR_MESSAGE_PASSWORDS_NOT_MATCH,
      username_value: normalized_username,
      is_admin,
    });
  }

  // password regex validation
  if (!PASSWORD_REGEX.test(trimmed_password)) {
    return response.status(400).render("signup", {
      auth_error: ERROR_MESSAGE_PASSWORD_NOT_SECURE,
      username_value: normalized_username,
      is_admin,
    });
  }

  try {
    // check if username already exists in database
    const existing_user = await user.findOne({ username: normalized_username });
    if (existing_user) {
      return response.status(400).render("signup", {
        auth_error: ERROR_MESSAGE_SIGNUP_USERNAME_EXISTS,
        username_value: normalized_username,
        is_admin,
      });
    }

    // username is unique, proceed to create a new user
    const new_user = await add_user(
      normalized_username,
      trimmed_password,
      user_role
    );

    // auto-login the user after successful signup, open session
    request.session.user = {
      id: new_user[`${MID}`].toString(),
      username: new_user.username,
      role: new_user.role,
    };

    // add to logged_in_users array
    logged_in_users.push({
      id: new_user[`${MID}`].toString(),
      username: new_user.username,
      role: new_user.role,
      session_id: request.session.id,
    });

    console.log(
      `User ${new_user.username} signed up and logged in successfully`
    );
    return response.redirect("/dashboard");
  } catch (error) {
    console.error("Signup error:", error);
    return response.status(500).render("signup", {
      auth_error: ERROR_DB_GENERAL,
      username_value: normalized_username,
      is_admin,
    });
  }
});

// GET /dashboard - render dashboard page
app.get("/dashboard", (request, response) => {
  // console.log(request.session);
  const session_user = request.session.user;

  // if no session, redirect to login
  if (!session_user) {
    console.error(ERROR_MESSAGE_AUTH_SESSION);
    return response.status(401).redirect("/");
  }

  const logged_user = logged_in_users.find(
    (user) => user.id === session_user.id
  );

  // console.log("Logged users array", logged_in_users);
  // console.log("logged user", logged_user);

  return response.render("dashboard", {
    user: logged_user,
    users: logged_user.role === ROLES.ADMIN ? logged_in_users : [],
  });
});

// GET /logout - redirect to dashboard page
app.get("/logout", (request, response) => {
  if (request.session.user) {
    return response.redirect("/dashboard");
  }
  return response.redirect("/");
});

// POST /logout - log out user
app.post("/logout", (request, response) => {
  // remove user from logged_in_users array by filtering
  logged_in_users = logged_in_users.filter(
    (user) => user.session_id !== request.session.id
  );

  // close all websocket connections for this user
  // and remove the user from the online_users map
  // if disable this - interesting to watch messages still come in even after logout
  for (const [user_id, user_entry] of online_users.entries()) {
    if (user_id === request.session.user.id) {
      for (const ws of user_entry.sockets) {
        ws.close();
      }
      online_users.delete(user_id);
    }
  }

  // broadcast the logout to all admins
  broadcast_online_users_to_admins();

  request.session.destroy((error) => {
    if (error) {
      console.error(ERROR_MESSAGE_LOGOUT_SESSION);
      return response.status(500).send(ERROR_MESSAGE_LOGOUT_SESSION);
    }
    console.log("Logged out successfully");
    return response.redirect("/");
  });
});

app.get("/api/notifications", async (req, res) => {
  const { before } = req.query;
  console.log("GET /api/notifications before:", req.query.before);

  if (!req.session.user)
    return res.status(401).send(ERROR_MESSAGE_AUTH_SESSION);

  try {
    const query = before ? { sent_at: { $lt: new Date(before) } } : {};

    const older = await notification
      .find(query)
      .sort({ sent_at: -1 })
      .limit(10)
      .lean();

    // send oldest first
    res.json(older.reverse());
  } catch (err) {
    console.error("Error loading older messages:", err);
    res.status(500).send("Server error");
  }
});

// POST /api/notifications - handle notification submission
// (admin only, also broadcast to all users)
app.post("/api/notifications", async (req, res) => {
  const session_user = req.session.user;

  if (!session_user) {
    return res.status(401).send(ERROR_MESSAGE_AUTH_SESSION);
  }

  const { content } = req.body;

  // validation
  if (!content || content.trim().length === 0) {
    return res.status(400).send(ERROR_MESSAGE_CONTENT_EMPTY);
  }
  if (!MESSAGE_REGEX.test(content)) {
    return res.status(400).send(ERROR_MESSAGE_CONTENT_INVALID);
  }

  try {
    // save notification to the database
    await notification.create({
      content: content.trim(),
      username: session_user.username,
      user_id: session_user.id,
      sent_at: new Date(),
    });

    // create message object to broadcast
    const message = {
      type: "notification",
      content: content.trim(),
      username: session_user.username,
      role: session_user.role,
      timestamp: new Date().toISOString(),
    };

    // broadcast this message to all online users
    for (const [user_id, user_entry] of online_users) {
      for (const socket of user_entry.sockets) {
        socket.send(JSON.stringify(message));
      }
    }

    res.status(200).send("Notification saved");
  } catch (err) {
    console.error("Failed to save notification:", err);
    res.status(500).send(ERROR_DB_GENERAL);
  }
});

// websocket handler taking into account sessions as well
// I want to track all online users
// and how many websockets per user
app.ws("/ws", function (ws, req) {
  const session = req.session;
  if (!session || !session.user) {
    // unauthorized connection
    ws.close();
    return;
  }

  const user_id = session.user.id;
  const username = session.user.username;
  const role = session.user.role;

  // check if this user is already in the map of online users
  // if not, create a new entry
  let user_entry = online_users.get(user_id);
  if (!user_entry) {
    user_entry = {
      username,
      role,
      // this is when websocket is opened (page loaded or refreshed)
      // this is not the same as login time (session opened)
      login_time: Date.now(),
      sockets: new Set(),
    };
    // add the user to the map of online users, user_is the key
    online_users.set(user_id, user_entry);
  }

  // add the new socket to the user's entry
  // this is needed to track how many sockets each user has
  user_entry.sockets.add(ws);
  broadcast_online_users_to_admins();

  // if socket is closed, remove it from the user's entry
  ws.on("close", () => {
    user_entry.sockets.delete(ws);
    if (user_entry.sockets.size === 0) {
      online_users.delete(user_id);
    }
    broadcast_online_users_to_admins();
  });
});

// broadcast online users to all admins
function broadcast_online_users_to_admins() {
  const user_list = Array.from(online_users.entries())
    // sort by username
    .sort(([id1, a], [id2, b]) => a.username.localeCompare(b.username))
    .map(([user_id, u]) => ({
      username: u.username,
      role: u.role,
      count: u.sockets.size,
      session_count: get_session_count_for_user(user_id),
    }));

  for (const [id, u] of online_users) {
    if (u.role === "admin") {
      for (const ws of u.sockets) {
        ws.send(
          JSON.stringify({
            type: "users",
            users: user_list,
          })
        );
      }
    }
  }
}

// generate mock users to initially insert into mongo database (if none exist)
// Helper function to generate random dates between two dates
function random_date(start, end) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

const generate_mock_users = (n_admins, n_users) => {
  const mock_users = [];
  const user_types = [
    {
      prefix: "admin_",
      password: "Admin_123",
      role: ROLES.ADMIN,
      count: n_admins,
      date_range: [new Date(2024, 0, 1), new Date(2024, 1, 28)],
    },
    {
      prefix: "user_",
      password: "User_123",
      role: ROLES.USER,
      count: n_users,
      date_range: [new Date(2024, 0, 1), new Date(2025, 1, 28)],
    },
  ];

  // generating admins and users
  user_types.forEach((type) => {
    for (let i = 1; i <= type.count; i++) {
      mock_users.push({
        username: `${type.prefix}${i}`,
        password_hash: bcrypt.hashSync(type.password, SALT_ROUNDS),
        role: type.role,
        join_date: random_date(...type.date_range),
      });
    }
  });

  return mock_users;
};

// connect to mongodb, populate with mock data (if not exist or empty)
// start REST server
mongoose
  .connect(MONGO_URI)
  .then(async () => {
    // console.log(`MongoDB running on ${MONGO_URI}`);
    console.log("MongoDB connection established successfully");

    // seed logic here
    const user_count = await user.countDocuments();
    if (user_count === 0) {
      console.log("No Users found in the database. Populating...");
      const mock_data = generate_mock_users(3, 7);
      try {
        // this will not insert anything if validation fails
        // in order to inserd only valid ones { ordered: false }
        await user.insertMany(mock_data);
        console.log("User collection was populated successfully");
      } catch (error) {
        console.error("Failed to populate! Check mock data and retry!");
        console.error(error.message);
      }
    } else {
      console.log("User collection exists and not empty.");
    }

    // start the server
    app.listen(PORT, () => {
      console.log(`REST server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => console.error("Error connecting to MongoDB:", err));
