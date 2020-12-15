export function formatTitle(video, options) {
    const liveState = video.snippet.liveBroadcastContent;
    const viewCount = Number(video.statistics.viewCount);
    const likeCount = Number(video.statistics.likeCount);
    const dislikeCount = Number(video.statistics.dislikeCount);

    if (options.showImg) {
        document.getElementById("thumb").src = video.snippet.thumbnails.medium.url;
    }
    else {
        document.getElementById("thumbCol").style.display = "none";
    }

    document.getElementById("videoTitle").textContent = video.snippet.title;
    document.getElementById("videoTitle").href = `https://www.youtube.com/watch?v=${video.id}`;

    document.getElementById("uploader").textContent = video.snippet.channelTitle;
    document.getElementById("uploader").href = getChannelUrl(video.snippet.channelId);

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
    if (liveState === "live") {
        const concurrentViewers = Number(video.liveStreamingDetails.concurrentViewers);
        viewcountSec += `<span class="red">${concurrentViewers.toLocaleString()} watching now</span> / ${viewCount.toLocaleString()} views`;

        const startTime = new Date(video.liveStreamingDetails.actualStartTime);
        const duration = new Date().getTime() - startTime.getTime();
        timestampSec += `<b><i class="fas fa-calendar"></i> Published:</b> ${parseTimestamp(video.snippet.publishedAt, options.timezone)}<br>
            <i class="fas fa-clock"></i> <b>Stream start time:</b> ${parseTimestamp(startTime.toISOString(), options.timezone)}
            (Elapsed: ${parseDurationHMMSS(Math.floor(duration / 1000))})`;
    }
    else if (liveState === "upcoming") {
        viewcountSec += `<span class="red">Upcoming live stream</span>`;
        timestampSec += `<b><i class="fas fa-calendar"></i> Published:</b> ${parseTimestamp(video.snippet.publishedAt, options.timezone)}<br>
            <i class="fas fa-clock"></i> <b>Scheduled start time:</b> ${parseTimestamp(video.liveStreamingDetails.scheduledStartTime, options.timezone)}`;
    }
    else {
        // Handle missing viewcount (seen in YT premium shows)
        viewcountSec += (typeof video.statistics.viewCount === "undefined")
            ? ` <span class="gray">View count unavailable</span>`
            : `${viewCount.toLocaleString()} views`;

        timestampSec += `<b><i class="fas fa-calendar"></i> Published:</b> ${parseTimestamp(video.snippet.publishedAt, options.timezone)}`;

        if (typeof video.liveStreamingDetails !== "undefined") {
            timestampSec += `<br><div class="streamTimes"><i class="fas fa-clock"></i> <b>Stream start time:</b> 
                ${parseTimestamp(video.liveStreamingDetails.actualStartTime, options.timezone)}</div>`;
        }

        document.getElementById("commentInfo").innerHTML = `<i class="fas fa-comment"></i>&nbsp;<span class="gray">Loading comment information...</span>`;
    }
    document.getElementById("viewcount").innerHTML = viewcountSec;
    document.getElementById("vidTimestamp").innerHTML = timestampSec;

    document.getElementById("info").style.display = "block";
}

export function formatComment(item, number, options, uploaderId, videoId, reply = false) {
    let content = "";
    let contentClass;
    if (reply) {
        contentClass = options.showImg ? "replyContent" : "replyContentFull";
    }
    else {
        contentClass = options.showImg ? "commentContent" : "commentContentFull";
    }
    const channelUrl = getChannelUrl(item.authorChannelId);
    let replySegment = "";
    let likeSegment = "";
    let numSegment = "";
    let opSegment = "";
    let pfpSegment = "";

    const totalReplyCount = Number(item.totalReplyCount);
    const likeCount = Number(item.likeCount);

    let timeString = parseTimestamp(item.publishedAt, options.timezone);
    if (item.publishedAt != item.updatedAt) {
        timeString += ` ( <i class="fas fa-pencil-alt"></i> edited ${parseTimestamp(item.updatedAt, options.timezone)})`;
    }

    // second condition included for safety
    if (item.totalReplyCount > 0 && !reply) {
        replySegment = `
            <div id="replies-${item.id}" class="commentRepliesDiv">
                <div class="repliesExpanderCollapsed">
                    <button id="getReplies-${item.id}" class="showHideButton btn btn-link font-weight-bold p-0" type="button">
                        &#x25BC; Load ${totalReplyCount.toLocaleString()} replies
                    </button>
                </div>
                <div id="repliesEE-${item.id}" class="repliesExpanderExpanded"></div>
            </div>
        `;
    }

    likeSegment += (item.likeCount)
        ? `<div class="commentFooter"><i class="fas fa-thumbs-up"></i> ${likeCount.toLocaleString()}</div>`
        : `<div class="commentFooter"></div>`;

    if (number > 0) {
        numSegment +=
            `<span class="num">
                <a href="https://www.youtube.com/watch?v=${videoId}&lc=${item.id}" class="noColor">#${number}</a>
            </span>`;
    }

    let authorClass = "authorName";
    if (item.authorChannelId === uploaderId) {
        opSegment += `class="authorNameCreator"`;
        authorClass = "authorNameOp";
    }

    if (options.showImg) {
        pfpSegment +=
            `<a class="channelPfpLink" href="${channelUrl}">
                <img class="pfp" src="${item.authorProfileImageUrl}">
            </a>`;
    }

    content +=
        `${pfpSegment}` +
        `<div class="${contentClass}">
            <div class="commentHeader">
                <span dir="auto"${opSegment}><a href="${channelUrl}" class="${authorClass}">${item.authorDisplayName}</a></span>
                <span>|</span>
                <span class="timeStamp">
                    <a href="https://www.youtube.com/watch?v=${videoId}&lc=${item.id}" class="noColor">${timeString}</a>
                </span>
                ${numSegment}
            </div>
            <div class="commentText" dir="auto">${item.snippet || item.textDisplay}</div>
            ${likeSegment}${replySegment}
        </div>`;

    return content;
}

export function getChannelUrl(channelId) {
    return `https://www.youtube.com/channel/${channelId}`;
}

export function parseTimestamp(iso, timezone) {
    const date = new Date(iso);
    if (isNaN(date)) {
        return `<span class="gray">(No date)</span>`;
    }

    let output;
    switch (timezone) {
        case "utc":
            output = date.toISOString().substring(0, 19).replace('T', ' ');
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
    const minutes = Math.floor(timeSeconds / 60);
    const seconds = timeSeconds % 60;
    return minutes + ':' + ('0' + seconds).slice(-2);
}

export function parseDurationHMMSS(timeSeconds) {
    const hours = Math.floor(timeSeconds / 60 / 60);
    const minutes = Math.floor(timeSeconds / 60) % 60;
    const seconds = timeSeconds % 60;
    return hours + ':' + ('0' + minutes).slice(-2) + ':' + ('0' + seconds).slice(-2);
}

export function eta(x) {
    // Estimates number of seconds to load x comments
    return Math.floor(x / 250) + 1;
}