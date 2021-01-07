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

function printTimestamp(date) {
    return date.toLocaleString('en-ca-u-hc-h23',
        {timeZone: "America/Los_Angeles", timeZoneName: "short"}).replace(',', '');
}

module.exports = {
    convertComment,
    printTimestamp
}