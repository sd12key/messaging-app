const webSocket = new WebSocket("ws://localhost:3000/ws");
const notificationElement = document.getElementById("notifications-container");

webSocket.addEventListener("message", (event) => {
    const eventData = JSON.parse(event.data);

});

/**
 * Handles updating the chat when a new notification is receieved
 * 
 * This function isn't necessary and should be deleted if unused. But it's left as a hint to how you might want 
 * to handle new notifications arriving
 * 
 * @param {string} username The username of the user who sent the notification
 * @param {string} timestamp When the notification was sent
 * @param {string} message The notification that was sent
 */
function onNewNotificationReceieved(username, timestamp, message) {
    
}
