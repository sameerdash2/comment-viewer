import uPlot from 'uplot';
import { shiftDate, floorDate } from './util.js';
import { tooltipPlugin, calcAxisSpace } from './graphUtils.js';

const GRIDCOLOR = "rgba(0,0,0,0.1)";
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
        this._datasets = {
            "hour": undefined,
            "day": undefined,
            "month": undefined,
            "year": undefined
        };
    }

    intervalChange() {
        const newInterval = document.getElementById("intervalSelect").value;
        if (newInterval !== this._graphInstance.cvInterval) {
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
            this._graphInstance.cvInterval = newInterval;
            this._graphInstance.setData(this._datasets[newInterval], false);
            this._graphInstance.setScale("x", { min: leftBound, max: rightBound });

            gtag('event', 'interval_change', {
                'event_category': 'stats',
                'event_label': newInterval
            });
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
            gtag('event', 'stats', { 'event_category': 'data_request' });
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
        let interval = "hour";
        if (graphDomainLength > 2 * DAY) interval = "day";
        if (graphDomainLength > 3 * YEAR) interval = "month";

        document.getElementById("intervalSelect").value = interval;

        this.buildDataArray(interval);

        this.drawGraph(interval);
        this._graphInstance.cvInterval = interval;

        document.getElementById("statsContainer").style.display = "block";
        this._graphDisplayState = 2;
        clearInterval(this._loadingInterval);
        document.getElementById("viewGraph").disabled = false;
        document.getElementById("viewGraph").textContent = "\u25B2 Statistics";
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
            plugins: [
                tooltipPlugin(isUtc)
            ],
            scales: {
                'y': {
                    // Force min to be 0 & let uPlot compute max normally
                    range: (_self, _min, max) => uPlot.rangeNum(0, max, 0.1, true)
                }
            },
            axes: [
                {
                    ...axis,
                    space: (self, _axisIdx, scaleMin, scaleMax, plotDim) => calcAxisSpace(self.cvInterval, scaleMin, scaleMax, plotDim),
                },
                {
                    ...axis,
                    size: 60,
                    // Only allow whole numbers on y axis
                    space: (_self, _axisIdx, _scaleMin, scaleMax, plotDim) => Math.max(plotDim / scaleMax, 30)
                }
            ],
            series: [
                {},
                {
                    // y series
                    stroke: "blue",
                    width: 2,
                    points: { show: false }
                },
            ],
            legend: { show: false },
            cursor: {
                y: false,
                drag: { dist: 5 }
            },
        };

        this._graphInstance = new uPlot(opts, this._datasets[interval], document.getElementById("graphSpace"));
    }

    requestResize() {
        if (this._graphInstance) {
            this._graphInstance.setSize(this.getGraphSize());
        }
    }
}
