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
        application.use(express.static("dist"));
        this.ytapi = new YouTubeAPI();
        this.createServer();
        this.database = new Database();
        this.listen();
    }

    createServer() {
        io.on('connection', (socket) => {
            const videoInstance = new Video(this, io, socket);

            socket.on("idSent", (inputId) => {
                if (!checkSendID(inputId.substring(0, 255))) socket.emit("idInvalid");
            });
            socket.on("requestAll", () => {
                videoInstance.handleLoad("dateOldest");
            });
            socket.on("showMore", ({ sort, commentNum }) => {
                videoInstance.sendLoadedComments(sort, commentNum, false);
            });
            socket.on("replyRequest", (id) => {
                videoInstance.getReplies(id);
            });
            socket.on("graphRequest", () => {
                videoInstance.getStatistics();
            });

            function checkSendID(inp) {
                // Assuming video ID length of 11
                if (inp.length >= 11) {
                    const linkedMarker = inp.indexOf("lc=");
                    const videoMarker = Math.max(inp.indexOf("v=") + 2, inp.indexOf("youtu.be/") + 9);
                    let idString = "";

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
                    } else if (inp.length >= videoMarker + 11) {
                        // https://www.youtube.com/watch?v=dQw4w9WgXcQ, https://youtu.be/dQw4w9WgXcQ
                        idString = inp.substring(videoMarker, videoMarker + 11);
                        videoInstance.fetchTitle(idString, false);
                    } else {
                        // dQw4w9WgXcQ (assume)
                        idString = inp.substring(inp.length - 11);
                        videoInstance.fetchTitle(idString, false);
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
