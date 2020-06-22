import { incrementDate, floorDate } from './util.js';

const GRIDCOLOR = "rgba(0,0,0,0.1)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOUR = 60*60*1000, DAY = 24 * HOUR, MONTH = 30 * DAY, YEAR = 365 * DAY;

export class Graph {
    constructor(video, socket) {
        this._video = video;
        this._socket = socket;
        this.reset();

        document.getElementById("viewGraph").addEventListener('click', () => this.handleGraphButton());
        document.getElementById("intervalSelect").onchange = () => this.intervalChange();

        this._socket.on("graphData", (dates) => this.constructGraph(dates));
    }
    reset() {
        this._graphDisplayState = 0; //0=none, 1=loaded, 2=shown
        this._graphInstance = undefined;
        this._rawDates = [];
        this._leftBound = undefined;
        this._interval = undefined;
        this._datasets = {
            "hour": undefined,
            "day": undefined,
            "month": undefined,
            "year": undefined
        };
    }

    intervalChange() {
        let interval = document.getElementById("intervalSelect").value;
        if (interval != this._interval) {
            this._interval = interval;
            if (!this._datasets[this._interval]) {
                this.buildDataArray(this._interval);
            }
            this._graphInstance.setData(this._datasets[this._interval]);
        }
    }

    getGraphSize = () => {
        return {
            width: Math.max(250, Math.min(996, document.documentElement.clientWidth - 48 - 4)),
            height: 400
        };
    }

    handleGraphButton() {
        if (this._graphDisplayState == 2) {
            document.getElementById("graphContainer").style.display = "none";
            this._graphDisplayState = 1;
        }
        else if (this._graphDisplayState == 1) {
            document.getElementById("graphContainer").style.display = "block";
            this._graphDisplayState = 2;
        }
        else {
            document.getElementById("viewGraph").disabled = true;
            document.getElementById("viewGraph").innerHTML = "Loading...";
            this._socket.emit("graphRequest");
        }
    }

    buildDataArray(interval) {
        let dateMap = {};
        let isUtc = this._video.options.timezone == "utc";
        
        let startDate = floorDate(new Date(this._leftBound), interval, isUtc);
        let endDate = floorDate(new Date(), interval, isUtc);

        let currentDate = startDate;
        // One key for each unit
        while (currentDate <= endDate) {
            dateMap[new Date(currentDate).getTime()] = 0;
            incrementDate(currentDate, interval, isUtc);
        }

        // Populate date counts from comments
        for (let i = 0; i < this._rawDates.length; i++) {
            dateMap[floorDate(new Date(this._rawDates[i]), interval, isUtc).getTime()]++;
        }

        // Build dataset for graph
        let data = [[], []];
        for (let key in dateMap) {
            data[0].push(Math.floor(key / 1000));
            data[1].push(dateMap[key]);
        }
        this._datasets[interval] = data;
    }

    constructGraph(dates) {
        this._rawDates = dates;

        // Begin from video publish date, or the first comment if its date precedes the video's
        this._leftBound = Math.min( new Date(this._video.videoPublished), new Date(this._rawDates[this._rawDates.length - 1]) );
        let graphDomainLength = new Date().getTime() - new Date(this._leftBound).getTime();

        // Graph's x-axis breaks if there's only one point (may be a side effect of distr: 2).
        // Make available only the intervals that result in the graph having more than 1 point
        document.getElementById("optHour").disabled = graphDomainLength < 1 * HOUR;
        document.getElementById("optDay").disabled = graphDomainLength < 1 * DAY;
        document.getElementById("optMonth").disabled = graphDomainLength < 1 * MONTH;
        document.getElementById("optYear").disabled = graphDomainLength < 1 * YEAR;

        // Pick an interval based on the graph domain length
        this._interval = "hour";
        if (graphDomainLength > 2 * DAY) this._interval = "day";
        if (graphDomainLength > 1 * YEAR) this._interval = "month";
        if (graphDomainLength > 10 * YEAR) this._interval = "year";

        document.getElementById("intervalSelect").value = this._interval;
        this.buildDataArray(this._interval);

        this.drawGraph(this._interval);
        document.getElementById("graphContainer").style.display = "block";
        this._graphDisplayState = 2;
        document.getElementById("viewGraph").disabled = false;
        document.getElementById("viewGraph").innerHTML = "Toggle graph";
    }

    makeLabel(rawValue, isUtc) {
        let output = "";
        let date = new Date(rawValue*1000);
        switch (this._interval) {
            case "year":
                output = isUtc ? date.getUTCFullYear() : date.getFullYear();
                break;
            case "month":
                output = isUtc ? MONTHS[date.getUTCMonth()] + " " + date.getUTCFullYear()
                    : MONTHS[date.getMonth()] + " " + date.getFullYear();
                break;
            case "day":
                output = isUtc ? date.toISOString().substring(0, 10) : date.toLocaleDateString();
                break;
            case "hour":
                output = isUtc ? date.toISOString().replace("T", " ").substring(0, 16)
                    : date.toLocaleDateString(undefined, { hour: "numeric", hour12: true });
                break;
        }
        return output;
    }

    drawGraph(interval) {
        if (this._graphInstance) this._graphInstance.destroy();

        let isUtc = this._video.options.timezone == "utc";
        let axis = {
            font: "16px Open Sans",
            grid: { stroke: GRIDCOLOR, },
            ticks: {
                show: true,
                size: 5,
                stroke: GRIDCOLOR,
            },
        }

        let opts = {
            ...this.getGraphSize(),
            tzDate: (ts) => isUtc ? uPlot.tzDate(new Date(ts * 1000), "Etc/UTC") : new Date(ts * 1000),
            scales: {
                'x': { distr: 2 },
                'y': { range: (_self, _min, max) => [0, Math.max(5, Math.ceil(max * 1.02))] }
            },
            axes: [
                axis,
                {
                    ...axis,
                    size: 60
                }
            ],
            series: [
                {
                    // x series
                    label: "Date",
                    value: (_self, rawValue) => this.makeLabel(rawValue, isUtc),
                },
                {
                    // y series
                    label: "Comments",
                    value: (_self, rawValue) => rawValue.toLocaleString(),
                    stroke: "blue",
                    width: 2,
                    points: {
                        show: false,
                    }
                },
            ],
            cursor: {
                y: false,
                drag: { dist: 5 }
            },
        };

        this._graphInstance = new uPlot(opts, this._datasets[interval], document.getElementById("graphSpace"));
        this.resizeGraphContainer();
    }

    requestResize() {
        // Set timeout to resize only after a pause in window resize events, prevents CPU overload
        if (this._graphInstance) {
            if (this._resizeRequestTimeout) {
                clearTimeout(this._resizeRequestTimeout); 
            }
            this._resizeRequestTimeout = setTimeout(this.resize, 100);
        }
    }
    
    resize = () => {
        this._graphInstance.setSize(this.getGraphSize());
        this.resizeGraphContainer();
        if (this._resizeRequestTimeout) {
            clearTimeout(this._resizeRequestTimeout);
        }
        this._resizeRequestTimeout = undefined;
    }

    resizeGraphContainer = () => {
        document.getElementById("graphContainer").style.width = this.getGraphSize().width + "px";
    }
}