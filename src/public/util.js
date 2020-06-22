export function formatTitle(video, options) {
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
            timestampSec += `<br><div class="streamTimes"><i class="fas fa-clock"></i> <strong>Stream start time:</strong> `
                + parseTimestamp(video.liveStreamingDetails.actualStartTime, options.timezone) + `</div>`;
        }

        commentCountSec += `<i class="fas fa-comment"></i> Loading comment information...`;
	}
    viewcountSec += `</div>`;
    timestampSec += `</div>`;
    commentCountSec += `</div>`;

    let newContent = 
        thumbnailSec
        + `<div id="metadata">
            <div class="vidTitle">
                <a class="authorName" href="https://www.youtube.com/watch?v=` + video.id + `" target="_blank">
                    ` + video.snippet.title + `
                </a>
            </div>
            <div class="author">
				<a class="noColor" href="https://www.youtube.com/channel/` + video.snippet.channelId
					+ `" target="_blank">` + video.snippet.channelTitle + `</a>
            </div>
            <div class="moreMeta">
                ` + viewcountSec + `
                ` + ratingsSec + `
                ` + timestampSec + `
            </div>
		</div>
		` + commentCountSec + `
    `;
	return newContent;
}

export function formatComment(item, number, options, uploaderId, videoId, linked = false, reply = false) {
	let content = "";
	let contentClass;
	if (reply) {
		contentClass = options.showImg ? "replyContent" : "replyContentFull";
	}
	else {
		contentClass = options.showImg ? "commentContent" : "commentContentFull";
	}
	let channelUrl = "https://www.youtube.com/channel/" + item.authorChannelId;
	    
    let linkedSegment = "";
    let replySegment = "";
	let likeSegment = "";
	let numSegment = "";
    let opSegment = "";
    let pfpSegment = "";

    let timeString = parseTimestamp(item.publishedAt, options.timezone);
    if (item.publishedAt != item.updatedAt) {
        timeString += ` ( <i class="fas fa-pencil-alt"></i> edited ` + parseTimestamp(item.updatedAt, options.timezone) + `)`;
	}
	
    if (linked) linkedSegment = `<span class="linkedComment">• LINKED COMMENT</span>`;
    
    // second condition included for safety
    if (item.totalReplyCount > 0 && !reply) {
        replySegment = `
            <div id="replies-` + item.id + `" class="commentRepliesDiv">
                <div class="repliesExpanderCollapsed">
                    <button id="getReplies-` + item.id + `" class="showHideButton" type="button">
                        Load ` + item.totalReplyCount + ` replies
                    </button>
                </div>
                <div id="repliesEE-` + item.id + `" class="repliesExpanderExpanded">
                    
                </div>
            </div>
        `;
    }
    
    if (item.likeCount) {
        likeSegment += `<div class="commentFooter"><i class="fas fa-thumbs-up"></i> ` + item.likeCount.toLocaleString() + `</div>`;
    }
    else {
        likeSegment += `<div class="commentFooter"></div>`;
	}

    if (number > 0) {
        numSegment +=
            `<span class="num"><a href="https://www.youtube.com/watch?v=` + videoId + `&lc=` + item.id
            + `" class="noColor" target="_blank">#` + number + `</a></span>`;
    }

    let authorClass = "authorName";
    if (item.authorChannelId == uploaderId) { 
        opSegment += `class="authorNameCreator"`;
        authorClass = "authorNameOp";
    }
    
    if (options.showImg) {
        pfpSegment += `<a class="channelPfpLink" href="` + channelUrl + `" target="_blank"><img class="pfp" src="` + item.authorProfileImageUrl + `"></a>`;
    }

    content += 
        pfpSegment
        + `<div class="` + contentClass +`">
			<div class="commentHeader">
				<span dir="auto"` + opSegment + `><a href="` + channelUrl + `" class="` + authorClass + `" target="_blank">` + item.authorDisplayName + `</a></span>
				<span>|</span>
				<span class="timeStamp">
					<a href="https://www.youtube.com/watch?v=` + videoId + `&lc=` + item.id + `" class="noColor" target="_blank">
						` + timeString + `
					</a>
				</span>
				` + linkedSegment + numSegment + `
			</div>
			<div class="commentText" dir="auto">` + item.textDisplay + `</div>
			` + likeSegment + replySegment + `
		</div>
    `;

    return content;
}

export function parseTimestamp(iso, timezone) {
    let date = new Date(iso);
    if (isNaN(date)) {
        return `<span class="gray">(No date)</span>`;
    }

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

export function incrementDate(date, unit, isUtc) {
    switch (unit) {
        case "year":
            isUtc ? date.setUTCFullYear(date.getUTCFullYear() + 1) : date.setFullYear(date.getFullYear() + 1);
            break;
        case "month":
            isUtc ? date.setUTCMonth(date.getUTCMonth() + 1) : date.setMonth(date.getMonth() + 1);
            break;
        case "day":
            isUtc ? date.setUTCDate(date.getUTCDate() + 1) : date.setDate(date.getDate() + 1);
            break;
        case "hour":
            isUtc ? date.setUTCHours(date.getUTCHours() + 1) : date.setHours(date.getHours() + 1);
            break;
    }
}

export function floorDate(date, unit, isUtc) {
    switch (unit) {
        // No breaks, because each date needs to be floored down to the smallest unit.
        case "year":
            isUtc ? date.setUTCMonth(0) : date.setMonth(0);
        case "month":
            isUtc ? date.setUTCDate(1) : date.setDate(1);
        case "day":
            isUtc ? date.setUTCHours(0) : date.setHours(0);
        case "hour":
            isUtc ? date.setUTCMinutes(0, 0, 0) : date.setMinutes(0, 0, 0);
    }
    return date;
}

export function parseDurationMSS(timeSeconds) {
    let minutes = Math.floor(timeSeconds / 60);
    let seconds = timeSeconds % 60;
    return minutes + ':' + ('0' + seconds).slice(-2);
}

export function parseDurationHMMSS(timeSeconds) {
    let hours = Math.floor(timeSeconds / 60 / 60);
    let minutes = Math.floor(timeSeconds / 60) % 60;
    let seconds = timeSeconds % 60;
    return hours + ':' + ('0' + minutes).slice(-2) + ':' + ('0' + seconds).slice(-2);
}

export function eta(x) {
    // Estimates number of seconds to load x comments
    return Math.floor(x / 250) + 1;
}