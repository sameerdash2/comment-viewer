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
    let searchTerms = ['', ''];

    let firstBatchReceived = false;
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
        sendCommentRequest(false);
    });

    document.getElementById("sortLoaded").addEventListener('click', (event) => {
        const closest = event.target.closest(".sendSort");
        if (closest) {
            // Enable all except the clicked button
            const items = document.querySelectorAll(".sendSort");
            items.forEach((elem) => {
                elem.disabled = (elem.id == closest.id);
            });

            video.currentSort = closest.id.substring(2);
            sendCommentRequest(true);
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

            sendCommentRequest(true);
        }
    });

    document.getElementById("searchForm").addEventListener('submit', (event) => {
        event.preventDefault();
        searchTerms = ['', ''];
        const searchBy = document.querySelector('input[name="searchField"]:checked').value;
        const typeIndex = searchBy === "authors" ? 1 : 0;
        searchTerms[typeIndex] = document.getElementById("searchBox").value.trim();

        sendCommentRequest(true);
    });

    document.getElementById("resetFilters").addEventListener('click', () => {
        // Reset date filter
        dateLeftBound = -1;
        dateRightBound = -1;
        dateMin.value = dateMin.getAttribute('min');
        dateMax.value = dateMax.getAttribute('max');

        // Reset search
        searchTerms = ['', ''];
        document.getElementById("searchBox").value = "";

        sendCommentRequest(true);
    })

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
        }
    }

    socket.on("commentsInfo", ({ num, disabled, commence, max, graph }) => {
        document.getElementById("chooseLoad").style.display = (!disabled && !commence && max < 0) ? "block" : "none";
        statsAvailable = graph;
        let newCommentInfo = `<i class="fas fa-comment"></i>&nbsp;`;
        if (disabled) {
            newCommentInfo += `<span class="gray">Comments are disabled.</span>`;
            if (num > 0) {
                newCommentInfo += `<span class="red">(${Number(num).toLocaleString()} hidden comments)</span>`;
            }
        }
        else {
            newCommentInfo += `${Number(num).toLocaleString()} comments`;

            if (commence && num > 0) video.prepareLoadStatus();

            if (max > 0) {
                displayNote(`Videos with over ${max.toLocaleString()} comments are not currently supported.
                    (Stay tuned for the future!)`);
            }
        }

        document.getElementById("commentInfo").innerHTML = newCommentInfo;
    });

    socket.on("loadStatus", (totalCount) => video.updateLoadStatus(totalCount));

    socket.on("groupComments", ({ reset, items, replies, showMore, subCount, totalCount }) => {
        message.textContent = "\u00A0";
        if (!firstBatchReceived) {
            firstBatchReceived = true;

            // Apply values to HTML date picker which operates on YYYY-MM-DD format
            // **This code assumes the first batch is sorted oldest first**
            const minDate = new Date(Math.min(new Date(video.videoPublished), new Date(items[0].publishedAt)));
            const maxDate = new Date();
            let min, max;
            if (video.options.timezone === "utc") {
                min = minDate.toISOString().split('T')[0];
                max = maxDate.toISOString().split('T')[0];
            }
            else {
                min = new Date(minDate.getTime() - (minDate.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
                max = new Date(maxDate.getTime() - (maxDate.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
            }
            dateMin.setAttribute("min", min);
            dateMin.setAttribute("max", max);
            dateMax.setAttribute("min", min);
            dateMax.setAttribute("max", max);
            dateMin.value = min;
            dateMax.value = max;

            // Display necessary elements
            loadStatus.style.display = "none";
            document.getElementById("commentsCol").style.display = "block";
            document.getElementById("sortLoaded").style.display = "block";
            document.getElementById("filter").style.display = "block";
            document.getElementById("statsColumn").style.display = statsAvailable ? "block" : "none";
            document.title = "YouTube Comment Viewer";
        }
        if (reset) {
            hideLoading();
            commentsSection.textContent = "";
            if (subCount === totalCount) {
                document.getElementById("resultCol").style.display = "none";
            }
            else {
                document.getElementById("resultCol").style.display = "block";
                document.getElementById("subCount").textContent = Number(subCount).toLocaleString();
                document.getElementById("totalCount").textContent = Number(totalCount).toLocaleString();
            }
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
        linkedHolder.textContent = "";
        commentsSection.textContent = "";
        document.getElementById("limitMessage").textContent = "";
        document.getElementById("loadPercentage").textContent = "0%";
        document.getElementById("loadEta").textContent = '';
        document.getElementById("progressGreen").style.width = "0%";

        document.getElementById("chooseLoad").style.display = "none";
        document.getElementById("sortLoaded").style.display = "none";
        document.getElementById("statsColumn").style.display = "none";
        document.getElementById("showMoreDiv").style.display = "none";

        document.getElementById("b_likesMost").disabled = false;
        document.getElementById("b_dateNewest").disabled = false;
        document.getElementById("b_dateOldest").disabled = true;
        document.getElementById("statsContainer").style.display = "none";
        document.getElementById("graphSpace").textContent = "";

        video.reset();
    }

    socket.on("quotaExceeded", () => {
        if (video._videoId) {
            displayNote("Quota exceeded. Please try again later");
        }
        else {
            message.textContent = "Quota exceeded. Please try again later";
            message.style.color = ERR;
        }
    });

    function sendCommentRequest(getNewSet) {
        if (getNewSet) {
            showLoading();
        }
        // Only reset video.commentNum when the comments are received, to ensure it's always in sync
        const index = getNewSet ? 0 : video.commentNum;
        socket.emit("showMore", {
            sort: video.currentSort, commentNum: index,
            minDate: dateLeftBound, maxDate: dateRightBound, searchTerms: searchTerms
        });
    }

    function showLoading() {
        commentsSection.classList.add("reloading");
        document.getElementById("spinnerContainer").style.display = "flex";
    }

    function hideLoading() {
        commentsSection.classList.remove("reloading");
        document.getElementById("spinnerContainer").style.display = "none";
    }

    function displayNote(note) {
        document.getElementById("noteColumn").style.display = "block";
        document.getElementById("limitMessage").textContent = note;
    }
});