import { Graph } from "./graph.js";
import { formatTitle, formatComment, eta, parseDurationMSS } from './util.js';

export class Video {
    constructor(socket) {
        this._socket = socket;
        this._graph = new Graph(this, socket);
        this.reset();
    }
    reset() {
        this._graph.reset();
        this.commentNum = 0;
        this.currentSort = "dateOldest";

        this.options = {
            timezone: document.querySelector('input[name="timezone"]:checked').value,
            showImg: !document.getElementById("noImg").checked,
        };
        this.options.timezone === 'utc' && gtag('event', 'timezone_utc', { 'event_category': 'options' });
        this.options.showImg === false && gtag('event', 'no_images', { 'event_category': 'options' });

        this._storedReplies = {};
        this._displayedReplies = new Set();
    }

    display(video) {
        this._totalExpected = Number(video.statistics.commentCount); // for load percentage
        this._videoId = video.id;
        this.videoPublished = video.snippet.publishedAt; // for graph bound
        this._uploaderId = video.snippet.channelId; // for highlighting OP comments
        document.getElementById("message").textContent = "\u00A0";
        formatTitle(video, this.options);
        document.getElementById("videoColumn").style.display = "block";
    }

    prepareLoadStatus() {
        document.getElementById("linkedHolder").textContent = "";
        document.getElementById("linkedColumn").style.display = "none";
        this._linkedParent = this._currentLinked = null;

        document.getElementById("loadPercentage").textContent = "Initializing...";

        document.getElementById("loadStatus").style.display = "block";
    }

    updateLoadStatus(count) {
        if (this._totalExpected === 0) {
            return;
        }
        // Determine percentage precision based on total comment count
        // An "update" includes 100 or more comments
        // 1,000+ comments takes at least 10 updates, so use 2 digits (no decimals)
        // 10,000+ comments takes at least 100 updates, so use 3 digits (1 decimal place)
        const precision = Math.max(0, Math.floor(Math.log10(this._totalExpected)) - 3);
        const percentage = (count / this._totalExpected * 100).toFixed(precision) + '%';

        document.getElementById("progressGreen").style.width = percentage;
        document.getElementById("progressGreen").ariaValueNow = percentage;

        document.getElementById("loadPercentage").textContent = percentage;
        document.title = percentage + " complete | YouTube Comment Viewer";
        if (this._totalExpected > 1000) {
            document.getElementById("loadEta").textContent = `~${parseDurationMSS(Math.max(0, eta(this._totalExpected - count)))} remaining`;
            const countString = Number(count).toLocaleString() + " / " + Number(this._totalExpected).toLocaleString();
            document.getElementById("loadCount").textContent = `(${countString} comments indexed)`;
        }
    }

    handleGroupComments(reset, items) {
        if (reset) {
            this.commentNum = 0;
            // Clear stored replies so they can be re-fetched on sorting change
            // (also cause it makes the logic simpler)
            this._storedReplies = {};
            this._displayedReplies = new Set();
        }
        let add = "";
        const paddingX = this.options.showImg ? "2" : "3";
        for (let i = 0; i < items.length; i++) {
            this.commentNum++;

            add += `<li class="list-group-item comment py-2 px-${paddingX}">`
                + formatComment(items[i], this.commentNum, this.options, this._uploaderId, this._videoId, false) + `</li>`;
        }
        document.getElementById("commentsSection").insertAdjacentHTML('beforeend', add);
    }

    handleNewReplies(id, replies) {
        // Intent: store replies in date-ascending order.
        // Verify the order, in case the YT API folks decide to flip the order of returned replies
        // on a whim like they did in October 2023.
        if (replies.length >= 2 && new Date(replies[0].publishedAt) > new Date(replies[1].publishedAt)) {
            replies.reverse();
        }
        this._storedReplies[id] = replies;

        gtag('event', 'replies', {
            'event_category': 'data_request',
            'value': replies.length
        });
        this.populateReplies(id);
    }

    handleRepliesButton(button) {
        const commentId = button.id.substring(11);
        if (this._storedReplies[commentId]) {
            if (this._displayedReplies.has(commentId)) {
                document.getElementById("repliesEE-" + commentId).style.display = "none";
                button.textContent = `\u25BC Show ${this._storedReplies[commentId].length} replies`;
                this._displayedReplies.delete(commentId);
            }
            else {
                document.getElementById("repliesEE-" + commentId).style.display = "block";
                button.textContent = `\u25B2 Hide ${this._storedReplies[commentId].length} replies`;
                this._displayedReplies.add(commentId);
            }
        }
        else {
            button.disabled = true;
            button.textContent = "Loading...";
            this._socket.emit("replyRequest", commentId);
        }
    }

    populateReplies(commentId) {
        const len = this._storedReplies[commentId].length;
        let newContent = "";
        let lClass;
        for (let i = 0; i < len; i++) {
            lClass = this._storedReplies[commentId][i].id === this._currentLinked ? " linked" : "";

            newContent += `<div class="mt-2${lClass}">`
                + formatComment(this._storedReplies[commentId][i], i + 1, this.options,
                    this._uploaderId, this._videoId, true) + `</div>`;
        }
        document.getElementById("repliesEE-" + commentId).innerHTML = newContent;
        this._displayedReplies.add(commentId);
        document.getElementById("getReplies-" + commentId).textContent = `\u25B2 Hide ${len} replies`;
        document.getElementById("getReplies-" + commentId).disabled = false;
    }

    handleLinkedComment(parent, reply) {
        this._linkedParent = parent.id;
        this._currentLinked = reply ? reply.id : parent.id;

        document.getElementById("linkedHolder").innerHTML =
            formatComment(parent, -1, this.options, this._uploaderId, this._videoId, false);
        if (reply) {
            document.getElementById("repliesEE-" + parent.id).innerHTML =
                `<div class="mt-2 linked">`
                + formatComment(reply, -1, this.options, this._uploaderId, this._videoId, true)
                + `</div>`;
        }

        document.getElementById("linkedColumn").style.display = "block";
    }

    handleStatsData(data) {
        gtag('event', 'stats', { 'event_category': 'data_request' });
        document.getElementById("s_comments").textContent = data[0].comments.toLocaleString();
        document.getElementById("s_totalLikes").textContent = data[0].totalLikes.toLocaleString();
        document.getElementById("s_avgLikes").textContent = (data[0].totalLikes / data[0].comments)
            .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const videoAge = (new Date().getTime() - new Date(this.videoPublished).getTime()) / (24 * 60 * 60 * 1000);
        const commentsPerDay = data[1].length / Math.ceil(videoAge);
        document.getElementById("s_avgPerDay").textContent = commentsPerDay
            .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        this._graph.constructGraph(data[1]);
    }

    handleWindowResize() {
        this._graph.requestResize();
    }
}