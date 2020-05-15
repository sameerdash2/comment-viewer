const {google} = require('googleapis');
const config = require('./config.json');
let express = require('express');
let app = express();
let http = require('http').createServer(app);
let io = require('socket.io')(http);
const fs = require('fs');
// let stream = fs.createWriteStream("logs.json", {flags: 'a'});

app.use(express.static("public"));

io.on('connection', function (socket) {
	console.log('a user connected');

	let idString = "";
	let videoPublished, uploaderId;
	let loadedReplies = {};
	let currentLinked = "";
	let linkedParent = "";

	let allComments = [];
	let likedComments = [];
	let totalCount = 0;
	let totalExpected = -1;
	let currentSort;
	let commentIndex;
	let graphAvailable = false;

	let trueStart;

	function resetPage() {
		allComments = [];
		likedComments = [];
		totalCount = 0;
		graphAvailable = false;
		loadedReplies = {};
    
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
			// only one case 
			case "dateOldest":
				executeAllComments("");
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
		if (order == "dateOldest" || order == "likesLeast") {
			commentIndex = allComments.length;
		}
		else {
			commentIndex = -1;
		}
		sendLoadedComments(true);
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
				
				socket.emit("loadStatus", totalCount);
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
					
					sendLoadedComments(true);
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
	
	function sendLoadedComments(newSet = false) {
		let library = (currentSort == "likesMost" || currentSort == "likesLeast") ? likedComments : allComments;
		let len = allComments.length;
		let more = false;
	
		let goal;
		let subset;
		if (currentSort == "dateOldest" || currentSort == "likesLeast") {
			// end to start of array
			goal = Math.max(commentIndex - MAXDISPLAY, 0);
			more = goal != 0;
			subset = library.slice(goal, commentIndex).reverse();
		}
		else {
			// start to end
			goal = Math.min(commentIndex + MAXDISPLAY, len - 1);
			more = goal != len - 1;
			subset = library.slice(commentIndex + 1, goal + 1);
		}
		commentIndex = goal;
		socket.emit("groupComments", { reset: newSet, items: subset, showMore: more });
	}
	
	function executeLinkedComment(commentId, reply = false) {
		return youtube.commentThreads.list({
			"part": "snippet",
			"id": commentId
		})
			.then(function(response) {
				if (response.data.pageInfo.totalResults) {
					resetPage();
					idString = response.data.items[0].snippet.videoId;
					executeTitle(true);
					if (reply) {
						executeLinkedReply(response.data.items[0]);
					}
					else {
						sendLinkedComment(response.data.items[0]);
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
	
	function executeLinkedReply(parent) {
		return youtube.comments.list({
			"part": "snippet",
			"id": currentLinked,
			})
				.then(function(response) {
					sendLinkedComment(parent, response.data.items[0]);
				},
				function(err) {
					console.error("Linked reply execute error", err.response.data.error);					
					if (err.response.data.error.errors[0].reason == "quotaExceeded") {
						quotaExceeded();
					}
					else if (err.response.data.error.errors[0].reason == "processingFailure") {						
						setTimeout(executeLinkedReply, 10, parent);
					}
				});
	}
	
	function executeTitle(forLinked) {
		return youtube.videos.list({
			"part": "snippet, statistics, liveStreamingDetails",
			"id": idString
		})
			.then(function(response) {
				if (response.data.pageInfo.totalResults > 0) {
					totalExpected = response.data.items[0].statistics.commentCount; // for load percentage
					videoPublished = response.data.items[0].snippet.publishedAt; // for graph bound
					uploaderId = response.data.items[0].snippet.channelId; // for highlighting OP comments
					if (!forLinked) resetPage();
					socket.emit("videoInfo", { video:response.data.items[0], forLinked:forLinked } );
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
					graphAvailable = count >= 50 && new Date(videoPublished).getTime() <= (new Date().getTime() - 24*60*60*1000);
					socket.emit("commentsInfo", { num: count, disabled: false, eta: eta(count),
						commence: beginLoad, max: (count > config.maxLoad) ? config.maxLoad : -1, graph: graphAvailable });
					if (beginLoad) {
						handleLoad("dateOldest");
					}
				}
			},
				function(err) {
					console.error("Test comment execute error", err.response.data.error);
					if (err.response.data.error.errors[0].reason == "quotaExceeded") {
						quotaExceeded();
					}
					else if (liveBroadcastContent == "none") {
						if (err.response.data.error.errors[0].reason == "commentsDisabled") {
							socket.emit("commentsInfo", {num: count, disabled: true, eta: "",
								commence: false, max: (count > config.maxLoad) ? config.maxLoad : -1, graph: false });
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
			sendReplies(commentId);
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
						sendReplies(commentId);
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

	function sendReplies(commentId) {
		socket.emit("newReplies", { items: loadedReplies[commentId], id: commentId});
	}

	function sendLinkedComment(parent, reply = null) {
		socket.emit("linkedComment", {parent: parent, hasReply: (reply !== null), reply: reply});
	}

	function makeGraph() {
		// Send array of ISO dates to client
		let len = allComments.length;
		let dates = [];
		for (let i = 0; i < len; i++) {
			dates.push(allComments[i].snippet.topLevelComment.snippet.publishedAt);
		}
		
		socket.emit("graphData", dates);
	}
	
  	socket.on('disconnect', function () {
    	console.log('user disconnected');
  	});
  	socket.on('idSent', function (id) {
		checkSendID(id);
	});
	socket.on("requestAll", function() {
		if (totalExpected < config.maxLoad) {
			handleLoad("dateOldest");
		}
		else {
			console.log("Illegal request - totalExpected = " + totalExpected);
		}
	})
	socket.on("showMore", function() {
		sendLoadedComments();
	});
	socket.on("sortRequest", function (type) {
		if (type != currentSort) { doSort(type); }
		else { console.log("(ERROR) - received illegal request for sort " + type); }
	});
	socket.on("replyRequest", function (id) {
		getReplies(id);
	});
	socket.on("graphRequest", function() {
		if (graphAvailable) {
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
	auth: config.gapiKey
});

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
	}
}

function eta(count) {
	let seconds = Math.floor(count / 250) + 1;
	let etaTime = (seconds > 60) ? Math.floor(seconds / 60) + " min" : seconds + " seconds";
	return "Estimated load time: " + etaTime;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const MAXDISPLAY = 100;