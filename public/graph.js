import uPlot from 'uplot';
import { shiftDate, floorDate } from './util.js';

const GRIDCOLOR = "rgba(0,0,0,0.1)";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const HOUR = 60 * 60 * 1000, DAY = 24 * HOUR, MONTH = 30 * DAY, YEAR = 365 * DAY;

export class Graph {
    constructor(video, socket) {
        this._video = video;
        this._socket = socket;
        this.reset();

        document.getElementById("viewGraph").addEventListener('click', () => this.handleGraphButton());
        document.getElementById("intervalSelect").onchange = () => this.intervalChange();
    }
    reset() {
        this._graphDisplayState = 0; //0=none, 1=loaded, 2=shown
        this._graphInstance = undefined;
        this._loadingDots = 3;
        this._loadingInterval = undefined;
        this._rawDates = [];
        this._leftBound = undefined;
        this._interval = undefined;
        this._datasets = {
            "hour": undefined,
            "day": undefined,
            "month": undefined,
            "year": undefined
        };
        this._throttled = false;
    }

    intervalChange() {
        const newInterval = document.getElementById("intervalSelect").value;
        if (newInterval !== this._interval) {
            // Build the graph data array if needed
            if (!this._datasets[newInterval]) {
                this.buildDataArray(newInterval);
            }

            const currentTimestamps = this._graphInstance.data[0];
            const isZoomed = this._graphInstance.scales.x.min > currentTimestamps[0]
                || this._graphInstance.scales.x.max < currentTimestamps[currentTimestamps.length - 1];

            const newIntervalTimestamps = this._datasets[newInterval][0];
            const newLen = newIntervalTimestamps.length;
            let leftBound = newIntervalTimestamps[0];
            let rightBound = newIntervalTimestamps[newLen - 1];

            if (isZoomed) {
                // Save the current scale's min & max (only if they're within the new x range)
                leftBound = Math.max(this._graphInstance.scales.x.min, leftBound);
                rightBound = Math.min(this._graphInstance.scales.x.max, rightBound);
            }

            // Commence interval change
            this._interval = newInterval;
            this._graphInstance.setData(this._datasets[newInterval], false);
            this._graphInstance.setScale("x", { min: leftBound, max: rightBound });
        }
    }

    getGraphSize = () => {
        // Fill container width
        const statsColumn = document.getElementById("statsColumn");
        const computedStyle = window.getComputedStyle(statsColumn);
        const containerWidth = statsColumn.clientWidth - parseFloat(computedStyle.paddingLeft) - parseFloat(computedStyle.paddingRight);
        return {
            width: Math.max(250, containerWidth - 16),
            height: Math.max(150, Math.min(400, document.documentElement.clientHeight - 75))
        };
    }

    handleGraphButton() {
        if (this._graphDisplayState == 2) {
            document.getElementById("statsContainer").style.display = "none";
            document.getElementById("viewGraph").textContent = "\u25BC Statistics";
            this._graphDisplayState = 1;
        }
        else if (this._graphDisplayState == 1) {
            document.getElementById("statsContainer").style.display = "block";
            document.getElementById("viewGraph").textContent = "\u25B2 Statistics";
            this._graphDisplayState = 2;
        }
        else {
            document.getElementById("viewGraph").disabled = true;
            document.getElementById("viewGraph").textContent = "Loading...";
            this._loadingInterval = setInterval(() => {
                this._loadingDots = ++this._loadingDots % 4;
                document.getElementById("viewGraph").textContent = "Loading" + '.'.repeat(this._loadingDots);
            }, 200);
            this._socket.emit("graphRequest");
        }
    }

    buildDataArray(interval) {
        const dateMap = {};
        const isUtc = this._video.options.timezone === "utc";

        const startDate = floorDate(new Date(this._leftBound), interval, isUtc);
        const endDate = floorDate(new Date(), interval, isUtc);

        const currentDate = startDate;
        // One key for each unit
        while (currentDate <= endDate) {
            dateMap[new Date(currentDate).getTime()] = 0;
            shiftDate(currentDate, interval, 1, isUtc);
        }

        // Populate date counts from comments
        for (let i = 0; i < this._rawDates.length; i++) {
            dateMap[floorDate(new Date(this._rawDates[i]), interval, isUtc).getTime()]++;
        }

        // Build dataset for graph
        const data = [[], []];
        for (const key in dateMap) {
            data[0].push(Math.floor(key / 1000));
            data[1].push(dateMap[key]);
        }
        this._datasets[interval] = data;
    }

    constructGraph(dates) {
        this._rawDates = dates;

        // Begin from video publish date, or the first comment if its date precedes the video's
        this._leftBound = Math.min(new Date(this._video.videoPublished), new Date(this._rawDates[this._rawDates.length - 1]));
        const graphDomainLength = new Date().getTime() - new Date(this._leftBound).getTime();

        // Make available only the intervals that result in the graph having more than 1 point
        document.getElementById("optHour").disabled = graphDomainLength < 1 * HOUR;
        document.getElementById("optDay").disabled = graphDomainLength < 1 * DAY;
        document.getElementById("optMonth").disabled = graphDomainLength < 1 * MONTH;
        document.getElementById("optYear").disabled = graphDomainLength < 1 * YEAR;

        // Pick an interval based on the graph domain length
        this._interval = "hour";
        if (graphDomainLength > 2 * DAY) this._interval = "day";
        if (graphDomainLength > 3 * YEAR) this._interval = "month";

        document.getElementById("intervalSelect").value = this._interval;

        this.buildDataArray(this._interval);

        this.drawGraph(this._interval);

        document.getElementById("statsContainer").style.display = "block";
        this._graphDisplayState = 2;
        clearInterval(this._loadingInterval);
        document.getElementById("viewGraph").disabled = false;
        document.getElementById("viewGraph").textContent = "\u25B2 Statistics";
    }

    makeLabel(rawValue, isUtc) {
        let output = "";
        const date = new Date(rawValue * 1000);
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

    calcAxisSpace(scaleMin, scaleMax, plotDim) {
        const rangeSecs = scaleMax - scaleMin;
        let space = 50;
        switch (this._interval) {
            case "year": {
                // ensure minimum x-axis gap is 360 days' worth of pixels
                const rangeDays = rangeSecs / 86400;
                const pxPerDay = plotDim / rangeDays;
                space = pxPerDay * 360;
                break;
            }
            case "month": {
                // 28 days
                const rangeDays = rangeSecs / 86400;
                const pxPerDay = plotDim / rangeDays;
                space = pxPerDay * 28;
                break;
            }
            case "day": {
                // 23 hours
                const rangeHours = rangeSecs / 3600;
                const pxPerHour = plotDim / rangeHours;
                space = pxPerHour * 23;
                break;
            }
            case "hour": {
                // 59 minutes
                const rangeMins = rangeSecs / 60;
                const pxPerMin = plotDim / rangeMins;
                space = pxPerMin * 59;
                break;
            }
        }
        // Use a minimum gap of 50 pixels
        return Math.max(50, space);
    }

    drawGraph(interval) {
        if (this._graphInstance) this._graphInstance.destroy();

        const isUtc = this._video.options.timezone === "utc";
        const axis = {
            font: "14px Open Sans",
            grid: { stroke: GRIDCOLOR },
            ticks: {
                show: true,
                size: 5,
                stroke: GRIDCOLOR
            },
        }

        const opts = {
            ...this.getGraphSize(),
            tzDate: (ts) => isUtc ? uPlot.tzDate(new Date(ts * 1000), "Etc/UTC") : new Date(ts * 1000),
            scales: {
                'y': {
                    // Force min to be 0 & let uPlot compute max normally
                    range: (_self, _min, max) => uPlot.rangeNum(0, max, 0.1, true)
                }
            },
            axes: [
                {
                    ...axis,
                    space: (_self, _axisIdx, scaleMin, scaleMax, plotDim) => this.calcAxisSpace(scaleMin, scaleMax, plotDim),
                },
                {
                    ...axis,
                    size: 60,
                    // Only allow whole numbers on y axis
                    space: (_self, _axisIdx, _scaleMin, scaleMax, plotDim) => Math.max(plotDim / scaleMax, 30)
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
                    points: { show: false }
                },
            ],
            cursor: {
                y: false,
                drag: { dist: 5 }
            },
        };

        this._graphInstance = new uPlot(opts, this._datasets[interval], document.getElementById("graphSpace"));
    }

    requestResize() {
        // Throttle resize events at every 100 ms
        if (this._graphInstance) {
            // Debounce if throttled
            if (this._throttled) {
                setTimeout(() => this.requestResize(), 100);
            }
            else {
                this._throttled = true;
                this.resize();
                setTimeout(() => this._throttled = false, 100);
            }
        }
    }

    resize = () => {
        this._graphInstance.setSize(this.getGraphSize());
    }
}