document.addEventListener("DOMContentLoaded", function() {
    const socket = io("", {
        query: "timezone=" + (-new Date().getTimezoneOffset())
    });
    //const socket = io();
    const ERR = "#A00";
    const DEF = "#000";
    const LOAD = "#666";
    const MAXDISPLAY = 100;
    const MAX = 100000;    

    // Stores info specific to the currently shown video; clears upon new video.
    let session = {
        commentNum: 0,
    }

    let submitBtn = document.getElementById("submit");
    let message = document.getElementById("message");
    let commentsSection = document.getElementById("commentsSection");
    let loadStatus = document.getElementById("loadStatus");
    let info = document.getElementById("info");
    let showMoreBtn = document.getElementById("showMoreBtn");
    let linkedHolder = document.getElementById("linkedHolder");

    let storedReplies = {};

    submitBtn.disabled = false;
    submitBtn.innerHTML = "Submit";
    showMoreBtn.innerHTML = `Show ` + MAXDISPLAY + ` more comments...`;

    document.getElementById("videoForm").addEventListener('submit', function(event){
        event.preventDefault(); // prevents page reloading
        let enterID = document.getElementById("enterID");
        message.innerHTML = "Working...";
        message.style.color = LOAD;
        socket.emit('idSent', enterID.value);
        enterID.value = "";
        return false;
    });
    document.getElementById("submitAll").addEventListener('click', function() {
        document.getElementById("chooseLoad").style.display = "none";
        submitBtn.disabled = true;
        loadStatus.innerHTML = "Initializing...";
        
        socket.emit("requestAll");
    });
    showMoreBtn.addEventListener('click', function() {
        showMoreBtn.disabled = true;
        socket.emit("showMore");
    });
    
    document.getElementById("sortLoaded").addEventListener('click', function(event) {
        let closest = event.target.closest(".sendSort");
        if (closest) {
            // Enable all except the clicked button
            let items = document.querySelectorAll(".sendSort");
            items.forEach(function(elem) {
                elem.disabled = (elem.id == closest.id);
            });
            socket.emit("sortRequest", closest.id.substring(2));
        }
    });

    commentsSection.addEventListener('click', repliesButton);
    linkedHolder.addEventListener('click', repliesButton);
    function repliesButton(event) {
        let closest = event.target.closest(".showHideButton");
        if (closest) {
            let commentId = closest.id.substring(11);
            if (storedReplies[commentId]) {
                let expanded = document.getElementById("repliesEE-" + commentId);
                if (storedReplies[commentId][0] == true) {
                    expanded.style.display = "none";
                    closest.innerHTML = "Show " + storedReplies[commentId][1] + " replies";
                    storedReplies[commentId][0] = false;
                }
                else {
                    expanded.style.display = "block";
                    closest.innerHTML = "Hide " + storedReplies[commentId][1] + " replies";
                    storedReplies[commentId][0] = true;
                }
            }
            else {
                closest.disabled = true;
                socket.emit("replyRequest", commentId);
            }
        }
    }

    socket.on("idInvalid", function() {
        message.innerHTML = "Invalid video link or ID.";
        message.style.color = ERR;
    });
    socket.on("videoInfo", ({ video, forLinked }) => {
        if (!forLinked) { resetPage(); }
        session.totalExpected = video.statistics.commentCount; // for load percentage
        session.videoId = video.id;
        session.videoPublished = video.snippet.publishedAt; // for graph bound
        session.uploaderId = video.snippet.channelId; // for highlighting OP comments
        message.innerHTML = "&nbsp;";
        info.innerHTML = displayTitle(video, forLinked);
    });
    socket.on("commentsInfo", ({num, disabled, eta, commence}) => {
        let commentInfo = document.getElementById("commentInfo");
        document.getElementById("chooseLoad").style.display = (!disabled && !commence && num < MAX) ? "block" : "none";
        if (disabled) {
            commentInfo.innerHTML = `<i class="fas fa-comment"></i> Comments have been disabled on this video.`;
            if (num > 0) {
                commentInfo.innerHTML += ` <span class="it">(` + Number(num).toLocaleString() + ` hidden comments)</span>`;
            }
        }
        else {
            commentInfo.innerHTML = `<i class="fas fa-comment"></i> ` + Number(num).toLocaleString() + ` comments`;
            document.getElementById("eta").innerHTML = eta;
            if (num >= MAX) loadStatus.innerHTML = "Only videos with under " + MAX + " comments are supported.";
        }
    });

    socket.on("loadStatus", (totalCount) => {
        loadStatus.innerHTML = totalCount.toLocaleString() + " comments loaded ("
            + (Math.round(totalCount / session.totalExpected * 1000) / 10).toFixed(1) + "%)";
    });

    socket.on("groupComments", ({ reset, items, showMore }) => {      
        message.innerHTML = "&nbsp;";
        if (reset) {
            submitBtn.disabled = false;
            session.commentNum = 0;
            commentsSection.innerHTML = "";
            loadStatus.innerHTML = "";
            storedReplies = {};
            document.getElementById("sortLoaded").style.display = "block";
        }
        let add = "", len = items.length;
        for (let i = 0; i < len; i++) {
            session.commentNum++;
            // Skip comment if it's the linked one.
			if (session.linkedParent == items[i].id) { continue; }
	
			add += `<hr><div class="commentThreadDiv">` + formatCommentThread(items[i], session.commentNum, session.uploaderId, session.videoId, false, false) + `</div>`;
		
        }
        commentsSection.insertAdjacentHTML('beforeend', add);
        document.getElementById("showMoreDiv").style.display = showMore ? "block" : "none";
        showMoreBtn.disabled = false;
    });
    socket.on("newReplies", ({ items, id}) => {
        let len = items.length;
        storedReplies[id] = [true, len];
        document.getElementById("repliesEE-" + id).style.display = "block";
        let newContent = "";
        let isLinked, className;
        for (let i = len - 1; i >= 0; i--) {
			isLinked = items[i].id == session.currentLinked;
			className = isLinked ? "linked" : "commentThreadDiv";
			newContent +=`<div class="` + className + `">` + formatCommentThread(items[i], len - i, session.uploaderId, session.videoId, isLinked, true)
				+ `</div>`;
        }
        document.getElementById("repliesEE-" + id).innerHTML = newContent;
        document.getElementById("getReplies-" + id).innerHTML = "Hide " + len + " replies";
        document.getElementById("getReplies-" + id).disabled = false;
    });
    socket.on("linkedComment", ({parent, hasReply, reply}) => {
        session.linkedParent = parent.id;
        session.currentLinked = hasReply ? reply.id : parent.id;
        linkedHolder.innerHTML = `<hr><section class="linkedSec"><div class="commentThreadDiv">`
            + formatCommentThread(parent, -1, session.uploaderId, session.videoId, !hasReply, false) + `</div></section><hr><br>`;
        if (hasReply) {
            document.getElementById("repliesEE-" + parent.id).innerHTML = `<div class="linked">`
                + formatCommentThread(reply, -1, session.uploaderId, session.videoId, true, true) + `</div>`;
        }
    });

    socket.on("resetPage", resetPage);
    function resetPage() {
        linkedHolder.innerHTML = "";
        commentsSection.innerHTML = "";
        loadStatus.innerHTML = "";
        document.getElementById("eta").innerHTML = "";
        document.getElementById("chooseLoad").style.display = "none";
        document.getElementById("sortLoaded").style.display = "none";
        document.getElementById("showMoreDiv").style.display = "none";
        
        document.getElementById("b_likesMost").disabled = false;
        document.getElementById("b_dateNewest").disabled = false;
        document.getElementById("b_dateOldest").disabled = true;
        session = {
            commentNum: 0,
        };
        
        storedReplies = {};
    }
    socket.on("quotaExceeded", () => {             
        message.innerHTML = "Quota exceeded. Please try again later";
        message.style.color = ERR;
    });
});