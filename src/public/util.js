function formatTitle(video, options) {
    let liveState = video.snippet.liveBroadcastContent;

    // casting in order to use toLocaleString()
	let viewCount = Number(video.statistics.viewCount);
    let likeCount = Number(video.statistics.likeCount);
    let dislikeCount = Number(video.statistics.dislikeCount);

    let thumbnailSec = ``;
    if (options.showImg) thumbnailSec += `<img class="thumbnail" src="` + video.snippet.thumbnails.medium.url + `">`;

    let ratingsSec = `<div class="ratings">`;
    if (typeof video.statistics.likeCount === "undefined") {
        ratingsSec += `<i class="fas fa-thumbs-up"></i> <span class="gray">Ratings have been hidden.</span>`;
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
        let concurrentViewers = Number(video.liveStreamingDetails.concurrentViewers);
        viewcountSec += `<span class="red">` + concurrentViewers.toLocaleString() + ` watching now</span> / `
            + viewCount.toLocaleString() + ` total views`;
        let startTime = new Date(video.liveStreamingDetails.actualStartTime);
        let duration = (new Date().getTime() - startTime.getTime());
        timestampSec += `<i class="fas fa-clock"></i> <strong>Stream start time:</strong> ` + parseTimestamp(startTime.toISOString(), options.timezone)
            + ` (Elapsed: ` + parseDurationHMMSS(Math.floor(duration / 1000)) + `)`;
    }
    else if (liveState == "upcoming") {
        viewcountSec += `<span class="red">Upcoming live stream</span>`;
        timestampSec += `<strong><i class="fas fa-calendar"></i> Published:</strong> `
            + parseTimestamp(video.snippet.publishedAt, options.timezone) + `<br><i class="fas fa-clock"></i> <strong>Scheduled start time:</strong> `
            + parseTimestamp(video.liveStreamingDetails.scheduledStartTime, options.timezone);
    }
    else {
		// YT premium shows don't return viewcount
		if (typeof video.statistics.viewCount === "undefined") {
			viewcountSec += ` <span class="gray">View count unavailable</span>`;
		}
		else {
			viewcountSec += viewCount.toLocaleString() + ` views`;
		}
        
        timestampSec += `<strong><i class="fas fa-calendar"></i> Published:</strong> ` + parseTimestamp(video.snippet.publishedAt, options.timezone);

        if (typeof video.liveStreamingDetails !== "undefined") {
            streamTimesSec += `<div class="streamTimes"><i class="fas fa-clock"></i> <strong>Stream start time:</strong> `
                + parseTimestamp(video.liveStreamingDetails.actualStartTime, options.timezone) + `</div>`;
        }

        commentCountSec += `<i class="fas fa-comment"></i> Loading comment information...`;
	}
    viewcountSec += `</div>`;
    timestampSec += `</div>`;
    commentCountSec += `</div>`;

    let newContent = `
        ` + thumbnailSec + `
        <div class="metadata">
            <div class="vidTitle">
                <a class="authorName" href="https://www.youtube.com/watch?v=` + video.id + `" target="_blank">
                    ` + video.snippet.title + `
                </a>
            </div>
            <div class="author">
				<a class="authorLink" href="https://www.youtube.com/channel/` + video.snippet.channelId
					+ `" target="_blank">` + video.snippet.channelTitle + `</a>
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
	return newContent;
}

function formatComment(item, number, options, uploaderId, videoId, linked = false, reply = false) {
	let content = "";
	let mainComment;
    let replyCount = -1;
	let contentClass;
	if (reply) {
		mainComment = item;
		contentClass = options.showImg ? "replyContent" : "replyContentFull";
	}
	else {
		mainComment = item.snippet.topLevelComment;
		contentClass = options.showImg ? "commentContent" : "commentContentFull";
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
    let pfpSegment = "";

    let timeString = parseTimestamp(publishedAt, options.timezone);
    if (publishedAt != updatedAt) {
        timeString += ` ( <i class="fas fa-pencil-alt"></i> edited ` + parseTimestamp(updatedAt, options.timezone) + `)`;
	}
	
    if (linked) linkedSegment = `<span class="linkedComment">• LINKED COMMENT</span>`;
    
    // second condition included for safety
    if (replyCount > 0 && !reply) {
        replySegment = `
            <div id="replies-` + commentId + `" class="commentRepliesDiv">
                <div class="repliesExpanderCollapsed">
                    <button id="getReplies-` + commentId + `" class="showHideButton" type="button">
                        Load ` + replyCount + ` replies
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

    let authorClass = "authorName";
    if (channelId == uploaderId) { 
        opSegment += `class="authorNameCreator"`;
        authorClass = "authorNameOp";
    }
    
    if (options.showImg) {
        pfpSegment += `<a class="channelPfpLink" href="` + channelUrl + `" target="_blank"><img class="pfp" src="` + pfpUrl + `"></a>`;
    }

    content += 
        pfpSegment
        + `<div class="` + contentClass +`">
			<div class="commentHeader">
				<span ` + opSegment + `><a href="` + channelUrl + `" class="` + authorClass + `" target="_blank">` + displayName + `</a></span>
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

function parseTimestamp(iso, timezone) {
    let date = new Date(iso);

    let output;
    switch (timezone) {
        case "utc":
            output = date.toISOString().substring(0, 10) + " " + date.toISOString().substring(11,19);
            break;
        case "local":
        default:
            output = date.toLocaleString();
    }
    return output;
}

function parseDurationMSS(timeSeconds) {
    let minutes = Math.floor(timeSeconds / 60);
    let seconds = timeSeconds % 60;
    return minutes + ':' + ('0' + seconds).slice(-2);
}

function parseDurationHMMSS(timeSeconds) {
    let hours = Math.floor(timeSeconds / 60 / 60);
    let minutes = Math.floor(timeSeconds / 60) % 60;
    let seconds = timeSeconds % 60;
    return hours + ':' + ('0' + minutes).slice(-2) + ':' + ('0' + seconds).slice(-2);
}

function eta(x) {
    // Estimates number of seconds to load x comments
    return Math.floor(x / 250) + 1;
}