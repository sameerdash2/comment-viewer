function displayTitle(response, useCount) {
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
        timestampSec += `<strong>Stream start time:</strong> ` + parseDate(startTime.toISOString())
            + ` (Elapsed: ` + diffHrs + `h ` + diffMins + `m ` + diffSecs + `s)`;
    }
    else if (liveState == "upcoming") {
        viewcountSec += `<span class="concurrent">Upcoming live stream</span>`;
        timestampSec += `<strong><i class="fas fa-calendar"></i> Published:</strong> `
            + parseDate(response.data.items[0].snippet.publishedAt) + `<br><i class="fas fa-clock"></i> <strong>Scheduled start time:</strong> `
            + parseDate(response.data.items[0].liveStreamingDetails.scheduledStartTime);
    }
    else {
		// YT premium shows don't return viewcount
		if (typeof response.data.items[0].statistics.viewCount === "undefined") {
			viewcountSec += ` <span class="it">View count unavailable</span>`;
		}
		else {
			viewcountSec += viewCount.toLocaleString() + ` views`;
		}
        
        timestampSec += `<strong><i class="fas fa-calendar"></i> Published:</strong> ` + parseDate(response.data.items[0].snippet.publishedAt);

        if (typeof response.data.items[0].liveStreamingDetails !== "undefined") {
            streamTimesSec += `<div class="streamTimes"><strong>Stream start time:</strong> `
                + parseDate(response.data.items[0].liveStreamingDetails.actualStartTime)
                + `<br><strong>Stream end time:</strong> ` + parseDate(response.data.items[0].liveStreamingDetails.actualEndTime) + `</div>`;
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

function parseDate(iso) {
    let date = new Date(iso);
    
    // Uses client's locale

    /* return DAYS[date.getDay()] + " " + MONTHS[date.getMonth()] + " " + date.getDate() + " " + iso.substring(0, 4)
        + " - " + date.toLocaleTimeString(); */
    return date.toLocaleString();
}