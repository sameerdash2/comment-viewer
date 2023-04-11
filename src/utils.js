// Convert comments received from API to objects that contain only necessary metadata
function convertComment(object, isReply = false) {
    const comment = isReply ? object : object.snippet.topLevelComment;
    const replyCount = isReply ? 0 : object.snippet.totalReplyCount;
    // Channel ID is sometimes randomly left out
    const channelId = comment.snippet.authorChannelId ? comment.snippet.authorChannelId.value : "";

    return ({
        id: comment.id,
        textDisplay: comment.snippet.textDisplay,
        authorDisplayName: comment.snippet.authorDisplayName,
        authorProfileImageUrl: comment.snippet.authorProfileImageUrl,
        authorChannelId: channelId,
        likeCount: comment.snippet.likeCount,
        publishedAt: new Date(comment.snippet.publishedAt).getTime(),
        updatedAt: new Date(comment.snippet.updatedAt).getTime(),
        totalReplyCount: replyCount
    });
}

// Returns a timestamp in the format `YYYY-MM-DD hh:mm:ss {timeZoneName}` in Pacific time.
function printTimestamp(date) {
    const datePart = date.toLocaleDateString("fr-ca", {
        timeZone: "America/Los_Angeles",
    });
    const timePart = date.toLocaleTimeString("en-us", {
        timeZone: "America/Los_Angeles",
        hourCycle: "h23",
        timeZoneName: "short"
    });
    return `${datePart} ${timePart}`;
}

// Returns a Unix timestamp of the next occurence of a given day of the week (at a given hour)
// 0 = Sunday, 6 = Saturday
function getNextUTCTimestamp(dayOfWeek, hour) {
    const nextOccurence = new Date();
    const diff = dayOfWeek - nextOccurence.getUTCDay();
    nextOccurence.setUTCDate(nextOccurence.getUTCDate() + diff);
    nextOccurence.setUTCHours(hour, 0, 0, 0);
    if (nextOccurence <= Date.now()) {
        nextOccurence.setUTCDate(nextOccurence.getUTCDate() + 7);
    }

    return nextOccurence.getTime();
}

module.exports = {
    convertComment,
    printTimestamp,
    getNextUTCTimestamp
}
