const YouTubeAPI = require('./src/gapi');
const Video = require('./src/video');
const express = require('express');
const application = express();
const http = require('http').createServer(application);
const io = require('socket.io')(http);

class App {
    constructor() {
        application.use(express.static("src/public"));
        this.ytapi = new YouTubeAPI();
        this.createServer();
        this.listen();
    }

    createServer() {
        io.on('connection', socket => {
            console.log('a user connected');
            this._video = new Video(this, socket);
            
            socket.on('disconnect', () => {
                console.log('user disconnected');
            });
            socket.on('idSent', id => {
                if (!this.checkSendID(id)) socket.emit("idInvalid");
            });
            socket.on("requestAll", () => {
                this._video.handleLoad("dateOldest");
            })
            socket.on("showMore", () => {
                this._video.sendLoadedComments();
            });
            socket.on("sortRequest", type => {
                this._video.doSort(type);
            });
            socket.on("replyRequest", id => {
                this._video.getReplies(id);
            });
            socket.on("graphRequest", () => {
                this._video.makeGraph();
            });
        });
    }
    
    checkSendID(inp) {
        // Assuming video ID length of 11
        if (inp.length >= 11) {
            let marker = inp.indexOf("v=");
            let idString = "";
            if (marker > -1 && inp.length >= marker + 2 + 11) {
                // Normal "watch?v=" link
                idString = inp.substring(marker + 2, marker + 2 + 11);
            }
            else {
                // youtu.be or ID only
                idString = inp.substring(inp.length - 11);
            }
            
            let linked = inp.indexOf("lc=");
            if (linked > -1) {
                let linkedId = inp.substring(linked + 3);
                let linkedParentId;
                if (linkedId.indexOf(".") > -1) {
                    // Linked a reply
                    let dot = linkedId.indexOf(".");
                    linkedParentId = linkedId.substring(0, dot);
                    this._video.fetchLinkedComment(idString, linkedParentId, linkedId);
                }
                else {
                    // Linked a parent comment
                    linkedParentId = linkedId;
                    this._video.fetchLinkedComment(idString, linkedParentId);
                }
            }
            else {
                this._video.fetchTitle(idString, false);
            }
            
            return true;
        }
        else {
            return false;
        }
    }

    listen() {
        let port = process.env.PORT;
        if (port == null || port == "") {
            port = 8000;
        }
        http.listen(port, function () {
            console.log('listening on', port);
        });
    }

}

const app = new App();