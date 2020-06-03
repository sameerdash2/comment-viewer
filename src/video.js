const config = require('../config.json');
const Utils = require('./utils');

class Video {
    constructor(app, socket) {
        this._app = app;
        this._socket = socket;

        this.reset();
    }

    reset() {
        this._comments = [];
        this._newComments = [];
        this._likedComments = [];
        this._indexedComments = 0; // All retrieved comments + their reply counts
        this._loadedReplies = {};
        // this._fetchUntil = new Date(0).toISOString();
    }

    fetchTitle(idString, forLinked) {
        // forLinked is only to tell the client whether to clear the page,
        // since linked comments may be sent before the video info (may optimize later)
        this._id = idString;
        this._app.ytapi.executeVideo(idString).then(response => {
            if (response.data.pageInfo.totalResults > 0) {
                this.reset();
                this._video = response.data.items[0];
                this._commentCount = this._video.statistics.commentCount;
                this._socket.emit("videoInfo", { video:this._video, forLinked:forLinked });
                this.fetchTestComment();
            }
            else {
                this._socket.emit("idInvalid");
            }
        }, err => {
            console.error("Video execute error", err.response.data.error);
            if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                this._app.ytapi.quotaExceeded();
            }
            else if (err.response.data.error.errors[0].reason == "processingFailure") {
                setTimeout(() => { this.fetchTitle(idString, forLinked) }, 1);
            }
        });
    }

    fetchTestComment() {
        let count = this._video.statistics.commentCount;
        this._app.ytapi.executeTestComment(this._video.id).then(response => {
            this._commentsEnabled = true;
            // for upcoming/live streams, disregard a 0 count.
            if (!(this._video.snippet.liveBroadcastContent != "none" && count == 0)) {
                let beginLoad = count < 200;
                this._graphAvailable = count >= 50 && new Date(this._video.snippet.publishedAt).getTime() <= (new Date().getTime() - 24*60*60*1000);
                this._socket.emit("commentsInfo", { num: count, disabled: false,
                    commence: beginLoad, max: (count > config.maxLoad) ? config.maxLoad : -1, graph: this._graphAvailable });
                if (beginLoad && count > 0) {
                    this.handleLoad("dateOldest");
                }
            }
        }, err => {
            // console.error("Test comment execute error", err.response.data.error);
            if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                this._app.ytapi.quotaExceeded();
            }
            else if (err.response.data.error.errors[0].reason == "processingFailure") {
                setTimeout(() => { this.fetchTestComment() }, 1);
            }
            else if (this._video.snippet.liveBroadcastContent == "none" && err.response.data.error.errors[0].reason == "commentsDisabled") {
                this._commentsEnabled = false;
                this._socket.emit("commentsInfo", {num: count, disabled: true,
                    commence: false, max: (count > config.maxLoad) ? config.maxLoad : -1, graph: false });
            }
        });
    }

    handleLoad(type) {
        if (this._commentsEnabled && this._commentCount < config.maxLoad && type == "dateOldest") {
            this._currentSort = type;
            this._startTime = new Date();
            this._app.database.checkVideo(this._id, (row) => {
                console.log("the row", row);
                if (row) {
                    if (row.inProgress) {
                        // TODO: Handle
                    }
                    else {
                        // TODO: 30-second cooldown
                        // TODO: Determine whether records are too old & re-fetch all comments

                        this.loadFromDatabase(() => {
                            this.fetchAllComments("", true);
                        });
                    }
                }
                else {
                    console.log("new video " + this._id, this._video.snippet.title.substr(0, 20));
                    this._app.database.addVideo(this._id);
                    this.fetchAllComments("", false);
                }
            });
        }
    }

    loadFromDatabase(callback) {
        console.log("loading from database!");
        let y = new Date();
        this._app.database.getComments(this._id, (rows) => {
            let len = rows.length;
            this._indexedComments = len;
            for (let i = 0; i < len; i++) {
                this._comments.push(JSON.parse(rows[i].comment));
                this._indexedComments += this._comments[i].snippet.totalReplyCount;
            }
            console.log("it took", new Date().getTime() - y.getTime(),"ms for parse");

            callback();
        });
    }

    fetchAllComments(pageToken, appending) {
        this._app.ytapi.executeCommentChunk(this._id, pageToken).then( response => {
            // Array.prototype.push.apply(this._newComments, response.data.items);

            let len = response.data.items.length;
            let proceed = true;
            let a = new Date();
            let i;
            for (i = 0; i < len; i++) {
                // If appending to database-stored comments, check if current comment has passed the date
                // of the newest stored comment.
                // Then make sure the current comment is actually stored (for equal timestamps, rare case)
                if (appending && response.data.items[i].snippet.topLevelComment.snippet.publishedAt
                        <= this._comments[0].snippet.topLevelComment.snippet.publishedAt
                        && Utils.commentInArray(this._comments, response.data.items[i])) {
                    proceed = false;
                    break;
                }
                this._newComments.push(response.data.items[i]);
                this._indexedComments += 1 + response.data.items[i].snippet.totalReplyCount;
            }

            // Write new comments to database
            if (i > 0) this._app.database.writeNewComments(this._id, response.data.items.slice(0, i));
            console.log("write took", new Date().getTime() - a.getTime(),"ms");

            // Send load status to client to display percentage
            this._socket.emit("loadStatus", this._indexedComments);

            // If there are more comments, and database-stored comments have not been reached, retrieve the next 100 comments
            if (response.data.nextPageToken && proceed) {
                setTimeout(() => { this.fetchAllComments(response.data.nextPageToken, appending) }, 0);
            }
            else {
                // Finished retrieving all comment threads.
                this._app.database.markVideoComplete(this._id);

                // Add new comments to beginning of database-stored ones
                // (If new video, it adds to the empty array)
                console.log("stored length", this._comments.length,"new length", this._newComments.length);
                Array.prototype.unshift.apply(this._comments, this._newComments);

                let elapsed = new Date().getTime() - this._startTime.getTime();
                console.log("Retrieved all " + this._newComments.length + " comments in " + elapsed
                    + "ms, TRUE CPS = " + (this._newComments.length / elapsed * 1000));
                
                this._currentSort = "dateOldest";
                this._commentIndex = this._comments.length;
                // Take care of possible pinned comment at the top
                Utils.reSort(this._comments);
                
                // Send the first batch of comments
                this.sendLoadedComments(true);
            }
        }, err => {
                console.error("Comments execute error", err.response.data.error);
                if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                    this._app.ytapi.quotaExceeded();
                }
                else if (err.response.data.error.errors[0].reason == "processingFailure") {
                    setTimeout(() => { this.fetchAllComments(pageToken, appending) }, 10);
                }
            });
    }

    fetchLinkedComment(idString, parentId, replyId) {
        this._app.ytapi.executeSingleComment(parentId).then(response => {
            if (response.data.pageInfo.totalResults) {
                // Linked comment found
                let videoId = response.data.items[0].snippet.videoId;
                if (!replyId) {
                    this.fetchTitle(videoId, true);
                    // Send linked comment
                    this.sendLinkedComment(response.data.items[0], null);
                }
                else {
                    this.fetchLinkedReply(response.data.items[0], replyId);
                }
            }
            else {
                // Linked comment not found
                this.fetchTitle(idString, false);
            }
            }, err => {
                console.error("Linked comment execute error", err.response.data.error);
                if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                    this._app.ytapi.quotaExceeded();
                }
                else if (err.response.data.error.errors[0].reason == "processingFailure") {
                    setTimeout(() => { this.fetchLinkedComment(parentId) }, 10);
                }
            });
    }

    fetchLinkedReply(parent, replyId) {
        this._app.ytapi.executeSingleReply(replyId).then(res => {
            this.fetchTitle(parent.snippet.videoId, true);
            if (res.data.items[0]) {
                // Send parent comment & linked reply
                this.sendLinkedComment(parent, res.data.items[0]);
            }
            else {
                // Send only parent
                this.sendLinkedComment(parent, null);
            }
        },
        function(err) {
            console.error("Linked reply execute error", err.response.data.error);
            if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                this._app.ytapi.quotaExceeded();
            }
            else if (err.response.data.error.errors[0].reason == "processingFailure") {
                setTimeout(() => { this.fetchLinkedReply(parent, replyId) }, 10);
            }
        });
    }

    sendLinkedComment(parent, reply) {
        this._socket.emit("linkedComment", {parent: parent, hasReply: (reply !== null), reply: reply});
    }

    sendLoadedComments(newSet = false) {
        let library = (this._currentSort == "likesMost" || this._currentSort == "likesLeast") ? this._likedComments : this._comments;
        let len = this._comments.length;
        let more = false;
    
        let goal;
        let subset;
        if (this._currentSort == "dateOldest" || this._currentSort == "likesLeast") {
            // end to start of array
            goal = Math.max(this._commentIndex - config.maxDisplay, 0);
            more = goal != 0;
            subset = library.slice(goal, this._commentIndex).reverse();
        }
        else {
            // start to end of array
            goal = Math.min(this._commentIndex + config.maxDisplay, len - 1);
            more = goal != len - 1;
            subset = library.slice(this._commentIndex + 1, goal + 1);
        }
        this._commentIndex = goal;
        this._socket.emit("groupComments", { reset: newSet, items: subset, showMore: more });
    }

    getReplies(commentId) {
        if (this._loadedReplies[commentId]) {
            this.sendReplies(commentId);
        }
        else {
            this.fetchReplies(commentId, "", false);
        }
    }

    fetchReplies(commentId, pageToken, silent) {
        if (!this._loadedReplies[commentId]) this._loadedReplies[commentId] = [];
        this._app.ytapi.executeReplies(commentId, pageToken).then(response => {
            Array.prototype.push.apply(this._loadedReplies[commentId], response.data.items);
            if (response.data.nextPageToken) {
                // Fetch next batch of replies
                setTimeout(() => { this.fetchReplies(commentId, response.data.nextPageToken, silent) }, 0);
            }
            else if (!silent) {
                this.sendReplies(commentId);
            }
        }, err => {
                console.error("Replies execute error", err);
                if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                    this._app.ytapi.quotaExceeded();
                }
                else if (err.response.data.error.errors[0].reason == "processingFailure") {
                    setTimeout(() => { this.fetchReplies(commentId, pageToken, silent) }, 10);
                }                                
            });
    }

    sendReplies(commentId) {
        this._socket.emit("newReplies", { items: this._loadedReplies[commentId], id: commentId});
    }

    doSort(order) {
        if (order != this._currentSort) {
            this._currentSort = order;
            if ((order == "likesMost" || order == "likesLeast") && this._likedComments.length != this._comments.length) {
                let thing = new Date();
                this._likedComments = this._comments.slice();
                let len = this._likedComments.length;
                Utils.mergeSort(this._likedComments, 0, len - 1);
                console.log("Finished mergesort on " + len + " comments in " + (new Date().getTime() - thing.getTime()) + "ms");
            }
            if (order == "dateOldest" || order == "likesLeast") {
                this._commentIndex = this._comments.length;
            }
            else {
                this._commentIndex = -1;
            }
            this.sendLoadedComments(true);
        }
    }

    makeGraph() {
        if (this._graphAvailable) {
            // Send array of ISO dates to client
            let len = this._comments.length;
            let dates = [];
            for (let i = 0; i < len; i++) {
                dates.push(this._comments[i].snippet.topLevelComment.snippet.publishedAt);
            }
            
            this._socket.emit("graphData", dates);
        }
    }

}

module.exports = Video;