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
        if (comments.length > 1 && comments[0].snippet.topLevelComment.snippet.publishedAt < comments[1].snippet.topLevelComment.snippet.publishedAt) {
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

    static eta(count) {
        let seconds = Math.floor(count / 250) + 1;
        let etaTime = (seconds > 60) ? Math.floor(seconds / 60) + " min" : seconds + " seconds";
        return "Estimated load time: " + etaTime;
    }

}

module.exports = Utils;