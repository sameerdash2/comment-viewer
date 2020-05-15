document.addEventListener("DOMContentLoaded", function() {
    const socket = io("", {
        query: "timezone=" + (-new Date().getTimezoneOffset())
    });
    //const socket = io();
    const ERR = "#A00";
    const DEF = "#000";
    const LOAD = "#666";
    const MAXDISPLAY = 100;
    const GRIDCOLOR = "rgba(0,0,0,0.1)";

    // Stores info specific to the currently shown video; clears upon new video.
    let session = {
        commentNum: 0,
        graphState: 0, //0=none,1=loaded,2=shown
    }

    // Updates on new video
    let options = {};
    updateOptions();

    let submitBtn = document.getElementById("submit");
    let message = document.getElementById("message");
    let commentsSection = document.getElementById("commentsSection");
    let loadStatus = document.getElementById("loadStatus");
    let info = document.getElementById("info");
    let showMoreBtn = document.getElementById("showMoreBtn");
    let linkedHolder = document.getElementById("linkedHolder");    

    let storedReplies = {};
    let viewGraph = document.getElementById("viewGraph");

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

    viewGraph.addEventListener('click', function() {
        if (session.graphState == 2) {
            document.getElementById("graphContainer").style.display = "none";
            session.graphState = 1;
        }
        else if (session.graphState == 1) {
            document.getElementById("graphContainer").style.display = "block";
            session.graphState = 2;
        }
        else {
            viewGraph.disabled = true;
            socket.emit("graphRequest");
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
        if (!forLinked) {
            resetPage();
            updateOptions();
        }
        session.totalExpected = video.statistics.commentCount; // for load percentage
        session.videoId = video.id;
        session.videoPublished = video.snippet.publishedAt; // for graph bound
        session.uploaderId = video.snippet.channelId; // for highlighting OP comments
        message.innerHTML = "&nbsp;";
        info.innerHTML = displayTitle(video, forLinked, options);
    });
    socket.on("commentsInfo", ({num, disabled, eta, commence, max, graph}) => {
        let commentInfo = document.getElementById("commentInfo");
        document.getElementById("chooseLoad").style.display = (!disabled && !commence && max < 0) ? "block" : "none";
        viewGraph.style.display = graph ? "block" : "none";
        if (disabled) {
            commentInfo.innerHTML = `<i class="fas fa-comment"></i> Comments have been disabled on this video.`;
            if (num > 0) {
                commentInfo.innerHTML += ` <span class="it">(` + Number(num).toLocaleString() + ` hidden comments)</span>`;
            }
        }
        else {
            commentInfo.innerHTML = `<i class="fas fa-comment"></i> ` + Number(num).toLocaleString() + ` comments`;
            document.getElementById("eta").innerHTML = eta;
            if (max > 0) loadStatus.innerHTML = "Videos with over " + max.toLocaleString() + " comments are not supported.";
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
	
			add += `<hr><div class="commentThreadDiv">` + formatCommentThread(items[i], session.commentNum, options, session.uploaderId, session.videoId, false, false) + `</div>`;
		
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
			newContent +=`<div class="` + className + `">` + formatCommentThread(items[i], len - i, options, session.uploaderId, session.videoId, isLinked, true)
				+ `</div>`;
        }
        document.getElementById("repliesEE-" + id).innerHTML = newContent;
        document.getElementById("getReplies-" + id).innerHTML = "Hide " + len + " replies";
        document.getElementById("getReplies-" + id).disabled = false;
    });
    socket.on("linkedComment", ({parent, hasReply, reply}) => {
        updateOptions();
        session.linkedParent = parent.id;
        session.currentLinked = hasReply ? reply.id : parent.id;
        linkedHolder.innerHTML = `<hr><section class="linkedSec"><div class="commentThreadDiv">`
            + formatCommentThread(parent, -1, options, session.uploaderId, session.videoId, !hasReply, false) + `</div></section><hr><br>`;
        if (hasReply) {
            document.getElementById("repliesEE-" + parent.id).innerHTML = `<div class="linked">`
                + formatCommentThread(reply, -1, options, session.uploaderId, session.videoId, true, true) + `</div>`;
        }
    });

    socket.on("graphData", (dates) => {
        // Object to keep count 
        let dictionary = {}, len = dates.length;
        let startDate = new Date(Math.min( new Date(session.videoPublished), new Date(dates[len - 1]) ));
        let endDate = new Date();
        if (options.timezone == "utc") {
            startDate.setUTCHours(0,0,0,0);
            endDate.setUTCHours(0,0,0,0);
        }
        else {
            startDate.setHours(0,0,0,0);
            endDate.setHours(0,0,0,0);
        }
        let currentDate = startDate;
        // One key for each day, represented as unix time milliseconds
		while (currentDate <= endDate) {
			dictionary[new Date(currentDate).getTime()] = 0;
			currentDate.setDate(currentDate.getDate() + 1);
		}
        // Populate date counts from comments
        let floorDate;
        for (let i = 0; i < len; i++) {
            floorDate = (options.timezone == "utc") ? new Date(dates[i]).setUTCHours(0,0,0,0) : new Date(dates[i]).setHours(0,0,0,0);
            dictionary[floorDate]++;
        }
        let data = [[], []];
        for (let key in dictionary) {
            // Graph requires seconds. All comments have 000 ms, but flooring to be safe
            data[0].push(Math.floor(key / 1000));
            data[1].push(dictionary[key]);
        }

        makeGraph(data);
        document.getElementById("graphContainer").style.display = "block";
        session.graphState = 2;
        viewGraph.disabled = false;
    });

    function makeGraph(data) {
        let axis = {
            font: "14px Noto Sans TC",
            grid: { stroke: GRIDCOLOR, },
            ticks: {
                show: true,
                size: 5,
                stroke: GRIDCOLOR,
            },
        }

        let zone = options.timezone == "utc" ? "UTC" : undefined;
        let opts = {
            width: 1000,
            height: 400,
            tzDate: ts => uPlot.tzDate(new Date(ts * 1000), zone),
            axes: [axis, axis],
            series: [
                {
                    // x series
                    label: "Date",
                    value: (self, rawValue) => {
                        return options.timezone == "utc"
                            ? new Date(rawValue*1000).toUTCString().substring(5, 16) : new Date(rawValue*1000).toLocaleDateString()
                    },
                },
                {
                    // y series
                    label: "Comments",
                    value: (self, rawValue) => rawValue.toLocaleString(),
                    stroke: "blue",
                    width: 2,
                    points: {
                        show: false,
                    }
                },
            ],
            cursor: {
                y: false,
                points: {
                    size: 100,
                },
            },
            focus: {alpha: 0}
        };

        let uplot = new uPlot(opts, data, document.getElementById("graphContainer"));
    }

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
            graphState: 0,
        };
        document.getElementById("graphContainer").style.display = "none";
        document.getElementById("graphContainer").innerHTML = "";
        
        storedReplies = {};
    }

    function updateOptions() {
        options = {
            timezone: document.querySelector('input[name="timezone"]:checked').value,
            showImg: !document.getElementById("noImg").checked,
        };
    }

    socket.on("quotaExceeded", () => {             
        message.innerHTML = "Quota exceeded. Please try again later";
        message.style.color = ERR;
    });
});