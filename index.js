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
                // Assuming video ID length of 11
                if (inp.length >= 11) {
                    const linkedMarker = inp.indexOf("lc=");
                    let videoMarker;
                    if (inp.indexOf("v=") >= 0) {
                        // https://www.youtube.com/watch?v=dQw4w9WgXcQ
                        // https://www.youtube.com/watch?v=dQw4w9WgXcQ&foo=bar
                        videoMarker = inp.indexOf("v=") + 2;
                    } else if (inp.indexOf("youtu.be/") >= 0) {
                        // https://youtu.be/dQw4w9WgXcQ
                        videoMarker = inp.indexOf("youtu.be/") + 9;
                    } else if (inp.indexOf("shorts/") >= 0) {
                        // https://www.youtube.com/shorts/0T36jqxQcgQ
                        // https://www.youtube.com/shorts/0T36jqxQcgQ&foo=bar
                        videoMarker = inp.indexOf("shorts/") + 7;
                    } else {
                        // Take last 11 characters
                        videoMarker = inp.length - 11;
                    }
                    const idString = inp.substring(videoMarker, videoMarker + 11);

                    if (linkedMarker > -1) {
                        const linkedId = inp.substring(linkedMarker + 3);
                        let linkedParentId;
                        if (linkedId.indexOf(".") > -1) {
                            // Linked a reply
                            const dot = linkedId.indexOf(".");
                            linkedParentId = linkedId.substring(0, dot);
                            videoInstance.fetchLinkedComment(idString, linkedParentId, linkedId);
                        } else {
                            // Linked a parent comment
                            linkedParentId = linkedId;
                            videoInstance.fetchLinkedComment(idString, linkedParentId);
                        }
                    } else {
                        videoInstance.fetchTitle(idString);
                    }

                    return true;
                } else {
                    return false;
                }
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
