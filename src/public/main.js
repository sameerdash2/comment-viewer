import { Video } from "./video.js";

const ERR = "#A00";
const LOAD = "#666";

document.addEventListener("DOMContentLoaded", () => {
    const socket = io(undefined, {
        reconnectionDelayMax: 30000,
        randomizationFactor: 0
    });
    document.getElementById("enterID").focus();
    const video = new Video(socket);

    let message = document.getElementById("message");
    let commentsSection = document.getElementById("commentsSection");
    let loadStatus = document.getElementById("loadStatus");
    let info = document.getElementById("info");
    let showMoreBtn = document.getElementById("showMoreBtn");
    let linkedHolder = document.getElementById("linkedHolder");
    let terms = document.getElementById("terms");

    document.getElementById("viewTerms").addEventListener('click', (event) => {
        event.preventDefault();
        terms.style.display = "block";
    });
    document.getElementById("closeTerms").addEventListener('click', () => {
        terms.style.display = "none";
    });
    window.addEventListener('click', () => {
        if (event.target == terms) {
            terms.style.display = "none";
        }
    });

    window.addEventListener('resize', () => {
        video.handleWindowResize();
    });

    document.getElementById("videoForm").addEventListener('submit', (event) => {
        event.preventDefault(); // prevents page reloading
        let enterID = document.getElementById("enterID");
        message.innerHTML = "Working...";
        message.style.color = LOAD;
        socket.emit('idSent', enterID.value);
        enterID.value = "";
        return false;
    });
    document.getElementById("submitAll").addEventListener('click', () => {
        document.getElementById("chooseLoad").style.display = "none";
        loadStatus.style.display = "block";
        
        socket.emit("requestAll");
    });
    showMoreBtn.addEventListener('click', () => {
        showMoreBtn.disabled = true;
        socket.emit("showMore");
    });
    
    document.getElementById("sortLoaded").addEventListener('click', (event) => {
        let closest = event.target.closest(".sendSort");
        if (closest) {
            // Enable all except the clicked button
            let items = document.querySelectorAll(".sendSort");
            items.forEach((elem) => {
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
            video.handleRepliesButton(closest);
        }
    }

    socket.on("idInvalid", () => {
        message.innerHTML = "Invalid video link or ID.";
        message.style.color = ERR;
    });
    socket.on("videoInfo", ({ videoObject }) => displayVideo(videoObject));
    function displayVideo(videoObject) {
        resetPage();
        document.getElementById("inputRow").style.display = "none";
        document.getElementById("options").style.display = "none";
        video.display(videoObject);
    }
    socket.on("commentsInfo", ({num, disabled, commence, max, graph}) => {
        let commentInfo = document.getElementById("commentInfo");
        document.getElementById("chooseLoad").style.display = (!disabled && !commence && max < 0) ? "block" : "none";
        document.getElementById("viewGraph").style.display = graph ? "block" : "none";
        if (disabled) {
            commentInfo.innerHTML = `<i class="fas fa-comment"></i> <span class="gray">Comments are disabled.</span>`;
            if (num > 0) {
                commentInfo.innerHTML += ` <span class="red">(` + Number(num).toLocaleString() + ` hidden comments)</span>`;
            }
        }
        else {
            commentInfo.innerHTML = `<i class="fas fa-comment"></i> ` + Number(num).toLocaleString() + ` comments`;
            if (max > 0) {
                document.getElementById("limitMessage").innerHTML =
                    `Videos with over ${max.toLocaleString()} comments are not currently supported.<br>
                    (Stay tuned for the future!)`;
            }
        }
    });

    socket.on("loadStatus", (totalCount) => video.updateLoadStatus(totalCount));

    socket.on("groupComments", ({ reset, items, showMore }) => {      
        message.innerHTML = "&nbsp;";
        if (reset) {
            commentsSection.innerHTML = "";
            loadStatus.style.display = "none";
            document.getElementById("sortLoaded").style.display = "block";
            document.getElementById("statsOptions").style.display = "block";
        }
        video.handleGroupComments(reset, items);
        document.getElementById("showMoreDiv").style.display = showMore ? "block" : "none";
        showMoreBtn.disabled = false;
    });

    socket.on("newReplies", ({ items, id }) => video.handleNewReplies(id, items));

    socket.on("linkedComment", ({ parent, hasReply, reply, videoObject }) => {
        if (videoObject == -1) {
            resetPage();
            message.innerHTML = "&nbsp;"
            info.innerHTML = `<span class="gray">(No video associated with this comment)</span>`;
        }
        else {
            displayVideo(videoObject);
        }
        video.handleLinkedComment(parent, hasReply ? reply : null);
    });

    socket.on("resetPage", resetPage);
    function resetPage() {
        linkedHolder.innerHTML = "";
        commentsSection.innerHTML = "";
        document.getElementById("limitMessage").innerHTML = "";
        document.getElementById("loadPercentage").innerHTML = "0.0%";
        document.getElementById("loadEta").innerHTML = '--';
        document.getElementById("progressGreen").style.width = "0%";
        
        document.getElementById("chooseLoad").style.display = "none";
        document.getElementById("sortLoaded").style.display = "none";
        document.getElementById("statsOptions").style.display = "none";
        document.getElementById("showMoreDiv").style.display = "none";
        
        document.getElementById("b_likesMost").disabled = false;
        document.getElementById("b_dateNewest").disabled = false;
        document.getElementById("b_dateOldest").disabled = true;
        document.getElementById("graphContainer").style.display = "none";
        document.getElementById("graphSpace").innerHTML = "";
        
        video.reset();
    }    

    socket.on("quotaExceeded", () => {             
        message.innerHTML = "Quota exceeded. Please try again later";
        message.style.color = ERR;
    });
});