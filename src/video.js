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
    }

    handleNewVideo(item) {
        this.reset();
        if (item != -1) {
            this._video = item;
            this._id = this._video.id;
            this._commentCount = this._video.statistics.commentCount;
            this._logToDatabase = this._commentCount >= 500;
            this.fetchTestComment();
        }
    }

    fetchTitle(idString) {
        this._id = idString;
        return this._app.ytapi.executeVideo(idString).then((response) => {
            if (response.data.pageInfo.totalResults > 0) {
                this.handleNewVideo(response.data.items[0]);
                this._socket.emit("videoInfo", { video:this._video });
            }
            else {
                this._socket.emit("idInvalid");
            }
        }, (err) => {
            console.error("Video execute error", err.response.data.error);
            if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                this._app.ytapi.quotaExceeded();
            }
            else if (err.response.data.error.errors[0].reason == "processingFailure") {
                setTimeout(() => { this.fetchTitle(idString) }, 1);
            }
        });
    }

    fetchTestComment() {
        this._app.ytapi.executeTestComment(this._video.id).then((response) => {
            this._commentsEnabled = true;
            // for upcoming/live streams, disregard a 0 count.
            if (!(this._video.snippet.liveBroadcastContent != "none" && this._commentCount == 0)) {
                let beginLoad = this._commentCount < 200;
                this._graphAvailable = this._commentCount >= 50 && new Date(this._video.snippet.publishedAt).getTime() <= (new Date().getTime() - 24*60*60*1000);
                this._socket.emit("commentsInfo", { num: this._commentCount, disabled: false,
                    commence: beginLoad, max: (this._commentCount > config.maxLoad) ? config.maxLoad : -1, graph: this._graphAvailable });
                if (beginLoad && this._commentCount > 0) {
                    this.handleLoad("dateOldest");
                }
            }
        }, (err) => {
            // console.error("Test comment execute error", err.response.data.error);
            if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                this._app.ytapi.quotaExceeded();
            }
            else if (err.response.data.error.errors[0].reason == "processingFailure") {
                setTimeout(() => { this.fetchTestComment() }, 1);
            }
            else if (this._video.snippet.liveBroadcastContent == "none" && err.response.data.error.errors[0].reason == "commentsDisabled") {
                this._commentsEnabled = false;
                this._socket.emit("commentsInfo", {num: this._commentCount, disabled: true,
                    commence: false, max: (this._commentCount > config.maxLoad) ? config.maxLoad : -1, graph: false });
            }
        });
    }

    handleLoad(type) {
        if (this._commentsEnabled && this._commentCount < config.maxLoad && type == "dateOldest") {
            let retrieveAllComments = () => this.fetchAllComments("", false);
            let retrieveNewComments = () => this.fetchAllComments("", true);
            this._currentSort = type;
            this._startTime = new Date();
            if (this._logToDatabase) {
                this._app.database.checkVideo(this._id, (row) => {
                    if (row) {
                        // In-progress videos should be receiving updates every ~0.5 seconds
                        // If no update in the last 30 seconds, it's likely stuck. Reset it
                        if (row.inProgress && (new Date().getTime() - row.lastUpdated) > 30*1000) {
                            this._app.database.resetVideo(this._video, retrieveAllComments);
                        }
                        else if (row.inProgress) {
                            this._socket.emit("loadStatus", -1);
                        }
                        else {
                            // Comments exist in the database.

                            // Determine whether records are too old & re-fetch all comments.
                            // Re-fetching is necessary to account for deleted comments, number of likes changing, etc.
                            // Current criteria: Comment count has doubled OR 6 months have passed (this will probably change)
                            const sixMonths = 6*30*24*60*60*1000;
                            if (row.commentCount * 2 < this._commentCount || (new Date().getTime() - row.lastUpdated) > sixMonths) {
                                this._app.database.resetVideo(this._video, retrieveAllComments);
                            }
                            else {
                                this.loadFromDatabase(() => {
                                    // 5-minute cooldown before retrieving new comments
                                    if ((new Date().getTime() - row.lastUpdated) > 5*60*1000) {
                                        this._app.database.addVideo(this._video, retrieveNewComments);
                                    }
                                    else {
                                        this._commentIndex = this._comments.length;
                                        this.sendLoadedComments(true);
                                    }
                                });
                            }
                        }
                    }
                    else {
                        // New video
                        this._app.database.addVideo(this._video, retrieveAllComments);
                    }
                });
            }
            else {
                this.fetchAllComments("", false);                
            }
        }
    }

    loadFromDatabase(callback) {
        this._app.database.getComments(this._id, (rows) => {
            let len = rows.length;
            this._indexedComments = len;
            
            for (let i = 0; i < len; i++) {
                this._comments.push({
                    id: rows[i].id,
                    textDisplay: rows[i].textDisplay,
                    authorDisplayName: rows[i].authorDisplayName,
                    authorProfileImageUrl: rows[i].authorProfileImageUrl,
                    authorChannelId: rows[i].authorChannelId,
                    likeCount: rows[i].likeCount,
                    publishedAt: rows[i].publishedAt,
                    updatedAt: rows[i].updatedAt,
                    totalReplyCount: rows[i].totalReplyCount
                });
                this._indexedComments += this._comments[i].totalReplyCount;
            }

            callback();
        });
    }

    fetchAllComments(pageToken, appending) {
        this._app.ytapi.executeCommentChunk(this._id, pageToken).then((response) => {
            let proceed = true;
            // Pinned comments always appear first regardless of their date (thanks google)
            // If the first comment is out of place, disregard it if already stored in database.
            // (this also means the pinned comment can be identified as long as it isn't the newest comment; could possibly use that in future)
            if (response.data.items.length > 1 && response.data.items[0].snippet.topLevelComment.snippet.publishedAt
                    < response.data.items[1].snippet.topLevelComment.snippet.publishedAt) {
                if (appending && Utils.commentInArray(this._comments, response.data.items[0].id)) {
                    response.data.items.shift();
                }
            }
            let len = response.data.items.length;
            let convertedComments = [];
            for (let i = 0; i < len; i++) {
                let commentThread = response.data.items[i];
                // If appending to database-stored comments, check if current comment has passed the date
                // of the newest stored comment.
                // Then make sure the current comment is actually stored (for equal timestamps, rare case)
                if (appending && new Date(commentThread.snippet.topLevelComment.snippet.publishedAt).getTime() <= this._comments[0].publishedAt
                        && Utils.commentInArray(this._comments, commentThread.id)) {
                    proceed = false;
                    break;
                }
                convertedComments.push(Utils.convertComment(commentThread));
                this._indexedComments += 1 + commentThread.snippet.totalReplyCount;
            }

            // Write new comments to database
            if (convertedComments.length > 0 && this._logToDatabase) this._app.database.writeNewComments(this._id, convertedComments);

            // Concatenate
            Array.prototype.push.apply(this._newComments, convertedComments);

            // Send load status to client to display percentage
            this._socket.emit("loadStatus", this._indexedComments);

            // If there are more comments, and database-stored comments have not been reached, retrieve the next 100 comments
            if (response.data.nextPageToken && proceed) {
                // Using arrow function because it needs to run in the same scope (due to the current setup).
                // This does mean it can exceed the maximum call stack size for really large sets,
                // but the database should still be able to save the comments. May improve in future
                setTimeout(() => { this.fetchAllComments(response.data.nextPageToken, appending) }, 0);
            }
            else {
                // Finished retrieving all comment threads.
                this._app.database.markVideoComplete(this._id);

                // Add new comments to beginning of database-stored ones
                // (If new video, it adds to the empty array)
                Array.prototype.unshift.apply(this._comments, this._newComments);

                let elapsed = new Date().getTime() - this._startTime.getTime();
                console.log("Retrieved all " + this._newComments.length + " comments in " + elapsed
                    + "ms, TRUE CPS = " + (this._newComments.length / elapsed * 1000));
                
                this._commentIndex = this._comments.length;
                // Take care of possible pinned comment at the top
                Utils.reSort(this._comments);
                
                // Send the first batch of comments
                this.sendLoadedComments(true);
            }
        }, (err) => {
                console.error("Comments execute error", err.response.data.error);
                if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                    this._app.ytapi.quotaExceeded();
                }
                else if (err.response.data.error.errors[0].reason == "processingFailure") {
                    setTimeout(() => { this.fetchAllComments(pageToken, appending) }, 1);
                }
            });
    }

    fetchLinkedComment(idString, parentId, replyId) {
        this._app.ytapi.executeSingleComment(parentId).then((response) => {
            if (response.data.pageInfo.totalResults) {
                // Linked comment found
                this._linkedParent = response.data.items[0];
                let videoId = response.data.items[0].snippet.videoId;
                let getVideo = (videoId) => this._app.ytapi.executeVideo(videoId);
                if (typeof response.data.items[0].snippet.videoId === "undefined") {
                    // Comment isn't associated with a video; likely on a Discussion page
                    getVideo = () => Promise.resolve(-1);
                }
                if (replyId) {
                    // Fetch the video info & linked reply at the same time
                    Promise.all([this._app.ytapi.executeSingleReply(replyId), getVideo(videoId)]).then((responses) => {
                        let videoObject = (responses[1] == -1) ? -1 : responses[1].data.items[0];
                        this.handleNewVideo(videoObject);

                        if (responses[0].data.items[0]) {
                            // Send parent comment & linked reply
                            this.sendLinkedComment(Utils.convertComment(this._linkedParent), Utils.convertComment(responses[0].data.items[0], true), videoObject);
                        }
                        else {
                            // Send only parent
                            this.sendLinkedComment(Utils.convertComment(this._linkedParent), null, videoObject);
                        }
                    }, (err) => {
                        // not handled
                    });
                }
                else {
                    getVideo(videoId).then((res) => {
                        let videoObject = (res == -1) ? -1 : res.data.items[0];
                        this.handleNewVideo(videoObject);
                        // Send linked comment
                        this.sendLinkedComment(Utils.convertComment(response.data.items[0]), null, videoObject);
                    }, (err) => {
                        // not handled
                    });
                }
            }
            else {
                // Linked comment not found
                this.fetchTitle(idString, false);
            }
        }, (err) => {
            console.error("Linked comment execute error", err.response.data.error);
            if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                this._app.ytapi.quotaExceeded();
            }
            else if (err.response.data.error.errors[0].reason == "processingFailure") {
                setTimeout(() => { this.fetchLinkedComment(idString, parentId, replyId) }, 1);
            }
        });
    }

    sendLinkedComment(parent, reply, video) {
        this._socket.emit("linkedComment", {parent: parent, hasReply: (reply !== null), reply: reply, video: video});
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
        this._app.ytapi.executeReplies(commentId, pageToken).then((response) => {
            for (let i = 0; i < response.data.items.length; i++) {
                this._loadedReplies[commentId].push(Utils.convertComment(response.data.items[i], true));
            }
            if (response.data.nextPageToken) {
                // Fetch next batch of replies
                setTimeout(() => { this.fetchReplies(commentId, response.data.nextPageToken, silent) }, 0);
            }
            else if (!silent) {
                this.sendReplies(commentId);
            }
        }, (err) => {
                console.error("Replies execute error", err);
                if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                    this._app.ytapi.quotaExceeded();
                }
                else if (err.response.data.error.errors[0].reason == "processingFailure") {
                    setTimeout(() => { this.fetchReplies(commentId, pageToken, silent) }, 1);
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
            // Send array of dates to client
            let len = this._comments.length;
            let dates = [];
            for (let i = 0; i < len; i++) {
                dates.push(this._comments[i].publishedAt);
            }
            
            this._socket.emit("graphData", dates);
        }
    }

}

module.exports = Video;