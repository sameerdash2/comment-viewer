import io from 'socket.io-client';
import { Video } from "./video.js";

const ERR = "#A00";
const LOAD = "#666";

document.addEventListener("DOMContentLoaded", () => {
    const socket = io(undefined, {
        reconnectionDelayMax: 30000,
        randomizationFactor: 0
    });
    const video = new Video(socket);

    const message = document.getElementById("message");
    const commentsSection = document.getElementById("commentsSection");
    const loadStatus = document.getElementById("loadStatus");
    const showMoreBtn = document.getElementById("showMoreBtn");
    const linkedHolder = document.getElementById("linkedHolder");
    const terms = document.getElementById("terms");

    let statsAvailable = false;

    document.getElementById("viewTerms").addEventListener('click', (event) => {
        event.preventDefault();
        terms.style.display = "block";
    });
    document.getElementById("closeTerms").addEventListener('click', () => terms.style.display = "none");
    window.addEventListener('click', (event) => {
        if (event.target == terms) {
            terms.style.display = "none";
        }
    });

    window.addEventListener('resize', () => video.handleWindowResize());

    document.getElementById("videoForm").addEventListener('submit', (event) => {
        event.preventDefault(); // prevents page reloading
        const enterID = document.getElementById("enterID");
        if (enterID.value.length > 0) {
            message.innerHTML = "Working...";
            message.style.color = LOAD;
            socket.emit('idSent', enterID.value);
            enterID.value = "";
        }
        return false;
    });
    document.getElementById("submitAll").addEventListener('click', () => {
        document.getElementById("chooseLoad").style.display = "none";
        video.prepareLoadStatus();
        
        socket.emit("requestAll");
    });
    showMoreBtn.addEventListener('click', () => {
        showMoreBtn.disabled = true;
        showMoreBtn.innerHTML = "Loading..."
        socket.emit("showMore", {sort: video.currentSort, commentNum: video.commentNum});
    });
    
    document.getElementById("sortLoaded").addEventListener('click', (event) => {
        const closest = event.target.closest(".sendSort");
        if (closest) {
            video.currentSort = closest.id.substring(2);
            // Enable all except the clicked button
            const items = document.querySelectorAll(".sendSort");
            items.forEach((elem) => {
                elem.disabled = (elem.id == closest.id);
            });

            // Loading spinner
            commentsSection.classList.add("reloading");
            document.getElementById("spinnerContainer").style.display = "flex";

            // Send request
            socket.emit("showMore", {sort: video.currentSort, commentNum: 0});
        }
    });

    commentsSection.addEventListener('click', repliesButton);
    linkedHolder.addEventListener('click', repliesButton);
    function repliesButton(event) {
        const closest = event.target.closest(".showHideButton");
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
        document.getElementById("intro").style.display = "none";
        if (videoObject !== -1)
            video.display(videoObject);
    }

    socket.on("commentsInfo", ({num, disabled, commence, max, graph}) => {
        const commentInfo = document.getElementById("commentInfo");
        document.getElementById("chooseLoad").style.display = (!disabled && !commence && max < 0) ? "block" : "none";
        statsAvailable = graph;
        if (disabled) {
            commentInfo.innerHTML = `<i class="fas fa-comment"></i> <span class="gray">Comments are disabled.</span>`;
            if (num > 0) {
                commentInfo.innerHTML += ` <span class="red">(${Number(num).toLocaleString()} hidden comments)</span>`;
            }
        }
        else {
            commentInfo.innerHTML = `<i class="fas fa-comment"></i> ${Number(num).toLocaleString()} comments`;

            if (commence && num > 0) video.prepareLoadStatus();

            if (max > 0) {
                document.getElementById("noteColumn").style.display = "block";
                document.getElementById("limitMessage").textContent =
                    `Videos with over ${max.toLocaleString()} comments are not currently supported.
                    (Stay tuned for the future!)`;
            }
        }
    });

    socket.on("loadStatus", (totalCount) => video.updateLoadStatus(totalCount));

    socket.on("groupComments", ({ reset, items, replies, showMore }) => {      
        message.innerHTML = "&nbsp;";
        if (reset) {
            commentsSection.innerHTML = "";
            commentsSection.classList.remove("reloading");
            document.getElementById("spinnerContainer").style.display = "none";
            loadStatus.style.display = "none";
            document.getElementById("commentsCol").style.display = "block";
            document.getElementById("sortLoaded").style.display = "block";
            document.getElementById("statsColumn").style.display = statsAvailable ? "block" : "none";
        }
        video.handleGroupComments(reset, items);
        video.handleMinReplies(replies);
        document.getElementById("showMoreDiv").style.display = showMore ? "block" : "none";
        showMoreBtn.innerHTML = "Show more comments...";
        showMoreBtn.disabled = false;
    });

    socket.on("newReplies", ({ items, id }) => video.handleNewReplies(id, items));

    socket.on("statsData", (data) => video.handleStatsData(data));

    socket.on("linkedComment", ({ parent, hasReply, reply, videoObject }) => {
        displayVideo(videoObject);
        video.handleLinkedComment(parent, hasReply ? reply : null);
    });

    socket.on("resetPage", resetPage);
    function resetPage() {
        linkedHolder.innerHTML = "";
        commentsSection.innerHTML = "";
        document.getElementById("limitMessage").innerHTML = "";
        document.getElementById("loadPercentage").innerHTML = "0%";
        document.getElementById("loadEta").innerHTML = '';
        document.getElementById("progressGreen").style.width = "0%";
        
        document.getElementById("chooseLoad").style.display = "none";
        document.getElementById("sortLoaded").style.display = "none";
        document.getElementById("statsColumn").style.display = "none";
        document.getElementById("showMoreDiv").style.display = "none";
        
        document.getElementById("b_likesMost").disabled = false;
        document.getElementById("b_dateNewest").disabled = false;
        document.getElementById("b_dateOldest").disabled = true;
        document.getElementById("statsContainer").style.display = "none";
        document.getElementById("graphSpace").innerHTML = "";
        
        video.reset();
    }    

    socket.on("quotaExceeded", () => {             
        message.innerHTML = "Quota exceeded. Please try again later";
        message.style.color = ERR;
    });
});