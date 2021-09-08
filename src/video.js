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
        this._newCommentThreads = 0;
        this._loadComplete = false;
    }

    handleNewVideo(item) {
        this.reset();
        if (item !== -1) {
            this._video = item;
            this._id = this._video.id;
            this._commentCount = Number(this._video.statistics.commentCount);
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
            logger.log('error', "Video execute error on %s: %d ('%s') - '%s'",
                idString, err.code, err.errors[0].reason, err.errors[0].message);

            if (err.errors[0].reason === "quotaExceeded") {
                this._app.ytapi.quotaExceeded();
                this._socket.emit("quotaExceeded");
            }
            else if (err.errors[0].reason === "processingFailure") {
                setTimeout(() => this.fetchTitle(idString), 1);
            }
        });
    }

    fetchTestComment(consecutiveErrors = 0) {
        this._app.ytapi.executeTestComment(this._video.id).then(() => {
            this._commentsEnabled = true;
            // for upcoming/live streams, disregard a 0 count.
            if (!(this._video.snippet.liveBroadcastContent !== "none" && this._commentCount === 0)) {
                // Make graph available if 1 hour has passed, to ensure at least 2 points on the graph
                this._graphAvailable = this._commentCount >= 10 && new Date(this._video.snippet.publishedAt).getTime() <= (Date.now() - 60 * 60 * 1000);
                this._socket.emit("commentsInfo", {
                    num: this._commentCount,
                    disabled: false,
                    max: (this._commentCount > config.maxLoad) ? config.maxLoad : -1,
                    graph: this._graphAvailable
                });
            }
        }, (err) => {
            logger.log('error', "TEST COMMENT execute error on %s: %d ('%s') - '%s'",
                this._id, err.code, err.errors[0].reason, err.errors[0].message);

            if (consecutiveErrors < 5) {
                if (err.errors[0].reason === "quotaExceeded") {
                    this._app.ytapi.quotaExceeded();
                    this._socket.emit("quotaExceeded");
                }
                else if (err.errors[0].reason === "processingFailure") {
                    setTimeout(() => this.fetchTestComment(++consecutiveErrors), 1);
                }
                else if (this._video.snippet.liveBroadcastContent === "none" && err.errors[0].reason === "commentsDisabled") {
                    this._commentsEnabled = false;
                    this._socket.emit("commentsInfo", {
                        num: this._commentCount,
                        disabled: true,
                        max: (this._commentCount > config.maxLoad) ? config.maxLoad : -1,
                        graph: false
                    });
                }
            } else {
                logger.log('warn', "Giving up TEST comment fetch on %s due to %d consecutive errors.", this._id, consecutiveErrors);
            }
        });
    }

    shouldReFetch = (row) => {
        const now = Date.now();
        const initialCommentCount = Number(row.initialCommentCount);
        const videoAge = now - new Date(this._video.snippet.publishedAt).getTime();
        const currentCommentsAge = now - row.retrievedAt;
        const MONTH = 30 * 24 * 60 * 60 * 1000;

        // Determine whether the comment set should be re-fetched by seeing if it meets at least 1 condition.
        // These will probably change over time
        const doReFetch = (
            // Comment count has doubled
            initialCommentCount * 2 < this._commentCount
            // 6 months have passed since initial fetch
            || currentCommentsAge > 6 * MONTH
        );

        if (doReFetch && this._commentCount > 5000) {
            const commentsAgeHours = currentCommentsAge / 1000 / 60 / 60;
            const videoAgeHours = videoAge / 1000 / 60 / 60;
            logger.log('info', "Re-fetching video %s. initialCommentCount %s; current commentCount %s; current comments age %sh; video age %sh.",
                this._id, (initialCommentCount).toLocaleString(), (this._commentCount).toLocaleString(),
                commentsAgeHours.toLocaleString(), videoAgeHours.toLocaleString());
        }
        return doReFetch;
    }

    handleLoad(type) {
        if (this._commentsEnabled && this._commentCount < config.maxLoad && this._commentCount > 0 && type === "dateOldest") {
            this._newComments = 0;
            this._newCommentThreads = 0;
            const now = Date.now();
            this._startTime = now;

            if (this._logToDatabase) {
                const {row, actuallyInProgress} = this._app.database.checkVideo(this._id);
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

                                this._app.database.reAddVideo(this._video);
                                this.fetchAllComments(row.nextPageToken, false);
                            }
                            else {
                                logger.log('info', "Could not resume unfinished fetch process on %s. Restarting.", this._id);
                                this._app.database.deleteVideo(this._id);
                                this._app.database.addVideo(this._video);
                                this.startFetchProcess(false);
                            }
                        }
                    }
                    // 5-minute cooldown before doing any new fetch
                    else if ((now - row.lastUpdated) <= 5*60*1000) {
                        this.sendLoadedComments("dateOldest", 0, false);
                    }
                    // Re-fetch all comments from scratch if needed
                    else if (this.shouldReFetch(row)) {
                        this._app.database.deleteVideo(this._id);
                        this._app.database.addVideo(this._video);
                        this.startFetchProcess(false);
                    }
                    // Append to existing set of comments
                    else {
                        logger.log('info', "Appending to video %s. %s total; %s new.",
                            this._id, (this._commentCount).toLocaleString(), (this._commentCount - row.commentCount).toLocaleString());
                        this._indexedComments = row.commentCount;
                        this._app.database.reAddVideo(this._video);
                        const lastCommentRow = this._app.database.getLastComment(this._id);
                        this._lastComment = { id: lastCommentRow.id, publishedAt: lastCommentRow["MAX(publishedAt)"] };
                        this.startFetchProcess(true);
                    }
                }
                else {
                    // New video
                    this._app.database.addVideo(this._video);
                    this.startFetchProcess(false);
                }
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
                if (appending && new Date(response.data.items[0].snippet.topLevelComment.snippet.publishedAt).getTime() < this._lastComment.publishedAt) {
                    convertedComments.push(convertComment(response.data.items.shift()));
                }

            }
            let newIndexed;
            for (const commentThread of response.data.items) {
                // If appending to database-stored comments, check if the records have been reached by
                // comparing IDs of the last stored comment.
                // In case it's been deleted, also check if the current date has surpassed the last comment's date.
                // Equal timestamps can slip through, but they should be taken care of by database.
                const currentDate = new Date(commentThread.snippet.topLevelComment.snippet.publishedAt).getTime();
                if (appending && (commentThread.id === this._lastComment.id || currentDate < this._lastComment.publishedAt)) {
                    proceed = false;
                    break;
                }

                convertedComments.push(convertComment(commentThread));
                newIndexed = 1 + commentThread.snippet.totalReplyCount;
                this._indexedComments += newIndexed;
                this._newComments += newIndexed;
                this._newCommentThreads++;
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
                setTimeout(() => this.fetchAllComments(response.data.nextPageToken, appending), 0);
            }
            else {
                // Finished retrieving all comment threads.
                const elapsed = Date.now() - this._startTime;
                const cpsString = this._newCommentThreads > 800 ? ('; TRUE CPS = ' + (this._newCommentThreads / elapsed * 1000).toFixed(0)) : '';
                logger.log('info', 'Retrieved video %s; %s comments in %ds' + cpsString,
                    this._id, (this._newComments).toLocaleString(), (elapsed / 1000).toFixed(1));

                this._app.database.markVideoComplete(this._id, this._video.snippet.title, elapsed, this._newComments, this._newCommentThreads);

                // Send the first batch of comments
                this.sendLoadedComments("dateOldest", 0, true);

                // Clear out the room
                setTimeout(() => {
                    this._io.of('/').in('video-' + this._id).allSockets().then(clientIds => {
                        clientIds.forEach((clientId) => this._io.sockets.sockets.get(clientId).leave('video-' + this._id));
                    });
                }, 1000);
            }
        }, (err) => {
            const error = err.errors[0];
            logger.log('error', "Comments execute error on %s: %d ('%s') - '%s'",
                this._id, err.code, err.errors[0].reason, err.errors[0].message);

            if (consecutiveErrors < 20) {
                if (error.reason === "quotaExceeded") {
                    this._app.ytapi.quotaExceeded();
                    this._app.database.abortVideo(this._id);
                    this._socket.emit("quotaExceeded");
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
                        const videoObject = (responses[1] === -1) ? -1 : responses[1].data.items[0];
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
                    }, (err) => logger.log('error', "Linked reply/video error on replyId %s, video %s: %O",
                            replyId, videoId, err.response.data.error));
                }
                else {
                    getVideo(videoId).then((res) => {
                        const videoObject = (res === -1) ? -1 : res.data.items[0];
                        this.handleNewVideo(videoObject);
                        // Send linked comment
                        this.sendLinkedComment(convertComment(response.data.items[0]), null, videoObject);
                    }, (err) => logger.log('error', "Linked video error on %s: %O", videoId, err.response.data.error));
                }
            }
            else {
                // Linked comment not found
                this.fetchTitle(idString, false);
            }
        }, (err) => {
            logger.log('error', "Linked comment execute error on %s: %d ('%s') - '%s'",
                parentId, err.code, err.errors[0].reason, err.errors[0].message);

            if (err.errors[0].reason === "quotaExceeded") {
                this._app.ytapi.quotaExceeded();
                this._socket.emit("quotaExceeded");
            }
            else if (err.errors[0].reason === "processingFailure") {
                setTimeout(() => this.fetchLinkedComment(idString, parentId, replyId), 1);
            }
        });
    }

    sendLinkedComment(parent, reply, video) {
        this._socket.emit("linkedComment", {parent: parent, hasReply: (reply !== null), reply: reply, videoObject: video});
    }

    sendLoadedComments(sort, commentIndex, broadcast, minDate, maxDate, searchTerms = ['', '']) {
        if (!this._id) return;

        const newSet = commentIndex === 0;
        if (!minDate || minDate < 0) {
            minDate = 0;
            maxDate = 1e13;
        }

        // might make this less ugly later
        let sortBy = (sort === "likesMost" || sort === "likesLeast") ? "likeCount" : "publishedAt";
        // Including rowid ensures that any comments with identical timestamps will follow their original insertion order.
        // This works in 99.99% of cases (as long as said comments were fetched at the same time)
        sortBy += (sort === "dateOldest" || sort === "likesLeast") ? " ASC, rowid DESC" : " DESC, rowid ASC";

        try {
            const {rows, subCount, totalCount, error} = this._app.database.getComments(
                this._id, config.maxDisplay, commentIndex, sortBy, minDate, maxDate, searchTerms);
            if (error) {
                // This is most likely a search error, so broadcast should hopefully be false
                this._socket.emit("searchError");
                return;
            }

            this._loadComplete = true; // To permit statistics retrieval later
            const more = rows.length === config.maxDisplay;
            const subset = [];
            const repliesPromises = [];
            for (const commentThread of rows) {
                subset.push({
                    id: commentThread.id,
                    textDisplay: commentThread.textDisplay,
                    snippet: commentThread.snippet || undefined,
                    authorDisplayName: commentThread.authorDisplayName,
                    authorProfileImageUrl: commentThread.authorProfileImageUrl,
                    authorChannelId: commentThread.authorChannelId,
                    likeCount: commentThread.likeCount,
                    publishedAt: commentThread.publishedAt,
                    updatedAt: commentThread.updatedAt,
                    totalReplyCount: commentThread.totalReplyCount
                });

                if (commentThread.totalReplyCount > 0 && config.maxDisplayedReplies > 0) {
                    repliesPromises.push(this._app.ytapi.executeMinReplies(commentThread.id));
                }
            }

            // Fetch a subset of the replies for each comment
            const replies = {};
            Promise.allSettled(repliesPromises).then((results) => {
                results.forEach((result) => {
                    if (result.status === "fulfilled" && result.value.data.pageInfo.totalResults > 0) {
                        const parentId = result.value.data.items[0].id;
                        const chosenReplies = result.value.data.items[0].replies.comments.slice(0, config.maxDisplayedReplies);
                        replies[parentId] = [];

                        chosenReplies.forEach((reply) => replies[parentId].push(convertComment(reply, true)));
                    }
                });

                if (broadcast) {
                    this._io.to('video-' + this._id).emit("groupComments",
                        {reset: newSet, items: subset, replies: replies, showMore: more, subCount: subCount, totalCount: totalCount});
                }
                else {
                    this._socket.emit("groupComments",
                        {reset: newSet, items: subset, replies: replies, showMore: more, subCount: subCount, totalCount: totalCount});
                }
            });
        } catch (err) {
            logger.log('error', "Database getComments error: %O", err);
        }
    }

    getReplies(commentId) {
        this.fetchReplies(commentId, "", false);
    }

    fetchReplies(commentId, pageToken, silent, replies = []) {
        this._app.ytapi.executeReplies(commentId, pageToken).then((response) => {
            response.data.items.forEach((reply) => replies.push(convertComment(reply, true)));

            if (response.data.nextPageToken) {
                // Fetch next batch of replies
                setTimeout(() => this.fetchReplies(commentId, response.data.nextPageToken, silent, replies), 0);
            }
            else if (!silent) {
                this.sendReplies(commentId, replies);
            }
        }, (err) => {
                logger.log('error', "Replies execute error on %s: %d ('%s') - '%s'",
                    this._id, err.code, err.errors[0].reason, err.errors[0].message);

                if (err.errors[0].reason === "quotaExceeded") {
                    this._app.ytapi.quotaExceeded();
                    this._socket.emit("quotaExceeded");
                }
                else if (err.errors[0].reason === "processingFailure") {
                    setTimeout(() => this.fetchReplies(commentId, pageToken, silent, replies), 1);
                }                                
            });
    }

    sendReplies(commentId, items) {
        this._socket.emit("newReplies", { items: items, id: commentId});
    }

    getStatistics() {
        if (this._graphAvailable && this._loadComplete) {
            const stats = this._app.database.getStatistics(this._id);
            this.makeGraphArray().then((result) => {
                this._socket.emit("statsData", [stats, result]);
                result = undefined;
            });
        }
    }

    makeGraphArray() {
        // Form array of all dates
        return new Promise((resolve) => {
            const rows = this._app.database.getAllDates(this._id);
            const dates = new Array(rows.length);

            // Populate dates array in chunks of 10000 to not block the thread
            let i = 0;
            const processChunk = () => {
                let count = 0;
                while (count++ < 10000 && i < rows.length) {
                    dates[i] = rows[i].publishedAt;
                    i++;
                }
                if (i < rows.length) {
                    setTimeout(processChunk, 0);
                }
                else {
                    resolve(dates);
                }
            }
            processChunk();
        });
    }

}

module.exports = Video;