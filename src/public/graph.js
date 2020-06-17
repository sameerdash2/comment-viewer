const GRIDCOLOR = "rgba(0,0,0,0.1)";

export class Graph {
    constructor(socket) {
        this._socket = socket;
        this._graphDisplayState = 0; //0=none, 1=loaded, 2=shown
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

    constructGraph(dates, videoPublished) {
        // Object to keep count 
        let dictionary = {}, len = dates.length;
        let startDate = new Date(Math.min( new Date(videoPublished), new Date(dates[len - 1]) ));
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
            if (options.timezone == "utc") {
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            }
            else {
                currentDate.setDate(currentDate.getDate() + 1);
            }
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

        this.drawGraph(data);
        document.getElementById("graphContainer").style.display = "block";
        this._graphDisplayState = 2;
        document.getElementById("viewGraph").disabled = false;
        document.getElementById("viewGraph").innerHTML = "Toggle graph";
    }

    drawGraph(data) {
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
            width: Math.max(250, Math.min(996, document.documentElement.clientWidth - 64)),
            height: 400,
            tzDate: (ts) => options.timezone == "utc"
                ? uPlot.tzDate(new Date(ts * 1000), "Etc/UTC") : new Date(ts * 1000),
            scales: {
                'y': { range: (self, min, max) => [0, Math.max(5, Math.ceil(max * 1.02))] }
            },
            axes: [
                {
                    ...axis,
                    // custom values to hide hours/mins when zooming in
                    values: [
                        [3600 * 24 * 365,    "{YYYY}",  7, "",         1],
                        [3600 * 24 * 28,     "{MMM}",   7, "\n{YYYY}", 1],
                        [3600 * 24,          "{M}/{D}", 7, "\n{YYYY}", 1],
                        [3600,               "",        4, "{M}/{D}",  1],
                        [60,                 "",        4, "{M}/{D}",  1],
                        [1,                  "",        4, "{M}/{D}",  1],
                        [0.001,              "",        4, "{M}/{D}",  1],
                    ],
                },
                {
                    ...axis,
                    size: 60
                }
            ],
            series: [
                {
                    // x series
                    label: "Date",
                    value: (self, rawValue) => {
                        return options.timezone == "utc"
                            ? new Date(rawValue*1000).toISOString().substring(0, 10) : new Date(rawValue*1000).toLocaleDateString()
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
                drag: { dist: 5 }
            },
        };

        this._graphInstance = new uPlot(opts, data, document.getElementById("graphSpace"));
        setTimeout(() => document.getElementById("graphContainer").style.width = document.querySelector(".uplot").offsetWidth + "px", 0);
    }
}