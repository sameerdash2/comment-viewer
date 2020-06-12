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
        if (left[i].likeCount > right[j].likeCount)
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

class Utils {

    static mergeSort(arr, l, r) { 
        if (l < r) {
            let m = l + Math.floor((r-l)/2);
            this.mergeSort(arr, l, m); 
            this.mergeSort(arr, m+1, r);
            merge(arr, l, m, r); 
        } 
    }

    static reSort(comments) {
        // If there is a pinned comment, it always appears at the top regardless of date
        // Move it to its correct position w/ binary search
        if (comments.length > 1 && comments[0].publishedAt < comments[1].publishedAt) {
            let key = comments[0].publishedAt;
            let l = 0;
            let r = comments.length - 1;
            let m;
            while (l <= r) {
                m = l + Math.floor((r-l)/2);
                if (comments[m].publishedAt > key) {
                    l = m + 1;
                }
                else if (comments[m].publishedAt < key) {
                    r = m - 1;
                }
                else {
                    break;
                }
            }
            comments.splice(m, 0, comments.shift());
        }
    }

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

    static commentInArray(array, commentId) {
        let len = array.length;
        for (let i = 0; i < len; i++) {
            if (array[i].id == commentId)
                return true;
        }
        return false;
    }

}

module.exports = Utils;