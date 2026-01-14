const webSocket = new WebSocket("ws://localhost:3000/ws");
const notificationElement = document.getElementById("notifications-container");

webSocket.addEventListener("message", (event) => {
    const eventData = JSON.parse(event.data);

});

function onNewNotificationReceieved(username, timestamp, message) {
    
}
