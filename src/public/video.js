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
        this._replyCounts = {};
        this._storedReplies = {};
        this._displayedReplies = new Set();
    }

    display(video) {
        this._totalExpected = video.statistics.commentCount; // for load percentage
        this._videoId = video.id;
        this.videoPublished = video.snippet.publishedAt; // for graph bound
        this._uploaderId = video.snippet.channelId; // for highlighting OP comments
        document.getElementById("message").innerHTML = "&nbsp;";
        formatTitle(video, this.options);
        this.resizeMetadata();
    }

    prepareLoadStatus() {
        document.getElementById("linkedHolder").innerHTML = "";
        this._linkedParent = this._currentLinked = null;

        document.getElementById("loadPercentage").innerHTML = "Initializing...";
        document.getElementById("loadStatus").style.display = "block";
    }

    updateLoadStatus(count) {
        if (count == -1) {
            document.getElementById("limitMessage").innerHTML =
                `Loading is in progress. Please check back later`;
        }
        else {
            // Determine percentage precision based on total comment count
            const precision = Math.max(0, Math.floor(Math.log10(this._totalExpected)) - 3);
            const percentage = (count / this._totalExpected * 100).toFixed(precision) + '%';

            document.getElementById("loadPercentage").innerHTML = percentage;
            document.getElementById("loadEta").innerHTML = '~'
                + parseDurationMSS(Math.max(0, eta(this._totalExpected - count))) + ' remaining';
            document.getElementById("progressGreen").style.width = percentage;
        }
    }

    handleGroupComments(reset, items) {
        if (reset) {
            this.commentNum = 0;
            this._storedReplies = {};
            this._displayedReplies = new Set();
        }
        let add = "";
        for (let i = 0; i < items.length; i++) {
            this.commentNum++;
            this._replyCounts[items[i].id] = items[i].totalReplyCount;
            // Skip comment if it's the linked one.
            if (this._linkedParent == items[i].id) continue;
    
            add += `<hr><div class="commentThreadDiv">`
                + formatComment(items[i], this.commentNum, this.options, this._uploaderId, this._videoId, false, false) + `</div>`;		
        }
        document.getElementById("commentsSection").insertAdjacentHTML('beforeend', add);
    }

    handleMinReplies(allReplies) {
        let content;
        for (let id in allReplies) {
            content = "";
            allReplies[id].forEach((reply) => {
                content +=`<div class="commentThreadDiv">`
                    + formatComment(reply, -1, this.options, this._uploaderId, this._videoId, false, true) + `</div>`
            });
            document.getElementById("repliesEE-" + id).innerHTML = content;

            // Remove reply button if all replies are shown
            let replyButton = document.getElementById("getReplies-" + id);
            if (replyButton !== null && allReplies[id].length >= this._replyCounts[id]) {
                replyButton.parentNode.removeChild(replyButton);
            }
        }
    }

    handleNewReplies(id, items) {
        this._storedReplies[id] = items;
        this.populateReplies(id);
    }

    handleRepliesButton(button) {
        let commentId = button.id.substring(11);
        if (this._storedReplies[commentId]) {
            if (this._displayedReplies.has(commentId)) {
                document.getElementById("repliesEE-" + commentId).style.display = "none";
                button.innerHTML = "Show " + this._storedReplies[commentId].length + " replies";
                this._displayedReplies.delete(commentId);
            }
            else {
                document.getElementById("repliesEE-" + commentId).style.display = "block";
                button.innerHTML = "Hide " + this._storedReplies[commentId].length + " replies";
                this._displayedReplies.add(commentId);
            }
        }
        else {
            button.disabled = true;
            button.innerHTML = "Loading...";
            this._socket.emit("replyRequest", commentId);
        }
    }

    populateReplies(commentId) {
        let len = this._storedReplies[commentId].length;
        let newContent = "";
        let isLinked, className;
        for (let i = len - 1; i >= 0; i--) {
            isLinked = this._storedReplies[commentId][i].id == this._currentLinked;
            className = isLinked ? "linked" : "commentThreadDiv";
            newContent +=`<div class="` + className + `">`
                + formatComment(this._storedReplies[commentId][i], len - i, this.options,
                    this._uploaderId, this._videoId, isLinked, true) + `</div>`;
        }
        document.getElementById("repliesEE-" + commentId).innerHTML = newContent;
        this._displayedReplies.add(commentId);
        document.getElementById("getReplies-" + commentId).innerHTML = "Hide " + len + " replies";
        document.getElementById("getReplies-" + commentId).disabled = false;
    }

    handleLinkedComment(parent, reply) {
        this._linkedParent = parent.id;
        this._currentLinked = reply ? reply.id : parent.id;
        
        document.getElementById("linkedHolder").innerHTML =
            `<hr><section class="linkedSec"><div class="commentThreadDiv">`
            + formatComment(parent, -1, this.options, this._uploaderId, this._videoId,!reply, false)
            + `</div></section><hr><br>`;
        if (reply) {
            document.getElementById("repliesEE-" + parent.id).innerHTML =
                `<div class="linked">`
                + formatComment(reply, -1, this.options, this._uploaderId, this._videoId, true, true)
                + `</div>`;
        }
    }

    handleWindowResize() {
        this.adjustMetadataElement();
        this._graph.requestResize();
    }

    adjustMetadataElement() {
        if (document.getElementById("metadata")) {
            // Set timeout to resize only after a pause in window resize events, prevents CPU overload
            if (this._metadataResizeTimeout) {
                clearTimeout(this._metadataResizeTimeout);
            }
            this._metadataResizeTimeout = setTimeout(this.resizeMetadata, 100);
        }
    }

    resizeMetadata = () => {
        let metadata = document.getElementById("metadata");
        if (document.documentElement.clientWidth < 550) {
            metadata.style.display = "block";
            metadata.style.width = "auto";
        }
        else {
            metadata.style.display = "inline-block";
            metadata.style.width = this.options.showImg ? "calc(100% - 261px)" :  "100%";
        }

        if (this._metadataResizeTimeout) {
            clearTimeout(this._metadataResizeTimeout);
        }
        this._metadataResizeTimeout = undefined;
    }
}