import { Video } from "./video.js";
import { shiftDate, timeToNextPacificMidnight } from './util.js';

const ERR = "#A00";
const LOAD = "#666";

document.addEventListener("DOMContentLoaded", () => {
    // eslint-disable-next-line no-undef
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
    const reloadAlert = document.getElementById("reloadAlert");
    const dateMin = document.getElementById("dateMin");
    const dateMax = document.getElementById("dateMax");

    let dateLeftBound = -1;
    let dateRightBound = -1;

    let pageSize = document.getElementById("pageSizeSelect").value;

    let firstBatchReceived = false;
    let statsAvailable = false;

    // Terms of service button
    document.getElementById("viewTerms").addEventListener('click', (event) => {
        event.preventDefault();
        terms.style.display = "block";
        gtag('event', 'view_terms');
    });
    document.getElementById("closeTerms").addEventListener('click', () => terms.style.display = "none");
    window.addEventListener('click', (event) => {
        if (event.target === terms) {
            terms.style.display = "none";
        }
    });

    // Dark mode toggle
    document.getElementById("toggleDark").addEventListener('click', (event) => {
        event.preventDefault();
        const root = document.documentElement;
        const darkIsOn = root.classList.contains("dark-mode");
        if (darkIsOn) {
            root.classList.remove("dark-mode");
        }
        else {
            root.classList.add("dark-mode");
        }

        try {
            localStorage.setItem("dark", darkIsOn ? "false" : "true");
        } catch { }

        // Send a resize signal to video instance, to make it redraw the graph (if shown)
        video.handleWindowResize();
        // Focus input box if visible
        event.target.blur();
        document.getElementById("enterID").focus();

        gtag('event', 'dark_mode');
    });

    window.addEventListener('resize', () => video.handleWindowResize());

    // Listener for entering a video ID via text box.
    document.getElementById("videoForm").addEventListener('submit', (event) => {
        event.preventDefault(); // prevents page reloading
        const enterID = document.getElementById("enterID");
        if (enterID.value.length > 0) {
            submitVideo(enterID.value);
            enterID.value = "";
        }
        return false;
    });

    // Also check if an ID was supplied via URL parameter "v".
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('v') !== null) {
        submitVideo(urlParams.get('v'));
    }

    function submitVideo(input) {
        message.textContent = "Working...";
        message.style.color = LOAD;
        socket.emit('idSent', input.trim());
    }

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
            gtag('event', 'sort', {
                'event_category': 'filters',
                'event_label': video.currentSort
            });
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
            gtag('event', 'date', { 'event_category': 'filters' });
        }
    });

    // On change in page size, request new set of comments with new page size.
    document.getElementById("pageSizeSelect").addEventListener("change", () => {
        pageSize = document.getElementById("pageSizeSelect").value;
        sendCommentRequest(true);
        gtag('event', 'page_size', { 'value': pageSize.toString() });
    });

    document.getElementById("resetFilters").addEventListener('click', () => {
        // Reset date filter
        dateLeftBound = -1;
        dateRightBound = -1;
        dateMin.value = dateMin.getAttribute('min');
        dateMax.value = dateMax.getAttribute('max');

        sendCommentRequest(true);
        gtag('event', 'reset', { 'event_category': 'filters' });
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
            gtag('event', 'video', { 'event_category': 'data_request' });
        }
    }

    socket.on("commentsInfo", ({ num, disabled, max, largeAfterThreshold, graph, error }) => {
        const allowLoadingComments = !disabled && max < 0 && largeAfterThreshold < 0 && !error;
        document.getElementById("chooseLoad").style.display = allowLoadingComments ? "block" : "none";

        num = Number(num) || 0;
        statsAvailable = graph;
        let newCommentInfo = `<span class="icon-comment"></span>&nbsp;`;
        if (disabled) {
            newCommentInfo += `<span class="gray">Comments are disabled.</span>`;
            if (num > 0) {
                newCommentInfo += ` <span class="red">(${num.toLocaleString()} hidden comments)</span>`;
                gtag('event', 'hidden_comments', {
                    'event_category': 'data_request',
                    'value': num
                });
            }
        }
        else {
            newCommentInfo += `${num.toLocaleString()} comments`;

            if (error === true) {
                displayNote(`The YouTube API returned an unknown error when trying to access this video's comments.`);
            }

            if (max > 0) {
                displayNote(`Videos with over ${max.toLocaleString()} comments are not currently supported.
                    (This may change in the future)`);
                gtag('event', 'max_comments', {
                    'event_category': 'data_request',
                    'value': num
                });
            }
            else if (largeAfterThreshold > 0) {
                displayNote(`Videos with over ${largeAfterThreshold.toLocaleString()} comments are disabled for the rest
                    of the day. For more details
                    <a href="https://github.com/sameerdash2/comment-viewer/pull/17">see here</a>.`);
                gtag('event', 'large_after_threshold', {
                    'event_category': 'data_request',
                    'value': largeAfterThreshold
                });
            }
        }

        document.getElementById("commentInfo").innerHTML = newCommentInfo;
    });

    socket.on("loadStatus", (totalCount) => {
        if (totalCount === -2) {
            displayNote(`This video's comments were stored by Comment Viewer,
                but they are currently being deleted in order to keep the data up to date.
                Please try again in a minute.`);
        } else {
            video.updateLoadStatus(totalCount);
        }
    });

    socket.on("groupComments", ({ reset, items, showMore, subCount, totalCount, fullStatsData }) => {
        message.textContent = "\u00A0";
        if (!firstBatchReceived) {
            firstBatchReceived = true;
            loadStatus.style.display = "none";
            if (items.length < 1) {
                displayNote("This video does not have any comments.");
                return;
            }

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
            document.getElementById("commentsCol").style.display = "block";
            document.getElementById("sortLoaded").style.display = "block";
            document.getElementById("filter").style.display = "block";
            document.getElementById("statsColumn").style.display = statsAvailable ? "block" : "none";
            document.title = "YouTube Comment Viewer";

            // If statistics data was sent, display graph and statistics.
            if (fullStatsData != null) {
                video.handleStatsData(fullStatsData);
            }
        }
        if (reset) {
            hideLoading();
            commentsSection.textContent = "";
            document.getElementById("subCount").textContent = Number(subCount).toLocaleString();
            document.getElementById("totalCount").textContent = Number(totalCount).toLocaleString();
            if (subCount === totalCount) {
                document.getElementById("resetGroup").style.display = "none";
            }
            else {
                document.getElementById("resetGroup").style.display = "inline-block";
            }
        }
        video.handleGroupComments(reset, items);
        document.getElementById("showMoreDiv").style.display = showMore ? "block" : "none";
        showMoreBtn.textContent = "Show more comments...";
        showMoreBtn.disabled = false;
    });

    socket.on("newReplies", ({ items, id }) => video.handleNewReplies(id, items));

    socket.on("statsData", (data) => video.handleStatsData(data));

    socket.on("linkedComment", ({ parent, hasReply, reply, videoObject }) => {
        displayVideo(videoObject);
        video.handleLinkedComment(parent, hasReply ? reply : null);

        const action = hasReply ? 'linked_reply' : 'linked_comment';
        gtag('event', action, { 'event_category': 'data_request' });
    });

    socket.on("resetPage", resetPage);
    function resetPage() {
        linkedHolder.textContent = "";
        commentsSection.textContent = "";
        document.getElementById("limitMessage").textContent = "";
        document.getElementById("loadPercentage").textContent = "0%";
        document.getElementById("loadEta").textContent = '';
        document.getElementById("loadCount").textContent = '--';
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
        const {hourDiff, minDiff} = timeToNextPacificMidnight();
        const concession = `Quota exceeded. Please try again after midnight Pacific Time (in ${hourDiff} hr ${minDiff} min)`;
        if (video._videoId) {
            displayNote(concession);
        }
        else {
            message.textContent = concession;
            message.style.color = ERR;
        }
    });

    socket.on("disconnect", () => reloadAlert.style.display = "block");

    document.getElementById("closeAlert").addEventListener('click', () => reloadAlert.style.display = "none");

    function sendCommentRequest(getNewSet) {
        if (getNewSet) {
            showLoading();
        }
        // Only reset video.commentNum when the comments are received, to ensure it's always in sync
        const index = getNewSet ? 0 : video.commentNum;
        socket.emit("showMore", {
            sort: video.currentSort,
            commentNum: index,
            pageSize: pageSize,
            minDate: dateLeftBound,
            maxDate: dateRightBound
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
        document.getElementById("limitMessage").innerHTML = note;
    }
});