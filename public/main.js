import io from 'socket.io-client';
import { Video } from "./video.js";
import { shiftDate } from './util.js';

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
    const dateMin = document.getElementById("dateMin");
    const dateMax = document.getElementById("dateMax");

    let dateLeftBound = -1;
    let dateRightBound = -1;
    let searchTerms = undefined;

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
            message.textContent = "Working...";
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
        showMoreBtn.textContent = "Loading..."
        socket.emit("showMore", {sort: video.currentSort, commentNum: video.commentNum,
            minDate: dateLeftBound, maxDate: dateRightBound, searchTerms: searchTerms});
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

            showLoading();

            // Send request
            socket.emit("showMore", {sort: video.currentSort, commentNum: 0,
                minDate: dateLeftBound, maxDate: dateRightBound, searchTerms: searchTerms});
        }
    });

    document.getElementById("filterDate").addEventListener('change', (event) => {
        event.preventDefault();
        const isUtc = video.options.timezone === "utc";
        let minDate, maxDate;
        if (isUtc) {
            minDate = new Date(dateMin.value);
            maxDate = new Date(dateMax.value);
        }
        else {
            minDate = new Date(dateMin.value.split('-', 3));
            maxDate = new Date(dateMax.value.split('-', 3));
        }

        if (isNaN(minDate) || isNaN(maxDate)) {
            if (isNaN(minDate)) {
                dateMin.classList.add("bg-invalid");
            }
            if (isNaN(maxDate)) {
                dateMax.classList.add("bg-invalid");
            }
        }
        else if (minDate > maxDate) {
            dateMin.classList.add("bg-invalid");
            dateMax.classList.add("bg-invalid");
        }
        else {
            dateMin.classList.remove("bg-invalid");
            dateMax.classList.remove("bg-invalid");
            // Shift max date to cover the day
            shiftDate(maxDate, "day", 1, true);
            maxDate.setTime(maxDate.getTime() - 1);

            dateLeftBound = minDate.getTime();
            dateRightBound = maxDate.getTime();

            socket.emit("showMore", {sort: video.currentSort, commentNum: 0,
                minDate: dateLeftBound, maxDate: dateRightBound, searchTerms: searchTerms});
            showLoading();
        }
    });

    document.getElementById("searchForm").addEventListener('submit', (event) => {
        event.preventDefault();
        searchTerms = document.getElementById("searchBox").value.trim();
        socket.emit("showMore", {sort: video.currentSort, commentNum: 0,
            minDate: dateLeftBound, maxDate: dateRightBound, searchTerms: searchTerms});        
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
        message.textContent = "Invalid video link or ID.";
        message.style.color = ERR;
    });
    socket.on("videoInfo", ({ videoObject }) => displayVideo(videoObject));
    function displayVideo(videoObject) {
        resetPage();
        document.getElementById("intro").style.display = "none";
        if (videoObject !== -1) {
            video.display(videoObject);
            // Apply values to HTML date picker which operates on YYYY-MM-DD format
            const minDate = new Date(videoObject.snippet.publishedAt);
            const maxDate = new Date();
            let min, max;
            if (video.options.timezone === "utc") {
                min = minDate.toISOString().split('T')[0];
                max = maxDate.toISOString().split('T')[0];
            }
            else {
                min = new Date(minDate.getTime() - (minDate.getTimezoneOffset() * 60000 )).toISOString().split("T")[0];
                max = new Date(maxDate.getTime() - (maxDate.getTimezoneOffset() * 60000 )).toISOString().split("T")[0];
            }
            dateMin.setAttribute("min", min);
            dateMin.setAttribute("max", max);
            dateMax.setAttribute("min", min);
            dateMax.setAttribute("max", max);
            dateMin.value = min;
            dateMax.value = max;
        }
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

    socket.on("groupComments", ({ reset, items, replies, showMore, subCount, totalCount }) => {      
        message.innerHTML = "&nbsp;";
        if (reset) {
            hideLoading();
            commentsSection.innerHTML = "";
            loadStatus.style.display = "none";
            if (subCount === totalCount) {
                document.getElementById("resultCol").style.display = "none";
            }
            else {
                document.getElementById("resultCol").style.display = "block";
                document.getElementById("subCount").textContent = Number(subCount).toLocaleString();
                document.getElementById("totalCount").textContent = Number(totalCount).toLocaleString();
            }
            document.getElementById("commentsCol").style.display = "block";
            document.getElementById("sortLoaded").style.display = "block";
            document.getElementById("filter").style.display = "block";
            document.getElementById("statsColumn").style.display = statsAvailable ? "block" : "none";
        }
        video.handleGroupComments(reset, items);
        video.handleMinReplies(replies);
        document.getElementById("showMoreDiv").style.display = showMore ? "block" : "none";
        showMoreBtn.textContent = "Show more comments...";
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
        document.getElementById("loadPercentage").textContent = "0%";
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
        message.textContent = "Quota exceeded. Please try again later";
        message.style.color = ERR;
    });

    function showLoading() {
        commentsSection.classList.add("reloading");
        document.getElementById("spinnerContainer").style.display = "flex";
    }

    function hideLoading() {
        commentsSection.classList.remove("reloading");
        document.getElementById("spinnerContainer").style.display = "none";
    }
});