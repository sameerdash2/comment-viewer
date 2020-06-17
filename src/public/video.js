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
        this._commentNum = 0;
        this.options = {
            timezone: document.querySelector('input[name="timezone"]:checked').value,
            showImg: !document.getElementById("noImg").checked,
        };
        this._storedReplies = {};
        this._displayedReplies = new Set();
    }

    display(video) {
        this._totalExpected = video.statistics.commentCount; // for load percentage
        this._videoId = video.id;
        this.videoPublished = video.snippet.publishedAt; // for graph bound
        this._uploaderId = video.snippet.channelId; // for highlighting OP comments
        document.getElementById("message").innerHTML = "&nbsp;";
        document.getElementById("info").innerHTML = formatTitle(video, this.options);
        this.resizeMetadata();
    }

    updateLoadStatus(count) {
        if (count == -1) {
            document.getElementById("loadStatus").innerHTML = `Loading is in progress. Please check back later`;
        }
        else {
            let remaining = "";
            if (this._totalExpected - count > 250) {
                remaining = ` <span class="gray">(~` + parseDurationMSS(eta(this._totalExpected - count)) + ` remaining)</span>`;
            }
            document.getElementById("loadStatus").innerHTML = (Math.round(count / this._totalExpected * 1000) / 10).toFixed(1)
                + "% loaded" + remaining;
        }
    }

    handleGroupComments(reset, items) {
        if (reset) {
            this._commentNum = 0;
            this._displayedReplies = new Set();
        }
        let add = "";
        for (let i = 0; i < items.length; i++) {
            this._commentNum++;
            // Skip comment if it's the linked one.
            if (this._linkedParent == items[i].id) continue;
    
            add += `<hr><div class="commentThreadDiv">`
                + formatComment(items[i], this._commentNum, this.options, this._uploaderId, this._videoId, false, false) + `</div>`;		
        }
        document.getElementById("commentsSection").insertAdjacentHTML('beforeend', add);
    }

    handleNewReplies(id, items) {
        let len = items.length;
        this._storedReplies[id] = items;
        let newContent = "";
        let isLinked, className;
        for (let i = len - 1; i >= 0; i--) {
            isLinked = items[i].id == this._currentLinked;
            className = isLinked ? "linked" : "commentThreadDiv";
            newContent +=`<div class="` + className + `">`
                + formatComment(items[i], len - i, this.options, this._uploaderId, this._videoId, isLinked, true) + `</div>`;
        }
        document.getElementById("repliesEE-" + id).style.display = "block";
        document.getElementById("repliesEE-" + id).innerHTML = newContent;
        this._displayedReplies.add(id);
        document.getElementById("getReplies-" + id).innerHTML = "Hide " + len + " replies";
        document.getElementById("getReplies-" + id).disabled = false;
    }

    handleRepliesButton(button) {
        let commentId = button.id.substring(11);
        if (this._storedReplies[commentId]) {
            let expanded = document.getElementById("repliesEE-" + commentId);
            if (this._displayedReplies.has(commentId)) {
                expanded.style.display = "none";
                button.innerHTML = "Show " + this._storedReplies[commentId].length + " replies";
                this._displayedReplies.delete(commentId);
            }
            else {
                expanded.style.display = "block";
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

    handleLinkedComment(parent, reply) {
        this._linkedParent = parent.id;
        this._currentLinked = reply ? reply.id : parent.id;
        
        document.getElementById("linkedHolder").innerHTML = `<hr><section class="linkedSec"><div class="commentThreadDiv">`
            + formatComment(parent, -1, this.options, this._uploaderId, videoObject.id, !hasReply, false) + `</div></section><hr><br>`;
        if (reply) {
            document.getElementById("repliesEE-" + parent.id).innerHTML = `<div class="linked">`
                + formatComment(reply, -1, this.options, this._uploaderId, videoObject.id, true, true) + `</div>`;
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
        if (document.documentElement.clientWidth < 700) {
            metadata.style.display = "block";
            metadata.style.width = "auto";
        }
        else {
            metadata.style.display = "inline-block";
            metadata.style.width = this.options.showImg ? "calc(100% - 325px)" :  "100%";
        }

        if (this._metadataResizeTimeout) {
            clearTimeout(this._metadataResizeTimeout);
        }
        this._metadataResizeTimeout = undefined;
    }
}