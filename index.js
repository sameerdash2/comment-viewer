const YouTubeAPI = require('./src/gapi');
const Video = require('./src/video');
const Database = require('./src/database');
const logger = require('./src/logger');
const express = require('express');
const application = express();
const http = require('http').createServer(application);
const io = require('socket.io')(http);

class App {
    constructor() {
        application.use(express.static('dist', {
            extensions: ['html']
        }));
        this.ytapi = new YouTubeAPI();
        this.createServer();
        this.database = new Database();
        this.listen();
    }

    createServer() {
        io.on('connection', (socket) => {
            const videoInstance = new Video(this, io, socket);
            let throttled = false;
            const throttleMs = 500;
            let unThrottleTimestamp = 0;
            let queueTimeout = undefined;

            socket.on("idSent", (inputId) => {
                if (!checkSendID(inputId.substring(0, 255))) socket.emit("idInvalid");
            });
            socket.on("requestAll", () => {
                videoInstance.handleLoad("dateOldest");
            });

            socket.on("showMore", requestSendComments);
            function requestSendComments({ sort, commentNum, pageSize, minDate, maxDate }) {
                if (throttled) {
                    clearTimeout(queueTimeout);
                    queueTimeout = setTimeout(() => requestSendComments({ sort, commentNum, pageSize, minDate, maxDate }),
                        unThrottleTimestamp - Date.now());
                }
                else {
                    throttled = true;

                    pageSize = Number(pageSize);
                    // Stop client from doing funny stuff
                    if (isNaN(pageSize) || pageSize > 500) {
                        pageSize = 25;
                    }

                    sendComments({ sort, commentNum, pageSize, minDate, maxDate });
                    setTimeout(() => throttled = false, throttleMs);
                    unThrottleTimestamp = Date.now() + throttleMs + 20;
                }
            }
            function sendComments({ sort, commentNum, pageSize, minDate, maxDate }) {
                videoInstance.requestLoadedComments(sort, commentNum, pageSize, false, minDate, maxDate);
            }

            socket.on("replyRequest", (id) => {
                videoInstance.getReplies(id);
            });
            socket.on("graphRequest", () => {
                videoInstance.requestStatistics();
            });

            function checkSendID(inp) {
                // Assuming video IDs are strings in base64 with 11 chars.
                // Match the 11 characters after one of {"v=", "youtu.be/", "shorts/", "live/"}.
                // If none of those are found, fall back to last 11 chars.
                const videoIdPattern = /(?:v=|youtu\.be\/|shorts\/|live\/)([\w-]{11})/;
                const match = videoIdPattern.exec(inp) ?? /([\w-]{11})$/.exec(inp);
                if (match === null) {
                    return false;
                }
                const videoId = match[1];

                // Check if user entered a linked comment. These can have periods
                const linkedIdPattern = /lc=([\w.-]+)/;
                const linkedMatch = linkedIdPattern.exec(inp);
                if (linkedMatch !== null) {
                    const linkedId = linkedMatch[1];
                    // Check if this linked ID indicates a reply: look for the dot.
                    // If so, pull out the parent ID separately
                    const dotIndex = linkedId.indexOf(".");
                    if (dotIndex !== -1) {
                        // Linked a reply
                        const linkedParentId = linkedId.substring(0, dotIndex);
                        videoInstance.fetchLinkedComment(videoId, linkedParentId, linkedId);
                    } else {
                        // Linked a parent comment
                        videoInstance.fetchLinkedComment(videoId, linkedId);
                    }
                } else {
                    // Fetch video info
                    videoInstance.fetchTitle(videoId);
                }

                return true;
            }
        });
    }

    listen() {
        const port = process.env.PORT || 8000;
        http.listen(port, () => {
            logger.log('info', 'Listening on %s', port);
        });
    }
}

// eslint-disable-next-line no-unused-vars
const app = new App();
