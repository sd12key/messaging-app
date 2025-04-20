[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/6w1kflNr)
# Real-Time Notification App

This is the starting point for the **Final Sprint - Solo Project**. In this project, you will build a real-time notification application using **Express**, **MongoDB**, **EJS templates**, and **WebSockets**.

> **Note:** This final project counts toward **both** your Databases and Fullstack courses. You will submit it once, and the grade will be applied to both courses.

For complete project instructions, requirements, and grading details, refer to the [assignment sheet](https://menglishca.github.io/keyin-course-notes/fullstack/sprints/final-solo/).

## Setup Instructions
1. Accept the GitHub Classroom Assignment
2. Once your repository is created, **clone your new repo** to your local machine:  
    ```bash
    git clone <your-new-repo-url>
    ```  
3. Navigate into the project directory and install the necessary dependencies:  
    ```bash
    cd <your-new-repo-name>
    npm install
    ```  
4. Run the app:
    ```bash
    npm start
    ```  
    This will start the server at `http://localhost:3000/`.  

5. You can now begin development:
   ```bash
   git add .
   git commit -m "Start final sprint individual project"
   git push origin main
   ```

## Development Guidelines

1. **Authentication and Authorization**:
   - Users must be able to register and log in securely.
   - Passwords must be hashed using `bcrypt`.
   - Only authenticated users can access the dashboard and receive notifications.
   - Sessions must persist while logged in and be cleared on logout.

2. **Real-Time Notifications**:
   - Use WebSockets (`express-ws`) to deliver real-time notifications.
   - Notifications should be sent from a simple admin panel to all logged-in users.
   - Notifications must include:
     - Message content
     - Timestamp
     - Sender's username
   - Notifications must be saved to a MongoDB collection when delivered.

3. **Dashboard and Admin Panel**:
   - Logged-in users see a live-updating dashboard of incoming notifications.
   - An admin interface must allow an administrator to send new notifications.

4. **MongoDB Integration**:
   - Use MongoDB to store user accounts and all delivered notifications.
   - In-memory storage is can be used for any other data storage such as temporary session or socket tracking.

5. **EJS Templates**:
   - All pages must use EJS for rendering.
   - A shared header partial should include navigation (logout, dashboard, admin panel if applicable).

## Submission Guidelines
- Submit a link to your **GitHub Classroom repository** via Teams.
- Ensure the app runs correctly with `npm start`.
- All required features must be implemented as described in the [assignment sheet](https://menglishca.github.io/keyin-course-notes/fullstack/sprints/final-solo/).

## Notes & Support
- Class and code examples can be found [in the code samples repo](https://github.com/menglishca/keyin-code-samples).
- Ask questions on Teams or email if you need clarification.
- Support is available during lectures and TA hours.
