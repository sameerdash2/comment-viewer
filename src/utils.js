class Utils {

    static convertComment(object, isReply = false) {
        let comment = isReply ? object : object.snippet.topLevelComment;
        let replyCount = isReply ? 0 : object.snippet.totalReplyCount;
        // Channel ID is sometimes randomly left out
        let channelId = comment.snippet.authorChannelId ? comment.snippet.authorChannelId.value : "";
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

}

module.exports = Utils;