export function formatTitle(video, options) {
    const liveState = video.snippet.liveBroadcastContent;

    // casting in order to use toLocaleString
	const viewCount = Number(video.statistics.viewCount);
    const likeCount = Number(video.statistics.likeCount);
    const dislikeCount = Number(video.statistics.dislikeCount);

    if (options.showImg) {
        document.getElementById("thumb").style.display = "inline-block";
        document.getElementById("thumb").src = video.snippet.thumbnails.medium.url;
    }
    else {
        document.getElementById("thumb").style.display = "none";
    }

    document.getElementById("videoTitle").textContent = video.snippet.title;
    document.getElementById("videoTitle").href = `https://www.youtube.com/watch?v=${video.id}`;

    document.getElementById("uploader").textContent = video.snippet.channelTitle;
    document.getElementById("uploader").href = `https://www.youtube.com/channel/${video.snippet.channelId}`;

    if (typeof video.statistics.likeCount === "undefined") {
        document.getElementById("ratings").innerHTML = `<i class="fas fa-thumbs-up"></i> <span class="gray">Ratings have been hidden.</span>`;
    }
    else {
        document.getElementById("ratings").innerHTML = 
            `<i class="fas fa-thumbs-up"></i> ${likeCount.toLocaleString()}&nbsp;&nbsp;&nbsp;&nbsp;
            <i class="fas fa-thumbs-down"></i> ${dislikeCount.toLocaleString()}`;
    }

    let viewcountSec = `<i class="fas fa-eye"></i> `;
    let timestampSec = ``;
    if (liveState == "live") {
        const concurrentViewers = Number(video.liveStreamingDetails.concurrentViewers);
        viewcountSec += `<span class="red">${concurrentViewers.toLocaleString()} watching now</span> / ${viewCount.toLocaleString()} total views`;

        const startTime = new Date(video.liveStreamingDetails.actualStartTime);
        const duration = (new Date().getTime() - startTime.getTime());
        timestampSec += `<i class="fas fa-clock"></i> <strong>Stream start time:</strong> ${parseTimestamp(startTime.toISOString(), options.timezone)}
            (Elapsed: ${parseDurationHMMSS(Math.floor(duration / 1000))})`;
    }
    else if (liveState == "upcoming") {
        viewcountSec += `<span class="red">Upcoming live stream</span>`;
        timestampSec += `<strong><i class="fas fa-calendar"></i> Published:</strong> ${parseTimestamp(video.snippet.publishedAt, options.timezone)}<br>
            <i class="fas fa-clock"></i> <strong>Scheduled start time:</strong> ${parseTimestamp(video.liveStreamingDetails.scheduledStartTime, options.timezone)}`;
    }
    else {
		// YT premium shows don't return viewcount
		if (typeof video.statistics.viewCount === "undefined") {
			viewcountSec += ` <span class="gray">View count unavailable</span>`;
		}
		else {
			viewcountSec += `${viewCount.toLocaleString()} views`;
		}
        
        timestampSec += `<strong><i class="fas fa-calendar"></i> Published:</strong> ${parseTimestamp(video.snippet.publishedAt, options.timezone)}`;

        if (typeof video.liveStreamingDetails !== "undefined") {
            timestampSec += `<br><div class="streamTimes"><i class="fas fa-clock"></i> <strong>Stream start time:</strong> 
                ${parseTimestamp(video.liveStreamingDetails.actualStartTime, options.timezone)}</div>`;
        }

        document.getElementById("commentInfo").innerHTML = `<i class="fas fa-comment"></i> <span class="gray">Loading comment information...</span>`;
    }
    document.getElementById("viewcount").innerHTML = viewcountSec;
    document.getElementById("vidTimestamp").innerHTML = timestampSec;

    document.getElementById("info").style.display = "block";
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

export function shiftDate(date, unit, amt, isUtc) {
    switch (unit) {
        case "year":
            isUtc ? date.setUTCFullYear(date.getUTCFullYear() + amt) : date.setFullYear(date.getFullYear() + amt);
            break;
        case "month":
            isUtc ? date.setUTCMonth(date.getUTCMonth() + amt) : date.setMonth(date.getMonth() + amt);
            break;
        case "day":
            isUtc ? date.setUTCDate(date.getUTCDate() + amt) : date.setDate(date.getDate() + amt);
            break;
        case "hour":
            isUtc ? date.setUTCHours(date.getUTCHours() + amt) : date.setHours(date.getHours() + amt);
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