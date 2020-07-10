const config = require('../config.json');
const { convertComment } = require('./utils');
const logger = require('./logger');

class Video {
    constructor(app, io, socket) {
        this._app = app;
        this._io = io;
        this._socket = socket;

        this.reset();
    }

    reset() {
        this._indexedComments = 0; // All retrieved comments + their reply counts
        this._newComments = 0;
    }

    handleNewVideo(item) {
        this.reset();
        if (item != -1) {
            this._video = item;
            this._id = this._video.id;
            this._commentCount = this._video.statistics.commentCount;
            // this._logToDatabase = this._commentCount >= 500;
            this._logToDatabase = true; // Currently needed as comments are only sent from database
            this.fetchTestComment();
        }
    }

    fetchTitle(idString) {
        return this._app.ytapi.executeVideo(idString).then((response) => {
            if (response.data.pageInfo.totalResults > 0) {
                this.handleNewVideo(response.data.items[0]);
                this._socket.emit("videoInfo", { videoObject:this._video });
            }
            else {
                this._socket.emit("idInvalid");
            }
        }, (err) => {
            logger.log('error', "Video execute error on %s: %o", idString, err.response.data.error);
            if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                this._app.ytapi.quotaExceeded();
            }
            else if (err.response.data.error.errors[0].reason == "processingFailure") {
                setTimeout(() => { this.fetchTitle(idString) }, 1);
            }
        });
    }

    fetchTestComment() {
        this._app.ytapi.executeTestComment(this._video.id).then(() => {
            this._commentsEnabled = true;
            // for upcoming/live streams, disregard a 0 count.
            if (!(this._video.snippet.liveBroadcastContent != "none" && this._commentCount == 0)) {
                const beginLoad = this._commentCount < 200;
                // Make graph available if 1 hour has passed, to ensure at least 2 points on the graph
                this._graphAvailable = this._commentCount >= 10 && new Date(this._video.snippet.publishedAt).getTime() <= (new Date().getTime() - 60*60*1000);
                this._socket.emit("commentsInfo", { num: this._commentCount, disabled: false,
                    commence: beginLoad, max: (this._commentCount > config.maxLoad) ? config.maxLoad : -1, graph: this._graphAvailable });
                if (beginLoad && this._commentCount > 0) {
                    this.handleLoad("dateOldest");
                }
            }
        }, (err) => {
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
        if (this._commentsEnabled && this._commentCount < config.maxLoad && this._commentCount > 0 && type == "dateOldest") {
            this._newComments = 0;
            const now = new Date().getTime();

            this._startTime = new Date();
            if (this._logToDatabase) {
                this._app.database.checkVideo(this._id, (row, actuallyInProgress) => {
                    if (row) {
                        // Comments exist in the database.
                        if (row.inProgress) {
                            this._socket.join('video-' + this._id);
                            if (!actuallyInProgress) {
                                // Comment set is stuck in an unfinished state.
                                // Use nextPageToken to continue fetch if possible
                                if (row.nextPageToken) {
                                    logger.log('info', "Attempting to resume unfinished fetch process on %s", this._id);
                                    this._indexedComments = row.commentCount;
                                    this._app.database.reAddVideo(this._id, () => this.fetchAllComments(row.nextPageToken, false));
                                }
                                else {
                                    this._app.database.resetVideo(this._video, () => this.startFetchProcess(false));
                                }
                            }
                        }
                        else {
                            // Determine whether records are too old & re-fetch all comments.
                            // Re-fetching is necessary to account for deleted comments, number of likes changing, etc.
                            // Current criteria: Comment count has changed by 1.5x OR 6 months have passed OR
                            // time between video publish and initial fetch has doubled
                            const videoAge = now - new Date(this._video.snippet.publishedAt).getTime();
                            const currentCommentsAge = now - row.retrievedAt;
                            const sixMonths = 6*30*24*60*60*1000;
                            if (row.initialCommentCount * 1.5 < this._commentCount || (now - row.retrievedAt) > sixMonths
                                    || currentCommentsAge * 2 > videoAge) {
                                this._app.database.resetVideo(this._video, () => this.startFetchProcess(false));
                            }
                            else {
                                this._indexedComments = row.commentCount;
                                // 5-minute cooldown before retrieving new comments
                                if ((now - row.lastUpdated) > 5*60*1000) {
                                    this._app.database.reAddVideo(this._id, () => {
                                        this._app.database.getLastDate(this._id, (row) => {
                                            this._lastDate = row['MAX(publishedAt)'];
                                            this.startFetchProcess(true);
                                        });
                                    });
                                }
                                else {
                                    this.sendLoadedComments("dateOldest", 0, false);
                                }
                            }
                        }
                    }
                    else {
                        // New video
                        this._app.database.addVideo(this._video, () => this.startFetchProcess(false));
                    }
                });
            }
            else {
                this.startFetchProcess(false);
            }
        }
    }

    startFetchProcess = (appendToDatabase) => {
        // Join a room so load status can be broadcast to multiple users
        this._socket.join('video-' + this._id);

        this.fetchAllComments("", appendToDatabase);
    }

    fetchAllComments(pageToken, appending, consecutiveErrors = 0) {
        // Impose 30-second limit on API response.
        const timeoutHolder = new Promise((resolve) => setTimeout(resolve, 30*1000, -1));
        Promise.race([timeoutHolder, this._app.ytapi.executeCommentChunk(this._id, pageToken)]).then((response) => {
            if (response === -1) {
                logger.log('warn', "Fetch process on %s timed out.", this._id);
                this._app.database.abortVideo(this._id);
                return;
            }

            let proceed = true;
            const convertedComments = [];
            // Pinned comments always appear first regardless of their date (thanks google)
            // (this also means the pinned comment can be identified as long as it isn't the newest comment; could possibly use that in future)
            if (response.data.items.length > 1 && response.data.items[0].snippet.topLevelComment.snippet.publishedAt
                    < response.data.items[1].snippet.topLevelComment.snippet.publishedAt) {
                // If the pinned comment precedes the last date, shift it out of the array in order not to
                // distort the date-checking later. Keep it in convertedComments to update its database entry
                // since its likeCount is probably increasing rapidly.
                if (appending && new Date(response.data.items[0].snippet.topLevelComment.snippet.publishedAt).getTime() < this._lastDate) {
                    convertedComments.push(convertComment(response.data.items.shift()));
                }
                
            }
            let newIndexed;
            for (const commentThread of response.data.items) {
                newIndexed = 1 + commentThread.snippet.totalReplyCount;
                // If appending to database-stored comments, check if current comment has passed the date
                // of the newest stored comment.
                // Equal timestamps will slip through, but they should be taken care of by database.
                if (appending && new Date(commentThread.snippet.topLevelComment.snippet.publishedAt).getTime() < this._lastDate) {
                    proceed = false;
                    break;
                }
                convertedComments.push(convertComment(commentThread));
                this._indexedComments += newIndexed;
                this._newComments += newIndexed;
            }

            if (convertedComments.length > 0 && this._logToDatabase) {
                // Write new comments to database
                this._app.database.writeNewComments(this._id, convertedComments,
                    this._indexedComments, response.data.nextPageToken || null);
            }

            // Broadcast load status to clients to display percentage
            this._io.to('video-' + this._id).emit("loadStatus", this._indexedComments);

            // If there are more comments, and database-stored comments have not been reached, retrieve the next 100 comments
            if (response.data.nextPageToken && proceed) {
                setTimeout(() => { this.fetchAllComments(response.data.nextPageToken, appending) }, 0);
            }
            else {
                // Finished retrieving all comment threads.
                this._app.database.markVideoComplete(this._id);

                const elapsed = new Date().getTime() - this._startTime.getTime();
                logger.log('info', "Retrieved video %s, %d comments in %dms, CPS = %d",
                    this._id, this._newComments, elapsed, (this._newComments / elapsed * 1000));
                
                // Send the first batch of comments
                this.sendLoadedComments("dateOldest", 0, true);

                // Clear out the room
                setTimeout(() => {
                    this._io.of('/').in('video-' + this._id).clients( (_error, clientIds) => {
                        clientIds.forEach((clientId) => this._io.sockets.sockets[clientId].leave('video-' + this._id));
                    });
                }, 1000);
            }
        }, (err) => {
                logger.log('error', "Comments execute error on %s: %o", this._id, err.response.data.error);
                if (consecutiveErrors < 20) {
                    const error = err.response.data.error.errors[0];
                    if (error.reason == "quotaExceeded") {
                        this._app.ytapi.quotaExceeded();
                    }
                    else {
                        // Retry
                        setTimeout(() => this.fetchAllComments(pageToken, appending, ++consecutiveErrors), 1);
                    }
                }
                else {
                    logger.log('warn', "Ending fetch process on %s due to %d consecutive errors.", this._id, consecutiveErrors);
                    this._app.database.abortVideo(this._id);
                }
            });
    }

    fetchLinkedComment(idString, parentId, replyId) {
        this._app.ytapi.executeSingleComment(parentId).then((response) => {
            if (response.data.pageInfo.totalResults) {
                // Linked comment found
                this._linkedParent = response.data.items[0];
                const videoId = response.data.items[0].snippet.videoId;
                let getVideo = (videoId) => this._app.ytapi.executeVideo(videoId);
                if (typeof response.data.items[0].snippet.videoId === "undefined") {
                    // Comment isn't associated with a video; likely on a Discussion page
                    getVideo = () => Promise.resolve(-1);
                }
                if (replyId) {
                    // Fetch the video info & linked reply at the same time
                    Promise.all([this._app.ytapi.executeSingleReply(replyId), getVideo(videoId)]).then((responses) => {
                        const videoObject = (responses[1] == -1) ? -1 : responses[1].data.items[0];
                        this.handleNewVideo(videoObject);

                        if (responses[0].data.items[0]) {
                            // Send parent comment & linked reply
                            this.sendLinkedComment(convertComment(this._linkedParent),
                                convertComment(responses[0].data.items[0], true), videoObject);
                        }
                        else {
                            // Send only parent
                            this.sendLinkedComment(convertComment(this._linkedParent), null, videoObject);
                        }
                    }, (err) => logger.log('error', "Linked reply/video error on replyId %s, video %s: %o",
                            replyId, videoId, err.response.data.error));
                }
                else {
                    getVideo(videoId).then((res) => {
                        const videoObject = (res == -1) ? -1 : res.data.items[0];
                        this.handleNewVideo(videoObject);
                        // Send linked comment
                        this.sendLinkedComment(convertComment(response.data.items[0]), null, videoObject);
                    }, (err) => logger.log('error', "Linked video error on %s: %o", videoId, err.response.data.error));
                }
            }
            else {
                // Linked comment not found
                this.fetchTitle(idString, false);
            }
        }, (err) => {
            logger.log('error', "Linked comment execute error on %s: %o", parentId, err.response.data.error);
            if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                this._app.ytapi.quotaExceeded();
            }
            else if (err.response.data.error.errors[0].reason == "processingFailure") {
                setTimeout(() => { this.fetchLinkedComment(idString, parentId, replyId) }, 1);
            }
        });
    }

    sendLinkedComment(parent, reply, video) {
        this._socket.emit("linkedComment", {parent: parent, hasReply: (reply !== null), reply: reply, videoObject: video});
    }

    sendLoadedComments(sort, commentIndex, broadcast) {
        if (!this._id) return;
        const newSet = commentIndex == 0;
        
        // might make this less ugly later
        let sortBy = (sort == "likesMost" || sort == "likesLeast") ? "likeCount" : "publishedAt";
        // Including rowid ensures that any comments with identical timestamps will follow their original insertion order.
        // This works in 99.99% of cases (as long as said comments were fetched at the same time)
        sortBy += (sort == "dateOldest" || sort == "likesLeast") ? " ASC, rowid DESC" : " DESC, rowid ASC";

        this._app.database.getComments(this._id, config.maxDisplay, commentIndex, sortBy, (err, rows) => {
            if (err) {
                logger.log('error', "Database getComments error: %o", err);
            }
            else {
                const more = rows.length == config.maxDisplay;
                const subset = [];
                const repliesPromises = [];
                for (let i = 0; i < rows.length; i++) {
                    subset.push({
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

                    if (rows[i].totalReplyCount > 0 && config.maxDisplayedReplies > 0) {
                        repliesPromises.push(this._app.ytapi.executeMinReplies(rows[i].id));
                    }
                }
                
                // Fetch a subset of the replies for each comment
                const replies = {};
                Promise.allSettled(repliesPromises).then((results) => {
                    results.forEach((result) => {
                        if (result.status == "fulfilled" && result.value.data.pageInfo.totalResults > 0) {
                            const id = result.value.data.items[0].id;
                            const receivedReplies = result.value.data.items[0].replies.comments;
                            replies[id] = [];
                            for (let i = 0; i < config.maxDisplayedReplies && i < receivedReplies.length; i++) {
                                replies[id].push(convertComment(receivedReplies[i], true));
                            }
                        }
                    });

                    if (broadcast) {
                        this._io.to('video-' + this._id).emit("groupComments", { reset: newSet, items: subset, replies: replies, showMore: more });
                    }
                    else {
                        this._socket.emit("groupComments", { reset: newSet, items: subset, replies: replies, showMore: more });
                    }
                });
            }
        });
    }

    getReplies(commentId) {
        this.fetchReplies(commentId, "", false);
    }

    fetchReplies(commentId, pageToken, silent, replies = []) {
        this._app.ytapi.executeReplies(commentId, pageToken).then((response) => {
            for (let i = 0; i < response.data.items.length; i++) {
                replies.push(convertComment(response.data.items[i], true));
            }
            if (response.data.nextPageToken) {
                // Fetch next batch of replies
                setTimeout(() => { this.fetchReplies(commentId, response.data.nextPageToken, silent, replies) }, 0);
            }
            else if (!silent) {
                this.sendReplies(commentId, replies);
            }
        }, (err) => {
                logger.log('error', "Replies execute error on %s: %o", this._id, err.response.data.error);
                if (err.response.data.error.errors[0].reason == "quotaExceeded") {
                    this._app.ytapi.quotaExceeded();
                }
                else if (err.response.data.error.errors[0].reason == "processingFailure") {
                    setTimeout(() => { this.fetchReplies(commentId, pageToken, silent, replies) }, 1);
                }                                
            });
    }

    sendReplies(commentId, items) {
        this._socket.emit("newReplies", { items: items, id: commentId});
    }

    makeGraph() {
        if (this._graphAvailable) {
            // Send array of dates to client
            this._app.database.getAllDates(this._id, (rows) => {
                let dates = new Array(rows.length);

                // Populate dates array in chunks of 1000 to ease CPU load                    
                let i = 0;
                const processChunk = () => {
                    let count = 0;
                    while (count++ < 1000 && i < rows.length) {
                        dates[i] = rows[i].publishedAt;
                        i++;
                    }
                    if (i < rows.length) {
                        setTimeout(processChunk, 5);
                    }
                    else {
                        this._socket.emit("graphData", dates);
                        dates = undefined;
                    }
                }
                processChunk();
            });
        }
    }

}

module.exports = Video;