const {google} = require('googleapis');
const config = require('./config');
let express = require('express');
let app = express();
let http = require('http').createServer(app);
let io = require('socket.io')(http);
const fs = require('fs');
// let stream = fs.createWriteStream("logs.json", {flags: 'a'});

app.use(express.static("public"));

io.on('connection', function (socket) {
	console.log('a user connected with', socket.handshake.query, socket.request.headers['accept-language']);
	let al = socket.request.headers['accept-language'];
	let comma = al.indexOf(',');
	if (comma > 0) al = al.substring(0, comma);
	let locale = { lang:al, timezone:socket.handshake.query.timezone };

	let idString = "";
	let videoPublished, uploaderId;
	let loadedReplies = {};
	let shownReplies = {};
	let currentLinked = "";
	let linkedParent = "";

	let allComments = [];
	let likedComments = [];
	let totalCount = 0;
	let totalExpected = -1;
	let currentSort;
	let commentIndex;

	let trueStart;

	function resetPage() {
		console.log("resetting");
		allComments = [];
		likedComments = [];
		totalCount = 0;
		loadedReplies = {};
		shownReplies = {};
    
		socket.emit("resetPage");
		//currentLinked = "";
		//linkedParent = "";
	}
	
	function quotaExceeded() {
		socket.emit("quotaExceeded");
	}
	function checkSendID(inp) {
		let id = inp;
		// hardcoding a length of 11. hope they never change that
		if (id.length >= 11) {
			let marker = id.indexOf("v=");
			if (marker > -1 && id.length >= marker + 2 + 11) {
				//normal "watch?v=" link
				idString = id.substring(marker + 2, marker + 2 + 11);
			}
			else {              
				//youtu.be or ID only
				idString = id.substring(id.length - 11);
			}
			
			let linked = id.indexOf("lc=");
			// length of a comment ID seems to be 20 or 26.
			if (linked > -1) {
				currentLinked = id.substring(linked + 3);
				if (currentLinked.indexOf(".") > -1) {
					//linked a reply.
					let dot = currentLinked.indexOf(".");
					linkedParent = currentLinked.substring(0, dot);
					executeLinkedComment(linkedParent, true);
				}
				else {
					//linked only parent
					linkedParent = currentLinked;
					executeLinkedComment(linkedParent);
				}
			}
			else {
				executeTitle(false);
			}
	
		}
		else {
			socket.emit("idInvalid");
		}
	}
	
	function handleLoad(type) {
		trueStart = new Date();
		currentSort = type;
		switch (type) {
			case "dateOldest":
				executeAllComments("");
				break;
			case "dateNewest":
				// Removed
				// executeComments("time", "");
				break;
			case "relevanceMost":
				// nothing
				break;
			case "relevanceLeast":
				// nothing    
				break;
		}
	}

	function doSort(order) {
		currentSort = order;
		if ((order == "likesMost" || order == "likesLeast") && likedComments.length != allComments.length) {
			let thing = new Date();
			likedComments = allComments.slice();
			let len = likedComments.length;
			mergeSort(likedComments, 0, len - 1);
			console.log("Finished mergesort on " + len + " comments in " + (new Date().getTime() - thing.getTime()) + "ms");
		}
		shownReplies = {};
		if (order == "dateOldest" || order == "likesLeast") {
			commentIndex = allComments.length;
		}
		else {
			commentIndex = -1;
		}
		displayLoadedComments(true);
	}
	
	function executeAllComments(nxtPageToken, errors = 0) {
		return youtube.commentThreads.list({
			"part": "snippet",
			"videoId": idString,
			"order": "time",
			"maxResults": "100",
			"pageToken": nxtPageToken
		})
			.then(function(response) {
				// static bc Objects
				Array.prototype.push.apply(allComments, response.data.items);
				let len = response.data.items.length;
				totalCount += len;
				for (let i = 0; i < len; i++) {
					totalCount += response.data.items[i].snippet.totalReplyCount;
				}
				
				socket.emit("loadStatus", totalCount.toLocaleString() + " comments loaded ("
					+ (Math.round(totalCount / totalExpected * 1000) / 10).toFixed(1) + "%)");
				if (response.data.nextPageToken) {
					setTimeout(executeAllComments, 0, response.data.nextPageToken, errors);
				}
				else {
					let elapsed = new Date().getTime() - trueStart.getTime();
					console.log("Retrieved all " + allComments.length + " comments in " + elapsed
						+ "ms with " + errors + " API errors, shown CPS = " + (totalCount / elapsed * 1000));
					if (totalCount > 5000) {					
						let log = {
							time: new Date().toJSON(),
							videoId: idString,
							commentCount: allComments.length,
							totalCount: totalCount,
							duration: elapsed,
							apiErrors: errors
						};
						//stream.write(JSON.stringify(log) + "\n");
					}
					commentIndex = allComments.length;
					// take care of possible pinned comment at the top
					reSort(allComments);
					
					displayLoadedComments(true);
				}
	
			},
				function(err) {
					console.error("Comments execute error", err.response.data.error);
					if (err.response.data.error.errors[0].reason == "quotaExceeded") {
						quotaExceeded();
					}
					else if (err.response.data.error.errors[0].reason == "processingFailure") {						
						setTimeout(executeAllComments, 10, nxtPageToken, ++errors);
					}
				});
	}
	
	function displayLoadedComments(newSet = false) {
		let library = (currentSort == "likesMost" || currentSort == "likesLeast") ? likedComments : allComments;
		let len = allComments.length;
		let more = false;
	
		let inc, goal;
		if (currentSort == "dateOldest" || currentSort == "likesLeast") {
			// end to start of array
			goal = Math.max(commentIndex - MAXDISPLAY, 0);
			more = goal != 0;
			inc = -1;
		}
		else {
			// start to end
			goal = Math.min(commentIndex + MAXDISPLAY, len - 1);
			more = goal != len - 1;
			inc = 1;
		}
		
		let add = "";
		let number = 0, className = "";
		while (commentIndex != goal) {
			commentIndex += inc;
			if (linkedParent == library[commentIndex].snippet.topLevelComment.id) { continue; }
			number = (inc == 1) ? commentIndex + 1 : len - commentIndex;
	
			add += `<hr><div class="commentThreadDiv">` + formatCommentThread(library[commentIndex], idString, uploaderId, locale, number) + `</div>`;
		}
		//console.log("populated display in " + (new Date().getTime() - startTime.getTime()) + "ms");
		socket.emit("renderedComments", { reset: newSet, html: add, showMore: more });
	}
	
	function executeLinkedComment(commentId, reply = false) {
		return youtube.commentThreads.list({
			"part": "snippet",
			"id": commentId
		})
			.then(function(response) {
				console.log("Response received (ONE COMMENT)", response);
				if (response.data.pageInfo.totalResults) {
					resetPage();
					idString = response.data.items[0].snippet.videoId;
					executeTitle(true);
					displayComment(response, !reply);
					if (reply) {
						console.log("currentLinked " + currentLinked);
						executeLinkedReply(currentLinked);
					}
				}
				else {
					//invalid comment ID returns empty list
					executeTitle(false);
				}
			},
				function(err) { 
					console.error("Linked comment execute error", err.response.data.error);
					if (err.response.data.error.errors[0].reason == "quotaExceeded") {
						quotaExceeded();
					}
					else if (err.response.data.error.errors[0].reason == "processingFailure") {
						
						setTimeout(executeLinkedComment, 10, commentId, reply);
					}
				});
	}
	
	function executeLinkedReply(replyId) {
		console.log("replyId ", replyId);
		return youtube.comments.list({
			"part": "snippet",
			"id": replyId,
			})
				.then(function(response) {
					console.log("Response received (Linked REPLY)", response);
					displayLinkedReply(replyId, response);
				},
				function(err) {
					console.error("Linked reply execute error", err.response.data.error);					
					if (err.response.data.error.errors[0].reason == "quotaExceeded") {
						quotaExceeded();
					}
					else if (err.response.data.error.errors[0].reason == "processingFailure") {
						
						setTimeout(executeLinkedReply, 10, replyId);
					}
				});
	}
	
	function executeTitle(forLinked) {
		return youtube.videos.list({
			"part": "snippet, statistics, liveStreamingDetails",
			"id": idString
		})
			.then(function(response) {
				console.log("Response received (VIDEO): ", response.data.items);
				if (response.data.pageInfo.totalResults > 0) {
					totalExpected = response.data.items[0].statistics.commentCount; // for load percentage
					videoPublished = response.data.items[0].snippet.publishedAt; // for graph bound
					uploaderId = response.data.items[0].snippet.channelId; // for highlighting OP comments
					if (!forLinked) resetPage();
					socket.emit("videoInfo", { content:displayTitle(response, locale, forLinked), reset: !forLinked } );
					executeTestComment(totalExpected, response.data.items[0].snippet.liveBroadcastContent);					
				}
				else {
					socket.emit("idInvalid");
				}
			},
				function(err) { 
					console.error("Video execute error", err.response.data.error);
					if (err.response.data.error.errors[0].reason == "quotaExceeded") {
						quotaExceeded();
					}
					else if (err.response.data.error.errors[0].reason == "processingFailure") {
						
						setTimeout(executeTitle, 1, forLinked);
					}
				});
	}
	
	function executeTestComment(count, liveBroadcastContent) {
		return youtube.commentThreads.list({
			"part": "id",
			"videoId": idString,
			"maxResults": 1
		})
			.then(function(response) {
				// for upcoming/live streams, disregard a 0 count.
				if (!(liveBroadcastContent != "none" && count == 0)) {
					let beginLoad = count < 200 && count > 0;
					socket.emit("commentInfo", { num: count, disabled: false, eta: eta(count), commence: beginLoad });
					if (beginLoad) {
						handleLoad("dateOldest");
					}
				}
			},
				function(err) {
					console.error("Test comment execute error", err.response.data.error);
					if (liveBroadcastContent == "none") {					
						if (err.response.data.error.errors[0].reason == "commentsDisabled") {
							socket.emit("commentInfo", {num: count, disabled: true, eta: "", commence: false});
						}
						else if (err.response.data.error.errors[0].reason == "processingFailure") {						
							setTimeout(executeTestComment, 1, count);
						}
						else {
							console.log("Unknown test-comment execute error");
						}
					}
				});
	}
	
	function getReplies(commentId) {
		if (loadedReplies[commentId]) {
			displayReplies(commentId);
		}
		else {
			loadedReplies[commentId] = []; //will populate
			executeReplies(commentId, "", []);
		}
	}
	
	function executeReplies(commentId, nxtPageToken, replies) {
		return youtube.comments.list({
			"part": "snippet",
			"maxResults": 100,
			"parentId": commentId,
			"pageToken": nxtPageToken
			})
				.then(function(response) {
					// replies.concat(response.data.items);
					// static bc Objects
					Array.prototype.push.apply(replies, response.data.items);
					if (response.data.nextPageToken) {
						executeReplies(commentId, response.data.nextPageToken, replies);
					}
					else {
						loadedReplies[commentId] = replies;
						console.log("got replies: " + loadedReplies[commentId].length);
						displayReplies(commentId);
					}
	
				},
					function(err) {
						console.error("Replies execute error", err);
						if (err.response.data.error.errors[0].reason == "quotaExceeded") {
							quotaExceeded();
						}
						else if (err.response.data.error.errors[0].reason == "processingFailure") {
							setTimeout(executeReplies, 1, commentId, nxtPageToken, replies);
						}                                
					});
	}

	function displayReplies(commentId) {
		let newContent = "";
		let len = loadedReplies[commentId].length;
		let className, isLinked;
		for (let i = len - 1; i >= 0; i--) {
			isLinked = loadedReplies[commentId][i].id == currentLinked;
			className = isLinked ? "linked" : "commentThreadDiv";
			newContent +=`<div class="` + className + `">` + formatCommentThread(loadedReplies[commentId][i], idString, uploaderId, locale, len - i, isLinked, true)
				+ `</div>`;
		}
		//let replyHint = "Hide " + len + " replies";
		socket.emit("renderedReplies", { content: newContent, id: commentId, num: len });
		shownReplies[commentId] = true;
	}
	
	function displayComment(response, isLinked) {
		let html = `<hr><section class="linkedSec"><div class="commentThreadDiv">`
			+ formatCommentThread(response.data.items[0], idString, uploaderId, locale, -1, isLinked) + `</div></section><hr><br>`;
		socket.emit("renderedLinked", html);
	}
	
	function displayLinkedReply(id, response) {
		let text = `<div class="linked">` + formatCommentThread(response.data.items[0], idString, uploaderId, locale, -1, true, true) + `</div>`;
		socket.emit("renderedLinkedReply", { html: text, commentId: id });
	}

	function makeGraph() {
		let len = allComments.length;
		let dates = {};
		let startDate = (allComments[len - 1].snippet.topLevelComment.snippet.publishedAt < videoPublished)
			? new Date(allComments[len - 1].snippet.topLevelComment.snippet.publishedAt) : new Date(videoPublished);
		let endDate = new Date();
		let currentDate = startDate;
		while (currentDate <= endDate) {
			dates[(new Date(currentDate).toISOString().substring(0, 10))] = 0;
			currentDate.setDate(currentDate.getDate() + 1);
		}
		// Populate dates from comments
		for (let i = 0; i < len; i++) {
			dates[(allComments[i].snippet.topLevelComment.snippet.publishedAt).substring(0, 10)]++;
		}

		let data = [];
		for (let key in dates) {
			data.push({x: key, y: dates[key]});
		}
		
		socket.emit("graphData", {data:data, published:videoPublished});
	}
	
  	socket.on('disconnect', function () {
    	console.log('user disconnected');
  	});
  	socket.on('chat message', function (msg) {
    	console.log('message: ' + msg);
    	io.emit('chat message', msg);
  	});
  	socket.on('idSent', function (id) {
		checkSendID(id);
	});
	socket.on("requestAll", function() {
		console.log("totalExpectd", totalExpected);
		if (totalExpected < MAX) {
			handleLoad("dateOldest");
		}
		else {
			console.log("Illegal request - totalExpected = " + totalExpected);
		}
	})
	socket.on("showMore", function() {
		displayLoadedComments();
	});
	socket.on("sortRequest", function (type) {
		console.log("sort type: " + type);
		if (type != currentSort) { doSort(type); }
		else { console.log("(ERROR) - received illegal request for sort " + type); }
	});
	socket.on("replyRequest", function (id) {
		getReplies(id);
	});
	socket.on("graphRequest", function() {
		if (allComments.length >= 50) {
			makeGraph();
		}
		else {
			console.log("Illegal graph requested for " + allComments.length);
		}
	});
});

http.listen(8000, function () {
	console.log('listening on *:8000');
});

//Initialize yt api library
const youtube = google.youtube({
	version: "v3",
	auth: config.GAPI_KEY
});

function parseDate(iso, locale) {
	// Uses user's timezone, but doesn't support daylight saving (same timezone year-round like Skype)
	// let fakeDate = new Date(new Date(iso).getTime() + locale.timezone * 60 * 1000);

	// server time
	let date = new Date(iso);

    // return DAYS[date.getDay()] + " " + MONTHS[date.getMonth()] + " " + date.getDate() + " " + iso.substring(0, 4)
	//     + " - " + date.toLocaleTimeString(locale);
    return date.toLocaleString(locale.lang);
}

// function comma(x) {
//     // https://stackoverflow.com/a/2901298
//     return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
// }

function bubbleSort(comments) {
    let change = true;
    let len = comments.length;
    while (change) {
        change = false;
        for (let i = 0; i < len - 1; i++) {
            if (comments[i].snippet.topLevelComment.snippet.likeCount < comments[i + 1].snippet.topLevelComment.snippet.likeCount) {
                change = true;
                let thing = comments[i];
                comments[i] = comments[i + 1];
                comments[i + 1] = thing;
            }
        }
    }
}

function merge(arr, l, m, r) { 
    let i, j, k; 
    let n1 = m - l + 1; 
    let n2 = r - m;

    let left = [], right = [];
    for (i = 0; i < n1; i++) 
        left[i] = arr[l + i]; 
    for (j = 0; j < n2; j++) 
        right[j] = arr[m + 1 + j];

    i = 0;
    j = 0;
    k = l;
    while (i < n1 && j < n2) {
        if (left[i].snippet.topLevelComment.snippet.likeCount > right[j].snippet.topLevelComment.snippet.likeCount)
            arr[k++] = left[i++];
        else
            arr[k++] = right[j++];
    }
    while (i < n1) { 
        arr[k++] = left[i++];
    }
    while (j < n2) { 
        arr[k++] = right[j++];
    } 
}
function mergeSort(arr, l, r) { 
    if (l < r) {
        let m = l + Math.floor((r-l)/2);
        mergeSort(arr, l, m); 
        mergeSort(arr, m+1, r);            
        merge(arr, l, m, r); 
    } 
}

function reSort(comments) {
	if (comments.length > 1 && comments[0].snippet.topLevelComment.snippet.publishedAt < comments[1].snippet.topLevelComment.snippet.publishedAt) {
		// binary search to be fancy
		let key = comments[0].snippet.topLevelComment.snippet.publishedAt;
		let l = 0;
		let r = comments.length - 1;
		let m;
		while (l <= r) {
			m = l + Math.floor((r-l)/2);
			if (comments[m].snippet.topLevelComment.snippet.publishedAt > key) {
				l = m + 1;
			}
			else if (comments[m].snippet.topLevelComment.snippet.publishedAt < key) {
				r = m - 1;
			}
			else {
				break;
			}
		}
		comments.splice(m, 0, comments.shift());
		console.log("found pinned, inserted at index " + m);
	}
}

function eta(count) {
	let seconds = Math.floor(count / 250) + 1;
	let etaTime = (seconds > 60) ? Math.floor(seconds / 60) + " min" : seconds + " seconds";
	return "Estimated load time: " + etaTime;
}

function formatCommentThread(item, videoId, uploaderId, locale, number, linked = false, reply = false) {
	let content = "";
	let mainComment;
    let replyCount = -1;
	let contentClass;
	if (reply) {
		mainComment = item;
		contentClass = "replyContent";
	}
	else {
		mainComment = item.snippet.topLevelComment;
		contentClass = "commentContent";
        replyCount = item.snippet.totalReplyCount;
	}

	let publishedAt = mainComment.snippet.publishedAt;
	let updatedAt = mainComment.snippet.updatedAt;
	let channelUrl = mainComment.snippet.authorChannelUrl;
	let commentId = mainComment.id;
	let likeCount = mainComment.snippet.likeCount;
	let pfpUrl = mainComment.snippet.authorProfileImageUrl;
	let displayName = mainComment.snippet.authorDisplayName;
	let textDisplay = mainComment.snippet.textDisplay;
	// Checking existence for this because one time it was left out for some reason
	let channelId = mainComment.snippet.authorChannelId ? mainComment.snippet.authorChannelId.value : "";
	    
    let linkedSegment = "";
    let replySegment = "";
	let likeSegment = "";
	let numSegment = "";
	let opSegment = "";

    let timeString = parseDate(publishedAt, locale);
    if (publishedAt != updatedAt) {
        timeString += ` ( <i class="fas fa-pencil-alt"></i> edited ` + parseDate(updatedAt, locale) + `)`;
	}
	
    if (linked) {
        linkedSegment = `<span class="linkedComment">• LINKED COMMENT</span>`;
        //className = "linked";
        //if (reply) className = "linked";
    }
    
    // second condition included for safety
    if (replyCount > 0 && !reply) {
        replySegment = `
            <div id="replies-` + commentId + `" class="commentRepliesDiv">
                <div class="repliesExpanderCollapsed">
                    <button id="getReplies-` + commentId + `" class="showHideButton" type="button">
                        <span id="replyhint-` + commentId + `" class="showHideText">Load ` + replyCount + ` replies</span>
                    </button>
                </div>
                <div id="repliesEE-` + commentId + `" class="repliesExpanderExpanded">
                    
                </div>
            </div>
        `;
    }
    
    if (likeCount) {
        likeSegment += `<div class="commentFooter"><i class="fas fa-thumbs-up"></i> ` + likeCount.toLocaleString() + `</div>`;
    }
    else {
        likeSegment += `<div class="commentFooter"></div>`;
	}

	if (number > 0) numSegment += `<span class="num">#` + number + `</span>`;

	if (channelId == uploaderId) opSegment += `class="authorNameCreator"`;

    content += `
		<a class="channelPfpLink" href="` + channelUrl + `" target="_blank">
			<img class="pfp" src="` + pfpUrl + `">
		</a>

		<div class="` + contentClass +`">
			<div class="commentHeader">
				<span ` + opSegment + `><a href="` + channelUrl + `" class="authorName" target="_blank">` + displayName + `</a></span>
				<span>|</span>
				<span class="timeStamp">
					<a href="https://www.youtube.com/watch?v=` + videoId + `&lc=` + commentId + `" class="timeStampLink" target="_blank">
						` + timeString + `
					</a>
				</span>
				` + linkedSegment + numSegment + `
			</div>
			<div class="commentText">` + textDisplay + `</div>
			` + likeSegment + replySegment + `
		</div>
    `;

    return content;
}

function displayTitle(response, locale, useCount) {
    let liveState = response.data.items[0].snippet.liveBroadcastContent;

    // casting in order to use toLocaleString()
	let viewCount = Number(response.data.items[0].statistics.viewCount);
    let likeCount = Number(response.data.items[0].statistics.likeCount);
    let dislikeCount = Number(response.data.items[0].statistics.dislikeCount);
    let commentCount = Number(response.data.items[0].statistics.commentCount);

    let ratingsSec = `<div class="ratings">`;
    if (typeof response.data.items[0].statistics.likeCount === "undefined") {
        ratingsSec += `<i class="fas fa-thumbs-up"></i> <span class="it">Ratings have been hidden.</span>`;
    }
    else {
        ratingsSec += `<i class="fas fa-thumbs-up"></i> ` + likeCount.toLocaleString() + 
            `&nbsp;&nbsp;&nbsp;&nbsp;<i class="fas fa-thumbs-down"></i> ` + dislikeCount.toLocaleString();
    }
    ratingsSec += `</div>`;

    let viewcountSec = `<div class="viewcount"><i class="fas fa-eye"></i> `;
    let timestampSec = `<div class="vidTimestamp">`;
	let commentCountSec = `<div id="commentInfo" class="commentCount">`;
	let streamTimesSec = ``;
    if (liveState == "live") {
        let concurrentViewers = Number(response.data.items[0].liveStreamingDetails.concurrentViewers);
        viewcountSec += `<span class="concurrent">` + concurrentViewers.toLocaleString() + ` watching now</span> / `
            + viewCount.toLocaleString() + ` total views`;
        let startTime = new Date(response.data.items[0].liveStreamingDetails.actualStartTime);                    
        let diffMs = (new Date() - startTime); // milliseconds
        let diffHrs = Math.floor(diffMs / 3600000); // hours
        let diffMins = Math.floor(((diffMs % 86400000) % 3600000) / 60000); // minutes
        let diffSecs = Math.round((((diffMs % 86400000) % 3600000) % 60000) / 1000);
        timestampSec += `<strong>Stream start time:</strong> ` + parseDate(startTime.toISOString(), locale)
            + ` (Elapsed: ` + diffHrs + `h ` + diffMins + `m ` + diffSecs + `s)`;
    }
    else if (liveState == "upcoming") {
        viewcountSec += `<span class="concurrent">Upcoming live stream</span>`;
        timestampSec += `<strong><i class="fas fa-calendar"></i> Published:</strong> `
            + parseDate(response.data.items[0].snippet.publishedAt, locale) + `<br><i class="fas fa-clock"></i> <strong>Scheduled start time:</strong> `
            + parseDate(response.data.items[0].liveStreamingDetails.scheduledStartTime, locale);
    }
    else {
		// YT premium shows don't return viewcount
		if (typeof response.data.items[0].statistics.viewCount === "undefined") {
			viewcountSec += ` <span class="it">View count unavailable</span>`;
		}
		else {
			viewcountSec += viewCount.toLocaleString() + ` views`;
		}
        
        timestampSec += `<strong><i class="fas fa-calendar"></i> Published:</strong> ` + parseDate(response.data.items[0].snippet.publishedAt, locale);

        if (typeof response.data.items[0].liveStreamingDetails !== "undefined") {
            streamTimesSec += `<div class="streamTimes"><strong>Stream start time:</strong> `
                + parseDate(response.data.items[0].liveStreamingDetails.actualStartTime, locale)
                + `<br><strong>Stream end time:</strong> ` + parseDate(response.data.items[0].liveStreamingDetails.actualEndTime, locale) + `</div>`;
        }

        commentCountSec += `<i class="fas fa-comment"></i> `;
        commentCountSec += useCount ? Number(commentCount).toLocaleString() + ` comments` : ` Loading comment information...`;
	}
    viewcountSec += `</div>`;
    timestampSec += `</div>`;
	commentCountSec += `</div>`;

    let newContent = `
        <img class="thumbnail" src="` + response.data.items[0].snippet.thumbnails.medium.url + `">
        <div class="metadata">
            <div class="vidTitle">
                <a class="authorName" href="https://www.youtube.com/watch?v=` + response.data.items[0].id + `" target="_blank">
                    ` + response.data.items[0].snippet.title + `
                </a>
            </div>
            <div class="author">
				<a class="authorLink" href="https://www.youtube.com/channel/` + response.data.items[0].snippet.channelId
					+ `" target="_blank">` + response.data.items[0].snippet.channelTitle + `</a>
            </div>
            <div class="moreMeta">
                ` + viewcountSec + `
                ` + ratingsSec + `
                ` + timestampSec + `
            </div>
		</div>
		` + streamTimesSec + `
        ` + commentCountSec + `
    `;
	//vidInfo.innerHTML = newContent;
	//socket.emit("videoInfo", newContent);
	return newContent;
}

console.log("begin");

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MAXDISPLAY = 100;
const MAX = 100000;

//loadClient();
//window.onload = loadClient();