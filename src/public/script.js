$(document).ready(function() {
    const socket = io("", {
        query: "timezone=" + (-new Date().getTimezoneOffset())
    });
    //const socket = io();
    const ERR = "#A00";
    const DEF = "#000";
    const LOAD = "#666";
    const MAXDISPLAY = 100;
    const MAX = 100000;
    let ctx = document.getElementById('graph');
    Chart.defaults.global.defaultFontColor = '#222222';
    Chart.defaults.global.defaultFontSize = 14;
    let timeChart;
    let gridLines = {
        color: 'rgba(0, 0, 0, 0.2)',
        drawTicks: false
    }
    let graphShown = false;
    let testGraph = true;
    let startText, endText;
    let graphPoints = [];

    let submitBtn = $("#submit");
    let message = $("#message");
    let commentsSection = $("#commentsSection");
    let loadStatus = $("#loadStatus");
    let viewGraph = document.getElementById("viewGraph");
    let startDate = document.getElementById("startDate");
    let endDate = document.getElementById("endDate");

    let storedReplies = {};

    submitBtn.prop('disabled', false);
    submitBtn.html("Submit");
    $("#showMoreBtn").html(`Show ${MAXDISPLAY} more comments...`);

    $('#videoForm').submit(function(event){
        event.preventDefault(); // prevents page reloading
        message.html("Working...");
        message.css('color', LOAD);
        socket.emit('idSent', $('#enterID').val());
        if (testGraph) {
            $("#chartContainer").hide();
            testGraph = false;
        }
        $('#enterID').val('');
        return false;
    });
    $("#submitAll").click(function() {                    
        $("#chooseLoad").hide();
        $("#eta").empty();
        $("#submit").prop("disabled", true);
        message.html("Commencing...");                    
        loadStatus.html("Initializing...");
        
        socket.emit("requestAll");
    });
    $("#showMoreBtn").click(function() {
        $(this).prop("disabled", true);
        socket.emit("showMore");
    });
    $(".sendSort").click(function (event) {
        $(".sendSort").prop("disabled", false);
        $(event.currentTarget).prop("disabled", true);
        socket.emit("sortRequest", event.currentTarget.id.substring(2));
    });
    viewGraph.addEventListener('click', function() {
        if (graphShown) {
            $("#chartContainer").hide();
            graphShown = false;
        }
        else if (graphPoints.length > 0) {
            $("#chartContainer").show();
            graphShown = true;
        }
        else {
            viewGraph.disabled = true;
            socket.emit("graphRequest");
        }

    });

    $(".enterBounds").keypress(function (event) {
        if (event.keyCode == 13) {
            updateGraphBounds();
        }
    });
    $("#resetBounds").click(function () {
        $("#startDate").val(startText);
        $("#endDate").val(endText);
        updateGraphBounds();
    });

    function updateGraphBounds() {
        let newStart = new Date(startDate.value);
        let newEnd = new Date(endDate.value);
        if (!isNaN(newStart)) timeChart.options.scales.xAxes[0].ticks.min = newStart.toISOString().substring(0, 10);
        if (!isNaN(newEnd)) timeChart.options.scales.xAxes[0].ticks.max = newEnd.toISOString().substring(0, 10);
        
        timeChart.options.scales.yAxes[0].ticks.max = calcGraphMax();
        
        timeChart.update();
    }

    function calcGraphMax(start = timeChart.options.scales.xAxes[0].ticks.min, end = timeChart.options.scales.xAxes[0].ticks.max) {
        let m = 1;
        let len = graphPoints.length;
        for (let i = 0; i < len; i++) {
            if (graphPoints[i].x >= start && graphPoints[i].x <= end) {
                m = Math.max(m, graphPoints[i].y);
            }
        }
        return Math.ceil(m * 1.1);
    }
    
    commentsSection.on("click", ".showHideButton", repliesButton);
    $("#linkedHolder").on("click", ".showHideButton", repliesButton);
    function repliesButton(event) {
        let commentId = event.currentTarget.id.substring(11);
        if (storedReplies[commentId]) {
            if (storedReplies[commentId][0] == true) {
                $("#repliesEE-" + commentId).hide();
                $("#replyhint-" + commentId).html("Show " + storedReplies[commentId][1] + " replies");
                storedReplies[commentId][0] = false;
            }
            else {
                $("#repliesEE-" + commentId).show();
                $("#replyhint-" + commentId).html("Hide " + storedReplies[commentId][1] + " replies");
                storedReplies[commentId][0] = true;
            }
        }
        else {
            $("#" + event.currentTarget.id).prop("disabled", true);
            socket.emit("replyRequest", commentId);
        }
    }
    socket.on("idInvalid", function() {
        message.html("Invalid video link or ID.");
        message.css('color', ERR);
    });
    socket.on("videoInfo", ({ content, reset }) => {
        if (reset) { resetPage(); }
        message.html("&nbsp;");
        $("#info").html(content);
    });
    socket.on("commentInfo", ({num, disabled, eta, commence}) => {
        $("#chooseLoad").toggle(!disabled && !commence && num < MAX);     
        viewGraph.style.display = num >= 50 ? "block" : "none";
        if (disabled) {
            $("#commentInfo").html(`<i class="fas fa-comment"></i> Comments have been disabled on this video.`);
            if (num > 0) {
                $("#commentInfo").append(` <span class="it">(` + Number(num).toLocaleString() + ` hidden comments)</span>`);
            }
        }
        else {
            $("#commentInfo").html(`<i class="fas fa-comment"></i> ` + Number(num).toLocaleString() + ` comments`);
            $("#eta").html(eta);
            if (num >= MAX) loadStatus.html("Only videos with under " + MAX + " comments are supported.");
        }
    });

    socket.on("loadStatus", (text) => {
        loadStatus.html(text);
    });

    socket.on("renderedComments", ({reset, html, showMore}) => {      
        message.html("&nbsp;");
        if (reset) {
            $("#submit").prop("disabled", false);
            commentsSection.empty();
            loadStatus.empty();
            storedReplies = {};
            $("#sortLoaded").show();
        }
        commentsSection.append(html);
        $("#showMoreDiv").toggle(showMore);
        $("#showMoreBtn").prop("disabled", false);
    });
    socket.on("renderedReplies", ({ content, id, num }) => {
        storedReplies[id] = [true, num];
        // show repliesExpand
        $("#repliesEE-" + id).show();
        // update repliesEXpand
        $("#repliesEE-" + id).html(content);
        // update hint
        $("#replyhint-" + id).html("Hide " + num + " replies");
        // reenable getReplies- button
        $("#getReplies-" + id).prop("disabled", false);
    });
    socket.on("renderedLinked", (html) => {
        $("#linkedHolder").html(html);
        //$("#chooseLoad").show();
        message.html("&nbsp;");
    });                
    socket.on("renderedLinkedReply", ({ html, commentId }) => {
        $("#repliesEE-" + commentId.substring(0, commentId.indexOf("."))).html(html);
    });

    socket.on("graphData", function({data, published}) {
        if (graphShown) {
            timeChart.destroy();
        }
        graphPoints = data;
        $("#chartContainer").show();

        // Declare left bound as video publish date, unless there's a comment before publish
        let start = new Date(Math.min(new Date(published), new Date(data[0].x)));
        //start.setDate(start.getDate() - 1);
        let end = new Date();
        startText = start.toISOString().substring(0, 10);
        endText = end.toISOString().substring(0, 10);
        $("#startDate").val(startText);
        $("#endDate").val(endText);

        let yMax = calcGraphMax(startText, endText);

        timeChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Red', 'Blue'],
                datasets: [{
                    label: 'Comments',
                    data: graphPoints,
                    backgroundColor: 'rgba(0,0,100,1)',
                    fill: false,
                    // pointRadius: 10,
                    pointHitRadius: 30,
                    pointHoverRadius: 10,
                    pointBackgroundColor: 'rgba(0,0,0,0)',
                    pointBorderColor: 'rgba(0,0,0,0)',
                    pointBorderWidth: 0,
                    lineTension: 0.0,
                    borderWidth: 3,
                    borderColor: 'rgb(0,0,0)'
                }]
            },
            options: {
                maintainAspectRatio: false,
                responsive:false,
                // hover: { animationDuration: 0 },
                layout: { padding: {right: 25} },
                scales: {
                    xAxes: [{
                        type: 'time',
                        gridLines: gridLines,
                        offset: false,
                        time: {
                            tooltipFormat: 'YYYY-MM-DD',
                            parser: 'YYYY-MM-DD',
                            // unit: 'day',
                            minUnit: 'day',
                            // stepSize: 1,
                            displayFormats: {
                                month: 'MMM YYYY',
                                day: 'M/D/YYYY'
                            }
                        },
                        ticks: {
                            sampleSize: 1,
                            // autoSkip: false,
                            // autoSkipPadding: 11,
                            padding: 10,
                            maxRotation: 0,
                            min: startText,
                            max: endText
                        }
                    }],
                    yAxes: [{
                        gridLines: gridLines,
                        ticks: {
                            max: yMax,
                            padding: 5,
                            beginAtZero: true
                        }
                    }]
                }
            }
        });
        graphShown = true;
        viewGraph.disabled = false;
        
    });

    socket.on("resetPage", resetPage);
    function resetPage() {
        $("#linkedHolder").empty();
        commentsSection.empty();
        loadStatus.empty();
        $("#chooseLoad").hide();
        $("#sortLoaded").hide();
        $("#moreDiv").hide();
        $("#showMoreDiv").hide();
        
        $("#b_likesMost").prop("disabled", false);
        $("#b_dateNewest").prop("disabled", false);
        $("#b_dateOldest").prop("disabled", true);
        viewGraph.disabled = false;
        viewGraph.style.display = "none"; //safety

        startText = "";
        endText = "";

        if (graphPoints.length > 0) {
            timeChart.destroy();
            graphShown = false;
            $("#chartContainer").hide();
            graphPoints = [];
        }
        
        storedReplies = {};
    }
    socket.on("quotaExceeded", () => {                    
        message.html("Quota exceeded. Please try again later");
        message.css('color', ERR);
    });
});